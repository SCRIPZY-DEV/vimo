// La caché del catálogo remoto (ADR-0049, plan E3 tarea A1 y §5.5): el
// sidecar guarda el último catálogo sincronizado en `<raíz>/_catalog/`
// (`catalog.json` sin rutas absolutas y las tandas `<id>/s<revision>/`).
// `catalog-styles-list` con `remote: true` y un `catalog.json` válido devuelve
// las gemas sincronizadas, con las rutas de sus muestras derivadas al listar, y
// la versión; sin `remote`, sin caché o con una caché rota o inválida, las 38
// gemas empaquetadas con `version: null`, sin lanzar (Review Focus 1: la app
// nunca se queda sin estilos). `resolveCatalogGem` busca primero en la caché y
// después en las empaquetadas. `_catalog` es una carpeta reservada de la raíz:
// nunca es un proyecto. Sin red: disco temporal.

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { resolveCatalogGem } from '../../pipeline/commands/catalog/catalog-cache.ts'
import { catalogStylesList } from '../../pipeline/commands/catalog/catalog-styles-list.ts'
import { listVideoProjects } from '../../pipeline/commands/videos/list-video-projects.ts'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import {
  CATALOG_GEMS,
  findCatalogGem,
} from '../../pipeline/prompts/catalog-gems/catalog.ts'
import { CATALOG_TAGS } from '../../pipeline/prompts/catalog-gems/tags.ts'
import {
  RESERVED_ROOT_DIRECTORIES,
  isProjectDirectoryName,
} from '../../pipeline/project/paths.ts'

const MAIN_FILE = fileURLToPath(
  new URL('../../pipeline/main.ts', import.meta.url),
)
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0])
const VERSION = '3f2a9c0d1e4b5a68'

function jpeg(label) {
  return Buffer.concat([JPEG_MAGIC, Buffer.from(label)])
}
async function projectsRoot(t) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-catalog-cache-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}
function context(root, payload, events = []) {
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
    emitter: { emit: (event) => events.push(event) },
  }
}
function list(root, payload) {
  return catalogStylesList(context(root, payload))
}
// Lanza el sidecar con el job por stdin y devuelve sus eventos NDJSON.
function runSidecar(subcommand, job) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [MAIN_FILE, subcommand], {
      stdio: ['pipe', 'pipe', 'inherit'],
    })
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk
    })
    child.on('error', reject)
    child.on('close', () =>
      resolve(
        output
          .split('\n')
          .filter((line) => line.trim())
          .map((line) => JSON.parse(line)),
      ),
    )
    const fullJob = { jobId: 'guard', apiKeys: {}, binaryPaths: {}, ...job }
    child.stdin.write(`${JSON.stringify(fullJob)}\n`)
  })
}

