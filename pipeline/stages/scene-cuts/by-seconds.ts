import type { Scene, TranscriptWord } from '../../types/scenes.ts'

// FRAGMENTADOR POR SEGUNDOS — ventanas fijas de reloj, no por frases. Port de
// `motor-web/fragmentos/fragmentador.ts` del origen (carril de estilo
// propio): el usuario elige CUÁNTOS SEGUNDOS dura cada escena y el número
// sale del audio — al revés del corte clásico, donde elige el número y la
// duración sale de la división. La diferencia se ve en el borde: 47.4 s a
// 3 s dan 15 ventanas completas y una última de 2.4 s («lo que sobraba de
// audio»), en vez de 16 escenas de 2.96 s.
//
// Las cuatro reglas (medidas en producción en el origen):
//
//   1. El fragmento `k` va de `k·N` a `(k+1)·N`, sin huecos, cubriendo TODO
//      el audio. Que una frase cruce el corte está bien: la imagen cambia
//      mientras la narración sigue.
//   2. El último se recorta al FIN REAL del audio (la duración medida, no el
//      último timestamp: la cola de silencio también es video que cubrir).
//   3. Cada palabra se asigna ENTERA a la ventana donde cae su PUNTO MEDIO.
//   4. Una ventana sin palabras se absorbe en la anterior, y un resto final
//      corto (< 30 % de la ventana) se fusiona: una escena de 0.4 s es un
//      parpadeo, no una imagen.
//
// Función PURA sobre las palabras ya transcriptas: no lee disco, no llama a
// nadie. Es lo que permite que `preview-scene-cuts` conteste el slider al
// instante y que el pipeline corte DESPUÉS con exactamente el mismo código —
// una sola implementación, así la vista previa no puede mentir.

/** Lo que el usuario puede elegir. El slider se mueve entre estos dos. */
export const MIN_SECONDS_PER_SCENE = 2
export const MAX_SECONDS_PER_SCENE = 15
/** Lo que trae la app si nadie eligió nada (una imagen cada ~3 segundos). */
export const DEFAULT_SECONDS_PER_SCENE = 3

/**
 * Un resto final más corto que esto (proporción de la ventana) se fusiona con
 * el fragmento anterior. El umbral es INCLUSIVO: un resto de exactamente el
 * 30 % sobrevive como escena.
 */
const MINIMUM_LAST_PROPORTION = 0.3

/**
 * Tolerancia de coma flotante. Sin esto, `47.4 / 3` puede dar
 * `15.800000000000002` y `ceil` inventa una ventana fantasma de 0 s.
 */
const EPSILON = 1e-9

/** Milisegundos: más precisión que eso es ruido de la transcripción. */
function roundMs(value: number): number {
  return Math.round(value * 1000) / 1000
}

/**
 * El borde de la ventana `k`. Es la ÚNICA fuente de los cortes, a propósito:
 * calcularlos acumulando (`t += n`) hace que el fin de un fragmento y el
 * inicio del siguiente dejen de ser el mismo número — un hueco de
 * microsegundos que después aparece como un parpadeo en el render.
 */
function windowBoundary(k: number, seconds: number): number {
  return roundMs(k * seconds)
}

function safeNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

/**
 * Dónde termina la línea de tiempo. Recorre TODAS las palabras (una
 * transcripción desordenada dejaría palabras después del final) y usa la
 * duración medida SOLO si es mayor — si fuera menor, dejaría palabras fuera
 * del video.
 */
function resolveAudioEnd(
  words: readonly TranscriptWord[],
  totalDurationSeconds?: number,
): number {
  let wordsEnd = 0
  for (const word of words) {
    const end = safeNumber(word?.end)
    if (end > wordsEnd) wordsEnd = end
  }
  if (
    totalDurationSeconds !== undefined &&
    Number.isFinite(totalDurationSeconds) &&
    totalDurationSeconds > wordsEnd
  )
    return roundMs(totalDurationSeconds)

  return roundMs(wordsEnd)
}

