// Ids de proveedor de imagen. Están acá y no en images.ts para que `src/` los
// pueda importar: images.ts usa Buffer y otras APIs de Node, y el tsconfig del
// navegador no declara `types: node`. Mismo criterio que stage-id.ts vs stage.ts.
export type ImageProviderId = 'fal' | 'evolink'

// Modelos de Fal que el catálogo del origen expone (Evolink sirve un único
// modelo, gpt-image-2, así que no necesita selector).
export type FalImageModelId = 'gpt-image-2' | 'flux-schnell'

export type ImageExtension = 'jpg' | 'png' | 'webp'
