// Cliente de HeyGen y biblioteca de avatares en disco (ADR-0057, entrega 1):
// la clasificación de errores, el reintento ante 429, la subida multipart, la
// clave de idempotencia al crear un avatar desde foto, y la carpeta
// `avatars/` con metadata tolerante. Importa el código real del sidecar (Node
// quita los tipos) y simula HeyGen con `fetch` falso: nada sale a la red.
import assert from 'node:assert/strict'
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  createHeyGenClient,
  toHeyGenLook,
} from '../../pipeline/providers/avatar/heygen.ts'
import { heygenFailure } from '../../pipeline/providers/avatar/heygen-errors.ts'
import {
  assertValidAvatarId,
  listAvatarEntries,
  MAX_PHOTO_BYTES,
  newAvatarId,
  readAvatarEntry,
  readAvatarMetadata,
  readAvatarPhoto,
  writeAvatarMetadata,
  writePreviewFile,
} from '../../pipeline/commands/avatars/avatar-library.ts'
import {
  isProjectDirectoryName,
  RESERVED_ROOT_DIRECTORIES,
} from '../../pipeline/project/paths.ts'
import { INSUFFICIENT_CREDITS_CODES } from '../../pipeline/utils/insufficient-credits.ts'

const PNG_HEAD = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFOsAAAAASUVORK5CYII=',
  'base64',
)

// Cabecera JFIF mínima: lo único que `validateImageBytes` mira son los magic
// bytes (FF D8 FF) y que haya al menos 12 bytes en total.
const JPEG_HEAD = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
])

const RAW_LOOK = {
  id: 'look-1',
  name: 'Ana',
  avatar_type: 'photo_avatar',
  group_id: 'group-1',
  preview_image_url: 'https://cdn.example/ana.png',
  gender: 'female',
  tags: [],
  supported_api_engines: ['avatar_iv', 'avatar_iii', 'avatar_x'],
  preferred_orientation: 'portrait',
  status: 'completed',
}

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })

const client = () => createHeyGenClient('key-123', new AbortController().signal)

async function failure(promise) {
  try {
    await promise
  } catch (error) {
    return error
  }
  assert.fail('expected a failure')
}

// Un solo fetch simulado vivo por test: un segundo `t.mock.method` sobre el
// mismo global toma al primero como «original» y, al terminar el test, lo deja
// puesto en lugar del fetch real.
function mockFetch(t, implementation) {
  globalThis.fetch.mock?.restore()
  return t.mock.method(globalThis, 'fetch', implementation)
}

test('toHeyGenLook: mapea el look y descarta motores desconocidos', () => {
  const look = toHeyGenLook(RAW_LOOK)
  assert.deepEqual(look, {
    lookId: 'look-1',
    name: 'Ana',
    lookType: 'photo_avatar',
    groupId: 'group-1',
    previewImageUrl: 'https://cdn.example/ana.png',
    gender: 'female',
    supportedEngines: ['avatar_iv', 'avatar_iii'],
    preferredOrientation: 'portrait',
    status: 'ready',
  })
  assert.equal(toHeyGenLook({ ...RAW_LOOK, id: '' }), null)
  assert.equal(toHeyGenLook({ ...RAW_LOOK, avatar_type: 'robot' }), null)
  assert.equal(toHeyGenLook(null), null)
})

test('listLooks: arma la consulta, pagina y manda la clave en X-Api-Key', async (t) => {
  const calls = []
  mockFetch(t, async (url, init) => {
    calls.push({ url: String(url), headers: init.headers })
    return json({
      data: [RAW_LOOK, { id: 'x' }],
      has_more: true,
      next_token: 'tok-2',
    })
  })
  const page = await client().listLooks({
    ownership: 'public',
    lookType: 'photo_avatar',
    token: 'tok-1',
  })
  assert.equal(page.looks.length, 1)
  assert.equal(page.nextToken, 'tok-2')
  const url = new URL(calls[0].url)
  assert.equal(url.pathname, '/v3/avatars/looks')
  assert.equal(url.searchParams.get('ownership'), 'public')
  assert.equal(url.searchParams.get('avatar_type'), 'photo_avatar')
  assert.equal(url.searchParams.get('limit'), '50')
  assert.equal(url.searchParams.get('token'), 'tok-1')
  assert.equal(calls[0].headers['X-Api-Key'], 'key-123')
})

