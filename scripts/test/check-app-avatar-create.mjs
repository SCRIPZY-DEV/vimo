// La sección «Avatar presentador» de Crear por dentro (ADR-0057, spec §6.2 y
// §9, con el cambio de dirección del dueño del 2026-10-10: el look ES el
// escenario): qué viaja en `options.avatar` (el look elegido, y con el
// interruptor apagado el payload no cambia ni un byte), los bloqueos, el
// costo exacto con la tarifa del motor del tipo del look, que las escenas
// de avatar no sumen imágenes (ni al crear ni al reanudar), qué looks ofrece
// cada avatar para el formato del video (orientación, el principal primero,
// nunca por `status: 'ready'`), la elección por defecto y cuándo deja de
// valer, el saldo de HeyGen comparado solo en dólares, el dominio `avatar` de
// punta a punta (rechazo por saldo, cuenta que recargar), que un proveedor de
// animación desconocido no lea el saldo de Kie, y lo que falta cobrar del
// avatar al reanudar (un techo si las escenas ya están cortadas, que el aviso
// dice «hasta»), también por tramos y en cuadros como lo cuenta la fase. Un
// avatar que HeyGen ya no tiene no se ofrece. Desde la entrega 2e (§21.3): la
// elección lleva los motores de su look, viaja el motor efectivo (el que
// prefiere la persona si el look lo admite; si no, el primero que admite en
// III, IV, V) y con él se cobra; «Movimiento más expresivo» viaja solo
// prendido y si el motor y el look lo admiten; con Avatar III y el interruptor
// apagado `options.avatar` queda byte a byte como antes; y un look sirve con
// cualquier motor que admita y tenga tarifa (uno solo-IV se ofrece; uno sin
// motores, no). Las tarifas de Avatar V con looks de foto o de estudio se leen
// de la tabla con la función (cambian en la 2e), nunca escritas acá. Desde la
// entrega 2f (diseño §22): «3 veces en 2 minutos» viaja como
// `threeInFirstTwoMinutes: true` solo prendida y cierra `options.avatar` (apagada
// o en un borrador sin el campo, el cuerpo es el de siempre, byte a byte); sus
// apariciones y su costo cuentan lo que sale de verdad (al menos 3, las tres
// primeras a lo sumo del tope AVATAR_EARLY_MAX_SECONDS, que se lee de la
// constante: lo fija el planificador y ya cambió dos veces) en el total de la
// tarjeta, el costo por motor, el pre-check y las imágenes libres; reanudar
// antes del corte cuenta la casilla con la misma función que Crear
// (`avatarRequestedAppearances` y `avatarRequestedSeconds`, a partir de
// `ProjectAvatarOptions`), y una prueba de paridad las compara en todas las
// combinaciones; y la elección copia si Avatar V puede mover al avatar con un
// prompt (`motionReference`): con V y un look de foto de un avatar propio sin
// gemelo digital «más expresivo» no se ofrece ni viaja (un borrador sin el
// campo cuenta como que sí puede). Empaqueta el código real de `src/` con
// esbuild y los alias de tsconfig.app.json, como check-app-catalog-payload.mjs:
// sin simulacros.
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
        "export { AVATAR_EARLY_APPEARANCES, AVATAR_EARLY_MAX_SECONDS, AVATAR_MAX_APPEARANCE_SECONDS } from './pipeline/types/avatar.ts'",
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
  'avatarThreeInTwoMinutes',
]
const withoutAvatarFields = (value) =>
  Object.fromEntries(
    Object.entries(value).filter(([key]) => !AVATAR_FIELDS.includes(key)),
  )
// La elección del formulario lleva los motores de su look (entrega 2e): con
// ellos se deriva el motor con el que sale, sin volver a leer la biblioteca. Y
// desde la 2f, si Avatar V puede mover a su avatar con un prompt
// (`motionReference`): Ana es propia, de foto y sin gemelo digital, así que no.
const ANA = {
  id: 'ana-1',
  name: 'Ana',
  lookId: 'look-ana',
  lookName: 'Ana oficina',
  lookType: 'photo_avatar',
  supportedEngines: ['avatar_iii', 'avatar_iv'],
  motionReference: false,
}
const ANA_KITCHEN = { ...ANA, lookId: 'look-cocina', lookName: 'Ana cocina' }
// Un look de la biblioteca: listo, con Avatar III y IV y horizontal, salvo que
// el caso diga otra cosa.
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

// `options.avatar` de Avatar III tal como salía antes de la 2e: las mismas
// nueve claves, en este orden (los recibos guardados se cosechan con la
// huella de este cuerpo).
const III_AVATAR_OPTIONS = {
  avatarId: 'ana-1',
  lookId: 'look-cocina',
  lookName: 'Ana cocina',
  lookType: 'photo_avatar',
  engine: 'avatar_iii',
  appearances: 4,
  secondsPerAppearance: 12,
  startWithAvatar: false,
  placement: 'auto',
}
const kitchenForm = (overrides = {}) =>
  form({
    useAvatar: true,
    avatar: ANA_KITCHEN,
    avatarAppearances: 4,
    avatarSecondsPerAppearance: 12,
    avatarStartsVideo: false,
    ...overrides,
  })

