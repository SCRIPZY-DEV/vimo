import { rm } from 'node:fs/promises'
import { join } from 'node:path'

import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type {
  CharacterUpdatePayload,
  CharacterUpdateResult,
} from '../../types/characters.ts'
import {
  AGE_LIMIT,
  DESCRIPTION_LIMIT,
  MIN_DESCRIPTION_LENGTH,
  NAME_LIMIT,
  ROLE_LIMIT,
  applyNewPreviews,
  assertValidCharacterId,
  charactersRoot,
  readCharacterMetadata,
  readPhotoFile,
  toCharacterSummary,
  writeCharacterMetadata,
  writePhotoFile,
} from './character-library.ts'

// Edita un personaje existente. Semántica portada del origen: un nombre vacío
// conserva el anterior, y edad/rol en blanco borran el campo. Con foto la
// descripción puede quedar vacía, y la foto se puede REEMPLAZAR (solo en un
// personaje que ya es «con foto»: el modo no cambia).
export async function characterUpdate(
  context: PipelineContext,
): Promise<CharacterUpdateResult> {
  const payload = context.job.payload as CharacterUpdatePayload | undefined
  if (!payload?.id)
    throw new PipelineFailure('invalid_payload', 'payload.id is required')
  assertValidCharacterId(payload.id)

  const entryDirectory = join(charactersRoot(context), payload.id)
  const metadata = await readCharacterMetadata(entryDirectory)
  if (!metadata)
    throw new PipelineFailure(
      'character_not_found',
      `character "${payload.id}" does not exist`,
    )

  const name = payload.name?.trim()
  if (name) metadata.name = name.slice(0, NAME_LIMIT)

  if (payload.description !== undefined) {
    const description = payload.description.trim()
    if (!metadata.photoFile && description.length < MIN_DESCRIPTION_LENGTH)
      throw new PipelineFailure(
        'invalid_payload',
        `payload.description must be at least ${MIN_DESCRIPTION_LENGTH} characters`,
      )
    metadata.description = description.slice(0, DESCRIPTION_LIMIT)
  }

  if (payload.age !== undefined) {
    const age = payload.age.trim()
    if (age) metadata.age = age.slice(0, AGE_LIMIT)
    else delete metadata.age
  }
  if (payload.role !== undefined) {
    const role = payload.role.trim()
    if (role) metadata.role = role.slice(0, ROLE_LIMIT)
    else delete metadata.role
  }

  if (payload.previews?.length)
    metadata.previews = await applyNewPreviews(
      entryDirectory,
      metadata.previews ?? [],
      payload.previews,
    )

  // Reemplazo de la foto: la nueva se escribe ANTES de borrar la vieja, así
  // nunca hay un instante sin foto en disco; con el nombre nuevo, la tarjeta,
  // el picker y el chip de la gema la ven al volver a leer la biblioteca.
  if (payload.photoPath !== undefined) {
    if (!metadata.photoFile)
      throw new PipelineFailure(
        'invalid_payload',
        'only photo characters can replace their photo',
      )
    const photo = await readPhotoFile(payload.photoPath.trim())
    const previousFile = metadata.photoFile
    metadata.photoFile = await writePhotoFile(entryDirectory, photo)
    if (previousFile !== metadata.photoFile)
      await rm(join(entryDirectory, previousFile), { force: true })
  }

  await writeCharacterMetadata(entryDirectory, metadata)

  return {
    entry: await toCharacterSummary(entryDirectory, payload.id, metadata),
  }
}
