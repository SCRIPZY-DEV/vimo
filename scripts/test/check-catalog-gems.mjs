// Las gemas del catálogo de Vimo (plan E2 §5.2 y decisión P12). Una gema del
// catálogo es una gema de plantilla con los mismos límites que una de Mi
// estilo (spec §4.1): un video del catálogo manda sus secciones tal cual como
// snapshot y «Pasar a mi estilo» las copia a la galería, así que una gema que
// no pasaría la validación de la galería rompería los dos caminos. Además se
// fija lo que muestra la pestaña (nombre, descripción y etiquetas en los tres
// idiomas, dentro de lo que entra en la tarjeta), los modos de personaje, el
// filtro de color de cada estilo, las frases que se tejen o se pegan en cada
// prompt (sin marcadores de relleno) y que `sampleCount` diga cuántas muestras
// trae de verdad la app en public/style-references/. Cada regla junta todas
// las gemas que la incumplen, para corregirlas de una vez. Sin red: lee las
// gemas y el disco.

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { CATALOG_SAMPLE_COUNT } from '../../pipeline/commands/catalog/catalog-store.ts'
import {
  STYLE_NAME_LIMIT,
  assertColorFilter,
  assertGemSections,
  assertStyleCharacter,
  assertTemplateVersion,
  isCatalogStyleId,
} from '../../pipeline/commands/styles/style-store.ts'
import { CATALOG_GEMS } from '../../pipeline/prompts/catalog-gems/catalog.ts'
import { fixedPhrasesInLanguage } from '../../pipeline/prompts/template-frame.ts'
import {
  CATALOG_TAGS,
  CATALOG_TAG_LABEL_LIMIT,
  CATALOG_TAG_LIMIT,
} from '../../pipeline/prompts/catalog-gems/tags.ts'
import {
  protagonistFromSection,
  roleFromDescription,
  roleUsableForWeaving,
} from '../../pipeline/stages/scene-prompts/verbatim/subject-weaver.ts'

const LOCALES = ['es', 'en', 'pt']
const REFERENCES_DIRECTORY = fileURLToPath(
  new URL('../../public/style-references/', import.meta.url),
)
// Fantasía y Terror llevan el filtro de su estilo en el carril viejo
// (`filterFinal` de VISUAL_STYLES). El resto va sin filtro salvo que la gema
// lo pida: esa excepción se anota acá, a propósito y con su motivo.
const COLOR_FILTERS = { fantasia: 'fantasy', terror: 'horror-bw' }
// Las secciones que se tejen (`character`) o se pegan (inicio y final fijos)
// en cada prompt de imagen: un relleno sin completar llega tal cual al modelo.
const WOVEN_SECTION_KEYS = ['character', 'promptStart', 'promptEnd']
const PLACEHOLDER_REGEX = /\[[^\]]*\]/
const NEUTRAL_POSE_REGEX = /neutral pose/i
// El mismo corte de oraciones que `splitOutfit` (subject-weaver.ts): la ropa
// base se separa de la identidad fija por la oración «Outfit:» final.
const SENTENCE_BREAK_REGEX = /(?<=[.!?])\s+/
const OUTFIT_PREFIX = 'Outfit:'
// El rol que el tejedor saca de cada sección `character` (la primera oración
// hasta la primera coma): es lo que reemplaza a `[subject]` en cada escena
// («Wide shot of the stickman doll walking…»). Una gema nueva con personaje
// anota acá su rol esperado, a propósito: «smooth» o «main character» pasan
// las otras reglas y tejen una frase rota.
const EXPECTED_ROLES = {
  pov_stickman: 'stickman doll',
  '2d-stickman': 'classic stickman',
  '2d-personaje-1': 'white-headed cartoon man',
  'stickman-cinematico': 'stick figure',
  '2d-basico-explicativo': 'light gray ovoid creature',
  '2d-mono': 'crudely drawn cartoon gorilla',
  '2d-bola': 'light gray ovoid creature',
}
// `character` no es una instrucción: se pega tal cual en cada escena con
// protagonista. La ropa o los rasgos «que pida la historia» no pueden vivir
// ahí (la ropa por escena la pone la regla de vestuario del marco).
const STORY_DEPENDENT_REGEX = /\b(?:story|stories|scene|scenes|script)\b/i
// Las muestras del catálogo las genera Vimo con su propio carril
// (`generate-style-samples`) y se guardan a 1280×720 o más: el carrusel de
// «Ver» mide unos 720 px de ancho, el doble en pantallas de doble densidad.
// Una muestra más chica es una miniatura o un fotograma traído de otro lado.
const SAMPLE_MIN_WIDTH = 1280
const SAMPLE_MIN_HEIGHT = 720
// Marcadores C0–CF que NO son un SOF (tablas Huffman, JPG y aritméticas).
const JPEG_NON_FRAME_MARKERS = new Set([0xc4, 0xc8, 0xcc])

