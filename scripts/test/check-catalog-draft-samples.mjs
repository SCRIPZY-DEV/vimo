// Las muestras de un borrador del catálogo (ADR-0049, plan E3 tarea A3).
//
// `generate-style-samples` con `catalogDraft` genera las 4 muestras del
// borrador que edita el admin con el mismo carril que un estilo de plantilla
// de Mi estilo (el marco, el modo `sampleMode`, los eventos de avance y el
// resultado), en `_catalog/_drafts/<id>/`, que se vacía antes de generar, y
// nunca en `_styles/`. `catalog-style-samples-upload` sube después cada
// archivo de esa carpeta con `PUT` a la URL firmada que pidió la app, como
// `image/jpeg`, solo si la URL es del origen permitido; todo se valida antes
// del primer `PUT`, un fallo es `catalog_upload_failed` y no hay reintentos.
//
// LLM y proveedor de imágenes simulados (sin claves); el bucket es un
// servidor HTTP local al que un `fetch` interceptado le manda lo que va al
// origen https de Supabase.

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { catalogStyleSamplesUpload } from '../../pipeline/commands/catalog/catalog-style-samples-upload.ts'
import { catalogSubcommands } from '../../pipeline/commands/catalog/subcommands.ts'
import { generateStyleSamples } from '../../pipeline/commands/styles/generate-style-samples.ts'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import { SAMPLE_FRAGMENTS } from '../../pipeline/prompts/style-samples.ts'
import {
  buildTemplateSystem,
  composeGemText,
} from '../../pipeline/prompts/template-frame.ts'
import {
  buildAssistantCharacterTurn,
  CHARACTER_DESIGN_INSTRUCTION,
} from '../../pipeline/prompts/verbatim-messages.ts'
import { DESCRIPTION_HEADER } from '../../pipeline/prompts/verbatim-identity.ts'

const MAIN_FILE = fileURLToPath(
  new URL('../../pipeline/main.ts', import.meta.url),
)
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFOsAAAAASUVORK5CYII=',
  'base64',
)
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0])
const MAX_SAMPLE_BYTES = 4 * 1024 * 1024

function jpeg(label) {
  return Buffer.concat([JPEG_MAGIC, Buffer.from(label)])
}

// ── El borrador ──

const sectionCharacter =
  'A stickman doll with a round white head, two black dot eyes and thin black line limbs. Outfit: white gloves and white rounded shoes.'
const promptStart = 'A simple stickman doll drawing:'
const promptEnd = 'Clean black lines on a colorful, softly shaded background.'
const sections = {
  visualStyle: 'Simple stickman drawings on colorful backgrounds.',
  character: sectionCharacter,
  dynamism: 'Show the protagonist in half of the scenes; objects in the rest.',
  promptStart,
  promptEnd,
}
const sheet =
  'A curious red-haired girl, slender build, freckles across the nose, round green glasses. Outfit: a green hoodie and blue jeans.'
const DRAFT_ID = 'acuarela-nueva'

function draft(overrides = {}) {
  return {
    id: DRAFT_ID,
    name: 'Acuarela nueva',
    sections,
    sampleMode: 'generic',
    ...overrides,
  }
}

async function projectsRoot(t) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-catalog-draft-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}
function draftDirectory(root, id = DRAFT_ID) {
  return join(root, '_catalog', '_drafts', id)
}
const ALL_KEYS = { deepinfra: 'fixture', fal: 'fixture', evolink: 'fixture' }
function context(root, payload, { events = [], apiKeys = ALL_KEYS } = {}) {
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
    emitter: { emit: (event) => events.push(event) },
  }
}
function generate(root, extra, options) {
  return generateStyleSamples(
    context(root, { imageProvider: 'fal', ...extra }, options),
  )
}
async function filesIn(directory) {
  try {
    return (await readdir(directory)).sort()
  } catch {
    return []
  }
}
async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

// ── Proveedores simulados (los mismos que check-gem-style-samples) ──

