// El preview de un personaje con un estilo del catálogo (plan E2, decisión
// P6). Un id nuevo del catálogo escribe el retrato con las secciones de su
// gema por el mismo camino que una gema de plantilla de Mi estilo (el texto
// de la gema más las reglas de la casa, la descripción tejida y las frases
// fijas pegadas por código; el modelo y el tejido los fija
// check-custom-style-portrait.mjs), sin leer la galería. Un retrato no tiene guion: el marcador de
// idioma de las frases fijas (`[IDIOMA DEL GUION]`) viaja con el texto neutro,
// en lo que lee el modelo y en lo que se pega. Los 5 ids heredados siguen con su plantilla
// fija de siempre, sin LLM, aunque también estén en el catálogo. Un id `st-…`
// sigue leyendo `_styles/`. Con el catálogo remoto (ADR-0049, plan E3 tarea
// A4) la gema sale primero del catálogo sincronizado en `_catalog/`: un
// estilo que solo existe ahí, o una gema de la semilla publicada de nuevo,
// escriben el retrato con sus secciones sincronizadas. HTTP interceptado: sin
// red.

import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { generateCharacterPreview } from '../../pipeline/commands/characters/generate-character-preview.ts'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import {
  CATALOG_GEMS,
  findCatalogGem,
} from '../../pipeline/prompts/catalog-gems/catalog.ts'
import { buildPreviewScene } from '../../pipeline/prompts/character-preview.ts'
import {
  composeGemText,
  fixedPhrasesInLanguage,
  UNDETECTED_SCRIPT_LANGUAGE,
} from '../../pipeline/prompts/template-frame.ts'
import { DESCRIPTION_HEADER } from '../../pipeline/prompts/verbatim-identity.ts'
import {
  GLOBAL_RULES,
  VISUAL_STYLES,
  assembleUserScenePrompt,
} from '../../pipeline/prompts/visual-styles.ts'

const bytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFOsAAAAASUVORK5CYII=',
  'base64',
)
const identityPrompt = 'Elena, a young woman with curly red hair.'
const scenePrompt =
  'Full-body view of [subject] standing on a plain neutral background.'
const legacyGems = CATALOG_GEMS.filter((gem) =>
  Object.hasOwn(VISUAL_STYLES, gem.id),
)
const newGems = CATALOG_GEMS.filter(
  (gem) => !Object.hasOwn(VISUAL_STYLES, gem.id),
)

// Sin projectsRoot salvo que el caso lo pida: leer la galería fallaría con
// missing_projects_root.
function context(styleId, projectsRoot, remote = false) {
  return {
    job: {
      jobId: 'fixture',
      projectsRoot,
      apiKeys: { deepinfra: 'fixture', fal: 'fixture' },
      binaryPaths: {},
      payload: {
        styleId,
        identityPrompt,
        provider: 'fal',
        ...(remote ? { remote } : {}),
      },
    },
    config: resolvePipelineConfig(),
    signal: new AbortController().signal,
    emitter: { emit() {} },
  }
}
// El LLM responde `scenePrompt` como prompt del retrato y Fal devuelve una
// imagen: se guardan los pedidos para mirar qué recibió cada uno.
function mockProviders(t) {
  const requests = { text: [], images: [] }
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    const target = String(url)
    if (target.includes('chat/completions')) {
      requests.text.push(JSON.parse(init.body))
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({ prompt_imagen: scenePrompt }),
            },
          },
        ],
      })
    }
    if (target.startsWith('https://fal.run/')) {
      requests.images.push(JSON.parse(init.body))
      return Response.json({ images: [{ url: 'https://fixture.invalid/x' }] })
    }
    return new Response(bytes, { headers: { 'content-type': 'image/png' } })
  })
  return requests
}
// Spec §5.4: inicio fijo, escena con la descripción tejida y final fijo,
// separados por un espacio. Las secciones como las usa el retrato: sin guion,
// el marcador de idioma de las frases fijas queda con el texto neutro.
function portraitSections(sections) {
  return { ...sections, ...fixedPhrasesInLanguage(sections, '') }
}
function withFixedPhrases(sections) {
  const pasted = portraitSections(sections)
  const woven = `${scenePrompt.replace('[subject]', 'the character')} ${DESCRIPTION_HEADER} ${identityPrompt}`
  return [pasted.promptStart, woven, pasted.promptEnd].filter(Boolean).join(' ')
}

