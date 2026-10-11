// Los once subcomandos de la biblioteca de avatares (ADR-0057, entregas 1, 1b y
// 2b) contra una carpeta raíz temporal y un HeyGen simulado con `fetch` falso.
// Desde la entrega 1b un avatar de la biblioteca es un grupo de HeyGen con sus
// looks: el alta por grupo con el look principal elegido o por defecto (el
// primero listo con Avatar III), sin duplicados, con las vistas previas de la
// tarjeta; la creación desde foto (validar la foto antes de hablar con HeyGen,
// clave de idempotencia determinista); el refresco que sigue el
// entrenamiento, suma looks y recalcula el principal sin pisar lo que otro
// proceso guardó; el look principal elegido a mano; el look nuevo desde un
// prompt (todo lo que no cuesta se valida antes de pagar, con clave de
// idempotencia determinista, y con la orientación del formato pedido si HeyGen
// no informa la suya, que el refresco conserva); el saldo, que nunca falla; la
// metadata de la entrega 1 descartada con un aviso; el listado de avatares
// (grupos) y de los looks de un grupo, el género normalizado y el borrado; y la
// clasificación del stock público por tipo de look (`avatar-stock-types`).
// Importa los handlers reales del sidecar.
import assert from 'node:assert/strict'
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { test } from 'node:test'

import {
  avatarCreatePhoto,
  photoIdempotencyKey,
} from '../../pipeline/commands/avatars/avatar-create-photo.ts'
import { lookIdempotencyKey } from '../../pipeline/commands/avatars/avatar-generate-look.ts'
import { avatarsSubcommands } from '../../pipeline/commands/avatars/subcommands.ts'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import {
  STOCK_TYPES_CACHE_FILE,
  STOCK_TYPES_CACHE_TTL_MS,
  STOCK_TYPES_MAX_PAGES,
} from '../../pipeline/types/avatar.ts'

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

// Lo que sirve el CDN falso para cada ruta: un PNG válido con la ruta al final,
// así cada vista previa se distingue de las demás.
const cdnImage = (pathname) => Buffer.concat([PNG_HEAD, Buffer.from(pathname)])

// El look que devuelve HeyGen al crear un avatar desde foto.
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

// Un avatar de `GET /v3/avatars` (un grupo de looks).
const RAW_GROUP = {
  id: 'group-1',
  name: 'Dante',
  preview_image_url: 'https://cdn.example/dante.png',
  preview_video_url: 'https://cdn.example/dante.mp4',
  gender: 'male',
  created_at: 1711929600,
  looks_count: 27,
}

// `GET /v3/avatars/{id}` de un avatar público: sin género ni estado (sonda del
// 2026-10-09 con Dante).
const DANTE_GROUP = {
  id: 'group-dante',
  name: 'Dante',
  preview_image_url: 'https://cdn.example/dante.png',
  preview_video_url: 'https://cdn.example/dante.mp4',
  created_at: 1711929600,
  looks_count: 4,
  status: 'completed',
}

// El grupo de un avatar creado desde foto (propio: con género y estado).
const PHOTO_GROUP = {
  id: 'group-1',
  name: 'Ana',
  gender: 'Woman',
  created_at: 1711929600,
  looks_count: 1,
  status: 'processing',
}

// `GET /v3/users/me` de una billetera prepaga en dólares (sonda del 2026-10-09).
const RAW_ME = {
  username: 'user_abc123',
  billing_type: 'wallet',
  wallet: { currency: 'usd', remaining_balance: 3.68 },
}

// Un look público del stock (sin estado: está listo).
const stockLook = (id, overrides = {}) => ({
  id,
  name: `Look ${id}`,
  avatar_type: 'studio_avatar',
  group_id: 'group-dante',
  preview_image_url: `https://cdn.example/${id}.png`,
  supported_api_engines: ['avatar_iii', 'avatar_iv'],
  preferred_orientation: 'portrait',
  ...overrides,
})

// Dante: el primer look no tiene Avatar III, así que no puede ser principal.
const DANTE_LOOKS = [
  stockLook('dante-1', { supported_api_engines: ['avatar_iv'] }),
  stockLook('dante-2'),
  stockLook('dante-3'),
  stockLook('dante-4'),
]

// Un look como lo guarda la biblioteca.
const STORED_LOOK = {
  lookId: 'dante-2',
  name: 'Look dante-2',
  lookType: 'studio_avatar',
  supportedEngines: ['avatar_iii', 'avatar_iv'],
  preferredOrientation: 'portrait',
  status: 'ready',
  origin: 'heygen',
  createdAt: '2026-10-09T01:00:00.000Z',
}

const storedLook = (lookId, overrides = {}) => ({
  ...STORED_LOOK,
  lookId,
  name: `Look ${lookId}`,
  ...overrides,
})

// La metadata de un avatar de la biblioteca (modelo de la entrega 1b).
const storedAvatar = (overrides = {}) => ({
  name: 'Dante',
  groupId: 'group-dante',
  ownership: 'stock',
  status: 'ready',
  mainLookId: 'dante-2',
  looks: [STORED_LOOK],
  createdAt: '2026-10-09T01:00:00.000Z',
  ...overrides,
})

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

// Escribe a mano la carpeta de un avatar con esa metadata.
async function writeStored(root, id, metadata) {
  const directory = join(root, 'avatars', id)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'metadata.json'), JSON.stringify(metadata))
  return directory
}

async function readStored(root, id) {
  return JSON.parse(
    await readFile(join(root, 'avatars', id, 'metadata.json'), 'utf8'),
  )
}

const refresh = (root, id) =>
  avatarsSubcommands['avatar-refresh'](context(root, { id }))

// Nombre de archivo de la vista previa de cada look, o undefined.
const previewNames = (entry) =>
  entry.looks.map((look) =>
    look.previewPath ? basename(look.previewPath) : undefined,
  )

// HeyGen simulado: responde según la ruta y anota cada llamada (`calls`, con
// `host`, `method`, `path` y `search`). `creation` fija la respuesta de
// `POST /v3/avatars` (un objeto, o una función que la arma desde el cuerpo del
// pedido); `groups`/`groupsNextToken`, lo que lista `GET /v3/avatars` (la
// misma ruta con otro método); `groupDetails`, cada `GET /v3/avatars/{id}`
// (un id que no está responde 404, como HeyGen); `groupLooks`, los looks de
// cada grupo en `GET /v3/avatars/looks?group_id=…`, en páginas de
// `lookPageSize` con el cursor `page-<n>`; `lookDetails`, cada
// `GET /v3/avatars/looks/{id}` (404 si no está; `lookFailures` fuerza otro
// status para un id). `groupFailures` fuerza un status para
// `GET /v3/avatars/{id}` de ese grupo y `groupLooksStatus`, uno para el
// listado de los looks de un grupo (`?group_id=…`). `typeLooks` son las
// barridas de `avatar-stock-types` (`GET /v3/avatars/looks?avatar_type=…` sin
// `group_id`): por tipo, la lista de páginas de looks crudos, con el cursor
// `page-<n>` (sin él, esa consulta devuelve el único look de siempre);
// `typeLooksStatus` fuerza el fallo de esas barridas, con un status o con una
// función `(avatar_type, página) => status | undefined`. El CDN (`cdn.example`)
// sirve `cdnImage(ruta)`, salvo las rutas que `cdnFails` rechaza; `me` es la
// respuesta de `GET /v3/users/me` (`{ status, body }`). La subida de una
// referencia (`reference-<n>.<ext>`) devuelve `asset-reference-<n>`, y la de
// cualquier otro archivo `asset-9`. `onRequest` corre
// antes de responder (para cancelar, o para escribir en disco a mitad de un
// job). El fetch simulado es global: un mock vivo por test (ver el registro de
// errores conocidos: `node-test-doble-mock-del-mismo-metodo-deja-el-global-sucio`).
function fakeHeyGen(
  t,
  {
    creation,
    groups = [RAW_GROUP],
    groupsNextToken = null,
    groupDetails = { 'group-dante': DANTE_GROUP, 'group-1': PHOTO_GROUP },
    groupLooks = {},
    lookPageSize = 50,
    lookDetails = {},
    lookFailures = {},
    groupFailures = {},
    groupLooksStatus,
    typeLooks,
    typeLooksStatus,
    cdnFails = () => false,
    me = { status: 200, body: { data: RAW_ME } },
    onRequest,
  } = {},
) {
  const calls = []
  globalThis.fetch.mock?.restore()
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    const target = new URL(String(url))
    const method = init.method ?? 'GET'
    calls.push({
      host: target.hostname,
      method,
      path: target.pathname,
      search: target.search,
      init,
    })
    await onRequest?.(target, init)
    if (target.hostname === 'cdn.example') {
      if (cdnFails(target.pathname))
        return new Response('nope', { status: 500 })
      return new Response(cdnImage(target.pathname), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      })
    }
    if (target.pathname === '/v3/assets') {
      const reference = /^(reference-\d+)\./.exec(init.body.get('file').name)
      return json({
        data: {
          asset_id: reference ? `asset-${reference[1]}` : 'asset-9',
          url: 'https://x',
          mime_type: 'image/png',
          size_bytes: 70,
        },
      })
    }
    if (target.pathname === '/v3/users/me') return json(me.body, me.status)
    if (target.pathname === '/v3/avatars' && method === 'GET')
      return json({
        data: groups,
        has_more: groupsNextToken !== null,
        next_token: groupsNextToken,
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
    if (target.pathname === '/v3/avatars/looks') {
      const groupId = target.searchParams.get('group_id')
      const lookType = target.searchParams.get('avatar_type')
      if (!groupId && typeLooks && lookType) {
        const sweepToken = /^page-(\d+)$/.exec(
          target.searchParams.get('token') ?? '',
        )
        const sweepPage = sweepToken ? Number(sweepToken[1]) : 0
        const sweepStatus =
          typeof typeLooksStatus === 'function'
            ? typeLooksStatus(lookType, sweepPage)
            : typeLooksStatus
        if (sweepStatus)
          return json(
            { error: { code: 'unavailable', message: 'down' } },
            sweepStatus,
          )
        const pages = typeLooks[lookType] ?? []
        const more = sweepPage + 1 < pages.length
        return json({
          data: pages[sweepPage] ?? [],
          has_more: more,
          next_token: more ? `page-${sweepPage + 1}` : null,
        })
      }
      if (!groupId)
        return json({ data: [RAW_LOOK], has_more: false, next_token: null })
      if (groupLooksStatus)
        return json(
          { error: { code: 'unavailable', message: 'down' } },
          groupLooksStatus,
        )
      const looks = groupLooks[groupId] ?? []
      const token = /^page-(\d+)$/.exec(target.searchParams.get('token') ?? '')
      const page = token ? Number(token[1]) : 0
      const more = (page + 1) * lookPageSize < looks.length
      return json({
        data: looks.slice(page * lookPageSize, (page + 1) * lookPageSize),
        has_more: more,
        next_token: more ? `page-${page + 1}` : null,
      })
    }
    const lookPath = /^\/v3\/avatars\/looks\/([^/]+)$/.exec(target.pathname)
    if (lookPath) {
      const failure = lookFailures[decodeURIComponent(lookPath[1])]
      if (failure)
        return json(
          { error: { code: 'unavailable', message: 'down' } },
          failure,
        )
      const detail = lookDetails[decodeURIComponent(lookPath[1])]
      return detail
        ? json({ data: detail })
        : json(
            { error: { code: 'not_found', message: 'Look not found.' } },
            404,
          )
    }
    const groupPath = /^\/v3\/avatars\/([^/]+)$/.exec(target.pathname)
    if (groupPath) {
      const groupId = decodeURIComponent(groupPath[1])
      const failure = groupFailures[groupId]
      if (failure)
        return json(
          { error: { code: 'unavailable', message: 'down' } },
          failure,
        )
      const detail = groupDetails[groupId]
      return detail
        ? json({ data: detail })
        : json(
            {
              error: {
                code: 'avatar_not_found',
                message: 'Avatar group not found.',
                param: null,
              },
            },
            404,
          )
    }
    return new Response('not found', { status: 404 })
  })
  return calls
}

const heygenCalls = (calls) =>
  calls
    .filter((call) => call.host === 'api.heygen.com')
    .map((call) => `${call.method} ${call.path}`)

const cdnCalls = (calls) =>
  calls
    .filter((call) => call.host === 'cdn.example')
    .map((call) => call.path)
    .sort()

test('el mapa expone exactamente los once subcomandos', () => {
  assert.deepEqual(Object.keys(avatarsSubcommands).sort(), [
    'avatar-add',
    'avatar-balance',
    'avatar-create-photo',
    'avatar-delete',
    'avatar-generate-look',
    'avatar-refresh',
    'avatar-set-main-look',
    'avatar-stock-groups',
    'avatar-stock-looks',
    'avatar-stock-types',
    'avatars-list',
  ])
})

test('avatars-list: sin biblioteca devuelve una lista vacía', async (t) => {
  const { root } = await session(t)
  assert.deepEqual(await avatarsSubcommands['avatars-list'](context(root)), {
    entries: [],
  })
})

test('avatars-list: valida la metadata campo por campo y descarta los looks mal formados', async (t) => {
  const { root } = await session(t)
  // Metadata editada a mano o escrita por otra versión de la app: lo que sale
  // hacia la interfaz se valida al listar, no se confía en el tipo.
  await writeStored(
    root,
    'weird-aaaaaa',
    storedAvatar({
      ownership: 'alien',
      status: 'paused',
      gender: 'Man',
      errorCode: 5,
      syncedAt: '2026-10-09T02:00:00.000Z',
      looks: [
        {
          ...STORED_LOOK,
          supportedEngines: ['avatar_iii', 'avatar_zzz', 5],
          status: 'weird',
          origin: 'robot',
          preferredOrientation: 'diagonal',
          createdAt: 7,
        },
        // Mismo lookId que el anterior: la tarjeta lo usaría de key dos veces.
        { ...STORED_LOOK, name: 'Duplicado' },
        storedLook('dante-3', { lookType: 'robot' }),
        storedLook('', { name: 'Sin id' }),
        storedLook('dante-4', { name: '' }),
        'texto',
        null,
        storedLook('dante-5', {
          supportedEngines: 'x',
          status: 'processing',
          origin: 'vimo',
          createdAt: '2026-10-09T03:00:00.000Z',
        }),
      ],
    }),
  )
  // El principal apunta a un look descartado: queda sin principal.
  await writeStored(
    root,
    'orphan-bbbbbb',
    storedAvatar({
      name: 'Orphan',
      groupId: 'group-orphan',
      mainLookId: 'dante-3',
      looks: [storedLook('dante-3', { lookType: 'robot' })],
      createdAt: '2026-10-08T01:00:00.000Z',
    }),
  )
  // Los valores válidos pasan tal cual: no todo se vuelve «stock» y «ready».
  await writeStored(
    root,
    'own-cccccc',
    storedAvatar({
      name: 'Own',
      groupId: 'group-own',
      ownership: 'own',
      status: 'failed',
      gender: 'female',
      errorCode: 'avatar_training_failed',
      mainLookId: null,
      looks: [],
      createdAt: '2026-10-07T01:00:00.000Z',
    }),
  )

  const { entries } = await avatarsSubcommands['avatars-list'](context(root))
  assert.deepEqual(
    entries.map((entry) => entry.id),
    ['weird-aaaaaa', 'orphan-bbbbbb', 'own-cccccc'],
  )
  const [weird, orphan, own] = entries
  assert.deepEqual(weird, {
    id: 'weird-aaaaaa',
    name: 'Dante',
    groupId: 'group-dante',
    ownership: 'stock',
    status: 'ready',
    mainLookId: 'dante-2',
    looks: [
      {
        lookId: 'dante-2',
        name: 'Look dante-2',
        lookType: 'studio_avatar',
        supportedEngines: ['avatar_iii'],
        status: 'ready',
        origin: 'heygen',
        // Un `createdAt` que no es texto toma el del avatar.
        createdAt: '2026-10-09T01:00:00.000Z',
      },
      {
        lookId: 'dante-5',
        name: 'Look dante-5',
        lookType: 'studio_avatar',
        supportedEngines: [],
        preferredOrientation: 'portrait',
        status: 'processing',
        origin: 'vimo',
        createdAt: '2026-10-09T03:00:00.000Z',
      },
    ],
    createdAt: '2026-10-09T01:00:00.000Z',
    syncedAt: '2026-10-09T02:00:00.000Z',
  })
  assert.equal(orphan.mainLookId, null)
  assert.deepEqual(orphan.looks, [])
  assert.equal(own.ownership, 'own')
  assert.equal(own.status, 'failed')
  assert.equal(own.gender, 'female')
  assert.equal(own.errorCode, 'avatar_training_failed')
})

test('avatars-list: la vista previa de cada look sale de looks/ y la del avatar es la de su principal o, sin ella, la propia', async (t) => {
  const { root } = await session(t)
  const directory = await writeStored(
    root,
    'dante-aaaaaa',
    storedAvatar({
      mainLookId: 'dante-3',
      looks: [STORED_LOOK, storedLook('dante-3'), storedLook('dante-4')],
      previewFile: 'preview.png',
    }),
  )
  await mkdir(join(directory, 'looks'))
  await writeFile(join(directory, 'looks', 'dante-2.png'), PNG_HEAD)
  await writeFile(join(directory, 'looks', 'dante-3.jpg'), PNG_HEAD)
  // Ni una extensión que no es de imagen ni el temporal de una escritura
  // atómica cuentan como vista previa.
  await writeFile(join(directory, 'looks', 'dante-4.txt'), 'x')
  await writeFile(join(directory, 'looks', 'dante-4.png.tmp'), 'x')
  await writeFile(join(directory, 'preview.png'), PNG_HEAD)

  // Sin vista previa del principal (una foto que HeyGen entrena): la propia.
  const photo = await writeStored(
    root,
    'ana-bbbbbb',
    storedAvatar({
      name: 'Ana',
      groupId: 'group-1',
      ownership: 'own',
      status: 'processing',
      mainLookId: null,
      looks: [],
      previewFile: 'preview.jpg',
      createdAt: '2026-10-08T01:00:00.000Z',
    }),
  )
  await writeFile(join(photo, 'preview.jpg'), PNG_HEAD)
  // Un `previewFile` que no es un preview.<ext> de la carpeta (o que no es
  // texto, o que no existe) cuenta como ausente y no tumba el listado.
  const outside = join(root, 'escape.png')
  await writeFile(outside, PNG_HEAD)
  for (const [id, previewFile] of [
    ['escape-cccccc', '../../escape.png'],
    ['number-dddddd', 5],
    ['missing-eeeeee', 'preview.png'],
  ])
    await writeStored(
      root,
      id,
      storedAvatar({
        name: id,
        groupId: id,
        previewFile,
        createdAt: '2026-10-07T01:00:00.000Z',
      }),
    )

  const { entries } = await avatarsSubcommands['avatars-list'](context(root))
  const byId = Object.fromEntries(entries.map((entry) => [entry.id, entry]))
  const dante = byId['dante-aaaaaa']
  assert.deepEqual(previewNames(dante), [
    'dante-2.png',
    'dante-3.jpg',
    undefined,
  ])
  assert.equal(
    dante.looks[0].previewPath,
    join(directory, 'looks', 'dante-2.png'),
  )
  assert.equal(dante.previewPath, join(directory, 'looks', 'dante-3.jpg'))
  assert.equal(byId['ana-bbbbbb'].previewPath, join(photo, 'preview.jpg'))
  for (const id of ['escape-cccccc', 'number-dddddd', 'missing-eeeeee'])
    assert.equal(byId[id].previewPath, undefined, id)
})