test('encendido, options.avatar lleva el avatar, el look elegido, el motor (Avatar III por defecto) y placement auto', () => {
  const on = app.createProjectPayload(kitchenForm())
  // `avatarId` (ProjectAvatarOptions, tarea 1): create-video-project rechaza
  // un payload sin él.
  assert.deepEqual(on.options.avatar, III_AVATAR_OPTIONS)
  // Byte a byte (el orden de las claves también): con Avatar III y el
  // interruptor apagado nada cambia desde la 2e. Y con el interruptor prendido
  // tampoco: Avatar III no admite «Movimiento más expresivo».
  assert.equal(
    JSON.stringify(on.options.avatar),
    JSON.stringify(III_AVATAR_OPTIONS),
  )
  assert.equal(
    JSON.stringify(
      app.createProjectPayload(kitchenForm({ avatarExpressive: true })).options
        .avatar,
    ),
    JSON.stringify(III_AVATAR_OPTIONS),
  )
})

test('viaja el motor efectivo: el que prefiere la persona si el look lo admite; si no, el primero que admite en III, IV, V', () => {
  const engineOf = (overrides) =>
    app.createProjectPayload(kitchenForm(overrides)).options.avatar.engine
  // La cocina admite III y IV.
  assert.equal(engineOf({ avatarEngine: 'avatar_iv' }), 'avatar_iv')
  // Prefiere V y la cocina no lo admite: sale con III (el primero del orden de
  // reemplazo), con el cuerpo de siempre, sin tocar la preferencia.
  const fallback = kitchenForm({ avatarEngine: 'avatar_v' })
  assert.equal(
    JSON.stringify(app.createProjectPayload(fallback).options.avatar),
    JSON.stringify(III_AVATAR_OPTIONS),
  )
  assert.equal(fallback.avatarEngine, 'avatar_v')
  // Un look solo-IV sale con IV aunque la persona prefiera III.
  assert.equal(
    engineOf({
      avatarEngine: 'avatar_iii',
      avatar: { ...ANA_KITCHEN, supportedEngines: ['avatar_iv'] },
    }),
    'avatar_iv',
  )
  // Un gemelo digital con los tres motores sale con V si se lo prefiere.
  assert.equal(
    engineOf({
      avatarEngine: 'avatar_v',
      avatar: {
        ...ANA_KITCHEN,
        lookType: 'digital_twin',
        supportedEngines: ['avatar_iii', 'avatar_iv', 'avatar_v'],
      },
    }),
    'avatar_v',
  )
})

test('«Movimiento más expresivo» viaja solo prendido y si el motor y el look lo admiten', () => {
  const ALL = ['avatar_iii', 'avatar_iv', 'avatar_v']
  const avatarOf = (overrides) =>
    app.createProjectPayload(kitchenForm(overrides)).options.avatar
  // IV con un look de foto: lo admite; va al final del objeto, solo en true.
  const photoIv = avatarOf({
    avatarEngine: 'avatar_iv',
    avatarExpressive: true,
  })
  assert.equal(photoIv.engine, 'avatar_iv')
  assert.equal(photoIv.expressive, true)
  assert.equal(Object.keys(photoIv).at(-1), 'expressive')
  // Apagado no viaja la clave.
  assert.equal(
    'expressive' in
      avatarOf({ avatarEngine: 'avatar_iv', avatarExpressive: false }),
    false,
  )
  // IV con un gemelo digital o un look de estudio: no lo admite.
  for (const lookType of ['digital_twin', 'studio_avatar']) {
    const video = avatarOf({
      avatarEngine: 'avatar_iv',
      avatarExpressive: true,
      avatar: { ...ANA_KITCHEN, lookType, supportedEngines: ALL },
    })
    assert.equal(video.engine, 'avatar_iv')
    assert.equal('expressive' in video, false, lookType)
  }
  // V con un gemelo digital: lo admite (se traduce en el prompt).
  const twinV = avatarOf({
    avatarEngine: 'avatar_v',
    avatarExpressive: true,
    avatar: { ...ANA_KITCHEN, lookType: 'digital_twin', supportedEngines: ALL },
  })
  assert.equal(twinV.engine, 'avatar_v')
  assert.equal(twinV.expressive, true)
  // Prefiere IV pero el look solo admite III: sale con III y sin expresivo.
  assert.equal(
    'expressive' in
      avatarOf({
        avatarEngine: 'avatar_iv',
        avatarExpressive: true,
        avatar: { ...ANA_KITCHEN, supportedEngines: ['avatar_iii'] },
      }),
    false,
  )
})

