import type { AnimationUnit } from '@pipeline/animation/planner.ts'
import type { SceneAnimationView } from '@pipeline/types/animation.ts'
import type { SceneView } from '@/modules/videos/types/create'

export interface PipelineAnimationCard {
  id: string
  unit: AnimationUnit
  scene: SceneView
  animation?: SceneAnimationView
}
