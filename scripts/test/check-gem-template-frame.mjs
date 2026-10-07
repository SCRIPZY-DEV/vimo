// El marco de Vimo (spec §5.1): el system de una gema de plantilla, byte a
// byte, en los cuatro modos del carril y con o sin cada sección opcional.
// Abre con el rol del modelo, la sección `character` nunca entra al system,
// las reglas nuevas son reglas de plataforma declaradas (español sin acentos)
// y la gema vieja sigue saliendo exactamente igual que antes. Funciones puras:
// sin HTTP ni disco.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildTemplateSystem,
  CAMERA_HEADING,
  composeGemText,
  CONTENT_SAFETY_RULE,
  DYNAMISM_HEADING,
  DYNAMISM_WITHOUT_PROTAGONIST_RULE,
  FIXED_END_HEADING,
  FIXED_END_NOTE,
  FIXED_PHRASES_RULE,
  FIXED_START_HEADING,
  FIXED_START_NOTE,
  fixedPhrasesRuleFor,
  FRAME_ROLE_LINE,
  OUTPUT_FORMAT_RULE,
  STYLE_RULES_HEADING,
  TREATMENT_TAG_RULE,
  VISUAL_STYLE_HEADING,
} from '../../pipeline/prompts/template-frame.ts'
import {
  buildVerbatimSystem,
  OUTPUT_LANGUAGE_RULE,
  platformSystemRules,
  PROMPT_ARCHITECTURE_RULE,
  PROMPT_ARCHITECTURE_RULE_NO_SUBJECT,
  PROMPT_ARCHITECTURE_RULE_REFERENCE,
  SCENE_ID_RULE,
  SCENE_WARDROBE_RULE,
  SCENE_WITHOUT_PROTAGONIST_RULE,
  USER_PROTAGONIST_RULE,
} from '../../pipeline/prompts/verbatim-messages.ts'
import { SCENE_TREATMENTS } from '../../pipeline/types/scenes.ts'

const MODES = ['generic', 'text', 'reference', 'none']
const ARCHITECTURE = {
  generic: PROMPT_ARCHITECTURE_RULE,
  text: PROMPT_ARCHITECTURE_RULE,
  reference: PROMPT_ARCHITECTURE_RULE_REFERENCE,
  none: PROMPT_ARCHITECTURE_RULE_NO_SUBJECT,
}
const sections = {
  visualStyle: 'Hand-drawn watercolor with indigo washes and rough paper.',
  character:
    'A curious red-haired girl with freckles and round green glasses. Outfit: a green hoodie.',
  dynamism: 'Show the protagonist in half of the scenes; objects in the rest.',
  camera: 'Alternate wide shots and close-ups.',
  rules: 'Never draw text on screens.',
  promptStart: 'Watercolor illustration:',
  promptEnd: 'Indigo washes on rough paper.',
}
const OPTIONAL = [
  'character',
  'dynamism',
  'camera',
  'rules',
  'promptStart',
  'promptEnd',
]

// Las reglas de plataforma de siempre, escritas a mano en su orden (el mismo
// que pinea check-verbatim-prompt-language para la gema vieja).
function platformTail(
  mode,
  { language = true, wardrobe = true, withoutScript = false } = {},
) {
  const rules = [SCENE_ID_RULE, ARCHITECTURE[mode]]
  if (language) rules.push(OUTPUT_LANGUAGE_RULE)
  if (mode === 'text' || mode === 'reference') rules.push(USER_PROTAGONIST_RULE)
  if (mode === 'none' && withoutScript)
    rules.push(SCENE_WITHOUT_PROTAGONIST_RULE)
  if (wardrobe && mode !== 'none') rules.push(SCENE_WARDROBE_RULE)
  return rules.join('\n\n')
}

// El layout del spec §5.1, escrito a mano.
function expectedSystem(gem, mode, platform = {}) {
  const blocks = [
    FRAME_ROLE_LINE,
    VISUAL_STYLE_HEADING + '\n' + gem.visualStyle,
  ]
  if (gem.camera) blocks.push(CAMERA_HEADING + '\n' + gem.camera)
  if (gem.dynamism)
    blocks.push(
      DYNAMISM_HEADING +
        '\n' +
        gem.dynamism +
        '\n\n' +
        TREATMENT_TAG_RULE +
        (mode === 'none' ? '\n\n' + DYNAMISM_WITHOUT_PROTAGONIST_RULE : ''),
    )
  if (gem.rules) blocks.push(STYLE_RULES_HEADING + '\n' + gem.rules)
  blocks.push(CONTENT_SAFETY_RULE, OUTPUT_FORMAT_RULE)
  const notes = [
    ...(gem.promptStart ? [FIXED_START_NOTE] : []),
    ...(gem.promptEnd ? [FIXED_END_NOTE] : []),
  ]
  if (notes.length > 0) blocks.push([FIXED_PHRASES_RULE, ...notes].join(' '))
  blocks.push(platformTail(mode, platform))
  return blocks.join('\n\n')
}

