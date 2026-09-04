import {
  extractJsonObject,
  stripStyleWords,
} from '../../prompts/character-designer.ts'
import {
  STYLE_CHARACTER_FORMAT_REMINDER,
  STYLE_CHARACTER_INSTRUCTION,
  buildStyleCharacterRequest,
} from '../../prompts/style-character-designer.ts'
import { resolveVerbatimModel } from '../../providers/llm/model-catalog.ts'
import { createVerbatimClient } from '../../providers/llm/verbatim-client.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type {
  DesignStyleCharacterPayload,
  DesignStyleCharacterResult,
} from '../../types/styles.ts'
import { SYSTEM_PROMPT_CHAR_LIMIT } from './style-store.ts'

// Límites del origen (rutas/estilos.ts): campos cortos a 80, borrador a
// 2.000, descripción devuelta a 1.500 y un mínimo de 60 tras la poda.
const FIELD_LIMIT = 80
const DRAFT_LIMIT = 2_000
const DESCRIPTION_LIMIT = 1_500
const MIN_DESCRIPTION_LENGTH = 60
const MIN_SCRIPT_LENGTH = 20
const CONTENT_TOKENS_BUDGET = 700
const ATTEMPTS = 2

function textField(value: unknown, limit: number): string {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, limit)
    : ''
}

/**
 * Diseña al protagonista con el ESTILO del usuario como contexto (port de
 * POST /estilos/personaje del origen, v1.21.0): una sola llamada por el
 * cliente verbatim, con el modelo del proyecto. Respeta los campos que el
 * usuario ya tipeó y, si trajo apariencia, la mejora en vez de reemplazarla.
 * Dos intentos: si el primero no trae un JSON usable, el segundo repite el
 * pedido con el recordatorio del formato.
 */
export async function designStyleCharacter(
  context: PipelineContext,
): Promise<DesignStyleCharacterResult> {
  const payload = (context.job.payload ??
    {}) as Partial<DesignStyleCharacterPayload>
  const gem = typeof payload.gem === 'string' ? payload.gem.trim() : ''
  const script = typeof payload.script === 'string' ? payload.script.trim() : ''
  if (!gem)
    throw new PipelineFailure('invalid_payload', 'payload.gem is required')
  if (gem.length > SYSTEM_PROMPT_CHAR_LIMIT)
    throw new PipelineFailure('invalid_payload', 'payload.gem is too long')
  if (script.length < MIN_SCRIPT_LENGTH)
    throw new PipelineFailure(
      'invalid_payload',
      `payload.script needs at least ${MIN_SCRIPT_LENGTH} characters`,
    )

  const apiKey = context.job.apiKeys.deepinfra
  if (!apiKey)
    throw new PipelineFailure('missing_api_key', 'deepinfra API key is missing')

  const draft = textField(payload.description, DRAFT_LIMIT)
  const fixed = [
    textField(payload.name, FIELD_LIMIT)
      ? `nombre: ${textField(payload.name, FIELD_LIMIT)}`
      : '',
    textField(payload.age, FIELD_LIMIT)
      ? `edad: ${textField(payload.age, FIELD_LIMIT)}`
      : '',
    textField(payload.role, FIELD_LIMIT)
      ? `rol: ${textField(payload.role, FIELD_LIMIT)}`
      : '',
  ]
    .filter(Boolean)
    .join(' · ')
  const request = buildStyleCharacterRequest({ gem, script, draft, fixed })

  const resolved = resolveVerbatimModel(payload.promptModel)
  if (resolved.degradedFrom)
    context.emitter.emit({
      type: 'log',
      level: 'warn',
      message: `${resolved.degradedFrom.label} is retired: designing the character with ${resolved.profile.label} instead`,
    })
  const client = createVerbatimClient({
    apiKey,
    baseUrl: context.config.llm.baseUrl,
  })

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const response = await client.call({
      profile: resolved.profile,
      messages: [
        { role: 'system', content: STYLE_CHARACTER_INSTRUCTION },
        {
          role: 'user',
          content:
            attempt === 0
              ? request
              : `${request}\n\n${STYLE_CHARACTER_FORMAT_REMINDER}`,
        },
      ],
      contentTokensBudget: CONTENT_TOKENS_BUDGET,
      signal: context.signal,
    })
    context.emitter.emit({
      type: 'log',
      level: 'info',
      message: `style character sheet with ${resolved.profile.label} · ${response.inputTokens}+${response.outputTokens} tokens (attempt ${attempt + 1})`,
    })

    const parsed = extractJsonObject(response.content)
    if (!parsed) continue
    const description = stripStyleWords(
      textField(parsed.descripcion, DESCRIPTION_LIMIT),
    )
    if (description.length < MIN_DESCRIPTION_LENGTH) continue

    const result: DesignStyleCharacterResult = { prompt: description }
    const name = textField(parsed.nombre, FIELD_LIMIT)
    if (name) result.name = name
    const age = textField(parsed.edad, FIELD_LIMIT)
    if (age) result.age = age
    const role = textField(parsed.rol, FIELD_LIMIT)
    if (role) result.role = role
    return result
  }

  throw new PipelineFailure(
    'llm_empty_response',
    'the model did not return a usable character sheet',
  )
}
