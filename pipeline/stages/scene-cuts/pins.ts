import { planPrefixSceneWindowsWithin } from '../../animation/prefix-scenes.ts'
import { TIME_EPSILON } from '../../animation/timing.ts'
import { planAvatarSpans } from '../../avatar/planner.ts'
import type { AvatarSpan } from '../../avatar/planner.ts'
import { detectSentences } from '../../narration/sentences.ts'
import type {
  ProjectAvatarOptions,
  SceneAvatarSeed,
} from '../../types/avatar.ts'
import type { Scene, TranscriptWord } from '../../types/scenes.ts'
import { ANIMATION_PREFIX_SCENE_SECONDS } from '../../types/video-provider.ts'
import {
  cutScenesAtBoundaries,
  MAX_SECONDS_PER_SCENE,
  MIN_SECONDS_PER_SCENE,
  sceneBoundariesBySeconds,
} from './by-seconds.ts'

// Pines del avatar en el corte de escenas (ADR-0057, diseño §6.1). La fase
// `scene-cuts` planifica el avatar ANTES de cortar: cada aparición es un pin
// (un tramo fijo que arranca en una frontera de frase y, desde la entrega 2g,
// termina entre dos palabras cerca de los segundos elegidos: `avatarCutEnd`) y
// el carril de siempre corta solo los tramos libres que quedan entre pines.
// Puro, browser-safe y sin E/S: lo usan la fase, la vista previa del corte, el
// estado del proyecto y, para contar sin las palabras (`countScenesAroundSpans`
// con los tramos que trae la pausa), la UI.

// Un tramo del video, en segundos.
export interface SpanWindow {
  startSeconds: number
  endSeconds: number
}

// Una aparición fija en el corte: el tramo del planificador y lo que la
// escena siembra (look, motor y origin: 'auto').
export interface PinnedSpan extends AvatarSpan {
  avatar: SceneAvatarSeed
}

// El plan del avatar para el corte: los pines y cuántas apariciones pedidas
// no entraron en el audio.
export interface AvatarPinsPlan {
  pins: PinnedSpan[]
  dropped: number
}

// Los pines ya ajustados (los tramos libres cortos, absorbidos) y los tramos
// libres que quedan, todo en orden de tiempo.
export interface PinnedTimeline<T extends SpanWindow> {
  pins: T[]
  free: SpanWindow[]
}

// Las fronteras internas de un tramo libre según su carril: en segundos
// absolutos, estrictamente entre el inicio y el fin del tramo.
export type FreeSpanCutter = (
  startSeconds: number,
  endSeconds: number,
) => number[]

// Cómo se cortan los tramos libres: con `secondsPerScene`, el carril de
// segundos; si no, la cantidad TOTAL del video, avatar incluido (`sceneCount`;
// 0 o ausente con prefijo = automática). `prefixEndSeconds` > 0 suma el
// prefijo animado (ADR-0045) hasta ese segundo del video, el mismo que mide la
// fase de animación (`animationRangeEnd`).
export interface PinnedCutLane {
  secondsPerScene?: number
  sceneCount?: number
  prefixEndSeconds?: number
}

// Lo que el prefijo necesita para cortar cada tramo libre.
export interface PrefixCutOptions {
  prefixEndSeconds: number
  secondsPerScene?: number
  free: readonly SpanWindow[]
  // Escenas libres a repartir (el total menos los pines); ausente = automática.
  freeSceneCount?: number
  // El fin del audio: la fuente corta del final del video no se une a la
  // anterior (queda como en el corte sin avatar).
  audioEndSeconds: number
}

// El prefijo animado de un tramo libre: las fronteras internas de sus fuentes
// (con la sobrante corta ya unida) y, si el tramo sigue después del fin del
// rango animado, ese resto y las fronteras con las que lo corta su carril por
// segundos (los del carril o una escena cada 3 s).
interface PrefixLayout {
  sourceCount: number
  sourceBoundaries: number[]
  rest?: SpanWindow
  restBoundaries: number[]
}

// Una ventana del corte: un trozo de un tramo libre o un pin con su avatar.
interface CutWindow extends SpanWindow {
  avatar?: SceneAvatarSeed
}

type PinLike = SpanWindow & { avatar?: SceneAvatarSeed }

