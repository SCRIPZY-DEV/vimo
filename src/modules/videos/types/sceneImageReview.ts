export type SceneReviewTarget = 'image' | 'animation'

// Contrato opcional del timeline; permanece independiente de la galería.
export interface SceneImageReviewRequest {
  sceneId: number
  revision: number
  target?: SceneReviewTarget
}

export interface SceneAnimationReviewOutcome {
  succeeded: boolean
  sceneIds: number[]
}

export interface SceneAnimationReviewAttempt {
  accepted: Promise<boolean>
  result: Promise<SceneAnimationReviewOutcome>
  stopObserving(): void
}
