// «Pasar a mi estilo» (`catalog-style-copy`, plan E2 §5.3 y Review Focus 2):
// la copia crea un estilo propio NUEVO (`st-…`) con las secciones, la versión
// y el filtro de la gema tal cual, el modo de personaje elegido en «Ver», las
// muestras que manda la app y el `origin` que lee la etiqueta «Basado en …»,
// sin `sourcePrompt` (decisión P9). Todo el payload se valida antes de tocar
// el disco (un rechazo no deja ni la carpeta) y las muestras se escriben
// antes que style.json: una copia interrumpida no deja una tarjeta a medias.
// Las muestras que la app trae para cada estilo tienen que pasar esa misma
// validación, o la copia de ese estilo fallaría siempre. Sin red: disco
// temporal.

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  CATALOG_SAMPLE_COUNT,
  MAX_CATALOG_SAMPLE_BYTES,
} from '../../pipeline/commands/catalog/catalog-store.ts'
import { catalogStyleCopy } from '../../pipeline/commands/catalog/catalog-style-copy.ts'
import { catalogSubcommands } from '../../pipeline/commands/catalog/subcommands.ts'
import {
  STYLE_ID_PATTERN,
  assertSampleUpload,
  newCustomStyleId,
  readStyleEntry,
} from '../../pipeline/commands/styles/style-store.ts'
import { stylesList } from '../../pipeline/commands/styles/styles-list.ts'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import {
  CATALOG_GEMS,
  findCatalogGem,
} from '../../pipeline/prompts/catalog-gems/catalog.ts'

const MAIN_FILE = fileURLToPath(
  new URL('../../pipeline/main.ts', import.meta.url),
)
const REFERENCES_DIRECTORY = fileURLToPath(
  new URL('../../public/style-references/', import.meta.url),
)
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0])
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFOsAAAAASUVORK5CYII=',
  'base64',
)
const fantasia = findCatalogGem('fantasia')
const infographic = findCatalogGem('infografico-amarillo')

function jpeg(label) {
  return Buffer.concat([JPEG_MAGIC, Buffer.from(label)])
}
function upload(file, bytes) {
  return { file, base64: bytes.toString('base64') }
}
async function galleryRoot(t) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-catalog-copy-'))
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
function copy(root, payload) {
  return catalogStyleCopy(context(root, payload))
}
function payload(extra = {}) {
  return {
    catalogStyleId: 'fantasia',
    name: 'Fantasía mágica',
    character: { mode: 'own', defaultCharacterId: 'ana' },
    samples: [
      upload('sample-1.jpg', jpeg('one')),
      upload('sample-2.jpg', jpeg('two')),
    ],
    ...extra,
  }
}
async function storedJson(root, id) {
  return JSON.parse(
    await readFile(join(root, '_styles', id, 'style.json'), 'utf8'),
  )
}
async function assertNothingWritten(root) {
  // Toda la validación va antes de tocar el disco: ni siquiera la carpeta.
  await assert.rejects(readdir(join(root, '_styles')), { code: 'ENOENT' })
}
// Lanza el sidecar con el job por stdin y devuelve sus eventos NDJSON.
function runSidecar(subcommand, jobPayload) {
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
    const job = {
      jobId: 'guard',
      apiKeys: {},
      binaryPaths: {},
      payload: jobPayload,
    }
    child.stdin.write(`${JSON.stringify(job)}\n`)
  })
}

// ── La copia ──

test('the limits are the ones of the contract', () => {
  assert.equal(CATALOG_SAMPLE_COUNT, 4)
  assert.equal(MAX_CATALOG_SAMPLE_BYTES, 4 * 1024 * 1024)
})

test('a copy creates a new st- style with the gem as it is, the chosen character, the samples and its origin', async (t) => {
  const root = await galleryRoot(t)
  const { entry } = await copy(root, payload({ name: '  Fantasía mágica  ' }))

  assert.match(entry.id, STYLE_ID_PATTERN)
  assert.ok(entry.id.startsWith('st-'), entry.id)
  const stored = await storedJson(root, entry.id)
  // Sin `sourcePrompt` (P9) ni `systemPrompt`: una gema de plantilla.
  assert.deepEqual(Object.keys(stored).sort(), [
    'character',
    'colorFilter',
    'createdAt',
    'name',
    'origin',
    'sections',
    'shots',
    'templateVersion',
    'updatedAt',
  ])
  assert.equal(stored.name, 'Fantasía mágica')
  assert.deepEqual(stored.sections, fantasia.sections)
  assert.equal(stored.templateVersion, fantasia.templateVersion)
  assert.equal(stored.colorFilter, 'fantasy')
  assert.deepEqual(stored.character, { mode: 'own', defaultCharacterId: 'ana' })
  assert.deepEqual(stored.origin, {
    kind: 'catalog',
    catalogStyleId: 'fantasia',
    name: 'Fantasía mágica',
  })
  assert.deepEqual(stored.shots, [])
  assert.ok(Date.parse(stored.createdAt) > 0)
  assert.equal(stored.updatedAt, stored.createdAt)

  const directory = join(root, '_styles', entry.id)
  assert.deepEqual(await readFile(join(directory, 'sample-1.jpg')), jpeg('one'))
  assert.deepEqual(await readFile(join(directory, 'sample-2.jpg')), jpeg('two'))
  // La entrada es la que listaría styles-list, con las muestras del disco.
  assert.deepEqual(
    entry.samples.map((sample) => sample.file),
    ['sample-1.jpg', 'sample-2.jpg'],
  )
  assert.deepEqual((await stylesList(context(root))).entries, [entry])
})