// Al milisegundo, como las fronteras de by-seconds.ts.
function toMilliseconds(seconds: number): number {
  return Math.round(seconds * 1000) / 1000
}

// El plan del avatar del proyecto, o null sin avatar o con `placement:
// 'manual'` (entrega 3: las apariciones se agregan desde el editor).
export function planAvatarPins(
  avatar: ProjectAvatarOptions | undefined,
  words: readonly TranscriptWord[],
  audioEndSeconds: number,
): AvatarPinsPlan | null {
  if (!avatar || avatar.placement !== 'auto') return null

  // «3 veces en 2 minutos» (entrega 2f) llega solo cuando la opción lo tiene en
  // true (create-video-project lo guarda solo así); sin él, el plan de antes.
  // Las palabras van también al planificador: cada aparición termina entre dos
  // de ellas (entrega 2g, §23.2).
  const plan = planAvatarSpans(detectSentences(words, audioEndSeconds), words, {
    appearances: avatar.appearances,
    secondsPerAppearance: avatar.secondsPerAppearance,
    startWithAvatar: avatar.startWithAvatar,
    threeInFirstTwoMinutes: avatar.threeInFirstTwoMinutes === true,
  })
  // «Movimiento más expresivo» (entrega 2e) viaja solo cuando la opción lo
  // tiene: create-video-project lo guarda únicamente en true y si el motor y el
  // look lo admiten. Sin él, la semilla de antes.
  const seed: SceneAvatarSeed = {
    lookId: avatar.lookId,
    lookName: avatar.lookName,
    lookType: avatar.lookType,
    engine: avatar.engine,
    origin: 'auto',
    ...(avatar.expressive === true ? { expressive: true } : {}),
  }
  const pins = plan.spans.map((span) => ({ ...span, avatar: { ...seed } }))

  return { pins, dropped: plan.dropped }
}

// Las apariciones pedidas que no están en un corte ya hecho, nuevo o reusado:
// las del plan (la cantidad acotada como la acota el planificador) menos las
// escenas de avatar del corte, nunca negativo. Con el corte nuevo es el
// `dropped` del plan (un pin por tramo); con uno reusado (recibos de HeyGen,
// otra narración) cuenta lo que el video de verdad tiene, no el plan de hoy.
export function droppedAppearances(
  plan: AvatarPinsPlan,
  avatarSceneCount: number,
): number {
  return Math.max(0, plan.pins.length + plan.dropped - avatarSceneCount)
}

// Ordena los pines y absorbe cada tramo libre de menos de
// MIN_SECONDS_PER_SCENE en el pin que le sigue (si no hay, en el anterior):
// mejor que el avatar hable unos segundos más a que haya una imagen de dos.
// Un pin que pisa al anterior arranca donde terminó ese (los del planificador
// nunca se pisan; esto cubre los que traiga el editor). No modifica los pines
// que recibe. Aplicarlo dos veces da lo mismo.
export function pinnedTimeline<T extends SpanWindow>(
  pins: readonly T[],
  audioEndSeconds: number,
): PinnedTimeline<T> {
  const sorted = [...pins].sort(
    (first, second) => first.startSeconds - second.startSeconds,
  )
  const adjusted: T[] = []
  let cursor = 0
  for (const pin of sorted) {
    const endSeconds = Math.min(pin.endSeconds, audioEndSeconds)
    const startSeconds = Math.max(pin.startSeconds, cursor)
    if (endSeconds <= startSeconds + TIME_EPSILON) continue

    const gap = startSeconds - cursor
    const absorbs =
      gap > TIME_EPSILON && gap < MIN_SECONDS_PER_SCENE - TIME_EPSILON
    adjusted.push({
      ...pin,
      startSeconds: absorbs ? cursor : startSeconds,
      endSeconds,
    })
    cursor = endSeconds
  }

  const last = adjusted.at(-1)
  const tail = audioEndSeconds - cursor
  if (
    last &&
    tail > TIME_EPSILON &&
    tail < MIN_SECONDS_PER_SCENE - TIME_EPSILON
  )
    last.endSeconds = audioEndSeconds

  const free: SpanWindow[] = []
  let start = 0
  for (const pin of adjusted) {
    if (pin.startSeconds - start > TIME_EPSILON)
      free.push({ startSeconds: start, endSeconds: pin.startSeconds })
    start = pin.endSeconds
  }
  if (audioEndSeconds - start > TIME_EPSILON)
    free.push({ startSeconds: start, endSeconds: audioEndSeconds })

  return { pins: adjusted, free }
}

