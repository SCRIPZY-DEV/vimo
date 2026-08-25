import { createHash } from 'node:crypto'
import { copyFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

import { isValidFile } from '../../project/paths.ts'
import type { AudioDownload } from '../../providers/tts/dubvoice.ts'
import type { TtsProvider } from '../../providers/tts/provider.ts'
import {
  TTS_PROVIDER_IDS,
  resolveTtsProvider,
} from '../../providers/tts/registry.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { GenerateVoicePayload } from '../../types/voices.ts'
import { readTextWithRetry, writeFileAtomic } from '../../utils/atomic-fs.ts'
import { requireFfmpegPath, runFfmpeg } from '../../utils/ffmpeg.ts'
import { prepareNarrationText } from '../../utils/narration-text.ts'
import type { CreateVideoContext } from '../context.ts'

// Síntesis de la narración maestra (port de generarVozMaestra): recorre los
// carriles que declara el motor elegido (TtsProvider), trocea si el motor lo
// soporta y emite progreso cada 1s hacia la UI.
const PROGRESS_TICK_MS = 1000

interface NarrationAttempt {
  name: string
  execute(): Promise<void>
}

export async function synthesizeNarration(
  context: CreateVideoContext,
  script: string,
): Promise<void> {
  const options = context.options
  const provider = resolveTtsProvider(options.voiceProvider)
  if (!provider || !options.voiceId)
    throw new PipelineFailure(
      'voice_not_configured',
      `narrationMode is tts but the project has no voiceId or its voiceProvider is not one of: ${TTS_PROVIDER_IDS}`,
    )

  const apiKey = context.job.apiKeys.dubvoice
  if (!apiKey)
    throw new PipelineFailure('missing_api_key', 'dubvoice API key is missing')

  // Números a palabras ANTES de mandar al proveedor (si no, «41» se
  // pronuncia «cuatro uno»); el idioma detectado también viaja al proveedor.
  const { text, language } = prepareNarrationText(script)
  const payload: GenerateVoicePayload = {
    provider: provider.id,
    voiceId: options.voiceId,
    text: '',
    language,
    settings: options.voiceSettings,
  }

  // Timer de progreso: percent real solo cuando ElevenLabs (polling) lo
  // informa; para el resto la UI dibuja su curva sintética.
  let currentPercent: number | undefined
  const startedAt = Date.now()
  const progressTimer = setInterval(() => {
    context.emitter.emit({
      type: 'voice-progress',
      provider: provider.id,
      totalChars: text.length,
      elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000),
      percent: currentPercent,
    })
  }, PROGRESS_TICK_MS)

  const attempts = buildAttempts(
    context,
    provider,
    payload,
    text,
    apiKey,
    (percent) => {
      currentPercent = percent
    },
  )

  try {
    const failures: string[] = []
    for (const [index, attempt] of attempts.entries()) {
      if (index > 0)
        context.emitter.emit({
          type: 'log',
          level: 'warn',
          message: `voice lane "${attempts[index - 1].name}" failed; falling back to "${attempt.name}"`,
        })

      try {
        await attempt.execute()
        return
      } catch (error) {
        // Cancelación pedida: se propaga tal cual, no es un fallo del carril.
        context.signal.throwIfAborted()
        const message = error instanceof Error ? error.message : String(error)
        failures.push(`${attempt.name}: ${message}`)
      }
    }

    throw new PipelineFailure(
      'voice_all_lanes_failed',
      `no voice lane could synthesize the narration:\n${failures.join('\n')}`,
    )
  } finally {
    clearInterval(progressTimer)
  }
}

// Carriles en orden de preferencia: el principal es el motor vía DubVoice; el
// fallback directo (si el motor declara uno y el usuario tiene su clave) entra
// cuando DubVoice está caído.
function buildAttempts(
  context: CreateVideoContext,
  provider: TtsProvider,
  payload: GenerateVoicePayload,
  text: string,
  dubvoiceApiKey: string,
  onPercent: (percent: number) => void,
): NarrationAttempt[] {
  const attempts: NarrationAttempt[] = [
    {
      name: provider.laneName,
      execute: () =>
        synthesizeToNarrationFile(
          context,
          provider,
          payload,
          text,
          dubvoiceApiKey,
          onPercent,
        ),
    },
  ]

  const fallback = provider.directFallback
  const fallbackApiKey = fallback?.apiKeyOf(context.job.apiKeys)
  if (!fallback || !fallbackApiKey) return attempts

  attempts.push({
    name: fallback.name,
    execute: async () => {
      const download = await fallback.synthesize({
        payload,
        text,
        apiKey: fallbackApiKey,
        signal: context.signal,
      })
      await writeNarrationAudio(context.paths.narrationFile, download)
    },
  })

  return attempts
}

async function synthesizeToNarrationFile(
  context: CreateVideoContext,
  provider: TtsProvider,
  payload: GenerateVoicePayload,
  text: string,
  apiKey: string,
  onPercent: (percent: number) => void,
): Promise<void> {
  if (provider.chunksLongText && text.length > provider.requestCharLimit) {
    await synthesizeChunked(context, provider, payload, text, apiKey)
    return
  }

  const download = await provider.synthesize({
    payload,
    text,
    apiKey,
    signal: context.signal,
    onProgress: (progress) => onPercent(progress.percent),
  })
  await writeNarrationAudio(context.paths.narrationFile, download)
}

