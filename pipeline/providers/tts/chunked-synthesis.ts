import { createHash } from 'node:crypto'
import { readFile, readdir, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'

import { isValidFile } from '../../project/paths.ts'
import type { PipelineEmitter } from '../../runner/emitter.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { GenerateVoicePayload } from '../../types/voices.ts'
import {
  readTextWithRetry,
  writeFileAtomic,
  renameAtomic,
} from '../../utils/atomic-fs.ts'
import { requireFfmpegPath, runFfmpeg } from '../../utils/ffmpeg.ts'
import type { AudioDownload } from './dubvoice.ts'
import { downloadAudioFromUrl } from './dubvoice.ts'
import type { TtsProvider } from './provider.ts'
import {
  openVoiceRequest,
  voiceRequestFile,
  clearVoiceRequest,
} from './request-checkpoint.ts'

// ─── Síntesis por partes (ADR-0025) ───
//
// Todo motor topa por llamada (chunkCharLimit): el texto se trocea por
// oraciones, se sintetiza cada parte en orden y se concatenan RE-ENCODEANDO
// (nunca -c copy: arrastra el encoder-delay de cada parte → clicks audibles y
// header VBR con duración errónea). Las partes ya pagadas quedan en disco con
// un manifest de hashes para reusarlas en un reintento. Lo comparten la stage
// de narración (Crear) y el command generate-voice (probador).

const HEURISTIC_TICK_MS = 1000
const HEURISTIC_MIN_EXPECTED_MS = 5000
const HEURISTIC_MS_PER_CHAR = 25
const HEURISTIC_PERCENT_CAP = 95
const PART_FILE_SUFFIX = '.part_'
const PART_FILE_EXTENSION = '.mp3'
const MANIFEST_SUFFIX = '.parts.json'

export interface PartsProgress {
  // Agregado de todas las partes (0-100).
  percent: number
  // 1-based.
  partIndex: number
  partTotal: number
  status: string
  elapsedSeconds: number
}

export interface SynthesizeInPartsInput {
  provider: TtsProvider
  payload: GenerateVoicePayload
  text: string
  apiKey: string
  signal: AbortSignal
  // mp3 final; las partes y el manifest viven al lado con su nombre de base.
  outputFile: string
  // job.binaryPaths.ffmpeg: Rust lo manda en todos los jobs.
  ffmpegPath: string | undefined
  emitter: PipelineEmitter
  onProgress?(progress: PartsProgress): void
}

interface PartsManifest {
  chunkHashes: string[]
  // Ausente en proyectos anteriores: conserva su reuso por texto. Los
  // manifests nuevos atan las partes también al motor, voz y ajustes.
  identityHash?: string
}

export async function synthesizeInParts(
  input: SynthesizeInPartsInput,
): Promise<AudioDownload> {
  const { provider, payload, text, outputFile } = input
  const chunks = chunkTextForTts(text, provider.chunkCharLimit(payload))

  // Guard anti-doble-gasto (DubVoice cobra 1 char = 1 crédito): el troceo
  // SOLO recorta espacios; si sumara más chars que el original, abortar.
  const totalChars = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  if (totalChars > text.length)
    throw new PipelineFailure(
      'voice_chunking_inconsistent',
      `chunking produced ${totalChars} chars out of ${text.length}: aborted to avoid overspending credits`,
    )

  const startedAt = Date.now()
  const reporter = createPartsReporter(input, chunks.length, startedAt)

  if (chunks.length === 1) {
    const download = await synthesizePart(input, chunks, 0, reporter)
    await writeFileAtomic(outputFile, download.audio)
    await clearVoiceRequest(outputFile, 0)
    return download
  }

  input.emitter.emit({
    type: 'log',
    level: 'info',
    message: `long text (${text.length} chars) split into ${chunks.length} parts for ${provider.id}`,
  })

  const manifestFile = `${outputFile}${MANIFEST_SUFFIX}`
  const manifest = await readPartsManifest(manifestFile)
  const identityHash = sha256(
    JSON.stringify({
      provider: provider.id,
      voiceId: payload.voiceId,
      model: payload.model,
      language: payload.language,
      settings: payload.settings,
    }),
  )
  const chunkHashes = chunks.map((chunk) => sha256(chunk))
  const partFiles = chunks.map(
    (_, index) =>
      `${outputFile}${PART_FILE_SUFFIX}${index}${PART_FILE_EXTENSION}`,
  )

  const credits = new CreditsTally()
  for (const index of chunks.keys()) {
    input.signal.throwIfAborted()

    // Reuso entre reintentos: una parte ya pagada y válida en disco (mismo
    // hash de texto) no se vuelve a sintetizar — plata del usuario.
    const reusable =
      (!manifest?.identityHash || manifest.identityHash === identityHash) &&
      manifest?.chunkHashes[index] === chunkHashes[index] &&
      (await isValidFile(partFiles[index]))
    if (reusable) {
      reporter.report(index, 100, 'completed')
      continue
    }

    const download = await synthesizePart(input, chunks, index, reporter)
    credits.add(download)
    await writeFileAtomic(partFiles[index], download.audio)
    await writeFileAtomic(
      manifestFile,
      `${JSON.stringify({ identityHash, chunkHashes: chunkHashes.slice(0, index + 1) } satisfies PartsManifest, null, 2)}\n`,
    )
    await clearVoiceRequest(outputFile, index)
  }

  await concatMp3Parts(input, partFiles, outputFile)

  // Parciales y manifest solo se limpian con el audio completo en disco; si
  // algo falló antes, quedan para el reintento. Se barre por patrón y no por
  // `partFiles`: un carril anterior con otro tamaño de trozo pudo dejar
  // índices que este no conoce.
  await removePartFiles(outputFile)

  return credits.toDownload(await readFile(outputFile))
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

// Una parte: progreso real del motor si lo informa; si no, heurístico por
// largo del texto (cap 95 % hasta que el proveedor responde), reiniciado por
// parte. Manda los trozos vecinos para la continuidad (solo ElevenLabs
// directo los usa).
async function synthesizePart(
  input: SynthesizeInPartsInput,
  chunks: string[],
  index: number,
  reporter: PartsReporter,
): Promise<AudioDownload> {
  const { provider, payload, apiKey, signal } = input
  const chunk = chunks[index]
  signal.throwIfAborted()
  const fingerprint = sha256(
    JSON.stringify({
      provider: provider.id,
      voiceId: payload.voiceId,
      model: payload.model,
      language: payload.language,
      settings: payload.settings,
      text: chunk,
      previousText: chunks[index - 1],
      nextText: chunks[index + 1],
    }),
  )
  const checkpoint = await openVoiceRequest(
    voiceRequestFile(input.outputFile, index),
    fingerprint,
  )
  const stopHeuristic = provider.reportsProgress
    ? null
    : reporter.startHeuristic(index, chunk.length)

  try {
    if (!provider.supportsTaskResume && checkpoint.receipt.resultUrl)
      return {
        audio: await downloadAudioFromUrl(checkpoint.receipt.resultUrl, signal),
      }
    return await provider.synthesize({
      payload,
      text: chunk,
      apiKey,
      // Los motores síncronos no tienen id consultable: cosechar la parte
      // enviada aunque se navegue/cancele, guardarla y no enviar la siguiente.
      signal: provider.supportsTaskResume ? signal : undefined,
      checkpoint,
      previousText: chunks[index - 1],
      nextText: chunks[index + 1],
      onProgress: (progress) =>
        reporter.report(
          index,
          progress.percent,
          progress.status,
          progress.elapsedSeconds,
        ),
    })
  } catch (error) {
    if (signal.aborted) throw error
    const receipt = checkpoint.receipt
    // Solo un rechazo definitivo del POST o un failed remoto permite otro
    // carril. Una caída de poll/CDN jamás invalida el trabajo pagado.
    if (
      error instanceof PipelineFailure &&
      !receipt.taskId &&
      !receipt.resultUrl &&
      [
        'voice_invalid_api_key',
        'voice_insufficient_credits',
        'voice_quota_exceeded',
        'voice_rate_limited',
        'voice_account_restricted',
      ].includes(error.code)
    ) {
      await checkpoint.update({ state: 'failed' })
      throw error
    }
    if (receipt.state === 'failed') throw error
    throw new PipelineFailure(
      receipt.taskId || receipt.resultUrl
        ? 'voice_request_pending'
        : 'voice_request_unresolved',
      'voice request remains recorded; resume must inspect it before submitting again',
    )
  } finally {
    stopHeuristic?.()
  }
}

interface PartsReporter {
  report(
    index: number,
    partPercent: number,
    status: string,
    elapsedSeconds?: number,
  ): void
  startHeuristic(index: number, chunkLength: number): () => void
}

// Convierte el avance de UNA parte en el agregado de todas y lo reenvía al
// caller con la parte en curso.
function createPartsReporter(
  input: SynthesizeInPartsInput,
  partTotal: number,
  startedAt: number,
): PartsReporter {
  const report = (
    index: number,
    partPercent: number,
    status: string,
    elapsedSeconds = 0,
  ) => {
    const percent = ((index + partPercent / 100) / partTotal) * 100
    input.onProgress?.({
      percent: Math.min(100, Math.floor(percent)),
      partIndex: index + 1,
      partTotal,
      status,
      elapsedSeconds: Math.max(
        elapsedSeconds,
        Math.round((Date.now() - startedAt) / 1000),
      ),
    })
  }

  const startHeuristic = (index: number, chunkLength: number) => {
    const expectedMs = Math.max(
      HEURISTIC_MIN_EXPECTED_MS,
      chunkLength * HEURISTIC_MS_PER_CHAR,
    )
    const partStartedAt = Date.now()
    const timer = setInterval(() => {
      const elapsedMs = Date.now() - partStartedAt
      report(
        index,
        Math.min(
          HEURISTIC_PERCENT_CAP,
          Math.floor((elapsedMs / expectedMs) * 100),
        ),
        'processing',
      )
    }, HEURISTIC_TICK_MS)

    return () => clearInterval(timer)
  }

  return { report, startHeuristic }
}

// creditsUsed solo tiene sentido si TODAS las partes lo informaron (ElevenLabs
// vía DubVoice no lo devuelve); creditsRemaining es el de la última que lo
// trajo.
class CreditsTally {
  private used = 0
  private everyPartReportedUsed = true
  private remaining: number | undefined

  add(download: AudioDownload): void {
    if (download.creditsUsed === undefined) this.everyPartReportedUsed = false
    else this.used += download.creditsUsed
    if (download.creditsRemaining !== undefined)
      this.remaining = download.creditsRemaining
  }

  toDownload(audio: Buffer): AudioDownload {
    const download: AudioDownload = { audio }
    if (this.everyPartReportedUsed) download.creditsUsed = this.used
    if (this.remaining !== undefined) download.creditsRemaining = this.remaining
    return download
  }
}

async function concatMp3Parts(
  input: SynthesizeInPartsInput,
  partFiles: string[],
  outputFile: string,
): Promise<void> {
  const ffmpegPath = requireFfmpegPath(input.ffmpegPath)
  const listFile = `${outputFile}.concat_list.txt`
  const assembledFile = `${outputFile}.assembling.mp3`

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
        assembledFile,
      ],
      { signal: input.signal },
    )
    await renameAtomic(assembledFile, outputFile)
  } finally {
    await rm(listFile, { force: true })
  }
}

async function removePartFiles(outputFile: string): Promise<void> {
  const directory = dirname(outputFile)
  const partPrefix = `${basename(outputFile)}${PART_FILE_SUFFIX}`
  const names = await readdir(directory)
  for (const name of names) {
    const isPart =
      name.startsWith(partPrefix) && name.endsWith(PART_FILE_EXTENSION)
    if (!isPart) continue
    await rm(join(directory, name), { force: true })
  }
  await rm(`${outputFile}${MANIFEST_SUFFIX}`, { force: true })
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
