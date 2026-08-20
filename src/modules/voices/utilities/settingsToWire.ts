import type {
  VoiceGenerationSettings,
  VoiceProviderId,
} from '@pipeline/types/voices.ts'
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

  if (provider === 'elevenlabs')
    return {
      speed: form.speed,
      stability: form.stability,
      similarityBoost: form.similarity,
      style: form.style,
      useSpeakerBoost: form.speakerBoost,
    }

  return { volumeEdge: form.volumeEdge }
}
