import type { CharacterSummary } from '@pipeline/types/characters.ts'
import type { CharacterIdentitySource } from '@/modules/characters/types/characters'

// Cómo se fijó la identidad de un personaje ya guardado: lo decide el archivo
// (hay foto o no), nunca un flag aparte (ADR-0033).
export function identitySourceOf(
  character: CharacterSummary,
): CharacterIdentitySource {
  return character.photoPath ? 'photo' : 'text'
}
