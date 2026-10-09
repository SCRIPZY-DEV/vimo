// Los seis subcomandos de la biblioteca de avatares (ADR-0057, entrega 1)
// contra una carpeta raíz temporal y un HeyGen simulado con `fetch` falso:
// el orden «validar la foto antes de hablar con HeyGen», la clave de
// idempotencia determinista, el refresco mientras entrena, el alta de stock
// sin duplicados y el borrado. Importa los handlers reales del sidecar.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  avatarCreatePhoto,
  photoIdempotencyKey,
} from '../../pipeline/commands/avatars/avatar-create-photo.ts'
import { avatarsSubcommands } from '../../pipeline/commands/avatars/subcommands.ts'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'

const PNG_HEAD = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFOsAAAAASUVORK5CYII=',
  'base64',
)

// Cabecera mínima de un WEBP (`RIFF`, tamaño, `WEBP`, `VP8 `) con relleno: los
// magic bytes que Vimo reconoce como imagen y HeyGen no acepta.
const WEBP_HEAD = Buffer.concat([
  Buffer.from('RIFF\x24\x00\x00\x00WEBPVP8 ', 'latin1'),
  Buffer.alloc(32),
])

const RAW_LOOK = {
  id: 'look-1',
  name: 'Ana',
  avatar_type: 'photo_avatar',
  group_id: 'group-1',
  preview_image_url: 'https://cdn.example/ana.png',
  supported_api_engines: ['avatar_iv', 'avatar_iii'],
  preferred_orientation: 'portrait',
  status: 'processing',
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

// `events` recoge lo que el handler emite por el emitter (por ejemplo el log
// `warn` de una vista previa que no se pudo bajar).
function context(root, payload, apiKeys = { heygen: 'key-123' }, events = []) {
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

async function failure(promise) {
  try {
    await promise
  } catch (error) {
    return error
  }
  assert.fail('expected a failure')
}

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function session(t) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-avatars-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const photo = join(root, 'ana.png')
  await writeFile(photo, PNG_HEAD)
  return { root, photo }
}

// HeyGen simulado: responde según la ruta y anota cada llamada. `creation`
// fija la respuesta de `POST /v3/avatars` (un objeto, o una función que la
// arma desde el cuerpo del pedido) y `groupLooks` los looks de cada grupo: con
// `group_id` en la consulta HeyGen filtra por grupo, y un grupo sin looks
// devuelve una página vacía.
function fakeHeyGen(
  t,
  { lookStatus = 'processing', creation, groupLooks = {} } = {},
) {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    const target = new URL(String(url))
    calls.push({ path: target.pathname, search: target.search, init })
    if (target.pathname === '/v3/assets')
      return json({
        data: {
          asset_id: 'asset-9',
          url: 'https://x',
          mime_type: 'image/png',
          size_bytes: 70,
        },
      })
    if (target.pathname === '/v3/avatars')
      return json({
        data:
          typeof creation === 'function'
            ? creation(JSON.parse(init.body))
            : (creation ?? {
                avatar_item: RAW_LOOK,
                avatar_group: { id: 'group-1', name: 'Ana' },
              }),
      })
    if (target.pathname === '/v3/avatars/looks/look-1')
      return json({
        data: {
          ...RAW_LOOK,
          status: lookStatus,
          supported_api_engines: ['avatar_iv'],
        },
      })
    if (target.pathname === '/v3/avatars/looks') {
      const groupId = target.searchParams.get('group_id')
      const looks = groupId ? (groupLooks[groupId] ?? []) : [RAW_LOOK]
      return json({ data: looks, has_more: false, next_token: null })
    }
    if (target.hostname === 'cdn.example')
      return new Response(PNG_HEAD, {
        status: 200,
        headers: { 'content-type': 'image/png' },
      })
    return new Response('not found', { status: 404 })
  })
  return calls
}

test('el mapa expone exactamente los seis subcomandos', () => {
  assert.deepEqual(Object.keys(avatarsSubcommands).sort(), [
    'avatar-add',
    'avatar-create-photo',
    'avatar-delete',
    'avatar-refresh',
    'avatar-stock-looks',
    'avatars-list',
  ])
})

test('avatars-list: sin biblioteca devuelve una lista vacía', async (t) => {
  const { root } = await session(t)
  assert.deepEqual(await avatarsSubcommands['avatars-list'](context(root)), {
    entries: [],
  })
})