// ── Las reglas nuevas ──

test('the new rules are declared platform rules, in Spanish without accents', () => {
  for (const rule of [
    CONTENT_SAFETY_RULE,
    OUTPUT_FORMAT_RULE,
    FIXED_PHRASES_RULE,
    TREATMENT_TAG_RULE,
    DYNAMISM_WITHOUT_PROTAGONIST_RULE,
  ])
    assert.match(
      rule,
      /^[A-Z ]+ \(regla tecnica de la plataforma, se suma a todo lo anterior y no cambia tu estilo\): /,
    )
  for (const text of [
    FRAME_ROLE_LINE,
    CONTENT_SAFETY_RULE,
    OUTPUT_FORMAT_RULE,
    FIXED_PHRASES_RULE,
    FIXED_START_NOTE,
    FIXED_END_NOTE,
    TREATMENT_TAG_RULE,
    DYNAMISM_WITHOUT_PROTAGONIST_RULE,
  ])
    assert.doesNotMatch(text, /[áéíóúÁÉÍÓÚñÑ]/)
})

test('the content safety rule brings what the catalog forbids', () => {
  for (const forbidden of [
    /gore/,
    /sangre/,
    /violencia explicita/,
    /persona real/,
    /derechos de autor/,
  ])
    assert.match(CONTENT_SAFETY_RULE, forbidden)
})

test('the treatment tag rule asks for ((n)) [T:…] and offers every scene treatment', () => {
  assert.match(TREATMENT_TAG_RULE, /\(\(n\)\) \[T:tratamiento\]/)
  for (const treatment of SCENE_TREATMENTS)
    assert.ok(TREATMENT_TAG_RULE.includes(treatment + ' ('), treatment)
})

// La arquitectura pide SIEMPRE «lo que hace [subject]» en la parte (1); el
// dinamismo reparte escenas sin protagonista. La cláusula las libera.
const TREATMENT_WITHOUT_PROTAGONIST =
  'Cuando, segun tu dinamismo, el tratamiento de un fragmento no muestra al protagonista, la parte (1) de la ARQUITECTURA DEL PROMPT FINAL es la toma o encuadre y el elemento principal de esa escena (lo que su tratamiento pone en primer plano), sin la etiqueta [subject]: en ese prompt el protagonista no aparece.'

test('a treatment without the protagonist frees part (1) of the architecture from [subject]', () => {
  assert.ok(TREATMENT_TAG_RULE.includes(TREATMENT_WITHOUT_PROTAGONIST))
  // Después de la frase sobre la etiqueta [T:…], para que «la etiqueta» que
  // la plataforma quita nunca se lea como [subject].
  assert.ok(
    TREATMENT_TAG_RULE.indexOf('La plataforma lee la etiqueta y la quita') <
      TREATMENT_TAG_RULE.indexOf(TREATMENT_WITHOUT_PROTAGONIST),
  )
  // Solo viaja con dinamismo: sin dinamismo la arquitectura queda como hoy.
  for (const mode of MODES) {
    assert.ok(
      buildTemplateSystem(sections, mode).includes(
        TREATMENT_WITHOUT_PROTAGONIST,
      ),
      mode,
    )
    assert.ok(
      !buildTemplateSystem({ ...sections, dynamism: undefined }, mode).includes(
        TREATMENT_WITHOUT_PROTAGONIST,
      ),
      mode,
    )
  }
})

// ── El rol del modelo ──

// El agente saca de la gema su rol, sus fases y su formato: el rol lo pone el
// marco, igual para todas las gemas. Texto del dueño (2026-10-04).
const ROLE_LINE =
  'Eres un Director de Arte y Prompt Engineer experto en IA visual. Eres un asistente de solo texto: tu unica tarea es redactar los prompts de imagen del video, uno por fragmento del guion, con el estilo que sigue.'

test('the frame opens with the role of the model, once, right above the visual style', () => {
  assert.equal(FRAME_ROLE_LINE, ROLE_LINE)
  for (const mode of MODES)
    for (const gem of [sections, { visualStyle: sections.visualStyle }]) {
      const system = buildTemplateSystem(gem, mode)
      assert.ok(
        system.startsWith(
          ROLE_LINE + '\n\n' + VISUAL_STYLE_HEADING + '\n' + gem.visualStyle,
        ),
        mode,
      )
      assert.equal(system.split(ROLE_LINE).length - 1, 1, mode)
    }
})

