import type { ApiKeys } from '../../config/api-keys.ts'
import type {
  GenerateVoicePayload,
  ListVoicesFilters,
  ListVoicesResult,
  VoiceProviderId,
  VoiceVendorId,
} from '../../types/voices.ts'
import type { AudioDownload } from './dubvoice.ts'
import type { VoiceRequestCheckpoint } from './request-checkpoint.ts'

// Contrato de un motor de voz: lo que los commands (listar, generar, probe) y
// la stage de narración necesitan saber, sin ramificar por proveedor.

export interface ListVoicesInput {
  apiKey: string
  filters: ListVoicesFilters
  signal?: AbortSignal
}

export interface SynthesisProgress {
  percent: number
  status: string
  elapsedSeconds: number
}

export interface SynthesizeInput {
  checkpoint?: VoiceRequestCheckpoint
  payload: GenerateVoicePayload
  text: string
  apiKey: string
  signal?: AbortSignal
  // Trozos vecinos cuando el texto viene troceado (chunked-synthesis): solo
  // ElevenLabs directo los usa para la continuidad entre partes; el resto los
  // ignora.
  previousText?: string
  nextText?: string
  // Solo lo llaman los motores con progreso real (reportsProgress); para los
  // demás, chunked-synthesis corre un heurístico por parte.
  onProgress?(progress: SynthesisProgress): void
}

export interface TtsProvider {
  id: VoiceProviderId
  // Quién factura y con qué clave: DubVoice (agregador) o ElevenLabs directo.
  vendor: VoiceVendorId
  // Nombre del carril en los logs de la cascada de narración.
  laneName: string
  // Tope de texto por llamada al proveedor: todo texto más largo se trocea y
  // se concatena (chunked-synthesis). Depende del motor y, en ElevenLabs
  // directo, del modelo del payload. El tope TOTAL es TTS_TEXT_CHAR_LIMIT.
  chunkCharLimit(payload: GenerateVoicePayload): number
  // Si el proveedor informa avance real; el resto usa un heurístico por parte.
  reportsProgress: boolean
  // Permite retomar por id; sin esta capacidad, una cancelación espera el
  // audio de la parte ya enviada antes de detener el resto del trabajo.
  supportsTaskResume?: boolean
  // Qué clave del keychain usa este motor. Es el ÚNICO lugar donde se lee
  // apiKeys.<vendor>: commands y stage nunca eligen la clave a mano.
  apiKeyOf(apiKeys: ApiKeys): string | undefined
  listVoices(input: ListVoicesInput): Promise<ListVoicesResult>
  // Endpoint de LISTADO para el pre-flight: ejercita auth y salud del
  // servicio sin generar audio ni facturar.
  probeRequest(apiKey: string): { url: string; init: RequestInit }
  synthesize(input: SynthesizeInput): Promise<AudioDownload>
  // Carriles alternativos para la narración, en orden, por id del registro
  // (declararlos por id evita imports circulares entre motores). Cada uno se
  // ofrece solo si el usuario tiene su clave. Sirven con el MISMO voiceId:
  // solo tiene sentido entre motores que comparten catálogo (ElevenLabs vía
  // DubVoice ↔ ElevenLabs directo).
  fallbackProviderIds?: VoiceProviderId[]
}
