// `String.fromCharCode` con demasiados argumentos desborda la pila: el binario
// se arma por tramos.
const CHUNK_BYTES = 0x8000

// Los bytes de un archivo en base64, sin el prefijo `data:`.
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let start = 0; start < bytes.length; start += CHUNK_BYTES)
    binary += String.fromCharCode(...bytes.subarray(start, start + CHUNK_BYTES))
  return btoa(binary)
}