test('only the frame carries the role: the gem as text and the old gem do not', () => {
  // La gema como texto va a la Fase 1 y al diseño y el retrato de personajes:
  // ahí no se escriben prompts de escena, y el rol diría lo contrario.
  assert.ok(!composeGemText(sections).includes(ROLE_LINE))
  assert.ok(
    !composeGemText(sections, { fixedPhrases: false }).includes(ROLE_LINE),
  )
  // La gema vieja trae el rol que le escribió su autor.
  for (const mode of MODES)
    assert.ok(
      !buildVerbatimSystem(
        'Render every scene as a watercolor.',
        mode,
      ).includes(ROLE_LINE),
      mode,
    )
})

// ── El system, byte a byte ──

test('with every section, each mode composes exactly the spec layout', () => {
  assert.equal(
    buildTemplateSystem(sections, 'generic'),
    ROLE_LINE +
      '\n\n# VISUAL STYLE\n' +
      sections.visualStyle +
      '\n\n# CAMERA AND FRAMING\n' +
      sections.camera +
      '\n\n# DYNAMISM\n' +
      sections.dynamism +
      '\n\n' +
      TREATMENT_TAG_RULE +
      '\n\n# STYLE RULES\n' +
      sections.rules +
      '\n\n' +
      CONTENT_SAFETY_RULE +
      '\n\n' +
      OUTPUT_FORMAT_RULE +
      '\n\n' +
      FIXED_PHRASES_RULE +
      ' ' +
      FIXED_START_NOTE +
      ' ' +
      FIXED_END_NOTE +
      '\n\n' +
      SCENE_ID_RULE +
      '\n\n' +
      PROMPT_ARCHITECTURE_RULE +
      '\n\n' +
      OUTPUT_LANGUAGE_RULE +
      '\n\n' +
      SCENE_WARDROBE_RULE,
  )
  for (const mode of MODES)
    assert.equal(
      buildTemplateSystem(sections, mode),
      expectedSystem(sections, mode),
      mode,
    )
})

test('with and without each optional section, in every mode', () => {
  for (const mode of MODES) {
    assert.equal(
      buildTemplateSystem({ visualStyle: sections.visualStyle }, mode),
      expectedSystem({ visualStyle: sections.visualStyle }, mode),
      mode + ' only the visual style',
    )
    for (const key of OPTIONAL) {
      const without = { ...sections, [key]: undefined }
      assert.equal(
        buildTemplateSystem(without, mode),
        expectedSystem(without, mode),
        mode + ' without ' + key,
      )
      const blank = { ...sections, [key]: '   ' }
      assert.equal(
        buildTemplateSystem(blank, mode),
        expectedSystem(without, mode),
        mode + ' with a blank ' + key,
      )
      const only = { visualStyle: sections.visualStyle, [key]: sections[key] }
      assert.equal(
        buildTemplateSystem(only, mode),
        expectedSystem(only, mode),
        mode + ' only ' + key,
      )
    }
  }
})

test('the platform options keep working inside the frame', () => {
  for (const mode of MODES)
    assert.equal(
      buildTemplateSystem(sections, mode, {
        outputLanguageRule: false,
        sceneWardrobe: false,
        withoutScriptProtagonist: true,
      }),
      expectedSystem(sections, mode, {
        language: false,
        wardrobe: false,
        withoutScript: true,
      }),
      mode,
    )
})

test('the character section never enters the system', () => {
  for (const mode of MODES) {
    const system = buildTemplateSystem(sections, mode)
    assert.ok(!system.includes(sections.character), mode)
  }
})

test('the fixed phrases rule only carries the notes of the phrases the style has', () => {
  assert.equal(fixedPhrasesRuleFor({}), '')
  assert.equal(fixedPhrasesRuleFor({ promptStart: '  ', promptEnd: '' }), '')
  assert.equal(
    fixedPhrasesRuleFor({ promptStart: 'Start.' }),
    FIXED_PHRASES_RULE + ' ' + FIXED_START_NOTE,
  )
  assert.equal(
    fixedPhrasesRuleFor({ promptEnd: 'End.' }),
    FIXED_PHRASES_RULE + ' ' + FIXED_END_NOTE,
  )
  // Las frases mismas no viajan en el system: las pega el código.
  const system = buildTemplateSystem(sections, 'generic')
  assert.ok(!system.includes(sections.promptStart))
  assert.ok(!system.includes(sections.promptEnd))
})

test('the fixed phrases rule forbids only the phrases, never the rest of the prompt', () => {
  assert.ok(
    FIXED_PHRASES_RULE.includes(
      'NUNCA las escribas tu, ni enteras, ni resumidas, ni traducidas: escribe el resto de cada prompt, sin esas frases.',
    ),
  )
  assert.ok(!FIXED_PHRASES_RULE.includes('solo la parte de cada prompt'))
  // Con un inicio fijo y sin final, la cola de estilo sigue siendo del
  // modelo: nada del bloque de frases fijas habla de la cola.
  assert.ok(!fixedPhrasesRuleFor({ promptStart: 'Start.' }).includes('cola'))
})

