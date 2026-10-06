// El borrador de un estilo del catálogo en manos del admin (Entrega 3,
// ADR-0049, plan E3 tareas C2 a C4): cómo nace de la respuesta del agente, las
// etiquetas que la app pone sola, el id sugerido, qué falta para publicar, el
// distintivo de la tarjeta, de dónde salen las muestras, la paleta espejada y
// los textos de cada error del servidor. Módulos puros de src/ corridos con
// Node (type stripping), sin bundler.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { CATALOG_TAGS } from '../../pipeline/prompts/catalog-gems/tags.ts'
import {
  catalogAdminBadge,
  catalogAdminSampleImages,
  catalogDraftFromRebuild,
  catalogDraftProblems,
  catalogGemFromContent,
  catalogModesFrom,
  catalogPublishBlockers,
  catalogTagSlots,
  emptyCatalogDraft,
  isCatalogStyleId,
  normalizedCatalogDraft,
  readAdminCatalogListResponse,
  readAdminCatalogStyleResponse,
  suggestedCatalogStyleId,
  withBehaviorTags,
} from '../../src/modules/videos/utilities/catalogAdminDraft.ts'
import {
  CATALOG_TAG_CHOICES,
  CATALOG_TAG_PALETTE,
  DYNAMISM_TAG,
  FIXED_CHARACTER_TAG,
} from '../../src/modules/videos/utilities/catalogTagPalette.ts'

const CHARACTER =
  'A short round robot with a single blue eye and rubber arms. Outfit: a yellow raincoat and red boots.'

const REBUILD = {
  templateVersion: 1,
  sections: {
    visualStyle: 'Chalk drawings on a blackboard.',
    character: CHARACTER,
    dynamism: 'Every scene shows the character mid-action.',
  },
  suggestions: { allowedModes: ['own', 'generic'], characterMode: 'generic' },
  warnings: [],
}

const FULL = {
  name: { es: 'Tiza', en: 'Chalk', pt: 'Giz' },
  tags: [DYNAMISM_TAG, FIXED_CHARACTER_TAG, CATALOG_TAG_PALETTE.twoD],
  sections: REBUILD.sections,
  templateVersion: 1,
  allowedModes: ['generic', 'own'],
  sampleMode: 'generic',
  colorFilter: 'none',
  samples: { revision: 2, count: 4 },
}

test('la paleta espejada coincide etiqueta por etiqueta con la del sidecar', () => {
  assert.deepEqual(CATALOG_TAG_PALETTE, CATALOG_TAGS)
  assert.deepEqual(DYNAMISM_TAG, CATALOG_TAGS.dynamism)
  assert.deepEqual(FIXED_CHARACTER_TAG, CATALOG_TAGS.fixedCharacter)
  assert.equal(CATALOG_TAG_CHOICES.length, Object.keys(CATALOG_TAGS).length - 2)
  assert.ok(!CATALOG_TAG_CHOICES.some((tag) => tag.es === 'Dinamismo'))
})

test('el borrador nace del agente: secciones, modos sugeridos y etiquetas de comportamiento solas', () => {
  const draft = catalogDraftFromRebuild(REBUILD)
  assert.deepEqual(draft.name, { es: '', en: '', pt: '' })
  assert.deepEqual(draft.tags, [DYNAMISM_TAG, FIXED_CHARACTER_TAG])
  assert.equal(draft.sections, REBUILD.sections)
  assert.deepEqual(draft.allowedModes, ['generic', 'own'])
  assert.equal(draft.sampleMode, 'generic')
  assert.equal(draft.colorFilter, 'none')
  assert.deepEqual(draft.samples, { revision: 0, count: 0 })
  assert.equal(draft.templateVersion, 1)
})

test('los modos: sin sugerencia van los tres; solo «Mi personaje» suma el genérico para las muestras', () => {
  assert.deepEqual(catalogModesFrom(undefined, undefined), {
    allowedModes: ['generic', 'own', 'none'],
    sampleMode: 'generic',
  })
  assert.deepEqual(catalogModesFrom(['own'], 'own'), {
    allowedModes: ['generic', 'own'],
    sampleMode: 'generic',
  })
  assert.deepEqual(catalogModesFrom(['none', 'own', 'none'], 'none'), {
    allowedModes: ['own', 'none'],
    sampleMode: 'none',
  })
  // El modo sugerido para las muestras tiene que estar permitido.
  assert.equal(catalogModesFrom(['generic'], 'none').sampleMode, 'generic')
})