test('the copy of a gem without color filter keeps none, to stay faithful', async (t) => {
  const root = await galleryRoot(t)
  const { entry } = await copy(
    root,
    payload({
      catalogStyleId: infographic.id,
      name: infographic.name.en,
      character: { mode: 'none' },
    }),
  )
  const stored = await storedJson(root, entry.id)
  assert.equal(stored.colorFilter, 'none')
  assert.equal(entry.colorFilter, 'none')
  assert.deepEqual(stored.sections, infographic.sections)
  assert.deepEqual(stored.character, { mode: 'none' })
  assert.deepEqual(entry.origin, {
    kind: 'catalog',
    catalogStyleId: infographic.id,
    name: infographic.name.en,
  })
})

test('a copy without samples is a card without samples', async (t) => {
  const root = await galleryRoot(t)
  const { entry } = await copy(root, payload({ samples: [] }))
  assert.deepEqual(entry.samples, [])
  assert.deepEqual(
    (await stylesList(context(root))).entries.map((style) => style.id),
    [entry.id],
  )
})

// La app omite una muestra que no pudo bajar: las demás conservan su número.
test('the samples keep the number they came with, gaps included', async (t) => {
  const root = await galleryRoot(t)
  const { entry } = await copy(
    root,
    payload({
      samples: [
        upload('sample-3.jpg', jpeg('three')),
        upload('sample-1.jpg', jpeg('one')),
      ],
    }),
  )
  assert.deepEqual(
    entry.samples.map((sample) => sample.file),
    ['sample-1.jpg', 'sample-3.jpg'],
  )
  assert.deepEqual(
    await readFile(join(root, '_styles', entry.id, 'sample-3.jpg')),
    jpeg('three'),
  )
})

test('two copies in a row are two styles with two ids', async (t) => {
  const root = await galleryRoot(t)
  const first = await copy(root, payload())
  const second = await copy(root, payload())
  assert.notEqual(first.entry.id, second.entry.id)
  for (const { entry } of [first, second]) {
    assert.match(entry.id, STYLE_ID_PATTERN)
    assert.ok(entry.id.startsWith('st-'), entry.id)
  }
  assert.equal((await stylesList(context(root))).entries.length, 2)
})

test('a new style id has the format of the app and fits the gallery pattern', () => {
  for (let attempt = 0; attempt < 50; attempt++) {
    const id = newCustomStyleId()
    assert.match(id, /^st-[a-z0-9]+-[a-z0-9]{0,6}$/)
    assert.match(id, STYLE_ID_PATTERN)
  }
})

// Review Focus 2: la última muestra no se puede escribir (su destino ya es
// una carpeta). Lo escrito hasta ahí queda, pero sin style.json la carpeta no
// es un estilo: styles-list no la muestra.
test('the samples are written before style.json: a copy that fails on its last sample leaves no card', async (t) => {
  const root = await galleryRoot(t)
  t.mock.method(Date, 'now', () => 1_790_000_000_000)
  t.mock.method(Math, 'random', () => 0.5)
  const id = newCustomStyleId()
  const directory = join(root, '_styles', id)
  await mkdir(join(directory, 'sample-2.jpg'), { recursive: true })
  await writeFile(join(directory, 'sample-2.jpg', 'blocker'), 'x')

  await assert.rejects(copy(root, payload()))
  assert.deepEqual(await readFile(join(directory, 'sample-1.jpg')), jpeg('one'))
  await assert.rejects(readFile(join(directory, 'style.json')), {
    code: 'ENOENT',
  })
  assert.equal(await readStyleEntry(context(root), id), null)
  assert.deepEqual((await stylesList(context(root))).entries, [])
})

// ── Rechazos ──

const tooBig = Buffer.concat([
  JPEG_MAGIC,
  Buffer.alloc(MAX_CATALOG_SAMPLE_BYTES + 1 - JPEG_MAGIC.length),
])
const oneBase64 = jpeg('one').toString('base64')

