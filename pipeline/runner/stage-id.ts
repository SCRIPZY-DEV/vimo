// Fases del pipeline completo (ADR-0010), separadas del contrato Stage para
// que los eventos (que la app importa con `import type`) no arrastren al
// resto del runner —que usa APIs de Node— dentro del proyecto del navegador.
export const STAGE_IDS = [
  'voice',
  'transcription',
  'scene-cuts',
  'scene-prompts',
  'images',
  'render',
] as const

export type StageId = (typeof STAGE_IDS)[number]
