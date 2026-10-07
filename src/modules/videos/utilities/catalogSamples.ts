import type {
  CATALOG_SAMPLE_COUNT as APP_CATALOG_SAMPLE_COUNT,
  STYLE_REFERENCES_BASE_PATH as APP_STYLE_REFERENCES_BASE_PATH,
} from '@/modules/videos/constants'
import type {
  CatalogGem,
  CatalogSampleUpload,
} from '@pipeline/types/catalog.ts'

// Las muestras de un estilo del catálogo viven en la app hasta la Entrega 3
// (plan E2, P1): `public/style-references/<id>_<n>.jpg`, como las de los 5
// estilos de siempre. Módulo puro, sin imports de runtime: lo corre
// scripts/test/check-app-catalog-style.mjs con Node, sin bundler.

// Espejos de constants.ts. Node pelado no resuelve el alias `@/`, así que los
// valores se repiten; la anotación con `typeof` obliga a que coincidan.
const SAMPLE_LIMIT: typeof APP_CATALOG_SAMPLE_COUNT = 4
const SAMPLES_BASE_PATH: typeof APP_STYLE_REFERENCES_BASE_PATH =
  '/style-references'

// Lo que «Pasar a mi estilo» le acepta a cada muestra (catalog-style-copy, plan
// E2 §5.3): un JPEG de hasta 4 MiB (MAX_CATALOG_SAMPLE_BYTES en
// pipeline/commands/catalog/catalog-store.ts). Una que no cumple hace que el
// sidecar rechace la copia entera.
const SAMPLE_MAX_BYTES = 4 * 1024 * 1024
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff]
// `String.fromCharCode` con demasiados argumentos desborda la pila: el binario
// se arma por tramos.
const BASE64_CHUNK_BYTES = 0x8000

// Las rutas de las muestras del estilo, de la 1 a `sampleCount`, nunca más de
// las que acepta la copia (un largo negativo, `Array.from` lo deja en 0).
export function catalogSampleImages(gem: CatalogGem): string[] {
  return Array.from(
    { length: Math.min(SAMPLE_LIMIT, gem.sampleCount) },
    (_, index) => `${SAMPLES_BASE_PATH}/${gem.id}_${index + 1}.jpg`,
  )
}

// Una muestra bajada como la pide la copia: `sample-<n>.jpg` en base64, sin el
// prefijo `data:`. Lo que el sidecar rechazaría (vacío, otro formato, la
// página HTML de un archivo que no existe o más de 4 MiB) devuelve null: se
// omite y la copia sale con menos muestras.
export function catalogSampleUpload(
  bytes: Uint8Array,
  number: number,
): CatalogSampleUpload | null {
  if (bytes.length > SAMPLE_MAX_BYTES) return null
  if (!JPEG_SIGNATURE.every((byte, index) => bytes[index] === byte)) return null

  return { file: `sample-${number}.jpg`, base64: base64Of(bytes) }
}

function base64Of(bytes: Uint8Array): string {
  let binary = ''
  for (let start = 0; start < bytes.length; start += BASE64_CHUNK_BYTES)
    binary += String.fromCharCode(
      ...bytes.subarray(start, start + BASE64_CHUNK_BYTES),
    )
  return btoa(binary)
}
