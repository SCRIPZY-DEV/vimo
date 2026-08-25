import { rm } from 'node:fs/promises'

import { isValidFile } from '../../project/paths.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { Stage } from '../../runner/stage.ts'
import { readTextWithRetry } from '../../utils/atomic-fs.ts'
import type { CreateVideoContext } from '../context.ts'
import { loadOrGenerateVisualBible } from '../shared/visual-bible.ts'
import { downloadBackgroundMusic } from './background-music.ts'
import { synthesizeNarration } from './narration.ts'
import { downloadOverlay } from './overlay.ts'

// Fase 1 (port de la Fase «voz» del orquestador): narración + BGM + overlay
// EN PARALELO. La narración es esencial — si falla se cancelan las otras dos
// y el job muere; BGM y overlay son opcionales — si fallan, el video sale
// sin ese asset y la UI recibe un log (bug pagado en el origen: un link mal
// escrito mataba TODO el pipeline).
export const voiceStage: Stage<CreateVideoContext> = {
  id: 'voice',

  async skip(context) {
    const narrationOk = await isValidFile(context.paths.narrationFile)
    if (!narrationOk) return false

    if (needsBgm(context) && !(await isValidFile(context.paths.musicFile)))
      return false
    if (
      needsOverlay(context) &&
      !(await isValidFile(context.paths.overlayFile))
    )
      return false

    return true
  },

  async run(context) {
    const narrationCached = await isValidFile(context.paths.narrationFile)

    // Con audio propio la narración tiene que estar ya en disco (subida con
    // upload-narration): frenar con mensaje claro en vez de caer a TTS.
    if (context.options.narrationMode === 'own-audio' && !narrationCached)
      throw new PipelineFailure(
        'narration_missing',
        'narrationMode is own-audio but narration.mp3 is not in the project',
      )

    // Cancelación de los assets opcionales: se dispara si el job entero se
    // cancela O si la narración (esencial) falla — sin esto quedaban yt-dlp
    // huérfanos consumiendo red.
    const optionalAssets = new AbortController()
    const onJobAbort = () => optionalAssets.abort()
    context.signal.addEventListener('abort', onJobAbort, { once: true })

    // HOISTING de la biblia visual (port del origen): su único insumo es el
    // guion, disponible desde el segundo 0, pero es la única llamada premium
    // del camino crítico — lanzada acá corre escondida bajo voz + transcripción
    // + cortes. Nunca rechaza; scene-prompts la cobra con await. Con audio
    // propio el guion recién existe tras la transcripción → camino tardío.
    const script = await readScriptIfPresent(context)
    if (context.options.narrationMode === 'tts' && script.trim())
      context.visualBible = loadOrGenerateVisualBible(context, script)

    const narrationTask = narrationCached
      ? Promise.resolve()
      : synthesizeNarration(context, requireScript(script))
    narrationTask.catch(() => optionalAssets.abort())

    const bgmTask = resolveOptionalAsset(
      needsBgm(context) && !(await isValidFile(context.paths.musicFile)),
      () => downloadBackgroundMusic(context, optionalAssets.signal),
    )
    const overlayTask = resolveOptionalAsset(
      needsOverlay(context) && !(await isValidFile(context.paths.overlayFile)),
      () => downloadOverlay(context, optionalAssets.signal),
    )

    const [narrationResult, bgmResult, overlayResult] =
      await Promise.allSettled([narrationTask, bgmTask, overlayTask])
    context.signal.removeEventListener('abort', onJobAbort)

    if (narrationResult.status === 'rejected') throw narrationResult.reason

    reportOptionalFailure(context, bgmResult, 'background music')
    reportOptionalFailure(context, overlayResult, 'overlay')

    // Invalidación en cascada: una narración RECIÉN generada deja obsoletos
    // words.json y scenes.json del audio anterior — sin esto la transcripción
    // queda desalineada y las escenas marcan tiempos que ya no existen.
    if (!narrationCached) {
      await rm(context.paths.wordsFile, { force: true })
      await rm(context.paths.scenesFile, { force: true })
    }

    return undefined
  },
}

function needsBgm(context: CreateVideoContext): boolean {
  const options = context.options
  if (!options.useBgm) return false
  if (options.bgmMode === 'evolink-ai')
    return !!options.bgmMusic?.prompt?.trim()
  return !!options.bgmUrl?.trim()
}

function needsOverlay(context: CreateVideoContext): boolean {
  return context.options.useOverlay && !!context.options.overlayUrl?.trim()
}

async function readScriptIfPresent(
  context: CreateVideoContext,
): Promise<string> {
  if (!(await isValidFile(context.paths.scriptFile))) return ''
  return readTextWithRetry(context.paths.scriptFile)
}

function requireScript(script: string): string {
  if (script.trim()) return script
  throw new PipelineFailure(
    'script_missing',
    'narrationMode is tts but script.txt is not in the project',
  )
}

function resolveOptionalAsset(
  needed: boolean,
  download: () => Promise<void>,
): Promise<void> {
  if (!needed) return Promise.resolve()
  return download()
}

function reportOptionalFailure(
  context: CreateVideoContext,
  result: PromiseSettledResult<void>,
  assetName: string,
): void {
  if (result.status === 'fulfilled') return

  const reason =
    result.reason instanceof Error
      ? result.reason.message
      : String(result.reason)
  context.emitter.emit({
    type: 'log',
    level: 'warn',
    message: `${assetName} skipped (the video continues without it): ${reason}`,
  })
}
