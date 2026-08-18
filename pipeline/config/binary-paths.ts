// Rutas absolutas a los binarios que viajan con Tauri como externalBin.
// Rust las resuelve por plataforma y las inyecta en el PipelineJob; el
// pipeline nunca asume que un binario está en el PATH (ADR-0010: la Fase 0
// de descarga de binarios desaparece).
export interface BinaryPaths {
  ffmpeg?: string
  // Diferida en ADR-0010: si yt-dlp sigue siendo la vía para BGM/overlay.
  ytDlp?: string
}
