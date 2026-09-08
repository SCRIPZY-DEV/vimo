import type { ApiKeys } from '../../config/api-keys.ts'
import type {
  GenerateVoicePayload,
  ListVoicesFilters,
  ListVoicesResult,
  VoiceProviderId,
  VoiceVendorId,
} from '../../types/voices.ts'
import type { AudioDownload } from './dubvoice.ts'

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
  payload: GenerateVoicePayload
  text: string
  apiKey: string
  signal?: AbortSignal
  // Solo lo llaman los motores con progreso real; ver reportsProgress.
  onProgress?(progress: SynthesisProgress): void
}

export interface TtsProvider {
  id: VoiceProviderId
  // Quién factura y con qué clave: DubVoice (agregador) o ElevenLabs directo.
  vendor: VoiceVendorId
  // Nombre del carril en los logs de la cascada de narración.
  laneName: string
  // Tope de texto por llamada al proveedor; espejado en la UI
  // (src/modules/voices/constants.ts).
  requestCharLimit: number
  // Si una narración más larga que el tope se trocea y se concatena en vez de
  // fallar.
  chunksLongText: boolean
  // Si el proveedor informa avance real; el resto usa la curva sintética.
  reportsProgress: boolean
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
