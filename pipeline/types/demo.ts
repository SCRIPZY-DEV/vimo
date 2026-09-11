import type { VideoFormat } from './video-format.ts'
import type { VoiceProviderId } from './voices.ts'

// Contrato del modo demo (ADR-0029; pack v3 y audio por historia en
// ADR-0030). Browser-safe: la UI lo consume solo con `import type`. El
// manifest ya viene traducido al formato nativo — el pack publicado (claves
// en español) se lee en commands/demo/pack.ts y nunca cruza este borde crudo.

export interface DemoVoice {
  provider: VoiceProviderId
  voiceId: string
  name: string
}

// Una historia del pack: la de un estilo del catálogo (id = CharacterStyleId
// con carpeta propia en el pack) o la de la gema.
export interface DemoStyleEntry {
  id: string
  suggestedName: string
  // Contenido de guion.txt: el formulario lo muestra tal cual.
  script: string
  sceneCount: number
  audioDurationSeconds: number
  // Ruta absoluta del audio.mp3 de la historia dentro del pack instalado:
  // «Subir mi audio» lo muestra ya cargado en demo (ADR-0030).
  audioFile: string
}

// Las historias de un formato: una por estilo del catálogo y la de la gema.
export interface DemoStories {
  styles: DemoStyleEntry[]
  customStyle: DemoStyleEntry
}

// Historias por formato. 16:9 viene en todo pack (v2 en adelante); 9:16 llega
// con el pack v3 — sin él, Short sigue en «Próximamente» dentro de la demo.
export type DemoStoriesByFormat = {
  '16:9': DemoStories
} & Partial<Record<VideoFormat, DemoStories>>

export interface DemoManifest {
  version: string
  voice: DemoVoice
  stories: DemoStoriesByFormat
  // Id de la gema sembrada en `_styles/<id>/` (la galería la lista con él).
  customStyleId: string
}

export interface DemoStatusResult {
  ready: boolean
  version: string
  // Solo con ready: lo que Crear necesita para pre-llenarse.
  manifest?: DemoManifest
}

export interface DemoPrepareResult {
  manifest: DemoManifest
}