test('avatars-list: la metadata de la entrega 1 (un look por entrada) se descarta con un aviso y queda en disco', async (t) => {
  const { root } = await session(t)
  const legacy = {
    name: 'Ana',
    lookId: 'look-1',
    lookType: 'photo_avatar',
    ownership: 'own',
    groupId: 'group-1',
    supportedEngines: ['avatar_iv'],
    status: 'ready',
    createdAt: '2026-10-09T01:00:00.000Z',
  }
  await writeStored(root, 'legacy-aaaaaa', legacy)
  await writeStored(root, 'pending-bbbbbb', {
    ...legacy,
    name: 'Bob',
    lookId: null,
    status: 'processing',
  })
  // Sin grupo o sin lista de looks no es un avatar de esta versión, pero
  // tampoco de la entrega 1: se saltea en silencio, como una corrupta.
  await writeStored(
    root,
    'nogroup-cccccc',
    storedAvatar({ groupId: undefined }),
  )
  await writeStored(root, 'nolooks-dddddd', storedAvatar({ looks: 'dante-2' }))
  const corrupt = join(root, 'avatars', 'corrupt-eeeeee')
  await mkdir(corrupt, { recursive: true })
  await writeFile(join(corrupt, 'metadata.json'), '{not json')
  await writeStored(root, 'valid-ffffff', storedAvatar())

  const events = []
  const { entries } = await avatarsSubcommands['avatars-list'](
    context(root, undefined, undefined, events),
  )
  assert.deepEqual(
    entries.map((entry) => entry.id),
    ['valid-ffffff'],
  )
  // Cada carpeta que no se lista deja su aviso: las dos de la entrega 1 lo
  // dicen y las tres ilegibles (sin grupo, sin looks, corrupta) también.
  assert.ok(
    events.every(({ type, level }) => type === 'log' && level === 'warn'),
  )
  const warned = Object.fromEntries(
    events.map((event) => [event.message.split(':')[0], event.message]),
  )
  assert.deepEqual(Object.keys(warned).sort(), [
    'avatar corrupt-eeeeee',
    'avatar legacy-aaaaaa',
    'avatar nogroup-cccccc',
    'avatar nolooks-dddddd',
    'avatar pending-bbbbbb',
  ])
  for (const id of ['legacy-aaaaaa', 'pending-bbbbbb'])
    assert.match(warned[`avatar ${id}`], /delivery 1/)
  for (const id of ['nogroup-cccccc', 'nolooks-dddddd', 'corrupt-eeeeee'])
    assert.match(warned[`avatar ${id}`], /missing or unreadable/)
  // No se borra nada: la carpeta vieja sigue ahí (con la foto, si la había).
  assert.equal(
    await exists(join(root, 'avatars', 'legacy-aaaaaa', 'metadata.json')),
    true,
  )
})

test('avatars-list: un género guardado que no es male ni female se descarta', async (t) => {
  const { root } = await session(t)
  const folders = {
    'male-aaaaaa': { name: 'Male', gender: 'male' },
    'female-bbbbbb': { name: 'Female', gender: 'female' },
    // Lo guardado por esta versión ya sale normalizado de HeyGen: lo que no es
    // uno de los dos valores (metadata editada a mano) se descarta.
    'capital-cccccc': { name: 'Capital', gender: 'Man' },
    'alien-dddddd': { name: 'Alien', gender: 'alien' },
    'number-eeeeee': { name: 'Number', gender: 5 },
    'none-ffffff': { name: 'None' },
  }
  for (const [id, overrides] of Object.entries(folders))
    await writeStored(root, id, storedAvatar({ ...overrides, groupId: id }))

  const { entries } = await avatarsSubcommands['avatars-list'](context(root))
  const byName = Object.fromEntries(entries.map((entry) => [entry.name, entry]))
  assert.equal(entries.length, 6)
  assert.equal(byName.Male.gender, 'male')
  assert.equal(byName.Female.gender, 'female')
  for (const name of ['Capital', 'Alien', 'Number', 'None']) {
    assert.equal(byName[name].gender, undefined, name)
  }
})

test('avatar-add: guarda el avatar con todos sus looks y el principal elegido, y baja las vistas previas de la tarjeta', async (t) => {
  const { root } = await session(t)
  const calls = fakeHeyGen(t, { groupLooks: { 'group-dante': DANTE_LOOKS } })
  const events = []
  const { entry } = await avatarsSubcommands['avatar-add'](
    context(
      root,
      {
        groupId: 'group-dante',
        ownership: 'stock',
        mainLookId: 'dante-3',
        gender: 'male',
        // Solo para el log de soporte: el nombre guardado es el de HeyGen.
        name: 'Nombre del listado',
      },
      undefined,
      events,
    ),
  )
  const directory = join(root, 'avatars', entry.id)
  assert.match(entry.id, /^dante-[a-z0-9]{6}$/)
  assert.equal(entry.name, 'Dante')
  assert.equal(entry.groupId, 'group-dante')
  assert.equal(entry.ownership, 'stock')
  assert.equal(entry.status, 'ready')
  assert.equal(entry.mainLookId, 'dante-3')
  // `GET /v3/avatars/{id}` de un avatar público no trae el género: queda el
  // del listado, que viene en el payload.
  assert.equal(entry.gender, 'male')
  assert.equal(entry.syncedAt, entry.createdAt)
  assert.deepEqual(entry.looks[1], {
    lookId: 'dante-2',
    name: 'Look dante-2',
    lookType: 'studio_avatar',
    supportedEngines: ['avatar_iii', 'avatar_iv'],
    preferredOrientation: 'portrait',
    status: 'ready',
    origin: 'heygen',
    previewPath: join(directory, 'looks', 'dante-2.png'),
    createdAt: entry.createdAt,
  })
  assert.deepEqual(
    entry.looks.map((look) => [look.lookId, look.origin, look.status]),
    [
      ['dante-1', 'heygen', 'ready'],
      ['dante-2', 'heygen', 'ready'],
      ['dante-3', 'heygen', 'ready'],
      ['dante-4', 'heygen', 'ready'],
    ],
  )
  // El principal y los dos primeros que se muestran a su lado: tres
  // descargas, y la vista previa del avatar es la de su principal.
  assert.deepEqual(previewNames(entry), [
    'dante-1.png',
    'dante-2.png',
    'dante-3.png',
    undefined,
  ])
  assert.equal(entry.previewPath, join(directory, 'looks', 'dante-3.png'))
  assert.deepEqual(
    await readFile(join(directory, 'preview.png')),
    cdnImage('/dante-3.png'),
  )
  assert.deepEqual(heygenCalls(calls), [
    'GET /v3/avatars/group-dante',
    'GET /v3/avatars/looks',
  ])
  const query = new URLSearchParams(calls[1].search)
  assert.equal(query.get('group_id'), 'group-dante')
  assert.equal(query.get('ownership'), 'public')
  assert.equal(query.get('limit'), '50')
  assert.deepEqual(cdnCalls(calls), [
    '/dante-1.png',
    '/dante-2.png',
    '/dante-3.png',
  ])
  assert.deepEqual(events, [])

  // En disco: sin rutas ni vistas previas por look, solo el modelo.
  const stored = await readStored(root, entry.id)
  assert.equal(stored.previewFile, 'preview.png')
  assert.equal(stored.mainLookId, 'dante-3')
  assert.equal(stored.looks.length, 4)
  assert.equal('previewPath' in stored.looks[0], false)
  assert.equal('previewPath' in stored, false)
})

test('avatar-add: sin look elegido, o con uno que no sirve, el principal es el primero listo con Avatar III', async (t) => {
  const ownLooks = [
    stockLook('own-1', { group_id: 'group-own', status: 'processing' }),
    stockLook('own-2', {
      group_id: 'group-own',
      status: 'completed',
      supported_api_engines: ['avatar_iv'],
    }),
    stockLook('own-3', { group_id: 'group-own', status: 'completed' }),
  ]
  const calls = fakeHeyGen(t, {
    groupDetails: {
      'group-dante': DANTE_GROUP,
      'group-own': {
        id: 'group-own',
        name: 'SEBAS AVATAR',
        gender: 'Man',
        looks_count: 3,
        status: 'completed',
      },
    },
    groupLooks: { 'group-dante': DANTE_LOOKS, 'group-own': ownLooks },
  })
  // dante-1 no tiene Avatar III y `nope` no existe: el principal es dante-2.
  for (const mainLookId of [undefined, 'dante-1', 'nope']) {
    const { root } = await session(t)
    const { entry } = await avatarsSubcommands['avatar-add'](
      context(root, { groupId: 'group-dante', ownership: 'stock', mainLookId }),
    )
    assert.equal(entry.mainLookId, 'dante-2', String(mainLookId))
  }

  // Un avatar propio: se piden sus looks privados; uno que entrena o sin
  // Avatar III no puede ser el principal, y el género sale del grupo.
  const { root } = await session(t)
  const { entry } = await avatarsSubcommands['avatar-add'](
    context(root, { groupId: 'group-own', ownership: 'own', gender: 'female' }),
  )
  assert.equal(entry.ownership, 'own')
  assert.equal(entry.mainLookId, 'own-3')
  assert.equal(entry.gender, 'male')
  assert.deepEqual(
    entry.looks.map((look) => [look.lookId, look.status]),
    [
      ['own-1', 'processing'],
      ['own-2', 'ready'],
      ['own-3', 'ready'],
    ],
  )
  const ownQuery = calls.findLast((call) => call.path === '/v3/avatars/looks')
  assert.equal(new URLSearchParams(ownQuery.search).get('ownership'), 'private')
})

test('avatar-add: un avatar sin ningún look listo con Avatar III no se agrega', async (t) => {
  const { root } = await session(t)
  const calls = fakeHeyGen(t, {
    groupLooks: {
      'group-dante': [
        stockLook('dante-1', { supported_api_engines: ['avatar_iv'] }),
        stockLook('dante-2', { status: 'processing' }),
      ],
    },
  })
  const error = await failure(
    avatarsSubcommands['avatar-add'](
      context(root, {
        groupId: 'group-dante',
        ownership: 'stock',
        mainLookId: 'dante-1',
      }),
    ),
  )
  assert.equal(error.code, 'avatar_no_compatible_look')
  assert.deepEqual(cdnCalls(calls), [])
  assert.equal(await exists(join(root, 'avatars')), false)
})

test('avatar-add: un avatar ya agregado devuelve la entrada existente sin hablar con HeyGen', async (t) => {
  const { root } = await session(t)
  const calls = fakeHeyGen(t, { groupLooks: { 'group-dante': DANTE_LOOKS } })
  const handler = avatarsSubcommands['avatar-add']
  const { entry } = await handler(
    context(root, { groupId: 'group-dante', ownership: 'stock' }),
  )
  const before = calls.length
  const again = await handler(
    context(root, {
      groupId: 'group-dante',
      ownership: 'stock',
      mainLookId: 'dante-4',
    }),
  )
  assert.equal(again.entry.id, entry.id)
  assert.equal(again.entry.mainLookId, 'dante-2')
  assert.equal(calls.length, before)
  assert.equal(
    (await avatarsSubcommands['avatars-list'](context(root))).entries.length,
    1,
  )
})

test('avatar-add: valida el payload, la clave y la carpeta raíz antes de hablar con HeyGen', async (t) => {
  const { root } = await session(t)
  const calls = fakeHeyGen(t, { groupLooks: { 'group-dante': DANTE_LOOKS } })
  const handler = avatarsSubcommands['avatar-add']
  for (const payload of [undefined, {}, { groupId: '' }, { groupId: 5 }]) {
    assert.equal(
      (await failure(handler(context(root, payload)))).code,
      'invalid_payload',
      JSON.stringify(payload),
    )
  }
  assert.equal(
    (await failure(handler(context(root, { groupId: 'group-dante' }, {}))))
      .code,
    'missing_api_key',
  )
  assert.equal(
    (await failure(handler(context(undefined, { groupId: 'group-dante' }))))
      .code,
    'missing_projects_root',
  )
  assert.equal(calls.length, 0)
  assert.equal(await exists(join(root, 'avatars')), false)
})

test('avatar-add: lee los looks del avatar página por página, hasta cuatro', async (t) => {
  const { root } = await session(t)
  const looks = Array.from({ length: 10 }, (_, index) =>
    stockLook(`big-${index + 1}`, { group_id: 'group-big' }),
  )
  const calls = fakeHeyGen(t, {
    groupDetails: { 'group-big': { ...DANTE_GROUP, id: 'group-big' } },
    groupLooks: { 'group-big': looks },
    lookPageSize: 2,
  })
  const { entry } = await avatarsSubcommands['avatar-add'](
    context(root, { groupId: 'group-big', ownership: 'stock' }),
  )
  // Cinco páginas de dos: se leen las cuatro primeras, con el cursor de cada una.
  assert.equal(entry.looks.length, 8)
  assert.deepEqual(
    calls
      .filter((call) => call.path === '/v3/avatars/looks')
      .map((call) => new URLSearchParams(call.search).get('token')),
    [null, 'page-1', 'page-2', 'page-3'],
  )
})

test('avatar-add: si una vista previa no baja, el avatar igual se guarda con la portada del grupo y avisa', async (t) => {
  const { root } = await session(t)
  // La del principal falla (tres intentos con espera: este test tarda unos
  // segundos); la portada del avatar sí baja.
  const calls = fakeHeyGen(t, {
    groupLooks: { 'group-dante': DANTE_LOOKS },
    cdnFails: (pathname) => pathname === '/dante-2.png',
  })
  const events = []
  const { entry } = await avatarsSubcommands['avatar-add'](
    context(
      root,
      { groupId: 'group-dante', ownership: 'stock' },
      undefined,
      events,
    ),
  )
  const directory = join(root, 'avatars', entry.id)
  assert.equal(entry.status, 'ready')
  assert.equal(entry.mainLookId, 'dante-2')
  assert.deepEqual(previewNames(entry), [
    'dante-1.png',
    undefined,
    'dante-3.png',
    undefined,
  ])
  assert.equal(entry.previewPath, join(directory, 'preview.png'))
  assert.deepEqual(await readFile(entry.previewPath), cdnImage('/dante.png'))
  assert.ok(cdnCalls(calls).includes('/dante.png'))
  // El fallo avisa una sola vez, como `log` de nivel warn.
  assert.deepEqual(
    events.map(({ type, level }) => ({ type, level })),
    [{ type: 'log', level: 'warn' }],
  )
})

test('avatar-add: solo se bajan vistas previas https, como las del CDN de HeyGen', async (t) => {
  const { root } = await session(t)
  const calls = fakeHeyGen(t, {
    groupDetails: {
      'group-dante': {
        ...DANTE_GROUP,
        preview_image_url: 'http://cdn.example/dante.png',
      },
    },
    groupLooks: {
      'group-dante': [
        stockLook('dante-2', {
          preview_image_url: 'http://cdn.example/dante-2.png',
        }),
      ],
    },
  })
  const { entry } = await avatarsSubcommands['avatar-add'](
    context(root, { groupId: 'group-dante', ownership: 'stock' }),
  )
  assert.equal(entry.mainLookId, 'dante-2')
  assert.equal(entry.previewPath, undefined)
  assert.deepEqual(cdnCalls(calls), [])
})

