import {
  animationUnitFromBlock,
  planAnimationUnits,
} from '@pipeline/animation/planner.ts'
import { sceneAnimationBlocks } from '@pipeline/animation/scene-blocks.ts'
import type { SceneView } from '@/modules/videos/types/create'
import type { PipelineAnimationCard } from '@/modules/videos/types/pipelineAnimation'

// Al reanudar, un clip reparado en el editor puede cubrir otra agrupación.
// Primero se muestran los archivos reales; solo se planifica lo que falta.
export function pipelineAnimationCards(
  scenes: SceneView[],
): PipelineAnimationCard[] {
  const sources = scenes.filter(
    (scene) => scene.animationRequestedSeconds !== undefined,
  )
  const endSeconds = Math.max(
    0,
    ...sources.map((scene) => scene.endSeconds ?? 0),
  )
  const ready: PipelineAnimationCard[] = []
  for (const scene of scenes) {
    for (const animation of sceneAnimationBlocks(scene)) {
      if (animation.status !== 'ready' || !animation.clipPath) continue
      const unit = animationUnitFromBlock(scene.id, animation, scenes)
      if (unit.startSeconds >= endSeconds) continue
      ready.push({
        id: `${scene.id}:${unit.startSeconds}:${unit.endSeconds}`,
        unit,
        scene,
        animation,
      })
    }
  }
  const plan = planAnimationUnits(
    scenes,
    sources.map((scene) => scene.id),
    [],
    {
      endSeconds,
      coveredIntervals: ready.map((card) => card.unit),
      mergeShortScenes: true,
      pairPrefixScenes: true,
    },
  )
  return [
    ...ready,
    ...plan.units.flatMap((unit) => {
      const scene = scenes.find(
        (candidate) => candidate.id === unit.leadSceneId,
      )
      if (!scene) return []
      return [
        {
          id: `${scene.id}:${unit.startSeconds}:${unit.endSeconds}`,
          unit,
          scene,
        },
      ]
    }),
  ].sort((left, right) => left.unit.startSeconds - right.unit.startSeconds)
}