test('the catalog has legacy and new ids to preview', () => {
  assert.equal(legacyGems.length, Object.keys(VISUAL_STYLES).length)
  assert.ok(newGems.length > 0)
})

test('every new catalog id writes the portrait with its gem, without reading the gallery', async (t) => {
  const requests = mockProviders(t)
  for (const gem of newGems) {
    requests.text.length = 0
    requests.images.length = 0
    const result = await generateCharacterPreview(context(gem.id))

    assert.equal(requests.text.length, 1, gem.id)
    const [system, user] = requests.text[0].messages
    assert.equal(
      system.content,
      composeGemText(portraitSections(gem.sections)) + '\n\n' + GLOBAL_RULES,
      gem.id,
    )
    // El modelo escribe la escena del retrato con `[subject]` y nunca ve la
    // descripción: se teje después, palabra por palabra.
    assert.ok(!user.content.includes('curly red hair'), gem.id)
    assert.match(user.content, /\[subject\]/, gem.id)
    assert.equal(result.finalPrompt, withFixedPhrases(gem.sections), gem.id)
    assert.equal(requests.images[0].prompt, result.finalPrompt, gem.id)
    // El marcador de idioma nunca llega al generador: con final fijo, el
    // retrato cierra con el texto neutro.
    assert.doesNotMatch(result.finalPrompt, /\[IDIOMA/i, gem.id)
    if (gem.sections.promptEnd?.includes('[IDIOMA DEL GUION]'))
      assert.ok(
        result.finalPrompt.endsWith(
          `it must be written in ${UNDETECTED_SCRIPT_LANGUAGE}.`,
        ),
        gem.id,
      )
  }
})

test('a legacy id keeps its fixed template: the same prompt as today and no LLM', async (t) => {
  const requests = mockProviders(t)
  for (const gem of legacyGems) {
    requests.images.length = 0
    const result = await generateCharacterPreview(context(gem.id))

    assert.equal(
      result.finalPrompt,
      assembleUserScenePrompt(
        VISUAL_STYLES[gem.id],
        buildPreviewScene(identityPrompt, gem.id),
      ),
      gem.id,
    )
    assert.equal(requests.images[0].prompt, result.finalPrompt, gem.id)
  }
  assert.equal(requests.text.length, 0)
})

test('a gallery id still reads _styles, and an unknown id is style_not_found', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'vimo-catalog-preview-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const sections = {
    visualStyle: 'Hand-drawn watercolor with indigo washes.',
    promptEnd: 'Indigo washes on rough paper.',
  }
  const directory = join(root, '_styles', 'st-acuarela')
  await mkdir(directory, { recursive: true })
  await writeFile(
    join(directory, 'style.json'),
    JSON.stringify({
      name: 'Acuarela',
      sections,
      templateVersion: 1,
      shots: [],
      createdAt: '2026-10-02T00:00:00.000Z',
    }),
  )
  const requests = mockProviders(t)

  const result = await generateCharacterPreview(context('st-acuarela', root))
  assert.equal(
    requests.text[0].messages[0].content,
    composeGemText(sections) + '\n\n' + GLOBAL_RULES,
  )
  assert.equal(result.finalPrompt, withFixedPhrases(sections))

  // `constructor` es una propiedad heredada de VISUAL_STYLES, no un id: no
  // va por la plantilla fija (con `in` lo era y el estilo resuelto era la
  // función Object) y, como no está en el catálogo ni en la galería, es
  // style_not_found.
  for (const styleId of ['st-borrado', 'noir-inexistente', 'constructor'])
    await assert.rejects(generateCharacterPreview(context(styleId, root)), {
      code: 'style_not_found',
    })
  assert.equal(requests.text.length, 1)
})

