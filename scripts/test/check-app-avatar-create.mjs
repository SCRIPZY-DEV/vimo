// La sección «Avatar presentador» de Crear por dentro (ADR-0057, spec §6.2 y
// §9, con el cambio de dirección del dueño del 2026-10-10: el look ES el
// escenario): qué viaja en `options.avatar` (el look elegido, y con el
// interruptor apagado el payload no cambia ni un byte), los bloqueos, el
// costo exacto con la tarifa de Avatar III del tipo del look, que las escenas
// de avatar no sumen imágenes (ni al crear ni al reanudar), qué looks ofrece
// cada avatar para el formato del video (orientación, el principal primero,
// nunca por `status: 'ready'`), la elección por defecto y cuándo deja de
// valer, el saldo de HeyGen comparado solo en dólares, el dominio `avatar` de
// punta a punta (rechazo por saldo, cuenta que recargar), que un proveedor de
// animación desconocido no lea el saldo de Kie, y lo que falta cobrar del
// avatar al reanudar (un techo si las escenas ya están cortadas, que el aviso
// dice «hasta»), también por tramos y en cuadros como lo cuenta la fase. Un
// avatar que HeyGen ya no tiene no se ofrece. Empaqueta el código real de
// `src/` con esbuild y los alias de tsconfig.app.json, como
// check-app-catalog-payload.mjs: sin simulacros.
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

let workdir
let app