// Los tramos del avatar como quedan en el corte, con los tramos libres cortos
// ya absorbidos: los que anuncia la pausa de confirmación y los que rearma el
// estado del proyecto desde el disco mientras espera la confirmación.
export function avatarSpanWindows(
  pins: readonly SpanWindow[],
  audioEndSeconds: number,
): SpanWindow[] {
  return pinnedTimeline(pins, audioEndSeconds).pins.map((pin) => {
    return { startSeconds: pin.startSeconds, endSeconds: pin.endSeconds }
  })
}

// Corta el audio alrededor de los pines (diseño §6.1): cada tramo libre lo
// corta `cutFree` y cada pin es una escena de avatar `planned`. Ids 1..n en
// orden de tiempo y texto por punto medio (`cutScenesAtBoundaries`).
export function cutScenesAroundPins(
  words: readonly TranscriptWord[],
  audioEndSeconds: number,
  pins: readonly PinnedSpan[],
  cutFree: FreeSpanCutter,
): Scene[] {
  if (words.length === 0) return []

  const windows = windowsAround(audioEndSeconds, pins, cutFree)
  const scenes = cutScenesAtBoundaries(words, [
    0,
    ...windows.map((window) => window.endSeconds),
  ])

  return scenes.map((scene, index): Scene => {
    const avatar = windows[index].avatar
    if (!avatar) return scene

    return { ...scene, avatar: { ...avatar, status: 'planned' } }
  })
}

// El carril de segundos acotado a cada tramo, con sus mismas reglas (una cola
// de menos de 3 s se reparte con la anterior).
export function secondsFreeCutter(secondsPerScene: number): FreeSpanCutter {
  return (startSeconds, endSeconds) => {
    const relative = sceneBoundariesBySeconds(
      endSeconds - startSeconds,
      secondsPerScene,
    )
    return relative
      .slice(1, -1)
      .map((boundary) => toMilliseconds(startSeconds + boundary))
  }
}

// El carril clásico: las escenas libres se reparten entre los tramos por
// promedios mayores (allocateFreeScenes: proporcional a su duración, mínimo
// una por tramo, diseño §6.1) y cada tramo se parte en partes iguales. `free`
// son los tramos de `pinnedTimeline`.
export function countFreeCutter(
  free: readonly SpanWindow[],
  freeSceneCount: number,
): FreeSpanCutter {
  const counts = allocateFreeScenes(free, freeSceneCount)
  return (startSeconds, endSeconds) => {
    return equalPartBoundaries(
      { startSeconds, endSeconds },
      countFor(free, counts, startSeconds),
    )
  }
}

// Con prefijo animado: cada tramo libre recibe lo que queda del rango animado
// desde su inicio (en tiempo de video, como lo mide la fase de animación) en
// fuentes de 3 s, con la sobrante corta unida a la anterior (prefixLayout). El
// resto, después del fin del rango, va con su carril: por segundos (los del
// carril o, con la cantidad automática, una escena cada 3 s) o, con una
// cantidad pedida, lo que queda de ella después de descontar las fuentes de
// todos los tramos, repartido solo entre esos restos (allocateRestScenes). Un
// tramo que no está en `free` se corta sin error: como automático o, con
// cantidad, con su resto en una sola escena.
export function prefixFreeCutter(options: PrefixCutOptions): FreeSpanCutter {
  const layouts = options.free.map((span) => prefixLayout(span, options))
  const restCounts =
    options.freeSceneCount === undefined
      ? undefined
      : allocateRestScenes(layouts, options.freeSceneCount)
  return (startSeconds, endSeconds) => {
    const index = freeSpanIndex(options.free, startSeconds)
    const layout =
      index < 0
        ? prefixLayout({ startSeconds, endSeconds }, options)
        : layouts[index]
    if (!restCounts || !layout.rest)
      return [...layout.sourceBoundaries, ...layout.restBoundaries]

    return [
      ...layout.sourceBoundaries,
      ...equalPartBoundaries(layout.rest, index < 0 ? 1 : restCounts[index]),
    ]
  }
}

