// Los GB que muestra la puerta de la demo, con un decimal. GB de 1000³ bytes,
// como los cuenta el Finder; en Windows, que llama «GB» a 1024³, la cifra
// queda un poco por encima de lo que se ve en el disco, que para el espacio
// pedido es el lado seguro. Puro: lo prueba check-demo-gate.mjs, así que la
// unidad vive acá y no en constants.ts (Node no resuelve el alias `@/`).

// Un décimo de GB: contar en décimos enteros evita el error de la coma
// flotante al redondear (1,1 GB × 10 da 11,000000000000002).
const BYTES_PER_TENTH_GIGABYTE = 100_000_000

// Lo que pesa la descarga: el décimo más cercano.
export function demoDownloadGigabytes(bytes: number): number {
  return Math.round(bytes / BYTES_PER_TENTH_GIGABYTE) / 10
}

// El espacio libre que hace falta: hacia arriba, así liberar lo que dice el
// aviso siempre alcanza.
export function demoRequiredGigabytes(bytes: number): number {
  return Math.ceil(bytes / BYTES_PER_TENTH_GIGABYTE) / 10
}

// En el formato del idioma activo: «3,3» en español y portugués, «3.3» en
// inglés; un número entero va sin decimal.
export function formatGigabytes(
  gigabytes: number,
  locale: string | undefined,
): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
    gigabytes,
  )
}
