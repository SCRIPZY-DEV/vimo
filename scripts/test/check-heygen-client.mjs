// Cliente de HeyGen y biblioteca de avatares en disco (ADR-0057, entregas 1,
// 1b y 2): la clasificación de errores, el reintento ante 429, el listado de
// avatares (grupos) y de looks con su paginación, un avatar por su id (404 =
// avatar_not_found), el género normalizado, la subida multipart, la clave de
// idempotencia al crear un avatar desde foto, el saldo de la billetera (que
// nunca lanza), el look nuevo desde un prompt, los renders de video (el cuerpo
// de `createVideo` sin fondo ni `fit`, el 409 que se repite con la misma
// clave y el mismo cuerpo a los 2, 4 y 8 s, el pedido que no sale sin look,
// sin audio o con una clave inválida, la cancelación que nunca sale como un
// fallo de HeyGen, el `param` del rechazo conservado, el rechazo marcado si
// llegó después de un 409 del mismo pedido, el estado de un render, el 404
// con su status, la búsqueda por título (que conserva un render con un estado
// desconocido si trae id y título), el mapeo de `failure_code` y el código de
// moderación del sobre de un rechazo) y la carpeta `avatars/`
// (un avatar = un grupo con sus looks) con metadata tolerante, la de la
// entrega 1 reconocida y las reglas del look principal y del estado. Importa
// el código real del sidecar (Node quita los tipos) y simula HeyGen con
// `fetch` falso: nada sale a la red.
import assert from 'node:assert/strict'
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  createHeyGenClient,
  toAvatarGender,
  toHeyGenAvatarGroup,
  toHeyGenLook,
  toHeyGenVideo,
} from '../../pipeline/providers/avatar/heygen.ts'
import {
  HeyGenFailure,
  heygenFailure,
  heygenVideoFailure,
} from '../../pipeline/providers/avatar/heygen-errors.ts'
import {
  assertValidAvatarId,
  avatarStatusOf,
  cardLookIds,
  isUsableLook,
  listAvatarEntries,
  MAX_PHOTO_BYTES,
  newAvatarId,
  parseAvatarMetadata,
  pickMainLookId,
  readAvatarEntry,
  readAvatarMetadata,
  readAvatarPhoto,
  updateAvatarMetadata,
  writeAvatarMetadata,
  writeLookPreviewFile,
  writePreviewFile,
} from '../../pipeline/commands/avatars/avatar-library.ts'
import {
  isProjectDirectoryName,
  RESERVED_ROOT_DIRECTORIES,
} from '../../pipeline/project/paths.ts'
import { writeFileAtomic } from '../../pipeline/utils/atomic-fs.ts'
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