// La cantidad automática de escenas libres con avatar (carril clásico sin
// cantidad pedida): en cada tramo, las imágenes de MIN_SECONDS_PER_SCENE o más
// que entran, y al menos una. Es «≈ una escena cada 3 s» del corte sin avatar,
// medido por tramo: repartida por promedios mayores, ninguna imagen dura menos
// de 3 s.
export function automaticFreeSceneCount(free: readonly SpanWindow[]): number {
  return free.reduce(
    (total, span) => total + sceneCapacity(span.endSeconds - span.startSeconds),
    0,
  )
}

// El corte de un carril alrededor de los pines; con prefijo, sus fuentes
// llevan el pedido de 6 s.
export function cutLaneAroundPins(
  words: readonly TranscriptWord[],
  audioEndSeconds: number,
  pins: readonly PinnedSpan[],
  lane: PinnedCutLane,
): Scene[] {
  const timeline = pinnedTimeline(pins, audioEndSeconds)
  const scenes = cutScenesAroundPins(
    words,
    audioEndSeconds,
    pins,
    laneCutter(timeline, lane, audioEndSeconds),
  )
  const prefixEndSeconds = lane.prefixEndSeconds ?? 0
  if (prefixEndSeconds <= 0) return scenes

  return withPrefixMarks(scenes, prefixEndSeconds)
}

// Cuántas escenas deja el corte alrededor de esos tramos, sin las palabras
// (el texto no cambia la cuenta): la vista previa del slider y el «≈ N
// escenas» de la UI cuentan con las mismas ventanas que después cortan.
export function countScenesAroundSpans(
  audioEndSeconds: number,
  spans: readonly SpanWindow[],
  lane: PinnedCutLane,
): number {
  const timeline = pinnedTimeline(spans, audioEndSeconds)
  return windowsAround(
    audioEndSeconds,
    spans,
    laneCutter(timeline, lane, audioEndSeconds),
  ).length
}

// Las ventanas de un tramo libre: sus fronteras internas, saneadas (dentro
// del tramo, en orden y sin repetidas).
function freeWindows(span: SpanWindow, cutFree: FreeSpanCutter): CutWindow[] {
  const inner = [...new Set(cutFree(span.startSeconds, span.endSeconds))]
    .filter(
      (boundary) =>
        boundary > span.startSeconds + TIME_EPSILON &&
        boundary < span.endSeconds - TIME_EPSILON,
    )
    .sort((first, second) => first - second)
  const edges = [span.startSeconds, ...inner, span.endSeconds]

  return edges.slice(1).map((endSeconds, index) => {
    return { startSeconds: edges[index], endSeconds }
  })
}

// Todas las ventanas del corte, en orden: las de cada tramo libre y una por
// pin. Cubren de 0 al fin del audio sin huecos.
function windowsAround(
  audioEndSeconds: number,
  pins: readonly PinLike[],
  cutFree: FreeSpanCutter,
): CutWindow[] {
  const timeline = pinnedTimeline(pins, audioEndSeconds)
  const pinned = timeline.pins.map((pin) => {
    const window: CutWindow = {
      startSeconds: pin.startSeconds,
      endSeconds: pin.endSeconds,
    }
    if (pin.avatar) window.avatar = pin.avatar
    return window
  })

  return [
    ...timeline.free.flatMap((span) => freeWindows(span, cutFree)),
    ...pinned,
  ].sort((first, second) => first.startSeconds - second.startSeconds)
}

// El cortador de los tramos libres para un carril.
function laneCutter(
  timeline: PinnedTimeline<SpanWindow>,
  lane: PinnedCutLane,
  audioEndSeconds: number,
): FreeSpanCutter {
  const prefixEndSeconds = lane.prefixEndSeconds ?? 0
  const freeSceneCount = lane.sceneCount
    ? lane.sceneCount - timeline.pins.length
    : undefined
  if (prefixEndSeconds > 0)
    return prefixFreeCutter({
      prefixEndSeconds,
      secondsPerScene: lane.secondsPerScene,
      free: timeline.free,
      freeSceneCount,
      audioEndSeconds,
    })
  if (lane.secondsPerScene !== undefined)
    return secondsFreeCutter(lane.secondsPerScene)

  return countFreeCutter(timeline.free, freeSceneCount ?? 0)
}