test('«Dinamismo» y «Personaje fijo» entran y salen con sus secciones, al frente y sin repetidas', () => {
  const twoD = CATALOG_TAG_PALETTE.twoD
  assert.deepEqual(
    withBehaviorTags({
      tags: [twoD, FIXED_CHARACTER_TAG, twoD],
      sections: { visualStyle: 'x', dynamism: 'y' },
    }),
    [DYNAMISM_TAG, twoD],
  )
  assert.deepEqual(
    withBehaviorTags({ tags: [DYNAMISM_TAG], sections: { visualStyle: 'x' } }),
    [],
  )
  assert.deepEqual(
    withBehaviorTags({
      tags: [],
      sections: { visualStyle: 'x', character: CHARACTER, dynamism: '  ' },
    }),
    [FIXED_CHARACTER_TAG],
  )
  assert.equal(catalogTagSlots({ tags: [], sections: REBUILD.sections }), 3)
  assert.equal(catalogTagSlots({ tags: [], sections: { visualStyle: 'x' } }), 5)
})

test('el id sugerido sale del nombre y cumple el patrón del catálogo', () => {
  assert.equal(suggestedCatalogStyleId('Tiza y Pizarrón'), 'tiza-y-pizarron')
  assert.equal(
    suggestedCatalogStyleId('  Noir — Detective 2 '),
    'noir-detective-2',
  )
  assert.equal(suggestedCatalogStyleId('Stop motion'), 'stop-motion')
  assert.equal(suggestedCatalogStyleId('st-algo'), 'estilo-algo')
  assert.equal(suggestedCatalogStyleId('¡¡¡'), '')
  assert.equal(suggestedCatalogStyleId('a'.repeat(60)).length, 40)
  assert.equal(isCatalogStyleId('tiza'), true)
  assert.equal(isCatalogStyleId('pov_stickman'), true)
  assert.equal(isCatalogStyleId('st-123'), false)
  // «traducir» chocaría con la ruta del servidor: no vale y se sugiere otro.
  assert.equal(isCatalogStyleId('traducir'), false)
  assert.equal(suggestedCatalogStyleId('Traducir'), 'estilo-traducir')
  assert.equal(isCatalogStyleId('Tiza'), false)
  assert.equal(isCatalogStyleId(''), false)
})

test('qué le falta a un borrador para publicarse', () => {
  assert.deepEqual(catalogPublishBlockers(FULL), [])
  assert.deepEqual(
    catalogPublishBlockers({
      ...FULL,
      name: { es: 'Tiza', en: '', pt: ' ' },
      samples: { revision: 0, count: 0 },
    }),
    ['nameEn', 'namePt', 'samples'],
  )
  assert.deepEqual(
    catalogPublishBlockers({
      ...FULL,
      sections: { visualStyle: ' ', character: 'A robot with rubber arms.' },
    }),
    ['visualStyle', 'characterOutfit'],
  )
  assert.deepEqual(
    catalogPublishBlockers({
      ...FULL,
      sections: {
        ...FULL.sections,
        promptStart: 'Write in [IDIOMA DEL GUION].',
        promptEnd: 'Scene [N] of the story.',
      },
    }),
    ['placeholder'],
  )
  assert.deepEqual(
    catalogPublishBlockers({
      ...FULL,
      sections: { ...FULL.sections, character: `${CHARACTER} [age]` },
    }),
    ['characterOutfit', 'placeholder'],
  )
})

test('qué impide guardar: id, estilo visual, etiquetas y modos', () => {
  assert.deepEqual(catalogDraftProblems('tiza', FULL), [])
  const empty = emptyCatalogDraft()
  assert.deepEqual(catalogDraftProblems('', empty), ['id', 'visualStyle'])
  assert.deepEqual(
    catalogDraftProblems('tiza', {
      ...FULL,
      tags: Array.from({ length: 6 }, (_, i) => ({
        es: `t${i}`,
        en: `t${i}`,
        pt: `t${i}`,
      })),
    }),
    ['tags'],
  )
  assert.deepEqual(
    catalogDraftProblems('tiza', {
      ...FULL,
      tags: [{ es: 'x'.repeat(25), en: 'x', pt: 'x' }],
    }),
    ['tagLabel'],
  )
  assert.deepEqual(
    catalogDraftProblems('tiza', {
      ...FULL,
      allowedModes: ['own'],
      sampleMode: 'generic',
    }),
    ['modes'],
  )
  assert.deepEqual(
    catalogDraftProblems('tiza', {
      ...FULL,
      name: { ...FULL.name, es: 'x'.repeat(81) },
    }),
    ['name'],
  )
})

test('el borrador normalizado recorta los nombres y pone las etiquetas de comportamiento', () => {
  const normalized = normalizedCatalogDraft({
    ...FULL,
    name: { es: ' Tiza ', en: 'Chalk', pt: 'Giz ' },
    tags: [CATALOG_TAG_PALETTE.twoD],
  })
  assert.deepEqual(normalized.name, { es: 'Tiza', en: 'Chalk', pt: 'Giz' })
  assert.deepEqual(normalized.tags, [
    DYNAMISM_TAG,
    FIXED_CHARACTER_TAG,
    CATALOG_TAG_PALETTE.twoD,
  ])
})

