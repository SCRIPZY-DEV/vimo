import { IMAGE_PROVIDERS } from '@/modules/videos/constants'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'

// El proveedor de imagen que conviene dejar elegido de entrada: el primero
// del catálogo que tenga clave configurada — Evolink va primero, así que con
// las dos claves gana Evolink; con una sola, esa. Sin ninguna, null: quien
// llama decide qué mostrar (el default del formulario, o nada en el modal).
export function preferredImageProvider(
  configuredProviders: ReadonlySet<string>,
): ImageProviderId | null {
  const provider = IMAGE_PROVIDERS.find((candidate) =>
    configuredProviders.has(candidate.id),
  )
  if (!provider) return null
  return provider.id
}