function stream(content) {
  return new Response(
    'data: ' +
      JSON.stringify({
        choices: [{ delta: { content }, finish_reason: 'stop' }],
      }) +
      '\n\ndata: [DONE]\n\n',
    { headers: { 'content-type': 'text/event-stream' } },
  )
}
function isPhaseOne(request) {
  return request.messages.at(-1).content.includes(CHARACTER_DESIGN_INSTRUCTION)
}
function isNarrativeReview(request) {
  return request.messages[0].content.startsWith(
    'You audit the FULL narrative meaning',
  )
}
function providers(t, { llmStatus } = {}) {
  const calls = { text: [], images: [], reviews: 0 }
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    const target = String(url)
    if (target.includes('chat/completions')) {
      const request = JSON.parse(init.body)
      if (isNarrativeReview(request)) {
        calls.reviews++
        return new Response('', { status: 500 })
      }
      calls.text.push(request)
      if (llmStatus) return new Response('', { status: llmStatus })
      if (isPhaseOne(request)) return stream('```text\n' + sheet + '\n```')
      const ids = [
        ...request.messages.at(-1).content.matchAll(/^(\d+)\. /gm),
      ].map((match) => Number(match[1]))
      return stream(
        ids
          .map(
            (id) =>
              `((${id})) [T:action] Wide shot of [subject] exploring a bright forest, moment ${id}.`,
          )
          .join('\n\n'),
      )
    }
    if (target.startsWith('https://fal.run/')) {
      calls.images.push({ url: target, ...JSON.parse(init.body) })
      return Response.json({
        images: [{ url: 'https://fixture.invalid/' + calls.images.length }],
      })
    }
    return new Response(PNG_BYTES, { headers: { 'content-type': 'image/png' } })
  })
  return calls
}

// ── Generar las muestras de un borrador ──

test('a generic draft writes its four samples in _catalog/_drafts/<id>/ with the frame and its character section, and nothing in _styles', async (t) => {
  const root = await projectsRoot(t)
  const calls = providers(t)
  const result = await generate(root, { catalogDraft: draft() })

  const directory = draftDirectory(root)
  assert.deepEqual(
    result.samples.map((sample) => sample.path),
    [1, 2, 3, 4].map((number) => join(directory, `sample-${number}.jpg`)),
  )
  for (const sample of result.samples)
    assert.equal(sample.mtimeMs, Math.round((await stat(sample.path)).mtimeMs))
  assert.deepEqual(await filesIn(join(root, '_catalog')), ['_drafts'])
  assert.deepEqual(await filesIn(join(root, '_catalog', '_drafts')), [DRAFT_ID])
  assert.equal(await exists(join(root, '_styles')), false)

  // El carril del video: un lote con el marco y la sección como protagonista.
  assert.equal(
    calls.text.length,
    1,
    'sin Fase 1: el protagonista es la sección',
  )
  assert.equal(calls.reviews, 0)
  const [request] = calls.text
  assert.equal(
    request.messages[0].content,
    buildTemplateSystem(sections, 'generic'),
  )
  assert.equal(
    request.messages[2].content,
    buildAssistantCharacterTurn(sectionCharacter),
  )
  for (const fragment of SAMPLE_FRAGMENTS)
    assert.ok(
      request.messages
        .at(-1)
        .content.includes(`${fragment.id}. ${fragment.text}`),
    )
  assert.equal(calls.images.length, 4)
  for (const image of calls.images) {
    assert.ok(image.prompt.startsWith(promptStart + ' '))
    assert.ok(image.prompt.endsWith(' ' + promptEnd))
    assert.ok(image.prompt.includes(DESCRIPTION_HEADER + ' A stickman doll'))
    assert.doesNotMatch(image.prompt, /\[subject\]|\[T:/)
  }
})

test('a cinematic draft uses the none frame and never the character section', async (t) => {
  const root = await projectsRoot(t)
  const calls = providers(t)
  const result = await generate(root, {
    catalogDraft: draft({ sampleMode: 'none' }),
  })
  assert.equal(result.samples.length, 4)
  assert.equal(calls.text.length, 1)
  const [request] = calls.text
  assert.equal(
    request.messages[0].content,
    buildTemplateSystem(sections, 'none'),
  )
  assert.ok(!request.messages.some((message) => message.role === 'assistant'))
  assert.ok(
    !JSON.stringify(request).includes('stickman doll with a round white head'),
  )
  for (const image of calls.images)
    assert.ok(!image.prompt.includes(DESCRIPTION_HEADER))
})

test('a generic draft without a character section designs its protagonist with phase 1', async (t) => {
  const root = await projectsRoot(t)
  const calls = providers(t)
  const withoutCharacter = { ...sections }
  delete withoutCharacter.character
  await generate(root, {
    catalogDraft: draft({ sections: withoutCharacter }),
  })
  assert.equal(calls.text.length, 2)
  assert.ok(isPhaseOne(calls.text[0]))
  assert.equal(
    calls.text[0].messages[0].content,
    composeGemText(withoutCharacter, { fixedPhrases: false }),
  )
  assert.equal(
    calls.text[1].messages[0].content,
    buildTemplateSystem(withoutCharacter, 'generic'),
  )
  for (const image of calls.images) assert.match(image.prompt, /green hoodie/)
})

test('the draft folder is emptied before generating: no sample of an older draft survives', async (t) => {
  const root = await projectsRoot(t)
  const directory = draftDirectory(root)
  await mkdir(join(directory, 'old'), { recursive: true })
  await writeFile(join(directory, 'sample-4.jpg'), jpeg('older draft'))
  await writeFile(join(directory, 'notes.txt'), 'stale')
  providers(t)

  await generate(root, { catalogDraft: draft() })
  assert.deepEqual(await filesIn(directory), [
    'sample-1.jpg',
    'sample-2.jpg',
    'sample-3.jpg',
    'sample-4.jpg',
  ])
  assert.deepEqual(await readFile(join(directory, 'sample-4.jpg')), PNG_BYTES)
})

test('a generation that fails after emptying leaves no older sample to upload', async (t) => {
  const root = await projectsRoot(t)
  const directory = draftDirectory(root)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'sample-1.jpg'), jpeg('older draft'))
  const calls = providers(t, { llmStatus: 401 })

  await assert.rejects(generate(root, { catalogDraft: draft() }), {
    code: 'llm_auth',
  })
  assert.equal(calls.images.length, 0)
  assert.deepEqual(await filesIn(directory), [])
})