// El índice del tramo de `free` que empieza en `startSeconds`, o -1.
function freeSpanIndex(
  free: readonly SpanWindow[],
  startSeconds: number,
): number {
  return free.findIndex(
    (span) => Math.abs(span.startSeconds - startSeconds) <= TIME_EPSILON,
  )
}

// La cantidad que le tocó al tramo que empieza en `startSeconds`. Los
// cortadores son exportados: llamados con un tramo que no está en `free`, lo
// cortan en una sola escena («uno por tramo»), sin error.
function countFor(
  free: readonly SpanWindow[],
  counts: number[],
  startSeconds: number,
): number {
  const index = freeSpanIndex(free, startSeconds)
  if (index < 0) return 1

  return counts[index]
}

// Las fronteras internas de `count` partes iguales de un tramo, al
// milisegundo.
function equalPartBoundaries(span: SpanWindow, count: number): number[] {
  const length = span.endSeconds - span.startSeconds
  const boundaries: number[] = []
  for (let index = 1; index < count; index++)
    boundaries.push(
      toMilliseconds(span.startSeconds + (index * length) / count),
    )
  return boundaries
}

// Cuántas escenas de MIN_SECONDS_PER_SCENE o más entran en un tramo, y al
// menos una.
function sceneCapacity(lengthSeconds: number): number {
  return Math.max(
    1,
    Math.floor(lengthSeconds / MIN_SECONDS_PER_SCENE + TIME_EPSILON),
  )
}

// El prefijo animado de un tramo libre: las fuentes de 3 s de
// planPrefixSceneWindowsWithin y, después del fin del rango, el resto por
// segundos. La última fuente que dura menos de MIN_SECONDS_PER_SCENE se une a
// la anterior y queda de 3 a 6 s (diseño §6.1: si no, antes de cada aparición
// o del fin del rango quedaría una imagen de menos de 3 s). No se une si es la
// única fuente del tramo (lo anterior es el avatar) ni si es la última ventana
// de un tramo que termina en el fin del audio: esa queda como en el corte sin
// avatar.
function prefixLayout(
  span: SpanWindow,
  options: PrefixCutOptions,
): PrefixLayout {
  const length = span.endSeconds - span.startSeconds
  const windows = planPrefixSceneWindowsWithin({
    totalSeconds: length,
    prefixSeconds: Math.min(
      length,
      Math.max(0, options.prefixEndSeconds - span.startSeconds),
    ),
    secondsPerScene: options.secondsPerScene,
  })
  const starts = windows.map((window) => {
    return toMilliseconds(span.startSeconds + window.startSeconds)
  })
  // Las fuentes van primero; el resto, si lo hay, empieza en la siguiente.
  const sources = windows.filter(
    (window) => window.animationRequestedSeconds !== undefined,
  )
  const lastSource = sources.at(-1)
  const hasRest = sources.length < windows.length
  const endsVideo =
    !hasRest &&
    Math.abs(span.endSeconds - options.audioEndSeconds) <= TIME_EPSILON
  const mergesLastSource =
    lastSource !== undefined &&
    sources.length > 1 &&
    !endsVideo &&
    lastSource.endSeconds - lastSource.startSeconds <
      MIN_SECONDS_PER_SCENE - TIME_EPSILON
  const sourceCount = mergesLastSource ? sources.length - 1 : sources.length
  const sourceBoundaries = starts.slice(1, sourceCount)
  if (!hasRest) return { sourceCount, sourceBoundaries, restBoundaries: [] }

  if (sources.length === 0)
    return {
      sourceCount,
      sourceBoundaries,
      rest: span,
      restBoundaries: starts.slice(1),
    }

  return {
    sourceCount,
    sourceBoundaries: [...sourceBoundaries, starts[sources.length]],
    rest: { startSeconds: starts[sources.length], endSeconds: span.endSeconds },
    restBoundaries: starts.slice(sources.length + 1),
  }
}

