import { writeFile } from 'node:fs/promises'

import { isValidFile } from '../../project/paths.ts'
import {
  readScenes,
  toSceneSummaries,
  writeScenes,
} from '../../project/scenes-file.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { Stage } from '../../runner/stage.ts'
import type { Scene, TranscriptWord } from '../../types/scenes.ts'
import { readTextWithRetry } from '../../utils/atomic-fs.ts'
import type { CreateVideoContext } from '../context.ts'
import {
  clampSecondsPerScene,
  cutScenesBySeconds,
  DEFAULT_SECONDS_PER_SCENE,
} from './by-seconds.ts'

// Fase 3: cortes de escena uniformes por TIEMPO (no por texto: el pipeline
// invertido del origen — voz primero — es lo que mantiene la sincronización
// exacta) y el punto de pausa de la confirmación de escenas (ADR-0013).

// ≈ una escena cada 3 segundos de audio cuando la cantidad es automática.
const AUTO_SECONDS_PER_SCENE = 3

interface ConfirmedScenes {
  sceneCount?: number
  secondsPerScene?: number
}

// Carril de SEGUNDOS-POR-ESCENA (estilo propio): entra solo cuando el
// proyecto lo pide (options.secondsPerScene) o cuando la confirmación llegó
// en segundos — un proyecto custom previo sin el campo sigue cortando
// clásico, byte-idéntico.
function isSecondsLane(
  context: CreateVideoContext,
  confirmed: ConfirmedScenes | null,
): boolean {
  if (!context.options.customStyle) return false
  return (
    context.options.secondsPerScene !== undefined ||
    confirmed?.secondsPerScene !== undefined
  )
}

export const sceneCutsStage: Stage<CreateVideoContext> = {
  id: 'scene-cuts',

  async skip(context) {
    // Con confirmación pendiente la fase TIENE que correr (para pausar).
    if (
      context.options.confirmScenes &&
      !(await isValidFile(context.paths.scenesConfirmedFile))
    )
      return false

    const scenes = await readScenes(context.paths)
    if (!scenes) return false

    // Carril de segundos: el conteo objetivo sale de cortar (depende de las
    // palabras) — la fase corre siempre y reusa su cache adentro.
    if (isSecondsLane(context, await readConfirmedCut(context))) return false

    const targetCount = await resolveTargetSceneCount(context)
    if (targetCount === null) return false

    return (
      scenes.length === targetCount &&
      scenes.every((scene) => scene.startSeconds !== undefined)
    )
  },

  async run(context) {
    const words = await readWords(context)
    const audioDurationSeconds =
      context.metadata.audioDurationSeconds ?? words[words.length - 1].end

    // Audio propio sin guion: la transcripción ES el guion. Se persiste para
    // que la biblia visual salga del texto realmente narrado y para que al
    // reanudar ya exista.
    if (
      context.options.narrationMode === 'own-audio' &&
      !(await isValidFile(context.paths.scriptFile))
    ) {
      const script = rebuildNarrationText(words)
      if (script) await writeFile(context.paths.scriptFile, script, 'utf8')
    }

    const confirmed = await readConfirmedCut(context)
    const secondsLane = isSecondsLane(context, confirmed)
    const baseSeconds = clampSecondsPerScene(
      context.options.secondsPerScene ?? DEFAULT_SECONDS_PER_SCENE,
    )

    const baseCount = secondsLane
      ? cutScenesBySeconds(words, baseSeconds, audioDurationSeconds).length
      : context.options.sceneCount > 0
        ? context.options.sceneCount
        : Math.max(1, Math.round(audioDurationSeconds / AUTO_SECONDS_PER_SCENE))

    // Punto de pausa: sin confirmación en disco, el job termina LIMPIO acá.
    // confirm-scenes escribe el archivo y la UI relanza el pipeline (las
    // fases 1-2 serán cache-hit). En el carril de segundos el evento lleva
    // el valor vigente: el diálogo pasa a modo slider.
    if (
      context.options.confirmScenes &&
      !(await isValidFile(context.paths.scenesConfirmedFile))
    ) {
      context.emitter.emit({
        type: 'awaiting-scene-confirmation',
        suggestedScenes: baseCount,
        audioDurationSeconds,
        wordCount: words.length,
        ...(secondsLane ? { secondsPerScene: baseSeconds } : {}),
      })
      context.metadata.state = 'awaiting-confirmation'
      await context.saveMetadata()
      return { pause: true }
    }

    let scenes: Scene[]
    let reusable: boolean
    const previous = await readScenes(context.paths)
    if (secondsLane) {
      // Red de seguridad (v1.31.1 del origen): una confirmación por CONTEO
      // en el carril de segundos se traduce a los segundos equivalentes —
      // nunca se mezclan los dos cortes en un mismo proyecto.
      const seconds =
        confirmed?.secondsPerScene !== undefined
          ? clampSecondsPerScene(confirmed.secondsPerScene)
          : confirmed?.sceneCount
            ? clampSecondsPerScene(
                Math.round(audioDurationSeconds / confirmed.sceneCount),
              )
            : baseSeconds
      const fresh = cutScenesBySeconds(words, seconds, audioDurationSeconds)
      // Cache de la fase: el corte es determinístico — mismo largo con
      // timestamps completos = mismo corte (conserva prompts ya generados).
      reusable =
        previous !== null &&
        previous.length === fresh.length &&
        previous.every((scene) => scene.startSeconds !== undefined)
      scenes = reusable ? previous! : fresh
    } else {
      const sceneCount = confirmed?.sceneCount ?? baseCount

      // Cache de la fase: un corte previo con la misma cantidad y timestamps
      // completos se reusa (conserva prompts/dirección ya generados).
      reusable =
        previous !== null &&
        previous.length === sceneCount &&
        previous.every((scene) => scene.startSeconds !== undefined)
      scenes = reusable ? previous! : cutScenesByTime(words, sceneCount)
    }
    if (!reusable) await writeScenes(context.paths, scenes)

    context.emitter.emit({
      type: 'scenes-planned',
      scenes: await toSceneSummaries(context.paths, scenes),
      audioDurationSeconds,
    })

    context.metadata.sceneCount = scenes.length
    await context.saveMetadata()

    return undefined
  },
}

