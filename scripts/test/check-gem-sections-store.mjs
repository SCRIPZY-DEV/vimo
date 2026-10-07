// Gemas por secciones en la galería de «Mi estilo» (ADR-0048): style-save
// valida y guarda las secciones con los límites del spec §4.1, una gema es
// vieja o de plantilla (nunca las dos), el respaldo del agente, el filtro de
// color y el origen se conservan cuando la escritura no los trae, y la lectura
// tolera un style.json raro sin romper el listado. Sin HTTP: solo disco
// temporal.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  writeFile,
  rm,
} from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import { styleSave } from '../../pipeline/commands/styles/style-save.ts'
import { stylesList } from '../../pipeline/commands/styles/styles-list.ts'
import {
  CHARACTER_SECTION_CHAR_LIMIT,
  FIXED_PHRASE_CHAR_LIMIT,
  GEM_SECTION_CHAR_LIMIT,
  GEM_SECTIONS_TOTAL_CHAR_LIMIT,
  PROMPT_END_CHAR_LIMIT,
  SYSTEM_PROMPT_CHAR_LIMIT,
  isCatalogStyleId,
  readStyleEntry,
} from '../../pipeline/commands/styles/style-store.ts'
import { GEM_TEMPLATE_VERSION } from '../../pipeline/types/styles.ts'

const sections = {
  visualStyle: '  Hand-drawn watercolor with indigo washes and rough paper.  ',
  character:
    'A curious red-haired girl with freckles and round green glasses. Outfit: a green hoodie and blue jeans.',
  dynamism:
    'Show the protagonist in half of the scenes; use a metaphor or an object in the rest.',
  camera: 'Alternate wide shots and close-ups.',
  rules: 'Never draw text on screens.',
  promptStart: 'Watercolor illustration:',
  promptEnd: 'Indigo washes on rough paper.',
}
const trimmedVisualStyle =
  'Hand-drawn watercolor with indigo washes and rough paper.'

async function galleryRoot(t) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-gem-store-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}
function context(root, payload) {
  return {
    job: {
      jobId: 'fixture',
      projectsRoot: root,
      apiKeys: {},
      binaryPaths: {},
      payload,
    },
    config: resolvePipelineConfig(),
    signal: new AbortController().signal,
    emitter: { emit() {} },
  }
}
function save(root, payload) {
  return styleSave(
    context(root, { id: 'st-fixture', name: 'Acuarela', ...payload }),
  )
}
async function storedJson(root, id = 'st-fixture') {
  return JSON.parse(
    await readFile(join(root, '_styles', id, 'style.json'), 'utf8'),
  )
}
const invalid = { code: 'invalid_payload' }

// ── Límites ──

test('the limits are the ones of the spec', () => {
  assert.equal(GEM_SECTION_CHAR_LIMIT, 12_000)
  assert.equal(GEM_SECTIONS_TOTAL_CHAR_LIMIT, 30_000)
  // Una gema pegada (y el respaldo de la original) puede ser más larga que la
  // suma de las secciones: el agente la condensa.
  assert.equal(SYSTEM_PROMPT_CHAR_LIMIT, 100_000)
  assert.equal(CHARACTER_SECTION_CHAR_LIMIT, 700)
  assert.equal(FIXED_PHRASE_CHAR_LIMIT, 600)
  // El cierre fijo de un estilo clonado lleva su ficha de estilo (ADR-0050):
  // por eso su tope es mayor que el del inicio.
  assert.equal(PROMPT_END_CHAR_LIMIT, 1_000)
})

// ── Guardar una gema de plantilla ──

