import { vendorOfProvider } from '@/modules/voices/utilities/vendorOfProvider'
import type {
  ApiKeyProviderId,
  ApiKeyRequirement,
} from '@/modules/common/types/apiKeys'
import type { CreateFormValue } from '@/modules/videos/types/create'
import type { VoiceVendorId } from '@pipeline/types/voices.ts'

// Ambos carriles de prompts usan DeepInfra y transcriben con Deepgram.
// La voz elegida manda; hasta elegirla se usa la preferencia efectiva del picker.
export function createApiRequirements(
  form: CreateFormValue,
  defaultVoiceVendor: VoiceVendorId,
): ApiKeyRequirement[] {
  const providers = new Set<ApiKeyProviderId>(['deepinfra', 'deepgram'])
  if (form.imageProvider !== 'flow') providers.add(form.imageProvider)
  if (form.narrationMode === 'tts') {
    const voiceVendor = form.voice
      ? vendorOfProvider(form.voice.provider)
      : defaultVoiceVendor
    providers.add(voiceVendor)
  }
  if (form.animateScenes) providers.add('kie')
  if (form.useBgm && form.bgmMode === 'evolink-ai') providers.add('evolink')
  return [...providers].map((provider) => [provider])
}