test('el borrador se ve como gema en la tarjeta, con las muestras de su tanda', () => {
  const gem = catalogGemFromContent('tiza', FULL)
  assert.equal(gem.id, 'tiza')
  assert.equal(gem.sampleCount, 4)
  assert.equal('samples' in gem, false)
  assert.deepEqual(gem.allowedModes, FULL.allowedModes)

  const base = 'https://p.supabase.co/storage/v1/object/public/previews-gemas'
  assert.deepEqual(catalogAdminSampleImages('tiza', FULL, base), [
    `${base}/tiza/s2/sample-1.jpg`,
    `${base}/tiza/s2/sample-2.jpg`,
    `${base}/tiza/s2/sample-3.jpg`,
    `${base}/tiza/s2/sample-4.jpg`,
  ])
  // Tanda 0: las muestras empaquetadas de la app (las 38 de hoy).
  assert.deepEqual(
    catalogAdminSampleImages(
      'normal',
      { samples: { revision: 0, count: 2 } },
      base,
    ),
    ['/style-references/normal_1.jpg', '/style-references/normal_2.jpg'],
  )
  assert.deepEqual(
    catalogAdminSampleImages(
      'tiza',
      { samples: { revision: 0, count: 0 } },
      base,
    ),
    [],
  )
})

test('el distintivo de la tarjeta del admin', () => {
  assert.equal(
    catalogAdminBadge({
      status: 'hidden',
      published: null,
      unpublishedChanges: true,
    }),
    'unpublished',
  )
  assert.equal(
    catalogAdminBadge({
      status: 'hidden',
      published: FULL,
      unpublishedChanges: false,
    }),
    'hidden',
  )
  assert.equal(
    catalogAdminBadge({
      status: 'published',
      published: FULL,
      unpublishedChanges: true,
    }),
    'changes',
  )
  assert.equal(
    catalogAdminBadge({
      status: 'published',
      published: FULL,
      unpublishedChanges: false,
    }),
    null,
  )
})

const ADMIN_STYLE = {
  id: 'tiza',
  position: 3,
  status: 'published',
  draft: FULL,
  published: FULL,
  publishedVersion: 2,
  publishedAt: '2026-10-06T12:00:00.000Z',
  revision: 7,
  updatedAt: '2026-10-06T12:00:00.000Z',
  updatedBy: 'admin@vimo.click',
  unpublishedChanges: false,
}

test('la lista del admin y un estilo se revisan antes de usarse', () => {
  const base = 'https://p.supabase.co/storage/v1/object/public/previews-gemas'
  assert.deepEqual(
    readAdminCatalogListResponse({
      samplesBaseUrl: base,
      styles: [ADMIN_STYLE],
    }),
    { samplesBaseUrl: base, styles: [ADMIN_STYLE] },
  )
  for (const body of [
    null,
    { styles: [] },
    { samplesBaseUrl: 'http://x', styles: [] },
    { samplesBaseUrl: base, styles: [{ ...ADMIN_STYLE, status: 'draft' }] },
    { samplesBaseUrl: base, styles: [{ ...ADMIN_STYLE, revision: '7' }] },
    { samplesBaseUrl: base, styles: [{ ...ADMIN_STYLE, draft: null }] },
  ])
    assert.equal(readAdminCatalogListResponse(body), null, JSON.stringify(body))
  assert.deepEqual(
    readAdminCatalogStyleResponse({ style: ADMIN_STYLE }),
    ADMIN_STYLE,
  )
  assert.equal(readAdminCatalogStyleResponse({ style: { id: 'x' } }), null)
  assert.equal(readAdminCatalogStyleResponse(ADMIN_STYLE), null)
})

test('cada código del servidor del catálogo tiene su texto en los tres idiomas', () => {
  const constants = readFileSync(
    new URL('../../src/modules/videos/constants.ts', import.meta.url),
    'utf8',
  )
  const block = constants.slice(
    constants.indexOf('CATALOG_SERVER_ERROR_MESSAGE_KEYS'),
    constants.indexOf('UNKNOWN_CATALOG_SERVER_ERROR_KEY'),
  )
  const keys = [
    ...block.matchAll(/'(create\.catalogAdmin\.errors\.[a-zA-Z]+)'/g),
  ].map((match) => match[1])
  assert.ok(keys.length >= 16, `códigos encontrados: ${keys.length}`)
  for (const locale of ['es', 'en', 'pt']) {
    const catalog = JSON.parse(
      readFileSync(
        new URL(`../../public/locales/${locale}.json`, import.meta.url),
        'utf8',
      ),
    )
    for (const key of [...keys, 'create.catalogAdmin.errors.unknown']) {
      const text = key.split('.').reduce((node, part) => node?.[part], catalog)
      assert.equal(typeof text, 'string', `${locale}: ${key}`)
      assert.ok(text.trim(), `${locale}: ${key} vacío`)
    }
  }
})
