// `catalog-styles-sync` (ADR-0049, plan E3 tarea A2 y Review Focus 2): el
// sidecar convierte el manifiesto que la app pidió a vimo.click en
// `_catalog/catalog.json` y baja las muestras publicadas que le faltan. Valida
// TODO el manifiesto antes de tocar el disco; baja solo lo que falta
// (`_catalog/<id>/s<revision>/sample-<n>.jpg`), cada muestra JPEG de hasta
// 4 MiB y solo desde `samplesOrigin`; escribe catalog.json al final y de forma
// atómica; y recién después borra las tandas viejas y los estilos que ya no
// están publicados, sin tocar `_drafts/`. Si una descarga falla, el
// catalog.json anterior queda intacto y lo ya bajado sirve a la corrida
// siguiente. El bucket es un servidor HTTP local; un `fetch` interceptado le
// manda lo que va al origen https del bucket (el sidecar solo acepta https).

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  truncate,
  writeFile,
} from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { after, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { catalogStylesList } from '../../pipeline/commands/catalog/catalog-styles-list.ts'
import { catalogStylesSync } from '../../pipeline/commands/catalog/catalog-styles-sync.ts'
import { catalogSubcommands } from '../../pipeline/commands/catalog/subcommands.ts'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import { findCatalogGem } from '../../pipeline/prompts/catalog-gems/catalog.ts'
import { CATALOG_TAGS } from '../../pipeline/prompts/catalog-gems/tags.ts'

const MAIN_FILE = fileURLToPath(
  new URL('../../pipeline/main.ts', import.meta.url),
)
const MiB = 1024 * 1024
const MAX_SAMPLE_BYTES = 4 * MiB
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0])
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFOsAAAAASUVORK5CYII=',
  'base64',
)
const SAMPLES_ORIGIN = 'https://bucket.fixture.test'
const BUCKET_PATH = '/storage/v1/object/public/previews-gemas'
const SAMPLES_BASE_URL = `${SAMPLES_ORIGIN}${BUCKET_PATH}`

function jpeg(label) {
  return Buffer.concat([JPEG_MAGIC, Buffer.from(label)])
}

// ── El bucket: objetos en memoria, comportamientos por ruta y pedidos ──

const bucket = new Map()
const behaviors = new Map()
const requests = []
const server = createServer((request, response) => {
  const path = request.url.startsWith(BUCKET_PATH)
    ? request.url.slice(BUCKET_PATH.length)
    : request.url
  requests.push(path)
  const behavior = behaviors.get(path)
  if (behavior) {
    behavior(request, response)
    return
  }
  const body = bucket.get(path)
  if (!body) {
    response.statusCode = 404
    response.end()
    return
  }
  response.setHeader('content-type', 'image/jpeg')
  response.setHeader('content-length', String(body.length))
  response.end(body)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const serverUrl = `http://127.0.0.1:${server.address().port}`
after(() => {
  server.closeAllConnections()
  server.close()
})

function resetBucket() {
  bucket.clear()
  behaviors.clear()
  requests.length = 0
}
// Sube al bucket la tanda `s<revision>` de un estilo: `count` JPEG distintos.
function publishBatch(id, revision, count) {
  for (let number = 1; number <= count; number++)
    bucket.set(
      `/${id}/s${revision}/sample-${number}.jpg`,
      jpeg(`${id}-s${revision}-${number}`),
    )
}
// Lo que sale para el origen del bucket va al servidor local; cualquier otro
// destino es un error de red. Devuelve las URL pedidas.
const realFetch = globalThis.fetch
function routeBucket(t) {
  const urls = []
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const target = String(url)
    urls.push(target)
    if (!target.startsWith(`${SAMPLES_ORIGIN}/`))
      throw new TypeError(`fetch failed: ${target} is not the bucket`)
    return realFetch(serverUrl + target.slice(SAMPLES_ORIGIN.length), init)
  })
  return urls
}
// Manda `total` bytes que empiezan como un JPEG, sin declarar el tamaño, de a
// poco y respetando la contrapresión; resuelve al cerrarse la respuesta con lo
// que llegó a mandar.
function streamBytes(response, total) {
  return new Promise((resolve) => {
    let sent = 0
    let finished = false
    response.on('close', () => resolve({ sent, finished }))
    response.writeHead(200, { 'content-type': 'image/jpeg' })
    const chunk = Buffer.alloc(64 * 1024, 0xab)
    JPEG_MAGIC.copy(chunk)
    const pump = () => {
      while (sent < total) {
        const piece = chunk.subarray(0, Math.min(chunk.length, total - sent))
        sent += piece.length
        if (!response.write(piece)) {
          response.once('drain', pump)
          return
        }
      }
      finished = true
      response.end()
    }
    pump()
  })
}

