import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { toDataUri, validateImageBytes } from '../providers/image/download.ts'
import type { ProjectCharacter } from '../types/video-project.ts'
import type { ProjectPaths } from './paths.ts'

// Personajes del proyecto listos para el pipeline: identidad canónica + su
// referencia visual como data URI (la foto subida o el preview del estilo
// copiado por create-video-project). Port acotado de prepararPersonaje: acá
// la referencia ya quedó resuelta DENTRO del proyecto al crearlo, así que no
// hay búsqueda por estilo ni fallbacks de nombres históricos.

export interface PipelineCharacter {
  name: string
  description: string
  // Ausente si la referencia no se pudo leer: la identidad viaja solo como
  // texto y el estilo del video manda (mismo degradado que el origen).
  imageDataUri?: string
}

export async function loadPipelineCharacters(
  paths: ProjectPaths,
  characters: ProjectCharacter[] | undefined,
): Promise<PipelineCharacter[]> {
  const list = (characters ?? []).filter((character) => character.name?.trim())

  const loaded: PipelineCharacter[] = []
  for (const character of list) {
    const entry: PipelineCharacter = {
      name: character.name.trim(),
      description: character.description?.trim() ?? '',
    }

    if (character.referenceImageFile) {
      const imagePath = join(
        paths.charactersDirectory,
        character.referenceImageFile,
      )
      const dataUri = await readImageAsDataUri(imagePath)
      if (dataUri) entry.imageDataUri = dataUri
    }

    loaded.push(entry)
  }

  return loaded
}

// También la usan las muestras de «Mi estilo», que leen la referencia directo
// de la biblioteca (no hay proyecto todavía).
export async function readImageAsDataUri(
  imagePath: string,
): Promise<string | undefined> {
  try {
    const bytes = await readFile(imagePath)
    const image = validateImageBytes(bytes)
    if (!image) return undefined
    return toDataUri(image)
  } catch {
    return undefined
  }
}