test('avatars-list: un previewFile que no es texto se trata como ausente y no tumba el listado', async (t) => {
  const { root } = await session(t)
  const directory = join(root, 'avatars', 'ana-aaaaaa')
  await mkdir(directory, { recursive: true })
  await writeFile(
    join(directory, 'metadata.json'),
    JSON.stringify({
      name: 'Ana',
      lookId: 'look-1',
      lookType: 'photo_avatar',
      ownership: 'own',
      supportedEngines: [],
      status: 'ready',
      previewFile: 5,
      createdAt: '2026-10-09T01:00:00.000Z',
    }),
  )
  const { entries } = await avatarsSubcommands['avatars-list'](context(root))
  assert.equal(entries.length, 1)
  assert.equal(entries[0].name, 'Ana')
  assert.equal(entries[0].previewPath, undefined)
})

test('avatars-list: lo guardado con otra forma se normaliza y un lookType desconocido saltea la entrada', async (t) => {
  const { root } = await session(t)
  const stored = {
    name: 'Ana',
    lookId: 'look-1',
    lookType: 'photo_avatar',
    ownership: 'own',
    supportedEngines: ['avatar_iv'],
    status: 'ready',
    createdAt: '2026-10-09T01:00:00.000Z',
  }
  // Metadata editada a mano o escrita por otra versión de la app: lo que sale
  // hacia la interfaz se valida al listar, no se confía en el tipo.
  const folders = {
    'ana-aaaaaa': stored,
    'engines-bbbbbb': { ...stored, name: 'Engines', supportedEngines: 'x' },
    'mixed-cccccc': {
      ...stored,
      name: 'Mixed',
      supportedEngines: ['avatar_iii', 'avatar_zzz', 5],
    },
    'weird-dddddd': {
      ...stored,
      name: 'Weird',
      ownership: 'alien',
      status: 'paused',
    },
    'training-ffffff': {
      ...stored,
      name: 'Training',
      ownership: 'stock',
      status: 'processing',
    },
    'robot-eeeeee': { ...stored, name: 'Robot', lookType: 'robot' },
  }
  for (const [id, metadata] of Object.entries(folders)) {
    const directory = join(root, 'avatars', id)
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'metadata.json'), JSON.stringify(metadata))
  }

  const { entries } = await avatarsSubcommands['avatars-list'](context(root))
  const byName = Object.fromEntries(entries.map((entry) => [entry.name, entry]))
  assert.deepEqual(Object.keys(byName).sort(), [
    'Ana',
    'Engines',
    'Mixed',
    'Training',
    'Weird',
  ])
  assert.deepEqual(byName.Engines.supportedEngines, [])
  assert.deepEqual(byName.Mixed.supportedEngines, ['avatar_iii'])
  assert.equal(byName.Weird.ownership, 'stock')
  assert.equal(byName.Weird.status, 'ready')
  // Los valores válidos pasan tal cual: no todo se vuelve «stock» y «ready».
  assert.equal(byName.Ana.ownership, 'own')
  assert.deepEqual(byName.Ana.supportedEngines, ['avatar_iv'])
  assert.equal(byName.Training.ownership, 'stock')
  assert.equal(byName.Training.status, 'processing')
})

test('avatar-create-photo: valida el payload y la foto ANTES de hablar con HeyGen', async (t) => {
  const { root, photo } = await session(t)
  const calls = fakeHeyGen(t)
  assert.equal(
    (
      await failure(
        avatarCreatePhoto(context(root, { name: '', photoPath: photo })),
      )
    ).code,
    'invalid_payload',
  )
  assert.equal(
    (await failure(avatarCreatePhoto(context(root, { name: 'Ana' })))).code,
    'invalid_payload',
  )
  const text = join(root, 'nota.txt')
  await writeFile(text, 'hola')
  assert.equal(
    (
      await failure(
        avatarCreatePhoto(context(root, { name: 'Ana', photoPath: text })),
      )
    ).code,
    'avatar_photo_invalid',
  )
  // HeyGen no acepta WEBP en la subida de assets: un WEBP válido para Vimo se
  // corta acá, gratis, en vez de subirse y volver como un «probá de nuevo».
  const webp = join(root, 'ana.webp')
  await writeFile(webp, WEBP_HEAD)
  assert.equal(
    (
      await failure(
        avatarCreatePhoto(context(root, { name: 'Ana', photoPath: webp })),
      )
    ).code,
    'avatar_photo_invalid',
  )
  assert.equal(calls.length, 0)
  assert.equal(await exists(join(root, 'avatars')), false)
  assert.equal(
    (
      await failure(
        avatarCreatePhoto(context(root, { name: 'Ana', photoPath: photo }, {})),
      )
    ).code,
    'missing_api_key',
  )
  assert.equal(calls.length, 0)
})

