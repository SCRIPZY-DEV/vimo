// `create-video-project` con un avatar presentador (ADR-0057, diseño §3.4,
// §6.2 y §9, cuidados 1 y 4 de §16): forma, rangos y enumerados de
// `options.avatar`; el avatar tiene que estar en la biblioteca y el look
// elegido (por defecto el principal, pero puede ser cualquier otro del avatar)
// tiene que ser suyo, estar listo con Avatar III (nunca deducido de
// `status: 'ready'`) y tener la orientación del video, porque HeyGen lo
// renderiza tal cual; un avatar cuyo grupo HeyGen ya no tiene se rechaza aunque
// sus looks sigan «listos»; la vista previa de ESE look se lee y se valida ANTES
// de crear la carpeta y se copia al proyecto con su extensión real (gana sobre
// la del avatar; si el look no tiene una legible, la propia del avatar; si
// tampoco, el proyecto no se crea); la clave de HeyGen se mira con UNA lectura
// gratis de la cuenta después de lo local y antes de crear nada (rechazada o
// ausente, no hay proyecto; HeyGen caído, lento o con un 429 avisa y sigue,
// con un plazo corto y sin reintentos; el saldo no frena); la
// demo no lleva avatar; y un proyecto sin avatar sale igual que siempre, sin
// hablar con HeyGen. También fija `lookOrientationFit`, la regla de
// orientación que Crear comparte con el sidecar, y que `types/avatar.ts` (la
// app importa sus valores) sigue browser-safe por toda su cadena de imports.
// Comando real con la biblioteca en una carpeta temporal y HeyGen simulado:
// sin red.
import assert from 'node:assert/strict'
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
import { fileURLToPath, pathToFileURL } from 'node:url'

import { findAvatarLookPreview } from '../../pipeline/avatar/clip-path.ts'
import { lookOrientationFit } from '../../pipeline/avatar/look-orientation.ts'
import { createVideoProject } from '../../pipeline/commands/videos/create-video-project.ts'
import { resolveProjectPaths } from '../../pipeline/project/paths.ts'
import {
  AVATAR_MAX_APPEARANCES,
  AVATAR_MAX_APPEARANCE_SECONDS,
  AVATAR_MIN_APPEARANCES,
  AVATAR_MIN_APPEARANCE_SECONDS,
} from '../../pipeline/types/avatar.ts'
import { ORIGINAL_FETCH, fakeHeyGen } from './avatar-fixture.mjs'

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFOsAAAAASUVORK5CYII=',
  'base64',
)
// Los primeros 12 bytes de un WEBP (RIFF….WEBP): `validateImageBytes` lo
// reconoce por ellos.
const WEBP = Buffer.from(
  'RIFF\u001a\u0000\u0000\u0000WEBPVP8 fixture',
  'latin1',
)
// Y los de un JPEG (FF D8 FF + al menos 9 bytes más).
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.from('fixture-jpeg'),
])
// Bytes que ninguna extensión de imagen reconoce.
const NOT_AN_IMAGE = Buffer.from('this is not an image file at all')
const AVATAR_ID = 'ana-abc123'
const AVATAR = {
  avatarId: AVATAR_ID,
  lookId: 'look-1',
  lookName: 'Ana en la cocina',
  lookType: 'photo_avatar',
  engine: 'avatar_iii',
  appearances: 3,
  secondsPerAppearance: 10,
  startWithAvatar: true,
  placement: 'auto',
}

// Un look de la biblioteca (entrega 1b), con lo que mira Crear.
function libraryLook(overrides = {}) {
  return {
    lookId: 'look-1',
    name: 'Ana en la cocina',
    lookType: 'photo_avatar',
    supportedEngines: ['avatar_iii'],
    preferredOrientation: 'landscape',
    status: 'ready',
    origin: 'vimo',
    createdAt: '2026-10-09T00:00:00.000Z',
    ...overrides,
  }
}
// Un avatar = un grupo con sus looks y un principal. Por defecto, el principal
// horizontal `look-1` y un segundo look vertical, `look-2`, cada uno con su
// vista previa (distintas, para saber cuál se copió).
const LOOKS = [
  libraryLook(),
  libraryLook({
    lookId: 'look-2',
    name: 'Ana parada',
    preferredOrientation: 'portrait',
  }),
]
// HeyGen simulado (el pre-vuelo lee la cuenta): UNO por test, aunque el test
// arme varias sesiones. Sin opciones devuelve el del test tal cual (para
// leer sus llamadas); con opciones, lo reusa con `reset`. Por defecto la
// cuenta responde con 10 USD.
const heygenByTest = new WeakMap()
function heygen(t, options) {
  const existing = heygenByTest.get(t)
  if (existing) {
    if (options) existing.reset(options)
    return existing
  }

  const fake = fakeHeyGen(t, options ?? {})
  heygenByTest.set(t, fake)
  return fake
}
const isAccountRead = (call) =>
  call.method === 'GET' && call.path === '/v3/users/me'