// Un formulario de Avatar V con un look de foto: lo que cambia entre los casos
// es si el avatar tiene con qué moverse (`motionReference`, entrega 2f).
const ALL_ENGINES = ['avatar_iii', 'avatar_iv', 'avatar_v']
const photoChoice = (motionReference) => ({
  ...ANA_KITCHEN,
  supportedEngines: ALL_ENGINES,
  motionReference,
})
// Un borrador de antes de la 2f: la elección no trae el campo.
const draftChoice = () => {
  const choice = photoChoice(false)
  delete choice.motionReference
  return choice
}

test('«3 veces en 2 minutos» viaja solo prendida, al final de options.avatar; apagada, el cuerpo es el de siempre', () => {
  const avatarOf = (overrides) =>
    app.createProjectPayload(kitchenForm(overrides)).options.avatar
  const bytes = (value) => JSON.stringify(value)
  // Apagada es el valor por defecto del formulario, y con ella el cuerpo no
  // cambia ni un byte (los recibos guardados se siguen cosechando).
  assert.equal(app.CREATE_FORM_INITIAL_VALUE.avatarThreeInTwoMinutes, false)
  assert.equal(bytes(avatarOf({})), bytes(III_AVATAR_OPTIONS))
  assert.equal(
    bytes(avatarOf({ avatarThreeInTwoMinutes: false })),
    bytes(III_AVATAR_OPTIONS),
  )
  // Un borrador de antes de la 2f no trae el campo: es como apagada.
  const draft = kitchenForm()
  delete draft.avatarThreeInTwoMinutes
  assert.equal(
    bytes(app.createProjectPayload(draft).options.avatar),
    bytes(III_AVATAR_OPTIONS),
  )
  // Prendida: `threeInFirstTwoMinutes: true`, al final, y nada más cambia: las
  // apariciones y los segundos viajan como los eligió la persona (el
  // planificador sube las apariciones a 3 y acorta las tres primeras).
  const on = avatarOf({ avatarThreeInTwoMinutes: true })
  assert.deepEqual(on, { ...III_AVATAR_OPTIONS, threeInFirstTwoMinutes: true })
  assert.equal(Object.keys(on).at(-1), 'threeInFirstTwoMinutes')
  assert.equal(
    bytes(on),
    bytes({ ...III_AVATAR_OPTIONS, threeInFirstTwoMinutes: true }),
  )
  const fewer = avatarOf({
    avatarThreeInTwoMinutes: true,
    avatarAppearances: 1,
  })
  assert.equal(fewer.appearances, 1)
  assert.equal(fewer.threeInFirstTwoMinutes, true)
  // Con «más expresivo» van las dos, expressive primero.
  const both = avatarOf({
    avatarEngine: 'avatar_iv',
    avatarExpressive: true,
    avatarThreeInTwoMinutes: true,
  })
  assert.deepEqual(Object.keys(both).slice(-2), [
    'expressive',
    'threeInFirstTwoMinutes',
  ])
  // La casilla sola no inventa un avatar: con el avatar apagado el payload es
  // el de un formulario sin avatar, y la demo nunca lleva avatar.
  const offWithBox = form({
    useAvatar: false,
    avatar: ANA,
    avatarThreeInTwoMinutes: true,
  })
  assert.equal(
    bytes(app.createProjectPayload(offWithBox)),
    bytes(app.createProjectPayload(withoutAvatarFields(form()))),
  )
  assert.equal(
    app.createProjectPayload(kitchenForm({ avatarThreeInTwoMinutes: true }), {
      demo: true,
    }).options.avatar,
    undefined,
  )
})

test('la elección copia si Avatar V puede mover al avatar con un prompt: uno del stock o con un gemelo digital, sí; uno propio sin gemelo, no', () => {
  const twin = look({
    lookId: 'look-gemelo',
    name: 'Ana gemelo',
    lookType: 'digital_twin',
  })
  const studio = look({
    lookId: 'look-estudio',
    name: 'Ana estudio',
    lookType: 'studio_avatar',
  })
  const choice = (overrides, looks) =>
    app.defaultAvatarChoice(entry(overrides, looks), '16:9')
  // Propio y solo de foto: no tiene con qué moverse.
  assert.equal(choice({}, [look()]).motionReference, false)
  // Propio con un look de estudio y sin gemelo digital: el avatar tampoco la
  // tiene (V lo mueve igual: lo decide avatarMotionReferenceMissing por el
  // tipo del look).
  assert.equal(
    choice({ mainLookId: 'look-estudio' }, [studio]).motionReference,
    false,
  )
  // Del stock: tiene las referencias curadas.
  assert.equal(choice({ ownership: 'stock' }, [look()]).motionReference, true)
  // Propio con un gemelo digital en su grupo: el avatar entero la tiene, también
  // al elegir su look de foto.
  const withTwin = entry({}, [look(), twin])
  const photo = app.defaultAvatarChoice(withTwin, '16:9')
  assert.equal(photo.lookId, 'look-ana')
  assert.equal(photo.lookType, 'photo_avatar')
  assert.equal(photo.motionReference, true)
  assert.equal(app.selectedAvatarFrom(withTwin, twin).motionReference, true)
  // La copia es una clave más de la elección, después de los motores.
  assert.deepEqual(Object.keys(photo), [
    'id',
    'name',
    'lookId',
    'lookName',
    'lookType',
    'supportedEngines',
    'motionReference',
  ])
})