// Un avatar público de `GET /v3/avatars` con los campos que Vimo ignora
// (`created_at`, `default_voice_id`, `consent_status`) incluidos.
const RAW_GROUP = {
  id: 'group-1',
  name: 'Dante',
  preview_image_url: 'https://cdn.example/dante.png',
  preview_video_url: 'https://cdn.example/dante.mp4',
  gender: 'male',
  created_at: 1711929600,
  looks_count: 27,
  default_voice_id: 'voice-1',
  consent_status: 'accepted',
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

// El fetch real, tomado antes de cualquier test: el centinela del final
// comprueba que ningún simulado quedó puesto.
const REAL_FETCH = globalThis.fetch

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

test('toAvatarGender: male/man y female/woman sin distinguir mayúsculas, y lo demás queda sin género', () => {
  for (const raw of ['male', 'man', 'Man', 'MALE']) {
    assert.equal(toAvatarGender(raw), 'male', raw)
  }
  for (const raw of ['female', 'woman', 'Woman', 'FEMALE']) {
    assert.equal(toAvatarGender(raw), 'female', raw)
  }
  for (const raw of ['robot', '', 'unknown', 5, true, null, undefined, {}]) {
    assert.equal(toAvatarGender(raw), undefined, String(raw))
  }
})

test('toHeyGenLook: el género sale normalizado y uno desconocido se descarta', () => {
  assert.equal(toHeyGenLook({ ...RAW_LOOK, gender: 'Woman' }).gender, 'female')
  assert.equal(toHeyGenLook({ ...RAW_LOOK, gender: 'Man' }).gender, 'male')
  assert.equal(toHeyGenLook({ ...RAW_LOOK, gender: 'robot' }).gender, undefined)
  assert.equal(toHeyGenLook({ ...RAW_LOOK, gender: null }).gender, undefined)
  // Sin género la clave ni existe: el look no arrastra un `gender: undefined`.
  assert.equal(
    'gender' in toHeyGenLook({ ...RAW_LOOK, gender: 'robot' }),
    false,
  )
})

test('toHeyGenAvatarGroup: mapea un avatar público y deja fuera lo que Vimo no usa', () => {
  assert.deepEqual(toHeyGenAvatarGroup(RAW_GROUP), {
    groupId: 'group-1',
    name: 'Dante',
    previewImageUrl: 'https://cdn.example/dante.png',
    previewVideoUrl: 'https://cdn.example/dante.mp4',
    gender: 'male',
    looksCount: 27,
  })
})

test('toHeyGenAvatarGroup: un avatar propio trae el género de HeyGen y su estado de entrenamiento', () => {
  const privateGroup = {
    id: 'group-2',
    name: 'Ana',
    gender: 'Woman',
    looks_count: 1,
    status: 'processing',
  }
  assert.deepEqual(toHeyGenAvatarGroup(privateGroup), {
    groupId: 'group-2',
    name: 'Ana',
    gender: 'female',
    looksCount: 1,
    status: 'processing',
  })
  // Mismo mapeo que los looks: completed → ready, y el consentimiento
  // pendiente cuenta como «procesando», no como un fallo.
  for (const [status, expected] of [
    ['completed', 'ready'],
    ['pending_consent', 'processing'],
    ['failed', 'failed'],
    ['paused', undefined],
  ]) {
    assert.equal(
      toHeyGenAvatarGroup({ ...privateGroup, status }).status,
      expected,
      status,
    )
  }
})

test('toHeyGenAvatarGroup: lo opcional se omite, el conteo inválido es 0 y sin id o nombre no hay avatar', () => {
  const minimal = { groupId: 'g', name: 'N', looksCount: 0 }
  assert.deepEqual(toHeyGenAvatarGroup({ id: 'g', name: 'N' }), minimal)
  // Vistas previas, género y estado nulos, vacíos o de otro tipo no dejan clave.
  assert.deepEqual(
    toHeyGenAvatarGroup({
      id: 'g',
      name: 'N',
      preview_image_url: null,
      preview_video_url: '',
      gender: 'robot',
      status: 5,
    }),
    minimal,
  )
  for (const looksCount of ['27', -1, 2.5, Number.NaN, Infinity, null, {}]) {
    assert.equal(
      toHeyGenAvatarGroup({ id: 'g', name: 'N', looks_count: looksCount })
        .looksCount,
      0,
      String(looksCount),
    )
  }
  assert.equal(
    toHeyGenAvatarGroup({ id: 'g', name: 'N', looks_count: 3 }).looksCount,
    3,
  )
  for (const raw of [
    null,
    undefined,
    'group',
    {},
    { id: 'g' },
    { name: 'N' },
    { id: '', name: 'N' },
    { id: 'g', name: '' },
    { id: 5, name: 'N' },
  ]) {
    assert.equal(toHeyGenAvatarGroup(raw), null, JSON.stringify(raw))
  }
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
    groupId: 'group-1',
    token: 'tok-1',
  })
  assert.equal(page.looks.length, 1)
  assert.equal(page.nextToken, 'tok-2')
  const url = new URL(calls[0].url)
  assert.equal(url.pathname, '/v3/avatars/looks')
  assert.equal(url.searchParams.get('ownership'), 'public')
  assert.equal(url.searchParams.get('avatar_type'), 'photo_avatar')
  assert.equal(url.searchParams.get('group_id'), 'group-1')
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

test('listLooks: un cuerpo sin data en forma de lista es avatar_provider_error', async (t) => {
  // Un solo fetch simulado que responde un cuerpo distinto en cada llamada.
  const bodies = [
    { data: null },
    { data: { id: 'x' } },
    { has_more: false },
    null,
  ]
  let call = 0
  mockFetch(t, async () => json(bodies[call++]))
  for (let index = 0; index < bodies.length; index++) {
    const error = await failure(client().listLooks({}))
    assert.equal(
      error.code,
      'avatar_provider_error',
      JSON.stringify(bodies[index]),
    )
    assert.equal(error.provider, 'heygen')
  }
})

test('listGroups: arma la consulta, mapea los avatares, salta los incompletos y manda la clave', async (t) => {
  const calls = []
  mockFetch(t, async (url, init) => {
    calls.push({ url: String(url), method: init.method, headers: init.headers })
    return json({
      data: [
        {
          id: 'group-2',
          name: 'Ana',
          preview_image_url: 'https://cdn.example/ana.png',
          gender: 'Man',
          looks_count: 2,
          status: 'processing',
        },
        // Sin nombre no hay con qué mostrarlo: se saltea sin tumbar la página.
        { id: 'group-3', looks_count: 4 },
      ],
      has_more: true,
      next_token: 'tok-2',
    })
  })
  const page = await client().listGroups({
    ownership: 'private',
    token: 'tok-1',
  })
  assert.deepEqual(page, {
    groups: [
      {
        groupId: 'group-2',
        name: 'Ana',
        previewImageUrl: 'https://cdn.example/ana.png',
        gender: 'male',
        looksCount: 2,
        status: 'processing',
      },
    ],
    nextToken: 'tok-2',
  })
  const url = new URL(calls[0].url)
  assert.equal(url.origin, 'https://api.heygen.com')
  assert.equal(url.pathname, '/v3/avatars')
  assert.equal(url.search, '?limit=50&ownership=private&token=tok-1')
  assert.equal(calls[0].method, 'GET')
  assert.equal(calls[0].headers['X-Api-Key'], 'key-123')
})

test('listGroups: sin filtros la consulta lleva solo el límite de página', async (t) => {
  let search
  mockFetch(t, async (url) => {
    search = new URL(String(url)).search
    return json({ data: [RAW_GROUP], has_more: false, next_token: null })
  })
  const page = await client().listGroups({})
  assert.equal(search, '?limit=50')
  assert.equal(page.groups.length, 1)
})

test('listGroups: sin has_more no hay página siguiente aunque llegue un token', async (t) => {
  mockFetch(t, async () =>
    json({ data: [RAW_GROUP], has_more: false, next_token: 'tok-9' }),
  )
  assert.equal((await client().listGroups({})).nextToken, null)
})

test('listGroups: un cuerpo sin data en forma de lista es avatar_provider_error, nunca un TypeError', async (t) => {
  const bodies = [
    { data: null },
    { data: { id: 'x' } },
    { has_more: false },
    null,
  ]
  let call = 0
  mockFetch(t, async () => json(bodies[call++]))
  for (let index = 0; index < bodies.length; index++) {
    const error = await failure(client().listGroups({}))
    assert.equal(
      error.code,
      'avatar_provider_error',
      JSON.stringify(bodies[index]),
    )
    assert.equal(error.provider, 'heygen')
  }
})

for (const method of ['listGroups', 'listLooks']) {
  test(`${method}: has_more sin un token de texto no vacío no produce cursor`, async (t) => {
    // Un solo fetch simulado que responde un cuerpo distinto en cada llamada.
    const bodies = [
      { data: [], has_more: true },
      { data: [], has_more: true, next_token: null },
      { data: [], has_more: true, next_token: 5 },
      { data: [], has_more: true, next_token: {} },
      // Un token vacío no se puede volver a mandar: el handler lo descartaría y
      // «Cargar más» pediría otra vez la primera página.
      { data: [], has_more: true, next_token: '' },
      { data: [], has_more: 'true', next_token: 'tok' },
      { data: [], has_more: 1, next_token: 'tok' },
    ]
    let call = 0
    mockFetch(t, async () => json(bodies[call++]))
    for (const body of bodies) {
      assert.equal(
        (await client()[method]({})).nextToken,
        null,
        JSON.stringify(body),
      )
    }
    assert.equal(call, bodies.length)
  })
}

test('getGroup: pide el avatar por su id y lo devuelve normalizado', async (t) => {
  const calls = []
  // Un solo fetch simulado: el primer pedido es un avatar público (HeyGen no
  // manda el género de los públicos) y el segundo uno propio.
  const bodies = [
    { data: { ...RAW_GROUP, gender: null } },
    {
      data: {
        id: 'group 2/ä',
        name: 'SEBAS AVATAR',
        gender: 'Man',
        looks_count: 3,
        status: 'completed',
      },
    },
  ]
  mockFetch(t, async (url, init) => {
    calls.push({ url: String(url), method: init.method, headers: init.headers })
    return json(bodies[calls.length - 1])
  })
  assert.deepEqual(await client().getGroup('group-1'), {
    groupId: 'group-1',
    name: 'Dante',
    previewImageUrl: 'https://cdn.example/dante.png',
    previewVideoUrl: 'https://cdn.example/dante.mp4',
    looksCount: 27,
  })
  assert.deepEqual(await client().getGroup('group 2/ä'), {
    groupId: 'group 2/ä',
    name: 'SEBAS AVATAR',
    gender: 'male',
    looksCount: 3,
    status: 'ready',
  })
  assert.equal(calls[0].url, 'https://api.heygen.com/v3/avatars/group-1')
  assert.equal(calls[0].method, 'GET')
  assert.equal(calls[0].headers['X-Api-Key'], 'key-123')
  // El id viaja codificado: no puede cambiar la ruta del pedido.
  assert.equal(
    calls[1].url,
    'https://api.heygen.com/v3/avatars/group%202%2F%C3%A4',
  )
})

test('getGroup: un avatar que HeyGen ya no tiene es avatar_not_found; lo demás sigue la clasificación', async (t) => {
  const responses = [
    json(
      {
        error: {
          code: 'avatar_not_found',
          message: 'Avatar group not found.',
          param: null,
        },
      },
      404,
    ),
    json({ error: { code: 'unauthorized', message: 'bad key' } }, 401),
    new Response('Internal Server Error', { status: 500 }),
    json({ data: { id: 'group-1' } }),
    json({ data: null }),
  ]
  let call = 0
  mockFetch(t, async () => responses[call++])
  const expected = [
    ['avatar_not_found', 404],
    ['avatar_invalid_key', 401],
    ['avatar_network', 500],
    // Un 200 sin nombre, o sin data, no es un avatar: nunca un TypeError.
    ['avatar_provider_error', undefined],
    ['avatar_provider_error', undefined],
  ]
  for (const [code, httpStatus] of expected) {
    const error = await failure(client().getGroup('group-1'))
    assert.equal(error.code, code, code)
    assert.equal(error.provider, 'heygen', code)
    assert.equal(error.httpStatus, httpStatus, code)
  }
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
    // Un reintento con la misma Idempotency-Key mientras el original sigue en
    // vuelo: «esperá y reintentá sin cambiar nada», no un pedido rechazado
    // (cambiar el prompt pagaría otro look). Otro 409 sigue siendo un rechazo.
    [
      409,
      '{"error":{"code":"request_in_progress","message":"retrying"}}',
      'avatar_rate_limited',
    ],
    [
      409,
      '{"error":{"code":"conflict","message":"already exists"}}',
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
    // Un código de moderación del sobre es moderación aunque el mensaje no
    // use ninguna de esas palabras (antes salía `avatar_invalid_request`).
    [
      400,
      '{"error":{"code":"avatar_not_usable","message":"This avatar cannot be used","param":null}}',
      'avatar_moderation_rejected',
    ],
    [
      422,
      '{"error":{"code":"content_policy_violation","message":"Request rejected","param":null}}',
      'avatar_moderation_rejected',
    ],
    // El `param` de look sigue mirándose antes, también ante un código así.
    [
      400,
      '{"error":{"code":"avatar_not_usable","message":"This avatar cannot be used","param":"avatar_id"}}',
      'avatar_look_unsupported',
    ],
    // Y en un 5xx el código no vuelve moderación a HeyGen caído.
    [
      503,
      '{"error":{"code":"avatar_consent_required","message":"Unavailable"}}',
      'avatar_network',
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

// Lo que responde `GET /v3/users/me` con la clave del dueño (sonda del
// 2026-10-09): billetera prepaga en dólares.
const RAW_ME = {
  username: 'user_abc123',
  email: null,
  first_name: null,
  last_name: null,
  billing_type: 'wallet',
  wallet: {
    currency: 'usd',
    remaining_balance: 3.68,
    auto_reload: { enabled: false },
  },
}

test('getBalance: lee el saldo de la billetera de GET /v3/users/me', async (t) => {
  const calls = []
  mockFetch(t, async (url, init) => {
    calls.push({ url: String(url), method: init.method, headers: init.headers })
    return json({ data: RAW_ME })
  })
  assert.deepEqual(await client().getBalance(), {
    available: true,
    remaining: 3.68,
    currency: 'usd',
  })
  assert.equal(calls[0].url, 'https://api.heygen.com/v3/users/me')
  assert.equal(calls[0].method, 'GET')
  assert.equal(calls[0].headers['X-Api-Key'], 'key-123')
})

test('getBalance: sin una billetera con un saldo que sirva, el saldo no está disponible', async (t) => {
  const wallet = RAW_ME.wallet
  const cases = [
    // Un plan de suscripción: sin billetera.
    [{ ...RAW_ME, billing_type: 'subscription', wallet: null }, null],
    [{ username: 'user_abc123' }, null],
    [{ ...RAW_ME, wallet: { ...wallet, remaining_balance: null } }, null],
    [{ ...RAW_ME, wallet: { ...wallet, remaining_balance: '3.68' } }, null],
    [{ ...RAW_ME, wallet: { ...wallet, remaining_balance: -1 } }, null],
    [{ ...RAW_ME, wallet: { ...wallet, remaining_balance: 'Infinity' } }, null],
    [{ ...RAW_ME, wallet: 'usd' }, null],
    // La moneda pasa en minúsculas si es una palabra (la OpenAPI admite
    // `credits`, que la vista no puede mostrar como dólares); sin ella, usd.
    [{ ...RAW_ME, wallet: { ...wallet, currency: 'credits' } }, 'credits'],
    [{ ...RAW_ME, wallet: { ...wallet, currency: 'USD' } }, 'usd'],
    [{ ...RAW_ME, wallet: { remaining_balance: 0 } }, 'usd'],
    [{ ...RAW_ME, wallet: { ...wallet, currency: 'US Dollar' } }, 'usd'],
    [{ ...RAW_ME, wallet: { ...wallet, currency: 5 } }, 'usd'],
  ]
  let call = 0
  mockFetch(t, async () => json({ data: cases[call++][0] }))
  for (const [data, currency] of cases) {
    const balance = await client().getBalance()
    if (currency === null) {
      assert.deepEqual(
        balance,
        { available: false, errorCode: 'avatar_balance_unavailable' },
        JSON.stringify(data),
      )
      continue
    }
    assert.equal(balance.available, true, JSON.stringify(data))
    assert.equal(balance.currency, currency, JSON.stringify(data))
  }
  assert.equal(call, cases.length)
})

test('getBalance: nunca lanza: la clave rechazada, la red o un cuerpo raro vuelven como no disponible', async (t) => {
  // Los reintentos del 429 esperan al instante, como en el test del 429.
  t.mock.method(globalThis, 'setTimeout', (callback) => setImmediate(callback))
  const responses = [
    () => json({ error: { code: 'unauthorized', message: 'bad key' } }, 401),
    () => json({ error: { code: 'forbidden', message: 'no' } }, 403),
    () => new Response('Internal Server Error', { status: 500 }),
    () => new Response('<html>', { status: 200 }),
    () => json({ data: null }),
    () => {
      throw new TypeError('fetch failed')
    },
    ...Array.from(
      { length: 4 },
      () => () =>
        json({ error: { code: 'rate_limited', message: 'slow' } }, 429),
    ),
  ]
  let call = 0
  mockFetch(t, async () => responses[call++]())
  for (const errorCode of [
    'avatar_invalid_key',
    'avatar_invalid_key',
    'avatar_network',
    'avatar_provider_error',
    'avatar_provider_error',
    'avatar_network',
    'avatar_rate_limited',
  ]) {
    assert.deepEqual(
      await client().getBalance(),
      { available: false, errorCode },
      errorCode,
    )
  }
  assert.equal(call, responses.length)
})

test('getBalance: una cancelación pedida por la persona no se disfraza de saldo no disponible', async (t) => {
  const controller = new AbortController()
  mockFetch(t, async (_url, init) => {
    controller.abort()
    init.signal.throwIfAborted()
  })
  const error = await failure(
    createHeyGenClient('key', controller.signal).getBalance(),
  )
  assert.equal(error.name, 'AbortError')
})

const PROMPT_LOOK_INPUT = {
  name: 'Cocina luminosa',
  prompt: 'En una cocina luminosa, con delantal y luz de mañana',
  avatarId: 'look-1',
  groupId: 'group-1',
  referenceAssetIds: ['asset-1', 'asset-2'],
  aspectRatio: '9:16',
  idempotencyKey: 'vimo-avatar-look-abc',
}

test('createPromptLook: cuerpo exacto con type prompt, referencias como asset_id y Idempotency-Key', async (t) => {
  let received
  mockFetch(t, async (url, init) => {
    received = {
      url: String(url),
      method: init.method,
      headers: init.headers,
      body: JSON.parse(init.body),
    }
    return json({
      data: {
        avatar_item: {
          ...RAW_LOOK,
          id: 'look-9',
          name: 'Cocina luminosa',
          status: 'processing',
        },
        avatar_group: { id: 'group-1', name: 'Ana' },
      },
    })
  })
  const created = await client().createPromptLook(PROMPT_LOOK_INPUT)
  assert.equal(received.url, 'https://api.heygen.com/v3/avatars')
  assert.equal(received.method, 'POST')
  assert.equal(received.headers['Content-Type'], 'application/json')
  assert.equal(received.headers['Idempotency-Key'], 'vimo-avatar-look-abc')
  assert.equal(received.headers['X-Api-Key'], 'key-123')
  assert.deepEqual(received.body, {
    type: 'prompt',
    name: 'Cocina luminosa',
    prompt: 'En una cocina luminosa, con delantal y luz de mañana',
    avatar_id: 'look-1',
    avatar_group_id: 'group-1',
    reference_images: [
      { type: 'asset_id', asset_id: 'asset-1' },
      { type: 'asset_id', asset_id: 'asset-2' },
    ],
    aspect_ratio: '9:16',
  })
  assert.equal(created.look.lookId, 'look-9')
  assert.equal(created.look.status, 'processing')
  assert.equal(created.groupId, 'group-1')
})

test('createPromptLook: sin referencias no manda el campo, auto viaja tal cual y la respuesta puede traer solo el grupo', async (t) => {
  const bodies = []
  const responses = [
    { avatar_item: null, avatar_group: { id: 'group-1', name: 'Ana' } },
    { avatar_item: null, avatar_group: null },
  ]
  mockFetch(t, async (_url, init) => {
    bodies.push(JSON.parse(init.body))
    return json({ data: responses[bodies.length - 1] })
  })
  const pending = await client().createPromptLook({
    ...PROMPT_LOOK_INPUT,
    referenceAssetIds: [],
    aspectRatio: 'auto',
  })
  assert.deepEqual(pending, { look: null, groupId: 'group-1' })
  assert.equal('reference_images' in bodies[0], false)
  assert.equal(bodies[0].aspect_ratio, 'auto')
  // Ni look ni grupo: no hay cómo seguir lo que se pidió.
  const error = await failure(client().createPromptLook(PROMPT_LOOK_INPUT))
  assert.equal(error.code, 'avatar_provider_error')
  assert.equal(error.provider, 'heygen')
})

// `GET /v3/videos/{id}` de un render terminado, con la forma de las sondas
// pagas del 2026-10-10 (7 s de audio → 7,000 s de video) y los campos que Vimo
// ignora (`created_at`, `thumbnail_url`, `video_page_url`).
const RAW_VIDEO = {
  id: 'video-1',
  title: 'vimo:mi-video:scene-3:ab12cd34',
  status: 'completed',
  created_at: 1791600000,
  completed_at: 1791600060,
  video_url: 'https://files.heygen.ai/video/video-1.mp4?Expires=1',
  thumbnail_url: 'https://files.heygen.ai/thumb/video-1.jpg',
  duration: 7,
  video_page_url: 'https://app.heygen.com/videos/video-1',
}

const VIDEO_INPUT = {
  lookId: 'look-1',
  engine: 'avatar_iii',
  audioAssetId: 'asset-audio',
  aspectRatio: '16:9',
  title: 'vimo:mi-video:scene-3:ab12cd34',
  idempotencyKey: 'vimo-avatar-video-0123456789abcdef0123456789abcdef',
}

test('createVideo: cuerpo exacto del render, sin fondo ni fit, con título e Idempotency-Key', async (t) => {
  let received
  mockFetch(t, async (url, init) => {
    received = {
      url: String(url),
      method: init.method,
      headers: init.headers,
      body: JSON.parse(init.body),
    }
    return json({
      data: { video_id: 'video-1', status: 'waiting', output_format: 'mp4' },
    })
  })
  assert.equal(await client().createVideo(VIDEO_INPUT), 'video-1')
  assert.equal(received.url, 'https://api.heygen.com/v3/videos')
  assert.equal(received.method, 'POST')
  assert.equal(received.headers['Content-Type'], 'application/json')
  assert.equal(received.headers['X-Api-Key'], 'key-123')
  assert.equal(received.headers['Idempotency-Key'], VIDEO_INPUT.idempotencyKey)
  // Decisión del dueño del 2026-10-10: el clip ES la escena, con el fondo
  // propio del look. Vimo no manda fondo, ni recorte, ni encuadre.
  assert.deepEqual(received.body, {
    type: 'avatar',
    title: 'vimo:mi-video:scene-3:ab12cd34',
    avatar_id: 'look-1',
    audio_asset_id: 'asset-audio',
    engine: { type: 'avatar_iii' },
    aspect_ratio: '16:9',
    resolution: '1080p',
    output_format: 'mp4',
  })
  for (const key of ['background', 'remove_background', 'fit'])
    assert.equal(key in received.body, false, key)
})

test('createVideo: el formato del proyecto viaja tal cual: un proyecto vertical pide 9:16', async (t) => {
  const bodies = []
  mockFetch(t, async (_url, init) => {
    bodies.push(JSON.parse(init.body))
    return json({ data: { video_id: 'video-2', status: 'waiting' } })
  })
  assert.equal(
    await client().createVideo({ ...VIDEO_INPUT, aspectRatio: '9:16' }),
    'video-2',
  )
  assert.equal(bodies[0].aspect_ratio, '9:16')
  assert.equal('background' in bodies[0], false)
})

test('createVideo: un 409 request_in_progress se repite con la MISMA clave y, agotado, queda como avatar_rate_limited; otro 409 no se repite', async (t) => {
  // Las esperas de 2, 4 y 8 s se cumplen al instante, pero quedan anotadas.
  const waits = []
  t.mock.method(globalThis, 'setTimeout', (callback, ms) => {
    waits.push(ms)
    return setImmediate(callback)
  })
  const inProgress = () =>
    json(
      {
        error: {
          code: 'request_in_progress',
          message:
            'A request with this Idempotency-Key is already in progress. Retry shortly.',
          param: null,
        },
      },
      409,
    )
  // Un solo fetch simulado por test, con la cola de los tres pedidos: el
  // primero sale al tercer intento, el segundo agota los reintentos y el
  // tercero es otro 409 (el look todavía se procesa), que no se repite.
  const responses = [
    inProgress,
    inProgress,
    () => json({ data: { video_id: 'video-1', status: 'waiting' } }),
    inProgress,
    inProgress,
    inProgress,
    inProgress,
    () =>
      json(
        {
          error: {
            code: 'resource_not_ready',
            message:
              'This avatar is still processing. Wait for avatar creation to complete, then try again.',
            param: null,
          },
        },
        409,
      ),
  ]
  const keys = []
  const bodies = []
  mockFetch(t, async (_url, init) => {
    keys.push(init.headers['Idempotency-Key'])
    bodies.push(init.body)
    return responses[keys.length - 1]()
  })
  assert.equal(await client().createVideo(VIDEO_INPUT), 'video-1')
  assert.deepEqual(keys, [
    VIDEO_INPUT.idempotencyKey,
    VIDEO_INPUT.idempotencyKey,
    VIDEO_INPUT.idempotencyKey,
  ])
  assert.deepEqual(waits.splice(0), [2000, 4000])

  const error = await failure(client().createVideo(VIDEO_INPUT))
  assert.equal(error.code, 'avatar_rate_limited')
  assert.equal(error.httpStatus, 409)
  // El primero y tres repeticiones (7 llamadas con las 3 de arriba), a los 2,
  // 4 y 8 s; ninguna con otra clave ni con otro cuerpo.
  assert.equal(keys.length, 7)
  assert.deepEqual(waits.splice(0), [2000, 4000, 8000])
  assert.ok(keys.every((key) => key === VIDEO_INPUT.idempotencyKey))
  assert.ok(bodies.every((body) => body === bodies[0]))

  const notReady = await failure(client().createVideo(VIDEO_INPUT))
  assert.equal(notReady.code, 'avatar_invalid_request')
  assert.equal(notReady.httpStatus, 409)
  assert.equal(keys.length, 8)
  assert.deepEqual(waits, [])
})

test('createVideo: un rechazo que llega después de un 409 request_in_progress sale marcado (sawRequestInProgress); sin ese 409, no', async (t) => {
  t.mock.method(globalThis, 'setTimeout', (callback) => setImmediate(callback))
  const inProgress = () =>
    json(
      {
        error: {
          code: 'request_in_progress',
          message:
            'A request with this Idempotency-Key is already in progress. Retry shortly.',
          param: null,
        },
      },
      409,
    )
  const engine = () =>
    json(
      {
        error: {
          code: 'invalid_parameter',
          message: 'Engine not allowed for this avatar',
          param: 'engine',
        },
      },
      400,
    )
  const credits = () =>
    json(
      { error: { code: 'insufficient_credit', message: 'Not enough credit' } },
      402,
    )
  // Tres pedidos: 409 → 400; 409 → 402; y un 400 directo.
  const responses = [inProgress, engine, inProgress, credits, engine]
  let posts = 0
  mockFetch(t, async () => responses[posts++]())

  const afterInFlight = await failure(client().createVideo(VIDEO_INPUT))
  assert.ok(afterInFlight instanceof HeyGenFailure)
  assert.equal(afterInFlight.code, 'avatar_look_unsupported')
  assert.equal(afterInFlight.httpStatus, 400)
  assert.equal(afterInFlight.param, 'engine')
  assert.equal(afterInFlight.sawRequestInProgress, true)

  const creditsAfterInFlight = await failure(client().createVideo(VIDEO_INPUT))
  assert.equal(creditsAfterInFlight.code, 'avatar_insufficient_credits')
  assert.equal(creditsAfterInFlight.sawRequestInProgress, true)

  const direct = await failure(client().createVideo(VIDEO_INPUT))
  assert.equal(direct.code, 'avatar_look_unsupported')
  assert.equal(direct.sawRequestInProgress, false)
  assert.equal(posts, 5)
})

test('createVideo: el 409 request_in_progress agotado también sale marcado', async (t) => {
  t.mock.method(globalThis, 'setTimeout', (callback) => setImmediate(callback))
  let posts = 0
  mockFetch(t, async () => {
    posts++
    return json(
      {
        error: {
          code: 'request_in_progress',
          message: 'still in progress',
          param: null,
        },
      },
      409,
    )
  })
  const error = await failure(client().createVideo(VIDEO_INPUT))
  assert.equal(error.code, 'avatar_rate_limited')
  assert.equal(error.httpStatus, 409)
  assert.equal(error.sawRequestInProgress, true)
  assert.equal(posts, 4)
})

test('createVideo: un 429 que request() ya agotó no se vuelve a repetir', async (t) => {
  // request() repite el 429 tres veces (las esperas se cumplen al instante) y,
  // agotado, sale avatar_rate_limited con status 429: no es el 409 de un
  // pedido en vuelo, así que createVideo no lo repite (serían hasta 16 POST).
  t.mock.method(globalThis, 'setTimeout', (callback) => setImmediate(callback))
  let posts = 0
  mockFetch(t, async () => {
    posts++
    return json(
      {
        error: {
          code: 'rate_limit_exceeded',
          message:
            'Too many requests. Retry after the duration specified in the Retry-After header.',
          param: null,
        },
      },
      429,
    )
  })
  const error = await failure(client().createVideo(VIDEO_INPUT))
  assert.equal(error.code, 'avatar_rate_limited')
  assert.equal(error.httpStatus, 429)
  assert.equal(posts, 4)
})

test('createVideo: cancelar durante la espera del 409 sale como AbortError, sin repetir el POST', async (t) => {
  // La persona cancela mientras HeyGen todavía procesa el pedido original: el
  // carril tiene que ver una cancelación, no un fallo de HeyGen que lo lleve a
  // marcar el intento como resuelto. La cancelación cae en plena espera (el
  // `setTimeout` de la espera es el que aborta), después de leer el 409: así
  // el corte es el de la espera y no el de la lectura del cuerpo.
  const controller = new AbortController()
  t.mock.method(globalThis, 'setTimeout', (callback) => {
    controller.abort()
    return setImmediate(callback)
  })
  let calls = 0
  mockFetch(t, async () => {
    calls++
    return json(
      {
        error: {
          code: 'request_in_progress',
          message:
            'A request with this Idempotency-Key is already in progress. Retry shortly.',
          param: null,
        },
      },
      409,
    )
  })
  const error = await failure(
    createHeyGenClient('key-123', controller.signal).createVideo(VIDEO_INPUT),
  )
  assert.equal(error.name, 'AbortError')
  assert.equal(calls, 1)
})

test('createVideo: una cancelación que llega mientras se lee el cuerpo sale como AbortError, no como fallo de HeyGen', async (t) => {
  // undici corta el cuerpo de un fetch con el mismo signal. Acá el cuerpo
  // nunca termina solo y falla al abortar, y la persona cancela apenas
  // llegaron los encabezados. Antes salían un 200 como avatar_provider_error,
  // un 409 como avatar_invalid_request 409 (para el carril, «HeyGen dijo que
  // no») y un 500 como avatar_network.
  const cases = [200, 409, 500].map((status) => ({
    status,
    controller: new AbortController(),
  }))
  let posts = 0
  mockFetch(t, async (_url, init) => {
    const { status, controller } = cases[posts++]
    const body = new ReadableStream({
      start(stream) {
        init.signal.addEventListener('abort', () =>
          stream.error(init.signal.reason),
        )
      },
    })
    setImmediate(() => controller.abort())
    return new Response(body, { status })
  })
  for (const { status, controller } of cases) {
    const error = await failure(
      createHeyGenClient('key-123', controller.signal).createVideo(VIDEO_INPUT),
    )
    assert.equal(error.name, 'AbortError', String(status))
  }
  assert.equal(posts, cases.length)
})

test('createVideo: sin look, sin audio o con una Idempotency-Key que HeyGen no acepta, el pedido no sale', async (t) => {
  let posts = 0
  mockFetch(t, async () => {
    posts++
    return json({ data: { video_id: 'video-1', status: 'waiting' } })
  })
  const invalid = [
    ['sin look', { lookId: '' }],
    ['sin audio', { audioAssetId: '' }],
    ['audio de otro tipo', { audioAssetId: 5 }],
    ['clave vacía', { idempotencyKey: '' }],
    ['clave con espacios', { idempotencyKey: 'vimo avatar video' }],
    ['clave de 256 caracteres', { idempotencyKey: 'k'.repeat(256) }],
    // RegExp.test convierte un arreglo en texto: el tipo se mira antes.
    ['clave en un arreglo', { idempotencyKey: ['vimo-avatar-video-1'] }],
  ]
  for (const [label, change] of invalid) {
    const error = await failure(
      client().createVideo({ ...VIDEO_INPUT, ...change }),
    )
    assert.equal(error.code, 'invalid_payload', label)
    // Un error local: no hubo pedido a HeyGen, así que no lleva proveedor ni
    // status.
    assert.equal(error.provider, undefined, label)
    assert.equal(error.httpStatus, undefined, label)
  }
  assert.equal(posts, 0)

  // La clave más larga que HeyGen acepta, con todo su alfabeto, sí sale.
  const longest = 'Az09_-:.'.padEnd(255, 'x')
  assert.equal(
    await client().createVideo({ ...VIDEO_INPUT, idempotencyKey: longest }),
    'video-1',
  )
  assert.equal(posts, 1)
})

test('createVideo: un 200 sin video_id es avatar_provider_error y un 400 de look conserva el campo que HeyGen rechazó', async (t) => {
  const responses = [
    () => json({ data: { status: 'waiting' } }),
    () =>
      json(
        {
          error: {
            code: 'invalid_parameter',
            message: 'Engine not allowed for this avatar',
            param: 'engine',
          },
        },
        400,
      ),
    () =>
      json(
        {
          error: {
            code: 'invalid_parameter',
            message:
              'Exactly one visual source required: avatar_id, image_url, or image_asset_id.',
            param: 'avatar_id',
          },
        },
        400,
      ),
    () =>
      json(
        {
          error: {
            code: 'avatar_not_usable',
            message:
              'This avatar cannot be used because it did not pass content moderation.',
            param: null,
          },
        },
        400,
      ),
  ]
  let call = 0
  mockFetch(t, async () => responses[call++]())
  const malformed = await failure(client().createVideo(VIDEO_INPUT))
  assert.equal(malformed.code, 'avatar_provider_error')
  assert.equal(malformed.provider, 'heygen')

  // «not allowed» en el mensaje no lo vuelve moderación: el `param` manda, y
  // queda en el fallo para saber si HeyGen rechazó el motor o el look.
  const engine = await failure(client().createVideo(VIDEO_INPUT))
  assert.ok(engine instanceof HeyGenFailure)
  assert.equal(engine.code, 'avatar_look_unsupported')
  assert.equal(engine.httpStatus, 400)
  assert.equal(engine.param, 'engine')

  const look = await failure(client().createVideo(VIDEO_INPUT))
  assert.equal(look.code, 'avatar_look_unsupported')
  assert.equal(look.param, 'avatar_id')

  const moderated = await failure(client().createVideo(VIDEO_INPUT))
  assert.equal(moderated.code, 'avatar_moderation_rejected')
  assert.equal(moderated.param, null)
  assert.equal(call, 4)
})

test('getVideo: pide el render por su id y lo devuelve normalizado, con el fallo de HeyGen tal cual', async (t) => {
  const responses = [
    () => json({ data: { ...RAW_VIDEO } }),
    () => json({ data: { id: 'video/2', status: 'waiting' } }),
    () =>
      json({
        data: {
          id: 'video-3',
          status: 'failed',
          video_url: null,
          duration: null,
          failure_code: 'rendering_failed',
          failure_message: 'Avatar rendering timed out',
        },
      }),
    () => json({ data: { id: 'video-4', status: 'exploded' } }),
    () =>
      json(
        {
          error: {
            code: 'not_found',
            message: 'Video not found',
            param: null,
          },
        },
        404,
      ),
  ]
  const urls = []
  mockFetch(t, async (url) => {
    urls.push(String(url))
    return responses[urls.length - 1]()
  })
  assert.deepEqual(await client().getVideo('video-1'), {
    videoId: 'video-1',
    title: 'vimo:mi-video:scene-3:ab12cd34',
    status: 'completed',
    videoUrl: 'https://files.heygen.ai/video/video-1.mp4?Expires=1',
    durationSeconds: 7,
  })
  // `waiting` (lo que devuelve el POST) es `pending` para Vimo.
  assert.deepEqual(await client().getVideo('video/2'), {
    videoId: 'video/2',
    status: 'pending',
  })
  assert.deepEqual(await client().getVideo('video-3'), {
    videoId: 'video-3',
    status: 'failed',
    failureCode: 'rendering_failed',
    failureMessage: 'Avatar rendering timed out',
  })
  const unknown = await failure(client().getVideo('video-4'))
  assert.equal(unknown.code, 'avatar_provider_error')
  // Un 404 conserva su status: con él el carril deja el intento `ambiguous`
  // en vez de darlo por perdido (diseño §7.2).
  const missing = await failure(client().getVideo('video-5'))
  assert.ok(missing instanceof HeyGenFailure)
  assert.equal(missing.code, 'avatar_invalid_request')
  assert.equal(missing.httpStatus, 404)
  assert.equal(urls[0], 'https://api.heygen.com/v3/videos/video-1')
  assert.equal(urls[1], 'https://api.heygen.com/v3/videos/video%2F2')
  assert.equal(urls.length, 5)
})

test('listVideos: busca por título con la página máxima, conserva un render con un estado desconocido si tiene id y título, salta los incompletos y pagina solo con has_more', async (t) => {
  const calls = []
  const pages = [
    {
      data: [
        RAW_VIDEO,
        // Un estado que Vimo no conoce (otros listados de HeyGen dicen
        // `queued`): con id y título, la recuperación por título lo necesita.
        { id: 'video-queued', title: `${RAW_VIDEO.title}-q`, status: 'queued' },
        // Sin título, o sin id, no sirve para nada.
        { id: 'y', status: 'queued' },
        { id: 'x' },
        { status: 'completed' },
      ],
      has_more: true,
      next_token: 'tok-2',
    },
    { data: [], has_more: false, next_token: 'tok-3' },
    { data: { videos: [] } },
  ]
  mockFetch(t, async (url, init) => {
    calls.push({ url: new URL(String(url)), method: init.method })
    return json(pages[calls.length - 1])
  })
  const first = await client().listVideos({
    title: RAW_VIDEO.title,
    token: 'tok-1',
  })
  assert.deepEqual(
    first.videos.map((video) => [video.videoId, video.status]),
    [
      ['video-1', 'completed'],
      ['video-queued', undefined],
    ],
  )
  assert.deepEqual(first.videos[1], {
    videoId: 'video-queued',
    title: `${RAW_VIDEO.title}-q`,
  })
  assert.equal(first.nextToken, 'tok-2')
  assert.equal(calls[0].url.pathname, '/v3/videos')
  assert.equal(calls[0].method, 'GET')
  assert.equal(calls[0].url.searchParams.get('limit'), '100')
  assert.equal(calls[0].url.searchParams.get('title'), RAW_VIDEO.title)
  assert.equal(calls[0].url.searchParams.get('token'), 'tok-1')

  const last = await client().listVideos({})
  assert.equal(last.nextToken, null)
  assert.equal(calls[1].url.search, '?limit=100')

  const malformed = await failure(client().listVideos({}))
  assert.equal(malformed.code, 'avatar_provider_error')
})

test('toHeyGenVideo: sin id o con un estado desconocido no hay video; la duración solo si es un número positivo', () => {
  assert.equal(toHeyGenVideo(null), null)
  assert.equal(toHeyGenVideo({ status: 'completed' }), null)
  assert.equal(toHeyGenVideo({ id: 'v', status: 'constructor' }), null)
  assert.deepEqual(toHeyGenVideo({ id: 'v', status: 'processing' }), {
    videoId: 'v',
    status: 'processing',
  })
  for (const duration of [0, -2, Infinity, '7', null])
    assert.equal(
      'durationSeconds' in
        toHeyGenVideo({ id: 'v', status: 'completed', duration }),
      false,
      String(duration),
    )
})

test('heygenVideoFailure: saldo, moderación y el resto de un render fallido (diseño §14)', () => {
  const cases = [
    [
      'insufficient_credit',
      'Your account has 5 credits but this video requires 10 credits.',
      'avatar_insufficient_credits',
    ],
    [
      'content_policy_violation',
      'Content rejected',
      'avatar_moderation_rejected',
    ],
    [
      'avatar_not_usable',
      'This avatar cannot be used',
      'avatar_moderation_rejected',
    ],
    [
      'internal_error',
      'Video rejected by our usage policy',
      'avatar_moderation_rejected',
    ],
    ['rendering_failed', 'Avatar rendering timed out', 'avatar_render_failed'],
    [undefined, undefined, 'avatar_render_failed'],
  ]
  for (const [failureCode, failureMessage, code] of cases) {
    const error = heygenVideoFailure(failureCode, failureMessage)
    assert.equal(error.code, code, `${failureCode} ${failureMessage}`)
    assert.equal(error.provider, 'heygen')
    // El pedido fue aceptado: un render fallido no trae status HTTP.
    assert.equal(error.httpStatus, undefined)
  }
  assert.ok(
    INSUFFICIENT_CREDITS_CODES.has(
      heygenVideoFailure('insufficient_credit', '').code,
    ),
  )
})

test('errores de los renders: el 402 de HeyGen, el 409 resource_not_ready y el param conservado (o null)', () => {
  const credit = heygenFailure(
    402,
    '{"error":{"code":"insufficient_credit","message":"Your account has 5 credits but this video requires 10 credits."}}',
  )
  assert.ok(credit instanceof HeyGenFailure)
  assert.equal(credit.code, 'avatar_insufficient_credits')
  assert.equal(credit.param, null)
  const notReady = heygenFailure(
    409,
    '{"error":{"code":"resource_not_ready","message":"This avatar is still processing.","param":null}}',
  )
  assert.equal(notReady.code, 'avatar_invalid_request')
  assert.equal(notReady.httpStatus, 409)
  const proxy = heygenFailure(502, '<html>Bad gateway</html>')
  assert.equal(proxy.code, 'avatar_network')
  assert.equal(proxy.param, null)
  const name = heygenFailure(
    400,
    '{"error":{"code":"invalid_parameter","message":"title too long","param":"title"}}',
  )
  assert.equal(name.code, 'avatar_invalid_request')
  assert.equal(name.param, 'title')
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

// Un look guardado en la metadata de un avatar (modelo de la entrega 1b).
const STORED_LOOK = {
  lookId: 'look-1',
  name: 'Ana',
  lookType: 'photo_avatar',
  supportedEngines: ['avatar_iv', 'avatar_iii'],
  status: 'ready',
  origin: 'heygen',
  createdAt: '2026-10-09T01:00:00.000Z',
}

const look = (lookId, overrides = {}) => ({
  ...STORED_LOOK,
  lookId,
  name: lookId,
  ...overrides,
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
    groupId: 'group-1',
    ownership: 'own',
    status: 'processing',
    mainLookId: null,
    looks: [],
    previewFile,
    createdAt: '2026-10-09T01:00:00.000Z',
  })
  const stored = await readAvatarMetadata(first)
  assert.equal(stored.name, 'Ana')
  assert.equal(stored.groupId, 'group-1')
  assert.equal(
    (await readFile(join(first, 'metadata.json'), 'utf8')).endsWith('\n'),
    true,
  )

  const second = join(avatarsDirectory, 'bob-bbbbbb')
  await mkdir(second, { recursive: true })
  await writeAvatarMetadata(second, {
    name: 'Bob',
    groupId: 'group-2',
    ownership: 'stock',
    status: 'ready',
    mainLookId: 'look-2',
    looks: [look('look-2', { lookType: 'studio_avatar' })],
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
        groupId: 'group-3',
        ownership: 'stock',
        status: 'ready',
        mainLookId: null,
        looks: [],
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

test('biblioteca: la metadata de la entrega 1 se reconoce y una sin grupo o sin looks no es un avatar', () => {
  const base = {
    name: 'Ana',
    groupId: 'group-1',
    ownership: 'own',
    status: 'ready',
    mainLookId: 'look-1',
    looks: [STORED_LOOK],
    createdAt: '2026-10-09T01:00:00.000Z',
  }
  assert.equal(parseAvatarMetadata(base).state, 'valid')
  // La entrega 1 guardaba un look por entrada: `lookId` suelto y sin `looks`.
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
  assert.deepEqual(parseAvatarMetadata(legacy), { state: 'legacy' })
  assert.deepEqual(parseAvatarMetadata({ ...legacy, lookId: null }), {
    state: 'legacy',
  })
  // Con `looks` en forma de lista manda el modelo nuevo, aunque sobre un
  // `lookId` suelto.
  assert.equal(parseAvatarMetadata({ ...base, lookId: 'x' }).state, 'valid')
  for (const raw of [
    null,
    'avatar',
    [],
    { ...base, name: '' },
    { ...base, createdAt: 5 },
    { ...base, groupId: undefined },
    { ...base, groupId: '' },
    { ...base, looks: 'look-1' },
    { ...base, looks: undefined },
    // Sin nombre, ni la de la entrega 1 cuenta como avatar.
    { ...legacy, name: undefined },
  ]) {
    assert.deepEqual(
      parseAvatarMetadata(raw),
      { state: 'invalid' },
      JSON.stringify(raw),
    )
  }
})

test('biblioteca: el look principal sirve si está listo y soporta Avatar III', () => {
  assert.equal(isUsableLook({ supportedEngines: ['avatar_iii'] }), true)
  assert.equal(
    isUsableLook({
      status: 'ready',
      supportedEngines: ['avatar_iv', 'avatar_iii'],
    }),
    true,
  )
  assert.equal(isUsableLook({ supportedEngines: ['avatar_iv'] }), false)
  assert.equal(
    isUsableLook({ status: 'processing', supportedEngines: ['avatar_iii'] }),
    false,
  )
  assert.equal(
    isUsableLook({ status: 'failed', supportedEngines: ['avatar_iii'] }),
    false,
  )

  const looks = [
    look('iv-only', { supportedEngines: ['avatar_iv'] }),
    look('training', { status: 'processing' }),
    look('usable'),
    look('usable-2'),
  ]
  // El que estaba sigue siendo el principal mientras exista, aunque no sirva.
  assert.equal(pickMainLookId(looks, 'usable-2'), 'usable-2')
  assert.equal(pickMainLookId(looks, 'training'), 'training')
  // Si desapareció (o no había), el primero listo y compatible.
  assert.equal(pickMainLookId(looks, 'gone'), 'usable')
  assert.equal(pickMainLookId(looks, null), 'usable')
  // Sin ninguno compatible, el primero listo; sin ninguno listo, ninguno.
  assert.equal(pickMainLookId(looks.slice(0, 2), null), 'iv-only')
  assert.equal(pickMainLookId([looks[1]], null), null)
  assert.equal(pickMainLookId([], 'gone'), null)
})

test('biblioteca: el estado del avatar sale de su look principal y del entrenamiento del grupo', () => {
  const ready = look('ready')
  const training = look('training', { status: 'processing' })
  const failed = look('failed', { status: 'failed' })
  const cases = [
    [[ready], 'ready', undefined, { status: 'ready' }],
    // El principal listo manda aunque el grupo diga otra cosa.
    [[ready], 'ready', 'processing', { status: 'ready' }],
    [
      [failed],
      'failed',
      undefined,
      { status: 'failed', errorCode: 'avatar_training_failed' },
    ],
    [
      [],
      null,
      'failed',
      { status: 'failed', errorCode: 'avatar_training_failed' },
    ],
    [[training], 'training', undefined, { status: 'processing' }],
    // Un avatar desde foto recién creado: sin looks, el grupo entrena.
    [[], null, 'processing', { status: 'processing' }],
    // Sin principal pero con un look en camino (uno generado).
    [[training], null, undefined, { status: 'processing' }],
    // Nada listo ni en camino: no hay look que sirva (código de la
    // biblioteca; `avatar_look_unsupported` es el 400 de HeyGen).
    [
      [],
      null,
      undefined,
      { status: 'failed', errorCode: 'avatar_no_compatible_look' },
    ],
  ]
  for (const [looks, mainLookId, groupStatus, expected] of cases) {
    assert.deepEqual(
      avatarStatusOf(looks, mainLookId, groupStatus),
      expected,
      `${mainLookId} ${groupStatus}`,
    )
  }
})

test('biblioteca: la tarjeta baja la vista previa del principal y de los dos siguientes que tienen', () => {
  const looks = ['a', 'b', 'c', 'd', 'e'].map((lookId) => ({ lookId }))
  const all = () => true
  assert.deepEqual(cardLookIds(looks, 'c', all), ['c', 'a', 'b'])
  // Los que no tienen vista previa (en disco o para bajar) no ocupan lugar.
  assert.deepEqual(
    cardLookIds(looks, 'c', (lookId) => lookId !== 'a'),
    ['c', 'b', 'd'],
  )
  // Sin principal todavía: los tres primeros que tienen.
  assert.deepEqual(cardLookIds(looks, null, all), ['a', 'b', 'c'])
  assert.deepEqual(cardLookIds([], 'a', all), ['a'])
})

test('biblioteca: la vista previa de un look se guarda con su id y un id peligroso no escribe nada', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'vimo-avatar-looks-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const image = { bytes: PNG_HEAD, ext: 'png', mime: 'image/png' }
  assert.equal(await writeLookPreviewFile(root, 'lk_abc-123', image), true)
  assert.equal(
    (await readFile(join(root, 'looks', 'lk_abc-123.png'))).equals(PNG_HEAD),
    true,
  )
  for (const lookId of ['../escape', 'a/b', 'a.b', '', 'x'.repeat(129)]) {
    assert.equal(await writeLookPreviewFile(root, lookId, image), false, lookId)
  }
  assert.deepEqual((await readdir(join(root, 'looks'))).sort(), [
    'lk_abc-123.png',
  ])
})

test('biblioteca: updateAvatarMetadata relee la última versión antes de escribir', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'vimo-avatar-update-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const metadata = {
    name: 'Ana',
    groupId: 'group-1',
    ownership: 'own',
    status: 'ready',
    mainLookId: 'look-1',
    looks: [STORED_LOOK],
    createdAt: '2026-10-09T01:00:00.000Z',
  }
  await writeAvatarMetadata(root, metadata)
  // Otro proceso suma un look después de que este leyó su copia.
  await writeAvatarMetadata(root, {
    ...metadata,
    looks: [look('look-2', { origin: 'vimo' }), STORED_LOOK],
  })
  const next = await updateAvatarMetadata(root, 'ana-aaaaaa', (current) => ({
    ...current,
    syncedAt: '2026-10-09T03:00:00.000Z',
  }))
  assert.deepEqual(
    next.looks.map((stored) => stored.lookId),
    ['look-2', 'look-1'],
  )
  assert.equal((await readAvatarMetadata(root)).syncedAt, next.syncedAt)

  const missing = await failure(
    updateAvatarMetadata(
      join(root, 'nadie'),
      'nadie-000000',
      (current) => current,
    ),
  )
  assert.equal(missing.code, 'avatar_not_found')
})

test('biblioteca: dos escrituras simultáneas de la misma metadata no chocan ni dejan temporales', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'vimo-avatar-concurrent-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const base = {
    name: 'Ana',
    groupId: 'group-1',
    ownership: 'own',
    status: 'ready',
    mainLookId: 'look-1',
    createdAt: '2026-10-09T01:00:00.000Z',
  }
  // Un refresco con muchos looks y una generación que guarda a la vez: con un
  // temporal fijo para todos, casi cada ronda dejaba un ENOENT (el primer
  // rename se llevaba el temporal del otro) o un JSON mezclado (el corto
  // escrito sobre la cola del largo), y el avatar desaparecía del listado.
  const long = {
    ...base,
    looks: Array.from({ length: 30 }, (_, index) => look(`look-${index + 1}`)),
  }
  const short = { ...base, looks: [STORED_LOOK] }
  for (let round = 0; round < 40; round++) {
    await Promise.all([
      writeAvatarMetadata(root, long),
      writeAvatarMetadata(root, short),
    ])
    const stored = await readAvatarMetadata(root)
    assert.ok(stored, `round ${round}: the metadata must parse`)
    assert.ok([1, 30].includes(stored.looks.length), `round ${round}`)
  }
  assert.deepEqual(await readdir(root), ['metadata.json'])
})

test('atomic-fs: si el rename o la escritura fallan, el temporal se borra y sale el error original', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'vimo-atomic-fs-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  // El destino es una carpeta con contenido: ningún rename puede reemplazarla.
  // Sale el error del rename, no otro armado después de limpiar.
  const target = join(root, 'metadata.json')
  await mkdir(join(target, 'occupied'), { recursive: true })
  const renameError = await failure(writeFileAtomic(target, '{}'))
  assert.equal(renameError.syscall, 'rename')
  assert.deepEqual(await readdir(root), ['metadata.json'])

  // Sin la carpeta falla la escritura del temporal, que no llega a existir: el
  // borrado del temporal (ENOENT) no tapa el error de la escritura.
  const writeError = await failure(
    writeFileAtomic(join(root, 'missing', 'metadata.json'), '{}'),
  )
  assert.equal(writeError.syscall, 'open')
  assert.equal(writeError.code, 'ENOENT')
  assert.deepEqual(await readdir(root), ['metadata.json'])
})

test('biblioteca: updateAvatarMetadata exige un cambio síncrono y, si no lo es, no escribe', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'vimo-avatar-sync-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const metadata = {
    name: 'Ana',
    groupId: 'group-1',
    ownership: 'own',
    status: 'ready',
    mainLookId: 'look-1',
    looks: [STORED_LOOK],
    createdAt: '2026-10-09T01:00:00.000Z',
  }
  await writeAvatarMetadata(root, metadata)
  const before = await readFile(join(root, 'metadata.json'), 'utf8')
  // Un cambio async metería E/S entre la relectura y la escritura (la ventana
  // en la que se perdía un look generado): se rechaza en vez de escribir `{}`.
  const error = await failure(
    updateAvatarMetadata(root, 'ana-aaaaaa', async (current) => ({
      ...current,
      syncedAt: '2026-10-09T03:00:00.000Z',
    })),
  )
  assert.ok(error instanceof TypeError)
  assert.equal(await readFile(join(root, 'metadata.json'), 'utf8'), before)
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

// Corre último (registro `node-test-doble-mock-del-mismo-metodo-deja-el-global-sucio`):
// si un test montó dos fetch simulados sin restaurar el primero, ese queda
// puesto como «original» y este test lo ve.
test('centinela: al terminar, fetch vuelve a ser el real', () => {
  assert.equal(globalThis.fetch, REAL_FETCH)
})
