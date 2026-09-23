import { readFile } from 'node:fs/promises'

import { toDataUri, validateImageBytes } from '../providers/image/download.ts'

// Lee una imagen del disco como data URI (`data:image/jpeg;base64,…`), que
// es como viaja a un modelo con visión o a un proveedor que acepta base64.
// null si el archivo no existe o no es una imagen que sepamos servir: quien
// llama decide si es un error o si sigue sin ella.
export async function readImageAsDataUri(
  imagePath: string,
): Promise<string | null> {
  try {
    const image = validateImageBytes(await readFile(imagePath))
    return image ? toDataUri(image) : null
  } catch {
    return null
  }
}