before(async () => {
  const output = await build({
    stdin: {
      contents: [
        "export * from './src/modules/videos/utilities/formPayload.ts'",
        "export * from './src/modules/videos/utilities/estimateCreateCost.ts'",
        "export * from './src/modules/videos/utilities/estimateResumeCost.ts'",
        "export * from './src/modules/videos/utilities/imageCostEstimate.ts'",
        "export * from './src/modules/videos/utilities/avatarCostEstimate.ts'",
        "export * from './src/modules/videos/utilities/selectableAvatar.ts'",
        "export * from './src/modules/videos/utilities/creditsDomainOf.ts'",
        "export * from './src/modules/videos/utilities/creditsIssueLine.ts'",
        "export * from './src/modules/common/utilities/creditsBalance.ts'",
        "export * from './src/modules/common/utilities/compareCostLines.ts'",
        "export { CREATE_FORM_INITIAL_VALUE } from './src/modules/videos/constants.ts'",
      ].join('\n'),
      resolveDir: repoRoot,
      sourcefile: 'avatar-create-entry.ts',
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    tsconfig: join(repoRoot, 'tsconfig.app.json'),
  })
  workdir = await mkdtemp(join(tmpdir(), 'avatar-create-guard-'))
  const file = join(workdir, 'avatar-create.mjs')
  await writeFile(file, output.outputFiles[0].contents)
  app = await import(pathToFileURL(file).href)
})

after(async () => {
  if (workdir) await rm(workdir, { recursive: true, force: true })
})

// Un guion de 900 caracteres ≈ 60 s de narración (15 caracteres por segundo).
const form = (overrides = {}) => ({
  ...app.CREATE_FORM_INITIAL_VALUE,
  name: 'Mi video',
  script: 'x'.repeat(900),
  voice: { provider: 'minimax', voiceId: 'voz-1', name: 'Lucía' },
  ...overrides,
})
const AVATAR_FIELDS = [
  'useAvatar',
  'avatar',
  'avatarAppearances',
  'avatarSecondsPerAppearance',
  'avatarStartsVideo',
]
const withoutAvatarFields = (value) =>
  Object.fromEntries(
    Object.entries(value).filter(([key]) => !AVATAR_FIELDS.includes(key)),
  )
const ANA = {
  id: 'ana-1',
  name: 'Ana',
  lookId: 'look-ana',
  lookName: 'Ana oficina',
  lookType: 'photo_avatar',
}
const ANA_KITCHEN = { ...ANA, lookId: 'look-cocina', lookName: 'Ana cocina' }
// Un look de la biblioteca: listo, con Avatar III y horizontal, salvo que el
// caso diga otra cosa.
const look = (overrides = {}) => ({
  lookId: 'look-ana',
  name: 'Ana oficina',
  lookType: 'photo_avatar',
  supportedEngines: ['avatar_iii', 'avatar_iv'],
  preferredOrientation: 'landscape',
  status: 'ready',
  origin: 'heygen',
  createdAt: '2026-10-09T00:00:00Z',
  ...overrides,
})
const KITCHEN = look({ lookId: 'look-cocina', name: 'Ana cocina' })
const VERTICAL = look({
  lookId: 'look-vertical',
  name: 'Ana vertical',
  preferredOrientation: 'portrait',
})
const entry = (overrides = {}, looks = [look()]) => ({
  id: 'ana-1',
  name: 'Ana',
  groupId: 'group-ana',
  ownership: 'own',
  status: 'ready',
  mainLookId: 'look-ana',
  looks,
  createdAt: '2026-10-09T00:00:00Z',
  ...overrides,
})
const imagesFor = (count) =>
  app.imageCostEstimate('evolink', '1024x576_low', count)

test('con el interruptor apagado el payload no cambia ni un byte', () => {
  const off = app.createProjectPayload(form({ useAvatar: false, avatar: ANA }))
  const legacy = app.createProjectPayload(withoutAvatarFields(form()))
  assert.equal(off.options.avatar, undefined)
  assert.equal(JSON.stringify(off), JSON.stringify(legacy))
})

test('encendido, options.avatar lleva el avatar, el look elegido, el motor de Vimo y placement auto', () => {
  const on = app.createProjectPayload(
    form({
      useAvatar: true,
      avatar: ANA_KITCHEN,
      avatarAppearances: 4,
      avatarSecondsPerAppearance: 12,
      avatarStartsVideo: false,
    }),
  )
  // `avatarId` (ProjectAvatarOptions, tarea 1): create-video-project rechaza
  // un payload sin él.
  assert.deepEqual(on.options.avatar, {
    avatarId: 'ana-1',
    lookId: 'look-cocina',
    lookName: 'Ana cocina',
    lookType: 'photo_avatar',
    engine: 'avatar_iii',
    appearances: 4,
    secondsPerAppearance: 12,
    startWithAvatar: false,
    placement: 'auto',
  })
})

test('la demo nunca lleva avatar', () => {
  const demo = app.createProjectPayload(
    form({ useAvatar: true, avatar: ANA }),
    {
      demo: true,
    },
  )
  assert.equal(demo.options.avatar, undefined)
})

test('bloqueos: avatar sin elegir y elección que ya no vale', () => {
  const avatarBlockers = (value, context) =>
    app.formBlockers(value, context).filter((key) => key.includes('avatar'))
  assert.deepEqual(avatarBlockers(form({ useAvatar: true, avatar: null })), [
    'create.validation.avatarRequired',
  ])
  assert.deepEqual(
    avatarBlockers(form({ useAvatar: true, avatar: ANA }), {
      avatarUnavailable: true,
    }),
    ['create.validation.avatarUnavailable'],
  )
  assert.deepEqual(avatarBlockers(form({ useAvatar: true, avatar: ANA })), [])
  assert.deepEqual(
    avatarBlockers(form({ useAvatar: false, avatar: ANA }), {
      avatarUnavailable: true,
    }),
    [],
  )
})

test('sin clave de HeyGen el formulario que se valida, se estima y se envía lleva el avatar apagado', () => {
  // La tarjeta se dibuja apagada sin clave: lo que sale de Crear también
  // (withAvatarKey). Ni «cargá tu clave» con la tarjeta apagada, ni
  // options.avatar, ni la línea de HeyGen; la elección queda guardada.
  const on = form({ useAvatar: true, avatar: ANA })
  const keyless = app.withAvatarKey(on, false)
  assert.equal(keyless.useAvatar, false)
  assert.deepEqual(keyless.avatar, ANA)
  assert.deepEqual(
    app.formBlockers(keyless).filter((key) => key.includes('avatar')),
    [],
  )
  assert.equal(app.createProjectPayload(keyless).options.avatar, undefined)
  assert.equal(
    app.estimateCreateCost(keyless).find((line) => line.domain === 'avatar'),
    undefined,
  )
  // Las imágenes vuelven a contar el audio entero (20, no 10).
  assert.deepEqual(
    app.estimateCreateCost(keyless).find((line) => line.domain === 'image'),
    imagesFor(20),
  )
  // Con clave, o con el avatar apagado, es el mismo formulario (mismo objeto).
  assert.equal(app.withAvatarKey(on, true), on)
  const off = form({ useAvatar: false, avatar: ANA })
  assert.equal(app.withAvatarKey(off, false), off)
})

test('la elección deja de valer contra la biblioteca leída, nunca mientras carga o si no se pudo leer', () => {
  const library = (overrides = {}) => ({
    entries: [entry({}, [look(), KITCHEN])],
    isLoading: false,
    errorKey: null,
    ...overrides,
  })
  const chosen = (overrides = {}) =>
    form({ useAvatar: true, avatar: ANA_KITCHEN, ...overrides })
  assert.equal(app.selectedAvatarUnavailable(chosen(), library()), false)
  // Otro formato, el look borrado o el avatar fuera de la biblioteca.
  assert.equal(
    app.selectedAvatarUnavailable(chosen({ videoFormat: '9:16' }), library()),
    true,
  )
  assert.equal(
    app.selectedAvatarUnavailable(chosen(), library({ entries: [entry()] })),
    true,
  )
  assert.equal(
    app.selectedAvatarUnavailable(chosen(), library({ entries: [] })),
    true,
  )
  // Sin lista legible no se afirma nada (el sidecar valida al crear).
  const gone = { entries: [] }
  assert.equal(
    app.selectedAvatarUnavailable(
      chosen(),
      library({ ...gone, isLoading: true }),
    ),
    false,
  )
  assert.equal(
    app.selectedAvatarUnavailable(
      chosen(),
      library({ ...gone, errorKey: 'avatars.errors.unknown' }),
    ),
    false,
  )
  // Apagado o sin elección no hay nada que invalidar (sin elección el
  // bloqueo es «elegí el avatar»).
  assert.equal(
    app.selectedAvatarUnavailable(chosen({ useAvatar: false }), library(gone)),
    false,
  )
  assert.equal(
    app.selectedAvatarUnavailable(chosen({ avatar: null }), library(gone)),
    false,
  )
})

test('el costo del avatar es exacto con la tarifa de Avatar III del tipo del look elegido', () => {
  const avatarLine = (value) =>
    app.estimateCreateCost(value).find((line) => line.domain === 'avatar')
  assert.deepEqual(avatarLine(form({ useAvatar: true, avatar: ANA })), {
    domain: 'avatar',
    providerId: 'heygen',
    unit: 'usd',
    estimated: 0.495,
  })
  assert.equal(
    avatarLine(
      form({ useAvatar: true, avatar: { ...ANA, lookType: 'digital_twin' } }),
    ).estimated,
    0.3,
  )
  // Sin el ruido de la coma flotante: 10 s a 0,99 US$/min son 0,165.
  assert.equal(app.avatarUsd('studio_avatar', 10), 0.165)
  assert.equal(avatarLine(form({ useAvatar: false, avatar: ANA })), undefined)
  assert.equal(avatarLine(form({ useAvatar: true, avatar: null })), undefined)
})

test('las escenas de avatar no generan imagen: la línea de imágenes cuenta solo las libres', () => {
  const images = (value) =>
    app.estimateCreateCost(value).find((line) => line.domain === 'image')
  // Sin avatar: 60 s a 3 s por escena = 20 imágenes.
  assert.deepEqual(images(form()), imagesFor(20))
  // Con 3 × 10 s de avatar quedan 30 s libres = 10 imágenes, sin fondos.
  assert.deepEqual(
    images(form({ useAvatar: true, avatar: ANA })),
    imagesFor(10),
  )
  // Con cantidad fija (catálogo viejo) la confirmada incluye las apariciones.
  assert.deepEqual(images(form({ sceneCount: 12 })), imagesFor(12))
  assert.deepEqual(
    images(form({ sceneCount: 12, useAvatar: true, avatar: ANA })),
    imagesFor(9),
  )
})

test('los looks que ofrece un avatar: los de la orientación del formato, el principal primero', () => {
  const ana = entry({}, [VERTICAL, KITCHEN, look()])
  const ids = (videoFormat) =>
    app.avatarLooksFor(ana, videoFormat).map((item) => item.lookId)
  assert.deepEqual(ids('16:9'), ['look-ana', 'look-cocina'])
  assert.deepEqual(ids('9:16'), ['look-vertical'])
  // Sin orientación conocida, cuadrado, entrenando o sin Avatar III: no se
  // ofrece (el clip saldría recortado o fallaría, y el render ya estaría pago).
  const hidden = entry({}, [
    look({ preferredOrientation: undefined }),
    look({ lookId: 'cuadrado', preferredOrientation: 'square' }),
    look({ lookId: 'entrenando', status: 'processing' }),
    look({ lookId: 'solo-iv', supportedEngines: ['avatar_iv'] }),
  ])
  assert.deepEqual(app.avatarLooksFor(hidden, '16:9'), [])
  assert.equal(app.avatarUsability(hidden, '16:9'), 'noLook')
  assert.equal(app.avatarUsability(ana, '16:9'), 'usable')
  assert.equal(
    app.avatarUsability(
      entry({ status: 'processing', mainLookId: null, looks: [] }),
      '16:9',
    ),
    'training',
  )
  assert.equal(
    app.avatarUsability(
      entry({ status: 'failed', errorCode: 'avatar_group_missing' }),
      '16:9',
    ),
    'failed',
  )
})

test('la elección por defecto: el principal si sirve en el formato; si no, el primer look que sirve', () => {
  assert.deepEqual(
    app.defaultAvatarChoice(entry({}, [VERTICAL, KITCHEN, look()]), '16:9'),
    ANA,
  )
  // Principal vertical en un video 16:9: el primer look horizontal.
  const verticalMain = entry({ mainLookId: 'look-vertical' }, [
    VERTICAL,
    KITCHEN,
  ])
  assert.deepEqual(app.defaultAvatarChoice(verticalMain, '16:9'), ANA_KITCHEN)
  assert.equal(app.defaultAvatarChoice(entry({}, [VERTICAL]), '16:9'), null)
  const vic = entry({ id: 'vic-3', name: 'Vic', mainLookId: 'look-vic' }, [
    look({
      lookId: 'look-vic',
      name: 'Vic',
      lookType: 'studio_avatar',
      preferredOrientation: 'portrait',
    }),
  ])
  assert.deepEqual(app.firstSelectableAvatar([vic, entry()], '16:9'), ANA)
  assert.deepEqual(app.firstSelectableAvatar([vic, entry()], '9:16'), {
    id: 'vic-3',
    name: 'Vic',
    lookId: 'look-vic',
    lookName: 'Vic',
    lookType: 'studio_avatar',
  })
  assert.equal(app.firstSelectableAvatar([], '16:9'), null)
})

test('una elección vale mientras su look siga sirviendo para el formato del video', () => {
  const ana = entry({}, [look(), KITCHEN])
  assert.equal(app.isSelectedAvatarCurrent(ANA_KITCHEN, [ana], '16:9'), true)
  // Pasar el video a 9:16 la invalida: el look es horizontal.
  assert.equal(app.isSelectedAvatarCurrent(ANA_KITCHEN, [ana], '9:16'), false)
  // El look ya no está en la biblioteca, o el avatar entero.
  assert.equal(
    app.isSelectedAvatarCurrent(ANA_KITCHEN, [entry()], '16:9'),
    false,
  )
  assert.equal(app.isSelectedAvatarCurrent(ANA, [], '16:9'), false)
})

test('un avatar que HeyGen ya no tiene no se ofrece aunque conserve looks listos', () => {
  // create-video-project también lo rechaza (`avatar_group_missing`): ni se
  // ofrece, ni se elige solo, ni una elección anterior sigue valiendo.
  const lost = entry({ status: 'failed', errorCode: 'avatar_group_missing' }, [
    look(),
    KITCHEN,
  ])
  assert.equal(app.avatarUsability(lost, '16:9'), 'failed')
  assert.equal(app.defaultAvatarChoice(lost, '16:9'), null)
  assert.equal(app.firstSelectableAvatar([lost], '16:9'), null)
  assert.equal(app.isSelectedAvatarCurrent(ANA, [lost], '16:9'), false)
  assert.deepEqual(app.firstSelectableAvatar([lost, entry()], '16:9'), ANA)
})

test('el saldo de HeyGen se compara solo en dólares', () => {
  const balances = (avatar) => ({ image: null, voice: null, avatar })
  assert.deepEqual(
    app.balanceFor(
      'avatar',
      'heygen',
      balances({ available: true, remaining: 2.87, currency: 'usd' }),
    ),
    { unit: 'usd', available: 2.87 },
  )
  // Sin moneda: la billetera verificada el 2026-10-09, en dólares.
  assert.deepEqual(
    app.balanceFor(
      'avatar',
      'heygen',
      balances({ available: true, remaining: 2.87 }),
    ),
    { unit: 'usd', available: 2.87 },
  )
  assert.deepEqual(
    app.balanceFor(
      'avatar',
      'heygen',
      balances({ available: true, remaining: 12, currency: 'credits' }),
    ),
    { unit: 'usd', available: null },
  )
  const line = {
    domain: 'avatar',
    providerId: 'heygen',
    unit: 'usd',
    estimated: 0.495,
  }
  const label = (providerId) => providerId
  assert.equal(
    app.compareCostLines(
      [line],
      balances({ available: true, remaining: 0.2, currency: 'usd' }),
      label,
    ).blocking,
    true,
  )
  assert.equal(
    app.compareCostLines(
      [line],
      balances({ available: true, remaining: 2.87, currency: 'usd' }),
      label,
    ).blocking,
    false,
  )
  const credits = app.compareCostLines(
    [line],
    balances({ available: true, remaining: 0.2, currency: 'credits' }),
    label,
  )
  assert.equal(credits.blocking, false)
  assert.equal(credits.lines[0].sufficient, null)
})

test('un proveedor de animación sin rama propia no lee el saldo de Kie', () => {
  const video = {
    kie: { available: true, remaining: 500 },
    poyo: { available: true, remaining: 7 },
  }
  const read = (providerId) =>
    app.balanceFor('animation', providerId, { image: null, voice: null, video })
      .available
  assert.equal(read('kie'), 500)
  assert.equal(read('poyo'), 7)
  assert.equal(read('heygen'), null)
})

test('un rechazo por saldo de HeyGen es del dominio avatar y su cuenta es HeyGen', () => {
  assert.equal(app.creditsDomainOf('avatar_insufficient_credits'), 'avatar')
  const context = {
    domain: 'avatar',
    imageProvider: 'fal',
    voiceVendor: 'dubvoice',
    videoProvider: 'kie',
  }
  assert.equal(app.creditsIssueProviderId(context), 'heygen')
  assert.deepEqual(
    app.creditsIssueLine(
      context,
      {
        image: null,
        voice: null,
        avatar: { available: true, remaining: 0.1, currency: 'usd' },
      },
      0.495,
    ),
    {
      providerId: 'heygen',
      providerLabel: 'HeyGen',
      unit: 'usd',
      estimated: 0.495,
      available: 0.1,
      sufficient: false,
    },
  )
})

// ─── Reanudar (estimateResumeCost) ───
const BEFORE_AVATAR = [
  'voice',
  'transcription',
  'scene-cuts',
  'scene-prompts',
  'images',
]
const AVATAR_OPTIONS = {
  avatarId: 'ana-1',
  lookId: 'look-ana',
  lookName: 'Ana oficina',
  lookType: 'photo_avatar',
  engine: 'avatar_iii',
  appearances: 3,
  secondsPerAppearance: 10,
  startWithAvatar: true,
  placement: 'auto',
}
// Un proyecto en pausa como lo devuelve `video-project-status`. Sin
// `imageQuality` no hay línea de imágenes (proyecto viejo): el caso que la
// quiere la pasa en `options`.
const status = ({
  scenes = [],
  completedStages = BEFORE_AVATAR,
  options = {},
  audioDurationSeconds,
} = {}) => ({
  metadata: {
    id: 'p',
    name: 'p',
    createdAt: '2026-10-10T00:00:00Z',
    updatedAt: '2026-10-10T00:00:00Z',
    state: 'paused',
    pauseReason: 'insufficient-credits',
    errorCode: 'avatar_insufficient_credits',
    completedStages,
    audioDurationSeconds,
    options: {
      styleId: 'normal',
      sceneCount: 0,
      narrationMode: 'tts',
      imageProvider: 'evolink',
      useBgm: false,
      useOverlay: false,
      confirmScenes: false,
      avatar: AVATAR_OPTIONS,
      ...options,
    },
  },
  scenes,
})
// Una escena de avatar como la deja el sidecar: sin imagen propia (su imagen
// fija es la copia del look; acá falta, para ver que igual no se cobra).
const avatarScene = (id, startSeconds, endSeconds, avatar) => ({
  id,
  text: '',
  imageStatus: 'pending',
  startSeconds,
  endSeconds,
  avatar: {
    lookId: 'look-ana',
    lookName: 'Ana oficina',
    lookType: 'photo_avatar',
    engine: 'avatar_iii',
    origin: 'auto',
    ...avatar,
  },
})
const freeScene = (id, startSeconds, endSeconds, imagePath) => ({
  id,
  text: 'x',
  imageStatus: imagePath ? 'ok' : 'pending',
  ...(imagePath ? { imagePath } : {}),
  startSeconds,
  endSeconds,
})

test('reanudar suma lo que falta del avatar y nada si la fase ya se hizo', () => {
  const scenes = [
    avatarScene(1, 0, 10, { status: 'ready', clipPath: '/p/avatar/1.mp4' }),
    freeScene(2, 10, 30, '/p/scenes/scene_2.jpg'),
    avatarScene(3, 30, 42, {
      status: 'failed',
      errorCode: 'avatar_render_failed',
    }),
    avatarScene(4, 50, 60, { status: 'planned' }),
    // Desactualizado: reanudar no lo regenera (§11.4), así que no se cobra.
    avatarScene(5, 60, 70, {
      status: 'ready',
      clipPath: '/p/avatar/5.mp4',
      stale: true,
    }),
  ]
  // Faltan 12 s + 10 s = 22 s a 0,99 US$/min = 0,363 US$, y es un techo: la
  // vista no trae los recibos y la fase puede pagar menos (`upperBound`).
  assert.deepEqual(app.estimateResumeCost(status({ scenes })), [
    {
      domain: 'avatar',
      providerId: 'heygen',
      unit: 'usd',
      estimated: 0.363,
      upperBound: true,
    },
  ])
  // Antes del corte: lo que pidió Crear (3 × 10 s).
  assert.deepEqual(
    app.estimateResumeCost(
      status({ completedStages: ['voice', 'transcription'] }),
    ),
    [{ domain: 'avatar', providerId: 'heygen', unit: 'usd', estimated: 0.495 }],
  )
  assert.deepEqual(
    app.estimateResumeCost(
      status({ scenes, completedStages: [...BEFORE_AVATAR, 'avatar'] }),
    ),
    [],
  )
})

test('lo que falta cobrar al reanudar es un techo; antes del corte, lo que pidió Crear', () => {
  const scenes = [
    avatarScene(1, 0, 10, { status: 'planned' }),
    avatarScene(2, 20, 30, { status: 'failed', errorCode: 'avatar_timeout' }),
  ]
  const [pending] = app.estimateResumeCost(status({ scenes }))
  assert.equal(pending.estimated, 0.33)
  assert.equal(pending.upperBound, true)
  const [requested] = app.estimateResumeCost(
    status({ completedStages: ['voice', 'transcription'] }),
  )
  assert.equal(requested.estimated, 0.495)
  assert.equal('upperBound' in requested, false)
  // La comparación con la billetera conserva la marca para que el aviso diga
  // «hasta»; sin ella la fila queda como siempre.
  const balances = {
    image: null,
    voice: null,
    avatar: { available: true, remaining: 0.2, currency: 'usd' },
  }
  const label = (providerId) => providerId
  const bounded = app.compareCostLines([pending], balances, label)
  assert.equal(bounded.lines[0].upperBound, true)
  assert.equal(bounded.lines[0].sufficient, false)
  assert.equal(bounded.blocking, true)
  const exact = app.compareCostLines([requested], balances, label)
  assert.equal('upperBound' in exact.lines[0], false)
})

test('si el corte no ubicó ninguna aparición, reanudar no pide nada de HeyGen', () => {
  // La narración no tenía frases donde entrara el avatar: hay escenas, pero
  // ninguna de avatar. La fase no va a cobrar nada, así que una billetera de
  // HeyGen en cero no puede frenar «Reanudar» (antes salía la línea entera de
  // Crear, 0,495, sin techo, y bloqueaba).
  const scenes = [
    freeScene(1, 0, 20, '/p/scenes/scene_1.jpg'),
    freeScene(2, 20, 30),
  ]
  const lines = app.estimateResumeCost(status({ scenes }))
  assert.equal(
    lines.find((line) => line.domain === 'avatar'),
    undefined,
  )
  const empty = { available: true, remaining: 0, currency: 'usd' }
  assert.equal(
    app.compareCostLines(
      lines,
      { image: null, voice: null, avatar: empty },
      (providerId) => providerId,
    ).blocking,
    false,
  )
  // Antes del corte (sin escenas) sigue siendo lo que pidió Crear.
  assert.deepEqual(
    app
      .estimateResumeCost(
        status({ completedStages: ['voice', 'transcription'] }),
      )
      .find((line) => line.domain === 'avatar'),
    { domain: 'avatar', providerId: 'heygen', unit: 'usd', estimated: 0.495 },
  )
})

test('reanudar no cobra imágenes para las escenas de avatar', () => {
  const imagesLine = (value) =>
    app.estimateResumeCost(value).find((line) => line.domain === 'image')
  const withQuality = { imageQuality: '1024x576_low' }
  // Cortado: falta la imagen de UNA escena libre; las de avatar no llevan.
  const scenes = [
    freeScene(1, 0, 20, '/p/scenes/scene_1.jpg'),
    freeScene(2, 20, 30),
    avatarScene(3, 30, 40, { status: 'planned' }),
    avatarScene(4, 40, 50, { status: 'planned' }),
  ]
  assert.deepEqual(
    imagesLine(
      status({
        scenes,
        completedStages: [
          'voice',
          'transcription',
          'scene-cuts',
          'scene-prompts',
        ],
        options: withQuality,
      }),
    ),
    imagesFor(1),
  )
  // Antes del corte, con cantidad fija: 12 confirmadas menos 3 apariciones.
  assert.deepEqual(
    imagesLine(
      status({
        completedStages: ['voice', 'transcription'],
        options: { ...withQuality, sceneCount: 12 },
      }),
    ),
    imagesFor(9),
  )
  // Antes del corte, por duración: 60 s menos 3 × 10 s de avatar = 10 imágenes.
  assert.deepEqual(
    imagesLine(
      status({
        completedStages: ['voice', 'transcription'],
        options: withQuality,
        audioDurationSeconds: 60,
      }),
    ),
    imagesFor(10),
  )
})

// ─── Costo por tramos (la pantalla de confirmación) ───

test('el costo de unos tramos de avatar se cuenta en cuadros, como lo compara la fase', () => {
  const spans = [
    { startSeconds: 0, endSeconds: 10 },
    { startSeconds: 30, endSeconds: 42 },
  ]
  assert.equal(app.avatarSpansSeconds(spans), 22)
  // 22 s a 0,99 US$/min son 0,363; un gemelo digital (0,60 US$/min), 0,22.
  assert.deepEqual(app.avatarSpansCostEstimate('photo_avatar', spans), {
    domain: 'avatar',
    providerId: 'heygen',
    unit: 'usd',
    estimated: 0.363,
  })
  assert.equal(
    app.avatarSpansCostEstimate('digital_twin', spans).estimated,
    0.22,
  )
  // Los bordes se redondean al cuadro (25 fps) como lo hace slotDurationSeconds
  // en la fase: 10,01 s son 10 s y 10,03 s son 10,04.
  assert.equal(
    app.avatarSpansSeconds([{ startSeconds: 0, endSeconds: 10.01 }]),
    10,
  )
  assert.equal(
    app.avatarSpansSeconds([{ startSeconds: 0, endSeconds: 10.03 }]),
    10.04,
  )
  // Las tres apariciones de 10 s de Crear cuestan lo mismo contadas por tramos.
  const three = [0, 20, 40].map((startSeconds) => ({
    startSeconds,
    endSeconds: startSeconds + 10,
  }))
  assert.deepEqual(
    app.avatarSpansCostEstimate('photo_avatar', three),
    app.avatarCostEstimate('photo_avatar', 30),
  )
  // Sin tramos, o con uno invertido, no hay nada que cobrar.
  assert.equal(app.avatarSpansSeconds([]), 0)
  assert.equal(app.avatarSpansCostEstimate('photo_avatar', []), null)
  assert.equal(
    app.avatarSpansCostEstimate('photo_avatar', [
      { startSeconds: 5, endSeconds: 2 },
    ]),
    null,
  )
})