test('avatar-create-photo: sin carpeta raíz falla ANTES de pagar a HeyGen', async (t) => {
  const { photo } = await session(t)
  const calls = fakeHeyGen(t)
  // Foto válida y clave puesta: lo único que falta es dónde guardar el avatar,
  // y eso se sabe gratis, sin subir la foto ni crear (y cobrar) nada.
  const error = await failure(
    avatarCreatePhoto(context(undefined, { name: 'Ana', photoPath: photo })),
  )
  assert.equal(error.code, 'missing_projects_root')
  assert.equal(calls.length, 0)
})

test('avatar-create-photo: sube la foto, crea el avatar con clave de idempotencia y guarda la foto como preview', async (t) => {
  const { root, photo } = await session(t)
  const calls = fakeHeyGen(t)
  const { entry } = await avatarCreatePhoto(
    context(root, { name: '  Ana  ', photoPath: photo }),
  )
  assert.equal(entry.name, 'Ana')
  assert.equal(entry.lookId, 'look-1')
  assert.equal(entry.lookType, 'photo_avatar')
  assert.equal(entry.ownership, 'own')
  assert.equal(entry.status, 'processing')
  assert.equal(entry.groupId, 'group-1')
  assert.deepEqual(entry.supportedEngines, ['avatar_iv', 'avatar_iii'])
  assert.equal(
    entry.previewPath,
    join(root, 'avatars', entry.id, 'preview.png'),
  )
  assert.equal((await readFile(entry.previewPath)).equals(PNG_HEAD), true)

  assert.deepEqual(
    calls.map((call) => call.path),
    ['/v3/assets', '/v3/avatars'],
  )
  const creation = calls[1].init
  assert.equal(
    creation.headers['Idempotency-Key'],
    photoIdempotencyKey('Ana', PNG_HEAD),
  )
  assert.match(
    creation.headers['Idempotency-Key'],
    /^vimo-avatar-photo-[0-9a-f]{32}$/,
  )
  assert.deepEqual(JSON.parse(creation.body), {
    type: 'photo',
    name: 'Ana',
    file: { type: 'asset_id', asset_id: 'asset-9' },
  })
  assert.equal(
    photoIdempotencyKey('Ana', PNG_HEAD),
    photoIdempotencyKey('Ana', Buffer.from(PNG_HEAD)),
  )
  assert.notEqual(
    photoIdempotencyKey('Ana', PNG_HEAD),
    photoIdempotencyKey('Bob', PNG_HEAD),
  )

  const stored = JSON.parse(
    await readFile(join(root, 'avatars', entry.id, 'metadata.json'), 'utf8'),
  )
  assert.equal(stored.previewFile, 'preview.png')
  assert.equal(stored.lookId, 'look-1')

  // Repetir el alta manda la misma clave de idempotencia (HeyGen devuelve el
  // mismo avatar sin cobrar otra vez) y la biblioteca no lo duplica.
  const repeated = await avatarCreatePhoto(
    context(root, { name: 'Ana', photoPath: photo }),
  )
  assert.equal(repeated.entry.id, entry.id)
  assert.equal(
    calls[3].init.headers['Idempotency-Key'],
    creation.headers['Idempotency-Key'],
  )
  assert.equal(
    (await avatarsSubcommands['avatars-list'](context(root))).entries.length,
    1,
  )
})

test('avatar-create-photo: si HeyGen devuelve solo el grupo, el look queda pendiente', async (t) => {
  const { root, photo } = await session(t)
  fakeHeyGen(t, {
    creation: {
      avatar_item: null,
      avatar_group: { id: 'group-7', name: 'Ana', status: 'processing' },
    },
  })
  const { entry } = await avatarCreatePhoto(
    context(root, { name: 'Ana', photoPath: photo }),
  )
  assert.equal(entry.lookId, null)
  assert.equal(entry.groupId, 'group-7')
  assert.equal(entry.status, 'processing')

  // Sin look, la entrada repetida se reconoce por su grupo.
  const repeated = await avatarCreatePhoto(
    context(root, { name: 'Ana', photoPath: photo }),
  )
  assert.equal(repeated.entry.id, entry.id)
  assert.equal(
    (await avatarsSubcommands['avatars-list'](context(root))).entries.length,
    1,
  )
})