// ── El manifiesto ──

const normal = findCatalogGem('normal')
const fantasia = findCatalogGem('fantasia')
const terror = findCatalogGem('terror')
const bola = findCatalogGem('2d-bola')
const crayon = findCatalogGem('2d-crayon')

function content(gem, overrides = {}) {
  return {
    name: gem.name,
    tags: gem.tags,
    sections: gem.sections,
    templateVersion: gem.templateVersion,
    allowedModes: gem.allowedModes,
    sampleMode: gem.sampleMode,
    colorFilter: gem.colorFilter,
    samples: { revision: 0, count: 4 },
    ...overrides,
  }
}
function style(id, position, styleContent, version = 1) {
  return { id, position, version, content: styleContent }
}
const editedName = {
  es: 'Fantasía épica',
  en: 'Epic fantasy',
  pt: 'Fantasia épica',
}
const watercolorName = {
  es: 'Acuarela nueva',
  en: 'New watercolor',
  pt: 'Aquarela nova',
}
// El catálogo A: dos gemas de la semilla (una con el nombre corregido), una
// gema nueva con su tanda 1 en el bucket y otra nueva sin muestras.
function catalogA(watercolorBatch = { revision: 1, count: 4 }) {
  return manifest(
    [
      style('normal', 0, content(normal)),
      style('fantasia', 1, content(fantasia, { name: editedName }), 2),
      style(
        'acuarela-nueva',
        2,
        content(bola, { name: watercolorName, samples: watercolorBatch }),
      ),
      style(
        'solo-texto',
        3,
        content(crayon, {
          name: { es: 'Solo texto', en: 'Text only', pt: 'Só texto' },
          samples: { revision: 0, count: 0 },
        }),
      ),
    ],
    'version-a',
  )
}
function manifest(styles, version = 'version-a') {
  return { version, samplesBaseUrl: SAMPLES_BASE_URL, styles }
}
function syncPayload(manifestValue, samplesOrigin = SAMPLES_ORIGIN) {
  return { manifest: manifestValue, samplesOrigin }
}

// ── El disco ──

