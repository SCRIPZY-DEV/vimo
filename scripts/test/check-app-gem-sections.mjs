// La gema por secciones en el modal (spec §4 y §7): topes por sección y total,
// qué cuenta como cambio, cuánto texto tiene la gema, el guardado con su
// `templateVersion` y sin `systemPrompt` ni `shots`, la heurística de inglés y
// el snapshot del formulario. Módulos puros de src/ corridos con Node (type
// stripping), sin bundler.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  COLOR_FILTER_IDS,
  gemCharCount,
  hasGemText,
  sameGemSections,
  sectionMaxLength,
  templateStyleSavePayload,
} from '../../src/modules/videos/utilities/gemTemplate.ts'
import {
  looksEnglish,
  nonEnglishSectionKeys,
} from '../../src/modules/videos/utilities/englishSections.ts'
import {
  customStyleDraftFrom,
  selectedCustomStyleFrom,
} from '../../src/modules/videos/utilities/selectedCustomStyle.ts'

const OLD_GEM = {
  id: 'st-vieja',
  name: 'Vieja',
  systemPrompt: 'Acuarela editorial con tinta suelta.',
  shots: ['Wide shot'],
  character: { mode: 'own', defaultCharacterId: 'ana' },
  createdAt: '2026-09-01T00:00:00.000Z',
  samples: [],
}

const TEMPLATE_GEM = {
  id: 'st-plantilla',
  name: 'Plantilla',
  shots: [],
  createdAt: '2026-09-30T00:00:00.000Z',
  samples: [],
  sections: {
    visualStyle: 'Acuarela editorial con tinta suelta.',
    character: 'A tall woman with short gray hair. Outfit: a green raincoat.',
    camera: 'Planos abiertos.',
  },
  templateVersion: 1,
  colorFilter: 'fantasy',
}

test('los tres presets de color, en el orden en que se ofrecen', () => {
  assert.deepEqual(COLOR_FILTER_IDS, ['none', 'fantasy', 'horror-bw'])
})

test('tope de una sección: su límite o lo que queda del total', () => {
  assert.equal(sectionMaxLength({ visualStyle: '' }, 'character'), 700)
  assert.equal(sectionMaxLength({ visualStyle: '' }, 'promptEnd'), 600)
  assert.equal(
    sectionMaxLength({ visualStyle: 'x'.repeat(100) }, 'visualStyle'),
    12_000,
  )
  const nearlyFull = {
    visualStyle: 'a'.repeat(12_000),
    dynamism: 'b'.repeat(12_000),
    rules: 'c'.repeat(5_900),
  }
  assert.equal(sectionMaxLength(nearlyFull, 'camera'), 100)
  assert.equal(sectionMaxLength(nearlyFull, 'rules'), 6_000)
  assert.equal(
    sectionMaxLength(
      { ...nearlyFull, rules: 'c'.repeat(6_000) },
      'promptStart',
    ),
    0,
  )
  // Pasado del total el tope es 0, no un número negativo: un maxLength
  // negativo se ignora y la caja quedaría sin tope.
  const overTotal = {
    visualStyle: 'a'.repeat(12_000),
    dynamism: 'b'.repeat(12_000),
    camera: 'c'.repeat(12_000),
  }
  assert.equal(sectionMaxLength(overTotal, 'rules'), 0)
})

test('mismas secciones: espacios de más u opcionales vacías no son un cambio', () => {
  assert.equal(
    sameGemSections(
      { visualStyle: 'a', character: '' },
      { visualStyle: ' a ', rules: '   ' },
    ),
    true,
  )
  assert.equal(
    sameGemSections({ visualStyle: 'a' }, { visualStyle: 'b' }),
    false,
  )
  assert.equal(
    sameGemSections({ visualStyle: 'a' }, { visualStyle: 'a', camera: 'x' }),
    false,
  )
})

test('texto de la gema: estilo visual en una de plantilla, texto en una vieja', () => {
  assert.equal(hasGemText(TEMPLATE_GEM), true)
  assert.equal(hasGemText({ sections: { visualStyle: '   ' } }), false)
  assert.equal(hasGemText(OLD_GEM), true)
  assert.equal(hasGemText({ systemPrompt: '  ' }), false)
  assert.equal(gemCharCount(OLD_GEM), OLD_GEM.systemPrompt.length)
  assert.equal(
    gemCharCount(TEMPLATE_GEM),
    TEMPLATE_GEM.sections.visualStyle.length +
      TEMPLATE_GEM.sections.character.length +
      TEMPLATE_GEM.sections.camera.length,
  )
  // Se cuenta el texto limpio, como lo guarda style-save.
  assert.equal(gemCharCount({ systemPrompt: '  abc  ' }), 3)
  assert.equal(
    gemCharCount({
      sections: { visualStyle: ' ab ', camera: ' c ', rules: '  ' },
    }),
    3,
  )
})

