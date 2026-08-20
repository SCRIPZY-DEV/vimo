import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type {
  CharacterCreatePayload,
  CharacterCreateResult,
} from '../../types/characters.ts'
import {
  AGE_LIMIT,
  DESCRIPTION_LIMIT,
  MIN_DESCRIPTION_LENGTH,
  NAME_LIMIT,
  ROLE_LIMIT,
  applyNewPreviews,
  charactersRoot,
  newCharacterId,
  toCharacterSummary,
  writeCharacterMetadata,
  type StoredCharacterMetadata,
} from './character-library.ts'

// Crea un personaje en la biblioteca con su identidad y los previews que el
// usuario ya generó.
export async function characterCreate(
  context: PipelineContext,
): Promise<CharacterCreateResult> {
  const payload = context.job.payload as CharacterCreatePayload | undefined
  const name = payload?.name?.trim()
  if (!name)
    throw new PipelineFailure('invalid_payload', 'payload.name is required')

  const description = payload?.description?.trim() ?? ''
  if (description.length < MIN_DESCRIPTION_LENGTH)
    throw new PipelineFailure(
      'invalid_payload',
      `payload.description must be at least ${MIN_DESCRIPTION_LENGTH} characters`,
    )

  const directory = charactersRoot(context)
  const id = newCharacterId(name)
  const entryDirectory = join(directory, id)
  await mkdir(entryDirectory, { recursive: true })

  const metadata: StoredCharacterMetadata = {
    name: name.slice(0, NAME_LIMIT),
    description: description.slice(0, DESCRIPTION_LIMIT),
    createdAt: new Date().toISOString(),
    previews: await applyNewPreviews(
      entryDirectory,
      [],
      payload?.previews ?? [],
    ),
  }
  const age = payload?.age?.trim()
  if (age) metadata.age = age.slice(0, AGE_LIMIT)
  const role = payload?.role?.trim()
  if (role) metadata.role = role.slice(0, ROLE_LIMIT)

  await writeCharacterMetadata(entryDirectory, metadata)

  return { entry: await toCharacterSummary(entryDirectory, id, metadata) }
}
