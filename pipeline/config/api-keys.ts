// Identificadores de proveedores de IA. Espejo del catálogo de la app
// (src/modules/api-keys/providers.ts) y de src-tauri/src/api_keys/provider.rs:
// los tres deben declarar los mismos ids.
export type ProviderId =
  'deepinfra' | 'fal' | 'evolink' | 'dubvoice' | 'elevenlabs' | 'deepgram'

// Claves BYO del usuario, inyectadas por Rust desde la fuente de claves
// (ADR-0011). Solo viajan dentro del PipelineJob por stdin; nada en pipeline/
// las lee del entorno del proceso ni las persiste.
export type ApiKeys = Partial<Record<ProviderId, string>>