// Una entrada de catalog.json: los campos de una gema más su tanda de
// muestras (`samplesRevision`, 0 = las de la app), nunca rutas.
function storedEntry(gem, overrides = {}) {
  return { ...gem, samplesRevision: 0, ...overrides }
}
const fantasia = findCatalogGem('fantasia')
const bola = findCatalogGem('2d-bola')
const crayon = findCatalogGem('2d-crayon')
// Fantasía publicada de nuevo con otro nombre y sus muestras de la app; una
// gema nueva con su tanda 2 (3 muestras) y otra nueva sin muestras.
const editedFantasia = storedEntry(fantasia, {
  name: { es: 'Fantasía épica', en: 'Epic fantasy', pt: 'Fantasia épica' },
})
const watercolor = storedEntry(bola, {
  id: 'acuarela-nueva',
  name: { es: 'Acuarela nueva', en: 'New watercolor', pt: 'Aquarela nova' },
  sampleCount: 3,
  samplesRevision: 2,
})
const textOnly = storedEntry(crayon, {
  id: 'solo-texto',
  name: { es: 'Solo texto', en: 'Text only', pt: 'Só texto' },
  sampleCount: 0,
})
function catalogJson(entries = [editedFantasia, watercolor, textOnly]) {
  return {
    version: VERSION,
    syncedAt: '2026-10-06T12:00:00.000Z',
    entries,
  }
}
// Escribe la caché: catalog.json y las muestras de la tanda vigente de la
// gema nueva, más una tanda vieja todavía sin borrar, una muestra que la
// tanda no declara y un archivo ajeno (ninguno de los tres se lista).
async function writeCache(root, json = catalogJson()) {
  const catalog = join(root, '_catalog')
  const batch = join(catalog, 'acuarela-nueva', 's2')
  await mkdir(batch, { recursive: true })
  await mkdir(join(catalog, 'acuarela-nueva', 's1'), { recursive: true })
  for (const number of [1, 2, 3])
    await writeFile(join(batch, `sample-${number}.jpg`), jpeg(`s2-${number}`))
  await writeFile(join(batch, 'sample-4.jpg'), jpeg('undeclared'))
  await writeFile(join(batch, 'notes.txt'), 'not a sample')
  await writeFile(
    join(catalog, 'acuarela-nueva', 's1', 'sample-1.jpg'),
    jpeg('old batch'),
  )
  await writeFile(
    join(catalog, 'catalog.json'),
    typeof json === 'string' ? json : JSON.stringify(json),
  )
  return batch
}
// Lo que tiene que devolver la lista para una entrada de la caché.
function withoutRevision(entry) {
  const gem = { ...entry }
  delete gem.samplesRevision
  return gem
}
async function expectedSamples(batch, numbers) {
  return Promise.all(
    numbers.map(async (number) => {
      const path = join(batch, `sample-${number}.jpg`)
      return {
        file: `sample-${number}.jpg`,
        path,
        mtimeMs: Math.round((await stat(path)).mtimeMs),
      }
    }),
  )
}
function assertPackaged(result, label) {
  assert.equal(result.version, null, label)
  assert.equal(result.entries.length, CATALOG_GEMS.length, label)
  for (const [index, entry] of result.entries.entries())
    assert.equal(entry, CATALOG_GEMS[index], `${label}: entry ${index}`)
}

// ── La lista ──

test('without _catalog the list is the packaged catalog with version null, even when remote', async (t) => {
  const root = await projectsRoot(t)
  assertPackaged(await list(root, { remote: true }), 'remote without cache')
})

test('with remote and a valid catalog.json the list is the synced catalog, with its samples and its version', async (t) => {
  const root = await projectsRoot(t)
  const batch = await writeCache(root)
  const result = await list(root, { remote: true })

  assert.equal(result.version, VERSION)
  assert.deepEqual(
    result.entries.map((entry) => entry.id),
    ['fantasia', 'acuarela-nueva', 'solo-texto'],
  )
  // Revisión 0: las muestras de la app (sin `samples`, `sampleCount` tal cual).
  assert.deepEqual(result.entries[0], withoutRevision(editedFantasia))
  assert.equal(result.entries[0].name.es, 'Fantasía épica')
  assert.equal(result.entries[0].sampleCount, 4)
  assert.ok(!('samples' in result.entries[0]))
  // Revisión ≥ 1: las de su tanda, en orden, con ruta absoluta y mtimeMs;
  // ni la tanda vieja, ni una muestra que la tanda no declara, ni lo ajeno.
  assert.deepEqual(result.entries[1], {
    ...withoutRevision(watercolor),
    samples: await expectedSamples(batch, [1, 2, 3]),
  })
  assert.deepEqual(result.entries[2], withoutRevision(textOnly))
  assert.ok(!('samples' in result.entries[2]))
  for (const entry of result.entries)
    assert.ok(!('samplesRevision' in entry), entry.id)
})

test('without remote the list is the packaged catalog even when a synced one exists', async (t) => {
  const root = await projectsRoot(t)
  await writeCache(root)
  for (const payload of [
    undefined,
    {},
    { remote: false },
    { remote: 'yes' },
    { remote: 1 },
  ])
    assertPackaged(await list(root, payload), JSON.stringify(payload))
})

test('with remote but without a projects root the list is the packaged catalog', async () => {
  assertPackaged(await list(undefined, { remote: true }), 'no projects root')
})

for (const [name, json] of [
  ['text that is not JSON', '{"version":'],
  ['JSON null', 'null'],
  ['a list', '[]'],
  ['no version', { ...catalogJson(), version: undefined }],
  ['an empty version', { ...catalogJson(), version: '' }],
  ['no syncedAt', { ...catalogJson(), syncedAt: undefined }],
  ['entries that are not a list', { ...catalogJson(), entries: {} }],
  ['no entries', catalogJson([])],
])
  test(`a catalog.json with ${name} falls back to the packaged catalog without throwing`, async (t) => {
    const root = await projectsRoot(t)
    await writeCache(root, json)
    const events = []
    assertPackaged(
      await catalogStylesList(context(root, { remote: true }, events)),
      name,
    )
    // El fallo queda en el log de diagnóstico, sin romper la lista.
    assert.ok(
      events.some((event) => event.type === 'log' && event.level === 'warn'),
      name,
    )
  })