for (const [name, value] of [
  ['no payload', undefined],
  ['a list as payload', []],
  ['no catalog style id', payload({ catalogStyleId: undefined })],
  ['an unsafe catalog style id', payload({ catalogStyleId: '../evil' })],
  ['an empty name', payload({ name: '   ' })],
  ['a name over 80', payload({ name: 'x'.repeat(81) })],
  ['a name that is not text', payload({ name: 7 })],
  ['no character', payload({ character: undefined })],
  ['an unknown character mode', payload({ character: { mode: 'friend' } })],
  [
    'a default character outside own',
    payload({ character: { mode: 'generic', defaultCharacterId: 'ana' } }),
  ],
  ['no samples field', payload({ samples: undefined })],
  ['samples that are not a list', payload({ samples: 'sample-1.jpg' })],
  [
    'more than four samples',
    payload({
      samples: [1, 2, 3, 4, 1].map((number) =>
        upload(`sample-${number}.jpg`, jpeg(String(number))),
      ),
    }),
  ],
  ['a sample that is not an object', payload({ samples: ['sample-1.jpg'] })],
  [
    'a sample number 0',
    payload({ samples: [upload('sample-0.jpg', jpeg('zero'))] }),
  ],
  [
    'a sample number 5',
    payload({ samples: [upload('sample-5.jpg', jpeg('five'))] }),
  ],
  [
    'a padded sample number',
    payload({ samples: [upload('sample-01.jpg', jpeg('one'))] }),
  ],
  [
    'a sample that is not a jpg',
    payload({ samples: [upload('sample-1.png', jpeg('one'))] }),
  ],
  [
    'a path in the sample name',
    payload({ samples: [upload('../sample-1.jpg', jpeg('one'))] }),
  ],
  [
    'a repeated sample',
    payload({
      samples: [
        upload('sample-1.jpg', jpeg('one')),
        upload('sample-1.jpg', jpeg('again')),
      ],
    }),
  ],
  [
    'broken base64',
    payload({ samples: [{ file: 'sample-1.jpg', base64: '###' }] }),
  ],
  [
    'base64 without its padding',
    payload({
      samples: [{ file: 'sample-1.jpg', base64: oneBase64.replace(/=+$/, '') }],
    }),
  ],
  [
    'a data URI instead of base64',
    payload({
      samples: [
        {
          file: 'sample-1.jpg',
          base64: `data:image/jpeg;base64,${oneBase64}`,
        },
      ],
    }),
  ],
  [
    'base64 that is not text',
    payload({ samples: [{ file: 'sample-1.jpg', base64: 7 }] }),
  ],
  [
    'an empty sample',
    payload({ samples: [{ file: 'sample-1.jpg', base64: '' }] }),
  ],
  [
    'a sample without the JPEG magic',
    payload({ samples: [upload('sample-1.jpg', PNG_BYTES)] }),
  ],
  [
    'a sample over 4 MiB',
    payload({ samples: [upload('sample-1.jpg', tooBig)] }),
  ],
]) {
  test(
    'catalog-style-copy rejects ' + name + ' and writes nothing',
    async (t) => {
      const root = await galleryRoot(t)
      await assert.rejects(copy(root, value), { code: 'invalid_payload' })
      await assertNothingWritten(root)
    },
  )
}

// `constructor` cumple el patrón de la galería y es una propiedad heredada de
// cualquier objeto: la búsqueda del catálogo no puede encontrarla.
for (const id of ['noir-inexistente', 'st-noir', 'constructor'])
  test(`a style that is not in the catalog (${id}) is style_not_found and writes nothing`, async (t) => {
    const root = await galleryRoot(t)
    await assert.rejects(copy(root, payload({ catalogStyleId: id })), {
      code: 'style_not_found',
    })
    await assertNothingWritten(root)
  })

test('a valid copy without a projects root fails with missing_projects_root', async () => {
  const withoutRoot = context(undefined, payload())
  await assert.rejects(catalogStyleCopy(withoutRoot), {
    code: 'missing_projects_root',
  })
})

// ── Registro ──

test('the catalog domain registers the copy and main.ts dispatches it', async () => {
  assert.equal(catalogSubcommands['catalog-style-copy'], catalogStyleCopy)
  // Sin nombre y sin projectsRoot: el payload se valida primero.
  const events = await runSidecar('catalog-style-copy', {
    catalogStyleId: 'fantasia',
  })
  const last = events.at(-1)
  assert.equal(last?.type, 'job-failed', JSON.stringify(last))
  assert.equal(last.code, 'invalid_payload')
})

// ── Las muestras que trae la app ──

test('every sample the app ships for the catalog passes the copy validation', () => {
  const problems = []
  for (const gem of CATALOG_GEMS)
    for (let number = 1; number <= gem.sampleCount; number++) {
      const file = `${gem.id}_${number}.jpg`
      const sample = upload(
        `sample-${number}.jpg`,
        readFileSync(join(REFERENCES_DIRECTORY, file)),
      )
      try {
        assertSampleUpload(sample, file, CATALOG_SAMPLE_COUNT)
      } catch (error) {
        problems.push(error.message)
      }
    }
  assert.deepEqual(problems, [])
})
