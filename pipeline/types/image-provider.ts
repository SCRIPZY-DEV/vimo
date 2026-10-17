// Ids de proveedor de imagen. Están acá y no en images.ts para que `src/` los
// pueda importar: images.ts usa Buffer y otras APIs de Node, y el tsconfig del
// navegador no declara `types: node`. Mismo criterio que stage-id.ts vs stage.ts.
export type ImageProviderId = 'fal' | 'evolink' | 'flow'
export type PaidImageProviderId = Exclude<ImageProviderId, 'flow'>
export const FLOW_IMAGE_MODEL = 'HARBOR_SEAL'

// Ambos proveedores generan con gpt-image-2 (ADR-0015): no hay elección de
// modelo. El id se estampa en cada escena como dato de diagnóstico.
export const IMAGE_MODEL = 'gpt-image-2'

export type ImageExtension = 'jpg' | 'png' | 'webp'

// Solo una confirmación explícita de UI permite reemplazar un lote terminado
// sin resultado; el UUID hace idempotente la confirmación al reabrir.
export interface FlowRestartRequest {
  flowRestartRequestId?: string
  flowAcknowledgeDuplicateRisk?: boolean
}
