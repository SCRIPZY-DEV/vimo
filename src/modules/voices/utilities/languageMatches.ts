// Minimax devuelve el idioma como nombre completo ("Spanish", "English");
// Edge TTS devuelve locale ("es-ES", "en-US"). Este mapa permite que el filtro
// por código ("es", "en"…) coincida con ambas representaciones (port de
// idiomaCoincide del origen).
const LANGUAGE_CODE_ALIASES: Record<string, string[]> = {
  es: ['spanish', 'español', 'espanol'],
  en: ['english'],
  pt: ['portuguese', 'português', 'portugues'],
  fr: ['french', 'français', 'frances'],
  it: ['italian', 'italiano'],
  de: ['german', 'deutsch'],
  ru: ['russian'],
  ja: ['japanese'],
  zh: ['chinese', 'mandarin'],
}

export function languageMatches(
  voiceLanguage: string,
  filterCode: string,
): boolean {
  const language = voiceLanguage.toLowerCase()
  if (language.startsWith(filterCode.toLowerCase())) return true
  const aliases = LANGUAGE_CODE_ALIASES[filterCode.toLowerCase()] ?? []
  return aliases.some((alias) => language.startsWith(alias))
}
