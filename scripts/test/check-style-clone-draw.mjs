// Las pruebas de una clonación de estilo (`style-clone-draw`, ADR-0050): los
// 3 diseños del personaje o las 4 escenas, dibujados con el proveedor del
// usuario. Las escenas de un estilo con personaje lo llevan como texto tejido
// («identidad de prompt») o con el diseño elegido como referencia («con
// foto»), y cada una trae el «Original» que recrea: el fotograma o la imagen
// tal cual, o la celda recortada de su mosaico. Una prueba que falla no tumba
// la ronda; el saldo agotado sí. Proveedores simulados, FFmpeg real y la
// carpeta de la sesión en un directorio temporal.

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { executableSuffix, targetTriple } from '../target-triple.mjs'
import { jpegSize } from '../../pipeline/commands/styles/style-clone-material.ts'
import { styleCloneDraw } from '../../pipeline/commands/styles/style-clone-draw.ts'
import { stylesSubcommands } from '../../pipeline/commands/styles/subcommands.ts'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'

const triple = targetTriple()
const FFMPEG = fileURLToPath(
  new URL(
    `../../src-tauri/binaries/ffmpeg-${triple}${executableSuffix(triple)}`,
    import.meta.url,
  ),
)
const SESSION = 'sc-fixture-1'
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFOsAAAAASUVORK5CYII=',
  'base64',
)
const IDENTITY =
  'A stickman cook with a large round white head and thin black limbs. Outfit: a white apron and a tall chef hat.'
const CHARACTER_NAME = 'El Cocinero'

function ffmpeg(args) {
  return execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', ...args], {
    maxBuffer: 64 * 1024 * 1024,
  })
}
// Un JPEG liso, o un mosaico de 3×3 negro con UNA celda roja (fila y columna
// desde 1): así se ve qué celda recortó el «Original».
function jpeg(width, height, redCell) {
  const box = redCell
    ? [
        '-vf',
        `drawbox=x=${(redCell.column - 1) * 320}:y=${(redCell.row - 1) * 180}:w=320:h=180:color=red:t=fill`,
      ]
    : []
  return ffmpeg([
    '-f',
    'lavfi',
    '-i',
    `color=c=black:s=${width}x${height}`,
    ...box,
    '-frames:v',
    '1',
    '-f',
    'image2pipe',
    '-c:v',
    'mjpeg',
    'pipe:1',
  ])
}
// El color del centro de una imagen, como [r, g, b].
function centerColor(path) {
  const pixel = ffmpeg([
    '-i',
    path,
    '-vf',
    'crop=2:2:iw/2:ih/2,scale=1:1',
    '-frames:v',
    '1',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    'pipe:1',
  ])
  return [pixel[0], pixel[1], pixel[2]]
}

// Una sesión ya preparada: 2 mosaicos (el segundo con la celda roja en la
// fila 2, columna 3), 2 fotogramas, la miniatura y un diseño ya dibujado.
async function session(t, { source = 'youtube' } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-style-clone-draw-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const directory = join(root, '_style-clones', SESSION)
  await mkdir(directory, { recursive: true })

  const items =
    source === 'youtube'
      ? [
          { kind: 'mosaic', file: 'mosaic-1.jpg', rows: 3, columns: 3 },
          { kind: 'mosaic', file: 'mosaic-2.jpg', rows: 3, columns: 3 },
          { kind: 'frame', file: 'frame-1.jpg' },
          { kind: 'frame', file: 'frame-2.jpg' },
          { kind: 'thumbnail', file: 'thumbnail.jpg' },
        ]
      : [
          { kind: 'image', file: 'image-1.jpg' },
          { kind: 'image', file: 'image-2.jpg' },
        ]
  for (const item of items)
    await writeFile(
      join(directory, item.file),
      item.file === 'mosaic-2.jpg'
        ? jpeg(960, 540, { row: 2, column: 3 })
        : jpeg(
            item.kind === 'mosaic' ? 960 : 640,
            item.kind === 'mosaic' ? 540 : 360,
          ),
    )
  await writeFile(
    join(directory, 'material.json'),
    JSON.stringify({
      source,
      title: 'Fixture',
      items: items.map((item) => ({ ...item, mimeType: 'image/jpeg' })),
    }),
  )
  await writeFile(join(directory, 'design-r1-1.jpg'), jpeg(640, 360))
  return { root, directory }
}