test('a template gem is saved with trimmed sections, its version and both dates', async (t) => {
  const root = await galleryRoot(t)
  const { entry } = await save(root, {
    sections: { ...sections, camera: '   ' },
    templateVersion: GEM_TEMPLATE_VERSION,
    sourcePrompt: 'La gema completa que pegó el autor.',
    colorFilter: 'fantasy',
  })

  const stored = await storedJson(root)
  assert.equal(stored.systemPrompt, undefined)
  assert.equal(stored.sections.visualStyle, trimmedVisualStyle)
  assert.equal(
    stored.sections.camera,
    undefined,
    'una sección vacía no se guarda',
  )
  assert.equal(stored.templateVersion, GEM_TEMPLATE_VERSION)
  assert.equal(stored.sourcePrompt, 'La gema completa que pegó el autor.')
  assert.equal(stored.colorFilter, 'fantasy')
  assert.ok(Date.parse(stored.createdAt) > 0)
  assert.ok(Date.parse(stored.updatedAt) >= Date.parse(stored.createdAt))

  assert.equal(entry.systemPrompt, undefined)
  assert.deepEqual(entry.sections, stored.sections)
  assert.equal(entry.templateVersion, GEM_TEMPLATE_VERSION)
  assert.equal(entry.colorFilter, 'fantasy')
  const { entries } = await stylesList(context(root))
  assert.deepEqual(
    entries.map((style) => style.id),
    ['st-fixture'],
  )
  assert.deepEqual(entries[0].sections, stored.sections)
})

test('saving sections over an old gem drops its system prompt and keeps its creation date', async (t) => {
  const root = await galleryRoot(t)
  await save(root, { systemPrompt: 'Old watercolor gem.' })
  const { createdAt } = await storedJson(root)

  await save(root, {
    sections: { visualStyle: 'Watercolor.' },
    sourcePrompt: 'Old watercolor gem.',
  })
  const stored = await storedJson(root)
  assert.equal(stored.systemPrompt, undefined)
  assert.deepEqual(stored.sections, { visualStyle: 'Watercolor.' })
  assert.equal(
    stored.templateVersion,
    GEM_TEMPLATE_VERSION,
    'sin versión, la actual',
  )
  assert.equal(stored.sourcePrompt, 'Old watercolor gem.')
  assert.equal(stored.createdAt, createdAt)
})

test('saving an old text over a template gem drops its sections and its version', async (t) => {
  const root = await galleryRoot(t)
  await save(root, { sections })
  const { createdAt } = await storedJson(root)

  const { entry } = await save(root, { systemPrompt: 'Old watercolor gem.' })
  const stored = await storedJson(root)
  assert.equal(stored.systemPrompt, 'Old watercolor gem.')
  assert.equal(stored.sections, undefined)
  assert.equal(stored.templateVersion, undefined)
  assert.equal(stored.createdAt, createdAt)
  assert.equal(entry.systemPrompt, 'Old watercolor gem.')
  assert.equal(entry.sections, undefined)
  assert.equal(entry.templateVersion, undefined)
})

test('an old gem is still saved as before, now with its update date', async (t) => {
  const root = await galleryRoot(t)
  const { entry } = await save(root, {
    systemPrompt: '  Old watercolor gem.  ',
    shots: ['Wide shot'],
    character: { mode: 'none' },
  })
  const stored = await storedJson(root)
  assert.deepEqual(Object.keys(stored).sort(), [
    'character',
    'createdAt',
    'name',
    'shots',
    'systemPrompt',
    'updatedAt',
  ])
  assert.equal(stored.systemPrompt, 'Old watercolor gem.')
  assert.equal(entry.sections, undefined)
  assert.equal(entry.templateVersion, undefined)
})

// ── Rechazos ──

