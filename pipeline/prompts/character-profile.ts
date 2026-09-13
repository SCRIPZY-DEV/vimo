import type {
  SuggestCharacterProfilePayload,
  SuggestCharacterProfileResult,
} from '../types/characters.ts'
import {
  AGE_LIMIT,
  IDENTITY_PROMPT_LIMIT,
  MIN_IDENTITY_PROMPT_LENGTH,
  NAME_LIMIT,
  ROLE_LIMIT,
  stripStyleWords,
} from './character-designer.ts'

export const CHARACTER_PROFILE_COMPLETION_REMINDER =
  'Return a COMPLETE character sheet with all four fields: name, age, role and identity description, using the JSON keys required by the system. No empty, null or omitted fields. Preserve all user-specified facts and the same character from the previous draft. If age or role is unspecified, choose a plausible age or age range and role consistent with the script and identity, not a placeholder. For a non-human character, describe its coherent age/life stage or state that age does not apply to that kind of character.'

interface CharacterProfileLimits {
  descriptionLimit: number
  minimumDescriptionLength: number
  roleLimit?: number
}

function textField(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : ''
}

// El modelo a veces devuelve una edad numérica en JSON; cero también es una
// edad válida. Nunca convertir objetos, null, negativos o NaN en texto.
function ageField(value: unknown): string {
  if (typeof value === 'number')
    return Number.isFinite(value) && value >= 0 ? String(value) : ''
  return textField(value, AGE_LIMIT)
}

// Ambos expertos deben satisfacer el mismo contrato. Las decisiones escritas
// por el usuario mandan; descripción y completitud se validan DESPUÉS de podar.
export function completeCharacterProfile(
  parsed: Record<string, unknown> | null,
  input: SuggestCharacterProfilePayload,
  limits: CharacterProfileLimits = {
    descriptionLimit: IDENTITY_PROMPT_LIMIT,
    minimumDescriptionLength: MIN_IDENTITY_PROMPT_LENGTH,
  },
): SuggestCharacterProfileResult | null {
  if (!parsed) return null
  const name =
    textField(input.name, NAME_LIMIT) ||
    textField(parsed.name ?? parsed.nombre, NAME_LIMIT)
  const age = ageField(input.age) || ageField(parsed.age ?? parsed.edad)
  const role =
    textField(input.role, limits.roleLimit ?? ROLE_LIMIT) ||
    textField(parsed.role ?? parsed.rol, limits.roleLimit ?? ROLE_LIMIT)
  const prompt = stripStyleWords(
    textField(parsed.prompt ?? parsed.descripcion, limits.descriptionLimit),
  )
  if (!name || !age || !role || prompt.length < limits.minimumDescriptionLength)
    return null
  return { name, age, role, prompt }
}
