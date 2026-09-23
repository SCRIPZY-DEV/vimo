import type { CreditsDomain } from '@/modules/common/types/credits'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'
import type { VideoProviderId } from '@pipeline/types/video-provider.ts'
import type { VoiceVendorId } from '@pipeline/types/voices.ts'

// El rechazo por saldo de un job de Create, tal como lo guarda la tarea.
export interface CreditsIssueView {
  code: string
  domain: CreditsDomain
}

// Lo necesario para saber a QUÉ cuenta le falta saldo: el dominio y, para
// imagen, voz y animación, el proveedor elegido en el proyecto.
export interface CreditsIssueContext {
  domain: CreditsDomain
  imageProvider: ImageProviderId | null
  voiceVendor: VoiceVendorId | null
  videoProvider: VideoProviderId | null
}
