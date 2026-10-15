import type { SoundEffectInstance } from '@pipeline/types/sound-effects.ts'
import type { SceneDetail } from '@pipeline/types/video-project.ts'

export interface ProjectSoundEffectsOptions {
  projectId: string
  scenes: SceneDetail[]
  storedInstances?: SoundEffectInstance[]
  durationSeconds: number
}

export interface PendingProjectSoundEffects {
  projectId: string
  instances: SoundEffectInstance[]
}