test('avatar-add: cancelar durante la descarga de las vistas previas no deja una carpeta a medias', async (t) => {
  const { root } = await session(t)
  const controller = new AbortController()
  fakeHeyGen(t, {
    groupLooks: { 'group-dante': DANTE_LOOKS },
    onRequest: (target, init) => {
      if (target.hostname !== 'cdn.example') return
      controller.abort()
      init.signal.throwIfAborted()
    },
  })
  const events = []
  const error = await failure(
    avatarsSubcommands['avatar-add']({
      ...context(
        root,
        { groupId: 'group-dante', ownership: 'stock' },
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
  assert.equal(entry.groupId, 'group-1')
  assert.equal(entry.ownership, 'own')
  assert.equal(entry.status, 'processing')
  assert.equal(entry.mainLookId, 'look-1')
  assert.deepEqual(entry.looks, [
    {
      lookId: 'look-1',
      name: 'Ana',
      lookType: 'photo_avatar',
      supportedEngines: ['avatar_iv', 'avatar_iii'],
      preferredOrientation: 'portrait',
      status: 'processing',
      origin: 'heygen',
      createdAt: entry.createdAt,
    },
  ])
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

  const stored = await readStored(root, entry.id)
  assert.equal(stored.previewFile, 'preview.png')
  assert.equal(stored.mainLookId, 'look-1')
  assert.deepEqual(
    stored.looks.map((look) => look.lookId),
    ['look-1'],
  )

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

test('avatar-create-photo: si HeyGen devuelve solo el grupo, el avatar nace sin looks y entrenando', async (t) => {
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
  assert.equal(entry.groupId, 'group-7')
  assert.equal(entry.mainLookId, null)
  assert.deepEqual(entry.looks, [])
  assert.equal(entry.status, 'processing')
  assert.equal(entry.errorCode, undefined)
  // Mientras entrena, la cara del avatar es la foto subida.
  assert.equal(
    entry.previewPath,
    join(root, 'avatars', entry.id, 'preview.png'),
  )

  // La entrada repetida se reconoce por su grupo.
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
  assert.equal(bob.entry.mainLookId, 'look-Bob')
  assert.deepEqual(
    (await avatarsSubcommands['avatars-list'](context(root))).entries
      .map((entry) => entry.groupId)
      .sort(),
    ['group-Ana', 'group-Bob'],
  )
})

test('avatar-create-photo: sin el grupo del avatar no hay cómo seguirlo: avatar_provider_error y nada en disco', async (t) => {
  const { root, photo } = await session(t)
  fakeHeyGen(t, {
    creation: {
      avatar_item: { ...RAW_LOOK, group_id: null },
      avatar_group: null,
    },
  })
  const error = await failure(
    avatarCreatePhoto(context(root, { name: 'Ana', photoPath: photo })),
  )
  assert.equal(error.code, 'avatar_provider_error')
  assert.equal(error.provider, 'heygen')
  assert.equal(await exists(join(root, 'avatars')), false)
})

test('avatar-refresh: cuando HeyGen termina de entrenar, el avatar queda listo con la cara de su look', async (t) => {
  const { root, photo } = await session(t)
  const calls = fakeHeyGen(t, {
    groupDetails: { 'group-1': { ...PHOTO_GROUP, status: 'completed' } },
    groupLooks: {
      'group-1': [
        {
          ...RAW_LOOK,
          status: 'completed',
          supported_api_engines: ['avatar_iii'],
        },
      ],
    },
  })
  const { entry } = await avatarCreatePhoto(
    context(root, { name: 'Ana', photoPath: photo }),
  )
  const before = calls.length
  const { entry: refreshed } = await refresh(root, entry.id)
  const directory = join(root, 'avatars', entry.id)
  assert.equal(refreshed.status, 'ready')
  assert.equal(refreshed.errorCode, undefined)
  assert.equal(refreshed.mainLookId, 'look-1')
  assert.deepEqual(refreshed.looks[0].supportedEngines, ['avatar_iii'])
  assert.equal(refreshed.looks[0].status, 'ready')
  assert.equal(refreshed.gender, 'female')
  assert.equal(typeof refreshed.syncedAt, 'string')
  // La vista previa del look ya entrenado reemplaza a la foto como cara.
  assert.equal(refreshed.previewPath, join(directory, 'looks', 'look-1.png'))
  assert.deepEqual(heygenCalls(calls.slice(before)), [
    'GET /v3/avatars/group-1',
    'GET /v3/avatars/looks',
  ])
  const query = new URLSearchParams(calls[before + 1].search)
  assert.equal(query.get('group_id'), 'group-1')
  assert.equal(query.get('ownership'), 'private')
  assert.deepEqual(cdnCalls(calls.slice(before)), ['/ana.png'])

  // Quedó guardado, y un refresco más no vuelve a bajar lo que ya está.
  const stored = await readStored(root, entry.id)
  assert.equal(stored.status, 'ready')
  assert.equal(stored.looks[0].status, 'ready')
  const second = calls.length
  await refresh(root, entry.id)
  assert.deepEqual(cdnCalls(calls.slice(second)), [])

  assert.equal((await failure(refresh(root, '../x'))).code, 'invalid_payload')
  assert.equal(
    (await failure(avatarsSubcommands['avatar-refresh'](context(root, {}))))
      .code,
    'invalid_payload',
  )
  assert.equal(
    (await failure(refresh(root, 'nadie-000000'))).code,
    'avatar_not_found',
  )
})

test('avatar-refresh: un entrenamiento fallido queda marcado', async (t) => {
  const { root, photo } = await session(t)
  fakeHeyGen(t, {
    groupDetails: { 'group-1': { ...PHOTO_GROUP, status: 'failed' } },
    groupLooks: { 'group-1': [{ ...RAW_LOOK, status: 'failed' }] },
  })
  const { entry } = await avatarCreatePhoto(
    context(root, { name: 'Ana', photoPath: photo }),
  )
  const { entry: refreshed } = await refresh(root, entry.id)
  assert.equal(refreshed.status, 'failed')
  assert.equal(refreshed.errorCode, 'avatar_training_failed')
  assert.equal(refreshed.looks[0].status, 'failed')
})

test('avatar-refresh: un avatar que HeyGen creó sin look toma el suyo cuando aparece y termina', async (t) => {
  const { root, photo } = await session(t)
  const group = { ...PHOTO_GROUP, id: 'group-7', status: 'processing' }
  const groupLook = {
    ...RAW_LOOK,
    id: 'look-7',
    group_id: 'group-7',
    status: 'processing',
    supported_api_engines: ['avatar_iii'],
  }
  fakeHeyGen(t, {
    creation: {
      avatar_item: null,
      avatar_group: { id: 'group-7', name: 'Ana', status: 'processing' },
    },
    groupDetails: { 'group-7': group },
    groupLooks: { 'group-7': [groupLook] },
  })
  const { entry } = await avatarCreatePhoto(
    context(root, { name: 'Ana', photoPath: photo }),
  )

  // Aparece entrenando: se suma, pero todavía no puede ser el principal.
  const first = (await refresh(root, entry.id)).entry
  assert.deepEqual(
    first.looks.map((look) => [look.lookId, look.status, look.origin]),
    [['look-7', 'processing', 'heygen']],
  )
  assert.equal(first.mainLookId, null)
  assert.equal(first.status, 'processing')

  // HeyGen termina (el simulado lee los mismos objetos en cada pedido).
  group.status = 'completed'
  groupLook.status = 'completed'
  const second = (await refresh(root, entry.id)).entry
  assert.equal(second.mainLookId, 'look-7')
  assert.equal(second.status, 'ready')
  assert.equal(second.looks[0].status, 'ready')
})

test('avatar-refresh: suma los looks nuevos, sigue a los generados en Vimo y baja la vista previa del que quedó listo', async (t) => {
  const { root } = await session(t)
  const directory = await writeStored(
    root,
    'dante-aaaaaa',
    storedAvatar({
      looks: [
        STORED_LOOK,
        // Generado en Vimo y todavía procesando: HeyGen no lo lista en el
        // grupo público, así que se consulta por su id.
        storedLook('vimo-1', {
          origin: 'vimo',
          status: 'processing',
          supportedEngines: [],
        }),
        // Generado en Vimo pero HeyGen ya no lo tiene (404): se va.
        storedLook('vimo-404', { origin: 'vimo', status: 'processing' }),
        // Generado en Vimo, fallido y fuera del listado: queda como estaba
        // (la interfaz lo muestra y deja generar otro); no se consulta.
        storedLook('vimo-failed', { origin: 'vimo', status: 'failed' }),
        // De HeyGen, listo, y el grupo ya no lo lista: se va.
        storedLook('dante-gone'),
      ],
    }),
  )
  const calls = fakeHeyGen(t, {
    groupLooks: {
      'group-dante': [stockLook('dante-2'), stockLook('dante-new')],
    },
    lookDetails: {
      'vimo-1': stockLook('vimo-1', {
        name: 'Cocina luminosa',
        status: 'completed',
        supported_api_engines: ['avatar_iii'],
      }),
    },
  })
  const { entry } = await refresh(root, 'dante-aaaaaa')
  assert.deepEqual(
    entry.looks.map((look) => [look.lookId, look.origin, look.status]),
    [
      ['dante-2', 'heygen', 'ready'],
      ['vimo-1', 'vimo', 'ready'],
      ['vimo-failed', 'vimo', 'failed'],
      ['dante-new', 'heygen', 'ready'],
    ],
  )
  assert.equal(entry.looks[1].name, 'Cocina luminosa')
  assert.deepEqual(entry.looks[1].supportedEngines, ['avatar_iii'])
  assert.equal(entry.mainLookId, 'dante-2')
  assert.equal(entry.status, 'ready')
  // Se consultaron solo los dos que procesaban y no vinieron en el listado.
  assert.deepEqual(
    heygenCalls(calls)
      .filter((call) => call.startsWith('GET /v3/avatars/looks/'))
      .sort(),
    ['GET /v3/avatars/looks/vimo-1', 'GET /v3/avatars/looks/vimo-404'],
  )
  // La tarjeta (el principal y los dos siguientes con vista previa) y el look
  // de Vimo que quedó listo.
  assert.deepEqual(cdnCalls(calls), [
    '/dante-2.png',
    '/dante-new.png',
    '/vimo-1.png',
  ])
  assert.deepEqual(previewNames(entry), [
    'dante-2.png',
    'vimo-1.png',
    undefined,
    'dante-new.png',
  ])
  assert.deepEqual(
    await readFile(join(directory, 'looks', 'vimo-1.png')),
    cdnImage('/vimo-1.png'),
  )
})

test('avatar-refresh: un look de Vimo que queda listo baja su vista previa aunque no esté en la tarjeta', async (t) => {
  const { root } = await session(t)
  const directory = await writeStored(
    root,
    'dante-aaaaaa',
    storedAvatar({
      looks: [
        STORED_LOOK,
        storedLook('dante-3'),
        storedLook('dante-4'),
        // Cuarto en la lista: la tarjeta ya tiene sus tres (el principal y
        // los dos siguientes), pero un look generado en Vimo que termina se
        // baja igual, para que el detalle del avatar lo muestre.
        storedLook('vimo-late', { origin: 'vimo', status: 'processing' }),
      ],
    }),
  )
  await mkdir(join(directory, 'looks'))
  for (const lookId of ['dante-2', 'dante-3', 'dante-4'])
    await writeFile(join(directory, 'looks', `${lookId}.png`), PNG_HEAD)
  const calls = fakeHeyGen(t, {
    groupLooks: {
      'group-dante': ['dante-2', 'dante-3', 'dante-4'].map((id) =>
        stockLook(id),
      ),
    },
    lookDetails: {
      'vimo-late': stockLook('vimo-late', { status: 'completed' }),
    },
  })
  const { entry } = await refresh(root, 'dante-aaaaaa')
  assert.deepEqual(cdnCalls(calls), ['/vimo-late.png'])
  assert.equal(entry.looks[3].status, 'ready')
  assert.equal(
    entry.looks[3].previewPath,
    join(directory, 'looks', 'vimo-late.png'),
  )
})

// Un avatar propio con sus looks: el grupo privado lista también los
// generados en Vimo.
const OWN_GROUP = {
  id: 'group-own',
  name: 'Own',
  gender: 'Man',
  looks_count: 9,
  status: 'completed',
}

const ownLook = (id, overrides = {}) =>
  stockLook(id, { group_id: 'group-own', status: 'completed', ...overrides })

test('avatar-refresh: baja como mucho seis vistas previas por refresco', async (t) => {
  const { root } = await session(t)
  const vimoIds = Array.from({ length: 8 }, (_, index) => `vimo-${index + 1}`)
  const directory = await writeStored(
    root,
    'own-aaaaaa',
    storedAvatar({
      name: 'Own',
      groupId: 'group-own',
      ownership: 'own',
      mainLookId: 'own-main',
      looks: [
        storedLook('own-main'),
        ...vimoIds.map((lookId) =>
          storedLook(lookId, { origin: 'vimo', status: 'processing' }),
        ),
      ],
    }),
  )
  await mkdir(join(directory, 'looks'))
  await writeFile(join(directory, 'looks', 'own-main.png'), PNG_HEAD)
  // Los ocho looks generados terminan a la vez: faltan ocho vistas previas.
  const calls = fakeHeyGen(t, {
    groupDetails: { 'group-own': OWN_GROUP },
    groupLooks: {
      'group-own': ['own-main', ...vimoIds].map((id) => ownLook(id)),
    },
  })
  const { entry } = await refresh(root, 'own-aaaaaa')
  assert.deepEqual(
    entry.looks.map((look) => look.status),
    Array(9).fill('ready'),
  )
  assert.equal(cdnCalls(calls).length, 6)
  assert.equal(entry.looks.filter((look) => look.previewPath).length, 7)
  // Las dos que faltan se bajan en el refresco siguiente.
  const before = calls.length
  const next = (await refresh(root, 'own-aaaaaa')).entry
  assert.equal(cdnCalls(calls.slice(before)).length, 2)
  assert.equal(next.looks.filter((look) => look.previewPath).length, 9)
})

test('avatar-refresh: un look de Vimo que HeyGen da por fallido queda fallido', async (t) => {
  const { root } = await session(t)
  // Por los dos caminos: el avatar propio lo trae en su listado; el de stock no
  // (es privado) y se consulta por id.
  await writeStored(
    root,
    'own-aaaaaa',
    storedAvatar({
      name: 'Own',
      groupId: 'group-own',
      ownership: 'own',
      mainLookId: 'own-main',
      looks: [
        storedLook('own-main'),
        storedLook('vimo-listed', { origin: 'vimo', status: 'processing' }),
      ],
    }),
  )
  await writeStored(
    root,
    'dante-bbbbbb',
    storedAvatar({
      looks: [
        STORED_LOOK,
        storedLook('vimo-absent', { origin: 'vimo', status: 'processing' }),
      ],
    }),
  )
  // Un look que falló no trae vista previa.
  const calls = fakeHeyGen(t, {
    groupDetails: { 'group-dante': DANTE_GROUP, 'group-own': OWN_GROUP },
    groupLooks: {
      'group-own': [
        ownLook('own-main'),
        ownLook('vimo-listed', {
          status: 'failed',
          preview_image_url: undefined,
        }),
      ],
      'group-dante': [stockLook('dante-2')],
    },
    lookDetails: {
      'vimo-absent': stockLook('vimo-absent', {
        status: 'failed',
        preview_image_url: undefined,
      }),
    },
  })
  for (const [id, lookId] of [
    ['own-aaaaaa', 'vimo-listed'],
    ['dante-bbbbbb', 'vimo-absent'],
  ]) {
    const { entry } = await refresh(root, id)
    const look = entry.looks.find((candidate) => candidate.lookId === lookId)
    assert.equal(look.status, 'failed', lookId)
    assert.equal(look.origin, 'vimo', lookId)
    // El avatar sigue listo con su principal: un look fallido no lo arrastra.
    assert.equal(entry.status, 'ready', id)
  }
  // Ya no procesa: el refresco siguiente no lo vuelve a consultar.
  const before = calls.length
  await refresh(root, 'dante-bbbbbb')
  assert.deepEqual(
    heygenCalls(calls.slice(before)).filter((call) =>
      call.startsWith('GET /v3/avatars/looks/'),
    ),
    [],
  )
})

test('avatar-refresh: consulta por id como mucho seis looks ausentes por refresco', async (t) => {
  const { root } = await session(t)
  const vimoIds = Array.from({ length: 8 }, (_, index) => `vimo-${index + 1}`)
  await writeStored(
    root,
    'dante-aaaaaa',
    storedAvatar({
      looks: [
        STORED_LOOK,
        ...vimoIds.map((lookId) =>
          storedLook(lookId, { origin: 'vimo', status: 'processing' }),
        ),
      ],
    }),
  )
  // Generados sobre un avatar de stock: el listado público no los trae.
  const calls = fakeHeyGen(t, {
    groupLooks: { 'group-dante': [stockLook('dante-2')] },
    lookDetails: Object.fromEntries(
      vimoIds.map((id) => [
        id,
        stockLook(id, { status: 'processing', preview_image_url: undefined }),
      ]),
    ),
  })
  const { entry } = await refresh(root, 'dante-aaaaaa')
  const lookups = (list) =>
    heygenCalls(list).filter((call) =>
      call.startsWith('GET /v3/avatars/looks/'),
    )
  assert.equal(lookups(calls).length, 6)
  // Los dos que no se consultaron quedan como estaban, procesando.
  assert.deepEqual(
    entry.looks.map((look) => look.status),
    ['ready', ...Array(8).fill('processing')],
  )
})

test('avatar-refresh: un listado vacío de un avatar con looks no saca looks ni cambia el principal', async (t) => {
  const { root } = await session(t)
  const looks = [
    STORED_LOOK,
    storedLook('dante-3'),
    storedLook('dante-4'),
    storedLook('vimo-1', { origin: 'vimo' }),
  ]
  // El principal lo eligió la persona; vimo-1 ya tiene su vista previa.
  const directory = await writeStored(
    root,
    'dante-aaaaaa',
    storedAvatar({ mainLookId: 'dante-3', looks }),
  )
  await mkdir(join(directory, 'looks'))
  for (const lookId of ['dante-2', 'dante-3', 'dante-4', 'vimo-1'])
    await writeFile(join(directory, 'looks', `${lookId}.png`), PNG_HEAD)
  const listing = []
  fakeHeyGen(t, {
    groupDetails: { 'group-dante': { ...DANTE_GROUP, looks_count: 4 } },
    groupLooks: { 'group-dante': listing },
    // El principal se confirma por id: HeyGen lo sigue teniendo.
    lookDetails: { 'dante-3': stockLook('dante-3') },
  })
  const ids = (entry) => entry.looks.map((look) => look.lookId)
  const empty = (await refresh(root, 'dante-aaaaaa')).entry
  assert.equal(empty.mainLookId, 'dante-3')
  assert.deepEqual(ids(empty), ['dante-2', 'dante-3', 'dante-4', 'vimo-1'])

  // Con el listado completo de vuelta nada se reordena ni se duplica.
  listing.push(...['dante-2', 'dante-3', 'dante-4'].map((id) => stockLook(id)))
  const full = (await refresh(root, 'dante-aaaaaa')).entry
  assert.equal(full.mainLookId, 'dante-3')
  assert.deepEqual(ids(full), ['dante-2', 'dante-3', 'dante-4', 'vimo-1'])
  assert.equal(full.looks[1].createdAt, STORED_LOOK.createdAt)
})

test('avatar-refresh: el principal que el listado no trae se confirma por id antes de cambiarlo', async (t) => {
  const { root } = await session(t)
  const looks = [STORED_LOOK, storedLook('dante-3'), storedLook('dante-4')]
  await writeStored(
    root,
    'dante-aaaaaa',
    storedAvatar({ mainLookId: 'dante-3', looks }),
  )
  // Un listado incompleto que no trae al principal: HeyGen lo confirma.
  const calls = fakeHeyGen(t, {
    groupLooks: {
      'group-dante': [stockLook('dante-2'), stockLook('dante-4')],
    },
    lookDetails: { 'dante-3': stockLook('dante-3') },
  })
  const { entry } = await refresh(root, 'dante-aaaaaa')
  assert.equal(entry.mainLookId, 'dante-3')
  assert.deepEqual(
    entry.looks.map((look) => look.lookId),
    ['dante-2', 'dante-3', 'dante-4'],
  )
  assert.ok(heygenCalls(calls).includes('GET /v3/avatars/looks/dante-3'))
})

test('avatar-refresh: si HeyGen no puede confirmar el principal que falta, queda como estaba', async (t) => {
  const { root } = await session(t)
  const looks = [STORED_LOOK, storedLook('dante-3'), storedLook('dante-4')]
  await writeStored(
    root,
    'dante-aaaaaa',
    storedAvatar({ mainLookId: 'dante-3', looks }),
  )
  // El listado no lo trae y la consulta por id falla (500): sin un 404 que
  // confirme que ya no existe, el principal elegido no se cambia.
  fakeHeyGen(t, {
    groupLooks: {
      'group-dante': [stockLook('dante-2'), stockLook('dante-4')],
    },
    lookFailures: { 'dante-3': 500 },
  })
  const { entry } = await refresh(root, 'dante-aaaaaa')
  assert.equal(entry.mainLookId, 'dante-3')
  assert.deepEqual(
    entry.looks.map((look) => look.lookId),
    ['dante-2', 'dante-3', 'dante-4'],
  )
})

test('avatar-refresh: un look de Vimo listo sin vista previa en disco la busca por id y la baja', async (t) => {
  const { root } = await session(t)
  // Generado sobre un avatar de stock y listo, pero su vista previa nunca
  // bajó (llegó listo, o la descarga falló): el listado público no lo trae.
  const directory = await writeStored(
    root,
    'dante-aaaaaa',
    storedAvatar({
      looks: [STORED_LOOK, storedLook('vimo-1', { origin: 'vimo' })],
    }),
  )
  await mkdir(join(directory, 'looks'))
  await writeFile(join(directory, 'looks', 'dante-2.png'), PNG_HEAD)
  const calls = fakeHeyGen(t, {
    groupLooks: { 'group-dante': [stockLook('dante-2')] },
    lookDetails: { 'vimo-1': stockLook('vimo-1', { status: 'completed' }) },
  })
  const lookups = (list) =>
    heygenCalls(list).filter((call) =>
      call.startsWith('GET /v3/avatars/looks/'),
    )
  const { entry } = await refresh(root, 'dante-aaaaaa')
  assert.deepEqual(lookups(calls), ['GET /v3/avatars/looks/vimo-1'])
  assert.deepEqual(cdnCalls(calls), ['/vimo-1.png'])
  assert.equal(
    entry.looks[1].previewPath,
    join(directory, 'looks', 'vimo-1.png'),
  )
  // Con la vista previa en disco, el refresco siguiente ya no lo consulta.
  const before = calls.length
  await refresh(root, 'dante-aaaaaa')
  assert.deepEqual(lookups(calls.slice(before)), [])
})

test('avatar-refresh: si el look principal desaparece, el nuevo es el primero listo con Avatar III', async (t) => {
  const { root } = await session(t)
  const looks = [
    storedLook('dante-9'),
    storedLook('dante-1', { supportedEngines: ['avatar_iv'] }),
    storedLook('dante-2'),
  ]
  await writeStored(
    root,
    'dante-aaaaaa',
    storedAvatar({ mainLookId: 'dante-9', looks }),
  )
  // Otro avatar al que solo le queda un look sin Avatar III: ese pasa a ser
  // el principal (la tarjeta lo marca «No compatible con Vimo»).
  await writeStored(
    root,
    'brody-bbbbbb',
    storedAvatar({
      name: 'Brody',
      groupId: 'group-brody',
      mainLookId: 'brody-9',
      looks: [storedLook('brody-9')],
    }),
  )
  fakeHeyGen(t, {
    groupDetails: {
      'group-dante': DANTE_GROUP,
      'group-brody': { ...DANTE_GROUP, id: 'group-brody', name: 'Brody' },
    },
    groupLooks: {
      'group-dante': [
        stockLook('dante-1', { supported_api_engines: ['avatar_iv'] }),
        stockLook('dante-2'),
      ],
      'group-brody': [
        stockLook('brody-1', {
          group_id: 'group-brody',
          supported_api_engines: ['avatar_iv'],
        }),
      ],
    },
  })
  const dante = (await refresh(root, 'dante-aaaaaa')).entry
  assert.equal(dante.mainLookId, 'dante-2')
  assert.equal(dante.status, 'ready')
  assert.deepEqual(
    dante.looks.map((look) => look.lookId),
    ['dante-1', 'dante-2'],
  )
  assert.equal(dante.previewPath, dante.looks[1].previewPath)

  const brody = (await refresh(root, 'brody-bbbbbb')).entry
  assert.equal(brody.mainLookId, 'brody-1')
  assert.equal(brody.status, 'ready')
})

test('avatar-refresh: si HeyGen ya no tiene el grupo, el avatar queda fallido con su código y el refresco no falla', async (t) => {
  const { root } = await session(t)
  // Un avatar que entrenaba, con un look generado en camino.
  const metadata = storedAvatar({
    groupId: 'group-gone',
    ownership: 'own',
    status: 'processing',
    mainLookId: 'look-1',
    looks: [
      storedLook('vimo-1', { origin: 'vimo', status: 'processing' }),
      storedLook('look-1', { status: 'processing' }),
    ],
  })
  await writeStored(root, 'gone-aaaaaa', metadata)
  const calls = fakeHeyGen(t)
  const { entry } = await refresh(root, 'gone-aaaaaa')
  // La tarjeta pasa a rojo con un texto propio y nada queda procesando, así
  // el sondeo deja de preguntar (`avatar_not_found` es «no está en la
  // biblioteca»).
  assert.equal(entry.status, 'failed')
  assert.equal(entry.errorCode, 'avatar_group_missing')
  assert.deepEqual(
    entry.looks.map((look) => look.status),
    ['failed', 'failed'],
  )
  const stored = await readStored(root, 'gone-aaaaaa')
  assert.equal(stored.status, 'failed')
  assert.equal(stored.errorCode, 'avatar_group_missing')
  assert.equal(stored.mainLookId, 'look-1')
  assert.equal(typeof stored.syncedAt, 'string')
  // Solo se preguntó por el grupo: ni el listado ni los looks.
  assert.deepEqual(heygenCalls(calls), ['GET /v3/avatars/group-gone'])
  // Un id que no está en la biblioteca sigue siendo avatar_not_found.
  assert.equal(
    (await failure(refresh(root, 'nadie-000000'))).code,
    'avatar_not_found',
  )
})

test('avatar-refresh: un 500, 401 o 429 al leer el grupo es un error del refresco y no toca el avatar', async (t) => {
  const { root } = await session(t)
  // Los reintentos del 429 esperan al instante, como en check-heygen-client.
  t.mock.method(globalThis, 'setTimeout', (callback) => setImmediate(callback))
  await writeStored(
    root,
    'ana-aaaaaa',
    storedAvatar({
      ownership: 'own',
      status: 'processing',
      mainLookId: 'look-1',
      looks: [storedLook('look-1', { status: 'processing' })],
    }),
  )
  const before = await readStored(root, 'ana-aaaaaa')
  for (const [status, code] of [
    [500, 'avatar_network'],
    [401, 'avatar_invalid_key'],
    [429, 'avatar_rate_limited'],
  ]) {
    const calls = fakeHeyGen(t, { groupFailures: { 'group-dante': status } })
    const error = await failure(refresh(root, 'ana-aaaaaa'))
    // Un tropiezo de HeyGen o de la clave no es «HeyGen ya no tiene el
    // avatar»: sigue entrenando, sin código, y el sondeo vuelve a preguntar.
    assert.equal(error.code, code, `HTTP ${status}`)
    assert.equal(error.httpStatus, status)
    assert.deepEqual(await readStored(root, 'ana-aaaaaa'), before)
    assert.ok(
      heygenCalls(calls).every(
        (call) => call === 'GET /v3/avatars/group-dante',
      ),
    )
  }
})

test('avatar-refresh: lo que otro proceso guardó mientras hablaba con HeyGen no se pisa', async (t) => {
  const { root } = await session(t)
  const metadata = storedAvatar()
  const directory = await writeStored(root, 'dante-aaaaaa', metadata)
  // Mientras el refresco lista los looks, otro proceso (una generación que
  // terminó) suma un look de Vimo a la metadata.
  fakeHeyGen(t, {
    groupLooks: { 'group-dante': [stockLook('dante-2')] },
    onRequest: async (target) => {
      if (target.pathname !== '/v3/avatars/looks') return
      await writeFile(
        join(directory, 'metadata.json'),
        JSON.stringify({
          ...metadata,
          looks: [
            storedLook('vimo-new', { origin: 'vimo', status: 'processing' }),
            ...metadata.looks,
          ],
        }),
      )
    },
  })
  const { entry } = await refresh(root, 'dante-aaaaaa')
  assert.deepEqual(
    entry.looks.map((look) => [look.lookId, look.origin, look.status]),
    [
      ['vimo-new', 'vimo', 'processing'],
      ['dante-2', 'heygen', 'ready'],
    ],
  )
  assert.deepEqual(
    (await readStored(root, 'dante-aaaaaa')).looks.map((look) => look.lookId),
    ['vimo-new', 'dante-2'],
  )
})

const setMainLook = (root, payload, apiKeys, events) =>
  avatarsSubcommands['avatar-set-main-look'](
    context(root, payload, apiKeys, events),
  )

test('avatar-set-main-look: con la vista previa en disco cambia el principal y la cara del avatar sin hablar con HeyGen', async (t) => {
  const { root } = await session(t)
  const directory = await writeStored(
    root,
    'dante-aaaaaa',
    storedAvatar({
      looks: [STORED_LOOK, storedLook('dante-3')],
      previewFile: 'preview.jpg',
    }),
  )
  await writeFile(join(directory, 'preview.jpg'), PNG_HEAD)
  await mkdir(join(directory, 'looks'))
  await writeFile(
    join(directory, 'looks', 'dante-3.png'),
    cdnImage('/dante-3.png'),
  )
  const calls = fakeHeyGen(t)
  const { entry } = await setMainLook(root, {
    id: 'dante-aaaaaa',
    lookId: 'dante-3',
  })
  assert.equal(entry.mainLookId, 'dante-3')
  assert.equal(entry.status, 'ready')
  assert.equal(entry.previewPath, join(directory, 'looks', 'dante-3.png'))
  assert.equal(calls.length, 0)
  // La cara del avatar (`preview.<ext>`) pasa a ser la del principal y la
  // anterior, con otra extensión, se borra.
  const stored = await readStored(root, 'dante-aaaaaa')
  assert.equal(stored.mainLookId, 'dante-3')
  assert.equal(stored.previewFile, 'preview.png')
  assert.deepEqual(
    await readFile(join(directory, 'preview.png')),
    cdnImage('/dante-3.png'),
  )
  assert.equal(await exists(join(directory, 'preview.jpg')), false)
})

test('avatar-set-main-look: si la vista previa falta, la pide a HeyGen y la baja', async (t) => {
  const { root } = await session(t)
  const directory = await writeStored(
    root,
    'dante-aaaaaa',
    storedAvatar({
      looks: [STORED_LOOK, storedLook('dante-3')],
      // Un avatar que había fallado vuelve a estar listo con un principal que sirve.
      status: 'failed',
      errorCode: 'avatar_no_compatible_look',
    }),
  )
  const calls = fakeHeyGen(t, {
    lookDetails: { 'dante-3': stockLook('dante-3') },
  })
  const { entry } = await setMainLook(root, {
    id: 'dante-aaaaaa',
    lookId: 'dante-3',
  })
  assert.equal(entry.mainLookId, 'dante-3')
  assert.equal(entry.status, 'ready')
  assert.equal(entry.errorCode, undefined)
  assert.deepEqual(heygenCalls(calls), ['GET /v3/avatars/looks/dante-3'])
  assert.deepEqual(cdnCalls(calls), ['/dante-3.png'])
  assert.deepEqual(
    await readFile(join(directory, 'looks', 'dante-3.png')),
    cdnImage('/dante-3.png'),
  )
  assert.deepEqual(
    await readFile(join(directory, 'preview.png')),
    cdnImage('/dante-3.png'),
  )
  assert.equal(entry.previewPath, join(directory, 'looks', 'dante-3.png'))
})

test('avatar-set-main-look: sin clave o si HeyGen falla, el principal cambia igual y avisa que quedó sin cara nueva', async (t) => {
  const { root } = await session(t)
  await writeStored(
    root,
    'dante-aaaaaa',
    storedAvatar({ looks: [STORED_LOOK, storedLook('dante-3')] }),
  )
  // `lookDetails` vacío: el look da 404 en HeyGen.
  const calls = fakeHeyGen(t)
  for (const apiKeys of [{}, { heygen: 'key-123' }]) {
    const events = []
    const { entry } = await setMainLook(
      root,
      { id: 'dante-aaaaaa', lookId: 'dante-3' },
      apiKeys,
      events,
    )
    assert.equal(entry.mainLookId, 'dante-3')
    assert.equal(entry.previewPath, undefined)
    assert.deepEqual(
      events.map(({ type, level }) => ({ type, level })),
      [{ type: 'log', level: 'warn' }],
    )
  }
  assert.deepEqual(heygenCalls(calls), ['GET /v3/avatars/looks/dante-3'])
})

test('avatar-set-main-look: un look ajeno, que no está listo o sin Avatar III no puede ser el principal', async (t) => {
  const { root } = await session(t)
  const metadata = storedAvatar({
    looks: [
      STORED_LOOK,
      storedLook('training', { status: 'processing' }),
      storedLook('failed', { status: 'failed' }),
      storedLook('iv-only', { supportedEngines: ['avatar_iv'] }),
    ],
  })
  await writeStored(root, 'dante-aaaaaa', metadata)
  const calls = fakeHeyGen(t)
  const cases = [
    [{ id: 'dante-aaaaaa', lookId: 'nope' }, 'invalid_payload'],
    [{ id: 'dante-aaaaaa', lookId: 'training' }, 'avatar_no_compatible_look'],
    [{ id: 'dante-aaaaaa', lookId: 'failed' }, 'avatar_no_compatible_look'],
    [{ id: 'dante-aaaaaa', lookId: 'iv-only' }, 'avatar_no_compatible_look'],
    [{ id: 'dante-aaaaaa' }, 'invalid_payload'],
    [{ id: 'dante-aaaaaa', lookId: '' }, 'invalid_payload'],
    [{ id: '../x', lookId: 'dante-2' }, 'invalid_payload'],
    [{ lookId: 'dante-2' }, 'invalid_payload'],
    [{ id: 'nadie-000000', lookId: 'dante-2' }, 'avatar_not_found'],
  ]
  for (const [payload, code] of cases) {
    assert.equal(
      (await failure(setMainLook(root, payload))).code,
      code,
      JSON.stringify(payload),
    )
  }
  assert.equal(calls.length, 0)
  assert.deepEqual(await readStored(root, 'dante-aaaaaa'), metadata)
})

test('avatar-set-main-look: si el look desaparece mientras se baja su vista previa, no queda como principal ni cambia la cara del avatar', async (t) => {
  const { root } = await session(t)
  const metadata = storedAvatar({
    looks: [STORED_LOOK, storedLook('dante-3')],
    previewFile: 'preview.png',
  })
  const directory = await writeStored(root, 'dante-aaaaaa', metadata)
  // El principal (dante-2) no tiene vista previa en disco: la cara del avatar
  // es su portada, `preview.png`.
  const cover = cdnImage('/portada-del-grupo')
  await writeFile(join(directory, 'preview.png'), cover)
  // Un refresco en otro proceso saca el look mientras esta descarga sigue.
  fakeHeyGen(t, {
    lookDetails: { 'dante-3': stockLook('dante-3') },
    onRequest: async (target) => {
      if (target.hostname !== 'cdn.example') return
      await writeFile(
        join(directory, 'metadata.json'),
        JSON.stringify({ ...metadata, looks: [STORED_LOOK] }),
      )
    },
  })
  const error = await failure(
    setMainLook(root, { id: 'dante-aaaaaa', lookId: 'dante-3' }),
  )
  assert.equal(error.code, 'invalid_payload')
  assert.equal((await readStored(root, 'dante-aaaaaa')).mainLookId, 'dante-2')
  // La cara se reemplaza solo si el cambio se confirma: sigue la portada.
  assert.deepEqual(await readFile(join(directory, 'preview.png')), cover)
  const { entries } = await avatarsSubcommands['avatars-list'](context(root))
  assert.equal(entries[0].previewPath, join(directory, 'preview.png'))
})

test('avatar-set-main-look: un look que otro proceso sumó mientras se bajaba la vista previa no se pisa', async (t) => {
  const { root } = await session(t)
  const metadata = storedAvatar({
    looks: [STORED_LOOK, storedLook('dante-3')],
  })
  const directory = await writeStored(root, 'dante-aaaaaa', metadata)
  // Mientras se baja la vista previa, una generación guarda su look nuevo.
  fakeHeyGen(t, {
    lookDetails: { 'dante-3': stockLook('dante-3') },
    onRequest: async (target) => {
      if (target.hostname !== 'cdn.example') return
      await writeFile(
        join(directory, 'metadata.json'),
        JSON.stringify({
          ...metadata,
          looks: [
            storedLook('vimo-new', { origin: 'vimo', status: 'processing' }),
            ...metadata.looks,
          ],
        }),
      )
    },
  })
  const { entry } = await setMainLook(root, {
    id: 'dante-aaaaaa',
    lookId: 'dante-3',
  })
  assert.equal(entry.mainLookId, 'dante-3')
  const expected = ['vimo-new', 'dante-2', 'dante-3']
  assert.deepEqual(
    entry.looks.map((look) => look.lookId),
    expected,
  )
  assert.deepEqual(
    (await readStored(root, 'dante-aaaaaa')).looks.map((look) => look.lookId),
    expected,
  )
})

test('avatar-set-main-look: un avatar cuyo grupo ya no está en HeyGen sigue fallido al elegir otro principal', async (t) => {
  const { root } = await session(t)
  const directory = await writeStored(
    root,
    'gone-aaaaaa',
    storedAvatar({
      groupId: 'group-gone',
      status: 'failed',
      errorCode: 'avatar_group_missing',
      looks: [STORED_LOOK, storedLook('dante-3')],
    }),
  )
  await mkdir(join(directory, 'looks'))
  await writeFile(
    join(directory, 'looks', 'dante-3.png'),
    cdnImage('/dante-3.png'),
  )
  const calls = fakeHeyGen(t)
  const { entry } = await setMainLook(root, {
    id: 'gone-aaaaaa',
    lookId: 'dante-3',
  })
  // El principal cambia (es un dato local), pero el avatar no revive: la
  // tarjeta sigue en rojo con su texto y «Crear escenario» sigue oculto.
  assert.equal(entry.mainLookId, 'dante-3')
  assert.equal(entry.status, 'failed')
  assert.equal(entry.errorCode, 'avatar_group_missing')
  const stored = await readStored(root, 'gone-aaaaaa')
  assert.equal(stored.mainLookId, 'dante-3')
  assert.equal(stored.status, 'failed')
  assert.equal(stored.errorCode, 'avatar_group_missing')
  assert.equal(calls.length, 0)
})

// Dos fotos de referencia distintas (JPEG o PNG ≤ 12 MB, como la del avatar).
async function referencePhotos(root) {
  const first = join(root, 'ref-a.png')
  const second = join(root, 'ref-b.png')
  await writeFile(first, Buffer.concat([PNG_HEAD, Buffer.from('a')]))
  await writeFile(second, Buffer.concat([PNG_HEAD, Buffer.from('b')]))
  return [first, second]
}

// El look que HeyGen devuelve al generar uno desde un prompt.
const PROMPT_LOOK = stockLook('vimo-look', {
  name: 'Dante · 2',
  status: 'processing',
  supported_api_engines: [],
})

const generateLook = (root, payload, apiKeys) =>
  avatarsSubcommands['avatar-generate-look'](context(root, payload, apiKeys))

test('avatar-generate-look: todo lo que no cuesta se valida antes de subir nada ni de pagar', async (t) => {
  const { root } = await session(t)
  const [reference] = await referencePhotos(root)
  await writeStored(root, 'dante-aaaaaa', storedAvatar())
  // Un avatar desde foto que todavía entrena: sin principal listo.
  await writeStored(
    root,
    'training-bbbbbb',
    storedAvatar({
      name: 'Ana',
      groupId: 'group-1',
      ownership: 'own',
      status: 'processing',
      mainLookId: 'look-1',
      looks: [storedLook('look-1', { status: 'processing' })],
    }),
  )
  // Un avatar que se quedó sin principal (ningún look sirve).
  await writeStored(
    root,
    'nomain-cccccc',
    storedAvatar({
      status: 'failed',
      errorCode: 'avatar_no_compatible_look',
      mainLookId: null,
      looks: [],
    }),
  )
  const text = join(root, 'nota.txt')
  await writeFile(text, 'hola')
  const webp = join(root, 'ref.webp')
  await writeFile(webp, WEBP_HEAD)
  const calls = fakeHeyGen(t, {
    creation: { avatar_item: PROMPT_LOOK, avatar_group: DANTE_GROUP },
  })

  const valid = {
    id: 'dante-aaaaaa',
    prompt: 'En una cocina',
    aspectRatio: 'auto',
  }
  const cases = [
    [undefined, 'invalid_payload'],
    [{ ...valid, id: undefined }, 'invalid_payload'],
    [{ ...valid, id: '../x' }, 'invalid_payload'],
    [{ ...valid, prompt: '' }, 'invalid_payload'],
    [{ ...valid, prompt: '   ' }, 'invalid_payload'],
    [{ ...valid, prompt: 5 }, 'invalid_payload'],
    [{ ...valid, prompt: 'x'.repeat(1001) }, 'invalid_payload'],
    [{ ...valid, aspectRatio: '21:9' }, 'invalid_payload'],
    [{ ...valid, aspectRatio: undefined }, 'invalid_payload'],
    [
      { ...valid, referenceImagePaths: Array(4).fill(reference) },
      'invalid_payload',
    ],
    [{ ...valid, referenceImagePaths: reference }, 'invalid_payload'],
    [{ ...valid, referenceImagePaths: [reference, ''] }, 'invalid_payload'],
    [{ ...valid, referenceImagePaths: [7] }, 'invalid_payload'],
    // Las referencias se leen con la regla de la foto: ni texto ni WEBP.
    [
      { ...valid, referenceImagePaths: [reference, text] },
      'avatar_photo_invalid',
    ],
    [{ ...valid, referenceImagePaths: [webp] }, 'avatar_photo_invalid'],
    [
      { ...valid, referenceImagePaths: [join(root, 'missing.png')] },
      'avatar_photo_invalid',
    ],
    // Las referencias se validan antes de buscar el avatar.
    [
      { ...valid, id: 'nadie-000000', referenceImagePaths: [text] },
      'avatar_photo_invalid',
    ],
    // Con todo válido, el avatar tiene que existir y tener un principal listo
    // (código propio: todavía no se habló con HeyGen).
    [{ ...valid, id: 'nadie-000000' }, 'avatar_not_found'],
    [
      { ...valid, id: 'training-bbbbbb', referenceImagePaths: [reference] },
      'avatar_main_look_not_ready',
    ],
    [{ ...valid, id: 'nomain-cccccc' }, 'avatar_main_look_not_ready'],
  ]
  for (const [payload, code] of cases) {
    assert.equal(
      (await failure(generateLook(root, payload))).code,
      code,
      JSON.stringify(payload),
    )
  }
  assert.equal(
    (await failure(generateLook(root, valid, {}))).code,
    'missing_api_key',
  )
  assert.equal(
    (
      await failure(
        avatarsSubcommands['avatar-generate-look'](context(undefined, valid)),
      )
    ).code,
    'missing_projects_root',
  )
  // Ninguna llamada a HeyGen: nada se subió ni se cobró.
  assert.equal(calls.length, 0)
  // Justo en el tope el prompt vale.
  await generateLook(root, { ...valid, prompt: 'x'.repeat(1000) })
  assert.equal(heygenCalls(calls).at(-1), 'POST /v3/avatars')
})

test('avatar-generate-look: sube las referencias, pide el look con clave de idempotencia y lo suma primero, procesando', async (t) => {
  const { root } = await session(t)
  const [first, second] = await referencePhotos(root)
  await writeStored(root, 'dante-aaaaaa', storedAvatar())
  const calls = fakeHeyGen(t, {
    creation: { avatar_item: PROMPT_LOOK, avatar_group: DANTE_GROUP },
  })
  const result = await generateLook(root, {
    id: 'dante-aaaaaa',
    prompt: '  En una cocina luminosa, con delantal  ',
    aspectRatio: '9:16',
    referenceImagePaths: [first, second],
  })
  assert.equal(result.lookId, 'vimo-look')
  assert.deepEqual(result.entry.looks[0], {
    lookId: 'vimo-look',
    name: 'Dante · 2',
    lookType: 'studio_avatar',
    supportedEngines: [],
    preferredOrientation: 'portrait',
    status: 'processing',
    origin: 'vimo',
    createdAt: result.entry.looks[0].createdAt,
  })
  assert.deepEqual(
    result.entry.looks.map((look) => look.lookId),
    ['vimo-look', 'dante-2'],
  )
  // El principal no cambia: el look nuevo procesa.
  assert.equal(result.entry.mainLookId, 'dante-2')

  assert.deepEqual(heygenCalls(calls), [
    'POST /v3/assets',
    'POST /v3/assets',
    'POST /v3/avatars',
  ])
  assert.deepEqual(
    calls
      .filter((call) => call.path === '/v3/assets')
      .map((call) => call.init.body.get('file').name),
    ['reference-1.png', 'reference-2.png'],
  )
  const creation = calls.find(
    (call) => call.method === 'POST' && call.path === '/v3/avatars',
  )
  assert.deepEqual(JSON.parse(creation.init.body), {
    type: 'prompt',
    // Sin nombre: `<avatar> · <n>`, con n la cantidad de looks que va a tener.
    name: 'Dante · 2',
    prompt: 'En una cocina luminosa, con delantal',
    avatar_id: 'dante-2',
    avatar_group_id: 'group-dante',
    reference_images: [
      { type: 'asset_id', asset_id: 'asset-reference-1' },
      { type: 'asset_id', asset_id: 'asset-reference-2' },
    ],
    aspect_ratio: '9:16',
  })
  const references = [
    Buffer.concat([PNG_HEAD, Buffer.from('a')]),
    Buffer.concat([PNG_HEAD, Buffer.from('b')]),
  ]
  const key = lookIdempotencyKey(
    'dante-aaaaaa',
    'dante-2',
    'En una cocina luminosa, con delantal',
    '9:16',
    references,
  )
  assert.equal(creation.init.headers['Idempotency-Key'], key)
  assert.match(key, /^vimo-avatar-look-[0-9a-f]{32}$/)

  // Quedó guardado, primero en la lista.
  const stored = await readStored(root, 'dante-aaaaaa')
  assert.deepEqual(
    stored.looks.map((look) => [look.lookId, look.origin, look.status]),
    [
      ['vimo-look', 'vimo', 'processing'],
      ['dante-2', 'heygen', 'ready'],
    ],
  )

  // Repetir el pedido manda la misma clave y HeyGen devuelve el mismo look:
  // la biblioteca no lo duplica.
  const repeated = await generateLook(root, {
    id: 'dante-aaaaaa',
    prompt: 'En una cocina luminosa, con delantal',
    aspectRatio: '9:16',
    referenceImagePaths: [first, second],
    name: 'Otro nombre',
  })
  assert.equal(repeated.lookId, 'vimo-look')
  assert.equal(repeated.entry.looks.length, 2)
  assert.equal(
    calls
      .filter((call) => call.method === 'POST' && call.path === '/v3/avatars')
      .at(-1).init.headers['Idempotency-Key'],
    key,
  )
})

test('avatar-generate-look: exactamente tres referencias valen', async (t) => {
  const { root } = await session(t)
  const [first, second] = await referencePhotos(root)
  const third = join(root, 'ref-c.png')
  await writeFile(third, Buffer.concat([PNG_HEAD, Buffer.from('c')]))
  await writeStored(root, 'dante-aaaaaa', storedAvatar())
  const calls = fakeHeyGen(t, {
    creation: { avatar_item: PROMPT_LOOK, avatar_group: DANTE_GROUP },
  })
  const { lookId } = await generateLook(root, {
    id: 'dante-aaaaaa',
    prompt: 'cocina',
    aspectRatio: 'auto',
    referenceImagePaths: [first, second, third],
  })
  assert.equal(lookId, 'vimo-look')
  assert.deepEqual(heygenCalls(calls), [
    'POST /v3/assets',
    'POST /v3/assets',
    'POST /v3/assets',
    'POST /v3/avatars',
  ])
  assert.equal(JSON.parse(calls.at(-1).init.body).reference_images.length, 3)
})

test('avatar-generate-look: con otro look principal, el mismo prompt pide otro look', async (t) => {
  const { root } = await session(t)
  const directory = await writeStored(
    root,
    'dante-aaaaaa',
    storedAvatar({ looks: [STORED_LOOK, storedLook('dante-3')] }),
  )
  await mkdir(join(directory, 'looks'))
  await writeFile(join(directory, 'looks', 'dante-3.png'), PNG_HEAD)
  const calls = fakeHeyGen(t, {
    creation: { avatar_item: PROMPT_LOOK, avatar_group: DANTE_GROUP },
  })
  const payload = { id: 'dante-aaaaaa', prompt: 'cocina', aspectRatio: 'auto' }
  const creations = () =>
    calls.filter(
      (call) => call.method === 'POST' && call.path === '/v3/avatars',
    )
  await generateLook(root, payload)
  await setMainLook(root, { id: 'dante-aaaaaa', lookId: 'dante-3' })
  await generateLook(root, payload)
  const [before, after] = creations()
  assert.equal(JSON.parse(before.init.body).avatar_id, 'dante-2')
  assert.equal(JSON.parse(after.init.body).avatar_id, 'dante-3')
  // Otra referencia visual, otra clave: HeyGen no repite el look anterior.
  assert.notEqual(
    after.init.headers['Idempotency-Key'],
    before.init.headers['Idempotency-Key'],
  )
})

test('avatar-generate-look: si HeyGen devuelve el look ya listo, baja su vista previa en el momento', async (t) => {
  const { root } = await session(t)
  await writeStored(root, 'dante-aaaaaa', storedAvatar())
  const calls = fakeHeyGen(t, {
    creation: {
      avatar_item: {
        ...PROMPT_LOOK,
        status: 'completed',
        supported_api_engines: ['avatar_iii'],
      },
      avatar_group: DANTE_GROUP,
    },
  })
  const { entry } = await generateLook(root, {
    id: 'dante-aaaaaa',
    prompt: 'cocina',
    aspectRatio: 'auto',
  })
  // El sondeo solo refresca mientras algo procesa: sin esto, nunca bajaría.
  assert.equal(entry.looks[0].status, 'ready')
  assert.equal(
    entry.looks[0].previewPath,
    join(root, 'avatars', 'dante-aaaaaa', 'looks', 'vimo-look.png'),
  )
  assert.deepEqual(cdnCalls(calls), ['/vimo-look.png'])
})

test('avatar-generate-look: un look ya pagado queda guardado aunque se cancele la descarga de su vista previa', async (t) => {
  const { root } = await session(t)
  await writeStored(root, 'dante-aaaaaa', storedAvatar())
  const controller = new AbortController()
  const calls = fakeHeyGen(t, {
    creation: {
      avatar_item: {
        ...PROMPT_LOOK,
        status: 'completed',
        supported_api_engines: ['avatar_iii'],
      },
      avatar_group: DANTE_GROUP,
    },
    // La persona cancela (o cierra la app) mientras baja la vista previa.
    onRequest: (target, init) => {
      if (target.hostname !== 'cdn.example') return
      controller.abort()
      init.signal.throwIfAborted()
    },
  })
  const error = await failure(
    avatarsSubcommands['avatar-generate-look']({
      ...context(root, {
        id: 'dante-aaaaaa',
        prompt: 'cocina',
        aspectRatio: 'auto',
      }),
      signal: controller.signal,
    }),
  )
  // La cancelación sale tal cual, pero el look ya está en la biblioteca, listo
  // y sin vista previa (el listado la deriva cuando la haya).
  assert.equal(error.name, 'AbortError')
  assert.deepEqual(heygenCalls(calls), ['POST /v3/avatars'])
  assert.deepEqual(
    (await readStored(root, 'dante-aaaaaa')).looks.map((look) => [
      look.lookId,
      look.origin,
      look.status,
    ]),
    [
      ['vimo-look', 'vimo', 'ready'],
      ['dante-2', 'heygen', 'ready'],
    ],
  )
  assert.equal(
    await exists(join(root, 'avatars', 'dante-aaaaaa', 'looks')),
    false,
  )
})

test('avatar-generate-look: la clave de idempotencia es determinista y cambia con el pedido, no con el nombre', () => {
  const photo = Buffer.concat([PNG_HEAD, Buffer.from('a')])
  const key = (id, main, prompt, ratio, references) =>
    lookIdempotencyKey(id, main, prompt, ratio, references)
  const base = key('dante-aaaaaa', 'dante-2', 'cocina', 'auto', [photo])
  assert.equal(
    key('dante-aaaaaa', 'dante-2', 'cocina', 'auto', [Buffer.from(photo)]),
    base,
  )
  for (const other of [
    key('brody-bbbbbb', 'dante-2', 'cocina', 'auto', [photo]),
    // Otro look principal es otra referencia visual: otro look.
    key('dante-aaaaaa', 'dante-3', 'cocina', 'auto', [photo]),
    key('dante-aaaaaa', 'dante-2', 'cocina!', 'auto', [photo]),
    key('dante-aaaaaa', 'dante-2', 'cocina', '1:1', [photo]),
    key('dante-aaaaaa', 'dante-2', 'cocina', 'auto', []),
    key('dante-aaaaaa', 'dante-2', 'cocina', 'auto', [photo, photo]),
    key('dante-aaaaaa', 'dante-2', 'cocina', 'auto', [
      Buffer.concat([PNG_HEAD, Buffer.from('b')]),
    ]),
  ])
    assert.notEqual(other, base)
  // Distinto de la clave de una foto: van al mismo endpoint de HeyGen.
  assert.notEqual(base, photoIdempotencyKey('cocina', photo))
})

test('avatar-generate-look: con un nombre propio y sin referencias; si HeyGen devuelve solo el grupo y el grupo no muestra un look nuevo es avatar_look_not_listed', async (t) => {
  const { root } = await session(t)
  const metadata = storedAvatar()
  await writeStored(root, 'dante-aaaaaa', metadata)
  // HeyGen devuelve el look sin estado: recién pedido, queda procesando.
  const withoutStatus = { ...PROMPT_LOOK }
  delete withoutStatus.status
  let response = { avatar_item: withoutStatus, avatar_group: DANTE_GROUP }
  const calls = fakeHeyGen(t, { creation: () => response })
  const { entry } = await generateLook(root, {
    id: 'dante-aaaaaa',
    prompt: 'cocina',
    aspectRatio: 'auto',
    name: '  Cocina luminosa  ',
  })
  assert.equal(entry.looks[0].status, 'processing')
  const body = JSON.parse(calls.at(-1).init.body)
  assert.equal(body.name, 'Cocina luminosa')
  assert.equal(body.aspect_ratio, 'auto')
  assert.equal('reference_images' in body, false)
  assert.deepEqual(heygenCalls(calls), ['POST /v3/avatars'])

  // Solo el grupo, y el grupo no trae ningún look que la biblioteca no
  // conozca (la creación es asíncrona): el código propio, que la UI usa para
  // volver a buscarlo, nada escrito y un solo POST igual.
  response = { avatar_item: null, avatar_group: DANTE_GROUP }
  const before = await readStored(root, 'dante-aaaaaa')
  calls.length = 0
  const error = await failure(
    generateLook(root, {
      id: 'dante-aaaaaa',
      prompt: 'playa',
      aspectRatio: 'auto',
    }),
  )
  assert.equal(error.code, 'avatar_look_not_listed')
  assert.equal(error.provider, 'heygen')
  assert.deepEqual(await readStored(root, 'dante-aaaaaa'), before)
  assert.deepEqual(heygenCalls(calls), [
    'POST /v3/avatars',
    'GET /v3/avatars/looks',
  ])
})

// Un avatar propio con su look principal listo, para los looks que HeyGen
// genera y devuelve solo con el grupo.
const OWN_AVATAR = storedAvatar({
  name: 'Ana',
  groupId: 'group-own',
  ownership: 'own',
  mainLookId: 'own-1',
  looks: [storedLook('own-1', { lookType: 'photo_avatar' })],
})
test('avatar-generate-look: si HeyGen cobra y responde solo con el grupo, el look nuevo del grupo queda registrado y en proceso', async (t) => {
  const { root } = await session(t)
  await writeStored(root, 'ana-aaaaaa', OWN_AVATAR)
  // El look generado viene en el listado del grupo, sin estado.
  const calls = fakeHeyGen(t, {
    creation: { avatar_item: null, avatar_group: { id: 'group-own' } },
    groupLooks: {
      'group-own': [
        ownLook('own-1'),
        ownLook('own-new', { name: 'Ana · 2', status: undefined }),
      ],
    },
  })
  const result = await generateLook(root, {
    id: 'ana-aaaaaa',
    prompt: 'cocina',
    aspectRatio: 'auto',
  })
  assert.equal(result.lookId, 'own-new')
  assert.deepEqual(
    result.entry.looks.map((look) => [look.lookId, look.origin, look.status]),
    [
      ['own-new', 'vimo', 'processing'],
      ['own-1', 'heygen', 'ready'],
    ],
  )
  assert.deepEqual(
    (await readStored(root, 'ana-aaaaaa')).looks.map((look) => look.lookId),
    ['own-new', 'own-1'],
  )
  // Un solo POST (lo pagado) y el listado del grupo, que es gratis.
  assert.deepEqual(heygenCalls(calls), [
    'POST /v3/avatars',
    'GET /v3/avatars/looks',
  ])
  const query = new URLSearchParams(calls.at(-1).search)
  assert.equal(query.get('group_id'), 'group-own')
  assert.equal(query.get('ownership'), 'private')

  // El mismo pedido otra vez (HeyGen repite la respuesta, solo el grupo): el
  // look del listado ya está en la biblioteca, así que no hay ninguno nuevo.
  // `avatar_look_not_listed`, sin duplicar ni tocar la metadata.
  const before = await readStored(root, 'ana-aaaaaa')
  calls.length = 0
  const repeated = await failure(
    generateLook(root, {
      id: 'ana-aaaaaa',
      prompt: 'cocina',
      aspectRatio: 'auto',
    }),
  )
  assert.equal(repeated.code, 'avatar_look_not_listed')
  assert.deepEqual(await readStored(root, 'ana-aaaaaa'), before)
  assert.deepEqual(heygenCalls(calls), [
    'POST /v3/avatars',
    'GET /v3/avatars/looks',
  ])
})

test('avatar-generate-look: con varios looks nuevos en el grupo los suma como del grupo y devuelve el primero', async (t) => {
  const { root } = await session(t)
  await writeStored(root, 'ana-aaaaaa', OWN_AVATAR)
  const calls = fakeHeyGen(t, {
    creation: { avatar_item: null, avatar_group: { id: 'group-own' } },
    groupLooks: {
      'group-own': [
        ownLook('own-new-a', { status: 'processing' }),
        ownLook('own-1'),
        ownLook('own-new-b'),
      ],
    },
  })
  const result = await generateLook(root, {
    id: 'ana-aaaaaa',
    prompt: 'cocina',
    aspectRatio: 'auto',
  })
  // No se sabe cuál es el generado: los dos quedan como looks del grupo, con
  // el estado que dice HeyGen, y el pedido devuelve el primero del listado.
  assert.equal(result.lookId, 'own-new-a')
  assert.deepEqual(
    result.entry.looks.map((look) => [look.lookId, look.origin, look.status]),
    [
      ['own-1', 'heygen', 'ready'],
      ['own-new-a', 'heygen', 'processing'],
      ['own-new-b', 'heygen', 'ready'],
    ],
  )
  assert.equal(
    heygenCalls(calls).filter((call) => call === 'POST /v3/avatars').length,
    1,
  )
})

test('avatar-generate-look: si después de pagar no se pueden leer los looks del grupo es avatar_look_not_listed, con aviso y un solo POST', async (t) => {
  const { root } = await session(t)
  await writeStored(root, 'ana-aaaaaa', OWN_AVATAR)
  const before = await readStored(root, 'ana-aaaaaa')
  const events = []
  const calls = fakeHeyGen(t, {
    creation: { avatar_item: null, avatar_group: { id: 'group-own' } },
    groupLooksStatus: 502,
  })
  const error = await failure(
    avatarsSubcommands['avatar-generate-look'](
      context(
        root,
        { id: 'ana-aaaaaa', prompt: 'cocina', aspectRatio: 'auto' },
        undefined,
        events,
      ),
    ),
  )
  // El look ya está pagado: el código que hace que la UI lo vuelva a buscar,
  // nunca `avatar_network` («revisá tu conexión»), y sin pagar otra vez.
  assert.equal(error.code, 'avatar_look_not_listed')
  assert.deepEqual(await readStored(root, 'ana-aaaaaa'), before)
  assert.deepEqual(heygenCalls(calls), [
    'POST /v3/avatars',
    'GET /v3/avatars/looks',
  ])
  assert.deepEqual(
    events.map(({ type, level }) => ({ type, level })),
    [{ type: 'log', level: 'warn' }],
  )
})

test('avatar-generate-look: cancelar mientras se leen los looks del grupo sale como cancelación, no como avatar_look_not_listed', async (t) => {
  const { root } = await session(t)
  await writeStored(root, 'ana-aaaaaa', OWN_AVATAR)
  const before = await readStored(root, 'ana-aaaaaa')
  const controller = new AbortController()
  const calls = fakeHeyGen(t, {
    creation: { avatar_item: null, avatar_group: { id: 'group-own' } },
    groupLooks: { 'group-own': [ownLook('own-1'), ownLook('own-new')] },
    // La persona cancela (o cierra la app) justo después de pagar.
    onRequest: (target, init) => {
      if (target.pathname !== '/v3/avatars/looks') return
      controller.abort()
      init.signal.throwIfAborted()
    },
  })
  const error = await failure(
    avatarsSubcommands['avatar-generate-look']({
      ...context(root, {
        id: 'ana-aaaaaa',
        prompt: 'cocina',
        aspectRatio: 'auto',
      }),
      signal: controller.signal,
    }),
  )
  assert.equal(error.name, 'AbortError')
  assert.deepEqual(await readStored(root, 'ana-aaaaaa'), before)
  assert.equal(
    heygenCalls(calls).filter((call) => call === 'POST /v3/avatars').length,
    1,
  )
})

test('avatar-generate-look: lo que otro proceso guardó mientras HeyGen generaba no se pisa', async (t) => {
  const { root } = await session(t)
  const metadata = storedAvatar()
  const directory = await writeStored(root, 'dante-aaaaaa', metadata)
  // Mientras el POST está en vuelo, un refresco en otro proceso suma un look.
  fakeHeyGen(t, {
    creation: { avatar_item: PROMPT_LOOK, avatar_group: DANTE_GROUP },
    onRequest: async (target, init) => {
      if (target.pathname !== '/v3/avatars' || init.method !== 'POST') return
      await writeFile(
        join(directory, 'metadata.json'),
        JSON.stringify({
          ...metadata,
          looks: [...metadata.looks, storedLook('dante-new')],
        }),
      )
    },
  })
  const { entry } = await generateLook(root, {
    id: 'dante-aaaaaa',
    prompt: 'cocina',
    aspectRatio: 'auto',
  })
  assert.deepEqual(
    entry.looks.map((look) => look.lookId),
    ['vimo-look', 'dante-2', 'dante-new'],
  )
})

test('avatar-generate-look: el refresco sigue al look generado hasta que queda listo y baja su vista previa', async (t) => {
  const { root } = await session(t)
  await writeStored(root, 'dante-aaaaaa', storedAvatar())
  const generated = { ...PROMPT_LOOK }
  const calls = fakeHeyGen(t, {
    creation: { avatar_item: generated, avatar_group: DANTE_GROUP },
    groupLooks: { 'group-dante': [stockLook('dante-2')] },
    lookDetails: { 'vimo-look': generated },
  })
  await generateLook(root, {
    id: 'dante-aaaaaa',
    prompt: 'cocina',
    aspectRatio: '1:1',
  })

  // Todavía procesa: el refresco lo consulta y lo deja como está.
  const pending = (await refresh(root, 'dante-aaaaaa')).entry
  assert.deepEqual(
    pending.looks.map((look) => [look.lookId, look.status]),
    [
      ['vimo-look', 'processing'],
      ['dante-2', 'ready'],
    ],
  )
  // HeyGen termina: queda listo, con sus motores y su vista previa en disco.
  generated.status = 'completed'
  generated.supported_api_engines = ['avatar_iii']
  const ready = (await refresh(root, 'dante-aaaaaa')).entry
  assert.equal(ready.looks[0].status, 'ready')
  assert.deepEqual(ready.looks[0].supportedEngines, ['avatar_iii'])
  assert.equal(
    ready.looks[0].previewPath,
    join(root, 'avatars', 'dante-aaaaaa', 'looks', 'vimo-look.png'),
  )
  assert.equal(ready.mainLookId, 'dante-2')
  assert.equal(
    heygenCalls(calls).filter(
      (call) => call === 'GET /v3/avatars/looks/vimo-look',
    ).length,
    2,
  )
})

// El look que genera HeyGen sin `preferred_orientation` (es opcional en su
// OpenAPI): Crear elige los looks por orientación, así que sin ella el look
// pagado no se ofrecería nunca.
const withoutOrientation = (look) => {
  const copy = { ...look }
  delete copy.preferred_orientation
  return copy
}

test('avatar-generate-look: si HeyGen no informa la orientación, el look guarda la del formato pedido; con 4:5, 5:4 o auto queda desconocida', async (t) => {
  const { root } = await session(t)
  fakeHeyGen(t, {
    creation: {
      avatar_item: withoutOrientation(PROMPT_LOOK),
      avatar_group: DANTE_GROUP,
    },
  })
  for (const [aspectRatio, expected] of [
    ['16:9', 'landscape'],
    ['9:16', 'portrait'],
    ['1:1', 'square'],
    ['4:5', undefined],
    ['5:4', undefined],
    ['auto', undefined],
  ]) {
    // Un avatar por formato: el look generado tiene el mismo id en todos.
    const id = `dante-${aspectRatio.replace(':', 'x')}`
    await writeStored(root, id, storedAvatar())
    const { entry } = await generateLook(root, {
      id,
      prompt: 'cocina',
      aspectRatio,
    })

    assert.equal(entry.looks[0].lookId, 'vimo-look', aspectRatio)
    assert.equal(entry.looks[0].preferredOrientation, expected, aspectRatio)
    assert.equal(
      (await readStored(root, id)).looks[0].preferredOrientation,
      expected,
      aspectRatio,
    )
  }
})

test('avatar-generate-look: la orientación que HeyGen informa manda sobre la del formato pedido', async (t) => {
  const { root } = await session(t)
  await writeStored(root, 'dante-aaaaaa', storedAvatar())
  // PROMPT_LOOK viene vertical; el pedido fue horizontal.
  fakeHeyGen(t, {
    creation: { avatar_item: PROMPT_LOOK, avatar_group: DANTE_GROUP },
  })
  const { entry } = await generateLook(root, {
    id: 'dante-aaaaaa',
    prompt: 'cocina',
    aspectRatio: '16:9',
  })

  assert.equal(entry.looks[0].preferredOrientation, 'portrait')
})

test('avatar-generate-look: si HeyGen responde solo con el grupo, el look recuperado guarda la orientación pedida; con varios nuevos no se le supone ninguna', async (t) => {
  const { root } = await session(t)
  await writeStored(root, 'ana-aaaaaa', OWN_AVATAR)
  await writeStored(root, 'ana-bbbbbb', OWN_AVATAR)
  let groupLooks = [
    ownLook('own-1'),
    withoutOrientation(ownLook('own-new', { status: undefined })),
  ]
  fakeHeyGen(t, {
    creation: { avatar_item: null, avatar_group: { id: 'group-own' } },
    groupLooks: {
      get 'group-own'() {
        return groupLooks
      },
    },
  })
  const single = await generateLook(root, {
    id: 'ana-aaaaaa',
    prompt: 'cocina',
    aspectRatio: '9:16',
  })
  assert.equal(single.lookId, 'own-new')
  assert.equal(single.entry.looks[0].preferredOrientation, 'portrait')

  // Dos looks nuevos: no se sabe cuál es el generado, así que ninguno recibe
  // la orientación del pedido.
  groupLooks = [
    ownLook('own-1'),
    withoutOrientation(ownLook('own-new-a')),
    withoutOrientation(ownLook('own-new-b')),
  ]
  const several = await generateLook(root, {
    id: 'ana-bbbbbb',
    prompt: 'cocina',
    aspectRatio: '9:16',
  })
  assert.equal(several.lookId, 'own-new-a')
  assert.deepEqual(
    several.entry.looks.map((look) => [look.lookId, look.preferredOrientation]),
    [
      ['own-1', 'portrait'],
      ['own-new-a', undefined],
      ['own-new-b', undefined],
    ],
  )
})

test('avatar-generate-look: el refresco conserva la orientación guardada mientras HeyGen no informa una, y toma la de HeyGen cuando la informa', async (t) => {
  const { root } = await session(t)
  await writeStored(root, 'dante-aaaaaa', storedAvatar())
  const generated = withoutOrientation(PROMPT_LOOK)
  // Un look generado sobre un avatar de stock no sale en el listado del grupo:
  // el refresco lo consulta por id mientras procesa.
  const listing = [stockLook('dante-2')]
  fakeHeyGen(t, {
    creation: { avatar_item: generated, avatar_group: DANTE_GROUP },
    groupLooks: {
      get 'group-dante'() {
        return listing
      },
    },
    lookDetails: { 'vimo-look': generated },
  })
  await generateLook(root, {
    id: 'dante-aaaaaa',
    prompt: 'cocina',
    aspectRatio: '16:9',
  })

  // HeyGen termina el look y sigue sin decir su orientación: queda la pedida.
  generated.status = 'completed'
  generated.supported_api_engines = ['avatar_iii']
  const ready = (await refresh(root, 'dante-aaaaaa')).entry
  assert.equal(ready.looks[0].status, 'ready')
  assert.equal(ready.looks[0].preferredOrientation, 'landscape')
  assert.equal(
    (await readStored(root, 'dante-aaaaaa')).looks[0].preferredOrientation,
    'landscape',
  )

  // Cuando HeyGen la informa (el grupo ya lista el look), manda la suya.
  listing.push({ ...generated, preferred_orientation: 'portrait' })
  const reported = (await refresh(root, 'dante-aaaaaa')).entry
  assert.equal(reported.looks[0].lookId, 'vimo-look')
  assert.equal(reported.looks[0].preferredOrientation, 'portrait')
})

test('avatar-balance: lee el saldo; sin clave, o si HeyGen lo rechaza, responde no disponible sin fallar', async (t) => {
  const { root } = await session(t)
  const responses = [
    { status: 200, body: { data: RAW_ME } },
    {
      status: 200,
      body: { data: { ...RAW_ME, billing_type: 'subscription', wallet: null } },
    },
    {
      status: 401,
      body: { error: { code: 'unauthorized', message: 'bad key' } },
    },
  ]
  const me = { status: 200, body: {} }
  const calls = fakeHeyGen(t, {
    me,
    onRequest: (target) => {
      if (target.pathname === '/v3/users/me')
        Object.assign(me, responses.shift())
    },
  })
  const balance = () => avatarsSubcommands['avatar-balance'](context(root))
  assert.deepEqual(
    await avatarsSubcommands['avatar-balance'](context(root, undefined, {})),
    { available: false, errorCode: 'missing_api_key' },
  )
  assert.equal(calls.length, 0)
  assert.deepEqual(await balance(), {
    available: true,
    remaining: 3.68,
    currency: 'usd',
  })
  assert.deepEqual(await balance(), {
    available: false,
    errorCode: 'avatar_balance_unavailable',
  })
  assert.deepEqual(await balance(), {
    available: false,
    errorCode: 'avatar_invalid_key',
  })
  assert.deepEqual(heygenCalls(calls), [
    'GET /v3/users/me',
    'GET /v3/users/me',
    'GET /v3/users/me',
  ])
})

test('avatar-stock-groups: pide los avatares públicos por defecto, pasa el cursor y devuelve los grupos normalizados', async (t) => {
  const { root } = await session(t)
  const calls = fakeHeyGen(t, {
    // El segundo ítem no tiene nombre: el listado lo saltea.
    groups: [RAW_GROUP, { id: 'group-2', looks_count: 3 }],
    groupsNextToken: 'tok-2',
  })
  const page = await avatarsSubcommands['avatar-stock-groups'](
    context(root, { token: 'tok-1' }),
  )
  assert.deepEqual(page, {
    groups: [
      {
        groupId: 'group-1',
        name: 'Dante',
        previewImageUrl: 'https://cdn.example/dante.png',
        previewVideoUrl: 'https://cdn.example/dante.mp4',
        gender: 'male',
        looksCount: 27,
      },
    ],
    nextToken: 'tok-2',
  })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].path, '/v3/avatars')
  assert.equal(calls[0].init.method, 'GET')
  assert.equal(calls[0].search, '?limit=50&ownership=public&token=tok-1')
})

test('avatar-stock-groups: lo propio pide private; un origen desconocido y un cursor vacío se ignoran', async (t) => {
  const { root } = await session(t)
  const calls = fakeHeyGen(t)
  const handler = avatarsSubcommands['avatar-stock-groups']
  await handler(context(root, { ownership: 'private' }))
  await handler(context(root, { ownership: 'weird', token: '' }))
  await handler(context(root, { ownership: 'private', token: 7 }))
  await handler(context(root))
  assert.deepEqual(
    calls.map((call) => call.search),
    [
      '?limit=50&ownership=private',
      '?limit=50&ownership=public',
      '?limit=50&ownership=private',
      '?limit=50&ownership=public',
    ],
  )
})

test('avatar-stock-groups: sin la clave de HeyGen falla antes de llamar', async (t) => {
  const { root } = await session(t)
  const calls = fakeHeyGen(t)
  const error = await failure(
    avatarsSubcommands['avatar-stock-groups'](context(root, {}, {})),
  )
  assert.equal(error.code, 'missing_api_key')
  assert.equal(calls.length, 0)
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

test('avatar-stock-looks: con groupId pide solo los looks de ese avatar', async (t) => {
  const { root } = await session(t)
  const calls = fakeHeyGen(t, {
    groupLooks: {
      'group-7': [
        {
          ...RAW_LOOK,
          id: 'look-7',
          group_id: 'group-7',
          gender: 'Woman',
          status: 'completed',
        },
      ],
    },
  })
  const handler = avatarsSubcommands['avatar-stock-looks']
  const page = await handler(
    context(root, { groupId: 'group-7', ownership: 'private', token: 'tok-1' }),
  )
  assert.deepEqual(
    page.looks.map((look) => [look.lookId, look.groupId, look.gender]),
    [['look-7', 'group-7', 'female']],
  )
  assert.equal(calls[0].path, '/v3/avatars/looks')
  const params = new URLSearchParams(calls[0].search)
  assert.equal(params.get('group_id'), 'group-7')
  assert.equal(params.get('ownership'), 'private')
  assert.equal(params.get('token'), 'tok-1')

  // Un avatar sin looks devuelve una página vacía, no un error.
  const empty = await handler(context(root, { groupId: 'group-9' }))
  assert.deepEqual(empty, { looks: [], nextToken: null })
  assert.equal(new URLSearchParams(calls[1].search).get('group_id'), 'group-9')

  // Sin groupId, o con uno que no es texto, la consulta no filtra por grupo
  // (y se pide igual: las tres llamadas llegan a HeyGen).
  await handler(context(root, { groupId: '' }))
  await handler(context(root, { groupId: 7 }))
  await handler(context(root))
  assert.equal(calls.length, 5)
  for (const call of calls.slice(2)) {
    assert.equal(new URLSearchParams(call.search).get('group_id'), null)
  }
})

// ─── avatar-stock-types (entrega 2b): estudio y gemelos del stock público ───

const STUDIO = 'studio_avatar'
const TWIN = 'digital_twin'

// Un look de las barridas por tipo; sin `groupId` no trae `group_id`.
const typedLook = (id, groupId, lookType) => ({
  id,
  name: `Look ${id}`,
  avatar_type: lookType,
  supported_api_engines: ['avatar_iii'],
  ...(groupId === undefined ? {} : { group_id: groupId }),
})

// Las páginas de un tipo desde el grupo de cada look de cada página: un grupo
// que se repite es otro look del mismo avatar.
const typedPages = (lookType, groupsByPage) =>
  groupsByPage.map((groupIds, page) =>
    groupIds.map((groupId, index) =>
      typedLook(`${lookType}-${page}-${index}`, groupId, lookType),
    ),
  )

// El grupo de la página `page` de un tipo (`<tipo>-000`, `<tipo>-001`…).
const numberedGroupId = (lookType, page) =>
  `${lookType}-${String(page).padStart(3, '0')}`

// `pageCount` páginas de un solo grupo cada una.
const numberedPages = (lookType, pageCount) =>
  typedPages(
    lookType,
    Array.from({ length: pageCount }, (_, page) => [
      numberedGroupId(lookType, page),
    ]),
  )

// Tres páginas de estudio y dos de gemelos con los ids desordenados y repetidos
// (dentro de una página y entre páginas), y con mayúsculas antes de minúsculas:
// el orden de bytes de `sort()` no es el de `localeCompare`.
const STUDIO_SWEEP = [['Zeta', 'alpha', 'Zeta'], ['mid', 'alpha'], ['Bravo']]
const TWIN_SWEEP = [
  ['twin-c', 'twin-a'],
  ['twin-b', 'twin-a'],
]
const SWEPT_IDS = {
  studioGroupIds: ['Bravo', 'Zeta', 'alpha', 'mid'],
  twinGroupIds: ['twin-a', 'twin-b', 'twin-c'],
}
// Una barrida completa de esas: 3 páginas de estudio y 2 de gemelos.
const SWEEP_REQUESTS = 5

// El HeyGen simulado con esas barridas (o con las `typeLooks` que se pasen).
function sweepingHeyGen(t, options = {}) {
  return fakeHeyGen(t, {
    typeLooks: {
      [STUDIO]: typedPages(STUDIO, STUDIO_SWEEP),
      [TWIN]: typedPages(TWIN, TWIN_SWEEP),
    },
    ...options,
  })
}

const stockTypes = (root, payload, apiKeys, events) =>
  avatarsSubcommands['avatar-stock-types'](
    context(root, payload, apiKeys, events),
  )

const cacheFilePath = (root) => join(root, 'avatars', STOCK_TYPES_CACHE_FILE)

async function writeCacheFile(root, content) {
  await mkdir(join(root, 'avatars'), { recursive: true })
  await writeFile(
    cacheFilePath(root),
    typeof content === 'string' ? content : JSON.stringify(content),
  )
}

const readCacheFile = async (root) =>
  JSON.parse(await readFile(cacheFilePath(root), 'utf8'))

const hoursAgo = (hours) =>
  new Date(Date.now() - hours * 3_600_000).toISOString()

// La caché de `avatar-stock-types` como la deja el comando.
const cacheFile = (overrides = {}) => ({
  version: 1,
  fetchedAt: hoursAgo(1),
  studioGroupIds: ['cached-studio'],
  twinGroupIds: ['cached-twin'],
  truncated: false,
  ...overrides,
})

// Lo que devuelve el comando cuando sirve esa caché.
const servedFrom = (cache) => ({
  studioGroupIds: cache.studioGroupIds,
  twinGroupIds: cache.twinGroupIds,
  fetchedAt: cache.fetchedAt,
  fromCache: true,
  truncated: cache.truncated,
})

// Lo que queda en disco tras barrer HeyGen y devolver `swept`.
const writtenFrom = (swept, ids = SWEPT_IDS, truncated = false) => ({
  version: 1,
  fetchedAt: swept.fetchedAt,
  ...ids,
  truncated,
})

// Los pedidos de las barridas, como parámetros de la consulta y en el orden en
// que salieron.
const sweepParams = (calls) =>
  calls
    .filter((call) => call.path === '/v3/avatars/looks')
    .map((call) => new URLSearchParams(call.search))

// Los cursores mandados para un tipo, en orden (null = la primera página).
const sweepTokens = (calls, lookType) =>
  sweepParams(calls)
    .filter((params) => params.get('avatar_type') === lookType)
    .map((params) => params.get('token'))

// Los cursores de una barrida de `pageCount` páginas.
const tokensOfPages = (pageCount) =>
  Array.from({ length: pageCount }, (_, page) =>
    page === 0 ? null : `page-${page}`,
  )

// Los ids de los grupos de `numberedPages(lookType, pageCount)`, ya ordenados.
const idsOfPages = (lookType, pageCount) =>
  Array.from({ length: pageCount }, (_, page) =>
    numberedGroupId(lookType, page),
  )

// Los eventos del log como `[tipo, nivel, mensaje]`.
const logSummary = (events) =>
  events.map((event) => [event.type, event.level, event.message])

// El aviso de una barrida sin ningún grupo (una sola vez por llamada).
const EMPTY_SWEEP_WARNING = [
  ['log', 'warn', 'stock types sweep returned no groups; not cached'],
]

// Cede el turno al bucle de eventos varias veces: lo que siga vivo avanza.
async function settle() {
  for (let turn = 0; turn < 20; turn++)
    await new Promise((resolve) => setImmediate(resolve))
}

test('avatar-stock-types: barre estudio y gemelos en paralelo, ordena y deduplica los grupos y escribe la caché', async (t) => {
  const { root } = await session(t)
  const calls = sweepingHeyGen(t)
  const events = []
  const startedAt = Date.now()
  const { fetchedAt, ...result } = await stockTypes(
    root,
    undefined,
    undefined,
    events,
  )
  const finishedAt = Date.now()

  assert.deepEqual(result, { ...SWEPT_IDS, fromCache: false, truncated: false })
  assert.equal(new Date(fetchedAt).toISOString(), fetchedAt)
  assert.ok(Date.parse(fetchedAt) >= startedAt)
  assert.ok(Date.parse(fetchedAt) <= finishedAt)

  // Cada tipo pide sus páginas con el cursor de la anterior.
  assert.equal(calls.length, SWEEP_REQUESTS)
  assert.deepEqual(sweepTokens(calls, STUDIO), [null, 'page-1', 'page-2'])
  assert.deepEqual(sweepTokens(calls, TWIN), [null, 'page-1'])
  for (const call of calls) {
    assert.equal(call.host, 'api.heygen.com')
    assert.equal(call.init.method, 'GET')
    assert.equal(call.init.headers['X-Api-Key'], 'key-123')
  }
  for (const params of sweepParams(calls)) {
    assert.equal(params.get('ownership'), 'public')
    assert.equal(params.get('limit'), '50')
    assert.equal(params.get('group_id'), null)
  }
  // Los dos recorridos salen a la vez: los dos primeros pedidos son de cada tipo.
  assert.deepEqual(
    sweepParams(calls)
      .slice(0, 2)
      .map((params) => params.get('avatar_type'))
      .sort(),
    [STUDIO, TWIN].sort(),
  )

  // La caché queda escrita (sin temporales sueltos) y la barrida no avisó nada.
  assert.deepEqual(await readCacheFile(root), writtenFrom({ fetchedAt }))
  assert.deepEqual(await readdir(join(root, 'avatars')), [
    STOCK_TYPES_CACHE_FILE,
  ])
  assert.deepEqual(events, [])
})

test('avatar-stock-types: la segunda llamada sale de la caché sin tocar HeyGen; solo refresh: true vuelve a barrer', async (t) => {
  const { root } = await session(t)
  const typeLooks = {
    [STUDIO]: typedPages(STUDIO, STUDIO_SWEEP),
    [TWIN]: typedPages(TWIN, TWIN_SWEEP),
  }
  const calls = fakeHeyGen(t, { typeLooks })
  const first = await stockTypes(root)
  assert.equal(first.fromCache, false)
  assert.equal(calls.length, SWEEP_REQUESTS)

  calls.length = 0
  assert.deepEqual(await stockTypes(root), { ...first, fromCache: true })

  // Solo el booleano `true` fuerza la barrida: un texto, un número, un objeto o
  // false no, y un payload que no es un objeto se ignora.
  for (const refresh of [false, 'true', 1, {}, null, undefined])
    assert.deepEqual(await stockTypes(root, { refresh }), {
      ...first,
      fromCache: true,
    })
  for (const payload of [null, [], 'refresh', 5, true])
    assert.deepEqual(await stockTypes(root, payload), {
      ...first,
      fromCache: true,
    })
  assert.equal(calls.length, 0)

  // HeyGen cambió: refresh: true lo vuelve a leer y reescribe la caché.
  typeLooks[STUDIO] = typedPages(STUDIO, [['new-studio']])
  const refreshed = await stockTypes(root, { refresh: true })
  assert.equal(refreshed.fromCache, false)
  assert.deepEqual(refreshed.studioGroupIds, ['new-studio'])
  assert.deepEqual(refreshed.twinGroupIds, SWEPT_IDS.twinGroupIds)
  assert.equal(calls.length, 3)
  assert.deepEqual(
    await readCacheFile(root),
    writtenFrom(refreshed, {
      studioGroupIds: ['new-studio'],
      twinGroupIds: SWEPT_IDS.twinGroupIds,
    }),
  )

  // La siguiente sale de la caché nueva.
  calls.length = 0
  assert.deepEqual(await stockTypes(root), { ...refreshed, fromCache: true })
  assert.equal(calls.length, 0)
})

test('avatar-stock-types: la caché dura 24 h: de 23 h 59 min se sirve; de 24 h 1 min se vuelve a barrer y se reescribe', async (t) => {
  const { root } = await session(t)
  const calls = sweepingHeyGen(t)
  assert.equal(STOCK_TYPES_CACHE_TTL_MS, 24 * 3_600_000)

  const nearlyExpired = cacheFile({ fetchedAt: hoursAgo(24 - 1 / 60) })
  await writeCacheFile(root, nearlyExpired)
  assert.deepEqual(await stockTypes(root), servedFrom(nearlyExpired))
  assert.equal(calls.length, 0)

  const expired = cacheFile({ fetchedAt: hoursAgo(24 + 1 / 60) })
  await writeCacheFile(root, expired)
  const swept = await stockTypes(root)
  assert.deepEqual(swept, {
    ...SWEPT_IDS,
    fetchedAt: swept.fetchedAt,
    fromCache: false,
    truncated: false,
  })
  assert.equal(calls.length, SWEEP_REQUESTS)
  assert.ok(Date.parse(swept.fetchedAt) > Date.parse(expired.fetchedAt))
  assert.deepEqual(await readCacheFile(root), writtenFrom(swept))

  // La reescrita vuelve a valer 24 h.
  calls.length = 0
  assert.deepEqual(await stockTypes(root), { ...swept, fromCache: true })
  assert.equal(calls.length, 0)
})

test('avatar-stock-types: una caché que existe pero no sirve se ignora con un aviso y se vuelve a barrer', async (t) => {
  const { root } = await session(t)
  const calls = sweepingHeyGen(t)
  const brokenCaches = [
    ['JSON cortado', '{"version": 1,', 'not valid JSON'],
    ['archivo vacío', '', 'not valid JSON'],
    ['null', 'null', 'not a JSON object'],
    ['una lista', '[]', 'not a JSON object'],
    ['un número', '7', 'not a JSON object'],
    ['otra versión', cacheFile({ version: 2 }), 'unsupported version'],
    ['sin versión', cacheFile({ version: undefined }), 'unsupported version'],
    ['versión como texto', cacheFile({ version: '1' }), 'unsupported version'],
    ['sin fecha', cacheFile({ fetchedAt: undefined }), 'invalid fetchedAt'],
    [
      'fecha que no es fecha',
      cacheFile({ fetchedAt: 'ayer' }),
      'invalid fetchedAt',
    ],
    ['fecha vacía', cacheFile({ fetchedAt: '' }), 'invalid fetchedAt'],
    [
      'fecha numérica',
      cacheFile({ fetchedAt: Date.now() }),
      'invalid fetchedAt',
    ],
    ['fecha nula', cacheFile({ fetchedAt: null }), 'invalid fetchedAt'],
    [
      'estudio que no es una lista',
      cacheFile({ studioGroupIds: 'cached' }),
      'invalid group ids',
    ],
    [
      'gemelos sin definir',
      cacheFile({ twinGroupIds: undefined }),
      'invalid group ids',
    ],
    [
      'ids que no son texto',
      cacheFile({ studioGroupIds: [1, 2] }),
      'invalid group ids',
    ],
    [
      'ids mezclados',
      cacheFile({ twinGroupIds: ['cached-twin', 5] }),
      'invalid group ids',
    ],
    [
      'ids anidados',
      cacheFile({ studioGroupIds: [['cached-studio']] }),
      'invalid group ids',
    ],
    ['un id vacío', cacheFile({ twinGroupIds: [''] }), 'invalid group ids'],
    [
      'truncated sin definir',
      cacheFile({ truncated: undefined }),
      'invalid truncated flag',
    ],
    [
      'truncated como texto',
      cacheFile({ truncated: 'false' }),
      'invalid truncated flag',
    ],
  ]

  for (const [name, content, reason] of brokenCaches) {
    await writeCacheFile(root, content)
    calls.length = 0
    const events = []
    const result = await stockTypes(root, undefined, undefined, events)
    assert.equal(result.fromCache, false, name)
    assert.deepEqual(result.studioGroupIds, SWEPT_IDS.studioGroupIds, name)
    assert.equal(calls.length, SWEEP_REQUESTS, name)
    // Avisa una sola vez, con el motivo (y sin la ruta, que el texto no lleva).
    assert.deepEqual(
      logSummary(events),
      [['log', 'warn', `stock types cache ignored: ${reason}`]],
      name,
    )
    // Quedó reescrita con una forma que sí vale.
    assert.deepEqual(await readCacheFile(root), writtenFrom(result), name)
  }
})

test('avatar-stock-types: una caché que no se puede leer avisa con el código del sistema, sin la ruta, y se vuelve a barrer', async (t) => {
  const { root } = await session(t)
  const calls = sweepingHeyGen(t)
  // Una carpeta donde va el archivo: existe, pero leerlo falla con EISDIR.
  await mkdir(cacheFilePath(root), { recursive: true })
  const events = []
  const result = await stockTypes(root, undefined, undefined, events)

  assert.equal(result.fromCache, false)
  assert.deepEqual(result.studioGroupIds, SWEPT_IDS.studioGroupIds)
  assert.equal(calls.length, SWEEP_REQUESTS)
  // El aviso de la lectura va primero (escribir encima de la carpeta también
  // falla y avisa después, pero eso es otro aviso).
  assert.equal(
    events[0].message,
    'stock types cache ignored: could not be read (EISDIR)',
  )
  assert.ok(events.every((event) => !event.message.includes(root)))
})

test('avatar-stock-types: una caché con la fecha en el futuro no es vigente pero sirve de respaldo, sin avisar', async (t) => {
  const { root } = await session(t)
  const inOneHour = new Date(Date.now() + 3_600_000).toISOString()

  for (const fetchedAt of [inOneHour, '2999-01-01T00:00:00.000Z']) {
    const future = cacheFile({ fetchedAt })

    // Con HeyGen respondiendo no vale como vigente: se vuelve a barrer y se
    // reescribe. Es una fecha válida, así que no hay aviso de caché ignorada.
    const calls = sweepingHeyGen(t)
    await writeCacheFile(root, future)
    const events = []
    const swept = await stockTypes(root, undefined, undefined, events)
    assert.equal(swept.fromCache, false, fetchedAt)
    assert.equal(calls.length, SWEEP_REQUESTS, fetchedAt)
    assert.deepEqual(events, [], fetchedAt)
    assert.deepEqual(await readCacheFile(root), writtenFrom(swept), fetchedAt)

    // Con HeyGen caído la caché se lee y sirve de respaldo, con su fecha.
    sweepingHeyGen(t, { typeLooksStatus: 500 })
    await writeCacheFile(root, future)
    const fallbackEvents = []
    assert.deepEqual(
      await stockTypes(root, undefined, undefined, fallbackEvents),
      servedFrom(future),
      fetchedAt,
    )
    assert.deepEqual(
      logSummary(fallbackEvents),
      [
        [
          'log',
          'warn',
          `stock types sweep failed (avatar_network), serving the cache from ${fetchedAt}`,
        ],
      ],
      fetchedAt,
    )
  }
})

test('avatar-stock-types: una caché válida se sirve aunque esté vacía, parcial o traiga campos de más', async (t) => {
  const { root } = await session(t)
  const calls = sweepingHeyGen(t)
  // La fecha en otro formato parseable sale normalizada a ISO 8601, y los
  // campos que no son del contrato no se filtran al resultado.
  const fetchedAt = new Date(Date.now() - 3_600_000).toUTCString()
  await writeCacheFile(root, {
    ...cacheFile({ fetchedAt, studioGroupIds: [], truncated: true }),
    extra: 'no es del contrato',
  })
  assert.deepEqual(await stockTypes(root), {
    studioGroupIds: [],
    twinGroupIds: ['cached-twin'],
    fetchedAt: new Date(Date.parse(fetchedAt)).toISOString(),
    fromCache: true,
    truncated: true,
  })
  assert.equal(calls.length, 0)

  // Una caché que ya existe y está vacía del todo (la de una versión anterior,
  // o escrita a mano) se sigue sirviendo: lo que el comando no hace es escribir
  // una barrida así.
  const empty = cacheFile({ studioGroupIds: [], twinGroupIds: [] })
  await writeCacheFile(root, empty)
  assert.deepEqual(await stockTypes(root), servedFrom(empty))
  assert.equal(calls.length, 0)
})

test('avatar-stock-types: si HeyGen falla sirve la caché con un aviso; sin caché el fallo sale tal cual y no escribe nada', async (t) => {
  const { root } = await session(t)
  const calls = sweepingHeyGen(t, { typeLooksStatus: 500 })

  // Sin caché: HeyGen caído es `avatar_network` con su status y no deja nada.
  const error = await failure(stockTypes(root))
  assert.equal(error.code, 'avatar_network')
  assert.equal(error.httpStatus, 500)
  assert.equal(await exists(join(root, 'avatars')), false)

  // Con una caché vencida: se sirve tal cual, con un aviso que lleva el código,
  // y el archivo no se toca.
  const stale = cacheFile({ fetchedAt: hoursAgo(25) })
  await writeCacheFile(root, stale)
  calls.length = 0
  const events = []
  assert.deepEqual(
    await stockTypes(root, undefined, undefined, events),
    servedFrom(stale),
  )
  assert.equal(calls.length, 2)
  assert.deepEqual(logSummary(events), [
    [
      'log',
      'warn',
      `stock types sweep failed (avatar_network), serving the cache from ${stale.fetchedAt}`,
    ],
  ])
  assert.deepEqual(await readCacheFile(root), stale)

  // Cualquier otro fallo de la barrida cae igual en la caché, y el aviso lleva
  // su código: clave rechazada, pedido inválido, red caída.
  const failures = [
    [{ typeLooksStatus: 401 }, 'avatar_invalid_key'],
    [{ typeLooksStatus: 400 }, 'avatar_invalid_request'],
    [
      {
        onRequest: () => {
          throw new TypeError('fetch failed')
        },
      },
      'avatar_network',
    ],
  ]
  for (const [options, code] of failures) {
    sweepingHeyGen(t, options)
    const failureEvents = []
    assert.deepEqual(
      await stockTypes(root, undefined, undefined, failureEvents),
      servedFrom(stale),
      code,
    )
    assert.deepEqual(
      logSummary(failureEvents),
      [
        [
          'log',
          'warn',
          `stock types sweep failed (${code}), serving the cache from ${stale.fetchedAt}`,
        ],
      ],
      code,
    )
  }

  // `refresh: true` sobre una caché vigente: si HeyGen falla se sirve la que hay
  // (`fromCache` dice que no se refrescó).
  sweepingHeyGen(t, { typeLooksStatus: 500 })
  const fresh = cacheFile()
  await writeCacheFile(root, fresh)
  const refreshEvents = []
  assert.deepEqual(
    await stockTypes(root, { refresh: true }, undefined, refreshEvents),
    servedFrom(fresh),
  )
  assert.deepEqual(logSummary(refreshEvents), [
    [
      'log',
      'warn',
      `stock types sweep failed (avatar_network), serving the cache from ${fresh.fetchedAt}`,
    ],
  ])
})

test('avatar-stock-types: la caché vigente sirve sin clave; todo lo demás exige la clave antes de llamar', async (t) => {
  const { root } = await session(t)
  const calls = sweepingHeyGen(t)
  const noKey = {}

  // Sin clave y sin caché.
  const missing = await failure(stockTypes(root, undefined, noKey))
  assert.equal(missing.code, 'missing_api_key')
  assert.equal(await exists(join(root, 'avatars')), false)

  // Sin clave y con la caché vigente: se sirve.
  const fresh = cacheFile()
  await writeCacheFile(root, fresh)
  assert.deepEqual(await stockTypes(root, undefined, noKey), servedFrom(fresh))

  // Pedir un refresco, o tener la caché vencida, sí necesita la clave.
  assert.equal(
    (await failure(stockTypes(root, { refresh: true }, noKey))).code,
    'missing_api_key',
  )
  await writeCacheFile(root, cacheFile({ fetchedAt: hoursAgo(25) }))
  assert.equal(
    (await failure(stockTypes(root, undefined, noKey))).code,
    'missing_api_key',
  )
  assert.equal(calls.length, 0)
})

test('avatar-stock-types: sin carpeta raíz falla con missing_projects_root antes de llamar', async (t) => {
  const calls = sweepingHeyGen(t)
  const error = await failure(stockTypes(undefined))
  assert.equal(error.code, 'missing_projects_root')
  assert.equal(calls.length, 0)
})

test('avatar-stock-types: corta cada tipo en STOCK_TYPES_MAX_PAGES páginas y marca la lista como parcial', async (t) => {
  const { root } = await session(t)
  assert.equal(STOCK_TYPES_MAX_PAGES, 80)
  // HeyGen siempre dice que hay más: 20 páginas de sobra por tipo.
  const calls = fakeHeyGen(t, {
    typeLooks: {
      [STUDIO]: numberedPages(STUDIO, STOCK_TYPES_MAX_PAGES + 20),
      [TWIN]: numberedPages(TWIN, STOCK_TYPES_MAX_PAGES + 20),
    },
  })
  const result = await stockTypes(root)

  assert.equal(result.truncated, true)
  assert.equal(calls.length, 2 * STOCK_TYPES_MAX_PAGES)
  assert.deepEqual(
    sweepTokens(calls, STUDIO),
    tokensOfPages(STOCK_TYPES_MAX_PAGES),
  )
  assert.deepEqual(
    sweepTokens(calls, TWIN),
    tokensOfPages(STOCK_TYPES_MAX_PAGES),
  )
  // Los ids son los de las páginas leídas, ni uno más.
  assert.deepEqual(
    result.studioGroupIds,
    idsOfPages(STUDIO, STOCK_TYPES_MAX_PAGES),
  )
  assert.deepEqual(result.twinGroupIds, idsOfPages(TWIN, STOCK_TYPES_MAX_PAGES))

  // La caché guarda que es parcial y así se sirve.
  assert.equal((await readCacheFile(root)).truncated, true)
  calls.length = 0
  assert.deepEqual(await stockTypes(root), { ...result, fromCache: true })
  assert.equal(calls.length, 0)
})

test('avatar-stock-types: una barrida que termina justo en la última página permitida no es parcial; si un solo tipo se corta, la lista sí', async (t) => {
  const { root } = await session(t)
  const typeLooks = {
    [STUDIO]: numberedPages(STUDIO, STOCK_TYPES_MAX_PAGES),
    [TWIN]: numberedPages(TWIN, 3),
  }
  const calls = fakeHeyGen(t, { typeLooks })

  const exact = await stockTypes(root)
  assert.equal(exact.truncated, false)
  assert.equal(sweepTokens(calls, STUDIO).length, STOCK_TYPES_MAX_PAGES)
  assert.equal(exact.studioGroupIds.length, STOCK_TYPES_MAX_PAGES)

  // Una página más de estudio: se corta ahí; los gemelos se leen completos.
  typeLooks[STUDIO] = numberedPages(STUDIO, STOCK_TYPES_MAX_PAGES + 1)
  calls.length = 0
  const cut = await stockTypes(root, { refresh: true })
  assert.equal(cut.truncated, true)
  assert.equal(sweepTokens(calls, STUDIO).length, STOCK_TYPES_MAX_PAGES)
  assert.deepEqual(cut.twinGroupIds, idsOfPages(TWIN, 3))
  assert.equal((await readCacheFile(root)).truncated, true)

  // Y al revés: los gemelos se cortan y el estudio se lee completo.
  typeLooks[STUDIO] = numberedPages(STUDIO, 3)
  typeLooks[TWIN] = numberedPages(TWIN, STOCK_TYPES_MAX_PAGES + 1)
  calls.length = 0
  const cutTwins = await stockTypes(root, { refresh: true })
  assert.equal(cutTwins.truncated, true)
  assert.equal(sweepTokens(calls, TWIN).length, STOCK_TYPES_MAX_PAGES)
  assert.deepEqual(cutTwins.studioGroupIds, idsOfPages(STUDIO, 3))
})

test('avatar-stock-types: un look sin group_id (ausente, vacío o que no es texto) no entra en ningún conjunto', async (t) => {
  const { root } = await session(t)
  const typeLooks = {
    [STUDIO]: [
      [
        typedLook('s-1', 'studio-1', STUDIO),
        typedLook('s-2', undefined, STUDIO),
        { ...typedLook('s-3', undefined, STUDIO), group_id: '' },
        { ...typedLook('s-4', undefined, STUDIO), group_id: 7 },
      ],
    ],
    [TWIN]: [[typedLook('t-1', undefined, TWIN)]],
  }
  const calls = fakeHeyGen(t, { typeLooks })
  const events = []
  const result = await stockTypes(root, undefined, undefined, events)
  assert.deepEqual(result.studioGroupIds, ['studio-1'])
  assert.deepEqual(result.twinGroupIds, [])
  assert.equal(result.truncated, false)
  assert.deepEqual(events, [])

  // Con una sola lista vacía la barrida sigue siendo válida (hay un grupo de
  // estudio): se guarda con la lista vacía tal cual y se sirve. La que no se
  // guarda es la barrida sin ningún grupo (la prueba que sigue).
  assert.deepEqual(
    await readCacheFile(root),
    writtenFrom(result, { studioGroupIds: ['studio-1'], twinGroupIds: [] }),
  )
  calls.length = 0
  assert.deepEqual(await stockTypes(root), { ...result, fromCache: true })
  assert.equal(calls.length, 0)

  // Y al revés: sin grupos de estudio y con uno de gemelos también se guarda.
  typeLooks[STUDIO] = [[typedLook('s-1', undefined, STUDIO)]]
  typeLooks[TWIN] = [[typedLook('t-1', 'twin-1', TWIN)]]
  const reversedEvents = []
  const reversed = await stockTypes(
    root,
    { refresh: true },
    undefined,
    reversedEvents,
  )
  assert.deepEqual(reversed.studioGroupIds, [])
  assert.deepEqual(reversed.twinGroupIds, ['twin-1'])
  assert.deepEqual(reversedEvents, [])
  assert.deepEqual(
    await readCacheFile(root),
    writtenFrom(reversed, { studioGroupIds: [], twinGroupIds: ['twin-1'] }),
  )
})

test('avatar-stock-types: una barrida sin ningún grupo no se guarda, avisa una vez y la siguiente vuelve a barrer', async (t) => {
  const { root } = await session(t)
  // HeyGen contesta 200 con `data: []` en los dos tipos (un fallo pasajero).
  const typeLooks = { [STUDIO]: [[]], [TWIN]: [[]] }
  const calls = fakeHeyGen(t, { typeLooks })

  // Dos intentos seguidos: ninguno escribe nada (ni la carpeta), cada uno avisa
  // una sola vez, y los dos vuelven a pedirle a HeyGen (una página por tipo).
  for (const attempt of ['primero', 'segundo']) {
    calls.length = 0
    const events = []
    const result = await stockTypes(root, undefined, undefined, events)
    assert.deepEqual(
      result,
      {
        studioGroupIds: [],
        twinGroupIds: [],
        fetchedAt: result.fetchedAt,
        fromCache: false,
        truncated: false,
      },
      attempt,
    )
    assert.equal(calls.length, 2, attempt)
    assert.deepEqual(logSummary(events), EMPTY_SWEEP_WARNING, attempt)
    assert.equal(await exists(join(root, 'avatars')), false, attempt)
  }

  // Lo mismo si llegan looks pero ninguno trae un grupo que valga.
  typeLooks[STUDIO] = [[typedLook('s-1', undefined, STUDIO)]]
  typeLooks[TWIN] = [
    [
      typedLook('t-1', undefined, TWIN),
      { ...typedLook('t-2', undefined, TWIN), group_id: '' },
    ],
  ]
  calls.length = 0
  const noGroupsEvents = []
  const noGroups = await stockTypes(root, undefined, undefined, noGroupsEvents)
  assert.deepEqual(
    [noGroups.studioGroupIds, noGroups.twinGroupIds, noGroups.fromCache],
    [[], [], false],
  )
  assert.equal(calls.length, 2)
  assert.deepEqual(logSummary(noGroupsEvents), EMPTY_SWEEP_WARNING)
  assert.equal(await exists(join(root, 'avatars')), false)

  // Cuando HeyGen responde bien, esa barrida sí se guarda, sin aviso, y desde
  // ahí se sirve de la caché: la vacía de antes no dejó nada atrás.
  typeLooks[STUDIO] = typedPages(STUDIO, STUDIO_SWEEP)
  typeLooks[TWIN] = typedPages(TWIN, TWIN_SWEEP)
  calls.length = 0
  const recoveredEvents = []
  const recovered = await stockTypes(
    root,
    undefined,
    undefined,
    recoveredEvents,
  )
  assert.deepEqual(recovered, {
    ...SWEPT_IDS,
    fetchedAt: recovered.fetchedAt,
    fromCache: false,
    truncated: false,
  })
  assert.equal(calls.length, SWEEP_REQUESTS)
  assert.deepEqual(recoveredEvents, [])
  assert.deepEqual(await readCacheFile(root), writtenFrom(recovered))
  calls.length = 0
  assert.deepEqual(await stockTypes(root), { ...recovered, fromCache: true })
  assert.equal(calls.length, 0)
})

test('avatar-stock-types: una barrida sin ningún grupo sirve la caché que ya existe y no la pisa', async (t) => {
  const { root } = await session(t)
  const calls = fakeHeyGen(t, { typeLooks: { [STUDIO]: [[]], [TWIN]: [[]] } })

  // Caché vencida: se vuelve a barrer, la barrida viene vacía y se sirve la que
  // había (`fromCache: true`) con un solo aviso; el archivo queda como estaba.
  const stale = cacheFile({ fetchedAt: hoursAgo(25) })
  await writeCacheFile(root, stale)
  const events = []
  assert.deepEqual(
    await stockTypes(root, undefined, undefined, events),
    servedFrom(stale),
  )
  assert.equal(calls.length, 2)
  assert.deepEqual(logSummary(events), EMPTY_SWEEP_WARNING)
  assert.deepEqual(await readCacheFile(root), stale)

  // Caché vigente saltada con `refresh: true`: igual.
  calls.length = 0
  const fresh = cacheFile()
  await writeCacheFile(root, fresh)
  const refreshEvents = []
  assert.deepEqual(
    await stockTypes(root, { refresh: true }, undefined, refreshEvents),
    servedFrom(fresh),
  )
  assert.equal(calls.length, 2)
  assert.deepEqual(logSummary(refreshEvents), EMPTY_SWEEP_WARNING)
  assert.deepEqual(await readCacheFile(root), fresh)

  // Una caché con la fecha en el futuro también es legible: se sirve.
  calls.length = 0
  const future = cacheFile({
    fetchedAt: new Date(Date.now() + 3_600_000).toISOString(),
  })
  await writeCacheFile(root, future)
  const futureEvents = []
  assert.deepEqual(
    await stockTypes(root, undefined, undefined, futureEvents),
    servedFrom(future),
  )
  assert.equal(calls.length, 2)
  assert.deepEqual(logSummary(futureEvents), EMPTY_SWEEP_WARNING)
  assert.deepEqual(await readCacheFile(root), future)
})

test('avatar-stock-types: una barrida sin grupos que el tope cortó sí se guarda: HeyGen devolvió páginas de looks', async (t) => {
  const { root } = await session(t)
  // Páginas de looks sin grupo de sobra: no hay ningún id, pero la barrida llegó
  // al tope, así que no es un `data: []` pasajero sino una lista parcial.
  const withoutGroups = (lookType) =>
    typedPages(
      lookType,
      Array.from({ length: STOCK_TYPES_MAX_PAGES + 5 }, () => [undefined]),
    )
  const calls = fakeHeyGen(t, {
    typeLooks: {
      [STUDIO]: withoutGroups(STUDIO),
      [TWIN]: withoutGroups(TWIN),
    },
  })
  const events = []
  const result = await stockTypes(root, undefined, undefined, events)
  assert.deepEqual(result, {
    studioGroupIds: [],
    twinGroupIds: [],
    fetchedAt: result.fetchedAt,
    fromCache: false,
    truncated: true,
  })
  assert.deepEqual(events, [])
  assert.deepEqual(
    await readCacheFile(root),
    writtenFrom(result, { studioGroupIds: [], twinGroupIds: [] }, true),
  )

  calls.length = 0
  assert.deepEqual(await stockTypes(root), { ...result, fromCache: true })
  assert.equal(calls.length, 0)
})

test('avatar-stock-types: si la caché no se puede escribir avisa y devuelve igual lo barrido', async (t) => {
  const { root } = await session(t)
  sweepingHeyGen(t)
  // `avatars` es un archivo: no hay dónde leer ni escribir la caché. Leerla no
  // avisa (no hay archivo); escribirla sí, y es el único aviso.
  await writeFile(join(root, 'avatars'), 'no soy una carpeta')
  const events = []
  const result = await stockTypes(root, undefined, undefined, events)

  assert.deepEqual(result, {
    ...SWEPT_IDS,
    fetchedAt: result.fetchedAt,
    fromCache: false,
    truncated: false,
  })
  assert.deepEqual(
    events.map((event) => [event.type, event.level]),
    [['log', 'warn']],
  )
  assert.match(events[0].message, /^stock types cache could not be written: /)
  // Lleva el motivo (el código del sistema), no la ruta del usuario.
  assert.ok(!events[0].message.includes(root))
  assert.equal(
    await readFile(join(root, 'avatars'), 'utf8'),
    'no soy una carpeta',
  )
})

test('avatar-stock-types: una cancelación sale tal cual, aunque haya una caché que servir', async (t) => {
  const { root } = await session(t)
  const stale = cacheFile({ fetchedAt: hoursAgo(25) })
  await writeCacheFile(root, stale)
  const controller = new AbortController()
  sweepingHeyGen(t, {
    // La persona cancela (o cierra la app) con la barrida en vuelo.
    onRequest: (_target, init) => {
      controller.abort()
      init.signal.throwIfAborted()
    },
  })
  const events = []
  const error = await failure(
    avatarsSubcommands['avatar-stock-types']({
      ...context(root, undefined, undefined, events),
      signal: controller.signal,
    }),
  )

  // Ni la caché vencida ni un aviso: la cancelación llega como cancelación.
  assert.equal(error.name, 'AbortError')
  assert.deepEqual(events, [])
  assert.deepEqual(await readCacheFile(root), stale)

  // Sin caché sale igual, y no deja nada escrito.
  await rm(join(root, 'avatars'), { recursive: true })
  const secondController = new AbortController()
  sweepingHeyGen(t, {
    onRequest: (_target, init) => {
      secondController.abort()
      init.signal.throwIfAborted()
    },
  })
  const secondError = await failure(
    avatarsSubcommands['avatar-stock-types']({
      ...context(root, undefined, undefined, events),
      signal: secondController.signal,
    }),
  )
  assert.equal(secondError.name, 'AbortError')
  assert.deepEqual(events, [])
  assert.equal(await exists(join(root, 'avatars')), false)
})

test('avatar-stock-types: cuando un recorrido falla el otro deja de pedir páginas', async (t) => {
  const { root } = await session(t)
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const calls = fakeHeyGen(t, {
    typeLooks: {
      [STUDIO]: numberedPages(STUDIO, 3),
      [TWIN]: numberedPages(TWIN, 40),
    },
    // Estudio falla en su segunda página.
    typeLooksStatus: (lookType, page) =>
      lookType === STUDIO && page === 1 ? 500 : undefined,
    // Los gemelos esperan en su segunda página a que el comando ya haya fallado,
    // y entonces siguen como seguiría un fetch real: con la señal en la mano.
    onRequest: async (target, init) => {
      if (target.searchParams.get('avatar_type') !== TWIN) return
      if (target.searchParams.get('token') === null) return
      await gate
      init.signal.throwIfAborted()
    },
  })

  const error = await failure(stockTypes(root))
  assert.equal(error.code, 'avatar_network')
  release()
  await settle()

  // Los gemelos pidieron su primera página y la segunda (la que esperaba).
  assert.deepEqual(sweepTokens(calls, TWIN), [null, 'page-1'])
  assert.deepEqual(sweepTokens(calls, STUDIO), [null, 'page-1'])
  assert.equal(await exists(join(root, 'avatars')), false)
})

test('avatars-list: el archivo de la caché del stock y su temporal no aparecen como avatar ni avisan', async (t) => {
  const { root } = await session(t)
  await writeStored(root, 'dante-aaaaaa', storedAvatar())
  await writeStored(
    root,
    'ana-bbbbbb',
    storedAvatar({
      name: 'Ana',
      groupId: 'group-ana',
      createdAt: '2026-10-08T01:00:00.000Z',
    }),
  )
  const listing = async () => {
    const events = []
    const result = await avatarsSubcommands['avatars-list'](
      context(root, undefined, undefined, events),
    )
    return { result, events }
  }
  const without = await listing()
  assert.equal(without.result.entries.length, 2)
  assert.deepEqual(without.events, [])

  // El archivo que escribe el comando de verdad, y el temporal huérfano de una
  // escritura interrumpida.
  sweepingHeyGen(t)
  await stockTypes(root)
  await writeFile(
    join(root, 'avatars', `${STOCK_TYPES_CACHE_FILE}.4242-0a1b2c3d.tmp`),
    '{',
  )
  const withCache = await listing()
  assert.deepEqual(withCache.result, without.result)
  assert.deepEqual(withCache.events, [])

  // Y aunque la caché esté rota.
  await writeCacheFile(root, '{"version": 1,')
  const withBrokenCache = await listing()
  assert.deepEqual(withBrokenCache.result, without.result)
  assert.deepEqual(withBrokenCache.events, [])
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

test('centinela: al terminar, fetch vuelve a ser el real', () => {
  // Cada test deja un solo mock vivo de fetch y node:test lo restaura al
  // terminar: si alguno armara dos, este global quedaría simulado.
  assert.equal(globalThis.fetch.mock, undefined)
})
