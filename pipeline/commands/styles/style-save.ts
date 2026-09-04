import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { StyleSavePayload, StyleSaveResult } from '../../types/styles.ts'
import { writeFileAtomic } from '../../utils/atomic-fs.ts'
import {
  MAX_SHOTS,
  STYLE_FILE,
  STYLE_NAME_LIMIT,
  SYSTEM_PROMPT_CHAR_LIMIT,
  assertStyleCharacter,
  assertValidStyleId,
  readStyleEntry,
  styleDirectory,
  type StoredStyle,
} from './style-store.ts'

// Crea o actualiza un estilo propio. Un update conserva el createdAt y las
// muestras existentes (las muestras solo las toca generate-style-samples).
export async function styleSave(
  context: PipelineContext,
): Promise<StyleSaveResult> {
  const payload = context.job.payload as StyleSavePayload | undefined
  if (!payload?.id)
    throw new PipelineFailure('invalid_payload', 'payload.id is required')
  assertValidStyleId(payload.id)

  const name = payload.name?.trim() ?? ''
  if (!name)
    throw new PipelineFailure('invalid_payload', 'payload.name is required')
  if (name.length > STYLE_NAME_LIMIT)
    throw new PipelineFailure('invalid_payload', 'payload.name is too long')

  const systemPrompt = payload.systemPrompt?.trim() ?? ''
  if (!systemPrompt)
    throw new PipelineFailure(
      'invalid_payload',
      'payload.systemPrompt is required',
    )
  if (systemPrompt.length > SYSTEM_PROMPT_CHAR_LIMIT)
    throw new PipelineFailure(
      'invalid_payload',
      `payload.systemPrompt exceeds ${SYSTEM_PROMPT_CHAR_LIMIT} characters`,
    )

  const shots = (payload.shots ?? [])
    .map((shot) => (typeof shot === 'string' ? shot.trim() : ''))
    .filter(Boolean)
  if (shots.length > MAX_SHOTS)
    throw new PipelineFailure(
      'invalid_payload',
      `at most ${MAX_SHOTS} shots per style`,
    )

  if (payload.character !== undefined)
    assertStyleCharacter(payload.character, 'payload.character')

  const directory = styleDirectory(context, payload.id)
  await mkdir(directory, { recursive: true })

  const existing = await readStyleEntry(context, payload.id)
  // Guard v1.19.2 del origen: el bloque de personaje se CONSERVA si esta
  // escritura no lo trae. Quien quiera cambiarlo manda el bloque nuevo (la UI
  // siempre tiene exactamente un modo encendido, así que «volver a genérico»
  // viaja como { mode: 'generic' }, nunca como ausencia). Sin esto, cualquier
  // camino que guarde el estilo sin conocer el campo le borra al usuario, en
  // silencio, la decisión que tomó sobre su protagonista.
  const character = payload.character ?? existing?.character
  const stored: StoredStyle = {
    name,
    systemPrompt,
    shots,
    ...(character ? { character } : {}),
    createdAt: existing?.createdAt || new Date().toISOString(),
  }
  await writeFileAtomic(
    join(directory, STYLE_FILE),
    `${JSON.stringify(stored, null, 2)}\n`,
  )

  const entry = await readStyleEntry(context, payload.id)
  if (!entry)
    throw new PipelineFailure('style_save_failed', 'style.json unreadable')
  return { entry }
}
