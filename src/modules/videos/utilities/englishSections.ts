import type { GemSectionKey, GemSections } from '@pipeline/types/styles.ts'

// Las secciones que Vimo pega TAL CUAL en cada prompt de imagen (spec §4.1):
// no pasan por el modelo, así que nadie las traduce. Módulo puro: lo corre
// scripts/test/check-app-gem-sections.mjs con Node.
export const ENGLISH_ONLY_SECTION_KEYS: readonly GemSectionKey[] = [
  'character',
  'promptStart',
  'promptEnd',
]

// Palabras funcionales que delatan el idioma. «a», «as», «do», «no», «me» y
// «sin» quedan fuera a propósito: existen en inglés y en español o portugués.
const ENGLISH_WORDS = new Set([
  'the',
  'and',
  'of',
  'with',
  'in',
  'on',
  'at',
  'to',
  'is',
  'are',
  'his',
  'her',
  'their',
  'outfit',
  'wears',
  'wearing',
  'for',
  'from',
  'by',
  'an',
  'this',
  'that',
  'into',
  'over',
  'under',
  'each',
  'every',
  'while',
  'without',
])
const SPANISH_PORTUGUESE_WORDS = new Set([
  'el',
  'la',
  'los',
  'las',
  'un',
  'una',
  'unos',
  'unas',
  'y',
  'de',
  'del',
  'con',
  'en',
  'por',
  'para',
  'que',
  'es',
  'su',
  'sus',
  'lleva',
  'viste',
  'al',
  'o',
  'uma',
  'e',
  'da',
  'dos',
  'das',
  'com',
  'em',
  'na',
  'nas',
  'nos',
  'seu',
  'sua',
  'veste',
  'cada',
  'sem',
])
// Letras que el inglés no usa: una palabra con alguna cuenta del otro lado.
const SPANISH_PORTUGUESE_LETTERS = /[áéíóúñãõçâêôàü¿¡]/

/**
 * ¿Parece inglés? Heurística para AVISAR, nunca para bloquear: cuenta palabras
 * de cada lado y gana la mayoría. Un empate, también cero a cero («cinematic
 * still, 35mm»), cuenta como inglés, así un nombre con tilde en una frase en
 * inglés («Sofía … Outfit: …») no dispara el aviso.
 */
export function looksEnglish(text: string): boolean {
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? []
  let english = 0
  let foreign = 0
  for (const word of words) {
    if (ENGLISH_WORDS.has(word)) english += 1
    if (
      SPANISH_PORTUGUESE_WORDS.has(word) ||
      SPANISH_PORTUGUESE_LETTERS.test(word)
    )
      foreign += 1
  }

  return foreign <= english
}

/** Las secciones que van en inglés y no lo parecen; las vacías no se miran. */
export function nonEnglishSectionKeys(sections: GemSections): GemSectionKey[] {
  return ENGLISH_ONLY_SECTION_KEYS.filter((key) => {
    const value = sections[key]?.trim() ?? ''
    return value.length > 0 && !looksEnglish(value)
  })
}
