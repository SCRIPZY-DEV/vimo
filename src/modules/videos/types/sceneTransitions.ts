import type { SceneDetail } from '@pipeline/types/video-project.ts'

export interface SceneTransitionTarget {
  // La preferencia se guarda en la escena que entra al fundido.
  id: number
  fromSceneId: number
  startSeconds: number
  enabled: boolean
}

export interface SceneTransitionSelection {
  allTargets: SceneTransitionTarget[]
  selectedTarget: SceneTransitionTarget | null
  selectedSceneNumber: number | undefined
  nextSceneNumber: number | undefined
  selectedEnabled: boolean
  selectedAvailable: boolean
  selectedAutomatic: boolean
}

export interface UseSceneTransitionsOptions {
  projectId: string
  scenes: SceneDetail[]
  selectedSceneId?: number | null
}

export interface SceneTransitionChange {
  projectId: string
  value: boolean
  targets: SceneTransitionTarget[]
}