// Corre `problemsOf` sobre cada gema y falla con la lista completa.
function assertEveryGem(problemsOf) {
  const problems = CATALOG_GEMS.flatMap((gem) =>
    problemsOf(gem).map((problem) => `${gem.id}: ${problem}`),
  )
  assert.deepEqual(problems, [])
}
// El mensaje del fallo de una validación del sidecar, o nada si pasa.
function failureOf(check) {
  try {
    check()
    return []
  } catch (error) {
    return [error.message]
  }
}
// Una etiqueta se identifica por su texto en español (como las repetidas).
function findTag(gem, paletteTag) {
  return gem.tags.find((tag) => tag?.es === paletteTag.es)
}
// Ancho y alto de un JPEG: los trae el primer marcador SOF, sea de línea de
// base o progresivo. null = los bytes no son un JPEG legible.
function jpegSize(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null

  let offset = 2
  while (offset + 9 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null

    const marker = bytes[offset + 1]
    if (marker >= 0xc0 && marker <= 0xcf && !JPEG_NON_FRAME_MARKERS.has(marker))
      return {
        width: bytes.readUInt16BE(offset + 7),
        height: bytes.readUInt16BE(offset + 5),
      }

    offset += 2 + bytes.readUInt16BE(offset + 2)
  }
  return null
}

test('the catalog has gems and every id is unique, a legacy or a gallery id, never a copy id', () => {
  assert.ok(CATALOG_GEMS.length > 0)
  const ids = CATALOG_GEMS.map((gem) => gem.id)
  assert.deepEqual(
    ids.filter((id, index) => ids.indexOf(id) !== index),
    [],
    'duplicate ids',
  )
  assertEveryGem((gem) => {
    const problems = []
    if (!isCatalogStyleId(gem.id))
      problems.push('the id is neither a legacy id nor a gallery id')
    if (gem.id.startsWith('st-'))
      problems.push('the id starts with st-, the prefix of the copies')
    return problems
  })
})

// Lo que valida la galería es lo que viaja: sin texto sin recortar, sin
// secciones vacías y sin claves ajenas que el snapshot arrastraría.
function sectionProblems(sections) {
  let normalized
  try {
    normalized = assertGemSections(sections, 'sections')
  } catch (error) {
    return [error.message]
  }
  if (isDeepStrictEqual(normalized, sections)) return []
  return [
    'sections change when normalized (untrimmed text, an empty section or an unknown key)',
  ]
}

test('the sections pass the template gem validation unchanged, with a known template version', () => {
  assertEveryGem((gem) => [
    ...sectionProblems(gem.sections),
    ...failureOf(() =>
      assertTemplateVersion(gem.templateVersion, 'templateVersion'),
    ),
  ])
})

test('the name and the description come in the three languages and the name fits a gallery name', () => {
  assertEveryGem((gem) => {
    const problems = []
    for (const locale of LOCALES) {
      const name = gem.name?.[locale]
      const description = gem.description?.[locale]
      if (typeof name !== 'string' || !name.trim())
        problems.push(`name.${locale} is empty`)
      else if (name.trim().length > STYLE_NAME_LIMIT)
        problems.push(`name.${locale} exceeds ${STYLE_NAME_LIMIT} characters`)
      if (typeof description !== 'string' || !description.trim())
        problems.push(`description.${locale} is empty`)
    }
    return problems
  })
})

