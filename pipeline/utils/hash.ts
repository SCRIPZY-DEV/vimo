// Huella FNV-1a de 32 bits de un texto. Sirve para reconocer «el mismo
// pedido» a un proveedor (misma huella = misma tarea pagada que se puede
// cosechar), no para seguridad.
export function fnv1aHash(text: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}
