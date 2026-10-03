// El preview de un personaje con un estilo del catálogo (plan E2, decisión
// P6). Un id nuevo del catálogo escribe el retrato con las secciones de su
// gema por el mismo camino que una gema de plantilla de Mi estilo (el texto
// de la gema más las reglas de la casa, y las frases fijas pegadas por
// código), sin leer la galería. Los 5 ids heredados siguen con su plantilla
// fija de siempre, sin LLM, aunque también estén en el catálogo. Un id `st-…`
// sigue leyendo `_styles/`. HTTP interceptado: sin red.

import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { generateCharacterPreview } from '../../pipeline/commands/characters/generate-character-preview.ts'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import { CATALOG_GEMS } from '../../pipeline/prompts/catalog-gems/catalog.ts'
import {
  buildCustomPreviewRequest,
  buildPreviewScene,
} from '../../pipeline/prompts/character-preview.ts'
import { composeGemText } from '../../pipeline/prompts/template-frame.ts'
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
  'Full-body view of Elena standing on a plain neutral background.'
const legacyGems = CATALOG_GEMS.filter((gem) =>
  Object.hasOwn(VISUAL_STYLES, gem.id),
)
const newGems = CATALOG_GEMS.filter(
  (gem) => !Object.hasOwn(VISUAL_STYLES, gem.id),
)

// Sin projectsRoot salvo que el caso lo pida: leer la galería fallaría con
// missing_projects_root.
function context(styleId, projectsRoot) {
  return {
    job: {
      jobId: 'fixture',
      projectsRoot,
      apiKeys: { deepinfra: 'fixture', fal: 'fixture' },
      binaryPaths: {},
      payload: { styleId, identityPrompt, provider: 'fal' },
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
// Spec §5.4: inicio fijo, escena y final fijo, separados por un espacio.
function withFixedPhrases(sections) {
  return [sections.promptStart, scenePrompt, sections.promptEnd]
    .filter(Boolean)
    .join(' ')
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
      composeGemText(gem.sections) + '\n\n' + GLOBAL_RULES,
      gem.id,
    )
    assert.equal(user.content, buildCustomPreviewRequest(identityPrompt))
    assert.equal(result.finalPrompt, withFixedPhrases(gem.sections), gem.id)
    assert.equal(requests.images[0].prompt, result.finalPrompt, gem.id)
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

  for (const styleId of ['st-borrado', 'noir-inexistente'])
    await assert.rejects(generateCharacterPreview(context(styleId, root)), {
      code: 'style_not_found',
    })
})
