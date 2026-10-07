import type { LocalizedText } from '@pipeline/types/catalog.ts'

// «Personaje fijo» va en amarillo en la tarjeta y en «Ver» (pedido del dueño,
// 2026-10-05): le dice a la persona que conviene usar el personaje que trae el
// estilo o uno suyo en ese estilo. Módulo puro, sin imports de runtime: lo
// corre scripts/test/check-app-catalog-style.mjs con Node, sin bundler.

// Espejo de CATALOG_TAGS.fixedCharacter (pipeline/prompts/catalog-gems/tags.ts):
// `src/` solo importa tipos de `pipeline/` (ADR-0010) y el guard fija que
// coincidan. Las etiquetas salen de esa paleta, así que basta el español.
const FIXED_CHARACTER_TAG_ES = 'Personaje fijo'

export function isFixedCharacterTag(tag: LocalizedText): boolean {
  return tag.es === FIXED_CHARACTER_TAG_ES
}