test('guardar una gema de plantilla: siempre con templateVersion, sin systemPrompt ni shots; sourcePrompt solo si se reconstruyó', () => {
  const draft = {
    id: 'st-plantilla',
    name: 'Plantilla',
    sections: {
      visualStyle: ' Acuarela ',
      character: '',
      camera: 'Planos abiertos.',
    },
    templateVersion: 1,
    colorFilter: 'horror-bw',
    character: { mode: 'generic' },
    sourcePrompt: null,
  }
  const edited = templateStyleSavePayload(draft)
  assert.deepEqual(edited, {
    id: 'st-plantilla',
    name: 'Plantilla',
    sections: { visualStyle: 'Acuarela', camera: 'Planos abiertos.' },
    templateVersion: 1,
    colorFilter: 'horror-bw',
    character: { mode: 'generic' },
  })
  assert.equal('systemPrompt' in edited, false)
  assert.equal('shots' in edited, false)
  const rebuilt = templateStyleSavePayload({
    ...draft,
    sourcePrompt: 'mi gema',
  })
  assert.equal(rebuilt.sourcePrompt, 'mi gema')
})

test('inglés: frases en inglés, aunque tengan un nombre con tilde', () => {
  for (const text of [
    'A 40-year-old man with gray hair. Outfit: navy blazer and brown leather boots.',
    'Sofía, a young woman with dark hair. Outfit: a red coat.',
    'Cinematic still, 35mm film grain',
    'Do not show any text in the image',
  ])
    assert.equal(looksEnglish(text), true, text)
})

test('inglés: español o portugués se detectan', () => {
  for (const text of [
    'Hombre de 40 años, pelo canoso, lleva un saco azul.',
    'Hombre de 40 años, pelo canoso. Outfit: saco azul.',
    'Mulher jovem de cabelo cacheado, veste uma jaqueta verde.',
    'Ilustración acuarela',
    'Un hombre alto',
  ])
    assert.equal(looksEnglish(text), false, text)
})

test('solo se avisan las secciones en inglés con texto que no lo parece', () => {
  assert.deepEqual(
    nonEnglishSectionKeys({
      visualStyle: 'Acuarela con tinta suelta, en español a propósito.',
      character: 'Hombre de 40 años, lleva un saco azul.',
      promptStart: 'Editorial watercolor illustration,',
      promptEnd: '   ',
    }),
    ['character'],
  )
  assert.deepEqual(
    nonEnglishSectionKeys({
      visualStyle: 'x',
      promptEnd: 'con grano de película',
    }),
    ['promptEnd'],
  )
  assert.deepEqual(
    nonEnglishSectionKeys({
      visualStyle: 'x',
      promptStart: 'Ilustración editorial,',
    }),
    ['promptStart'],
  )
})

test('el snapshot de una gema vieja es exactamente el de antes', () => {
  const selected = selectedCustomStyleFrom(OLD_GEM)
  assert.equal(
    JSON.stringify(selected),
    JSON.stringify({
      styleId: 'st-vieja',
      name: 'Vieja',
      systemPrompt: 'Acuarela editorial con tinta suelta.',
      shots: ['Wide shot'],
      character: { mode: 'own', defaultCharacterId: 'ana' },
    }),
  )
})

test('el snapshot de una gema de plantilla lleva secciones, versión y filtro', () => {
  assert.deepEqual(selectedCustomStyleFrom(TEMPLATE_GEM), {
    styleId: 'st-plantilla',
    name: 'Plantilla',
    systemPrompt: '',
    shots: [],
    sections: TEMPLATE_GEM.sections,
    templateVersion: 1,
    colorFilter: 'fantasy',
  })
})

test('el borrador del modal sale de la tarjeta, vieja o de plantilla', () => {
  assert.deepEqual(customStyleDraftFrom(OLD_GEM), {
    name: 'Vieja',
    systemPrompt: 'Acuarela editorial con tinta suelta.',
    shots: ['Wide shot'],
    character: { mode: 'own', defaultCharacterId: 'ana' },
  })
  assert.deepEqual(customStyleDraftFrom(TEMPLATE_GEM), {
    name: 'Plantilla',
    systemPrompt: '',
    shots: [],
    sections: TEMPLATE_GEM.sections,
    templateVersion: 1,
    colorFilter: 'fantasy',
  })
})