// `avatarPreview` es la vista previa propia del avatar (`preview.<ext>` en su
// carpeta, declarada en `previewFile`): `{ file, bytes }`, o `{ file }` sin
// bytes para declararla sin dejar el archivo en disco. `avatarMetadata` pisa
// campos de la metadata del avatar (su `status` y su `errorCode`, que la
// biblioteca deriva del look principal o de un refresco). Monta el HeyGen
// simulado del test.
async function session(
  t,
  {
    looks = LOOKS,
    previews = { 'look-1.png': PNG, 'look-2.webp': WEBP },
    avatarPreview,
    avatarMetadata = {},
  } = {},
) {
  heygen(t)
  const root = await mkdtemp(join(tmpdir(), 'vimo-avatar-create-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const entry = join(root, 'avatars', AVATAR_ID)
  await mkdir(join(entry, 'looks'), { recursive: true })
  await writeFile(
    join(entry, 'metadata.json'),
    JSON.stringify({
      name: 'Ana',
      groupId: 'group-1',
      ownership: 'own',
      status: 'ready',
      mainLookId: 'look-1',
      looks,
      ...(avatarPreview ? { previewFile: avatarPreview.file } : {}),
      createdAt: '2026-10-09T00:00:00.000Z',
      ...avatarMetadata,
    }),
  )
  for (const [file, bytes] of Object.entries(previews))
    await writeFile(join(entry, 'looks', file), bytes)
  if (avatarPreview?.bytes)
    await writeFile(join(entry, avatarPreview.file), avatarPreview.bytes)
  return root
}
function payload(options = {}) {
  return {
    name: 'Video con avatar',
    script: 'Hola, este es el guion del video.',
    options: {
      styleId: 'cartoon',
      narrationMode: 'tts',
      imageProvider: 'fal',
      sceneCount: 0,
      useBgm: false,
      useOverlay: false,
      confirmScenes: false,
      avatar: AVATAR,
      ...options,
    },
  }
}
// La clave de HeyGen del llavero viaja en todos los jobs (Rust vuelca el
// llavero entero): por defecto, una que el simulado acepta.
function create(root, body, apiKeys = { heygen: 'key-123' }) {
  const events = []
  const promise = createVideoProject({
    job: {
      jobId: 'fixture',
      apiKeys,
      binaryPaths: {},
      projectsRoot: root,
      payload: body,
    },
    signal: new AbortController().signal,
    emitter: {
      emit(event) {
        events.push(event)
      },
    },
  })
  return { promise, events }
}
async function storedOptions(projectDir) {
  return JSON.parse(await readFile(join(projectDir, 'project.json'), 'utf8'))
    .options
}
async function projectFolders(root) {
  return (await readdir(root)).filter((name) => name !== 'avatars')
}
function warned(events, pattern) {
  return events.some(
    (event) =>
      event.type === 'log' &&
      event.level === 'warn' &&
      pattern.test(event.message),
  )
}

test('crear con avatar: guarda las opciones validadas y copia la vista previa del look con su extensión', async (t) => {
  // El avatar tiene la suya (`preview.webp`, la cara del grupo), como casi todo
  // avatar de una biblioteca real: la del look elegido gana y sale sin avisos.
  const root = await session(t, {
    avatarPreview: { file: 'preview.webp', bytes: WEBP },
  })
  const { promise, events } = create(root, payload())
  const { projectId, projectDir } = await promise

  assert.deepEqual((await storedOptions(projectDir)).avatar, AVATAR)
  assert.equal(
    await findAvatarLookPreview(resolveProjectPaths(projectDir, projectId)),
    join(projectDir, 'avatar', 'look.png'),
  )
  assert.deepEqual(await readdir(join(projectDir, 'avatar')), ['look.png'])
  assert.deepEqual(await readFile(join(projectDir, 'avatar', 'look.png')), PNG)
  assert.deepEqual(events, [])
})

test('crear con avatar: un video 9:16 acepta un look vertical que no es el principal y copia la vista previa de ESE look, aunque el avatar tenga la suya', async (t) => {
  // La combinación común de una biblioteca real: el look elegido tiene su vista
  // previa (`look-2.webp`), el principal otra (`look-1.png`) y el avatar la
  // suya (`preview.jpg`). Gana la del look elegido: ni la del avatar ni la del
  // principal, y sin el aviso de respaldo.
  const root = await session(t, {
    avatarPreview: { file: 'preview.jpg', bytes: JPEG },
  })
  const { promise, events } = create(
    root,
    payload({
      avatar: { ...AVATAR, lookId: 'look-2', lookName: 'Ana parada' },
      videoFormat: '9:16',
    }),
  )
  const { projectDir } = await promise

  assert.equal((await storedOptions(projectDir)).avatar.lookId, 'look-2')
  assert.deepEqual(await readdir(join(projectDir, 'avatar')), ['look.webp'])
  assert.deepEqual(
    await readFile(join(projectDir, 'avatar', 'look.webp')),
    WEBP,
  )
  assert.deepEqual(events, [])
})

test('crear con avatar: el nombre del look sale de la biblioteca y un campo de más no se guarda', async (t) => {
  const root = await session(t)
  const { projectDir } = await create(
    root,
    payload({ avatar: { ...AVATAR, lookName: 'otro nombre', extra: 'x' } }),
  ).promise

  assert.deepEqual((await storedOptions(projectDir)).avatar, AVATAR)
})

test('crear con avatar: una vista previa WEBP del principal se copia como look.webp', async (t) => {
  const root = await session(t, { previews: { 'look-1.webp': WEBP } })
  const { projectDir } = await create(root, payload()).promise

  assert.deepEqual(await readdir(join(projectDir, 'avatar')), ['look.webp'])
  assert.deepEqual(
    await readFile(join(projectDir, 'avatar', 'look.webp')),
    WEBP,
  )
})

test('crear con avatar: los extremos de los rangos se aceptan y se guardan tal cual', async (t) => {
  for (const [appearances, secondsPerAppearance] of [
    [AVATAR_MIN_APPEARANCES, AVATAR_MIN_APPEARANCE_SECONDS],
    [AVATAR_MAX_APPEARANCES, AVATAR_MAX_APPEARANCE_SECONDS],
  ]) {
    const root = await session(t)
    const avatar = { ...AVATAR, appearances, secondsPerAppearance }
    const { projectDir } = await create(root, payload({ avatar })).promise

    assert.deepEqual((await storedOptions(projectDir)).avatar, avatar)
  }
})

// Pregunta 4 del dueño (entrega 2d, 2026-10-11): el mínimo por aparición baja
// de 7 a 5 s; el máximo sigue en 60.
test('crear con avatar (entrega 2d): 5 y 6 s por aparición se aceptan y se guardan (antes el mínimo era 7); 4, no', async (t) => {
  assert.equal(AVATAR_MIN_APPEARANCE_SECONDS, 5)
  for (const secondsPerAppearance of [5, 6]) {
    const root = await session(t)
    const avatar = { ...AVATAR, secondsPerAppearance }
    const { projectDir } = await create(root, payload({ avatar })).promise

    assert.deepEqual((await storedOptions(projectDir)).avatar, avatar)
  }

  const root = await session(t)
  await assert.rejects(
    create(root, payload({ avatar: { ...AVATAR, secondsPerAppearance: 4 } }))
      .promise,
    {
      code: 'invalid_payload',
      message:
        'options.avatar.secondsPerAppearance must be an integer between 5 and 60',
    },
  )
  assert.deepEqual(await projectFolders(root), [])
})

test('crear con avatar: «manual» es una ubicación válida y empezar sin el avatar también', async (t) => {
  const root = await session(t)
  const avatar = { ...AVATAR, placement: 'manual', startWithAvatar: false }
  const { projectDir } = await create(root, payload({ avatar })).promise

  assert.deepEqual((await storedOptions(projectDir)).avatar, avatar)
})

test('crear con avatar: sin vista previa del look copia la propia del avatar (no la del principal) y el log lo dice', async (t) => {
  // El look elegido (`look-2`, vertical) no tiene vista previa; el principal sí
  // (`look-1.png`) y el avatar tiene la suya (`preview.jpg`): se copia la del
  // avatar, la que declara `previewFile`, no la que `AvatarSummary.previewPath`
  // prefiere (la del principal).
  const root = await session(t, {
    previews: { 'look-1.png': PNG },
    avatarPreview: { file: 'preview.jpg', bytes: JPEG },
  })
  const { promise, events } = create(
    root,
    payload({
      avatar: { ...AVATAR, lookId: 'look-2', lookName: 'Ana parada' },
      videoFormat: '9:16',
    }),
  )
  const { projectId, projectDir } = await promise

  assert.deepEqual(await readdir(join(projectDir, 'avatar')), ['look.jpg'])
  assert.deepEqual(await readFile(join(projectDir, 'avatar', 'look.jpg')), JPEG)
  assert.equal(
    await findAvatarLookPreview(resolveProjectPaths(projectDir, projectId)),
    join(projectDir, 'avatar', 'look.jpg'),
  )
  assert.ok(warned(events, /no readable preview/))
})

test('crear con avatar: una vista previa del look que no es una imagen cuenta como ausente y se copia la del avatar', async (t) => {
  const root = await session(t, {
    previews: { 'look-1.png': NOT_AN_IMAGE },
    avatarPreview: { file: 'preview.webp', bytes: WEBP },
  })
  const { promise, events } = create(root, payload())
  const { projectDir } = await promise

  assert.deepEqual(await readdir(join(projectDir, 'avatar')), ['look.webp'])
  assert.deepEqual(
    await readFile(join(projectDir, 'avatar', 'look.webp')),
    WEBP,
  )
  assert.ok(warned(events, /no readable preview/))
})

test('crear con avatar: un look sin orientación conocida se acepta con un aviso', async (t) => {
  const root = await session(t, {
    looks: [libraryLook({ preferredOrientation: undefined })],
  })
  const { promise, events } = create(root, payload())
  const { projectDir } = await promise

  assert.ok(warned(events, /no known orientation/))
  assert.deepEqual(await readdir(join(projectDir, 'avatar')), ['look.png'])
})

// Sin imagen fija el tramo del avatar quedaría en blanco mientras no hay clip
// (miniatura y respaldo estático del render): se rechaza antes de crear nada.
for (const [label, setup] of [
  ['sin vista previa del look ni del avatar', { previews: {} }],
  [
    'con la vista previa del avatar declarada pero sin el archivo',
    { previews: {}, avatarPreview: { file: 'preview.png' } },
  ],
  [
    'con las dos vistas previas ilegibles',
    {
      previews: { 'look-1.png': NOT_AN_IMAGE },
      avatarPreview: { file: 'preview.png', bytes: NOT_AN_IMAGE },
    },
  ],
]) {
  test(`crear con avatar: ${label} se rechaza (avatar_look_unavailable) sin crear la carpeta ni dejar avisos`, async (t) => {
    const root = await session(t, setup)
    const { promise, events } = create(root, payload())

    await assert.rejects(promise, { code: 'avatar_look_unavailable' })
    assert.deepEqual(await projectFolders(root), [])
    assert.deepEqual(events, [])
  })
}

for (const [label, setup, avatarOverrides, optionOverrides, code] of [
  [
    'un avatar que no está en la biblioteca',
    {},
    { avatarId: 'otro-avatar' },
    {},
    'avatar_not_found',
  ],
  [
    'un look que no es del avatar',
    {},
    { lookId: 'look-9' },
    {},
    'avatar_look_unavailable',
  ],
  [
    'un look que todavía entrena',
    { looks: [libraryLook({ status: 'processing' })] },
    {},
    {},
    'avatar_look_unavailable',
  ],
  [
    'un look fallido',
    { looks: [libraryLook({ status: 'failed' })] },
    {},
    {},
    'avatar_look_unavailable',
  ],
  [
    'un look sin Avatar III',
    { looks: [libraryLook({ supportedEngines: ['avatar_iv'] })] },
    {},
    {},
    'avatar_look_unavailable',
  ],
  [
    'un tipo de look distinto del de la biblioteca',
    {},
    { lookType: 'studio_avatar' },
    {},
    'invalid_payload',
  ],
  [
    'un look vertical en un video 16:9',
    {},
    { lookId: 'look-2', lookName: 'Ana parada' },
    {},
    'avatar_look_orientation_mismatch',
  ],
  [
    'un look cuadrado en un video 16:9',
    { looks: [libraryLook({ preferredOrientation: 'square' })] },
    {},
    {},
    'avatar_look_orientation_mismatch',
  ],
  [
    'un look cuadrado en un video 9:16',
    { looks: [libraryLook({ preferredOrientation: 'square' })] },
    {},
    { videoFormat: '9:16' },
    'avatar_look_orientation_mismatch',
  ],
  [
    'un look horizontal en un video 9:16',
    {},
    {},
    { videoFormat: '9:16' },
    'avatar_look_orientation_mismatch',
  ],
]) {
  test(`crear con avatar: ${label} se rechaza (${code}) sin crear la carpeta`, async (t) => {
    const root = await session(t, setup)
    await assert.rejects(
      create(
        root,
        payload({
          avatar: { ...AVATAR, ...avatarOverrides },
          ...optionOverrides,
        }),
      ).promise,
      { code },
    )
    assert.deepEqual(await projectFolders(root), [])
  })
}

// `avatar-refresh` deja al avatar cuyo grupo HeyGen ya no tiene en `failed` con
// este código, pero sus looks `ready` siguen `ready`: sin este rechazo el
// proyecto se crearía y el fallo saldría recién en la etapa AVATAR, después de
// pagar las imágenes de las demás escenas.
test('crear con avatar: un avatar cuyo grupo HeyGen ya no tiene se rechaza (avatar_group_missing) aunque su look siga listo, sin carpeta ni avisos', async (t) => {
  const root = await session(t, {
    avatarMetadata: { status: 'failed', errorCode: 'avatar_group_missing' },
  })
  const { promise, events } = create(root, payload())

  await assert.rejects(promise, { code: 'avatar_group_missing' })
  assert.deepEqual(await projectFolders(root), [])
  assert.deepEqual(events, [])
})

// El grupo perdido se mira ANTES que el look elegido: si además ese look ya no
// existe o falló, la persona igual lee que el avatar ya no está en HeyGen (y no
// que elija otro look de un avatar que no va a servir), sin consultar la
// cuenta.
test('crear con avatar: con el grupo HeyGen perdido gana avatar_group_missing aunque el look elegido tampoco sirva', async (t) => {
  for (const [label, setup, avatarOverrides] of [
    ['un look que no existe', {}, { lookId: 'look-9' }],
    [
      'un look fallido',
      { looks: [libraryLook({ status: 'failed' }), LOOKS[1]] },
      {},
    ],
  ]) {
    const root = await session(t, {
      ...setup,
      avatarMetadata: { status: 'failed', errorCode: 'avatar_group_missing' },
    })
    const { promise, events } = create(
      root,
      payload({ avatar: { ...AVATAR, ...avatarOverrides } }),
    )

    await assert.rejects(promise, { code: 'avatar_group_missing' }, label)
    assert.deepEqual(await projectFolders(root), [], label)
    assert.deepEqual(events, [], label)
  }
  assert.deepEqual(heygen(t).calls, [])
})

// Solo el grupo perdido rechaza al avatar. El estado de su ficha sale del look
// PRINCIPAL: un look que no lo es puede estar listo bajo un avatar fallido o
// procesando, y ese look sirve.
for (const [label, mainLookStatus, avatarMetadata] of [
  [
    'fallido (su look principal no entrenó)',
    'failed',
    { status: 'failed', errorCode: 'avatar_training_failed' },
  ],
  [
    'procesando (su look principal todavía entrena)',
    'processing',
    { status: 'processing' },
  ],
]) {
  test(`crear con avatar: un avatar ${label} deja elegir otro look suyo que sí sirve`, async (t) => {
    const root = await session(t, {
      looks: [libraryLook({ status: mainLookStatus }), LOOKS[1]],
      avatarMetadata,
    })
    const { promise, events } = create(
      root,
      payload({
        avatar: { ...AVATAR, lookId: 'look-2', lookName: 'Ana parada' },
        videoFormat: '9:16',
      }),
    )
    const { projectDir } = await promise

    assert.equal((await storedOptions(projectDir)).avatar.lookId, 'look-2')
    assert.deepEqual(events, [])
  })
}

for (const [label, avatar, optionOverrides = {}] of [
  ['un id con ruta', { ...AVATAR, avatarId: '../avatars' }],
  ['sin id', { ...AVATAR, avatarId: undefined }],
  ['un look vacío', { ...AVATAR, lookId: '  ' }],
  ['un nombre de look vacío', { ...AVATAR, lookName: ' ' }],
  ['un tipo de look desconocido', { ...AVATAR, lookType: 'avatar' }],
  ['otro motor', { ...AVATAR, engine: 'avatar_iv' }],
  [
    'menos apariciones que el mínimo',
    { ...AVATAR, appearances: AVATAR_MIN_APPEARANCES - 1 },
  ],
  [
    'más apariciones que el máximo',
    { ...AVATAR, appearances: AVATAR_MAX_APPEARANCES + 1 },
  ],
  [
    'apariciones no enteras',
    { ...AVATAR, appearances: AVATAR_MIN_APPEARANCES + 0.5 },
  ],
  ['apariciones como texto', { ...AVATAR, appearances: '3' }],
  [
    'menos segundos que el mínimo',
    { ...AVATAR, secondsPerAppearance: AVATAR_MIN_APPEARANCE_SECONDS - 1 },
  ],
  [
    'más segundos que el máximo',
    { ...AVATAR, secondsPerAppearance: AVATAR_MAX_APPEARANCE_SECONDS + 1 },
  ],
  [
    'segundos no enteros',
    { ...AVATAR, secondsPerAppearance: AVATAR_MIN_APPEARANCE_SECONDS + 0.5 },
  ],
  [
    'un «empieza con el avatar» que no es booleano',
    { ...AVATAR, startWithAvatar: 'yes' },
  ],
  ['una ubicación desconocida', { ...AVATAR, placement: 'editor' }],
  ['un avatar que no es un objeto', null],
  ['un avatar que es una lista', [AVATAR]],
]) {
  test(`crear con avatar: ${label} es invalid_payload y no toca el disco`, async (t) => {
    const root = await session(t)
    await assert.rejects(
      create(root, payload({ avatar, ...optionOverrides })).promise,
      { code: 'invalid_payload' },
    )
    assert.deepEqual(await projectFolders(root), [])
  })
}

test('crear con avatar: un proyecto de la demo es invalid_payload (no tiene proveedores) y no toca el disco', async (t) => {
  const root = await session(t)
  await assert.rejects(create(root, payload({ demo: true })).promise, {
    code: 'invalid_payload',
    message: /not available in demo projects/,
  })
  assert.deepEqual(await projectFolders(root), [])
})

test('crear sin avatar: nada cambia (sin opciones de avatar, carpeta avatar/, avisos ni pedidos a HeyGen)', async (t) => {
  const root = await session(t)
  const { promise, events } = create(root, payload({ avatar: undefined }))
  const { projectDir } = await promise

  assert.equal('avatar' in (await storedOptions(projectDir)), false)
  assert.deepEqual((await readdir(projectDir)).sort(), [
    'project.json',
    'scenes',
    'script.txt',
  ])
  assert.deepEqual(events, [])
  assert.deepEqual(heygen(t).calls, [])
})

// El pre-vuelo de la cuenta: UNA lectura gratis antes de crear un proyecto con
// avatar, para que una clave muerta no se descubra después de pagar la voz y
// las imágenes.
test('pre-vuelo: crear con avatar lee UNA vez la cuenta de HeyGen con la clave del usuario, después de lo local y antes de crear la carpeta', async (t) => {
  const root = await session(t)
  let foldersAtRead
  const fake = heygen(t, {
    async onRequest() {
      foldersAtRead = await projectFolders(root)
    },
  })
  const { promise, events } = create(root, payload())
  await promise

  assert.deepEqual(
    fake.calls.map((call) => `${call.method} ${call.path}`),
    ['GET /v3/users/me'],
  )
  assert.equal(fake.calls[0].headers['X-Api-Key'], 'key-123')
  assert.deepEqual(foldersAtRead, [])
  assert.deepEqual(events, [])
})

for (const status of [401, 403])
  test(`pre-vuelo: una clave que HeyGen rechaza (${status}) no crea el proyecto: avatar_invalid_key, sin carpeta ni avisos`, async (t) => {
    const root = await session(t)
    heygen(t, {
      me: {
        status,
        body: {
          error: {
            code: 'unauthorized',
            message: 'Invalid or expired API key.',
          },
        },
      },
    })
    const { promise, events } = create(root, payload())

    await assert.rejects(promise, {
      code: 'avatar_invalid_key',
      provider: 'heygen',
    })
    assert.deepEqual(await projectFolders(root), [])
    assert.deepEqual(events, [])
  })

test('pre-vuelo: sin la clave de HeyGen no hay avatar posible: missing_api_key sin carpeta ni pedidos', async (t) => {
  const root = await session(t)
  const { promise } = create(root, payload(), {})

  await assert.rejects(promise, { code: 'missing_api_key' })
  assert.deepEqual(await projectFolders(root), [])
  assert.deepEqual(heygen(t).calls, [])
})

test('pre-vuelo: un rechazo local va antes y no gasta un pedido a HeyGen', async (t) => {
  const root = await session(t)
  await assert.rejects(
    create(root, payload({ avatar: { ...AVATAR, lookId: 'look-9' } })).promise,
    { code: 'avatar_look_unavailable' },
  )
  assert.deepEqual(heygen(t).calls, [])
})

for (const [label, me] of [
  [
    'HeyGen caído (503)',
    { status: 503, body: { error: { code: 'unavailable', message: 'down' } } },
  ],
  [
    'HeyGen con el límite de pedidos agotado (429)',
    {
      status: 429,
      body: { error: { code: 'rate_limited', message: 'slow down' } },
    },
  ],
  ['una respuesta sin el sobre de datos', { status: 200, body: {} }],
])
  test(`pre-vuelo: con ${label} se avisa y el proyecto se crea igual (la fase vuelve a mirar antes de pagar)`, async (t) => {
    // Las esperas del reintento ante 429 pasan sin dormir.
    t.mock.method(globalThis, 'setTimeout', (callback) =>
      setImmediate(callback),
    )
    const root = await session(t)
    const fake = heygen(t, { me })
    const { promise, events } = create(root, payload())
    const { projectDir } = await promise

    assert.deepEqual((await storedOptions(projectDir)).avatar, AVATAR)
    assert.ok(warned(events, /HeyGen account could not be checked/))
    // Una sola lectura: el pre-vuelo no repite un 429 (no cuelga «Crear»).
    assert.equal(fake.calls.filter(isAccountRead).length, 1)
  })

test('pre-vuelo: HeyGen que no responde no cuelga «Crear»: la lectura lleva un plazo corto propio y, al vencer, se avisa y el proyecto se crea', async (t) => {
  const root = await session(t)
  // El plazo real es de segundos: se anota cuál pidió el pre-vuelo y se
  // cumple en 20 ms.
  const timeout = AbortSignal.timeout.bind(AbortSignal)
  const requested = []
  t.mock.method(AbortSignal, 'timeout', (ms) => {
    requested.push(ms)
    return timeout(20)
  })
  // La cuenta nunca contesta: el pedido termina recién cuando vence su señal.
  // El temporizador de AbortSignal.timeout no mantiene vivo el proceso; este
  // sí, y corta el caso si el plazo no llegara nunca.
  heygen(t, {
    onRequest: (_call, init) =>
      new Promise((_resolve, reject) => {
        const stuck = setTimeout(
          () => reject(new Error('the account check never timed out')),
          5000,
        )
        init.signal.addEventListener(
          'abort',
          () => {
            clearTimeout(stuck)
            reject(init.signal.reason)
          },
          { once: true },
        )
      }),
  })
  const { promise, events } = create(root, payload())
  const { projectDir } = await promise

  assert.deepEqual((await storedOptions(projectDir)).avatar, AVATAR)
  // Un solo pedido, con un plazo mucho más corto que los 30 s del cliente.
  assert.equal(requested.length, 1)
  assert.ok(requested[0] <= 10_000, `${requested[0]} ms`)
  assert.ok(
    warned(events, /HeyGen account could not be checked \(avatar_network\)/),
  )
})

for (const [label, wallet] of [
  ['una billetera en cero', { currency: 'usd', remaining_balance: 0 }],
  // Un plan de suscripción: HeyGen responde (la clave sirve) sin billetera.
  ['una cuenta sin billetera legible', null],
])
  test(`pre-vuelo: ${label} no frena la creación ni avisa (el saldo lo comparan Crear y la fase)`, async (t) => {
    const root = await session(t)
    const fake = heygen(t, {
      me: { status: 200, body: { data: { wallet } } },
    })
    const { promise, events } = create(root, payload())
    await promise

    assert.equal(fake.calls.filter(isAccountRead).length, 1)
    assert.deepEqual(events, [])
  })

// Los cuatro códigos que Crear puede recibir del sidecar tienen que llegar a un
// texto en los tres idiomas: `avatar_not_found` y `avatar_group_missing` reusan
// los de la biblioteca de avatares y los otros dos tienen el suyo en
// `create.errors`.
test('los códigos de avatar de Crear apuntan a un texto que existe en es, en y pt', async () => {
  const constants = await readFile(
    fileURLToPath(
      new URL('../../src/modules/videos/constants.ts', import.meta.url),
    ),
    'utf8',
  )
  const catalogs = await Promise.all(
    ['es', 'en', 'pt'].map(async (locale) =>
      JSON.parse(
        await readFile(
          fileURLToPath(
            new URL(`../../public/locales/${locale}.json`, import.meta.url),
          ),
          'utf8',
        ),
      ),
    ),
  )

  for (const [code, key] of [
    ['avatar_not_found', 'avatars.errors.notFound'],
    ['avatar_group_missing', 'avatars.errors.groupMissing'],
    ['avatar_look_unavailable', 'create.errors.avatarLookUnavailable'],
    [
      'avatar_look_orientation_mismatch',
      'create.errors.avatarLookOrientationMismatch',
    ],
  ]) {
    assert.match(
      constants,
      new RegExp(`\\b${code}:\\s*'${key.replaceAll('.', '\\.')}'`),
      `${code} no apunta a ${key}`,
    )
    for (const catalog of catalogs) {
      const text = key.split('.').reduce((node, part) => node?.[part], catalog)
      assert.equal(typeof text, 'string', `${key} falta en un catálogo`)
      assert.ok(text.length > 0)
    }
  }
})

test('lookOrientationFit: horizontal para 16:9, vertical para 9:16, el cuadrado no sirve y sin orientación es desconocida', () => {
  for (const [orientation, format, expected] of [
    ['landscape', '16:9', 'match'],
    ['portrait', '9:16', 'match'],
    ['portrait', '16:9', 'mismatch'],
    ['landscape', '9:16', 'mismatch'],
    ['square', '16:9', 'mismatch'],
    ['square', '9:16', 'mismatch'],
    [undefined, '16:9', 'unknown'],
    [undefined, '9:16', 'unknown'],
  ])
    assert.equal(
      lookOrientationFit({ preferredOrientation: orientation }, format),
      expected,
      `${orientation} en ${format}`,
    )
})

test('lookOrientationFit es browser-safe: Crear lo importa desde la app, así que no puede traer nada de Node', async () => {
  const source = await readFile(
    fileURLToPath(
      new URL('../../pipeline/avatar/look-orientation.ts', import.meta.url),
    ),
    'utf8',
  )

  assert.doesNotMatch(source, /from 'node:/)
  assert.deepEqual(
    [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1]),
    ['../types/avatar.ts', '../types/video-format.ts'],
  )
})

// Lo que importa un archivo, siguiendo la cadena de imports relativos: la app
// importa valores de `types/avatar.ts` (límites, tarifas, `avatarSceneSpan`),
// así que nada de esa cadena puede traer Node ni un paquete, tampoco de segunda
// mano.
async function importChain(entry) {
  const files = []
  const specifiers = []
  const pending = [fileURLToPath(new URL(entry, import.meta.url))]
  while (pending.length > 0) {
    const file = pending.pop()
    if (files.includes(file)) continue

    files.push(file)
    const source = await readFile(file, 'utf8')
    for (const [, specifier] of source.matchAll(/from '([^']+)'/g)) {
      specifiers.push(specifier)
      if (specifier.startsWith('.'))
        pending.push(fileURLToPath(new URL(specifier, pathToFileURL(file))))
    }
  }
  return { files, specifiers }
}

test('types/avatar.ts y lookOrientationFit son browser-safe de punta a punta: ningún archivo de su cadena de imports trae Node ni un paquete', async () => {
  for (const entry of [
    '../../pipeline/types/avatar.ts',
    '../../pipeline/avatar/look-orientation.ts',
  ]) {
    const { files, specifiers } = await importChain(entry)
    const external = specifiers.filter(
      (specifier) => !specifier.startsWith('.'),
    )
    assert.deepEqual(external, [], `${entry}: ${files.join(', ')}`)
    // El guard recorre la cadena entera, no solo el primer archivo: llega
    // hasta animation/timing.ts, que importa la regla del tramo.
    assert.ok(
      files.some((file) => file.endsWith('/pipeline/animation/timing.ts')),
      entry,
    )
  }
})

// Centinela (registro `node-test-doble-mock-del-mismo-metodo-deja-el-global-sucio`):
// va SIEMPRE último; un test nuevo va antes que este.
test('centinela: al terminar, fetch vuelve a ser el real', () => {
  assert.equal(globalThis.fetch, ORIGINAL_FETCH)
})