test('avatar-create-photo: un avatar que HeyGen devuelve distinto no se confunde con el anterior', async (t) => {
  const { root, photo } = await session(t)
  fakeHeyGen(t, {
    creation: ({ name }) => ({
      avatar_item: {
        ...RAW_LOOK,
        id: `look-${name}`,
        name,
        group_id: `group-${name}`,
      },
      avatar_group: { id: `group-${name}`, name },
    }),
  })
  const ana = await avatarCreatePhoto(
    context(root, { name: 'Ana', photoPath: photo }),
  )
  const bob = await avatarCreatePhoto(
    context(root, { name: 'Bob', photoPath: photo }),
  )
  assert.notEqual(bob.entry.id, ana.entry.id)
  assert.equal(bob.entry.lookId, 'look-Bob')
  assert.deepEqual(
    (await avatarsSubcommands['avatars-list'](context(root))).entries
      .map((entry) => entry.lookId)
      .sort(),
    ['look-Ana', 'look-Bob'],
  )
})

test('avatar-refresh: actualiza el estado y los motores desde HeyGen, y no consulta uno listo', async (t) => {
  const { root, photo } = await session(t)
  const calls = fakeHeyGen(t, { lookStatus: 'completed' })
  const { entry } = await avatarCreatePhoto(
    context(root, { name: 'Ana', photoPath: photo }),
  )
  const refreshed = await avatarsSubcommands['avatar-refresh'](
    context(root, { id: entry.id }),
  )
  assert.equal(refreshed.entry.status, 'ready')
  assert.deepEqual(refreshed.entry.supportedEngines, ['avatar_iv'])
  assert.equal(calls.at(-1).path, '/v3/avatars/looks/look-1')

  const before = calls.length
  const again = await avatarsSubcommands['avatar-refresh'](
    context(root, { id: entry.id }),
  )
  assert.equal(again.entry.status, 'ready')
  assert.equal(calls.length, before)

  assert.equal(
    (
      await failure(
        avatarsSubcommands['avatar-refresh'](context(root, { id: '../x' })),
      )
    ).code,
    'invalid_payload',
  )
  assert.equal(
    (
      await failure(
        avatarsSubcommands['avatar-refresh'](
          context(root, { id: 'nadie-000000' }),
        ),
      )
    ).code,
    'avatar_not_found',
  )
})

test('avatar-refresh: un entrenamiento fallido queda marcado', async (t) => {
  const { root, photo } = await session(t)
  fakeHeyGen(t, { lookStatus: 'failed' })
  const { entry } = await avatarCreatePhoto(
    context(root, { name: 'Ana', photoPath: photo }),
  )
  const refreshed = await avatarsSubcommands['avatar-refresh'](
    context(root, { id: entry.id }),
  )
  assert.equal(refreshed.entry.status, 'failed')
  assert.equal(refreshed.entry.errorCode, 'avatar_training_failed')
})

test('avatar-refresh: un avatar que HeyGen creó sin look se resuelve por su grupo', async (t) => {
  const { root, photo } = await session(t)
  const calls = fakeHeyGen(t, {
    creation: {
      avatar_item: null,
      avatar_group: { id: 'group-7', name: 'Ana', status: 'processing' },
    },
    groupLooks: {
      'group-7': [
        {
          ...RAW_LOOK,
          id: 'look-7',
          group_id: 'group-7',
          status: 'completed',
          supported_api_engines: ['avatar_iv'],
        },
      ],
    },
  })
  const { entry } = await avatarCreatePhoto(
    context(root, { name: 'Ana', photoPath: photo }),
  )
  assert.equal(entry.lookId, null)

  const refreshed = await avatarsSubcommands['avatar-refresh'](
    context(root, { id: entry.id }),
  )
  const request = calls.at(-1)
  assert.equal(request.init.method, 'GET')
  assert.equal(request.path, '/v3/avatars/looks')
  const params = new URLSearchParams(request.search)
  assert.equal(params.get('ownership'), 'private')
  assert.equal(params.get('group_id'), 'group-7')
  assert.equal(refreshed.entry.id, entry.id)
  assert.equal(refreshed.entry.lookId, 'look-7')
  assert.equal(refreshed.entry.status, 'ready')
  assert.deepEqual(refreshed.entry.supportedEngines, ['avatar_iv'])
  assert.equal(refreshed.entry.groupId, 'group-7')

  // Quedó guardado: un avatar ya listo no se vuelve a consultar.
  const stored = JSON.parse(
    await readFile(join(root, 'avatars', entry.id, 'metadata.json'), 'utf8'),
  )
  assert.equal(stored.lookId, 'look-7')
  assert.equal(stored.status, 'ready')
  const before = calls.length
  await avatarsSubcommands['avatar-refresh'](context(root, { id: entry.id }))
  assert.equal(calls.length, before)
})

