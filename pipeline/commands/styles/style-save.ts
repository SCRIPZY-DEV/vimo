import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import {
  GEM_TEMPLATE_VERSION,
  type GemSections,
  type StyleSavePayload,
  type StyleSaveResult,
} from '../../types/styles.ts'
import { writeFileAtomic } from '../../utils/atomic-fs.ts'
import {
  MAX_SHOTS,
  SOURCE_PROMPT_CHAR_LIMIT,
  STYLE_FILE,
  STYLE_NAME_LIMIT,
  SYSTEM_PROMPT_CHAR_LIMIT,
  assertColorFilter,
  assertGemOrigin,
  assertGemSections,
  assertStyleCharacter,
  assertTemplateVersion,
  assertValidStyleId,
  readStyleEntry,
  styleDirectory,
  type StoredStyle,
} from './style-store.ts'

// Lo que define el estilo: el texto de una gema vieja o las secciones de una
// de plantilla (ADR-0048), nunca las dos.
type GemContent = { systemPrompt: string } | { sections: GemSections }

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

  const content = readGemContent(payload)

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
  if (payload.colorFilter !== undefined)
    assertColorFilter(payload.colorFilter, 'payload.colorFilter')
  if (payload.origin !== undefined)
    assertGemOrigin(payload.origin, 'payload.origin')
  if (
    payload.sourcePrompt !== undefined &&
    (typeof payload.sourcePrompt !== 'string' ||
      payload.sourcePrompt.length > SOURCE_PROMPT_CHAR_LIMIT)
  )
    throw new PipelineFailure(
      'invalid_payload',
      `payload.sourcePrompt must be a string of at most ${SOURCE_PROMPT_CHAR_LIMIT} characters`,
    )

  const directory = styleDirectory(context, payload.id)
  await mkdir(directory, { recursive: true })

  const existing = await readStyleEntry(context, payload.id)
  // Guard v1.19.2 del origen: el bloque de personaje se CONSERVA si esta
  // escritura no lo trae. Quien quiera cambiarlo manda el bloque nuevo (la UI
  // siempre tiene exactamente un modo encendido, así que «volver a genérico»
  // viaja como { mode: 'generic' }, nunca como ausencia). Sin esto, cualquier
  // camino que guarde el estilo sin conocer el campo le borra al usuario, en
  // silencio, la decisión que tomó sobre su protagonista. El mismo guard
  // protege el respaldo del agente, el filtro de color y el origen de una
  // copia del catálogo (ADR-0048).
  const character = payload.character ?? existing?.character
  const colorFilter = payload.colorFilter ?? existing?.colorFilter
  const origin = payload.origin ?? existing?.origin
  // Un `sourcePrompt` vacío borra el respaldo; ausente, lo conserva.
  const sourcePrompt =
    payload.sourcePrompt === undefined
      ? existing?.sourcePrompt
      : payload.sourcePrompt.trim()
  const now = new Date().toISOString()
  const stored: StoredStyle = {
    name,
    ...('sections' in content
      ? {
          sections: content.sections,
          // Editar una sección no pasa por el agente: sin versión nueva, se
          // conserva la de las secciones guardadas.
          templateVersion:
            payload.templateVersion ??
            existing?.templateVersion ??
            GEM_TEMPLATE_VERSION,
        }
      : { systemPrompt: content.systemPrompt }),
    ...(sourcePrompt ? { sourcePrompt } : {}),
    ...(colorFilter ? { colorFilter } : {}),
    ...(origin ? { origin } : {}),
    shots,
    ...(character ? { character } : {}),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
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

// Exactamente uno de `systemPrompt` o `sections`. Guardar secciones deja
// afuera el `systemPrompt` que hubiera: así una gema reconstruida por el
// agente pasa a ser de plantilla (su texto viejo viaja como `sourcePrompt`).
function readGemContent(payload: StyleSavePayload): GemContent {
  const hasSections = payload.sections !== undefined
  const hasSystemPrompt = payload.systemPrompt !== undefined
  if (hasSections && hasSystemPrompt)
    throw new PipelineFailure(
      'invalid_payload',
      'payload.systemPrompt and payload.sections are mutually exclusive',
    )

  if (hasSections) {
    const sections = assertGemSections(payload.sections, 'payload.sections')
    if (payload.templateVersion !== undefined)
      assertTemplateVersion(payload.templateVersion, 'payload.templateVersion')
    return { sections }
  }

  if (payload.templateVersion !== undefined)
    throw new PipelineFailure(
      'invalid_payload',
      'payload.templateVersion only applies to payload.sections',
    )
  const systemPrompt =
    typeof payload.systemPrompt === 'string' ? payload.systemPrompt.trim() : ''
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
  return { systemPrompt }
}