const longText = (length) => 'x'.repeat(length)
const invalidEntries = [
  ['an entry that is not an object', 'oops'],
  ['a copy id', storedEntry(crayon, { id: 'st-copia' })],
  ['an unsafe id', storedEntry(crayon, { id: '../evil' })],
  ['an id that is not text', storedEntry(crayon, { id: 7 })],
  ['an empty name', storedEntry(crayon, { name: { ...crayon.name, en: ' ' } })],
  [
    'a name over 80',
    storedEntry(crayon, { name: { ...crayon.name, pt: longText(81) } }),
  ],
  [
    'a name without one language',
    storedEntry(crayon, { name: { es: 'Crayón', en: 'Crayon' } }),
  ],
  ['tags that are not a list', storedEntry(crayon, { tags: 'Doodle' })],
  [
    'more than 5 tags',
    storedEntry(crayon, {
      tags: [
        CATALOG_TAGS.twoD,
        CATALOG_TAGS.doodle,
        CATALOG_TAGS.paper,
        CATALOG_TAGS.ink,
        CATALOG_TAGS.retro,
        CATALOG_TAGS.humor,
      ],
    }),
  ],
  [
    'a tag over 24',
    storedEntry(crayon, {
      tags: [{ es: longText(25), en: 'Long', pt: 'Longo' }],
    }),
  ],
  [
    'a tag without one language',
    storedEntry(crayon, { tags: [{ es: 'Papel', en: 'Paper' }] }),
  ],
  [
    'a repeated tag',
    storedEntry(crayon, { tags: [CATALOG_TAGS.paper, CATALOG_TAGS.paper] }),
  ],
  [
    'the fixed character tag without a character section',
    storedEntry(crayon, {
      tags: [...crayon.tags, CATALOG_TAGS.fixedCharacter],
    }),
  ],
  [
    'a dynamism section without its tag',
    storedEntry(crayon, {
      sections: { ...crayon.sections, dynamism: 'Vary the shots.' },
    }),
  ],
  [
    'sections without a visual style',
    storedEntry(crayon, {
      sections: { ...crayon.sections, visualStyle: '  ' },
    }),
  ],
  [
    'a section over 12 000',
    storedEntry(crayon, {
      sections: { ...crayon.sections, rules: longText(12_001) },
    }),
  ],
  [
    'a character with a placeholder',
    storedEntry(bola, {
      sections: {
        ...bola.sections,
        character: 'A [NAME] with a round head. Outfit: a red scarf.',
      },
    }),
  ],
  [
    'a character that does not end with an Outfit: sentence',
    storedEntry(bola, {
      sections: { ...bola.sections, character: 'A round gray creature.' },
    }),
  ],
  [
    'a fixed end with a placeholder other than the script language',
    storedEntry(crayon, {
      sections: { ...crayon.sections, promptEnd: 'Drawn on [PAPER].' },
    }),
  ],
  ['template version 2', storedEntry(crayon, { templateVersion: 2 })],
  ['no allowed modes', storedEntry(crayon, { allowedModes: [] })],
  [
    'a repeated allowed mode',
    storedEntry(crayon, { allowedModes: ['none', 'none'] }),
  ],
  [
    'an unknown allowed mode',
    storedEntry(crayon, { allowedModes: ['none', 'friend'] }),
  ],
  ['sample mode own', storedEntry(crayon, { sampleMode: 'own' })],
  [
    'a sample mode outside the allowed modes',
    storedEntry(crayon, { allowedModes: ['generic'], sampleMode: 'none' }),
  ],
  ['an unknown color filter', storedEntry(crayon, { colorFilter: 'sepia' })],
  ['a sample count of 5', storedEntry(crayon, { sampleCount: 5 })],
  ['a negative samples revision', storedEntry(crayon, { samplesRevision: -1 })],
  ['no samples revision', storedEntry(crayon, { samplesRevision: undefined })],
  ['a repeated id', storedEntry(fantasia)],
]
for (const [name, entry] of invalidEntries)
  test(`a catalog.json with ${name} falls back to the packaged catalog`, async (t) => {
    const root = await projectsRoot(t)
    await writeCache(root, catalogJson([editedFantasia, watercolor, entry]))
    assertPackaged(await list(root, { remote: true }), name)
  })