async function writeNarrationAudio(
  narrationFile: string,
  download: AudioDownload,
): Promise<void> {
  await writeFileAtomic(narrationFile, download.audio)
}

// ─── Troceo de narraciones largas (motores con chunksLongText) ───
//
// El endpoint topa en ~5000 chars por llamada: antes el origen mandaba TODO
// en un POST y DubVoice registraba (y COBRABA) el job pero devolvía una
// respuesta no-audio. Se trocea por oraciones, se sintetiza cada parte y se
// concatenan RE-ENCODEANDO (nunca -c copy: arrastra el encoder-delay de cada
// parte → clicks audibles y header VBR con duración errónea).

interface PartsManifest {
  chunkHashes: string[]
}

async function synthesizeChunked(
  context: CreateVideoContext,
  provider: TtsProvider,
  payload: GenerateVoicePayload,
  text: string,
  apiKey: string,
): Promise<void> {
  const narrationFile = context.paths.narrationFile
  const chunks = chunkTextForTts(text, provider.requestCharLimit)

  // Guard anti-doble-gasto (DubVoice cobra 1 char = 1 crédito): el troceo
  // SOLO recorta espacios; si sumara más chars que el original, abortar.
  const totalChars = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  if (totalChars > text.length)
    throw new PipelineFailure(
      'voice_chunking_inconsistent',
      `chunking produced ${totalChars} chars out of ${text.length}: aborted to avoid overspending credits`,
    )

  context.emitter.emit({
    type: 'log',
    level: 'info',
    message: `long narration (${text.length} chars) split into ${chunks.length} parts`,
  })

  const manifestFile = `${narrationFile}.parts.json`
  const manifest = await readPartsManifest(manifestFile)
  const chunkHashes = chunks.map((chunk) => sha256(chunk))
  const partFiles = chunks.map(
    (_, index) => `${narrationFile}.part_${index}.mp3`,
  )

  for (const [index, chunk] of chunks.entries()) {
    context.signal.throwIfAborted()

    // Reuso entre reintentos: una parte ya pagada y válida en disco (mismo
    // hash de texto) no se vuelve a sintetizar — plata del usuario.
    const reusable =
      manifest?.chunkHashes[index] === chunkHashes[index] &&
      (await isValidFile(partFiles[index]))
    if (reusable) continue

    const download = await provider.synthesize({
      payload,
      text: chunk,
      apiKey,
      signal: context.signal,
    })
    await writeFileAtomic(partFiles[index], download.audio)
    await writeFileAtomic(
      manifestFile,
      `${JSON.stringify({ chunkHashes: chunkHashes.slice(0, index + 1) } satisfies PartsManifest, null, 2)}\n`,
    )
  }

  await concatMp3Parts(context, partFiles, narrationFile)

  // Parciales y manifest solo se limpian con la narración completa en disco;
  // si algo falló antes, quedan para el reintento.
  for (const partFile of partFiles) {
    await rm(partFile, { force: true })
  }
  await rm(manifestFile, { force: true })
}

// Corta en el ÚLTIMO límite de oración (.!?\n) dentro de la ventana; si no
// hay, en el último espacio; último recurso corte duro. Slices contiguos:
// no se pierde ni duplica texto.
export function chunkTextForTts(text: string, limit: number): string[] {
  const chunks: string[] = []
  let remaining = text

  while (remaining.length > limit) {
    const window = remaining.slice(0, limit)

    let cut = -1
    for (const match of window.matchAll(/[.!?\n]/g))
      cut = (match.index ?? 0) + 1
    if (cut <= 0) {
      const lastSpace = window.lastIndexOf(' ')
      cut = lastSpace > 0 ? lastSpace + 1 : limit
    }

    const part = remaining.slice(0, cut).trim()
    if (part) chunks.push(part)
    remaining = remaining.slice(cut)
  }

  if (remaining.trim()) chunks.push(remaining.trim())
  return chunks.length > 0 ? chunks : [text.trim()]
}

async function concatMp3Parts(
  context: CreateVideoContext,
  partFiles: string[],
  outputFile: string,
): Promise<void> {
  if (partFiles.length === 1) {
    await copyFile(partFiles[0], outputFile)
    return
  }

  const ffmpegPath = requireFfmpegPath(context.job.binaryPaths.ffmpeg)
  const listFile = `${outputFile}.concat_list.txt`

  // Rutas ABSOLUTAS con / (el demuxer concat resuelve relativo a la lista,
  // no al cwd; en Windows los \ lo rompen).
  const listContent = partFiles
    .map(
      (part) =>
        `file '${resolve(part).replace(/\\/g, '/').replace(/'/g, "'\\''")}'`,
    )
    .join('\n')
  await writeFileAtomic(listFile, listContent)

  try {
    await runFfmpeg(
      ffmpegPath,
      [
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listFile,
        '-c:a',
        'libmp3lame',
        '-q:a',
        '2',
        outputFile,
      ],
      { signal: context.signal },
    )
  } finally {
    await rm(listFile, { force: true })
  }
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

async function readPartsManifest(
  manifestFile: string,
): Promise<PartsManifest | null> {
  if (!(await isValidFile(manifestFile))) return null
  try {
    return JSON.parse(await readTextWithRetry(manifestFile)) as PartsManifest
  } catch {
    return null
  }
}