// La cantidad pedida con prefijo, como el corte sin avatar: las fuentes de
// todos los tramos se descuentan primero y lo que queda se reparte solo entre
// los restos posteriores al prefijo, por promedios mayores y con cada resto
// entre una escena cada MAX_SECONDS_PER_SCENE y una cada MIN_SECONDS_PER_SCENE
// (los límites de planPrefixSceneWindows). Así, confirmar la cantidad
// sugerida (la del corte automático) corta exactamente esa cantidad.
function allocateRestScenes(
  layouts: readonly PrefixLayout[],
  freeSceneCount: number,
): number[] {
  const requested = Number.isFinite(freeSceneCount)
    ? Math.round(freeSceneCount)
    : 0
  const sources = layouts.reduce(
    (total, layout) => total + layout.sourceCount,
    0,
  )
  const lengths = layouts.map((layout) => {
    if (!layout.rest) return 0

    return layout.rest.endSeconds - layout.rest.startSeconds
  })
  const minimum = layouts.map((layout, index) => {
    if (!layout.rest) return 0

    return Math.max(
      1,
      Math.ceil(lengths[index] / MAX_SECONDS_PER_SCENE - TIME_EPSILON),
    )
  })
  const maximum = layouts.map((layout, index) => {
    if (!layout.rest) return 0

    return Math.max(minimum[index], sceneCapacity(lengths[index]))
  })

  return allocateByLargestAverage(
    lengths,
    requested - sources,
    minimum,
    maximum,
  )
}

// Reparte las escenas libres del carril clásico: una por tramo y cada una de
// las que sobran por promedios mayores. Hasta la capacidad de los tramos
// (automaticFreeSceneCount), ninguna imagen dura menos de
// MIN_SECONDS_PER_SCENE; una cantidad mayor da escenas más cortas, como el
// corte sin avatar.
function allocateFreeScenes(
  free: readonly SpanWindow[],
  freeSceneCount: number,
): number[] {
  const lengths = free.map((span) => span.endSeconds - span.startSeconds)
  const requested = Number.isFinite(freeSceneCount)
    ? Math.round(freeSceneCount)
    : 0

  return allocateByLargestAverage(
    lengths,
    requested,
    lengths.map(() => 1),
    lengths.map(() => Number.POSITIVE_INFINITY),
  )
}

// Promedios mayores (D'Hondt): parte de `minimum` escenas por tramo y cada una
// de las que faltan para `total` va al tramo donde la escena resultante dura
// más (con empate, el anterior), sin pasar su `maximum`. Es proporcional a la
// duración y deja la escena más corta lo más larga posible. Si ningún tramo
// admite más, se queda corto; si `total` no alcanza los mínimos, da los
// mínimos. Determinista.
function allocateByLargestAverage(
  lengths: readonly number[],
  total: number,
  minimum: readonly number[],
  maximum: readonly number[],
): number[] {
  const counts = [...minimum]
  let left = total - counts.reduce((sum, count) => sum + count, 0)
  while (left > 0) {
    const best = largestAverageIndex(lengths, counts, maximum)
    if (best === undefined) break

    counts[best]++
    left--
  }

  return counts
}

// El tramo donde una escena más duraría más (con empate, el anterior), entre
// los que no llegaron a su máximo; undefined si ninguno admite otra.
function largestAverageIndex(
  lengths: readonly number[],
  counts: readonly number[],
  maximum: readonly number[],
): number | undefined {
  let best: number | undefined
  for (let index = 0; index < counts.length; index++) {
    if (counts[index] >= maximum[index]) continue

    if (best === undefined) {
      best = index
      continue
    }

    const average = lengths[index] / (counts[index] + 1)
    const bestAverage = lengths[best] / (counts[best] + 1)
    if (average > bestAverage + TIME_EPSILON) best = index
  }

  return best
}

// Las fuentes del prefijo animado son las escenas libres que empiezan antes de
// su fin: llevan el pedido de 6 s, como en el corte sin avatar (ADR-0045). Una
// escena de avatar nunca: Kie no la anima (diseño §7.4).
function withPrefixMarks(scenes: Scene[], prefixEndSeconds: number): Scene[] {
  return scenes.map((scene) => {
    if (scene.avatar) return scene
    if ((scene.startSeconds ?? 0) >= prefixEndSeconds - TIME_EPSILON)
      return scene

    return {
      ...scene,
      animationRequestedSeconds: ANIMATION_PREFIX_SCENE_SECONDS,
    }
  })
}
