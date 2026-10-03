// El snapshot de una gema de plantilla en el proyecto (spec §4.2): create-
// video-project exige exactamente uno de `sections` o `systemPrompt`, con los
// límites de la galería, el filtro de color, la versión y el id del catálogo.
// Los usos que reciben «la gema como texto» (el estilo del fallback de
// imágenes y el preview de un personaje) usan `composeGemText`. Una gema
// vieja sigue igual. Un proyecto de una gema del catálogo (plan E2 §5.4) es
// coherente: el snapshot lleva el id de la gema como `styleId` y
// `catalogStyleId`, y `options.styleId` es ese id si la gema es heredada o
// 'normal' si es nueva.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import { createVideoProject } from '../../pipeline/commands/videos/create-video-project.ts'
import { generateCharacterPreview } from '../../pipeline/commands/characters/generate-character-preview.ts'
import { findCatalogGem } from '../../pipeline/prompts/catalog-gems/catalog.ts'
import { buildCustomStyleSystemPrompt } from '../../pipeline/prompts/custom-style.ts'
import { composeGemText } from '../../pipeline/prompts/template-frame.ts'
import { GLOBAL_RULES } from '../../pipeline/prompts/visual-styles.ts'
import { resolveProjectStyle } from '../../pipeline/stages/shared/project-style.ts'

const sections = {
  visualStyle: 'Simple stickman drawings on colorful backgrounds.',
  character:
    'A stickman doll with a round white head. Outfit: white gloves and white shoes.',
  camera: 'Alternate wide shots and close-ups.',
  promptStart: 'A simple stickman doll drawing:',
  promptEnd: 'Clean black lines on a colorful background.',
}
const bytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFOsAAAAASUVORK5CYII=',
  'base64',
)
const scenePrompt =
  'Full-body view of Elena standing on a plain neutral background.'

async function projectsRoot(t) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-gem-snapshot-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}
function context(root, payload, apiKeys = {}) {
  return {
    job: {
      jobId: 'fixture',
      projectsRoot: root,
      apiKeys,
      binaryPaths: {},
      payload,
    },
    config: resolvePipelineConfig(),
    signal: new AbortController().signal,
    emitter: { emit() {} },
  }
}
function create(root, customStyle, options = {}) {
  return createVideoProject(
    context(root, {
      name: 'Gema de plantilla',
      script: 'Una historia corta para probar la gema por secciones.',
      options: {
        styleId: 'normal',
        sceneCount: 0,
        narrationMode: 'tts',
        imageProvider: 'fal',
        useBgm: false,
        useOverlay: false,
        confirmScenes: false,
        customStyle,
        ...options,
      },
    }),
  )
}
const template = (extra = {}) => ({
  styleId: 'st-stickman',
  name: 'Stickman',
  sections,
  templateVersion: 1,
  colorFilter: 'fantasy',
  character: { mode: 'generic' },
  ...extra,
})