test('Avatar V sin gemelo digital: «más expresivo» no se ofrece ni viaja con un look de foto sin referencia de animación; un borrador sin el campo cuenta como que sí', () => {
  const missing = (avatar, engine) =>
    app.avatarMotionReferenceMissing(avatar, engine)
  const available = (avatar, engine) =>
    app.selectedAvatarExpressiveAvailable(avatar, engine)
  // La regla: solo con V y un look de foto, y solo si el avatar no la tiene.
  assert.equal(missing(photoChoice(false), 'avatar_v'), true)
  assert.equal(missing(photoChoice(true), 'avatar_v'), false)
  assert.equal(missing(draftChoice(), 'avatar_v'), false)
  // IV mueve un look de foto sin referencia, y III no mueve nada.
  assert.equal(missing(photoChoice(false), 'avatar_iv'), false)
  assert.equal(missing(photoChoice(false), 'avatar_iii'), false)
  // Los looks de video se referencian a sí mismos.
  for (const lookType of ['digital_twin', 'studio_avatar']) {
    assert.equal(
      missing({ ...photoChoice(false), lookType }, 'avatar_v'),
      false,
      lookType,
    )
  }
  // «Más expresivo» hace algo con V solo si V puede mover el look; con IV y un
  // look de foto, siempre; con IV y un gemelo digital, nunca; con III, nunca.
  assert.equal(available(photoChoice(false), 'avatar_v'), false)
  assert.equal(available(photoChoice(true), 'avatar_v'), true)
  assert.equal(available(draftChoice(), 'avatar_v'), true)
  assert.equal(available(photoChoice(false), 'avatar_iv'), true)
  assert.equal(
    available({ ...photoChoice(false), lookType: 'digital_twin' }, 'avatar_iv'),
    false,
  )
  assert.equal(available(photoChoice(true), 'avatar_iii'), false)
  // El payload: prendido en el formulario, con V y sin referencia no viaja
  // (el motor sigue siendo V); con la referencia, sin el campo o con IV, sí.
  const avatarOf = (avatar, avatarEngine) =>
    app.createProjectPayload(
      kitchenForm({ avatar, avatarEngine, avatarExpressive: true }),
    ).options.avatar
  const withoutReference = avatarOf(photoChoice(false), 'avatar_v')
  assert.equal(withoutReference.engine, 'avatar_v')
  assert.equal('expressive' in withoutReference, false)
  assert.equal(avatarOf(photoChoice(true), 'avatar_v').expressive, true)
  assert.equal(avatarOf(draftChoice(), 'avatar_v').expressive, true)
  assert.equal(avatarOf(photoChoice(false), 'avatar_iv').expressive, true)
  // Un gemelo digital de un avatar propio con V: lo mueve, con la referencia.
  const twinV = {
    ...photoChoice(true),
    lookType: 'digital_twin',
  }
  assert.equal(avatarOf(twinV, 'avatar_v').expressive, true)
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

test('el costo total sale con el motor efectivo: IV y V a su tarifa, y el de reemplazo si el look no admite el preferido', () => {
  const ALL = ['avatar_iii', 'avatar_iv', 'avatar_v']
  const usd = (overrides) =>
    app
      .estimateCreateCost(form({ useAvatar: true, ...overrides }))
      .find((line) => line.domain === 'avatar').estimated
  // 3 × 10 s de foto con IV: 30 s a 2,31 US$/min = 1,155.
  assert.equal(usd({ avatar: ANA, avatarEngine: 'avatar_iv' }), 1.155)
  // Un gemelo digital con V: 30 s a 7,20 US$/min = 3,6; con IV, 4,83 → 2,415.
  const twin = { ...ANA, lookType: 'digital_twin', supportedEngines: ALL }
  assert.equal(usd({ avatar: twin, avatarEngine: 'avatar_v' }), 3.6)
  assert.equal(usd({ avatar: twin, avatarEngine: 'avatar_iv' }), 2.415)
  // Prefiere V y el look de Ana no lo admite: se cobra III, como sale.
  assert.equal(usd({ avatar: ANA, avatarEngine: 'avatar_v' }), 0.495)
  // V con un look de foto: 7,20 US$/min desde la tabla de la 2e (R-2e-2, el
  // techo de la tarifa publicada del gemelo): 30 s son 3,6.
  const photoV = { ...ANA, supportedEngines: ALL }
  assert.equal(app.avatarUsd('photo_avatar', 30, 'avatar_v'), 3.6)
  assert.equal(usd({ avatar: photoV, avatarEngine: 'avatar_v' }), 3.6)
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

// El tope de las tres primeras con «3 veces en 2 minutos» sale de la constante
// del contrato (era 45 s; el planificador lo fijó en 40 y después en 35): estos
// casos no lo escriben como número. Los totales se arman a mano a partir de él.
// Para que ejerciten el tope tiene que quedar por encima de los 10 s por
// defecto y por debajo del máximo del control (60 s).
const EARLY_APPEARANCES = () => app.AVATAR_EARLY_APPEARANCES
const EARLY_CAP = () => app.AVATAR_EARLY_MAX_SECONDS
const SLIDER_MAX = () => app.AVATAR_MAX_APPEARANCE_SECONDS

test('el tope de las tres primeras es el de la constante y los casos de abajo lo ejercitan', () => {
  assert.equal(EARLY_APPEARANCES(), 3, 'son «3 veces»')
  assert.ok(
    EARLY_CAP() > 10 && EARLY_CAP() + 1 <= SLIDER_MAX(),
    'el tope (' +
      EARLY_CAP() +
      ' s) queda por encima de los 10 s por defecto y deja un valor más arriba que el control puede elegir',
  )
})

test('«3 veces en 2 minutos» cuenta lo que sale de verdad: al menos 3 apariciones y las tres primeras al tope', () => {
  const CAP = EARLY_CAP()
  const MAX = SLIDER_MAX()
  const on = { avatarThreeInTwoMinutes: true }
  const value = (overrides) =>
    form({ useAvatar: true, avatar: ANA, ...overrides })
  const appearances = (overrides) =>
    app.createAvatarAppearances(value(overrides))
  const seconds = (overrides) => app.createAvatarSeconds(value(overrides))
  // Apagada: apariciones × segundos, como siempre.
  assert.equal(
    seconds({ avatarAppearances: 1, avatarSecondsPerAppearance: 10 }),
    10,
  )
  assert.equal(
    seconds({ avatarAppearances: 5, avatarSecondsPerAppearance: MAX }),
    5 * MAX,
  )
  assert.equal(appearances({ avatarAppearances: 1 }), 1)
  // Prendida, las apariciones suben a 3 y no bajan de lo elegido.
  for (const [chosen, expected] of [
    [1, 3],
    [2, 3],
    [3, 3],
    [5, 5],
    [10, 10],
  ]) {
    assert.equal(
      appearances({ ...on, avatarAppearances: chosen }),
      expected,
      chosen + ' apariciones',
    )
  }
  // Los segundos: las tres primeras a min(segundos, tope), las demás a los
  // elegidos. (apariciones, segundos) → total.
  for (const [chosen, perAppearance, expected] of [
    [1, 10, 30],
    [2, 10, 30],
    [3, 10, 30],
    [5, 10, 50],
    [10, 10, 100],
    [1, CAP, 3 * CAP],
    [5, CAP, 5 * CAP],
    [1, CAP + 1, 3 * CAP],
    [5, CAP + 1, 3 * CAP + 2 * (CAP + 1)],
    [1, MAX, 3 * CAP],
    [3, MAX, 3 * CAP],
    [5, MAX, 3 * CAP + 2 * MAX],
    [10, MAX, 3 * CAP + 7 * MAX],
  ]) {
    assert.equal(
      seconds({
        ...on,
        avatarAppearances: chosen,
        avatarSecondsPerAppearance: perAppearance,
      }),
      expected,
      chosen + ' × ' + perAppearance + ' s',
    )
  }
  // Con el avatar apagado no hay nada, aunque la casilla esté prendida.
  assert.equal(
    app.createAvatarSeconds(form({ ...on, useAvatar: false, avatar: ANA })),
    0,
  )
  assert.equal(
    app.createAvatarAppearances(form({ ...on, useAvatar: false, avatar: ANA })),
    0,
  )
})

test('el costo total y el chequeo de saldo siguen a «3 veces en 2 minutos»: con 1 y con 5 apariciones, con 60 s y por motor', () => {
  const CAP = EARLY_CAP()
  const MAX = SLIDER_MAX()
  const on = { avatarThreeInTwoMinutes: true }
  const usd = (overrides) =>
    app
      .estimateCreateCost(form({ useAvatar: true, avatar: ANA, ...overrides }))
      .find((line) => line.domain === 'avatar')?.estimated
  // Un look de foto con III (0,99 US$/min) a lo que cuestan esos segundos.
  const photo = (seconds) => app.avatarUsd('photo_avatar', seconds)
  // 1 aparición de 10 s: sin la casilla, 10 s; con ella salen 3 y son 30 s.
  assert.equal(usd({ avatarAppearances: 1 }), 0.165)
  assert.equal(usd({ ...on, avatarAppearances: 1 }), 0.495)
  // 5 × 10 s: ya salen más de 3 y ninguna pasa del tope, la cifra es la misma.
  assert.equal(usd({ avatarAppearances: 5 }), 0.825)
  assert.equal(usd({ ...on, avatarAppearances: 5 }), 0.825)
  // 60 s por aparición: 1 aparición pasa de 60 s a 3 al tope y 5 bajan de
  // 5 × 60 s a 3 al tope + 2 × 60 s (las tres primeras se acortan para entrar
  // en los 2 minutos).
  assert.equal(
    usd({ avatarAppearances: 1, avatarSecondsPerAppearance: MAX }),
    photo(MAX),
  )
  assert.equal(
    usd({ ...on, avatarAppearances: 1, avatarSecondsPerAppearance: MAX }),
    photo(3 * CAP),
  )
  assert.equal(
    usd({ avatarAppearances: 5, avatarSecondsPerAppearance: MAX }),
    photo(5 * MAX),
  )
  assert.equal(
    usd({ ...on, avatarAppearances: 5, avatarSecondsPerAppearance: MAX }),
    photo(3 * CAP + 2 * MAX),
  )
  // El tope hace algo: con una aparición cuesta más y con cinco cuesta menos.
  assert.ok(
    usd({ ...on, avatarAppearances: 1, avatarSecondsPerAppearance: MAX }) >
      usd({ avatarAppearances: 1, avatarSecondsPerAppearance: MAX }),
  )
  assert.ok(
    usd({ ...on, avatarAppearances: 5, avatarSecondsPerAppearance: MAX }) <
      usd({ avatarAppearances: 5, avatarSecondsPerAppearance: MAX }),
  )
  // Con IV (foto, 2,31 US$/min): 3 × 10 s = 30 s = 1,155; con V (7,20): 3,6.
  const motion = { avatar: photoChoice(true), avatarAppearances: 1 }
  assert.equal(usd({ ...on, ...motion, avatarEngine: 'avatar_iv' }), 1.155)
  assert.equal(usd({ ...on, ...motion, avatarEngine: 'avatar_v' }), 3.6)
})

test('las imágenes libres descuentan las apariciones que salen con «3 veces en 2 minutos»', () => {
  const on = { avatarThreeInTwoMinutes: true }
  const images = (value) =>
    app.estimateCreateCost(value).find((line) => line.domain === 'image')
  const withAvatar = (overrides) =>
    form({ useAvatar: true, avatar: ANA, avatarAppearances: 1, ...overrides })
  // Un guion de 60 s con 1 aparición de 10 s: sin la casilla quedan 50 s libres
  // (17 imágenes de 3 s); con ella salen 3 apariciones (30 s) y quedan 30 s.
  assert.deepEqual(images(withAvatar({})), imagesFor(17))
  assert.deepEqual(images(withAvatar(on)), imagesFor(10))
  // Con cantidad fija (catálogo viejo) la confirmada incluye las apariciones
  // que salen: 12 − 3, no 12 − 1.
  assert.deepEqual(images(withAvatar({ sceneCount: 12 })), imagesFor(11))
  assert.deepEqual(images(withAvatar({ ...on, sceneCount: 12 })), imagesFor(9))
})

test('los looks que ofrece un avatar: los de la orientación del formato, el principal primero', () => {
  const ana = entry({}, [VERTICAL, KITCHEN, look()])
  const ids = (videoFormat) =>
    app.avatarLooksFor(ana, videoFormat).map((item) => item.lookId)
  assert.deepEqual(ids('16:9'), ['look-ana', 'look-cocina'])
  assert.deepEqual(ids('9:16'), ['look-vertical'])
  // Sin orientación conocida, cuadrado, entrenando o sin ningún motor: no se
  // ofrece (el clip saldría recortado o fallaría, y el render ya estaría pago).
  const hidden = entry({}, [
    look({ preferredOrientation: undefined }),
    look({ lookId: 'cuadrado', preferredOrientation: 'square' }),
    look({ lookId: 'entrenando', status: 'processing' }),
    look({ lookId: 'sin-motor', supportedEngines: [] }),
  ])
  assert.deepEqual(app.avatarLooksFor(hidden, '16:9'), [])
  assert.equal(app.avatarUsability(hidden, '16:9'), 'noLook')
  assert.equal(
    app.lookUnfitReason(look({ supportedEngines: [] }), '16:9'),
    'engine',
  )
  assert.equal(app.avatarUsability(ana, '16:9'), 'usable')
  // Desde la entrega 2e un look sirve con cualquier motor que admita y tenga
  // tarifa (antes, solo con Avatar III): uno solo-IV se ofrece, y la elección
  // lleva sus motores.
  const soloIv = look({ lookId: 'solo-iv', supportedEngines: ['avatar_iv'] })
  assert.equal(app.lookUnfitReason(soloIv, '16:9'), null)
  const onlyIv = entry({ mainLookId: 'solo-iv' }, [soloIv])
  assert.deepEqual(
    app.avatarLooksFor(onlyIv, '16:9').map((item) => item.lookId),
    ['solo-iv'],
  )
  assert.equal(app.avatarUsability(onlyIv, '16:9'), 'usable')
  assert.deepEqual(app.defaultAvatarChoice(onlyIv, '16:9'), {
    ...ANA,
    lookId: 'solo-iv',
    supportedEngines: ['avatar_iv'],
  })
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
    supportedEngines: ['avatar_iii', 'avatar_iv'],
    motionReference: false,
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

test('una elección cuyo look perdió un motor de su copia deja de valer, sin tocar el motor preferido; uno ganado no la invalida', () => {
  // La biblioteca releída: la cocina admite III y IV.
  const ana = entry({}, [look(), KITCHEN])
  const library = { entries: [ana], isLoading: false, errorKey: null }
  // La copia de la elección todavía ofrece V: deja de valer, el envío se
  // frena con la misma regla y la preferencia de la persona sigue ahí.
  const wide = {
    ...ANA_KITCHEN,
    supportedEngines: ['avatar_iii', 'avatar_iv', 'avatar_v'],
  }
  assert.equal(app.isSelectedAvatarCurrent(wide, [ana], '16:9'), false)
  const chosen = form({
    useAvatar: true,
    avatar: wide,
    avatarEngine: 'avatar_v',
  })
  assert.equal(app.selectedAvatarUnavailable(chosen, library), true)
  assert.equal(chosen.avatarEngine, 'avatar_v')
  // Elegirla de nuevo trae los motores de hoy y vuelve a valer.
  const fresh = app.defaultAvatarChoice(
    entry({ mainLookId: 'look-cocina' }, [look(), KITCHEN]),
    '16:9',
  )
  assert.deepEqual(fresh.supportedEngines, ['avatar_iii', 'avatar_iv'])
  assert.equal(app.isSelectedAvatarCurrent(fresh, [ana], '16:9'), true)
  // Un motor que la biblioteca ganó no la invalida (la copia sigue incluida),
  // y la misma copia, tampoco.
  const narrow = { ...ANA_KITCHEN, supportedEngines: ['avatar_iii'] }
  assert.equal(app.isSelectedAvatarCurrent(narrow, [ana], '16:9'), true)
  assert.equal(app.isSelectedAvatarCurrent(ANA_KITCHEN, [ana], '16:9'), true)
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

// «3 veces en 2 minutos» al reanudar antes del corte (entrega 2f, ronda 1): las
// opciones del proyecto traen `threeInFirstTwoMinutes: true` solo prendida y el
// costo cuenta lo que sale, con la misma función que Crear.
const BEFORE_CUT = ['voice', 'transcription']
const resumeAvatarLine = (avatar, options = {}, extra = {}) =>
  app
    .estimateResumeCost(
      status({
        completedStages: BEFORE_CUT,
        options: { avatar: { ...AVATAR_OPTIONS, ...avatar }, ...options },
        ...extra,
      }),
    )
    .find((line) => line.domain === 'avatar')

test('reanudar antes del corte cuenta «3 veces en 2 minutos»: con 1 aparición de 60 s son 3 apariciones al tope', () => {
  const CAP = EARLY_CAP()
  const MAX = SLIDER_MAX()
  const line = (avatar) => resumeAvatarLine(avatar)?.estimated
  const photo = (seconds) => app.avatarUsd('photo_avatar', seconds)
  // 1 aparición de 60 s con la casilla: 3 apariciones a CAP s, no 60 s.
  assert.deepEqual(
    resumeAvatarLine({
      appearances: 1,
      secondsPerAppearance: MAX,
      threeInFirstTwoMinutes: true,
    }),
    {
      domain: 'avatar',
      providerId: 'heygen',
      unit: 'usd',
      estimated: photo(3 * CAP),
    },
  )
  // Sin la casilla (ausente o en false), apariciones × segundos, como siempre.
  assert.equal(line({ appearances: 1, secondsPerAppearance: MAX }), photo(MAX))
  assert.equal(
    line({
      appearances: 1,
      secondsPerAppearance: MAX,
      threeInFirstTwoMinutes: false,
    }),
    photo(MAX),
  )
  // 5 apariciones de 60 s: las tres primeras al tope y las otras dos a 60 s.
  assert.equal(
    line({
      appearances: 5,
      secondsPerAppearance: MAX,
      threeInFirstTwoMinutes: true,
    }),
    photo(3 * CAP + 2 * MAX),
  )
  // 5 × 10 s: ya salen más de 3 y ninguna pasa del tope, la cifra es la misma.
  assert.equal(
    line({
      appearances: 5,
      secondsPerAppearance: 10,
      threeInFirstTwoMinutes: true,
    }),
    line({ appearances: 5, secondsPerAppearance: 10 }),
  )
  // Con el motor del proyecto: IV (2,31 US$/min) a 3 × 10 s = 1,155.
  assert.equal(
    line({
      appearances: 1,
      secondsPerAppearance: 10,
      engine: 'avatar_iv',
      threeInFirstTwoMinutes: true,
    }),
    1.155,
  )
  // Es lo que pidió Crear, no un techo: sin `upperBound`.
  assert.equal(
    'upperBound' in
      resumeAvatarLine({
        appearances: 1,
        secondsPerAppearance: MAX,
        threeInFirstTwoMinutes: true,
      }),
    false,
  )
})

test('reanudar antes del corte descuenta de las imágenes las apariciones que salen con «3 veces en 2 minutos»', () => {
  const imagesLine = (avatar, options, audioDurationSeconds) =>
    app
      .estimateResumeCost(
        status({
          completedStages: BEFORE_CUT,
          options: {
            imageQuality: '1024x576_low',
            avatar: { ...AVATAR_OPTIONS, ...avatar },
            ...options,
          },
          audioDurationSeconds,
        }),
      )
      .find((line) => line.domain === 'image')
  const oneOfTen = { appearances: 1, secondsPerAppearance: 10 }
  // Por duración: 60 s con 1 aparición de 10 s. Sin la casilla quedan 50 s
  // libres (17 imágenes de 3 s); con ella salen 3 apariciones (30 s) y quedan
  // 30 s libres (10 imágenes).
  assert.deepEqual(imagesLine(oneOfTen, {}, 60), imagesFor(17))
  assert.deepEqual(
    imagesLine({ ...oneOfTen, threeInFirstTwoMinutes: true }, {}, 60),
    imagesFor(10),
  )
  // Con cantidad fija la confirmada incluye las apariciones que salen: 12 − 3,
  // no 12 − 1.
  assert.deepEqual(imagesLine(oneOfTen, { sceneCount: 12 }), imagesFor(11))
  assert.deepEqual(
    imagesLine(
      { ...oneOfTen, threeInFirstTwoMinutes: true },
      { sceneCount: 12 },
    ),
    imagesFor(9),
  )
})

test('Crear y reanudar cuentan lo mismo: la función compartida y todas las combinaciones de la casilla', () => {
  const CAP = EARLY_CAP()
  const MAX = SLIDER_MAX()
  // La función compartida lee `ProjectAvatarOptions` tal cual está en
  // project.json: solo `true` prende la casilla, como el planificador.
  const choice = (
    appearances,
    secondsPerAppearance,
    threeInFirstTwoMinutes,
  ) => ({
    appearances,
    secondsPerAppearance,
    threeInFirstTwoMinutes,
  })
  assert.equal(app.avatarRequestedAppearances(choice(1, MAX, true)), 3)
  assert.equal(app.avatarRequestedSeconds(choice(1, MAX, true)), 3 * CAP)
  assert.equal(app.avatarRequestedAppearances(choice(1, MAX, undefined)), 1)
  assert.equal(app.avatarRequestedSeconds(choice(1, MAX, undefined)), MAX)
  assert.equal(app.avatarRequestedSeconds(choice(4, 12, false)), 48)
  assert.equal(app.avatarRequestedAppearances(choice(1, MAX, 'yes')), 1)
  assert.equal(app.avatarRequestedAppearances(choice(1, MAX, 1)), 1)
  assert.equal(app.avatarRequestedSeconds(choice(1, MAX, 'yes')), MAX)
  assert.equal(app.avatarRequestedSeconds(choice(1, MAX, 1)), MAX)
  // Con las opciones de AVATAR_OPTIONS, tal cual salen del disco.
  assert.equal(app.avatarRequestedAppearances(AVATAR_OPTIONS), 3)
  assert.equal(app.avatarRequestedSeconds(AVATAR_OPTIONS), 30)
  // El mismo pedido por las dos vías —el formulario de Crear y las opciones
  // que guarda el proyecto— cuesta lo mismo, con y sin la casilla, en los
  // límites del tope y en los tres motores.
  const engines = [
    ['avatar_iii', ANA],
    ['avatar_iv', ANA],
    ['avatar_v', photoChoice(true)],
  ]
  let compared = 0
  for (const appearances of [1, 2, 3, 5, 10]) {
    for (const secondsPerAppearance of [5, 10, CAP - 1, CAP, CAP + 1, MAX]) {
      for (const threeInFirstTwoMinutes of [false, true]) {
        for (const [engine, avatar] of engines) {
          const created = app
            .estimateCreateCost(
              form({
                useAvatar: true,
                avatar,
                avatarEngine: engine,
                avatarAppearances: appearances,
                avatarSecondsPerAppearance: secondsPerAppearance,
                avatarThreeInTwoMinutes: threeInFirstTwoMinutes,
              }),
            )
            .find((line) => line.domain === 'avatar')
          const resumed = resumeAvatarLine({
            lookType: avatar.lookType,
            engine,
            appearances,
            secondsPerAppearance,
            ...(threeInFirstTwoMinutes ? { threeInFirstTwoMinutes } : {}),
          })
          const where =
            appearances +
            ' × ' +
            secondsPerAppearance +
            ' s, ' +
            engine +
            (threeInFirstTwoMinutes ? ', con la casilla' : '')
          assert.equal(resumed.estimated, created.estimated, where)
          compared += 1
        }
      }
    }
  }
  assert.equal(compared, 5 * 6 * 2 * 3)
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
