import { writeFile } from 'node:fs/promises'

import {
  animationRangeEnd,
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
import {
  automaticFreeSceneCount,
  avatarSpanWindows,
  cutLaneAroundPins,
  droppedAppearances,
  pinnedTimeline,
  planAvatarPins,
} from './pins.ts'
import type { PinnedSpan } from './pins.ts'

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
      ['scene-prompts', 'images', 'avatar', 'animation', 'render'].includes(
        stage,
      ),
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
        scene.animationPending?.length ||
        // Un recibo o un clip de HeyGen (ADR-0057) es trabajo pagado.
        scene.avatar?.attempts?.length ||
        scene.avatar?.clipFile,
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
    // Con avatar el total depende de los pines (ADR-0057): la fase corre
    // siempre y decide su caché adentro, como el carril de segundos.
    if (context.options.avatar?.placement === 'auto') return false

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
    const prefix = {
      minutes: animationMinutes,
      endSeconds: animationEnabled
        ? animationRangeEnd(animationMinutes, audioDurationSeconds)
        : 0,
    }
    const secondsLane = isSecondsLane(context, confirmed)
    const baseSeconds = clampSecondsPerScene(
      context.options.secondsPerScene ?? DEFAULT_SECONDS_PER_SCENE,
    )
    // El avatar se planifica ANTES de cortar (ADR-0057): sus apariciones son
    // pines fijos en fronteras de frase y cada carril corta solo los tramos
    // libres. Sin avatar es null y el corte sigue byte-idéntico.
    const avatarPlan = planAvatarPins(
      context.options.avatar,
      words,
      audioDurationSeconds,
    )
    const pins = avatarPlan?.pins ?? []

    // Las sugeridas cuentan todas las escenas, avatar incluido (§6.1).
    const baseCut = secondsLane
      ? secondsLaneCut(words, audioDurationSeconds, baseSeconds, prefix, pins)
      : classicLaneCut(
          words,
          audioDurationSeconds,
          classicSuggestedCount(
            context.options.sceneCount,
            pins,
            audioDurationSeconds,
          ),
          context.options.sceneCount,
          prefix,
          pins,
        )
    const baseCount = baseCut.length

    // Punto de pausa: sin confirmación en disco, el job termina LIMPIO acá.
    // confirm-scenes escribe el archivo y la UI relanza el pipeline (las
    // fases 1-2 serán cache-hit). En el carril de segundos el evento lleva
    // el valor vigente: el diálogo pasa a modo slider. Con avatar, el evento
    // dice dónde aparece: confirmar otra cantidad o duración solo reparte las
    // escenas libres, los pines no se mueven.
    if (
      context.options.confirmScenes &&
      !(await isValidFile(context.paths.scenesConfirmedFile))
    ) {
      // Con avatar, antes de la pausa: cuántas apariciones no entraron, así el
      // diálogo lo dice (también si no entró ninguna) antes de pagar las
      // imágenes. Los ids son los del corte sugerido; tras confirmar, el corte
      // los vuelve a anunciar con los suyos (una vez por corrida).
      if (avatarPlan)
        context.emitter.emit({
          type: 'avatar-planned',
          sceneIds: avatarSceneIds(baseCut),
          dropped: avatarPlan.dropped,
        })
      context.emitter.emit({
        type: 'awaiting-scene-confirmation',
        suggestedScenes: baseCount,
        audioDurationSeconds,
        wordCount: words.length,
        ...(secondsLane ? { secondsPerScene: baseSeconds } : {}),
        ...(animationEnabled ? { animationMinutes } : {}),
        ...(avatarPlan
          ? { avatarSpans: avatarSpanWindows(pins, audioDurationSeconds) }
          : {}),
      })
      context.metadata.sceneCount = baseCount
      context.metadata.state = 'awaiting-confirmation'
      await context.saveMetadata()
      return { pause: true }
    }

    const previous = await readScenes(context.paths)
    // Un prefijo guardado con la política anterior6s conserva sus cortes
    // incluso si se pausó antes de redactar: actualizar no redivide proyectos.
    // Un proyecto con avatar nunca tuvo esa política, y su corte une la
    // fuente sobrante a la anterior (una fuente de 3 a 6 s con pedido de 6 s,
    // pins.ts): no es un prefijo viejo (ADR-0057).
    const legacyPrefix =
      animationEnabled &&
      !avatarPlan &&
      previous?.some(
        (scene) =>
          scene.animationRequestedSeconds === ANIMATION_PREFIX_SCENE_SECONDS &&
          (scene.endSeconds ?? 0) - (scene.startSeconds ?? 0) >
            ANIMATION_PREFIX_IMAGE_SECONDS + 1e-9,
      )
    const preserveDerived =
      legacyPrefix || (await hasDerivedSceneAssets(context, previous))
    let fresh: Scene[]
    let reusable: boolean
    if (secondsLane) {
      // Red de seguridad (v1.31.1 del origen): una confirmación por CONTEO
      // en el carril de segundos se traduce a los segundos equivalentes —
      // nunca se mezclan los dos cortes en un mismo proyecto.
      const seconds =
        confirmed?.secondsPerScene !== undefined
          ? clampSecondsPerScene(confirmed.secondsPerScene)
          : confirmed?.sceneCount
            ? secondsForConfirmedCount(
                confirmed.sceneCount,
                audioDurationSeconds,
                pins,
              )
            : baseSeconds
      fresh = secondsLaneCut(words, audioDurationSeconds, seconds, prefix, pins)
      // Un cambio de cortador no puede invalidar imágenes/tareas pagadas de
      // proyectos históricos. Sin derivados, el cache exige cortes y texto
      // exactos: igual cantidad jamás demuestra igual distribución temporal.
      reusable = reusableSecondsCut(previous, fresh, preserveDerived)
    } else {
      fresh = classicLaneCut(
        words,
        audioDurationSeconds,
        confirmed?.sceneCount ?? baseCount,
        confirmed?.sceneCount ?? context.options.sceneCount,
        prefix,
        pins,
      )
      // Cache de la fase: un corte previo con la misma cantidad y timestamps
      // completos se reusa (conserva prompts/dirección ya generados). Con
      // avatar exige el mismo corte, como el carril de segundos, aunque hoy
      // no entre ninguna aparición: un corte previo con recibos de HeyGen se
      // conserva igual.
      reusable = reusableClassicCut(previous, fresh, {
        avatarPlanned: avatarPlan !== null,
        animationEnabled,
        preserveDerived,
      })
    }
    const scenes = reusable && previous ? previous : fresh
    if (!reusable) await writeScenes(context.paths, scenes)

    context.emitter.emit({
      type: 'scenes-planned',
      scenes: await toSceneSummaries(context.paths, scenes, context.metadata),
      audioDurationSeconds,
    })
    // Qué escenas son del avatar y cuántas apariciones pedidas no están en el
    // corte (no es un fallo: la UI lo cuenta). Una sola vez por corrida: con el
    // corte nuevo o con el que se reusa; con uno reusado, las descartadas son
    // las que le faltan a ESE corte, no las del plan de hoy.
    if (avatarPlan) {
      const sceneIds = avatarSceneIds(scenes)
      context.emitter.emit({
        type: 'avatar-planned',
        sceneIds,
        dropped: droppedAppearances(avatarPlan, sceneIds.length),
      })
    }

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

// El prefijo animado del corte: los minutos efectivos y el segundo del video
// donde termina, el mismo que mide la fase de animación (`animationRangeEnd`).
// Sin animación, 0 y 0.
interface AnimatedPrefix {
  minutes: number
  endSeconds: number
}

// Lo que decide la caché del carril clásico. `avatarPlanned`: el proyecto
// tiene avatar automático, haya entrado o no alguna aparición.
interface ClassicCacheOptions {
  avatarPlanned: boolean
  animationEnabled: boolean
  preserveDerived: boolean
}

// La cantidad sugerida del carril clásico: la del formulario o, automática,
// ≈ una escena cada 3 s. Con avatar, los pines más las imágenes de 3 s o más
// que entran en cada tramo libre, al menos una por tramo
// (automaticFreeSceneCount): si no, las imágenes se apretujarían en lo que
// deja el avatar.
function classicSuggestedCount(
  sceneCount: number,
  pins: PinnedSpan[],
  audioDurationSeconds: number,
): number {
  if (sceneCount > 0) return sceneCount
  if (pins.length === 0)
    return Math.max(
      1,
      Math.round(audioDurationSeconds / AUTO_SECONDS_PER_SCENE),
    )

  const timeline = pinnedTimeline(pins, audioDurationSeconds)
  return timeline.pins.length + automaticFreeSceneCount(timeline.free)
}

// Las escenas de avatar de un corte, por id.
function avatarSceneIds(scenes: readonly Scene[]): number[] {
  return scenes.filter((scene) => scene.avatar).map((scene) => scene.id)
}

// La red de seguridad del carril de segundos: una confirmación por cantidad
// (la del video entero) se traduce a los segundos de cada imagen. Con avatar,
// sobre el audio libre y las escenas libres: las apariciones no son imágenes
// y duran de 7 a 60 s, así que dividir el audio entero por una cantidad que
// las incluye no da los segundos de las imágenes. Sin pines, la cuenta de
// siempre.
function secondsForConfirmedCount(
  sceneCount: number,
  audioDurationSeconds: number,
  pins: PinnedSpan[],
): number {
  if (pins.length === 0)
    return clampSecondsPerScene(Math.round(audioDurationSeconds / sceneCount))

  const timeline = pinnedTimeline(pins, audioDurationSeconds)
  const freeSeconds = timeline.free.reduce(
    (total, span) => total + span.endSeconds - span.startSeconds,
    0,
  )
  const freeScenes = Math.max(1, sceneCount - timeline.pins.length)
  return clampSecondsPerScene(Math.round(freeSeconds / freeScenes))
}

// Carril de segundos: alrededor del avatar si hay pines; si no, el corte de
// siempre (con el prefijo animado o sin él), byte-idéntico.
function secondsLaneCut(
  words: TranscriptWord[],
  audioDurationSeconds: number,
  seconds: number,
  prefix: AnimatedPrefix,
  pins: PinnedSpan[],
): Scene[] {
  if (pins.length > 0)
    return cutLaneAroundPins(words, audioDurationSeconds, pins, {
      secondsPerScene: seconds,
      prefixEndSeconds: prefix.endSeconds,
    })
  if (prefix.minutes > 0)
    return cutScenesWithAnimatedPrefix(
      words,
      audioDurationSeconds,
      prefix.minutes,
      seconds,
    )

  return cutScenesBySeconds(words, seconds, audioDurationSeconds)
}

// Carril clásico por cantidad. `sceneCount` es el total del video (avatar
// incluido); con prefijo animado manda `prefixSceneCount` (la confirmada o la
// del formulario; 0 = automática), como el corte sin avatar. Sin pines, el
// corte de siempre, byte-idéntico (`cutScenesByTime` reparte por
// `word.start`); con pines, los textos salen por punto medio (§6.1).
function classicLaneCut(
  words: TranscriptWord[],
  audioDurationSeconds: number,
  sceneCount: number,
  prefixSceneCount: number,
  prefix: AnimatedPrefix,
  pins: PinnedSpan[],
): Scene[] {
  if (pins.length > 0)
    return cutLaneAroundPins(words, audioDurationSeconds, pins, {
      sceneCount: prefix.minutes > 0 ? prefixSceneCount : sceneCount,
      prefixEndSeconds: prefix.endSeconds,
    })
  if (prefix.minutes > 0)
    return cutScenesWithAnimatedPrefix(
      words,
      audioDurationSeconds,
      prefix.minutes,
      undefined,
      prefixSceneCount,
    )

  return cutScenesByTime(words, sceneCount)
}

function hasFiniteTimes(scene: Scene): boolean {
  return (
    Number.isFinite(scene.startSeconds) && Number.isFinite(scene.endSeconds)
  )
}

// El mismo corte, escena por escena: tiempos, texto, prefijo animado, alias
// de imagen y avatar.
function sameCut(previous: Scene[], fresh: Scene[]): boolean {
  if (previous.length !== fresh.length) return false

  return previous.every(
    (scene, index) =>
      scene.startSeconds === fresh[index].startSeconds &&
      scene.endSeconds === fresh[index].endSeconds &&
      scene.text === fresh[index].text &&
      scene.animationRequestedSeconds ===
        fresh[index].animationRequestedSeconds &&
      scene.visualSourceSceneId === fresh[index].visualSourceSceneId &&
      scene.avatar?.lookId === fresh[index].avatar?.lookId,
  )
}

// Caché del carril de segundos: un corte previo con todos sus tiempos se
// reusa si conserva trabajo derivado (imágenes, prompts, recibos de Kie o de
// HeyGen) o si es exactamente el mismo corte.
function reusableSecondsCut(
  previous: Scene[] | null,
  fresh: Scene[],
  preserveDerived: boolean,
): boolean {
  if (!previous || !previous.every(hasFiniteTimes)) return false
  if (preserveDerived) return true

  return sameCut(previous, fresh)
}

// Caché del carril clásico. Con trabajo derivado, el corte previo manda si
// hay animación o avatar; con avatar, si no, tiene que ser el mismo corte;
// sin avatar ni animación alcanza la misma cantidad, y con animación, los
// mismos tiempos (lo de siempre).
function reusableClassicCut(
  previous: Scene[] | null,
  fresh: Scene[],
  options: ClassicCacheOptions,
): boolean {
  if (!previous || !previous.every(hasFiniteTimes)) return false
  if (
    (options.avatarPlanned || options.animationEnabled) &&
    options.preserveDerived
  )
    return true
  if (options.avatarPlanned) return sameCut(previous, fresh)
  if (previous.length !== fresh.length) return false
  if (!options.animationEnabled) return true

  return previous.every(
    (scene, index) =>
      scene.startSeconds === fresh[index].startSeconds &&
      scene.endSeconds === fresh[index].endSeconds &&
      scene.animationRequestedSeconds ===
        fresh[index].animationRequestedSeconds &&
      scene.text === fresh[index].text,
  )
}