// Mismo carril, mismos pedidos, mismos eventos y mismo resultado que un
// estilo de plantilla de Mi estilo con las mismas secciones y el mismo modo.
// El avance de cada muestra se compara por sus pasos (estado y, al final, la
// ruta escrita): los porcentajes intermedios dependen del reloj simulado.
function normalizedEvents(events, directory) {
  const progress = {}
  const logs = []
  for (const event of events) {
    if (event.type === 'log') {
      logs.push(`${event.level}: ${event.message}`)
      continue
    }
    const { phase, sampleId, status, path } = event.detail
    const step = path ? `${status} ${path.replace(directory, '<dir>')}` : status
    const key = `${phase}:${sampleId}`
    const steps = progress[key] ?? []
    if (steps.at(-1) !== step) steps.push(step)
    progress[key] = steps
  }
  return { progress, logs: logs.sort() }
}
async function recordRun(t, run, directory) {
  const calls = providers(t)
  const events = []
  const result = await run(events)
  t.mock.restoreAll()
  return {
    text: calls.text,
    images: calls.images
      .map((image) => JSON.stringify(image))
      .sort()
      .map((image) => JSON.parse(image)),
    events: normalizedEvents(events, directory),
    files: result.samples.map((sample) =>
      sample.path.replace(directory, '<dir>'),
    ),
  }
}
test('a draft runs the same flow, events and result as a template style of Mi estilo', async (t) => {
  const root = await projectsRoot(t)
  const styleDirectory = join(root, '_styles', 'st-fixture')
  await mkdir(styleDirectory, { recursive: true })
  for (const sampleMode of ['generic', 'none']) {
    await writeFile(
      join(styleDirectory, 'style.json'),
      JSON.stringify({
        name: 'Acuarela nueva',
        sections,
        templateVersion: 1,
        character: { mode: sampleMode },
        shots: [],
        createdAt: '2026-10-06T00:00:00.000Z',
      }),
    )
    const mine = await recordRun(
      t,
      (events) => generate(root, { styleId: 'st-fixture' }, { events }),
      styleDirectory,
    )
    const catalog = await recordRun(
      t,
      (events) =>
        generate(root, { catalogDraft: draft({ sampleMode }) }, { events }),
      draftDirectory(root),
    )
    assert.deepEqual(catalog, mine, sampleMode)
  }
})

// ── Lo que se valida antes de tocar nada ──

