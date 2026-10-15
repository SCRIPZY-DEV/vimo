// Contrato compartido del editor y el sidecar. El audio es propio del catálogo:
// ninguna instancia acepta rutas, URLs, recortes ni duraciones arbitrarias.
export type SoundEffectId = 'click'

export interface SoundEffectInstance {
  id: string
  effectId: SoundEffectId
  startSeconds: number
  volume?: number
  // Sigue el comienzo de esta escena. Arrastrar la instancia quita el ancla.
  transitionSceneId?: number
}

export interface SoundEffectDefinition {
  id: SoundEffectId
  durationSeconds: number
  audioDataUri: string
}

export interface SoundEffectsListResult {
  effects: SoundEffectDefinition[]
}

export interface SetProjectSoundEffectsPayload {
  projectId: string
  instances: SoundEffectInstance[]
}

export interface SetProjectSoundEffectsResult {
  instances: SoundEffectInstance[]
}