function context(root, payload, events = [], apiKeys) {
  return {
    job: {
      jobId: 'fixture',
      projectsRoot: root,
      apiKeys: apiKeys ?? { fal: 'fixture', evolink: 'fixture' },
      binaryPaths: { ffmpeg: FFMPEG },
      payload: {
        sessionId: SESSION,
        round: 1,
        kind: 'scenes',
        imageProvider: 'evolink',
        ...payload,
      },
    },
    config: resolvePipelineConfig(),
    signal: new AbortController().signal,
    emitter: { emit: (event) => events.push(event) },
  }
}
const scenes = (count = 4) =>
  Array.from({ length: count }, (_, index) => ({
    index: index + 1,
    prompt: `Wide shot of [subject] stirring a pot in a dim kitchen, scene ${index + 1}. Style: flat stickman drawing.`,
  }))
const character = (travel) => ({
  travel,
  name: CHARACTER_NAME,
  description: IDENTITY,
  designFile: 'design-r1-1.jpg',
})

// Los proveedores de imágenes. `fail(prompt)` decide el fallo de un encargo:
// 'policy' (rechazo por contenido), 'credits' (saldo agotado), 'error' (fallo
// terminal del proveedor) o nada.
function providers(t, { fail = () => null, upload = true } = {}) {
  const calls = { images: [], uploads: [] }
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    const target = String(url)
    if (target.includes('/files/upload/base64')) {
      calls.uploads.push(JSON.parse(init.body))
      if (!upload) return new Response('nope', { status: 500 })
      return Response.json({
        data: { file_url: 'https://fixture.invalid/design.jpg' },
      })
    }
    if (target.endsWith('/v1/images/generations')) {
      const body = JSON.parse(init.body)
      calls.images.push({ url: target, ...body })
      const failure = fail(body.prompt, body)
      if (failure === 'credits')
        return Response.json(
          { error: { message: 'insufficient balance' } },
          { status: 402 },
        )
      return Response.json({
        id: `${failure ?? 'ok'}-${calls.images.length}`,
      })
    }
    if (target.includes('/v1/tasks/')) {
      const taskId = target.split('/').at(-1)
      if (taskId.startsWith('policy'))
        return Response.json({
          status: 'failed',
          error: {
            code: 'content_policy_violation',
            message: 'The request was rejected by the safety system',
          },
        })
      if (taskId.startsWith('error'))
        return Response.json({
          status: 'failed',
          error: { code: 'invalid_request', message: 'bad request' },
        })
      return Response.json({
        status: 'completed',
        results: [`https://fixture.invalid/${taskId}.png`],
      })
    }
    if (target.startsWith('https://fal.run/')) {
      const body = JSON.parse(init.body)
      calls.images.push({ url: target, ...body })
      return Response.json({
        images: [{ url: `https://fixture.invalid/${calls.images.length}.png` }],
      })
    }
    return new Response(PNG_BYTES, { headers: { 'content-type': 'image/png' } })
  })
  return calls
}
const sentPrompts = (calls) => calls.images.map((image) => image.prompt)
const byIndex = (result, index) =>
  result.items.find((item) => item.index === index)

// ── Los diseños del personaje ──