async function assertNothingTouched(root, calls) {
  assert.equal(await exists(join(root, '_catalog')), false)
  assert.equal(await exists(join(root, '_styles')), false)
  assert.equal(calls.text.length + calls.images.length, 0)
}
const invalidDrafts = [
  ['a draft that is text', 'acuarela'],
  ['a draft that is null', null],
  ['a draft that is a list', []],
  ['no id', draft({ id: undefined })],
  ['an unsafe id', draft({ id: '../evil' })],
  ['an id with capitals', draft({ id: 'Acuarela' })],
  ['a copy id', draft({ id: 'st-copia' })],
  ['an id that is not text', draft({ id: 7 })],
  ['an empty name', draft({ name: '   ' })],
  ['a name over 80', draft({ name: 'x'.repeat(81) })],
  ['a name that is not text', draft({ name: 7 })],
  ['no sections', draft({ sections: undefined })],
  ['sections without a visual style', draft({ sections: { rules: 'x' } })],
  [
    'a section over 12 000',
    draft({ sections: { ...sections, rules: 'x'.repeat(12_001) } }),
  ],
  ['sections that are text', draft({ sections: 'Watercolor.' })],
  ['sample mode own', draft({ sampleMode: 'own' })],
  ['no sample mode', draft({ sampleMode: undefined })],
]
for (const [name, catalogDraft] of invalidDrafts)
  test(`a draft with ${name} is invalid_payload and touches nothing`, async (t) => {
    const root = await projectsRoot(t)
    const calls = providers(t)
    await assert.rejects(generate(root, { catalogDraft }), {
      code: 'invalid_payload',
    })
    await assertNothingTouched(root, calls)
  })

test('a missing key or a malformed model stops before emptying the draft folder', async (t) => {
  const root = await projectsRoot(t)
  const directory = draftDirectory(root)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'sample-1.jpg'), jpeg('older draft'))
  const calls = providers(t)

  for (const [apiKeys, extra, code] of [
    [{ deepinfra: 'fixture' }, {}, 'missing_api_key'],
    [{ fal: 'fixture' }, {}, 'missing_api_key'],
    [ALL_KEYS, { promptModel: 42 }, 'invalid_payload'],
    [ALL_KEYS, { promptModel: 'x'.repeat(201) }, 'invalid_payload'],
  ])
    await assert.rejects(
      generateStyleSamples(
        context(
          root,
          { imageProvider: 'fal', catalogDraft: draft(), ...extra },
          { apiKeys },
        ),
      ),
      { code },
    )
  assert.deepEqual(await filesIn(directory), ['sample-1.jpg'])
  assert.equal(calls.text.length + calls.images.length, 0)
})

test('a valid draft without a projects root fails with missing_projects_root', async (t) => {
  const calls = providers(t)
  await assert.rejects(generate(undefined, { catalogDraft: draft() }), {
    code: 'missing_projects_root',
  })
  assert.equal(calls.text.length + calls.images.length, 0)
})

// ── Subir las muestras del borrador ──

const UPLOAD_ORIGIN = 'https://storage.fixture.test'
const SIGN_PATH = '/storage/v1/object/upload/sign/previews-gemas'
const received = []
const behaviors = new Map()
const server = createServer((request, response) => {
  const chunks = []
  request.on('data', (chunk) => chunks.push(chunk))
  request.on('end', () => {
    const path = request.url.split('?')[0]
    received.push({
      method: request.method,
      url: request.url,
      path,
      contentType: request.headers['content-type'],
      body: Buffer.concat(chunks),
    })
    const behavior = behaviors.get(path)
    if (behavior) {
      behavior(response)
      return
    }
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ Key: `previews-gemas${path}` }))
  })
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const serverUrl = `http://127.0.0.1:${server.address().port}`
after(() => {
  server.closeAllConnections()
  server.close()
})
const realFetch = globalThis.fetch
function routeStorage(t) {
  received.length = 0
  behaviors.clear()
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const target = String(url)
    if (!target.startsWith(`${UPLOAD_ORIGIN}/`))
      throw new TypeError(`fetch failed: ${target} is not the storage`)
    return realFetch(serverUrl + target.slice(UPLOAD_ORIGIN.length), init)
  })
}
function signedUrl(file, batch = 3) {
  return `${UPLOAD_ORIGIN}${SIGN_PATH}/${DRAFT_ID}/s${batch}/${file}?token=token-${file}`
}
function uploadPayload(files = [1, 2, 3, 4], extra = {}) {
  return {
    catalogStyleId: DRAFT_ID,
    uploads: files.map((number) => ({
      file: `sample-${number}.jpg`,
      url: signedUrl(`sample-${number}.jpg`),
    })),
    uploadOrigin: UPLOAD_ORIGIN,
    ...extra,
  }
}
// La carpeta del borrador con sus cuatro muestras recién generadas.
async function draftSamples(root) {
  const directory = draftDirectory(root)
  await mkdir(directory, { recursive: true })
  const samples = {}
  for (let number = 1; number <= 4; number++) {
    samples[number] = jpeg(`draft sample ${number}`)
    await writeFile(join(directory, `sample-${number}.jpg`), samples[number])
  }
  return samples
}
function upload(root, payload) {
  return catalogStyleSamplesUpload(context(root, payload))
}
const putsOf = (file) =>
  received.filter((request) => request.path.endsWith(`/${file}`))