// Una gema guardada en la galería, como la deja style-save.
async function writeStyle(root, styleId, stored) {
  const directory = join(root, '_styles', styleId)
  await mkdir(directory, { recursive: true })
  await writeFile(
    join(directory, 'style.json'),
    JSON.stringify({
      shots: [],
      createdAt: '2026-09-30T00:00:00.000Z',
      ...stored,
    }),
  )
}
// El LLM responde `modelPrompt` como prompt del retrato y Fal devuelve una
// imagen: se guardan los pedidos para mirar qué recibió cada uno.
function mockProviders(t, modelPrompt) {
  const requests = { text: [], images: [] }
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    const target = String(url)
    if (target.includes('chat/completions')) {
      requests.text.push(JSON.parse(init.body))
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({ prompt_imagen: modelPrompt }),
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
function preview(root, styleId) {
  return generateCharacterPreview(
    context(
      root,
      {
        styleId,
        identityPrompt: 'Elena, a young woman with curly red hair.',
        provider: 'fal',
      },
      { deepinfra: 'fixture', fal: 'fixture' },
    ),
  )
}
function occurrences(text, phrase) {
  return text.toLowerCase().split(phrase.toLowerCase()).length - 1
}

// ── create-video-project ──

// Con `catalogStyleId` el snapshot es el de una gema del catálogo (plan E2
// §5.4): su `styleId` es el de la gema y, si es heredada, también
// `options.styleId`.
test('a template snapshot is accepted and stored as sent', async (t) => {
  const root = await projectsRoot(t)
  const { projectDir } = await create(
    root,
    template({ styleId: 'pov_stickman', catalogStyleId: 'pov_stickman' }),
    { styleId: 'pov_stickman' },
  )
  const metadata = JSON.parse(
    await readFile(join(projectDir, 'project.json'), 'utf8'),
  )
  assert.deepEqual(metadata.options.customStyle.sections, sections)
  assert.equal(metadata.options.customStyle.templateVersion, 1)
  assert.equal(metadata.options.customStyle.colorFilter, 'fantasy')
  assert.equal(metadata.options.customStyle.catalogStyleId, 'pov_stickman')
  assert.equal(metadata.options.customStyle.systemPrompt, undefined)
})

test('an old gem snapshot is still accepted', async (t) => {
  const root = await projectsRoot(t)
  await create(root, {
    styleId: 'st-legacy',
    name: 'Watercolor',
    systemPrompt: 'Render every scene as a watercolor.',
    shots: ['Wide shot'],
    character: { mode: 'none' },
  })
})

test('a new catalog id with the gallery pattern is accepted', async (t) => {
  const root = await projectsRoot(t)
  await create(root, template({ styleId: 'noir', catalogStyleId: 'noir' }))
})

// Cada rechazo con su mensaje exacto: sin él, un caso podía pasar por otro
// motivo (antes de las secciones, toda gema sin `systemPrompt` se rechazaba).
for (const [name, customStyle, message] of [
  [
    'both kinds of gem',
    template({ systemPrompt: 'Watercolor.' }),
    'options.customStyle takes systemPrompt or sections, never both',
  ],
  [
    'neither kind of gem',
    template({ sections: undefined, templateVersion: undefined }),
    'options.customStyle needs systemPrompt or sections',
  ],
  ['no name', template({ name: '  ' }), 'options.customStyle needs a name'],
  [
    'a blank visual style',
    template({ sections: { ...sections, visualStyle: ' ' } }),
    'options.customStyle.sections.visualStyle is required',
  ],
  [
    'a section over 12 000',
    template({ sections: { visualStyle: 'x'.repeat(12_001) } }),
    'options.customStyle.sections.visualStyle exceeds 12000 characters',
  ],
  [
    'a character over 700',
    template({ sections: { ...sections, character: 'x'.repeat(701) } }),
    'options.customStyle.sections.character exceeds 700 characters',
  ],
  [
    'a fixed end over 600',
    template({ sections: { ...sections, promptEnd: 'x'.repeat(601) } }),
    'options.customStyle.sections.promptEnd exceeds 600 characters',
  ],
  [
    'a newer template version',
    template({ templateVersion: 2 }),
    'options.customStyle.templateVersion must be an integer between 1 and 1',
  ],
  [
    'a template version on an old gem',
    {
      styleId: 'st-legacy',
      name: 'Old',
      systemPrompt: 'Watercolor.',
      templateVersion: 1,
    },
    'options.customStyle.templateVersion only applies to sections',
  ],
  [
    'an unknown color filter',
    template({ colorFilter: 'sepia' }),
    'options.customStyle.colorFilter must be one of none, fantasy, horror-bw',
  ],
  [
    'an unsafe catalog id',
    template({ catalogStyleId: '../evil' }),
    'options.customStyle.catalogStyleId is not a valid style id',
  ],
  [
    'a catalog id with an underscore that is not a legacy one',
    template({ catalogStyleId: 'my_style' }),
    'options.customStyle.catalogStyleId is not a valid style id',
  ],
]) {
  test('create-video-project rejects ' + name, async (t) => {
    const root = await projectsRoot(t)
    await assert.rejects(create(root, customStyle), {
      code: 'invalid_payload',
      message,
    })
  })
}

// ── El proyecto de una gema del catálogo (plan E2 §5.4) ──

const povStickman = findCatalogGem('pov_stickman')
const infographic = findCatalogGem('infografico-amarillo')
// El snapshot que arma la app para una gema del catálogo (en el modo con el
// que salieron sus muestras) y las opciones del carril de Mi estilo.
function catalogSnapshot(gem, extra = {}) {
  return {
    styleId: gem.id,
    catalogStyleId: gem.id,
    name: gem.name.es,
    sections: gem.sections,
    templateVersion: gem.templateVersion,
    colorFilter: gem.colorFilter,
    character: { mode: gem.sampleMode },
    ...extra,
  }
}
const catalogLane = { secondsPerScene: 3, promptModel: 'fixture/prompt-model' }
async function storedOptions(projectDir) {
  const metadata = JSON.parse(
    await readFile(join(projectDir, 'project.json'), 'utf8'),
  )
  return metadata.options
}

test('a project of a legacy catalog gem keeps the gem id as options.styleId', async (t) => {
  const root = await projectsRoot(t)
  const { projectDir } = await create(root, catalogSnapshot(povStickman), {
    ...catalogLane,
    styleId: 'pov_stickman',
  })
  const options = await storedOptions(projectDir)
  assert.equal(options.styleId, 'pov_stickman')
  assert.deepEqual(options.customStyle, catalogSnapshot(povStickman))
})

test('a project of a new catalog gem travels as normal', async (t) => {
  const root = await projectsRoot(t)
  const { projectDir } = await create(
    root,
    catalogSnapshot(infographic),
    catalogLane,
  )
  const options = await storedOptions(projectDir)
  assert.equal(options.styleId, 'normal')
  assert.equal(options.customStyle.catalogStyleId, 'infografico-amarillo')
  assert.deepEqual(options.customStyle, catalogSnapshot(infographic))
})

const legacyStyleIdMessage =
  'options.styleId must equal options.customStyle.catalogStyleId for a legacy catalog style'
const newStyleIdMessage =
  'options.styleId must be normal for a new catalog style'
const nameMessage = 'options.customStyle.name exceeds 80 characters'

for (const [name, customStyle, options, message] of [
  [
    'a legacy catalog gem sent as normal',
    catalogSnapshot(povStickman),
    { styleId: 'normal' },
    legacyStyleIdMessage,
  ],
  [
    'a legacy catalog gem sent as another legacy style',
    catalogSnapshot(povStickman),
    { styleId: 'cartoon' },
    legacyStyleIdMessage,
  ],
  [
    'a new catalog gem sent as a legacy style',
    catalogSnapshot(infographic),
    { styleId: 'cartoon' },
    newStyleIdMessage,
  ],
  [
    'a snapshot whose styleId is not its catalogStyleId',
    catalogSnapshot(infographic, { styleId: 'st-copia' }),
    {},
    'options.customStyle.styleId must equal options.customStyle.catalogStyleId',
  ],
  [
    'a catalog gem name over 80',
    catalogSnapshot(infographic, { name: 'x'.repeat(81) }),
    {},
    nameMessage,
  ],
  // `constructor` cumple el patrón de la galería y es una propiedad heredada
  // de cualquier objeto: no es uno de los 5 heredados.
  [
    'an inherited object property sent as a legacy catalog style',
    catalogSnapshot(infographic, {
      styleId: 'constructor',
      catalogStyleId: 'constructor',
    }),
    { styleId: 'pov_stickman' },
    newStyleIdMessage,
  ],
  // Y tampoco es un `options.styleId` válido: `isCharacterStyleId` busca la
  // propiedad propia de VISUAL_STYLES (con `in` pasaba y el estilo resuelto
  // era la función Object).
  [
    'an inherited object property as options.styleId',
    template(),
    { styleId: 'constructor' },
    'unknown styleId "constructor"',
  ],
  // El tope del nombre es el de la galería: vale también para Mi estilo.
  [
    'a gallery style name over 80',
    template({ name: 'x'.repeat(81) }),
    {},
    nameMessage,
  ],
]) {
  test('create-video-project rejects ' + name, async (t) => {
    const root = await projectsRoot(t)
    await assert.rejects(
      create(root, customStyle, { ...catalogLane, ...options }),
      { code: 'invalid_payload', message },
    )
  })
}

// ── La gema como texto ──

test('the project style of a template gem is its text plus the house rules; an old gem is unchanged', () => {
  const options = (customStyle) => ({
    styleId: 'normal',
    sceneCount: 0,
    narrationMode: 'tts',
    imageProvider: 'fal',
    useBgm: false,
    useOverlay: false,
    confirmScenes: false,
    customStyle,
  })
  assert.equal(
    resolveProjectStyle(options(template({ shots: ['Wide shot'] })))
      .systemPrompt,
    composeGemText(sections) + '\n\n' + GLOBAL_RULES,
    'la sección de cámara reemplaza a los planos',
  )
  assert.equal(
    buildCustomStyleSystemPrompt({
      systemPrompt: 'Watercolor.',
      shots: ['Wide shot'],
    }),
    'Watercolor.\n\n# ALLOWED SHOTS (use ONLY these framings)\n- Wide shot\n\n' +
      GLOBAL_RULES,
  )
})

test('the character preview of a template gem writes with the gem text and carries the fixed phrases', async (t) => {
  const root = await projectsRoot(t)
  await writeStyle(root, 'st-stickman', {
    name: 'Stickman',
    sections,
    templateVersion: 1,
  })
  const requests = mockProviders(t, scenePrompt)
  const result = await preview(root, 'st-stickman')
  assert.equal(
    requests.text[0].messages[0].content,
    composeGemText(sections) + '\n\n' + GLOBAL_RULES,
  )
  assert.ok(
    !requests.text[0].messages[0].content.includes(
      'stickman doll with a round white head',
    ),
  )
  assert.equal(
    result.finalPrompt,
    sections.promptStart + ' ' + scenePrompt + ' ' + sections.promptEnd,
  )
  assert.equal(requests.images[0].prompt, result.finalPrompt)
})

// El texto de la gema le MUESTRA al modelo las frases fijas: si las copia en
// el retrato, se quita esa copia antes de pegarlas y cada una va una vez.
test('the character preview strips a copy of the fixed phrases the model wrote before pasting them', async (t) => {
  const root = await projectsRoot(t)
  await writeStyle(root, 'st-stickman', {
    name: 'Stickman',
    sections,
    templateVersion: 1,
  })
  const requests = mockProviders(
    t,
    `${sections.promptStart.toLowerCase()} ${scenePrompt} ${sections.promptEnd}`,
  )
  const result = await preview(root, 'st-stickman')
  assert.equal(
    result.finalPrompt,
    sections.promptStart + ' ' + scenePrompt + ' ' + sections.promptEnd,
  )
  assert.equal(occurrences(result.finalPrompt, sections.promptStart), 1)
  assert.equal(occurrences(result.finalPrompt, sections.promptEnd), 1)
  assert.equal(requests.images[0].prompt, result.finalPrompt)
})

test('the character preview of an old gem is unchanged: its text, its shots and the prompt as the model wrote it', async (t) => {
  const root = await projectsRoot(t)
  await writeStyle(root, 'st-legacy', {
    name: 'Watercolor',
    systemPrompt: 'Render every scene as a watercolor.',
    shots: ['Wide shot'],
  })
  const modelPrompt = `${sections.promptStart} ${scenePrompt}`
  const requests = mockProviders(t, modelPrompt)
  const result = await preview(root, 'st-legacy')
  assert.equal(
    requests.text[0].messages[0].content,
    'Render every scene as a watercolor.\n\n# ALLOWED SHOTS (use ONLY these framings)\n- Wide shot\n\n' +
      GLOBAL_RULES,
  )
  assert.equal(result.finalPrompt, modelPrompt)
  assert.equal(requests.images[0].prompt, modelPrompt)
})
