import type {
  VoiceGenerationSettings,
  VoiceProviderId,
} from '@pipeline/types/voices.ts'
import { isSpeedOnlyEngine } from './isSpeedOnlyEngine'
import { isElevenLabsEngine } from './isElevenLabsEngine'
import type { VoiceSettingsFormValue } from '../types/voices'

export function settingsForProvider(
  provider: VoiceProviderId,
  form: VoiceSettingsFormValue,
): VoiceGenerationSettings {
  if (provider === 'minimax') {
    const settings: VoiceGenerationSettings = {
      speed: form.speed,
      pitch: form.pitch,
      volume: form.volume,
    }
    if (form.emotion) settings.emotion = form.emotion
    return settings
  }

  if (isElevenLabsEngine(provider))
    return {
      speed: form.speed,
      stability: form.stability,
      similarityBoost: form.similarity,
      style: form.style,
      useSpeakerBoost: form.speakerBoost,
    }

  if (isSpeedOnlyEngine(provider)) return { speed: form.speed }

  return { volumeEdge: form.volumeEdge }
}