test('each draft sample goes up with a PUT to its signed URL, as image/jpeg and with its exact bytes', async (t) => {
  const root = await projectsRoot(t)
  const samples = await draftSamples(root)
  routeStorage(t)

  assert.deepEqual(await upload(root, uploadPayload()), { uploaded: 4 })
  assert.deepEqual(
    received.map((request) => request.url),
    [1, 2, 3, 4].map((number) =>
      signedUrl(`sample-${number}.jpg`).slice(UPLOAD_ORIGIN.length),
    ),
  )
  for (const [index, request] of received.entries()) {
    assert.equal(request.method, 'PUT')
    assert.equal(request.contentType, 'image/jpeg')
    assert.deepEqual(request.body, samples[index + 1])
  }
})

test('only the listed samples go up', async (t) => {
  const root = await projectsRoot(t)
  await draftSamples(root)
  routeStorage(t)
  assert.deepEqual(await upload(root, uploadPayload([2, 4])), { uploaded: 2 })
  assert.deepEqual(
    received.map((request) => request.path.split('/').at(-1)),
    ['sample-2.jpg', 'sample-4.jpg'],
  )
})

const target = (file, url) => ({ file, url })
const invalidUploads = [
  ['no payload', undefined],
  ['a payload that is a list', []],
  [
    'no catalog style id',
    uploadPayload(undefined, { catalogStyleId: undefined }),
  ],
  [
    'an unsafe catalog style id',
    uploadPayload(undefined, { catalogStyleId: '../evil' }),
  ],
  ['a copy id', uploadPayload(undefined, { catalogStyleId: 'st-copia' })],
  ['no upload origin', uploadPayload(undefined, { uploadOrigin: undefined })],
  [
    'an http upload origin',
    uploadPayload(undefined, { uploadOrigin: 'http://storage.fixture.test' }),
  ],
  [
    'an upload origin with a path',
    uploadPayload(undefined, { uploadOrigin: `${UPLOAD_ORIGIN}/storage` }),
  ],
  ['uploads that are not a list', uploadPayload(undefined, { uploads: {} })],
  ['no uploads', uploadPayload([])],
  [
    'more than four uploads',
    uploadPayload(undefined, {
      uploads: [1, 2, 3, 4, 1].map((number) =>
        target(`sample-${number}.jpg`, signedUrl(`sample-${number}.jpg`)),
      ),
    }),
  ],
  [
    'an upload that is not an object',
    uploadPayload(undefined, { uploads: ['sample-1.jpg'] }),
  ],
  ...[
    'sample-0.jpg',
    'sample-5.jpg',
    'sample-01.jpg',
    '../sample-1.jpg',
    'sample-1.png',
    7,
  ].map((file) => [
    `the file ${file}`,
    uploadPayload(undefined, {
      uploads: [target(file, signedUrl('sample-1.jpg'))],
    }),
  ]),
  [
    'a repeated file',
    uploadPayload(undefined, {
      uploads: [
        target('sample-1.jpg', signedUrl('sample-1.jpg')),
        target('sample-1.jpg', signedUrl('sample-2.jpg')),
      ],
    }),
  ],
  ...[
    ['a URL that is not text', 7],
    ['a URL that is not a URL', 'sample-1.jpg'],
    ['an http URL', signedUrl('sample-1.jpg').replace('https:', 'http:')],
    ['a URL of another origin', 'https://other.fixture.test/sample-1.jpg'],
    [
      'a URL of a host that only starts like the origin',
      `${UPLOAD_ORIGIN}.evil.test${SIGN_PATH}/sample-1.jpg`,
    ],
    [
      'a URL with credentials',
      signedUrl('sample-1.jpg').replace('https://', 'https://user:secret@'),
    ],
  ].map(([name, url]) => [
    name,
    uploadPayload(undefined, { uploads: [target('sample-1.jpg', url)] }),
  ]),
]
for (const [name, payload] of invalidUploads)
  test(`an upload with ${name} is invalid_payload and nothing goes up`, async (t) => {
    const root = await projectsRoot(t)
    await draftSamples(root)
    routeStorage(t)
    await assert.rejects(upload(root, payload), { code: 'invalid_payload' })
    assert.deepEqual(received, [])
  })

