import { PipelineFailure } from '../runner/failure.ts'
import type { Scene } from '../types/scenes.ts'
import type { SoundEffectInstance } from '../types/sound-effects.ts'
import type { VideoProjectMetadata } from '../types/video-project.ts'
import { CLICK_EFFECT_DURATION_SECONDS } from './click-effect.ts'

const INSTANCE_ID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const MAX_INSTANCES = 2000
const TIME_TOLERANCE_SECONDS = 0.000001

export function soundEffectsTimelineSeconds(
  metadata: VideoProjectMetadata,
  scenes: Scene[],
): number {
  const duration = metadata.audioDurationSeconds
  return Math.max(
    Number.isFinite(duration) && duration! > 0 ? duration! : 0,
    ...scenes.map((scene) => {
      const end = scene.endSeconds
      return Number.isFinite(end) && end! > 0 ? end! : 0
    }),
  )
}

// Las anclas se resuelven en cada lectura/render: recortar mueve el sonido,
// borrar la escena quita su aparición. Las posiciones manuales no se recortan.
// Un dato manual guardado que ya no cabe tras acortar la narración se omite;
// un nuevo pedido manual fuera del video se rechaza antes de escribir nada.
// Las anclas conservan cada cambio de escena hasta el final del video: su
// fuente sigue completa, pero el límite del video puede cortar la cola.
export function resolveSoundEffects(
  value: unknown,
  scenes: Scene[],
  durationSeconds: number,
  strict = false,
): SoundEffectInstance[] {
  const fail = (): void => {
    if (strict)
      throw new PipelineFailure(
        'invalid_payload',
        'Invalid sound effect instances',
      )
  }
  if (value === undefined && !strict) return []
  if (!Array.isArray(value) || value.length > MAX_INSTANCES) {
    fail()
    return []
  }

  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]))
  const ids = new Set<string>()
  const anchors = new Set<number>()
  const resolved: SoundEffectInstance[] = []
  for (const item of value) {
    if (!isSoundEffect(item) || ids.has(item.id)) {
      fail()
      continue
    }
    ids.add(item.id)
    let startSeconds = item.startSeconds
    if (item.transitionSceneId !== undefined) {
      if (anchors.has(item.transitionSceneId)) {
        fail()
        continue
      }
      anchors.add(item.transitionSceneId)
      const anchor = sceneById.get(item.transitionSceneId)?.startSeconds
      // El primer bloque no es una transición. Una escena borrada tampoco
      // deja un click huérfano en su posición anterior.
      if (!Number.isFinite(anchor) || anchor! <= 0) continue
      startSeconds = anchor!
    }
    if (item.transitionSceneId !== undefined) {
      if (startSeconds >= durationSeconds) continue
    } else if (
      startSeconds + CLICK_EFFECT_DURATION_SECONDS >
      durationSeconds + TIME_TOLERANCE_SECONDS
    ) {
      fail()
      continue
    }
    resolved.push({
      id: item.id,
      effectId: item.effectId,
      startSeconds,
      ...(item.volume !== undefined ? { volume: item.volume } : {}),
      ...(item.transitionSceneId !== undefined
        ? { transitionSceneId: item.transitionSceneId }
        : {}),
    })
  }
  return resolved.sort((left, right) => left.startSeconds - right.startSeconds)
}

function isSoundEffect(value: unknown): value is SoundEffectInstance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Partial<SoundEffectInstance>
  return (
    typeof item.id === 'string' &&
    INSTANCE_ID.test(item.id) &&
    item.effectId === 'click' &&
    typeof item.startSeconds === 'number' &&
    Number.isFinite(item.startSeconds) &&
    item.startSeconds >= 0 &&
    (item.volume === undefined ||
      (typeof item.volume === 'number' &&
        Number.isFinite(item.volume) &&
        item.volume >= 0 &&
        item.volume <= 2)) &&
    (item.transitionSceneId === undefined ||
      (Number.isSafeInteger(item.transitionSceneId) &&
        item.transitionSceneId > 0))
  )
}
