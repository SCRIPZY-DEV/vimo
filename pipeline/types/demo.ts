import type { VoiceProviderId } from './voices.ts'

// Contrato del modo demo (ADR-0027). Browser-safe: la UI lo consume solo con
// `import type`. El manifest ya viene traducido al formato nativo — el pack
// publicado (formato v2 del origen, claves en español) se lee en
// commands/demo/pack.ts y nunca cruza este borde crudo.

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
}

export interface DemoManifest {
  version: string
  voice: DemoVoice
  styles: DemoStyleEntry[]
  customStyle: DemoStyleEntry
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
