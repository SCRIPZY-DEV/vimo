// Por qué quedó bloqueado un modelo: no avanzó en la fase de prompts, o
// devolvió códigos de error del proveedor.
export type PromptModelBlockReason = 'stalled' | 'error'

export interface PromptModelBlock {
  modelId: string
  reason: PromptModelBlockReason
  // Epoch ms; vencido = ya no bloquea.
  blockedUntil: number
}