for (const [name, prepare] of [
  ['that does not exist', (directory) => rm(join(directory, 'sample-2.jpg'))],
  [
    'that is not a JPEG',
    (directory) => writeFile(join(directory, 'sample-2.jpg'), PNG_BYTES),
  ],
  [
    'that is empty',
    (directory) => writeFile(join(directory, 'sample-2.jpg'), ''),
  ],
  [
    'over 4 MiB',
    (directory) =>
      writeFile(
        join(directory, 'sample-2.jpg'),
        Buffer.concat([JPEG_MAGIC, Buffer.alloc(MAX_SAMPLE_BYTES)]),
      ),
  ],
])
  test(`a draft sample ${name} is catalog_upload_failed before anything goes up`, async (t) => {
    const root = await projectsRoot(t)
    await draftSamples(root)
    await prepare(draftDirectory(root))
    routeStorage(t)
    await assert.rejects(upload(root, uploadPayload()), (error) => {
      assert.equal(error.code, 'catalog_upload_failed')
      assert.match(error.message, /sample-2\.jpg/)
      return true
    })
    assert.deepEqual(received, [])
  })

// El log de diagnóstico (ADR-0038) recibe el servicio y, si hubo respuesta,
// su status.
for (const [name, behavior, httpStatus] of [
  [
    'a 400 from the storage',
    (response) => {
      response.statusCode = 400
      response.setHeader('content-type', 'application/json')
      response.end(
        '{"statusCode":"409","error":"Duplicate","message":"The resource already exists"}',
      )
    },
    400,
  ],
  [
    'a 500 from the storage',
    (response) => {
      response.statusCode = 500
      response.end()
    },
    500,
  ],
  ['a dropped connection', (response) => response.socket.destroy()],
  [
    'a redirect',
    (response) => {
      response.statusCode = 307
      response.setHeader('location', `${serverUrl}/elsewhere/sample-2.jpg`)
      response.end()
    },
  ],
])
  test(`${name} is catalog_upload_failed naming the file, without retrying nor uploading the rest`, async (t) => {
    const root = await projectsRoot(t)
    await draftSamples(root)
    routeStorage(t)
    behaviors.set(`${SIGN_PATH}/${DRAFT_ID}/s3/sample-2.jpg`, behavior)
    await assert.rejects(upload(root, uploadPayload()), (error) => {
      assert.equal(error.code, 'catalog_upload_failed')
      assert.match(error.message, /sample-2\.jpg/)
      assert.equal(error.provider, 'supabase')
      assert.equal(error.httpStatus, httpStatus)
      return true
    })
    assert.equal(putsOf('sample-1.jpg').length, 1)
    assert.equal(putsOf('sample-2.jpg').length, 1, 'sin reintento')
    assert.equal(putsOf('sample-3.jpg').length, 0)
    assert.equal(received.length, 2, 'la redirección no se sigue')
  })

test('a valid upload without a projects root fails with missing_projects_root', async (t) => {
  routeStorage(t)
  await assert.rejects(upload(undefined, uploadPayload()), {
    code: 'missing_projects_root',
  })
  assert.deepEqual(received, [])
})

// ── Registro ──

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

test('the catalog domain registers the upload and main.ts dispatches it', async () => {
  assert.equal(
    catalogSubcommands['catalog-style-samples-upload'],
    catalogStyleSamplesUpload,
  )
  const events = await runSidecar('catalog-style-samples-upload', {
    catalogStyleId: DRAFT_ID,
  })
  const last = events.at(-1)
  assert.equal(last?.type, 'job-failed', JSON.stringify(last))
  assert.equal(last.code, 'invalid_payload')
})