// La regla de idioma de Imperio Pro: el único marcador que puede llegar en el
// inicio o el final fijos es el del idioma del guion (lo completa el código).
test('the script language marker is the only placeholder a fixed phrase may carry', async (t) => {
  const root = await projectsRoot(t)
  const withLanguage = storedEntry(crayon, {
    sections: {
      ...crayon.sections,
      promptEnd:
        'Crayon on paper. If any text appears, it must be written in [IDIOMA DEL GUION].',
    },
  })
  await writeCache(root, catalogJson([withLanguage]))
  const result = await list(root, { remote: true })
  assert.equal(result.version, VERSION)
  assert.deepEqual(result.entries, [withoutRevision(withLanguage)])
})

// ── La búsqueda de una gema ──

test('resolveCatalogGem finds the synced gem first and the packaged one after', async (t) => {
  const root = await projectsRoot(t)
  const batch = await writeCache(root)
  const resolve = (id) => resolveCatalogGem(context(root), id, true)
  const resolveWithoutRoot = (id) =>
    resolveCatalogGem(context(undefined), id, true)

  assert.deepEqual(await resolve('fantasia'), withoutRevision(editedFantasia))
  assert.deepEqual(await resolve('acuarela-nueva'), {
    ...withoutRevision(watercolor),
    samples: await expectedSamples(batch, [1, 2, 3]),
  })
  // Lo que la caché no trae sale de las empaquetadas, tal cual.
  assert.equal(await resolve('terror'), findCatalogGem('terror'))
  for (const id of ['noir-inexistente', 'constructor', 'st-copia'])
    assert.equal(await resolve(id), undefined, id)
  // Sin raíz, solo las empaquetadas.
  assert.equal(await resolveWithoutRoot('fantasia'), fantasia)
  assert.equal(await resolveWithoutRoot('acuarela-nueva'), undefined)
  // Sin `remote` (el interruptor apagado), solo las empaquetadas aunque haya
  // caché: con el interruptor apagado nada cambia.
  assert.equal(
    await resolveCatalogGem(context(root), 'fantasia', false),
    fantasia,
  )
  assert.equal(
    await resolveCatalogGem(context(root), 'acuarela-nueva', false),
    undefined,
  )
})

test('resolveCatalogGem ignores a broken cache', async (t) => {
  const root = await projectsRoot(t)
  await writeCache(root, '{"version":')
  assert.equal(
    await resolveCatalogGem(context(root), 'fantasia', true),
    fantasia,
  )
  assert.equal(
    await resolveCatalogGem(context(root), 'acuarela-nueva', true),
    undefined,
  )
})

// ── La carpeta reservada ──

test('_catalog is a reserved root folder and never a project', async (t) => {
  assert.ok(RESERVED_ROOT_DIRECTORIES.has('_catalog'))
  assert.equal(isProjectDirectoryName('_catalog'), false)

  const root = await projectsRoot(t)
  await writeCache(root)
  // Aunque tuviera un project.json, no es una tarjeta de la biblioteca.
  await writeFile(
    join(root, '_catalog', 'project.json'),
    JSON.stringify({ name: 'Catálogo', state: 'done' }),
  )
  const { projects } = await listVideoProjects(context(root))
  assert.deepEqual(projects, [])
})

// ── main.ts ──

test('the sidecar lists the synced catalog through main.ts when the app asks for the remote one', async (t) => {
  const root = await projectsRoot(t)
  await writeCache(root)
  const events = await runSidecar('catalog-styles-list', {
    projectsRoot: root,
    payload: { remote: true },
  })
  const last = events.at(-1)
  assert.equal(last?.type, 'job-completed', JSON.stringify(last))
  assert.equal(last.result.version, VERSION)
  assert.deepEqual(
    last.result.entries.map((entry) => entry.id),
    ['fantasia', 'acuarela-nueva', 'solo-texto'],
  )
  assert.deepEqual(
    last.result.entries[1].samples.map((sample) => sample.file),
    ['sample-1.jpg', 'sample-2.jpg', 'sample-3.jpg'],
  )
})