test('avatar-refresh: si el grupo todavía no tiene looks, el avatar queda igual y sin error', async (t) => {
  const { root, photo } = await session(t)
  const calls = fakeHeyGen(t, {
    creation: {
      avatar_item: null,
      avatar_group: { id: 'group-7', name: 'Ana', status: 'processing' },
    },
  })
  const { entry } = await avatarCreatePhoto(
    context(root, { name: 'Ana', photoPath: photo }),
  )
  const metadataPath = join(root, 'avatars', entry.id, 'metadata.json')
  const before = await readFile(metadataPath, 'utf8')

  const refreshed = await avatarsSubcommands['avatar-refresh'](
    context(root, { id: entry.id }),
  )
  const request = calls.at(-1)
  assert.equal(request.path, '/v3/avatars/looks')
  assert.equal(new URLSearchParams(request.search).get('group_id'), 'group-7')
  assert.deepEqual(refreshed.entry, entry)
  assert.equal(refreshed.entry.lookId, null)
  assert.equal(refreshed.entry.status, 'processing')
  assert.equal(refreshed.entry.errorCode, undefined)
  assert.equal(await readFile(metadataPath, 'utf8'), before)
})

test('avatar-stock-looks: pide el stock público por defecto y pasa el cursor', async (t) => {
  const { root } = await session(t)
  const calls = fakeHeyGen(t)
  const page = await avatarsSubcommands['avatar-stock-looks'](
    context(root, { token: 'tok-1', lookType: 'studio_avatar' }),
  )
  assert.equal(page.looks.length, 1)
  assert.equal(page.nextToken, null)
  const params = new URLSearchParams(calls[0].search)
  assert.equal(params.get('ownership'), 'public')
  assert.equal(params.get('avatar_type'), 'studio_avatar')
  assert.equal(params.get('token'), 'tok-1')
  await avatarsSubcommands['avatar-stock-looks'](
    context(root, { ownership: 'private', lookType: 'robot' }),
  )
  const second = new URLSearchParams(calls[1].search)
  assert.equal(second.get('ownership'), 'private')
  assert.equal(second.get('avatar_type'), null)
})

test('avatar-add: guarda el look con su preview y no duplica uno ya agregado', async (t) => {
  const { root } = await session(t)
  fakeHeyGen(t)
  const events = []
  const look = {
    lookId: 'look-1',
    name: 'Ana',
    lookType: 'photo_avatar',
    previewImageUrl: 'https://cdn.example/ana.png',
    supportedEngines: ['avatar_iv', 'avatar_zzz'],
    preferredOrientation: 'portrait',
  }
  const { entry } = await avatarsSubcommands['avatar-add'](
    context(root, { look, ownership: 'stock' }, undefined, events),
  )
  assert.equal(entry.ownership, 'stock')
  assert.equal(entry.status, 'ready')
  assert.deepEqual(entry.supportedEngines, ['avatar_iv'])
  assert.equal(
    entry.previewPath,
    join(root, 'avatars', entry.id, 'preview.png'),
  )

  const again = await avatarsSubcommands['avatar-add'](
    context(root, { look, ownership: 'stock' }, undefined, events),
  )
  assert.equal(again.entry.id, entry.id)
  assert.equal(
    (await avatarsSubcommands['avatars-list'](context(root))).entries.length,
    1,
  )

  assert.equal(
    (
      await failure(
        avatarsSubcommands['avatar-add'](
          context(root, { look: { ...look, lookId: '' } }),
        ),
      )
    ).code,
    'invalid_payload',
  )
  assert.equal(
    (
      await failure(
        avatarsSubcommands['avatar-add'](
          context(root, { look: { ...look, lookType: 'robot' } }),
        ),
      )
    ).code,
    'invalid_payload',
  )
  // Un nombre de solo espacios se valida ya recortado: no deja una entrada sin
  // nombre (que el listado ocultaría). Va con un lookId nuevo para que no lo
  // tape el «ya agregado».
  assert.equal(
    (
      await failure(
        avatarsSubcommands['avatar-add'](
          context(root, { look: { ...look, lookId: 'look-9', name: '   ' } }),
        ),
      )
    ).code,
    'invalid_payload',
  )
  assert.equal(
    (await avatarsSubcommands['avatars-list'](context(root))).entries.length,
    1,
  )

  // La vista previa se bajó bien: ningún aviso por el emitter.
  assert.deepEqual(events, [])
})