test('listLooks: sin has_more no hay página siguiente', async (t) => {
  mockFetch(t, async () =>
    json({ data: [RAW_LOOK], has_more: false, next_token: null }),
  )
  assert.equal((await client().listLooks({})).nextToken, null)
})

test('errores: la clasificación sigue el diseño §14', () => {
  const cases = [
    [
      401,
      '{"error":{"code":"unauthorized","message":"bad key"}}',
      'avatar_invalid_key',
    ],
    [
      403,
      '{"error":{"code":"forbidden","message":"no"}}',
      'avatar_invalid_key',
    ],
    [
      402,
      '{"error":{"message":"payment required"}}',
      'avatar_insufficient_credits',
    ],
    [
      400,
      '{"error":{"code":"insufficient_credits","message":"Insufficient credits"}}',
      'avatar_insufficient_credits',
    ],
    // Dos reglas compiten: el saldo se mira ANTES que el status (un 403 con
    // «Insufficient credits» es saldo, no clave inválida), salvo en un 429,
    // que nunca es saldo sino «esperá».
    [
      403,
      '{"error":{"code":"forbidden","message":"Insufficient credits"}}',
      'avatar_insufficient_credits',
    ],
    [
      429,
      '{"error":{"code":"forbidden","message":"Insufficient credits"}}',
      'avatar_rate_limited',
    ],
    [
      429,
      '{"error":{"code":"rate_limited","message":"slow down"}}',
      'avatar_rate_limited',
    ],
    [
      400,
      '{"error":{"code":"invalid_request","message":"engine not supported","param":"engine"}}',
      'avatar_look_unsupported',
    ],
    [
      400,
      '{"error":{"code":"invalid_request","message":"unknown avatar","param":"avatar_id"}}',
      'avatar_look_unsupported',
    ],
    [
      400,
      '{"error":{"code":"content_moderation","message":"Content rejected by moderation"}}',
      'avatar_moderation_rejected',
    ],
    // La moderación se lee solo del sobre JSON de un rechazo (status < 500): el
    // texto crudo de un proxy o de una página de error no es una moderación
    // aunque diga «policy», «consent» o «Not Allowed».
    [
      503,
      '<html><body><h1>Service Unavailable</h1><a href="/privacy">Privacy policy</a></body></html>',
      'avatar_network',
    ],
    [502, 'consent service unavailable', 'avatar_network'],
    // Un 405 en texto crudo tampoco es moderación («Not Allowed»): es un
    // rechazo del cliente, ver más abajo.
    [405, 'Method Not Allowed', 'avatar_invalid_request'],
    [
      502,
      '{"error":{"code":"unavailable","message":"consent service unavailable"}}',
      'avatar_network',
    ],
    [
      400,
      '{"error":{"code":"invalid_request","message":"name too long","param":"name"}}',
      'avatar_invalid_request',
    ],
    [
      409,
      '{"error":{"code":"request_in_progress","message":"retrying"}}',
      'avatar_invalid_request',
    ],
    [500, 'Internal Server Error', 'avatar_network'],
    [502, '', 'avatar_network'],
    // Cualquier otro rechazo del cliente (status < 500) es un pedido que HeyGen
    // no aceptó, no «revisá tu conexión»: el 405 de arriba, y también 413, 415
    // y 422, con texto crudo o con el sobre JSON. Solo desde el 500 en adelante
    // es «HeyGen no está».
    [413, 'Request Entity Too Large', 'avatar_invalid_request'],
    [415, '', 'avatar_invalid_request'],
    [
      422,
      '{"error":{"code":"unprocessable","message":"file could not be decoded"}}',
      'avatar_invalid_request',
    ],
    // El `param` de look se mira ANTES que la moderación: «not allowed» en el
    // mensaje de un `avatar_id` rechazado dice «este tipo de avatar no sirve
    // acá», no que HeyGen haya moderado el contenido.
    [
      400,
      '{"error":{"code":"invalid_request","message":"Not allowed for this avatar type","param":"avatar_id"}}',
      'avatar_look_unsupported',
    ],
    // Y con otro `param` la misma frase sigue siendo una moderación.
    [
      400,
      '{"error":{"code":"invalid_request","message":"Name not allowed by policy","param":"name"}}',
      'avatar_moderation_rejected',
    ],
  ]
  for (const [status, body, code] of cases) {
    const error = heygenFailure(status, body)
    assert.equal(error.code, code, `HTTP ${status} ${body}`)
    assert.equal(error.provider, 'heygen')
    assert.equal(error.httpStatus, status)
  }
  assert.ok(INSUFFICIENT_CREDITS_CODES.has('avatar_insufficient_credits'))
})

