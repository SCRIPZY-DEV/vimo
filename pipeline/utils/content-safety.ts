// Neutralización determinística de términos que los filtros de contenido (del
// LLM y del generador de imágenes) suelen rechazar (port del mapa de
// seguridad del parser del origen). Bilingüe EN+ES: el prompt final va en
// inglés, pero el fallback determinístico embebe narración en su idioma.
//
// Principios (curado conservador del origen, no ampliar a la ligera):
//  - Solo términos genuinamente marcables (gore, violencia explícita, armas de
//    fuego en uso, sexual, autolesión). NO toca atmósfera (dark, eerie,
//    shadow, fog) ni armas de fantasía (sword, axe, blade).
//  - Reemplazos que no rompen frases legítimas (no se toca "hanging"/"shot"
//    genéricos: una lámpara colgante o un "wide shot" son válidos).
//  - "blood/sangre" → "crimson" (color seguro que el estilo terror ya usa).
const SAFETY_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  // Sangre → color seguro (preserva la estética rojo-oscuro).
  [
    /\b(blood|bloody|bleeding|bloodied|blood[-\s]?stained|bloodstains?|sangre|sangrado|sangrante|sangrient\w*|ensangrentad\w*|hemorrag\w*)\b/gi,
    'crimson',
  ],
  // Gore / vísceras.
  [/\b(gore|gory|viscera|entrails|v[íi]scera\w*|entra[ñn]as)\b/gi, 'shadows'],
  // Cadáveres.
  [
    /\b(corpses?|cadavers?|dead\s+bod(?:y|ies)|carcass(?:es)?|cad[áa]ver\w*)\b/gi,
    'a still figure',
  ],
  // Mutilación / descuartizamiento.
  [
    /\b(mutilat\w*|dismember\w*|disembowel\w*|mutilad\w*|descuartiz\w*|desmembr\w*)\b/gi,
    'obscured',
  ],
  // Decapitación.
  [/\b(behead\w*|decapitat\w*|decapit\w*|degoll\w*)\b/gi, 'silhouetted'],
  // Apuñalar.
  [/\b(stab(?:s|bing|bed)?|apu[ñn]al\w*)\b/gi, 'confronts'],
  // Matar / asesinar / masacrar (solo formas verbales de acción; NO
  // "killer"/"murderer": sustantivos casi siempre benignos y atmosféricos).
  [
    /\b(kill(?:s|ing|ed)?|murder(?:s|ing|ed)?|slaughter\w*|massacre\w*|matar|mat[óo]|mataron|matando|matanza|asesin\w*)\b/gi,
    'confronts',
  ],
  // Tortura.
  [/\b(torture\w*|tortur\w*)\b/gi, 'menaces'],
  // Armas de FUEGO en uso (no espadas/hachas de fantasía). "an object" y no
  // "figure" para no chocar con "a shadowy figure" del estilo terror.
  [
    /\b(gun(?:s|shot|shots|fire|man|men)?|pistols?|rifles?|firearms?|shotguns?|revolvers?|bullets?|pistola\w*|escopeta\w*|rev[óo]lver\w*|balazo\w*)\b/gi,
    'an object',
  ],
  // Autolesión / suicidio (términos inequívocos; NO "hang/hanging" genérico).
  [
    /\b(suicid\w*|self[-\s]?harm\w*|nooses?|autolesi\w*|ahorca\w*|ahorcamiento)\b/gi,
    'a still, somber figure',
  ],
  // Sexual / desnudez. NO el bare "sex" (sobre-matchea "sexo" demográfico).
  [
    /\b(nude|naked|nudity|sexual|porn\w*|erotic|desnud\w*|er[óo]tic\w*)\b/gi,
    'a clothed figure',
  ],
  // Drogas explícitas.
  [
    /\b(cocaine|heroin|methamphetamine|coca[íi]na|hero[íi]na|jeringa\w*|syringes?)\b/gi,
    'an object',
  ],
]

export function applySafetyReplacements(text: string): string {
  let result = text
  for (const [regex, replacement] of SAFETY_REPLACEMENTS)
    result = result.replace(regex, replacement)
  return result.replace(/\s{2,}/g, ' ').trim()
}

// Suaviza la NARRACIÓN antes de embeberla en un prompt o mandarla al LLM como
// contexto (port de sanitizarNarracion).
export function sanitizeNarration(text: string): string {
  return applySafetyReplacements(text ?? '')
}

// Personas reales inequívocas → rol genérico (port de neutralizarFamosos).
// Solo lo usa el RESCATE por content policy de la stage images: en el flujo
// normal el famoso nombrado sale estilizado pero reconocible (decisión de
// producto v0.63.0 del origen). Bordes con lookaround Unicode: \b no reconoce
// letras acentuadas ("Mbappé"/"Pelé" no matcheaban el borde final).
const FAMOUS_SOCCER_REGEX =
  /(?<![\p{L}])(lionel\s+messi|messi|cristiano\s+ronaldo|cristiano|ronaldo|ronaldinho|kylian\s+mbapp[ée]|mbapp[ée]|neymar|erling\s+haaland|haaland|robert\s+lewandowski|lewandowski|karim\s+benzema|benzema|vin[ií]cius(?:\s+j[úu]nior)?|diego\s+maradona|maradona|pel[ée]|zinedine\s+zidane|zidane|david\s+beckham|beckham|mohamed\s+salah|andr[ée]s\s+iniesta|iniesta|sergio\s+ramos|radamel\s+falcao|falcao|james\s+rodr[íi]guez|luis\s+su[áa]rez)(?![\p{L}])/giu

const FAMOUS_GENERAL_REGEX =
  /(?<![\p{L}])(taylor\s+swift|beyonc[ée]|rihanna|eminem|kanye\s+west|kanye|bad\s+bunny|shakira|billie\s+eilish|ariana\s+grande|justin\s+bieber|lady\s+gaga|donald\s+trump|joe\s+biden|barack\s+obama|vladimir\s+putin|elon\s+musk|jeff\s+bezos|bill\s+gates|mark\s+zuckerberg|kim\s+kardashian|kylie\s+jenner)(?![\p{L}])/giu

export function neutralizeFamousNames(text: string): string {
  return text
    .replace(FAMOUS_SOCCER_REGEX, 'a soccer player')
    .replace(FAMOUS_GENERAL_REGEX, 'a person')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