test('the three designs are drawn with their prompts as they arrived', async (t) => {
  const { root, directory } = await session(t)
  const calls = providers(t)
  const events = []
  const items = [1, 2, 3].map((index) => ({
    index,
    prompt: `Full body portrait of a stickman cook on a plain white background, design ${index}.`,
  }))

  const result = await styleCloneDraw(
    context(root, { kind: 'designs', round: 2, items }, events),
  )

  assert.deepEqual(
    sentPrompts(calls).sort(),
    items.map((item) => item.prompt),
  )
  assert.deepEqual(
    result.items.map((item) => item.file),
    ['design-r2-1.jpg', 'design-r2-2.jpg', 'design-r2-3.jpg'],
  )
  for (const item of result.items) {
    assert.equal(item.path, join(directory, item.file))
    assert.deepEqual(await readFile(item.path), PNG_BYTES)
    assert.equal(typeof item.mtimeMs, 'number')
    assert.equal(item.originalPath, undefined)
    assert.equal(item.errorCode, undefined)
  }
  // Cada tarjeta se anuncia al empezar y al terminar, con su archivo.
  for (const index of [1, 2, 3]) {
    const own = events.filter(
      (event) => event.type === 'progress' && event.detail.index === index,
    )
    assert.equal(own[0].detail.status, 'processing')
    assert.equal(own.at(-1).detail.status, 'completed')
    assert.equal(own.at(-1).detail.path, byIndex(result, index).path)
  }
})

// ── Las escenas y su personaje ──

test('scenes of a style without a character never send the bare subject tag', async (t) => {
  const { root } = await session(t)
  const calls = providers(t)

  const result = await styleCloneDraw(context(root, { items: scenes() }))

  assert.equal(result.items.length, 4)
  assert.deepEqual(
    result.items.map((item) => item.file),
    ['scene-r1-1.jpg', 'scene-r1-2.jpg', 'scene-r1-3.jpg', 'scene-r1-4.jpg'],
  )
  for (const prompt of sentPrompts(calls)) {
    assert.ok(!prompt.includes('[subject]'))
    assert.ok(!prompt.includes(IDENTITY))
  }
  assert.equal(calls.uploads.length, 0)
})

test('a prompt-identity character travels woven as text, never as an image', async (t) => {
  const { root } = await session(t)
  const calls = providers(t)

  await styleCloneDraw(
    context(root, { items: scenes(), character: character('text') }),
  )

  assert.equal(calls.uploads.length, 0)
  for (const image of calls.images) {
    assert.ok(image.prompt.includes(IDENTITY))
    assert.ok(!image.prompt.includes('[subject]'))
    assert.equal(image.image_urls, undefined)
  }
})

test('a photo character travels with the chosen design attached, uploaded once', async (t) => {
  const { root } = await session(t)
  const calls = providers(t)

  await styleCloneDraw(
    context(root, { items: scenes(), character: character('photo') }),
  )

  assert.equal(calls.uploads.length, 1)
  assert.ok(calls.uploads[0].base64_data.startsWith('data:image/jpeg;base64,'))
  assert.equal(calls.images.length, 4)
  for (const image of calls.images) {
    assert.deepEqual(image.image_urls, ['https://fixture.invalid/design.jpg'])
    assert.ok(
      image.prompt.startsWith(
        `REFERENCE: the attached image is "${CHARACTER_NAME}"`,
      ),
    )
    assert.ok(!image.prompt.includes('[subject]'))
  }
})

test('with Fal the design travels as the reference of the edit endpoint', async (t) => {
  const { root } = await session(t)
  const calls = providers(t)

  await styleCloneDraw(
    context(root, {
      items: scenes(2),
      character: character('photo'),
      imageProvider: 'fal',
    }),
  )

  assert.equal(calls.uploads.length, 0)
  assert.equal(calls.images.length, 2)
  for (const image of calls.images) {
    assert.ok(image.url.endsWith('/edit'))
    assert.ok(image.image_urls[0].startsWith('data:image/jpeg;base64,'))
  }
})

test('if the design cannot be uploaded the scenes carry the character as text', async (t) => {
  const { root } = await session(t)
  const calls = providers(t, { upload: false })

  const result = await styleCloneDraw(
    context(root, { items: scenes(), character: character('photo') }),
  )

  assert.equal(result.items.filter((item) => item.file).length, 4)
  for (const image of calls.images) {
    assert.equal(image.image_urls, undefined)
    assert.ok(image.prompt.includes(IDENTITY))
  }
})