test('request: ante 429 reintenta y después del tope falla con avatar_rate_limited', async (t) => {
  // Entre intentos rateLimitDelayMs espera 3, 5 y 9 s (un `retry-after: 0`
  // cuenta como «sin dato»): la espera se cumple al instante para que el
  // guard no dure 17 s.
  t.mock.method(globalThis, 'setTimeout', (callback) => setImmediate(callback))
  let calls = 0
  mockFetch(t, async () => {
    calls++
    return json({ error: { code: 'rate_limited', message: 'slow' } }, 429)
  })
  const error = await failure(client().getLook('look-1'))
  assert.equal(error.code, 'avatar_rate_limited')
  assert.equal(calls, 4)
})

test('request: un 200 que no es JSON o sin data es avatar_provider_error, nunca un TypeError', async (t) => {
  mockFetch(t, async () => new Response('<html>', { status: 200 }))
  assert.equal(
    (await failure(client().getLook('look-1'))).code,
    'avatar_provider_error',
  )
  mockFetch(t, async () => json({ data: null }))
  assert.equal(
    (await failure(client().getLook('look-1'))).code,
    'avatar_provider_error',
  )
  mockFetch(t, async () => json({ data: { id: 'x' } }))
  assert.equal(
    (await failure(client().getLook('look-1'))).code,
    'avatar_provider_error',
  )
})

test('request: la red caída es avatar_network y la cancelación no se disfraza', async (t) => {
  mockFetch(t, async () => {
    throw new TypeError('fetch failed')
  })
  assert.equal(
    (await failure(client().getLook('look-1'))).code,
    'avatar_network',
  )

  const controller = new AbortController()
  mockFetch(t, async (_url, init) => {
    controller.abort()
    init.signal.throwIfAborted()
  })
  const cancelled = createHeyGenClient('key', controller.signal)
  const error = await failure(cancelled.getLook('look-1'))
  // El AbortError del signal sale tal cual. Si el cliente no le pasara a
  // `fetch` el signal del job, `throwIfAborted` no lanzaría y saldría otro
  // error (un TypeError por la respuesta vacía): «no es de red» no alcanza.
  assert.equal(error.name, 'AbortError')
})

test('uploadAsset: manda multipart con el archivo y devuelve el asset_id', async (t) => {
  let received
  mockFetch(t, async (url, init) => {
    received = { url: String(url), body: init.body, headers: init.headers }
    return json({
      data: {
        asset_id: 'asset-9',
        url: 'https://x',
        mime_type: 'image/png',
        size_bytes: 70,
      },
    })
  })
  const assetId = await client().uploadAsset(PNG_HEAD, 'photo.png', 'image/png')
  assert.equal(assetId, 'asset-9')
  assert.ok(received.url.endsWith('/v3/assets'))
  assert.ok(received.body instanceof FormData)
  const file = received.body.get('file')
  assert.equal(file.name, 'photo.png')
  assert.equal(file.type, 'image/png')
  assert.equal(file.size, PNG_HEAD.length)
  assert.equal(received.headers['Content-Type'], undefined)
})