async function projectsRoot(t) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-catalog-sync-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}
function context(root, payload, signal = new AbortController().signal) {
  return {
    job: {
      jobId: 'fixture',
      projectsRoot: root,
      apiKeys: {},
      binaryPaths: {},
      payload,
    },
    config: resolvePipelineConfig(),
    signal,
    emitter: { emit() {} },
  }
}
function sync(root, payload, signal) {
  return catalogStylesSync(context(root, payload, signal))
}
function remoteList(root) {
  return catalogStylesList(context(root, { remote: true }))
}
// Los archivos bajo `_catalog/`, relativos y con `/`, ordenados.
async function catalogFiles(root) {
  const directory = join(root, '_catalog')
  let entries
  try {
    entries = await readdir(directory, { recursive: true, withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      relative(directory, join(entry.parentPath, entry.name))
        .split(sep)
        .join('/'),
    )
    .sort()
}
function readCatalogJson(root) {
  return readFile(join(root, '_catalog', 'catalog.json'), 'utf8')
}
const batchFiles = (id, revision, count) =>
  Array.from(
    { length: count },
    (_, index) => `${id}/s${revision}/sample-${index + 1}.jpg`,
  )
const sampleRequests = (id, revision, numbers) =>
  numbers.map((number) => `/${id}/s${revision}/sample-${number}.jpg`)

// Sincroniza el catálogo A desde cero (el estado de partida de varios casos).
async function syncCatalogA(t, root) {
  publishBatch('acuarela-nueva', 1, 4)
  routeBucket(t)
  return sync(root, syncPayload(catalogA()))
}

// ── La corrida feliz ──

test('a first sync downloads the published samples, writes catalog.json and answers like the remote list', async (t) => {
  resetBucket()
  const root = await projectsRoot(t)
  publishBatch('acuarela-nueva', 1, 4)
  const urls = routeBucket(t)
  const result = await sync(root, syncPayload(catalogA()))

  assert.equal(result.version, 'version-a')
  assert.equal(result.downloaded, 4)
  // Solo la tanda nueva: la revisión 0 son las muestras que trae la app.
  assert.deepEqual(requests, sampleRequests('acuarela-nueva', 1, [1, 2, 3, 4]))
  for (const url of urls) assert.ok(url.startsWith(`${SAMPLES_BASE_URL}/`))
  assert.deepEqual(await catalogFiles(root), [
    ...batchFiles('acuarela-nueva', 1, 4),
    'catalog.json',
  ])
  for (let number = 1; number <= 4; number++)
    assert.deepEqual(
      await readFile(
        join(root, '_catalog', 'acuarela-nueva', 's1', `sample-${number}.jpg`),
      ),
      bucket.get(`/acuarela-nueva/s1/sample-${number}.jpg`),
    )

  // El resultado es la lista con `remote` más lo bajado.
  const listed = await remoteList(root)
  assert.deepEqual(result, { ...listed, downloaded: 4 })
  assert.deepEqual(
    result.entries.map((entry) => entry.id),
    ['normal', 'fantasia', 'acuarela-nueva', 'solo-texto'],
  )
  // Una gema de la semilla sin cambios es la empaquetada, tal cual.
  assert.deepEqual(result.entries[0], normal)
  assert.deepEqual(result.entries[1], { ...fantasia, name: editedName })
  const watercolor = result.entries[2]
  assert.equal(watercolor.sampleCount, 4)
  assert.deepEqual(watercolor.name, watercolorName)
  assert.deepEqual(watercolor.sections, bola.sections)
  assert.deepEqual(
    watercolor.samples.map((sample) => sample.path),
    [1, 2, 3, 4].map((number) =>
      join(root, '_catalog', 'acuarela-nueva', 's1', `sample-${number}.jpg`),
    ),
  )
  // Una gema nueva con la revisión 0 no tiene muestras de la app.
  assert.equal(result.entries[3].sampleCount, 0)
  assert.ok(!('samples' in result.entries[3]))
})

test('catalog.json keeps the version, the date and the gems with their batch, never paths nor samples', async (t) => {
  resetBucket()
  const root = await projectsRoot(t)
  await syncCatalogA(t, root)
  const text = await readCatalogJson(root)
  const stored = JSON.parse(text)

  assert.equal(stored.version, 'version-a')
  assert.ok(Date.parse(stored.syncedAt) > 0, stored.syncedAt)
  assert.ok(!text.includes(root), 'sin rutas absolutas')
  assert.deepEqual(
    stored.entries.map((entry) => [entry.id, entry.samplesRevision]),
    [
      ['normal', 0],
      ['fantasia', 0],
      ['acuarela-nueva', 1],
      ['solo-texto', 0],
    ],
  )
  for (const entry of stored.entries) assert.ok(!('samples' in entry))
})

test('a second sync of the same manifest downloads nothing', async (t) => {
  resetBucket()
  const root = await projectsRoot(t)
  const first = await syncCatalogA(t, root)
  requests.length = 0
  const second = await sync(root, syncPayload(catalogA()))
  assert.equal(second.downloaded, 0)
  assert.deepEqual(requests, [])
  assert.deepEqual(second, { ...first, downloaded: 0 })
})

test('only the missing or broken samples are downloaded again', async (t) => {
  resetBucket()
  const root = await projectsRoot(t)
  await syncCatalogA(t, root)
  const batch = join(root, '_catalog', 'acuarela-nueva', 's1')
  await rm(join(batch, 'sample-2.jpg'))
  await writeFile(join(batch, 'sample-3.jpg'), PNG_BYTES)
  await truncate(join(batch, 'sample-4.jpg'), 0)
  requests.length = 0

  const result = await sync(root, syncPayload(catalogA()))
  assert.equal(result.downloaded, 3)
  assert.deepEqual(requests, sampleRequests('acuarela-nueva', 1, [2, 3, 4]))
  for (const number of [2, 3, 4])
    assert.deepEqual(
      await readFile(join(batch, `sample-${number}.jpg`)),
      bucket.get(`/acuarela-nueva/s1/sample-${number}.jpg`),
    )
})

test('revision 0 takes the packaged sample count of its id, or 0 for a new id, whatever the content says', async (t) => {
  resetBucket()
  const root = await projectsRoot(t)
  routeBucket(t)
  const result = await sync(
    root,
    syncPayload(
      manifest([
        style(
          'terror',
          0,
          content(terror, { samples: { revision: 0, count: 2 } }),
        ),
        style(
          'solo-texto',
          1,
          content(crayon, { samples: { revision: 0, count: 4 } }),
        ),
      ]),
    ),
  )
  assert.equal(result.downloaded, 0)
  assert.deepEqual(requests, [])
  assert.deepEqual(result.entries[0], terror)
  assert.equal(result.entries[1].sampleCount, 0)
  assert.deepEqual(await catalogFiles(root), ['catalog.json'])
})

test('a gem of the seed with regenerated samples carries its synced batch', async (t) => {
  resetBucket()
  const root = await projectsRoot(t)
  publishBatch('terror', 3, 4)
  routeBucket(t)
  const result = await sync(
    root,
    syncPayload(
      manifest([
        style(
          'terror',
          0,
          content(terror, { samples: { revision: 3, count: 4 } }),
        ),
      ]),
    ),
  )
  assert.equal(result.downloaded, 4)
  assert.deepEqual(
    result.entries[0].samples.map((sample) => sample.file),
    ['sample-1.jpg', 'sample-2.jpg', 'sample-3.jpg', 'sample-4.jpg'],
  )
  assert.equal(result.entries[0].sampleCount, 4)
})

test('a field the sidecar does not know is not kept', async (t) => {
  resetBucket()
  const root = await projectsRoot(t)
  routeBucket(t)
  const result = await sync(
    root,
    syncPayload(
      manifest([
        style(
          'normal',
          0,
          content(normal, { description: { es: 'Sobra', en: 'X', pt: 'Y' } }),
        ),
      ]),
    ),
  )
  assert.deepEqual(result.entries[0], normal)
  assert.ok(!(await readCatalogJson(root)).includes('Sobra'))
})

// ── Nada se toca si el manifiesto no pasa ──

const longText = (length) => 'x'.repeat(length)
const invalidContents = [
  ['a content that is not an object', 'oops'],
  ['an empty name', content(crayon, { name: { ...crayon.name, es: '' } })],
  [
    'a name over 80',
    content(crayon, { name: { ...crayon.name, en: longText(81) } }),
  ],
  [
    'a section over 12 000',
    content(crayon, {
      sections: { ...crayon.sections, rules: longText(12_001) },
    }),
  ],
  [
    'sections over 30 000 in total',
    content(crayon, {
      sections: {
        ...crayon.sections,
        visualStyle: longText(11_000),
        camera: longText(11_000),
        rules: longText(11_000),
      },
    }),
  ],
  [
    'a character over the woven identity',
    content(bola, {
      sections: {
        ...bola.sections,
        character: `${longText(700)}. Outfit: a scarf.`,
      },
    }),
  ],
  [
    'a fixed end over 600',
    content(crayon, {
      sections: { ...crayon.sections, promptEnd: longText(601) },
    }),
  ],
  [
    'a character with a placeholder',
    content(bola, {
      sections: {
        ...bola.sections,
        character: 'A [NAME] with a round head. Outfit: a red scarf.',
      },
    }),
  ],
  [
    'a character without its Outfit: sentence',
    content(bola, {
      sections: { ...bola.sections, character: 'A round gray creature.' },
    }),
  ],
  [
    'a dynamism tag without its section',
    content(crayon, { tags: [...crayon.tags, CATALOG_TAGS.dynamism] }),
  ],
  [
    'a character section without its tag',
    content(bola, {
      tags: bola.tags.filter(
        (tag) => tag.es !== CATALOG_TAGS.fixedCharacter.es,
      ),
    }),
  ],
  [
    'a repeated tag',
    content(crayon, { tags: [CATALOG_TAGS.paper, CATALOG_TAGS.paper] }),
  ],
  [
    'more than 5 tags',
    content(crayon, {
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
    content(crayon, { tags: [{ es: longText(25), en: 'Long', pt: 'Longo' }] }),
  ],
  ['template version 2', content(crayon, { templateVersion: 2 })],
  ['no allowed modes', content(crayon, { allowedModes: [] })],
  [
    'a repeated allowed mode',
    content(crayon, { allowedModes: ['none', 'none'] }),
  ],
  ['sample mode own', content(crayon, { sampleMode: 'own' })],
  [
    'a sample mode outside the allowed modes',
    content(crayon, { allowedModes: ['generic'], sampleMode: 'none' }),
  ],
  ['an unknown color filter', content(crayon, { colorFilter: 'sepia' })],
  [
    'a negative samples revision',
    content(crayon, { samples: { revision: -1, count: 0 } }),
  ],
  [
    'a samples count of 5',
    content(crayon, { samples: { revision: 1, count: 5 } }),
  ],
  ['no samples batch', content(crayon, { samples: undefined })],
]
const invalidStyles = [
  ['a copy id', style('st-copia', 4, content(crayon))],
  ['an unsafe id', style('../evil', 4, content(crayon))],
  ['a repeated id', style('normal', 4, content(normal))],
  ['a position that is not an integer', style('solo', 1.5, content(crayon))],
  ['a version that is not an integer', style('solo', 4, content(crayon), '2')],
  ...invalidContents.map(([name, value]) => [name, style('solo', 4, value)]),
]
const invalidPayloads = [
  ['no payload', undefined],
  ['a payload that is a list', []],
  ['no manifest', { samplesOrigin: SAMPLES_ORIGIN }],
  ['a manifest that is a list', syncPayload([])],
  ['no version', syncPayload({ ...catalogA(), version: undefined })],
  ['an empty version', syncPayload({ ...catalogA(), version: '' })],
  ['no samplesBaseUrl', syncPayload({ ...catalogA(), samplesBaseUrl: 7 })],
  ['styles that are not a list', syncPayload({ ...catalogA(), styles: {} })],
  ['a style that is not an object', syncPayload(manifest(['normal']))],
  ['no samplesOrigin', { manifest: catalogA() }],
  [
    'a samplesOrigin that is not text',
    { manifest: catalogA(), samplesOrigin: 7 },
  ],
  [
    'an http samplesOrigin',
    syncPayload(catalogA(), 'http://bucket.fixture.test'),
  ],
  [
    'a samplesOrigin with a path',
    syncPayload(catalogA(), `${SAMPLES_ORIGIN}/storage`),
  ],
  ['a samplesOrigin that is not a URL', syncPayload(catalogA(), 'bucket')],
]
const foreignBaseUrls = [
  ['another host', 'https://other.fixture.test/storage/v1/object/public/x'],
  [
    'a host that only starts like the origin',
    `${SAMPLES_ORIGIN}.evil.test${BUCKET_PATH}`,
  ],
  ['plain http', `http://bucket.fixture.test${BUCKET_PATH}`],
  ['a query string', `${SAMPLES_BASE_URL}?download=1`],
  ['text that is not a URL', 'previews-gemas'],
]

async function assertUntouched(root, before) {
  assert.deepEqual(await catalogFiles(root), before.files)
  if (before.json !== undefined)
    assert.equal(await readCatalogJson(root), before.json)
  assert.deepEqual(requests, [], 'ni un pedido al bucket')
}
async function snapshot(root) {
  const files = await catalogFiles(root)
  if (!files.includes('catalog.json')) return { files }
  return { files, json: await readCatalogJson(root) }
}

for (const [name, invalidStyle] of invalidStyles)
  test(`a manifest with ${name} is catalog_sync_failed and touches nothing`, async (t) => {
    resetBucket()
    const root = await projectsRoot(t)
    publishBatch('acuarela-nueva', 1, 4)
    routeBucket(t)
    const styles = [...catalogA().styles, invalidStyle]
    await assert.rejects(sync(root, syncPayload(manifest(styles))), {
      code: 'catalog_sync_failed',
    })
    await assertUntouched(root, { files: [] })
  })

for (const [name, payload] of invalidPayloads)
  test(`a sync with ${name} is invalid_payload and touches nothing`, async (t) => {
    resetBucket()
    const root = await projectsRoot(t)
    routeBucket(t)
    await assert.rejects(sync(root, payload), { code: 'invalid_payload' })
    await assertUntouched(root, { files: [] })
  })

for (const [name, samplesBaseUrl] of foreignBaseUrls)
  test(`samples on ${name} are catalog_sync_failed before any download`, async (t) => {
    resetBucket()
    const root = await projectsRoot(t)
    publishBatch('acuarela-nueva', 1, 4)
    routeBucket(t)
    await assert.rejects(
      sync(root, syncPayload({ ...catalogA(), samplesBaseUrl })),
      { code: 'catalog_sync_failed' },
    )
    await assertUntouched(root, { files: [] })
  })

test('an empty catalog is refused and the previous one stays (Review Focus 1)', async (t) => {
  resetBucket()
  const root = await projectsRoot(t)
  await syncCatalogA(t, root)
  const before = await snapshot(root)
  requests.length = 0
  await assert.rejects(sync(root, syncPayload(manifest([], 'version-empty'))), {
    code: 'catalog_sync_failed',
  })
  await assertUntouched(root, before)
  assert.equal((await remoteList(root)).version, 'version-a')
})

test('an invalid manifest leaves the previous catalog exactly as it was', async (t) => {
  resetBucket()
  const root = await projectsRoot(t)
  await syncCatalogA(t, root)
  const before = await snapshot(root)
  requests.length = 0
  publishBatch('acuarela-nueva', 2, 4)
  const broken = manifest(
    [
      style(
        'acuarela-nueva',
        0,
        content(bola, {
          name: watercolorName,
          samples: { revision: 2, count: 4 },
        }),
      ),
      style('solo', 1, content(crayon, { colorFilter: 'sepia' })),
    ],
    'version-b',
  )
  await assert.rejects(sync(root, syncPayload(broken)), {
    code: 'catalog_sync_failed',
  })
  await assertUntouched(root, before)
})

// ── Una descarga que falla corta la corrida y deja el catálogo anterior ──

// El catálogo B: la gema nueva regenerada (tanda 2), y una muestra de esa
// tanda que se porta mal.
function catalogB() {
  return manifest(
    [
      style('normal', 0, content(normal)),
      style(
        'acuarela-nueva',
        1,
        content(bola, {
          name: watercolorName,
          samples: { revision: 2, count: 4 },
        }),
        2,
      ),
    ],
    'version-b',
  )
}
async function assertPreviousCatalogKept(root, before) {
  assert.equal(await readCatalogJson(root), before.json)
  const listed = await remoteList(root)
  assert.equal(listed.version, 'version-a')
  // La tanda vieja sigue: catalog.json todavía la nombra.
  assert.deepEqual(
    listed.entries
      .find((entry) => entry.id === 'acuarela-nueva')
      .samples.map((sample) => sample.path),
    [1, 2, 3, 4].map((number) =>
      join(root, '_catalog', 'acuarela-nueva', 's1', `sample-${number}.jpg`),
    ),
  )
  // Nada a medias: solo muestras enteras de las tandas y catalog.json.
  for (const file of await catalogFiles(root))
    assert.match(file, /^(catalog\.json|[a-z0-9-]+\/s\d+\/sample-\d\.jpg)$/)
}
const misbehavingSamples = [
  [
    'a sample that is not a JPEG',
    (response) => {
      response.setHeader('content-type', 'image/jpeg')
      response.end(PNG_BYTES)
    },
  ],
  [
    'an empty sample',
    (response) => {
      response.setHeader('content-type', 'image/jpeg')
      response.end()
    },
  ],
  [
    'a sample that answers 404',
    (response) => {
      response.statusCode = 404
      response.end()
    },
  ],
  [
    'a sample that answers 500',
    (response) => {
      response.statusCode = 500
      response.end('{"error":"internal"}')
    },
  ],
  // Las dos redirecciones llevan a un JPEG que se podría bajar: seguirlas
  // traería una muestra de otro origen (o de otra ruta) sin que nadie lo vea.
  [
    'a sample that redirects to another origin',
    (response) => {
      response.statusCode = 302
      response.setHeader(
        'location',
        `${serverUrl}${BUCKET_PATH}/acuarela-nueva/s2/sample-1.jpg`,
      )
      response.end()
    },
  ],
  [
    'a sample that redirects inside the bucket',
    (response) => {
      response.statusCode = 302
      response.setHeader(
        'location',
        `${BUCKET_PATH}/acuarela-nueva/s2/sample-1.jpg`,
      )
      response.end()
    },
  ],
  [
    'a sample cut halfway',
    (response) => {
      response.writeHead(200, {
        'content-type': 'image/jpeg',
        'content-length': '1000',
      })
      response.write(jpeg('half'))
      setTimeout(() => response.socket.destroy(), 20)
    },
  ],
]
for (const [name, behavior] of misbehavingSamples)
  test(`${name} cuts the run with catalog_sync_failed and keeps the previous catalog.json`, async (t) => {
    resetBucket()
    const root = await projectsRoot(t)
    await syncCatalogA(t, root)
    const before = await snapshot(root)
    publishBatch('acuarela-nueva', 2, 4)
    behaviors.set('/acuarela-nueva/s2/sample-2.jpg', (_request, response) =>
      behavior(response),
    )

    await assert.rejects(sync(root, syncPayload(catalogB())), {
      code: 'catalog_sync_failed',
    })
    await assertPreviousCatalogKept(root, before)
    await assert.rejects(
      readFile(join(root, '_catalog', 'acuarela-nueva', 's2', 'sample-2.jpg')),
      { code: 'ENOENT' },
    )
  })

// El log de diagnóstico (ADR-0038) distingue un fallo del bucket, con su
// status, de un manifiesto que no pasa.
test('a failed download names the bucket and its status for the diagnostics log; an invalid manifest does not', async (t) => {
  resetBucket()
  const root = await projectsRoot(t)
  publishBatch('acuarela-nueva', 1, 4)
  behaviors.set('/acuarela-nueva/s1/sample-1.jpg', (_request, response) => {
    response.statusCode = 500
    response.end()
  })
  routeBucket(t)
  await assert.rejects(sync(root, syncPayload(catalogA())), (error) => {
    assert.equal(error.code, 'catalog_sync_failed')
    assert.equal(error.provider, 'supabase')
    assert.equal(error.httpStatus, 500)
    assert.match(error.message, /acuarela-nueva\/s1\/sample-1\.jpg/)
    return true
  })

  const broken = manifest([
    style('solo', 0, content(crayon, { colorFilter: 'sepia' })),
  ])
  await assert.rejects(sync(root, syncPayload(broken)), (error) => {
    assert.equal(error.code, 'catalog_sync_failed')
    assert.equal(error.provider, undefined)
    assert.equal(error.httpStatus, undefined)
    return true
  })
})

test('a sample over 4 MiB is cut while it is read', async (t) => {
  resetBucket()
  const root = await projectsRoot(t)
  await syncCatalogA(t, root)
  const before = await snapshot(root)
  publishBatch('acuarela-nueva', 2, 4)
  let served
  behaviors.set('/acuarela-nueva/s2/sample-1.jpg', (_request, response) => {
    served = streamBytes(response, 64 * MiB)
  })

  await assert.rejects(sync(root, syncPayload(catalogB())), {
    code: 'catalog_sync_failed',
  })
  const outcome = await served
  assert.equal(outcome.finished, false, 'la descarga se cortó, no se leyó')
  assert.ok(outcome.sent < 64 * MiB, `${outcome.sent} bytes`)
  await assertPreviousCatalogKept(root, before)
})

// El bucket declara 16 MiB, manda el comienzo de un JPEG y se queda callado:
// solo quien mira el tamaño declarado se va enseguida; quien se pusiera a
// leer esperaría hasta el tope de tiempo.
test('a sample that declares more than 4 MiB is refused without reading it', async (t) => {
  resetBucket()
  const root = await projectsRoot(t)
  await syncCatalogA(t, root)
  const before = await snapshot(root)
  publishBatch('acuarela-nueva', 2, 4)
  behaviors.set('/acuarela-nueva/s2/sample-1.jpg', (_request, response) => {
    response.writeHead(200, {
      'content-type': 'image/jpeg',
      'content-length': String(16 * MiB),
    })
    response.write(JPEG_MAGIC)
  })
  const controller = new AbortController()
  t.after(() => controller.abort())

  const outcome = await Promise.race([
    sync(root, syncPayload(catalogB()), controller.signal).then(
      () => 'completed',
      (error) => error.code,
    ),
    delay(2000, 'still reading', { ref: false }),
  ])
  assert.equal(outcome, 'catalog_sync_failed')
  await assertPreviousCatalogKept(root, before)
})

test('a sample of exactly 4 MiB is accepted', async (t) => {
  resetBucket()
  const root = await projectsRoot(t)
  publishBatch('acuarela-nueva', 1, 4)
  const exact = Buffer.concat([
    JPEG_MAGIC,
    Buffer.alloc(MAX_SAMPLE_BYTES - JPEG_MAGIC.length, 0xab),
  ])
  bucket.set('/acuarela-nueva/s1/sample-4.jpg', exact)
  routeBucket(t)
  const result = await sync(root, syncPayload(catalogA()))
  assert.equal(result.downloaded, 4)
  assert.deepEqual(
    await readFile(
      join(root, '_catalog', 'acuarela-nueva', 's1', 'sample-4.jpg'),
    ),
    exact,
  )
})

test('a run cut halfway is completed by the next one, downloading only what is missing', async (t) => {
  resetBucket()
  const root = await projectsRoot(t)
  publishBatch('acuarela-nueva', 1, 4)
  behaviors.set('/acuarela-nueva/s1/sample-3.jpg', (_request, response) => {
    response.statusCode = 503
    response.end()
  })
  routeBucket(t)

  await assert.rejects(sync(root, syncPayload(catalogA())), {
    code: 'catalog_sync_failed',
  })
  // Sin catalog.json: la app sigue con las empaquetadas.
  assert.equal((await remoteList(root)).version, null)
  const kept = await catalogFiles(root)
  assert.ok(!kept.includes('catalog.json'))
  assert.ok(!kept.includes('acuarela-nueva/s1/sample-3.jpg'))
  const missing = batchFiles('acuarela-nueva', 1, 4).filter(
    (file) => !kept.includes(file),
  )

  behaviors.clear()
  requests.length = 0
  const result = await sync(root, syncPayload(catalogA()))
  assert.equal(result.downloaded, missing.length)
  assert.deepEqual(
    requests,
    missing.map((file) => `/${file}`),
  )
  assert.equal(result.version, 'version-a')
})

test('cancelling the job mid-download keeps the previous catalog and is not a sync failure', async (t) => {
  resetBucket()
  const root = await projectsRoot(t)
  await syncCatalogA(t, root)
  const before = await snapshot(root)
  publishBatch('acuarela-nueva', 2, 4)
  let arrived
  const waiting = new Promise((resolve) => {
    arrived = resolve
  })
  // La muestra nunca llega: el job se cancela mientras la espera.
  behaviors.set('/acuarela-nueva/s2/sample-1.jpg', () => arrived())
  const controller = new AbortController()

  const running = sync(root, syncPayload(catalogB()), controller.signal)
  await waiting
  controller.abort()
  await assert.rejects(running, (error) => {
    assert.notEqual(error.code, 'catalog_sync_failed')
    assert.ok(controller.signal.aborted)
    return true
  })
  await assertPreviousCatalogKept(root, before)
})

// ── La limpieza, después de escribir catalog.json ──

test('a new batch replaces the old one, which is deleted after catalog.json is written', async (t) => {
  resetBucket()
  const root = await projectsRoot(t)
  await syncCatalogA(t, root)
  publishBatch('acuarela-nueva', 2, 4)

  const result = await sync(root, syncPayload(catalogB()))
  assert.equal(result.downloaded, 4)
  assert.equal(result.version, 'version-b')
  assert.deepEqual(await catalogFiles(root), [
    ...batchFiles('acuarela-nueva', 2, 4),
    'catalog.json',
  ])
  assert.deepEqual(
    result.entries[1].samples.map((sample) => sample.path),
    [1, 2, 3, 4].map((number) =>
      join(root, '_catalog', 'acuarela-nueva', 's2', `sample-${number}.jpg`),
    ),
  )
})

test('a style that is no longer published leaves the list and its folder, and _drafts is never touched', async (t) => {
  resetBucket()
  const root = await projectsRoot(t)
  const drafts = join(root, '_catalog', '_drafts', 'acuarela-nueva')
  await mkdir(drafts, { recursive: true })
  await writeFile(join(drafts, 'sample-1.jpg'), jpeg('draft'))
  await syncCatalogA(t, root)

  const withoutWatercolor = manifest(
    catalogA().styles.filter((entry) => entry.id !== 'acuarela-nueva'),
    'version-c',
  )
  const result = await sync(root, syncPayload(withoutWatercolor))
  assert.deepEqual(
    result.entries.map((entry) => entry.id),
    ['normal', 'fantasia', 'solo-texto'],
  )
  assert.deepEqual(
    (await remoteList(root)).entries.map((entry) => entry.id),
    ['normal', 'fantasia', 'solo-texto'],
  )
  assert.deepEqual(await catalogFiles(root), [
    '_drafts/acuarela-nueva/sample-1.jpg',
    'catalog.json',
  ])
  assert.deepEqual(await readFile(join(drafts, 'sample-1.jpg')), jpeg('draft'))
})

// ── Registro ──

test('a valid sync without a projects root fails with missing_projects_root', async (t) => {
  resetBucket()
  routeBucket(t)
  await assert.rejects(sync(undefined, syncPayload(catalogA())), {
    code: 'missing_projects_root',
  })
  assert.deepEqual(requests, [])
})

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

test('the catalog domain registers the sync and main.ts dispatches it', async () => {
  assert.equal(catalogSubcommands['catalog-styles-sync'], catalogStylesSync)
  // Sin samplesOrigin: el payload se valida antes de mirar la carpeta raíz.
  const events = await runSidecar('catalog-styles-sync', {
    manifest: catalogA(),
  })
  const last = events.at(-1)
  assert.equal(last?.type, 'job-failed', JSON.stringify(last))
  assert.equal(last.code, 'invalid_payload')
})
