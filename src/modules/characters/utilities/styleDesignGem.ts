import type {
  CharacterStyleContext,
  StyleDesignGem,
} from '@/modules/characters/types/characters'

// La gema del contexto de «Mi estilo» tal como la pide design-style-character
// (ADR-0020, ADR-0048): una de plantilla por secciones (el sidecar las pasa a
// texto sin su sección `character`) o una vieja como texto, nunca las dos: si
// un contexto trajera las dos, van las secciones. null = no hay gema que
// diseñe y el modal usa el experto de la casa. Puro: lo corre
// scripts/test/check-app-style-character-gem.mjs con Node.
export function styleDesignGemOf(
  context: CharacterStyleContext | undefined,
): StyleDesignGem | null {
  if (!context) return null

  if (context.sections) {
    if (!context.sections.visualStyle.trim()) return null
    return { sections: context.sections }
  }

  const gem = context.gem?.trim()
  if (!gem) return null
  return { gem }
}