test('createPhotoAvatar: cuerpo JSON, Idempotency-Key y las dos formas de respuesta', async (t) => {
  let received
  mockFetch(t, async (url, init) => {
    received = {
      url: String(url),
      headers: init.headers,
      body: JSON.parse(init.body),
    }
    return json({
      data: {
        avatar_item: { ...RAW_LOOK, status: 'processing' },
        avatar_group: { id: 'group-1', name: 'Ana' },
      },
    })
  })
  const created = await client().createPhotoAvatar({
    name: 'Ana',
    assetId: 'asset-9',
    idempotencyKey: 'vimo-photo-abc',
  })
  assert.ok(received.url.endsWith('/v3/avatars'))
  assert.equal(received.headers['Idempotency-Key'], 'vimo-photo-abc')
  assert.deepEqual(received.body, {
    type: 'photo',
    name: 'Ana',
    file: { type: 'asset_id', asset_id: 'asset-9' },
  })
  assert.equal(created.look.lookId, 'look-1')
  assert.equal(created.look.status, 'processing')
  assert.equal(created.groupId, 'group-1')

  mockFetch(t, async () =>
    json({
      data: {
        avatar_item: null,
        avatar_group: { id: 'group-2', name: 'Ana', status: 'processing' },
      },
    }),
  )
  const pending = await client().createPhotoAvatar({
    name: 'Ana',
    assetId: 'asset-9',
    idempotencyKey: 'k',
  })
  assert.equal(pending.look, null)
  assert.equal(pending.groupId, 'group-2')

  mockFetch(t, async () =>
    json({ data: { avatar_item: null, avatar_group: null } }),
  )
  assert.equal(
    (
      await failure(
        client().createPhotoAvatar({
          name: 'Ana',
          assetId: 'a',
          idempotencyKey: 'k',
        }),
      )
    ).code,
    'avatar_provider_error',
  )
})

test('biblioteca: ids y carpeta reservada', () => {
  // sanitizeFileName quita acentos y cambia lo demás por `_`.
  assert.match(newAvatarId('Ana María López'), /^ana_maria_lopez-[a-z0-9]{6}$/)
  assert.match(newAvatarId('   '), /^avatar-[a-z0-9]{6}$/)
  assert.doesNotThrow(() => assertValidAvatarId('ana-abc123'))
  for (const id of ['', '../x', 'ana/..', 'a b', 'ñ']) {
    assert.throws(
      () => assertValidAvatarId(id),
      (error) => error.code === 'invalid_payload',
      id,
    )
  }
  assert.ok(RESERVED_ROOT_DIRECTORIES.has('avatars'))
  assert.equal(isProjectDirectoryName('avatars'), false)
})

test('biblioteca: metadata atómica, listado tolerante y preview por extensión real', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'vimo-avatar-library-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const avatarsDirectory = join(root, 'avatars')

  const first = join(avatarsDirectory, 'ana-aaaaaa')
  await mkdir(first, { recursive: true })
  const previewFile = await writePreviewFile(first, {
    bytes: PNG_HEAD,
    ext: 'png',
    mime: 'image/png',
  })
  assert.equal(previewFile, 'preview.png')
  await writeAvatarMetadata(first, {
    name: 'Ana',
    lookId: 'look-1',
    lookType: 'photo_avatar',
    ownership: 'own',
    supportedEngines: ['avatar_iv'],
    status: 'ready',
    previewFile,
    createdAt: '2026-10-09T01:00:00.000Z',
  })
  const stored = await readAvatarMetadata(first)
  assert.equal(stored.name, 'Ana')
  assert.equal(
    (await readFile(join(first, 'metadata.json'), 'utf8')).endsWith('\n'),
    true,
  )

  const second = join(avatarsDirectory, 'bob-bbbbbb')
  await mkdir(second, { recursive: true })
  await writeAvatarMetadata(second, {
    name: 'Bob',
    lookId: 'look-2',
    lookType: 'studio_avatar',
    ownership: 'stock',
    supportedEngines: [],
    status: 'ready',
    createdAt: '2026-10-09T02:00:00.000Z',
  })
  const corrupt = join(avatarsDirectory, 'corrupt-cccccc')
  await mkdir(corrupt, { recursive: true })
  await writeFile(join(corrupt, 'metadata.json'), '{not json')
  // Parsea, pero sin un `createdAt` de texto (falta, o es de otro tipo) no hay
  // con qué ordenar: se saltea como una corrupta en vez de tumbar el listado.
  for (const [id, createdAt] of [
    ['undated-eeeeee', undefined],
    ['numeric-ffffff', 20261009],
  ]) {
    const undated = join(avatarsDirectory, id)
    await mkdir(undated, { recursive: true })
    await writeFile(
      join(undated, 'metadata.json'),
      JSON.stringify({
        name: id,
        lookId: 'look-3',
        lookType: 'studio_avatar',
        ownership: 'stock',
        supportedEngines: [],
        status: 'ready',
        createdAt,
      }),
    )
  }
  await mkdir(join(avatarsDirectory, 'empty-dddddd'), { recursive: true })
  await mkdir(join(avatarsDirectory, 'bad name'), { recursive: true })

  const entries = await listAvatarEntries(avatarsDirectory)
  assert.deepEqual(
    entries.map((entry) => entry.id),
    ['bob-bbbbbb', 'ana-aaaaaa'],
  )
  assert.equal(await readAvatarEntry(avatarsDirectory, 'undated-eeeeee'), null)
  assert.equal(await readAvatarEntry(avatarsDirectory, 'numeric-ffffff'), null)
  assert.equal(entries[1].previewPath, join(first, 'preview.png'))
  assert.equal(entries[0].previewPath, undefined)
  assert.deepEqual(await listAvatarEntries(join(root, 'missing')), [])
})