test('a fixed end takes over part (3) of the architecture, above every rule that asks for a style ending', () => {
  for (const clause of [
    'ES la parte (3) de la ARQUITECTURA DEL PROMPT FINAL que aparece mas abajo: en tu estilo esa parte la pone la plataforma.',
    'Termina cada prompt con la parte (2), donde ocurre y de que esta hecho el decorado,',
    'no escribas ninguna cola ni frase de estilo propia, aunque las reglas de mas abajo o el pedido de los fragmentos mencionen la cola de estilo.',
  ])
    assert.ok(FIXED_END_NOTE.includes(clause), clause)
  for (const mode of MODES) {
    const system = buildTemplateSystem(sections, mode)
    const note = system.indexOf(FIXED_END_NOTE)
    assert.ok(note >= 0, mode)
    // La parte (3) que la nota nombra existe en la arquitectura de este modo
    // y va más abajo, igual que las otras reglas que piden la cola.
    assert.ok(
      ARCHITECTURE[mode].startsWith('ARQUITECTURA DEL PROMPT FINAL'),
      mode,
    )
    assert.ok(ARCHITECTURE[mode].includes('(3) la cola de estilo'), mode)
    const later = [ARCHITECTURE[mode], OUTPUT_LANGUAGE_RULE]
    if (mode === 'text' || mode === 'reference')
      later.push(USER_PROTAGONIST_RULE)
    for (const rule of later) assert.ok(note < system.indexOf(rule), mode)
  }
})

// ── La gema vieja, intacta ──

test('the old gem system is byte-identical to before the frame', () => {
  const gem = 'Render every scene as a watercolor.'
  for (const mode of MODES) {
    assert.equal(
      buildVerbatimSystem(gem, mode),
      gem + '\n\n' + platformTail(mode),
    )
    assert.equal(platformSystemRules(mode), platformTail(mode))
    assert.equal(
      buildVerbatimSystem('  ' + gem + '  ', mode, {
        outputLanguageRule: false,
        sceneWardrobe: false,
        withoutScriptProtagonist: true,
      }),
      gem +
        '\n\n' +
        platformTail(mode, {
          language: false,
          wardrobe: false,
          withoutScript: true,
        }),
    )
  }
})

// ── La gema como texto ──

test('the gem as text carries every section but the character, with its heading', () => {
  assert.equal(
    composeGemText(sections),
    '# VISUAL STYLE\n' +
      sections.visualStyle +
      '\n\n# CAMERA AND FRAMING\n' +
      sections.camera +
      '\n\n# DYNAMISM\n' +
      sections.dynamism +
      '\n\n# STYLE RULES\n' +
      sections.rules +
      '\n\n' +
      FIXED_START_HEADING +
      '\n' +
      sections.promptStart +
      '\n\n' +
      FIXED_END_HEADING +
      '\n' +
      sections.promptEnd,
  )
  assert.equal(
    composeGemText({ visualStyle: '  Watercolor.  ', camera: ' ' }),
    '# VISUAL STYLE\nWatercolor.',
  )
  const text = composeGemText(sections)
  for (const rule of [
    CONTENT_SAFETY_RULE,
    OUTPUT_FORMAT_RULE,
    TREATMENT_TAG_RULE,
    SCENE_ID_RULE,
  ])
    assert.ok(!text.includes(rule))
  assert.ok(!text.includes(sections.character))
})

test('phase 1 can take the gem as text without its fixed phrases', () => {
  const withoutPhrases = composeGemText(sections, { fixedPhrases: false })
  assert.equal(
    withoutPhrases,
    '# VISUAL STYLE\n' +
      sections.visualStyle +
      '\n\n# CAMERA AND FRAMING\n' +
      sections.camera +
      '\n\n# DYNAMISM\n' +
      sections.dynamism +
      '\n\n# STYLE RULES\n' +
      sections.rules,
  )
  for (const absent of [
    FIXED_START_HEADING,
    FIXED_END_HEADING,
    sections.promptStart,
    sections.promptEnd,
    sections.character,
  ])
    assert.ok(!withoutPhrases.includes(absent), absent)
  assert.equal(
    composeGemText(
      { visualStyle: 'Watercolor.', promptStart: 'Start.', promptEnd: 'End.' },
      { fixedPhrases: false },
    ),
    '# VISUAL STYLE\nWatercolor.',
  )
  // Con `true`, o sin la opción, es el texto de siempre (spec §5.6 bis).
  assert.equal(
    composeGemText(sections, { fixedPhrases: true }),
    composeGemText(sections),
  )
  assert.equal(composeGemText(sections, {}), composeGemText(sections))
  assert.ok(
    composeGemText(sections, { fixedPhrases: true }).endsWith(
      FIXED_END_HEADING + '\n' + sections.promptEnd,
    ),
  )
})
