// Detección determinística del idioma del guion (port de detectarIdiomaGuion).
// El prompt de imagen se redacta SIEMPRE en inglés (contrato con el modelo),
// pero el texto renderizado DENTRO de la imagen (carteles, pantallas,
// etiquetas) debe salir en el idioma del guion. Heurística por stopwords +
// bonos por marcas inequívocas; ante ambigüedad devuelve "" (nombrar MAL el
// idioma es el único modo de falla real — el LLM entonces lo infiere solo).
// Cero costo: no llama al LLM. Devuelve el NOMBRE inglés del idioma
// ("Spanish", "English", …) porque así se interpola en los prompts.

const LANGUAGE_STOPWORDS: ReadonlyArray<
  readonly [code: string, englishName: string, stopwords: readonly string[]]
> = [
  [
    'es',
    'Spanish',
    [
      'que',
      'de',
      'la',
      'el',
      'los',
      'las',
      'una',
      'con',
      'por',
      'para',
      'su',
      'se',
      'no',
      'en',
      'es',
      'del',
      'al',
      'como',
      'pero',
      'más',
      'este',
      'esta',
      'cuando',
      'muy',
      'sin',
      'sobre',
      'entre',
      'hasta',
      'porque',
    ],
  ],
  [
    'en',
    'English',
    [
      'the',
      'and',
      'of',
      'to',
      'in',
      'is',
      'that',
      'it',
      'for',
      'was',
      'with',
      'his',
      'he',
      'you',
      'but',
      'not',
      'this',
      'are',
      'have',
      'from',
      'they',
      'what',
      'when',
      'she',
      'her',
      'there',
    ],
  ],
  [
    'pt',
    'Portuguese',
    [
      'que',
      'de',
      'do',
      'da',
      'em',
      'um',
      'uma',
      'com',
      'não',
      'os',
      'as',
      'para',
      'por',
      'na',
      'no',
      'dos',
      'das',
      'mais',
      'como',
      'mas',
      'quando',
      'muito',
      'você',
      'então',
      'ele',
      'ela',
    ],
  ],
  [
    'fr',
    'French',
    [
      'le',
      'la',
      'les',
      'des',
      'un',
      'une',
      'et',
      'est',
      'que',
      'qui',
      'dans',
      'pour',
      'pas',
      'plus',
      'avec',
      'sur',
      'ne',
      'se',
      'ce',
      'il',
      'elle',
      'nous',
      'vous',
      'mais',
      'comme',
      'leur',
    ],
  ],
  [
    'it',
    'Italian',
    [
      'che',
      'di',
      'la',
      'il',
      'le',
      'un',
      'una',
      'con',
      'per',
      'non',
      'gli',
      'della',
      'del',
      'sono',
      'come',
      'ma',
      'quando',
      'più',
      'anche',
      'questo',
      'sua',
      'suo',
    ],
  ],
  [
    'de',
    'German',
    [
      'der',
      'die',
      'das',
      'und',
      'ist',
      'den',
      'von',
      'zu',
      'mit',
      'sich',
      'auf',
      'für',
      'nicht',
      'ein',
      'eine',
      'auch',
      'als',
      'aber',
      'wenn',
      'wie',
      'wird',
      'war',
      'sie',
    ],
  ],
]

export function detectScriptLanguage(script: string): string {
  const text = (script || '').toLowerCase()
  if (text.replace(/\s+/g, '').length < 20) return ''

  const tokens = text.match(/[\p{L}]+/gu) ?? []
  if (tokens.length < 8) return ''

  const frequency = new Map<string, number>()
  for (const word of tokens) frequency.set(word, (frequency.get(word) ?? 0) + 1)
  const countOf = (stopwords: readonly string[]) =>
    stopwords.reduce((total, word) => total + (frequency.get(word) ?? 0), 0)

  const scores: Record<string, number> = {}
  for (const [code, , stopwords] of LANGUAGE_STOPWORDS)
    scores[code] = countOf(stopwords)

  // Bonos por marcas inequívocas sobre el texto crudo.
  if (/ñ/.test(text)) scores.es += 8
  if (/[¿¡]/.test(text)) scores.es += 6
  if (
    /[ãõ]/.test(text) ||
    /\bnão\b/.test(text) ||
    /ção/.test(text) ||
    /\bvocê\b/.test(text)
  )
    scores.pt += 10
  if (
    /œ/.test(text) ||
    /\bc'est\b/.test(text) ||
    /\bqu'/.test(text) ||
    /\bd'/.test(text)
  )
    scores.fr += 6
  if (/ß/.test(text) || /[äöü]/.test(text)) scores.de += 6

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1])
  const [bestCode, bestScore] = ranked[0]
  const secondScore = ranked[1]?.[1] ?? 0

  // Señal mínima + margen sobre el segundo; si no, "" (el LLM infiere).
  if (bestScore < 3 || bestScore - secondScore < 2) return ''
  return LANGUAGE_STOPWORDS.find(([code]) => code === bestCode)?.[1] ?? ''
}
