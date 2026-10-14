import { VOICE_SETTINGS_DEFAULTS } from '@/modules/voices/constants'
import { settingsForProvider } from '@/modules/voices/utilities/settingsToWire'
import type { SelectedVoice } from '@/modules/videos/types/create'
import type { ReplaceNarrationVoice } from '@pipeline/types/video-project.ts'

// La voz elegida al cambiar de voz tras un fallo, como la guarda el proyecto:
// con los ajustes por defecto de su motor (los del motor anterior no aplican).
export function projectVoiceOf(voice: SelectedVoice): ReplaceNarrationVoice {
  return {
    provider: voice.provider,
    voiceId: voice.voiceId,
    voiceName: voice.name,
    settings: settingsForProvider(voice.provider, VOICE_SETTINGS_DEFAULTS),
  }
}