test('a scene that fails with the reference is retried once as text', async (t) => {
  const { root } = await session(t)
  const calls = providers(t, {
    fail: (prompt, body) =>
      body.image_urls && prompt.includes('scene 2') ? 'error' : null,
  })

  const result = await styleCloneDraw(
    context(root, { items: scenes(), character: character('photo') }),
  )

  assert.ok(byIndex(result, 2).file)
  const second = calls.images.filter((image) =>
    image.prompt.includes('scene 2'),
  )
  assert.equal(second.length, 2)
  assert.equal(second[1].image_urls, undefined)
  assert.ok(second[1].prompt.includes(IDENTITY))
})

test('a photo character whose design is gone fails before spending anything', async (t) => {
  const { root } = await session(t)
  const calls = providers(t)

  await assert.rejects(
    styleCloneDraw(
      context(root, {
        items: scenes(),
        character: { ...character('photo'), designFile: 'design-r9-1.jpg' },
      }),
    ),
    { code: 'style_clone_file_missing' },
  )
  assert.equal(calls.images.length, 0)
})

// ── El «Original» de cada escena ──

test('each scene brings the original it recreates', async (t) => {
  const { root, directory } = await session(t)
  providers(t)
  const items = scenes()
  items[0].origin = { kind: 'frame', number: 2 }
  items[1].origin = { kind: 'mosaic', mosaic: 2, row: 2, column: 3 }
  items[2].origin = { kind: 'new' }
  // items[3] no dice origen.

  const result = await styleCloneDraw(context(root, { items }))

  assert.equal(byIndex(result, 1).originalPath, join(directory, 'frame-2.jpg'))
  assert.equal(byIndex(result, 3).originalPath, undefined)
  assert.equal(byIndex(result, 4).originalPath, undefined)

  // La celda del mosaico sale recortada: 320×180 y con el rojo de esa celda.
  const cell = byIndex(result, 2).originalPath
  assert.equal(cell, join(directory, 'original-r1-2.jpg'))
  assert.deepEqual(jpegSize(await readFile(cell)), { width: 320, height: 180 })
  const [red, green, blue] = centerColor(cell)
  assert.ok(
    red > 200 && green < 60 && blue < 60,
    `center is ${red},${green},${blue}`,
  )
})

test('an image of the user is the original of its scene', async (t) => {
  const { root, directory } = await session(t, { source: 'images' })
  providers(t)
  const items = scenes(2)
  items[0].origin = { kind: 'image', number: 2 }
  items[1].origin = { kind: 'frame', number: 1 }

  const result = await styleCloneDraw(context(root, { items }))

  assert.equal(byIndex(result, 1).originalPath, join(directory, 'image-2.jpg'))
  // Un origen que el material no tiene queda sin original, nunca con otro.
  assert.equal(byIndex(result, 2).originalPath, undefined)
})

test('an origin outside the material leaves the scene without an original', async (t) => {
  const { root } = await session(t)
  providers(t)
  const items = scenes()
  items[0].origin = { kind: 'mosaic', mosaic: 7, row: 1, column: 1 }
  items[1].origin = { kind: 'mosaic', mosaic: 1, row: 4, column: 1 }
  items[2].origin = { kind: 'frame', number: 0 }
  items[3].origin = { kind: 'mosaic', mosaic: 1, row: 1, column: 9 }

  const result = await styleCloneDraw(context(root, { items }))

  assert.ok(result.items.every((item) => item.file))
  assert.ok(result.items.every((item) => item.originalPath === undefined))
})

test('the designs never bring an original', async (t) => {
  const { root } = await session(t)
  providers(t)

  const result = await styleCloneDraw(
    context(root, {
      kind: 'designs',
      items: [
        {
          index: 1,
          prompt: 'Full body portrait of a stickman cook, plain background.',
          origin: { kind: 'frame', number: 1 },
        },
      ],
    }),
  )

  assert.equal(result.items[0].originalPath, undefined)
})

// ── Fallos ──