test('allowedModes is not empty, has no repeated mode and includes sampleMode', () => {
  assertEveryGem((gem) => {
    if (!Array.isArray(gem.allowedModes) || gem.allowedModes.length === 0)
      return ['allowedModes is empty']

    const problems = gem.allowedModes.flatMap((mode) =>
      failureOf(() => assertStyleCharacter({ mode }, 'allowedModes')),
    )
    if (new Set(gem.allowedModes).size !== gem.allowedModes.length)
      problems.push('allowedModes repeats a mode')
    problems.push(
      ...failureOf(() =>
        assertStyleCharacter({ mode: gem.sampleMode }, 'sampleMode'),
      ),
    )
    if (!gem.allowedModes.includes(gem.sampleMode))
      problems.push(`sampleMode ${gem.sampleMode} is not in allowedModes`)
    return problems
  })
})

test('fantasia carries the fantasy filter, terror the horror-bw one and the rest none', () => {
  assertEveryGem((gem) => {
    const problems = failureOf(() =>
      assertColorFilter(gem.colorFilter, 'colorFilter'),
    )
    const expected = Object.hasOwn(COLOR_FILTERS, gem.id)
      ? COLOR_FILTERS[gem.id]
      : 'none'
    if (gem.colorFilter !== expected)
      problems.push(`colorFilter is ${gem.colorFilter}, expected ${expected}`)
    return problems
  })
})

test('the woven and fixed phrases reach the image model without placeholders nor "neutral pose", and the character ends with an Outfit: sentence', () => {
  assertEveryGem((gem) => {
    const problems = []
    // El inicio y el final fijos se miran como se pegan: el único marcador
    // que la plataforma completa es el del idioma del guion. `character` se
    // teje tal cual, así que ahí no vale ninguno.
    const pasted = fixedPhrasesInLanguage(gem.sections, 'Spanish')
    for (const key of WOVEN_SECTION_KEYS) {
      const text = key === 'character' ? gem.sections.character : pasted[key]
      if (text === undefined) continue
      const placeholder = PLACEHOLDER_REGEX.exec(text)
      if (placeholder)
        problems.push(`${key} has the placeholder ${placeholder[0]}`)
      if (NEUTRAL_POSE_REGEX.test(text))
        problems.push(`${key} mentions "neutral pose"`)
    }

    const character = gem.sections.character
    if (character === undefined) return problems
    const lastSentence = character.trim().split(SENTENCE_BREAK_REGEX).at(-1)
    if (!lastSentence.startsWith(OUTFIT_PREFIX))
      problems.push(
        `character does not end with a sentence that starts with ${OUTFIT_PREFIX}`,
      )
    return problems
  })
})

test('every character section opens with a role the weaver can use and carries no story-dependent wording', () => {
  assertEveryGem((gem) => {
    const character = gem.sections.character
    if (character === undefined) return []

    const problems = []
    const protagonist = protagonistFromSection(character)
    const role = roleFromDescription(protagonist.description)
    if (!Object.hasOwn(EXPECTED_ROLES, gem.id))
      problems.push(
        `the expected role is not listed (the weaver gives "${role}")`,
      )
    else if (role !== EXPECTED_ROLES[gem.id])
      problems.push(
        `the weaver gives the role "${role}", expected "${EXPECTED_ROLES[gem.id]}"`,
      )
    if (!roleUsableForWeaving(role))
      problems.push(`the role "${role}" is not usable for weaving`)
    if (!protagonist.outfit)
      problems.push('the base outfit cannot be split from the identity')
    const storyWord = STORY_DEPENDENT_REGEX.exec(character)
    if (storyWord)
      problems.push(
        `character depends on the story ("${storyWord[0]}"): it is pasted verbatim in every scene`,
      )
    return problems
  })
})

test('the listed roles belong to gems that still have a character section', () => {
  const withCharacter = CATALOG_GEMS.filter(
    (gem) => gem.sections.character !== undefined,
  ).map((gem) => gem.id)
  assert.deepEqual(Object.keys(EXPECTED_ROLES).sort(), withCharacter.sort())
})