// ── El catálogo sincronizado (ADR-0049) ──

const bola = findCatalogGem('2d-bola')
const crayon = findCatalogGem('2d-crayon')
const fantasia = findCatalogGem('fantasia')
const watercolorSections = {
  ...bola.sections,
  visualStyle: 'Soft watercolor washes on rough paper, with a round gray hero.',
  promptEnd: 'Watercolor on rough paper, soft edges.',
}
const editedCrayonSections = {
  ...crayon.sections,
  visualStyle: 'Thick wax crayon strokes on recycled brown paper.',
}
// El catálogo que dejó la última sincronización (el formato de
// catalog-cache.ts): una gema que solo existe ahí y dos de la semilla
// publicadas de nuevo con otras secciones, todas con las muestras de la app.
async function syncedCatalog(t) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-catalog-preview-sync-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const entry = (gem, overrides) => ({
    ...gem,
    samplesRevision: 0,
    ...overrides,
  })
  await mkdir(join(root, '_catalog'), { recursive: true })
  await writeFile(
    join(root, '_catalog', 'catalog.json'),
    JSON.stringify({
      version: 'version-synced',
      syncedAt: '2026-10-06T12:00:00.000Z',
      entries: [
        entry(bola, {
          id: 'acuarela-nueva',
          name: { es: 'Acuarela', en: 'Watercolor', pt: 'Aquarela' },
          sections: watercolorSections,
          sampleCount: 0,
        }),
        entry(crayon, { sections: editedCrayonSections }),
        entry(fantasia, {
          sections: { ...fantasia.sections, rules: 'Edited rules.' },
        }),
      ],
    }),
  )
  return root
}

test('a style that only exists in the synced catalog writes the portrait with its sections', async (t) => {
  const root = await syncedCatalog(t)
  const requests = mockProviders(t)
  const result = await generateCharacterPreview(
    context('acuarela-nueva', root, true),
  )
  assert.equal(
    requests.text[0].messages[0].content,
    composeGemText(portraitSections(watercolorSections)) +
      '\n\n' +
      GLOBAL_RULES,
  )
  assert.equal(result.finalPrompt, withFixedPhrases(watercolorSections))
})

test('a gem of the seed published again writes the portrait with its synced sections', async (t) => {
  const root = await syncedCatalog(t)
  const requests = mockProviders(t)
  const result = await generateCharacterPreview(
    context('2d-crayon', root, true),
  )
  assert.equal(
    requests.text[0].messages[0].content,
    composeGemText(portraitSections(editedCrayonSections)) +
      '\n\n' +
      GLOBAL_RULES,
  )
  assert.equal(result.finalPrompt, withFixedPhrases(editedCrayonSections))
})

test('a legacy id keeps its fixed template even when it is in the synced catalog', async (t) => {
  const root = await syncedCatalog(t)
  const requests = mockProviders(t)
  const result = await generateCharacterPreview(context('fantasia', root, true))
  assert.equal(
    result.finalPrompt,
    assembleUserScenePrompt(
      VISUAL_STYLES.fantasia,
      buildPreviewScene(identityPrompt, 'fantasia'),
    ),
  )
  assert.equal(requests.text.length, 0)
})

test('without `remote` the portrait ignores the synced catalog: the packaged sections, and a style that only exists in the cache is style_not_found', async (t) => {
  const root = await syncedCatalog(t)
  const requests = mockProviders(t)
  const result = await generateCharacterPreview(context('2d-crayon', root))
  assert.equal(
    requests.text[0].messages[0].content,
    composeGemText(portraitSections(findCatalogGem('2d-crayon').sections)) +
      '\n\n' +
      GLOBAL_RULES,
  )
  assert.equal(
    result.finalPrompt,
    withFixedPhrases(findCatalogGem('2d-crayon').sections),
  )
  await assert.rejects(
    generateCharacterPreview(context('acuarela-nueva', root)),
    { code: 'style_not_found' },
  )
})