for (const [name, payload] of [
  ['both kinds of gem', { systemPrompt: 'x', sections }],
  ['neither kind of gem', {}],
  ['no visual style', { sections: { ...sections, visualStyle: '   ' } }],
  ['a section that is not text', { sections: { ...sections, rules: 3 } }],
  ['sections that are not an object', { sections: 'Watercolor.' }],
  [
    'a section over 12 000',
    { sections: { visualStyle: 'x'.repeat(GEM_SECTION_CHAR_LIMIT + 1) } },
  ],
  [
    'a character over 700',
    { sections: { ...sections, character: 'x'.repeat(701) } },
  ],
  [
    'a fixed start over 600',
    { sections: { ...sections, promptStart: 'x'.repeat(601) } },
  ],
  [
    'a fixed end over 1 000',
    { sections: { ...sections, promptEnd: 'x'.repeat(1_001) } },
  ],
  [
    'sections over 30 000 in total',
    {
      sections: {
        visualStyle: 'x'.repeat(12_000),
        dynamism: 'x'.repeat(12_000),
        camera: 'x'.repeat(6_001),
      },
    },
  ],
  [
    'a newer template version',
    { sections, templateVersion: GEM_TEMPLATE_VERSION + 1 },
  ],
  ['a template version of 0', { sections, templateVersion: 0 }],
  [
    'a template version that is not an integer',
    { sections, templateVersion: 1.5 },
  ],
  [
    'a template version on an old gem',
    { systemPrompt: 'x', templateVersion: 1 },
  ],
  ['an unknown color filter', { sections, colorFilter: 'sepia' }],
  [
    'an origin that is not from the catalog',
    {
      sections,
      origin: { kind: 'friend', catalogStyleId: 'terror', name: 'Terror' },
    },
  ],
  [
    'an origin with an unsafe id',
    {
      sections,
      origin: { kind: 'catalog', catalogStyleId: '../evil', name: 'Terror' },
    },
  ],
  [
    'a clone origin with an unknown source',
    { sections, origin: { kind: 'ai-clone', source: 'tiktok' } },
  ],
  [
    'a clone origin whose video is not from YouTube',
    {
      sections,
      origin: {
        kind: 'ai-clone',
        source: 'youtube',
        videoUrl: 'https://evil.example/watch?v=tBBhUn0D0I0',
      },
    },
  ],
  [
    'a clone origin from images that brings a video',
    {
      sections,
      origin: {
        kind: 'ai-clone',
        source: 'images',
        videoUrl: 'https://www.youtube.com/watch?v=tBBhUn0D0I0',
      },
    },
  ],
  [
    'a backup over 100 000',
    { sections, sourcePrompt: 'x'.repeat(SYSTEM_PROMPT_CHAR_LIMIT + 1) },
  ],
]) {
  test('style-save rejects ' + name + ' and writes nothing', async (t) => {
    const root = await galleryRoot(t)
    await assert.rejects(save(root, payload), invalid)
    await assert.rejects(storedJson(root), { code: 'ENOENT' })
    // Toda la validación va antes de tocar el disco: ni siquiera la carpeta.
    await assert.rejects(readdir(join(root, '_styles')), { code: 'ENOENT' })
  })
}

test('a fixed end as long as a style sheet is saved', async (t) => {
  const root = await galleryRoot(t)
  const promptEnd = 'Style: ' + 'x'.repeat(PROMPT_END_CHAR_LIMIT - 7)
  const { entry } = await save(root, { sections: { ...sections, promptEnd } })
  assert.equal(entry.sections.promptEnd.length, 1_000)
})

test('the origin of a style cloned with AI is saved and read back', async (t) => {
  const root = await galleryRoot(t)
  const fromVideo = {
    kind: 'ai-clone',
    source: 'youtube',
    videoUrl: 'https://www.youtube.com/watch?v=tBBhUn0D0I0',
  }
  const { entry } = await save(root, { sections, origin: fromVideo })
  assert.deepEqual(entry.origin, fromVideo)
  assert.deepEqual((await storedJson(root)).origin, fromVideo)

  const fromImages = { kind: 'ai-clone', source: 'images' }
  const edited = await save(root, { sections, origin: fromImages })
  assert.deepEqual(edited.entry.origin, fromImages)
})

test('a rejected edit leaves the stored gem untouched', async (t) => {
  const root = await galleryRoot(t)
  await save(root, { sections })
  const before = await storedJson(root)
  await assert.rejects(
    save(root, { sections: { ...sections, character: 'x'.repeat(701) } }),
    invalid,
  )
  assert.deepEqual(await storedJson(root), before)
})

// ── Conservación ──