test('the tags fit the card, are not repeated and match the sections they describe', () => {
  assertEveryGem((gem) => {
    if (!Array.isArray(gem.tags)) return ['tags is not a list']

    const problems = []
    if (gem.tags.length > CATALOG_TAG_LIMIT)
      problems.push(`more than ${CATALOG_TAG_LIMIT} tags`)
    for (const [index, tag] of gem.tags.entries())
      for (const locale of LOCALES) {
        const label = tag?.[locale]
        if (typeof label !== 'string' || !label.trim())
          problems.push(`tags[${index}].${locale} is empty`)
        else if (label !== label.trim())
          problems.push(`tags[${index}].${locale} is not trimmed`)
        else if (label.length > CATALOG_TAG_LABEL_LIMIT)
          problems.push(
            `tags[${index}].${locale} exceeds ${CATALOG_TAG_LABEL_LIMIT} characters`,
          )
      }
    const labels = gem.tags.map((tag) => tag?.es)
    for (const label of labels.filter(
      (label, index) => labels.indexOf(label) !== index,
    ))
      problems.push(`the tag ${label} is repeated`)

    // Las dos etiquetas que describen comportamiento van si y solo si la gema
    // tiene la sección que lo hace, y con los textos de la paleta.
    for (const [paletteTag, sectionKey] of [
      [CATALOG_TAGS.dynamism, 'dynamism'],
      [CATALOG_TAGS.fixedCharacter, 'character'],
    ]) {
      const tag = findTag(gem, paletteTag)
      const hasSection = gem.sections[sectionKey] !== undefined
      if (tag && !hasSection)
        problems.push(
          `the tag ${paletteTag.es} needs the ${sectionKey} section`,
        )
      if (!tag && hasSection)
        problems.push(
          `the ${sectionKey} section needs the tag ${paletteTag.es}`,
        )
      if (tag && !isDeepStrictEqual(tag, paletteTag))
        problems.push(
          `the tag ${paletteTag.es} does not carry the palette translations`,
        )
    }
    return problems
  })
})

test('sampleCount matches the samples the app ships in public/style-references', () => {
  const files = readdirSync(REFERENCES_DIRECTORY)
  assertEveryGem((gem) => {
    const count = gem.sampleCount
    if (!Number.isInteger(count) || count < 0 || count > CATALOG_SAMPLE_COUNT)
      return [
        `sampleCount must be an integer between 0 and ${CATALOG_SAMPLE_COUNT}`,
      ]

    const prefix = `${gem.id}_`
    const shipped = files
      .filter(
        (file) =>
          file.startsWith(prefix) &&
          /^\d+\.jpg$/.test(file.slice(prefix.length)),
      )
      .sort()
    const expected = Array.from(
      { length: count },
      (_, index) => `${gem.id}_${index + 1}.jpg`,
    ).sort()
    if (isDeepStrictEqual(shipped, expected)) return []
    return [
      `sampleCount is ${count} but public/style-references has [${shipped.join(', ')}]`,
    ]
  })
})

test('every gem ships its four samples and each one is a JPEG of at least 1280×720', () => {
  assertEveryGem((gem) => {
    const problems = []
    if (gem.sampleCount !== CATALOG_SAMPLE_COUNT)
      problems.push(
        `sampleCount is ${gem.sampleCount}: every gem ships ${CATALOG_SAMPLE_COUNT} samples`,
      )

    for (let number = 1; number <= gem.sampleCount; number += 1) {
      const file = `${gem.id}_${number}.jpg`
      let size
      try {
        size = jpegSize(readFileSync(`${REFERENCES_DIRECTORY}${file}`))
      } catch {
        // El archivo que falta ya lo dice la regla de `sampleCount`.
        continue
      }
      if (!size) problems.push(`${file} is not a readable JPEG`)
      else if (size.width < SAMPLE_MIN_WIDTH || size.height < SAMPLE_MIN_HEIGHT)
        problems.push(
          `${file} measures ${size.width}×${size.height}, below ${SAMPLE_MIN_WIDTH}×${SAMPLE_MIN_HEIGHT}`,
        )
    }
    return problems
  })
})
