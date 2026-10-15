import {
  firstSceneOf,
  lastSceneOf,
  timelineBlocks,
} from '@/modules/videos/utilities/timelineBlocks'
import type { TimelineBlock } from '@/modules/videos/utilities/timelineBlocks'
import { timelineTransitionFrames } from '@/modules/videos/utilities/timelineTransitionFrames'
import type {
  SceneTransitionSelection,
  SceneTransitionTarget,
} from '@/modules/videos/types/sceneTransitions'
import type { SceneDetail } from '@pipeline/types/video-project.ts'

function withStaticTransition(
  block: TimelineBlock,
  enabled: boolean,
): TimelineBlock {
  return block.kind === 'clip'
    ? block
    : { ...block, scene: { ...block.scene, staticTransitionIn: enabled } }
}

function editableTarget(
  previous: TimelineBlock,
  next: TimelineBlock,
): SceneTransitionTarget | null {
  const from = lastSceneOf(previous)
  const to = firstSceneOf(next)
  if (from.id === to.id) return null
  // La misma política del visor determina contigüidad, duración y fundidos
  // automáticos. Un clip listo a cualquier lado no se puede desactivar con
  // la preferencia estática, por lo que no se ofrece un interruptor falso.
  if (timelineTransitionFrames(previous, withStaticTransition(next, false)))
    return null
  if (!timelineTransitionFrames(previous, withStaticTransition(next, true)))
    return null
  return {
    id: to.id,
    fromSceneId: from.id,
    startSeconds: next.startSeconds,
    enabled: to.staticTransitionIn === true,
  }
}

export function sceneTransitionSelection(
  scenes: SceneDetail[],
  selectedSceneId?: number | null,
): SceneTransitionSelection {
  const timedScenes = scenes.filter(
    (scene) =>
      Number.isFinite(scene.startSeconds) &&
      Number.isFinite(scene.endSeconds) &&
      scene.endSeconds! > scene.startSeconds!,
  )
  const blocks = timelineBlocks(timedScenes, {})
  const boundaries = blocks.map((next, index) =>
    index === 0 ? null : editableTarget(blocks[index - 1], next),
  )
  const allTargets = [
    ...new Map(
      boundaries
        .filter((target): target is SceneTransitionTarget => target !== null)
        .map((target) => [target.id, target]),
    ).values(),
  ]

  // La selección actual es de escena, no de fragmento: buscar su última
  // aparición evita editar una unión interna de clip y resto estático.
  let selectedIndex = blocks.findLastIndex((block) =>
    block.kind === 'clip'
      ? block.scenes.some((scene) => scene.id === selectedSceneId)
      : block.scene.id === selectedSceneId,
  )
  // Un clip fusionado puede terminar dentro de su última escena. La
  // selección incluye esa escena completa: avanzar hasta su borde externo.
  while (
    selectedIndex >= 0 &&
    blocks[selectedIndex + 1] &&
    lastSceneOf(blocks[selectedIndex]).id ===
      firstSceneOf(blocks[selectedIndex + 1]).id
  )
    selectedIndex++

  const previous = blocks[selectedIndex]
  const next = selectedIndex < 0 ? undefined : blocks[selectedIndex + 1]
  const selectedTarget = next ? boundaries[selectedIndex + 1] : null
  const selectedEnabled =
    previous && next ? timelineTransitionFrames(previous, next) > 0 : false
  const selectedAutomatic =
    previous && next
      ? timelineTransitionFrames(previous, withStaticTransition(next, false)) >
        0
      : false
  return {
    allTargets,
    selectedTarget,
    selectedSceneNumber: previous ? lastSceneOf(previous).id : undefined,
    nextSceneNumber: next ? firstSceneOf(next).id : undefined,
    selectedEnabled,
    selectedAvailable: selectedTarget !== null,
    selectedAutomatic,
  }
}
