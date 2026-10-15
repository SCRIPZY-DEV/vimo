import {
  CLICK_EFFECT_BASE64,
  CLICK_EFFECT_DURATION_SECONDS,
} from '../../audio/click-effect.ts'
import type { SoundEffectsListResult } from '../../types/sound-effects.ts'

export async function listSoundEffects(): Promise<SoundEffectsListResult> {
  return {
    effects: [
      {
        id: 'click',
        durationSeconds: CLICK_EFFECT_DURATION_SECONDS,
        audioDataUri: `data:audio/mpeg;base64,${CLICK_EFFECT_BASE64}`,
      },
    ],
  }
}
