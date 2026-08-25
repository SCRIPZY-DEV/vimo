import type { ApiKeys } from '../../config/api-keys.ts'
import type {
  GenerateVoicePayload,
  ListVoicesFilters,
  ListVoicesResult,
  VoiceProviderId,
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

// Carril alternativo cuando el principal (DubVoice) está caído: usa la clave
// propia del usuario, así que sin ella no se ofrece.
export interface DirectFallback {
  name: string
  apiKeyOf(apiKeys: ApiKeys): string | undefined
  synthesize(input: SynthesizeInput): Promise<AudioDownload>
}

export interface TtsProvider {
  id: VoiceProviderId
  // Nombre del carril en los logs de la cascada de narración.
  laneName: string
  // Tope de texto por llamada al proveedor; espejado en la UI
  // (src/modules/voices/constants.ts).
  requestCharLimit: number
  // Si una narración más larga que el tope se trocea y se concatena en vez de
  // fallar. Hoy solo Minimax lo soporta.
  chunksLongText: boolean
  // Si el proveedor informa avance real; el resto usa la curva sintética.
  reportsProgress: boolean
  listVoices(input: ListVoicesInput): Promise<ListVoicesResult>
  // Endpoint de LISTADO para el pre-flight: ejercita auth y salud del
  // servicio sin generar audio ni facturar.
  probeRequest(apiKey: string): { url: string; init: RequestInit }
  synthesize(input: SynthesizeInput): Promise<AudioDownload>
  directFallback?: DirectFallback
}