async function readWords(
  context: CreateVideoContext,
): Promise<TranscriptWord[]> {
  if (!(await isValidFile(context.paths.wordsFile)))
    throw new PipelineFailure(
      'words_missing',
      'scene-cuts needs words.json (did transcription run?)',
    )

  const words = JSON.parse(
    await readTextWithRetry(context.paths.wordsFile),
  ) as TranscriptWord[]
  if (!Array.isArray(words) || words.length === 0)
    throw new PipelineFailure('words_missing', 'words.json is empty')

  return words
}

// Cantidad objetivo para el skip(): null si aún no se puede saber (sin
// duración medida no hay cálculo automático confiable).
async function resolveTargetSceneCount(
  context: CreateVideoContext,
): Promise<number | null> {
  const confirmed = await readConfirmedSceneCount(context)
  if (confirmed !== null) return confirmed
  if (context.options.sceneCount > 0) return context.options.sceneCount

  const duration = context.metadata.audioDurationSeconds
  if (duration === undefined) return null
  return Math.max(1, Math.round(duration / AUTO_SECONDS_PER_SCENE))
}

async function readConfirmedCut(
  context: CreateVideoContext,
): Promise<ConfirmedScenes | null> {
  if (!(await isValidFile(context.paths.scenesConfirmedFile))) return null

  try {
    const confirmed = JSON.parse(
      await readTextWithRetry(context.paths.scenesConfirmedFile),
    ) as ConfirmedScenes
    const result: ConfirmedScenes = {}
    if (
      Number.isInteger(confirmed.sceneCount) &&
      (confirmed.sceneCount ?? 0) > 0
    )
      result.sceneCount = confirmed.sceneCount
    if (
      Number.isInteger(confirmed.secondsPerScene) &&
      (confirmed.secondsPerScene ?? 0) > 0
    )
      result.secondsPerScene = confirmed.secondsPerScene
    if (result.sceneCount === undefined && result.secondsPerScene === undefined)
      return null
    return result
  } catch {
    // Archivo corrupto: se cae al cálculo automático (mismo criterio que el
    // origen — el usuario puede re-confirmar si quiere).
    return null
  }
}

async function readConfirmedSceneCount(
  context: CreateVideoContext,
): Promise<number | null> {
  return (await readConfirmedCut(context))?.sceneCount ?? null
}

// Corte uniforme: ventana [i·T, (i+1)·T). La ÚLTIMA escena no tiene tope
// superior — captura toda palabra restante para que ningún texto de cola se
// pierda si un timestamp quedó justo en el borde tras el capado al audio
// real (Bug #4 del origen). Una escena puede quedar con texto vacío (corte
// en silencio): igual lleva prompt e imagen — el redactor la ilustra como
// pausa desde la narración vecina (`narrationFragmentFor`), porque el render
// exige una imagen por cada escena con tiempos. Absorber la ventana muda en
// la anterior, como hace `by-seconds`, queda como seguimiento: cambiaría el
// conteo y la caché del corte.
export function cutScenesByTime(
  words: TranscriptWord[],
  sceneCount: number,
): Scene[] {
  if (words.length === 0 || sceneCount <= 0) return []

  const totalSeconds = words[words.length - 1].end
  const secondsPerScene = totalSeconds / sceneCount

  const scenes: Scene[] = []
  for (let index = 0; index < sceneCount; index++) {
    const isLast = index === sceneCount - 1
    const startSeconds = index * secondsPerScene
    const endSeconds = isLast ? totalSeconds : (index + 1) * secondsPerScene

    const sceneWords = words.filter(
      (word) =>
        word.start >= startSeconds && (isLast || word.start < endSeconds),
    )

    scenes.push({
      id: index + 1,
      text: sceneWords.map((word) => word.word).join(' '),
      startSeconds,
      endSeconds,
    })
  }

  return scenes
}

// Reconstruye el guion desde la transcripción (port de reconstruirNarracion):
// espacios alrededor de la puntuación y capitalización de oraciones, para que
// no se lea como un volcado crudo del ASR.
export function rebuildNarrationText(words: TranscriptWord[]): string {
  const raw = words
    .map((word) => (word.word ?? '').trim())
    .filter((word) => word.length > 0)
    .join(' ')
  if (!raw) return ''

  const cleaned = raw
    .replace(/\s+([,.;:!?)\]»…])/g, '$1')
    .replace(/([([«¡¿])\s+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()

  return cleaned.replace(
    /(^\s*|[.!?¿¡…]\s+)(\p{Ll})/gu,
    (_match, separator: string, letter: string) =>
      separator + letter.toUpperCase(),
  )
}