test('an edit without backup, color filter, origin or character keeps them', async (t) => {
  const root = await galleryRoot(t)
  await save(root, {
    sections,
    sourcePrompt: 'Original gem.',
    colorFilter: 'horror-bw',
    origin: { kind: 'catalog', catalogStyleId: 'terror', name: 'Terror' },
    character: { mode: 'none' },
  })
  // Editar una sección: la UI manda solo las secciones.
  await save(root, { sections: { ...sections, rules: 'Never draw blood.' } })
  const stored = await storedJson(root)
  assert.equal(stored.sections.rules, 'Never draw blood.')
  assert.equal(stored.sourcePrompt, 'Original gem.')
  assert.equal(stored.colorFilter, 'horror-bw')
  assert.deepEqual(stored.origin, {
    kind: 'catalog',
    catalogStyleId: 'terror',
    name: 'Terror',
  })
  assert.deepEqual(stored.character, { mode: 'none' })
  assert.equal(stored.templateVersion, GEM_TEMPLATE_VERSION)

  // Un valor explícito reemplaza; un respaldo vacío lo borra.
  await save(root, { sections, colorFilter: 'none', sourcePrompt: '' })
  const replaced = await storedJson(root)
  assert.equal(replaced.colorFilter, 'none')
  assert.equal(replaced.sourcePrompt, undefined)
})

test('a new catalog id in an origin follows the gallery pattern', async (t) => {
  const root = await galleryRoot(t)
  const { entry } = await save(root, {
    sections,
    origin: { kind: 'catalog', catalogStyleId: 'st-noir-2', name: 'Noir' },
  })
  assert.equal(entry.origin.catalogStyleId, 'st-noir-2')
})

test('a catalog id is a legacy one or follows the gallery pattern, nothing inherited', () => {
  // `pov_stickman` es heredado y NO cumple el patrón: solo entra por la lista.
  for (const id of ['terror', 'pov_stickman', 'st-noir-2'])
    assert.equal(isCatalogStyleId(id), true, id)
  // Los nombres de Object.prototype no son ids de ningún catálogo.
  for (const id of ['toString', 'valueOf', 'hasOwnProperty', '__proto__'])
    assert.equal(isCatalogStyleId(id), false, id)
  for (const id of ['../evil', 'Terror', ['terror'], 7, null, undefined])
    assert.equal(isCatalogStyleId(id), false, `${JSON.stringify(id)}`)
})

// ── Lectura tolerante ──

async function writeRaw(root, id, content) {
  const directory = join(root, '_styles', id)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'style.json'), JSON.stringify(content))
}

test('a style.json with both kinds of gem reads as a template gem', async (t) => {
  const root = await galleryRoot(t)
  await writeRaw(root, 'st-both', {
    name: 'Both',
    systemPrompt: 'Old text.',
    sections: { visualStyle: 'Watercolor.', rules: 7, camera: '  ' },
    templateVersion: '1',
    colorFilter: 'sepia',
    origin: { kind: 'catalog', catalogStyleId: 'terror' },
    shots: [],
    createdAt: '2026-09-30T00:00:00.000Z',
  })
  const entry = await readStyleEntry(context(root), 'st-both')
  assert.equal(entry.systemPrompt, undefined)
  assert.deepEqual(entry.sections, { visualStyle: 'Watercolor.' })
  assert.equal(entry.templateVersion, undefined)
  assert.equal(entry.colorFilter, undefined)
  assert.equal(entry.origin, undefined)
})

test('broken sections fall back to the old text, and nothing usable is not listed', async (t) => {
  const root = await galleryRoot(t)
  await writeRaw(root, 'st-old', {
    name: 'Old',
    systemPrompt: 'Old text.',
    sections: { camera: 'Wide.' },
    shots: [],
    createdAt: '2026-09-30T00:00:00.000Z',
  })
  await writeRaw(root, 'st-empty', {
    name: 'Empty',
    sections: { visualStyle: '' },
    shots: [],
    createdAt: '2026-09-30T00:00:01.000Z',
  })
  const { entries } = await stylesList(context(root))
  assert.deepEqual(
    entries.map((style) => style.id),
    ['st-old'],
  )
  assert.equal(entries[0].systemPrompt, 'Old text.')
  assert.equal(entries[0].sections, undefined)
})

test('a style.json that is valid JSON but not an object is skipped without breaking the list', async (t) => {
  const root = await galleryRoot(t)
  await save(root, { sections })
  await writeRaw(root, 'st-null', null)
  await writeRaw(root, 'st-list', [])
  await writeRaw(root, 'st-number', 42)
  const { entries } = await stylesList(context(root))
  assert.deepEqual(
    entries.map((style) => style.id),
    ['st-fixture'],
  )
  assert.equal(await readStyleEntry(context(root), 'st-null'), null)
})
