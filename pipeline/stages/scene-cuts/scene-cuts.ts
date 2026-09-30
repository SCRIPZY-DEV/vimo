import { writeFile } from 'node:fs/promises'

import {
  effectiveAnimationMinutes,
  hasAutomaticAnimation,
} from '../../animation/scope.ts'
import { planPrefixSceneWindows } from '../../animation/prefix-scenes.ts'
import { isValidFile, sceneImageFile } from '../../project/paths.ts'
import {
  readScenes,
  toSceneSummaries,
  writeScenes,
} from '../../project/scenes-file.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { Stage } from '../../runner/stage.ts'
import type { Scene, TranscriptWord } from '../../types/scenes.ts'
import {
  ANIMATION_PREFIX_IMAGE_SECONDS,
  ANIMATION_PREFIX_SCENE_SECONDS,
} from '../../types/video-provider.ts'
import { readTextWithRetry } from '../../utils/atomic-fs.ts'
import type { CreateVideoContext } from '../context.ts'
import {
  clampSecondsPerScene,
  cutScenesBySeconds,
  cutScenesAtBoundaries,
  DEFAULT_SECONDS_PER_SCENE,
  MIN_SECONDS_PER_SCENE,
  MAX_SECONDS_PER_SCENE,
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

export function animationSceneCount(
  sceneCount: number,
  audioSeconds: number,
): number {
  const minimum = Math.max(
    1,
    Math.ceil(audioSeconds / MAX_SECONDS_PER_SCENE - 1e-9),
  )
  const maximum = Math.max(
    minimum,
    Math.floor(audioSeconds / MIN_SECONDS_PER_SCENE + 1e-9),
  )
  return Math.min(maximum, Math.max(minimum, Math.round(sceneCount)))
}

async function hasDerivedSceneAssets(
  context: CreateVideoContext,
  scenes: Scene[] | null,
): Promise<boolean> {
  if (!scenes) return false
  if (
    context.metadata.completedStages.some((stage) =>
      ['scene-prompts', 'images', 'animation', 'render'].includes(stage),
    )
  )
    return true
  if (
    scenes.some(
      (scene) =>
        scene.direction ||
        scene.imagePrompt ||
        scene.userPrompt ||
        scene.imageTask ||
        scene.animation ||
        scene.animations?.length ||
        scene.animationPending?.length,
    )
  )
    return true
  return (
    await Promise.all(
      scenes.map((scene) =>
        isValidFile(sceneImageFile(context.paths, scene.id)),
      ),
    )
  ).some(Boolean)
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
    if (hasAutomaticAnimation(context.options)) return false

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
    const animationMinutes = effectiveAnimationMinutes(
      context.options,
      audioDurationSeconds,
    )
    const animationEnabled = animationMinutes > 0
    const secondsLane = isSecondsLane(context, confirmed)
    const baseSeconds = clampSecondsPerScene(
      context.options.secondsPerScene ?? DEFAULT_SECONDS_PER_SCENE,
    )

    const suggestedCount = secondsLane
      ? cutScenesBySeconds(words, baseSeconds, audioDurationSeconds).length
      : context.options.sceneCount > 0
        ? context.options.sceneCount
        : Math.max(1, Math.round(audioDurationSeconds / AUTO_SECONDS_PER_SCENE))
    const baseCount = animationEnabled
      ? cutScenesWithAnimatedPrefix(
          words,
          audioDurationSeconds,
          animationMinutes,
          secondsLane ? baseSeconds : undefined,
          !secondsLane ? context.options.sceneCount : undefined,
        ).length
      : suggestedCount

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
        ...(animationEnabled ? { animationMinutes } : {}),
      })
      context.metadata.sceneCount = baseCount
      context.metadata.state = 'awaiting-confirmation'
      await context.saveMetadata()
      return { pause: true }
    }

    let scenes: Scene[]
    let reusable: boolean
    const previous = await readScenes(context.paths)
    // Un prefijo guardado con la política anterior6s conserva sus cortes
    // incluso si se pausó antes de redactar: actualizar no redivide proyectos.
    const legacyPrefix =
      animationEnabled &&
      previous?.some(
        (scene) =>
          scene.animationRequestedSeconds === ANIMATION_PREFIX_SCENE_SECONDS &&
          (scene.endSeconds ?? 0) - (scene.startSeconds ?? 0) >
            ANIMATION_PREFIX_IMAGE_SECONDS + 1e-9,
      )
    const preserveDerived =
      legacyPrefix || (await hasDerivedSceneAssets(context, previous))
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
      const fresh = animationEnabled
        ? cutScenesWithAnimatedPrefix(
            words,
            audioDurationSeconds,
            animationMinutes,
            seconds,
          )
        : cutScenesBySeconds(words, seconds, audioDurationSeconds)
      // Un cambio de cortador no puede invalidar imágenes/tareas pagadas de
      // proyectos históricos. Sin derivados, el cache exige cortes y texto
      // exactos: igual cantidad jamás demuestra igual distribución temporal.
      reusable =
        previous !== null &&
        previous.every(
          (scene) =>
            Number.isFinite(scene.startSeconds) &&
            Number.isFinite(scene.endSeconds),
        ) &&
        (preserveDerived ||
          (previous.length === fresh.length &&
            previous.every(
              (scene, index) =>
                scene.startSeconds === fresh[index].startSeconds &&
                scene.endSeconds === fresh[index].endSeconds &&
                scene.text === fresh[index].text &&
                scene.animationRequestedSeconds ===
                  fresh[index].animationRequestedSeconds &&
                scene.visualSourceSceneId === fresh[index].visualSourceSceneId,
            )))
      scenes = reusable ? previous! : fresh
    } else {
      const selectedCount = confirmed?.sceneCount ?? baseCount
      const fresh = animationEnabled
        ? cutScenesWithAnimatedPrefix(
            words,
            audioDurationSeconds,
            animationMinutes,
            undefined,
            confirmed?.sceneCount ?? context.options.sceneCount,
          )
        : cutScenesByTime(words, selectedCount)

      // Cache de la fase: un corte previo con la misma cantidad y timestamps
      // completos se reusa (conserva prompts/dirección ya generados).
      reusable =
        previous !== null &&
        previous.every(
          (scene) =>
            Number.isFinite(scene.startSeconds) &&
            Number.isFinite(scene.endSeconds),
        ) &&
        ((animationEnabled && preserveDerived) ||
          (previous.length === fresh.length &&
            (!animationEnabled ||
              previous.every(
                (scene, index) =>
                  scene.startSeconds === fresh[index].startSeconds &&
                  scene.endSeconds === fresh[index].endSeconds &&
                  scene.animationRequestedSeconds ===
                    fresh[index].animationRequestedSeconds &&
                  scene.text === fresh[index].text,
              ))))
      scenes = reusable ? previous! : fresh
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

function cutScenesWithAnimatedPrefix(
  words: TranscriptWord[],
  totalSeconds: number,
  minutes: number,
  secondsPerScene?: number,
  sceneCount?: number,
): Scene[] {
  const windows = planPrefixSceneWindows({
    totalSeconds,
    minutes,
    secondsPerScene,
    sceneCount,
  })
  const scenes = cutScenesAtBoundaries(words, [
    0,
    ...windows.map((window) => window.endSeconds),
  ])
  return scenes.map((scene, index) => ({
    ...scene,
    ...(windows[index].animationRequestedSeconds === undefined
      ? {}
      : {
          animationRequestedSeconds: windows[index].animationRequestedSeconds,
        }),
  }))
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
  audioDurationSeconds?: number,
): Scene[] {
  if (words.length === 0 || sceneCount <= 0) return []

  const totalSeconds = audioDurationSeconds ?? words[words.length - 1].end
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