test('one failed image does not bring the round down', async (t) => {
  const { root } = await session(t)
  providers(t, {
    fail: (prompt) => (prompt.includes('scene 3') ? 'error' : null),
  })
  const events = []
  const items = scenes()
  items[2].origin = { kind: 'frame', number: 1 }

  const result = await styleCloneDraw(context(root, { items }, events))

  assert.equal(byIndex(result, 3).file, undefined)
  assert.equal(byIndex(result, 3).errorCode, 'image_provider_error')
  // El original se conserva: la tarjeta lo muestra junto al «Reintentar».
  assert.ok(byIndex(result, 3).originalPath)
  assert.equal(result.items.filter((item) => item.file).length, 3)
  const failed = events.find(
    (event) =>
      event.type === 'progress' &&
      event.detail.index === 3 &&
      event.detail.status === 'failed',
  )
  assert.equal(failed.detail.errorCode, 'image_provider_error')
})

test('a content rejection is retried once with the softened prompt', async (t) => {
  const { root } = await session(t)
  const calls = providers(t, {
    fail: (prompt) => (/\bcocaine\b/.test(prompt) ? 'policy' : null),
  })
  const items = scenes(2)
  items[0].prompt =
    'Close-up of bricks of cocaine on a steel table. Style: flat stickman drawing.'

  const result = await styleCloneDraw(context(root, { items }))

  assert.ok(byIndex(result, 1).file)
  const attempts = calls.images.filter((image) =>
    image.prompt.includes('steel table'),
  )
  assert.equal(attempts.length, 2)
  assert.ok(!/cocaine/.test(attempts[1].prompt))
})

test('a content rejection with nothing to soften fails only that image', async (t) => {
  const { root } = await session(t)
  const calls = providers(t, {
    fail: (prompt) => (prompt.includes('scene 1') ? 'policy' : null),
  })

  const result = await styleCloneDraw(context(root, { items: scenes(2) }))

  assert.equal(byIndex(result, 1).errorCode, 'image_content_policy')
  assert.ok(byIndex(result, 2).file)
  assert.equal(
    calls.images.filter((image) => image.prompt.includes('scene 1')).length,
    1,
  )
})

test('running out of credits fails the job with its own code', async (t) => {
  const { root } = await session(t)
  providers(t, {
    fail: (prompt) => (prompt.includes('scene 2') ? 'credits' : null),
  })
  const events = []

  await assert.rejects(
    styleCloneDraw(context(root, { items: scenes() }, events)),
    { code: 'image_insufficient_credits' },
  )
  // Las que sí salieron quedan anunciadas: la app no las pierde.
  const completed = events.filter(
    (event) => event.type === 'progress' && event.detail.status === 'completed',
  )
  assert.equal(completed.length, 3)
})

test('without the key of the chosen provider nothing is drawn', async (t) => {
  const { root } = await session(t)
  const calls = providers(t)

  await assert.rejects(
    styleCloneDraw(context(root, { items: scenes() }, [], { fal: 'fixture' })),
    { code: 'missing_api_key' },
  )
  assert.equal(calls.images.length, 0)
})

// ── El pedido ──

test('a malformed request is rejected before spending anything', async (t) => {
  const { root } = await session(t)
  const calls = providers(t)
  const invalid = [
    { sessionId: '../outside', items: scenes() },
    { round: 0, items: scenes() },
    { round: 1.5, items: scenes() },
    { kind: 'portraits', items: scenes() },
    { imageProvider: 'dalle', items: scenes() },
    { items: [] },
    { items: scenes(5) },
    { kind: 'designs', items: scenes(4) },
    { items: [scenes(1)[0], scenes(1)[0]] },
    { items: [{ index: 1, prompt: '   ' }] },
    { items: [{ index: 9, prompt: 'A valid prompt for a test scene here.' }] },
    { items: scenes(), character: { ...character('text'), travel: 'video' } },
    { items: scenes(), character: { ...character('text'), description: '' } },
    {
      items: scenes(),
      character: { ...character('photo'), designFile: '../../secret.jpg' },
    },
    { kind: 'designs', items: scenes(3), character: character('text') },
  ]

  for (const payload of invalid)
    await assert.rejects(
      styleCloneDraw(context(root, payload)),
      { code: 'invalid_payload' },
      JSON.stringify(payload).slice(0, 120),
    )
  assert.equal(calls.images.length, 0)
})

test('the subcommand is registered', () => {
  assert.equal(stylesSubcommands['style-clone-draw'], styleCloneDraw)
})