test('biblioteca: la foto se valida por magic bytes y por tamaño', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'vimo-avatar-photo-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const good = join(root, 'photo.png')
  await writeFile(good, PNG_HEAD)
  const image = await readAvatarPhoto(good)
  assert.equal(image.ext, 'png')

  const jpeg = join(root, 'photo.jpg')
  await writeFile(jpeg, JPEG_HEAD)
  assert.equal((await readAvatarPhoto(jpeg)).ext, 'jpg')

  const text = join(root, 'photo.txt')
  await writeFile(text, 'not an image at all')
  assert.equal(
    (await failure(readAvatarPhoto(text))).code,
    'avatar_photo_invalid',
  )

  // `POST /v3/assets` de HeyGen no acepta WEBP (su OpenAPI lista png, jpeg,
  // mp4, webm, mp3, wav, pdf y srt): un WEBP válido para Vimo se rechaza en
  // local, antes de subirlo, con un mensaje propio y no el de «no es imagen».
  const webp = join(root, 'photo.webp')
  await writeFile(
    webp,
    Buffer.concat([
      Buffer.from('RIFF\x24\x00\x00\x00WEBPVP8 ', 'latin1'),
      Buffer.alloc(32),
    ]),
  )
  const webpError = await failure(readAvatarPhoto(webp))
  assert.equal(webpError.code, 'avatar_photo_invalid')
  assert.match(webpError.message, /only accepts JPEG or PNG/)

  const huge = join(root, 'huge.png')
  await writeFile(
    huge,
    Buffer.concat([PNG_HEAD, Buffer.alloc(MAX_PHOTO_BYTES)]),
  )
  const hugeError = await failure(readAvatarPhoto(huge))
  assert.equal(hugeError.code, 'avatar_photo_invalid')
  assert.match(hugeError.message, /between 1 byte and/)
  // El tope sale del `stat`, antes de abrir el archivo: sin permiso de lectura
  // (en Windows `chmod` no lo quita y el resultado es el mismo) igual se sabe
  // que pesa de más, en vez de fallar con «no se pudo leer».
  await chmod(huge, 0o000)
  assert.match(
    (await failure(readAvatarPhoto(huge))).message,
    /between 1 byte and/,
  )

  const empty = join(root, 'empty.png')
  await writeFile(empty, '')
  assert.match(
    (await failure(readAvatarPhoto(empty))).message,
    /between 1 byte and/,
  )
  assert.equal(
    (await failure(readAvatarPhoto(join(root, 'missing.png')))).code,
    'avatar_photo_invalid',
  )
})