test('avatar-add: sin preview descargable el avatar igual se guarda', async (t) => {
  const { root } = await session(t)
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('nope', { status: 500 }),
  )
  const events = []
  const { entry } = await avatarsSubcommands['avatar-add'](
    context(
      root,
      {
        look: {
          lookId: 'look-2',
          name: 'Bob',
          lookType: 'studio_avatar',
          previewImageUrl: 'https://cdn.example/bob.png',
          supportedEngines: [],
        },
        ownership: 'stock',
      },
      undefined,
      events,
    ),
  )
  assert.equal(entry.previewPath, undefined)
  assert.equal(entry.status, 'ready')
  // El fallo de la vista previa avisa una sola vez, como `log` de nivel warn.
  assert.deepEqual(
    events.map(({ type, level }) => ({ type, level })),
    [{ type: 'log', level: 'warn' }],
  )
})

test('avatar-add: conserva el estado de entrenamiento del look y un estado desconocido queda listo', async (t) => {
  const { root } = await session(t)
  const look = {
    lookId: 'look-7',
    name: 'Ana',
    lookType: 'photo_avatar',
    supportedEngines: ['avatar_iv'],
  }
  // Un look propio que HeyGen todavía entrena no puede quedar «ready»: la
  // lista lo seguiría refrescando solo si nace «processing».
  const added = []
  for (const [lookId, status] of [
    ['look-7', 'processing'],
    ['look-8', 'failed'],
    ['look-9', 'weird'],
    ['look-10', undefined],
  ]) {
    const { entry } = await avatarsSubcommands['avatar-add'](
      context(root, { look: { ...look, lookId, status }, ownership: 'own' }),
    )
    added.push(entry)
  }
  assert.deepEqual(
    added.map((entry) => entry.status),
    ['processing', 'failed', 'ready', 'ready'],
  )
  // Y lo que queda en disco es lo mismo, no un valor ajeno que el listado
  // corrige al leerlo: `avatar-refresh` y el sondeo leen esa metadata.
  const stored = []
  for (const entry of added) {
    const metadata = await readFile(
      join(root, 'avatars', entry.id, 'metadata.json'),
      'utf8',
    )
    stored.push(JSON.parse(metadata).status)
  }
  assert.deepEqual(stored, ['processing', 'failed', 'ready', 'ready'])
})

test('avatar-add: cancelar durante la descarga de la vista previa no deja una carpeta a medias', async (t) => {
  const { root } = await session(t)
  const controller = new AbortController()
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    controller.abort()
    init.signal.throwIfAborted()
  })
  const events = []
  const error = await failure(
    avatarsSubcommands['avatar-add']({
      ...context(
        root,
        {
          look: {
            lookId: 'look-2',
            name: 'Bob',
            lookType: 'studio_avatar',
            previewImageUrl: 'https://cdn.example/bob.png',
            supportedEngines: [],
          },
          ownership: 'stock',
        },
        undefined,
        events,
      ),
      signal: controller.signal,
    }),
  )
  // La cancelación sale tal cual (no como un aviso de «vista previa fallida») y
  // la carpeta del avatar todavía no existía: no hay nada que limpiar.
  assert.equal(error.name, 'AbortError')
  assert.deepEqual(events, [])
  assert.equal(await exists(join(root, 'avatars')), false)
})

test('avatar-delete: borra la carpeta y rechaza ids inválidos', async (t) => {
  const { root, photo } = await session(t)
  fakeHeyGen(t)
  const { entry } = await avatarCreatePhoto(
    context(root, { name: 'Ana', photoPath: photo }),
  )
  assert.equal(
    await avatarsSubcommands['avatar-delete'](context(root, { id: entry.id })),
    null,
  )
  assert.equal(await exists(join(root, 'avatars', entry.id)), false)
  assert.deepEqual(await avatarsSubcommands['avatars-list'](context(root)), {
    entries: [],
  })
  assert.equal(
    (
      await failure(
        avatarsSubcommands['avatar-delete'](context(root, { id: '../x' })),
      )
    ).code,
    'invalid_payload',
  )
  assert.equal(
    (await failure(avatarsSubcommands['avatar-delete'](context(root, {}))))
      .code,
    'invalid_payload',
  )
})