export function clampSecondsPerScene(value: unknown): number {
  const seconds = Math.round(Number(value))
  if (!Number.isFinite(seconds)) return DEFAULT_SECONDS_PER_SCENE
  return Math.min(
    MAX_SECONDS_PER_SCENE,
    Math.max(MIN_SECONDS_PER_SCENE, seconds),
  )
}

/**
 * Parte el audio en ventanas de `seconds`, con las cuatro reglas de arriba, y
 * devuelve directamente la forma que el pipeline persiste en scenes.json.
 * `totalDurationSeconds` es la duración MEDIDA del audio; sin ella (o menor
 * que el último timestamp) se usa el fin de la última palabra.
 */
export function cutScenesBySeconds(
  words: readonly TranscriptWord[],
  seconds: number,
  totalDurationSeconds?: number,
): Scene[] {
  const window = clampSecondsPerScene(seconds)
  if (words.length === 0) return []
  const audioEnd = resolveAudioEnd(words, totalDurationSeconds)
  if (audioEnd <= 0) return []

  const totalWindows = Math.max(1, Math.ceil(audioEnd / window - EPSILON))

  // Regla 3 — cada palabra ENTERA a la ventana donde cae su PUNTO MEDIO.
  // `minimum` es un trinquete: el índice nunca retrocede, así el orden
  // original sobrevive aunque los timestamps vengan levemente desordenados.
  const buckets: string[][] = Array.from({ length: totalWindows }, () => [])
  let minimum = 0
  for (const word of words) {
    const middle = roundMs(
      (safeNumber(word?.start) + safeNumber(word?.end)) / 2,
    )
    const rawIndex = Math.floor(middle / window + EPSILON)
    const index = Math.min(
      totalWindows - 1,
      Math.max(minimum, Number.isFinite(rawIndex) ? rawIndex : minimum),
    )
    buckets[index].push(word.word)
    minimum = index
  }

  const scenes: Scene[] = []
  // Silencio al PRINCIPIO: el primer fragmento arranca igual en 0 (arrastra
  // su inicio) en vez de dejar el video sin imagen la primera ventana.
  let carriedStart: number | null = null

  for (let k = 0; k < totalWindows; k++) {
    const windowStart = windowBoundary(k, window)
    // Regla 2 — solo la ÚLTIMA ventana se recorta; las demás miden exacto.
    const windowEnd =
      k === totalWindows - 1 ? audioEnd : windowBoundary(k + 1, window)

    if (buckets[k].length === 0) {
      // Regla 4b — ventana muda: la absorbe la escena anterior (se queda más
      // tiempo en pantalla). Nunca un hueco ni una escena vacía.
      const previous = scenes[scenes.length - 1]
      if (previous) previous.endSeconds = windowEnd
      else carriedStart = carriedStart ?? windowStart
      continue
    }

    const start = carriedStart ?? windowStart
    carriedStart = null
    scenes.push({
      id: scenes.length + 1,
      text: buckets[k].join(' ').trim(),
      startSeconds: start,
      endSeconds: windowEnd,
    })
  }

  // Regla 4a — resto final corto: se fusiona con el anterior. Umbral
  // INCLUSIVO; una sola pasada alcanza (el fusionado siempre supera el
  // umbral).
  if (scenes.length > 1) {
    const last = scenes[scenes.length - 1]
    if (
      (last.endSeconds ?? 0) - (last.startSeconds ?? 0) <
      window * MINIMUM_LAST_PROPORTION - EPSILON
    ) {
      const previous = scenes[scenes.length - 2]
      previous.text = `${previous.text} ${last.text}`.trim()
      previous.endSeconds = last.endSeconds
      scenes.pop()
    }
  }

  // La numeración queda 1..N sin huecos: es la clave de correspondencia con
  // los prompts y las imágenes.
  return scenes.map((scene, index) => ({ ...scene, id: index + 1 }))
}
