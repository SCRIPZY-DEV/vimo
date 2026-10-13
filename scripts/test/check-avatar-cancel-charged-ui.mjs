// «Cancelar» con apariciones del avatar ya cobradas (entrega 2h, diseño §24.2
// a §24.4), con el store REAL de Crear (useCreateTask) y la pantalla de
// progreso real (GenerationProgress, también dentro de LibraryProgress) en
// Chrome headless. El sidecar no corre: los eventos del job los emite la
// prueba. Fija:
// - Lo cobrado de la corrida (avatarChargedSceneIds): entra una aparición
//   cuando llega a una fase de AVATAR_CHARGED_PHASES (render, download,
//   normalize: HeyGen ya aceptó su render) o queda lista; `audio`, `upload` y
//   el anuncio no cuentan; la que falla sale; se vacía al lanzar otra corrida
//   y sobrevive al reinicio de la app. Cobradas y sin terminar = las que
//   siguen generándose.
// - «Cancelar» sin ninguna cobrada y sin terminar: el «¿Seguro? Cancelar» de
//   siempre, sin aviso. Con alguna: el aviso (título, la cuenta con su plural
//   de 1 y de N, foco en «Seguir generando»); seguir y Escape no cancelan y
//   devuelven el foco a «Cancelar» (el aviso se abre por estado, y Radix no lo
//   haría); «Cancelar igual» pide UNA cancelación aunque llegue un doble
//   clic. Si el job termina con el aviso abierto, el aviso se cierra y no
//   vuelve solo con la corrida siguiente. En la biblioteca, igual.
// - La cuenta del aviso (ruling de unificación del 2026-10-13, el mismo del
//   editor): la de las cobradas y sin terminar al tocar el botón, sube si se
//   cobran más con el aviso abierto y nunca baja; el aviso no se cierra solo
//   cuando terminan las cobradas, sí cuando termina el job o cuando el job cae
//   en la cuenta regresiva del reintento automático (ahí «Cancelar» vuelve al
//   «¿Seguro?» de siempre).
// - «Crear otro» (descarta la corrida viva, `cancelsRun`) con cobradas y sin
//   terminar abre el mismo aviso, que recuerda qué confirma: «Cancelar igual»
//   vuelve descartando, una sola vez, y el foco vuelve a «Crear otro»; sin
//   cobradas descarta como siempre. La vista Create real se lo dice a la
//   pantalla (se monta con el formulario simulado). El botón de vuelta de la
//   biblioteca solo navega y no abre nada.
// - Las teclas sostenidas, de verdad (CDP, `autoRepeat`, foco emulado): un
//   Enter sostenido sobre «Seguir generando» no reabre el aviso ni cancela (las
//   repeticiones que caen en «Cancelar» se ignoran); sobre «Cancelar» sin
//   cobradas arma el «¿Seguro?» y no cancela; sobre «Crear otro» abre el aviso
//   y, al cerrarlo, no lo reabre ni descarta.
// - La tarjeta del fallo dice cuántas apariciones cobradas quedan guardadas
//   (sin ninguna, nada; sin avatar, nada), también debajo de la tarjeta de
//   saldo agotado y tras reiniciar la app.
// Solo `videosApi` se simula (el real importa el cliente de Supabase), y la
// tarjeta de saldo (su hook lee la billetera del sidecar). La raíz guarda
// `onUncaughtError` para que un render roto falle con su mensaje.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { withChrome } from './chrome-session.mjs'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'
import test from 'node:test'

const chrome =
  process.argv[2] ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
// Las teclas que el caso puede pedir. Enter lleva su texto: sin él Chrome no
// activa el botón (ERRORES-CONOCIDOS: cdp-enter-sin-text-retorno-no-activa-el-
// boton). Enter sostenido: un keyDown, después HELD_REPEATS keyDown con
// `autoRepeat` cada HELD_REPEAT_MS y recién ahí el keyUp (como el guard del
// editor).
const KEYS = {
  Enter: { code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
  Escape: { code: 'Escape', windowsVirtualKeyCode: 27 },
}
const HELD_KEY = 'EnterHeld'
const HELD_REPEATS = 25
const HELD_REPEAT_MS = 20
const look = {
  lookId: 'look-ana',
  lookName: 'Ana oficina',
  lookType: 'photo_avatar',
  engine: 'avatar_iii',
  origin: 'auto',
  status: 'planned',
}
// La app se cerró con dos apariciones cobradas y en curso: la tarea vuelve
// interrumpida y la tarjeta del fallo dice que están pagadas y guardadas.
const previous = {
  id: 'tc-previous',
  jobId: 'job-p0',
  projectId: 'p0',
  projectName: 'Anterior',
  status: 'generating',
  activeStages: ['images', 'avatar'],
  completedStages: ['voice', 'transcription', 'scene-cuts', 'scene-prompts'],
  scenes: [
    {
      id: 1,
      text: 'imagen',
      imageStatus: 'ok',
      startSeconds: 0,
      endSeconds: 10,
    },
    {
      id: 2,
      text: '',
      imageStatus: 'ok',
      startSeconds: 10,
      endSeconds: 20,
      avatar: look,
      avatarActivity: {
        status: 'generating',
        phase: 'render',
        elapsedSeconds: 40,
        receivedAt: 1,
      },
    },
    {
      id: 3,
      text: '',
      imageStatus: 'ok',
      startSeconds: 20,
      endSeconds: 30,
      avatar: look,
      avatarActivity: {
        status: 'generating',
        phase: 'download',
        elapsedSeconds: 50,
        receivedAt: 1,
      },
    },
  ],
  audioDurationSeconds: 30,
  voiceProgress: null,
  bgmProgress: null,
  renderProgress: null,
  promptsWritten: null,
  imagesRecovery: null,
  confirmation: null,
  logs: [],
  videoPath: null,
  errorKey: null,
  errorCode: null,
  startedAt: 1,
  pausedAt: null,
  pausedMs: 0,
  finishedAt: null,
  retry: null,
  retryAttempts: 0,
  videoFormat: '16:9',
  cancelRequested: false,
  usesCustomStyle: false,
  promptModel: null,
  promptsStageActivity: null,
  promptModelIssue: null,
  promptModelSwitch: null,
  imageProvider: null,
  voiceVendor: null,
  creditsIssue: null,
  hasAvatar: true,
  avatarChargedSceneIds: [2, 3],
}
const mocks = {
  // Antes de que el store lea el almacenamiento (restoreTask corre al
  // importarlo, después de sus imports) este módulo deja guardada la tarea de
  // un arranque anterior. El job simulado entrega sus eventos por
  // `window.emitPipelineEvent`; cada cancelación pedida queda anotada.
  '@/modules/videos/api': [
    "import { CREATE_TASK_STORAGE_KEY } from './src/modules/videos/constants.ts'",
    "import { videosApi as real } from './src/modules/videos/api/index.ts'",
    'try { localStorage.setItem(CREATE_TASK_STORAGE_KEY, ' +
      JSON.stringify(JSON.stringify(previous)) +
      ') } catch {}',
    'window.cancelJobs = []',
    'window.startedJobs = 0',
    'export const videosApi = {',
    '  ...real,',
    '  isNative: () => true,',
    '  async projectStatus(projectId) { return window.projectStatuses[projectId] },',
    '  async listProjects() { return [] },',
    '  imageSource: (path) => "fixture-image://" + path,',
    '  videoSource: (path) => "fixture-media://" + path,',
    '  async startPipeline(payload, onEvent) { window.emitPipelineEvent = onEvent; window.startedJobs += 1; return { jobId: "job-" + payload.projectId + "-" + window.startedJobs, stop() {} } },',
    '  async cancelJob(jobId) { window.cancelJobs.push(jobId) },',
    '}',
  ].join('\n'),
  // El real arrastra el cliente de Supabase, que exige variables de entorno
  // al cargarse: una sesión vacía alcanza (ninguna llamada va a vimo.click).
  '@/modules/common/supabase/client':
    'export const supabase = { auth: { getSession: async () => ({ data: { session: null } }) } }',
  // Su hook lee la billetera del sidecar: acá solo importa que la pantalla la
  // elija ante un saldo agotado.
  '@/modules/videos/components/InsufficientCreditsCard':
    'import React from "react"\nexport function InsufficientCreditsCard(props) { return React.createElement("div", { "data-credits-card": props.context.domain }, props.message) }',
  // La vista Create real se monta solo por su pantalla de progreso (el
  // cableado de «Crear otro»): el formulario no hace falta.
  '@/modules/videos/components/CreateForm':
    'export function CreateForm() { window.createFormShown = true; return null }',
}
const entry = String.raw`
import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Routes, Route } from 'react-router'
import es from './public/locales/es.json'
import { GenerationProgress } from '@/modules/videos/components/GenerationProgress'
import { VideosRoutes } from '@/modules/videos/constants'
import { useCreateTask } from '@/modules/videos/hooks/useCreateTask'
import { Create } from '@/modules/videos/views/Create'
import { chargedAvatarScenesInFlight, chargedSceneIdsWithAvatarEvent, chargedWarningAfterRender } from '@/modules/videos/utilities/avatarTaskEvents'
import { LibraryProgress } from '@/modules/videos/views/LibraryProgress/LibraryProgress'

let checks = 0
let renderError
const check = (condition, message) => { if (!condition) throw new Error(message); checks += 1 }
const delay = (ms = 30) => new Promise((done) => setTimeout(done, ms))
const text = () => document.getElementById('root').textContent
async function waitFor(get, message) {
  for (let index = 0; index < 120; index++) { if (renderError) throw renderError; const value = get(); if (value) return value; await delay() }
  throw new Error(message + ' (en pantalla: ' + text().slice(0, 300) + ')')
}
await i18n.init({ lng: 'es', resources: { es: { translation: es } }, interpolation: { escapeValue: false } })
const reactRoot = createRoot(document.getElementById('root'), { onUncaughtError: (error) => { renderError = error } })
let revision = 0
const render = (node) => reactRoot.render(<I18nextProvider key={++revision} i18n={i18n}>{node}</I18nextProvider>)
// Una clave ausente se traduce como su ruta: comparar con i18n.t de la misma
// clave pasaría en vacío. Cada texto contra el que se compara es una frase.
function phrase(key, options) {
  const sentence = i18n.t(key, options)
  check(i18n.exists(key, options) && sentence !== key && !sentence.includes('{{'), 'la clave ' + key + ' es una frase del catálogo: ' + sentence)
  return sentence
}
const says = {
  cancel: phrase('create.progress.cancel'),
  cancelConfirm: phrase('create.progress.cancelConfirm'),
  createAnother: phrase('create.progress.createAnother'),
  backToLibrary: phrase('library.player.backToLibrary'),
  title: phrase('create.progress.cancelAvatarTitle'),
  bodyOne: phrase('create.progress.cancelAvatarBody', { count: 1 }),
  bodyTwo: phrase('create.progress.cancelAvatarBody', { count: 2 }),
  bodyThree: phrase('create.progress.cancelAvatarBody', { count: 3 }),
  keep: phrase('create.progress.cancelAvatarKeep'),
  confirm: phrase('create.progress.cancelAvatarConfirm'),
  keptOne: phrase('create.progress.error.avatarKept', { count: 1 }),
  keptTwo: phrase('create.progress.error.avatarKept', { count: 2 }),
  keptThree: phrase('create.progress.error.avatarKept', { count: 3 }),
}
check(says.bodyOne !== says.bodyThree && says.bodyThree.includes('3') && says.keptOne !== says.keptTwo, 'los textos con cuenta tienen su plural de 1 y de N')
// La línea de lo guardado con cualquier cifra: la de una, o el resto de la de
// varias después de su número.
const keptOtherTail = says.keptTwo.slice(says.keptTwo.indexOf('2') + 1)
check(keptOtherTail.length > 40 && says.keptThree.endsWith(keptOtherTail), 'la cola de la línea de varias no depende de la cifra')
const keptShown = () => text().includes(says.keptOne) || text().includes(keptOtherTail)

const store = () => window.store
const emit = (event) => window.emitPipelineEvent(event)
const buttonSaying = (root, label) => [...(root?.querySelectorAll('button') ?? [])].find((button) => button.textContent.trim() === label) ?? null
const headerCancel = () => buttonSaying(document.getElementById('root'), says.cancel) ?? buttonSaying(document.getElementById('root'), says.cancelConfirm)
const headerBack = () => buttonSaying(document.getElementById('root'), says.createAnother) ?? buttonSaying(document.getElementById('root'), says.backToLibrary)
const dialog = () => document.querySelector('[role="alertdialog"]')
const keepButton = () => buttonSaying(dialog(), says.keep)
const confirmButton = () => buttonSaying(dialog(), says.confirm)
const activeName = () => document.activeElement?.tagName + ' ' + (document.activeElement?.textContent ?? '').trim().slice(0, 40)
window.cancelCalls = 0
window.backCalls = 0

// Las teclas son de verdad: la página las pide y el arnés las manda por CDP
// (con el foco emulado, así un Enter cae en el botón enfocado).
window.keyQueue = []
window.keysDone = new Set()
let keyId = 0
async function press(key) {
  const id = ++keyId
  window.keyQueue.push({ id, key })
  await waitFor(() => window.keysDone.has(id), 'la tecla ' + key + ' llegó')
  await delay()
}
const ENTER_HELD = 'EnterHeld'
const pressEscape = () => press('Escape')
// Las repeticiones de una tecla sostenida sobre cada botón (por su texto): si
// cada una se ignoró (preventDefault de ignoreHeldKey). React escucha en su
// raíz o en el portal, antes que este listener del documento.
window.heldOn = new Map()
document.addEventListener('keydown', (event) => {
  if (!event.repeat || !(event.target instanceof HTMLButtonElement)) return
  const label = event.target.textContent.trim()
  const seen = window.heldOn.get(label) ?? { repeats: 0, ignored: 0 }
  seen.repeats += 1
  if (event.defaultPrevented) seen.ignored += 1
  window.heldOn.set(label, seen)
})
const heldOn = (label) => window.heldOn.get(label) ?? { repeats: 0, ignored: 0 }

// La pantalla de Crear: la de progreso con el store real. Cancelar cuenta las
// veces que la pantalla lo pide y llama al cancelar de verdad; «Crear otro»
// cuenta las suyas y descarta la tarea, como Create (que además guarda el
// borrador), y avisa que descarta la corrida viva.
function LiveProgress() {
  const api = useCreateTask()
  window.store = api
  if (!api.task) return null
  const noop = () => {}
  const back = { labelKey: 'create.progress.createAnother', onClick: () => { window.backCalls += 1; api.discardTask() }, cancelsRun: true }
  return <GenerationProgress task={api.task} back={back} onCancel={() => { window.cancelCalls += 1; api.cancel() }} onRetryPipeline={() => void api.resume()} onContinueInEditor={noop} onConfirmScenes={noop} onDismissConfirmation={noop} onPromptModelStall={noop} onSnoozePromptModelIssue={noop} onSwitchPromptModel={noop} onSwitchVoice={noop} />
}
const mountCreate = async (probeId) => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><div data-probe={probeId}><MemoryRouter><LiveProgress /></MemoryRouter></div></QueryClientProvider>)
  await waitFor(() => document.querySelector('[data-probe="' + probeId + '"]') && store(), 'la pantalla ' + probeId)
}
const BEFORE_IMAGES = ['voice', 'transcription', 'scene-cuts', 'scene-prompts']
const look = { lookId: 'look-ana', lookName: 'Ana oficina', lookType: 'photo_avatar', engine: 'avatar_iii', origin: 'auto', status: 'planned' }
const readyLook = { ...look, status: 'ready', clipPath: '/p/avatar/scene.mp4', clipMtimeMs: 5 }
const imageScene = (id, startSeconds) => ({ id, text: 'imagen ' + id, imageStatus: 'pending', startSeconds, endSeconds: startSeconds + 10 })
const avatarScene = (id, startSeconds) => ({ id, text: '', imageStatus: 'ok', imagePath: '/p/scenes/scene_' + id + '.jpg', startSeconds, endSeconds: startSeconds + 10, avatar: look })
const scenes = [imageScene(1, 0), avatarScene(2, 10), avatarScene(3, 20), avatarScene(4, 30), avatarScene(5, 40), avatarScene(6, 50)]
// Una corrida con las imágenes y el avatar a la vez, desde el disco.
const startRun = async (projectId, options = {}) => {
  store().discardTask()
  await waitFor(() => store().task === null, 'se descarta la tarea')
  window.cancelCalls = 0
  window.backCalls = 0
  window.cancelJobs.length = 0
  window.heldOn.clear()
  await store().startPipelineForProject(projectId, 'Proyecto ' + projectId, { hasAvatar: true, seed: { scenes, completedStages: BEFORE_IMAGES, audioDurationSeconds: 60 }, ...options })
  await waitFor(() => store().task?.projectId === projectId && store().task.jobId !== null, 'arranca ' + projectId)
  emit({ type: 'stage-started', stageId: 'images' })
  emit({ type: 'stage-started', stageId: 'avatar' })
}
// Cierra una cancelación pedida: el sidecar confirma el cierre del job.
const settleCancel = async () => {
  emit({ type: 'job-failed', code: 'cancelled', message: 'cancelado' })
  await waitFor(() => store().task === null, 'la cancelación se cierra')
}

try {
  // 1. Lo cobrado de la corrida, puro.
  const progress = (sceneId, phase) => ({ type: 'avatar-scene-progress', sceneId, phase, elapsedSeconds: 3 })
  const none = []
  check(chargedSceneIdsWithAvatarEvent(none, { type: 'avatar-scene-started', sceneId: 2 }) === none && chargedSceneIdsWithAvatarEvent(none, progress(2, 'audio')) === none && chargedSceneIdsWithAvatarEvent(none, progress(2, 'upload')) === none, 'el anuncio, el audio y la subida no cobran: la misma lista')
  for (const phase of ['render', 'download', 'normalize'])
    check(JSON.stringify(chargedSceneIdsWithAvatarEvent(none, progress(2, phase))) === '[2]', 'la fase ' + phase + ' cuenta como cobrada')
  const one = [2]
  check(chargedSceneIdsWithAvatarEvent(one, progress(2, 'download')) === one && chargedSceneIdsWithAvatarEvent(one, { type: 'avatar-scene-ready', sceneId: 2, scene: avatarScene(2, 10) }) === one, 'una ya anotada no se repite')
  check(JSON.stringify(chargedSceneIdsWithAvatarEvent(one, { type: 'avatar-scene-ready', sceneId: 3, scene: avatarScene(3, 20) })) === '[2,3]', 'la que queda lista cuenta (aunque viniera de un recibo ya pagado)')
  check(JSON.stringify(chargedSceneIdsWithAvatarEvent([2, 3], { type: 'avatar-scene-failed', sceneId: 2, code: 'avatar_render_failed' })) === '[3]' && chargedSceneIdsWithAvatarEvent(one, { type: 'avatar-scene-failed', sceneId: 4, code: 'avatar_timeout' }) === one, 'la que falla sale (un render fallido no se cobra); una que no estaba no cambia nada')
  const generating = (id, phase) => ({ ...avatarScene(id, id * 10), avatarActivity: { status: 'generating', phase, elapsedSeconds: 3, receivedAt: 1 } })
  check(chargedAvatarScenesInFlight({ avatarChargedSceneIds: [2, 3, 4], scenes: [generating(2, 'render'), { ...avatarScene(3, 30), avatarActivity: { status: 'ready', phase: 'normalize', elapsedSeconds: 9, receivedAt: 1 } }, avatarScene(4, 40), generating(5, 'upload')] }) === 1, 'cobradas y sin terminar: solo las anotadas que siguen generándose')
  // El aviso render a render (ruling de unificación): cerrado sigue cerrado;
  // sin job vivo se cierra; abierto, la cuenta sube y nunca baja.
  const openWarning = { count: 2, action: 'back' }
  check(chargedWarningAfterRender(null, 3, false) === null && chargedWarningAfterRender(openWarning, 3, true) === null, 'cerrado sigue cerrado, y sin job vivo se cierra')
  check([2, 1, 0].every((inFlight) => chargedWarningAfterRender(openWarning, inFlight, false) === openWarning), 'abierto, la cuenta no baja ni se cierra solo cuando terminan las cobradas: el mismo aviso')
  check(JSON.stringify(chargedWarningAfterRender(openWarning, 3, false)) === JSON.stringify({ count: 3, action: 'back' }), 'abierto, la cuenta sube si hay más cobradas en curso, con la misma acción')

  // 2. Reiniciar la app con apariciones cobradas en curso: la tarea vuelve
  // interrumpida y la tarjeta del fallo dice que están guardadas.
  await mountCreate('restored')
  await waitFor(() => store().task?.status === 'error' && text().includes(says.keptTwo), 'tras reiniciar, la tarjeta del fallo dice que las 2 cobradas están guardadas')
  check(JSON.stringify(store().task.avatarChargedSceneIds) === '[2,3]' && JSON.stringify(store().task.activeStages) === '[]', 'lo cobrado sobrevive al reinicio; las fases en curso, no')

  // 3. El store con los eventos del sidecar.
  await startRun('pa')
  check(JSON.stringify(store().task.avatarChargedSceneIds) === '[]', 'una corrida nueva arranca sin nada cobrado')
  emit({ type: 'avatar-scene-started', sceneId: 2 })
  emit(progress(2, 'audio'))
  emit(progress(2, 'upload'))
  await waitFor(() => store().task.scenes[1].avatarActivity?.phase === 'upload', 'la aparición sube su audio')
  check(JSON.stringify(store().task.avatarChargedSceneIds) === '[]', 'antes de que HeyGen acepte el render no hay nada cobrado')
  emit(progress(2, 'render'))
  emit({ type: 'avatar-scene-started', sceneId: 3 })
  emit(progress(3, 'render'))
  emit(progress(3, 'download'))
  emit({ type: 'avatar-scene-ready', sceneId: 3, scene: { ...avatarScene(3, 20), avatar: readyLook } })
  emit({ type: 'avatar-scene-started', sceneId: 4 })
  emit(progress(4, 'render'))
  emit({ type: 'avatar-scene-failed', sceneId: 4, code: 'avatar_render_failed' })
  await waitFor(() => store().task.scenes[3].avatarActivity?.status === 'failed', 'la cuarta falla')
  check(JSON.stringify(store().task.avatarChargedSceneIds) === '[2,3]' && chargedAvatarScenesInFlight(store().task) === 1, 'cobradas: la que renderiza y la lista, sin la fallida; sin terminar, una')

  // 4. Sin ninguna cobrada y sin terminar (otra corrida, con una aparición
  // que todavía sube su audio): el «¿Seguro? Cancelar» de siempre.
  emit({ type: 'job-failed', code: 'render_failed', message: 'fin' })
  await waitFor(() => store().task.status === 'error', 'se corta la corrida')
  await startRun('pb')
  emit({ type: 'avatar-scene-started', sceneId: 2 })
  emit(progress(2, 'upload'))
  await waitFor(() => store().task.scenes[1].avatarActivity?.phase === 'upload', 'una aparición sube su audio')
  headerCancel().click()
  await waitFor(() => buttonSaying(document.getElementById('root'), says.cancelConfirm), 'el primer clic pide «¿Seguro? Cancelar»')
  await delay(150)
  check(dialog() === null && window.cancelCalls === 0, 'sin apariciones cobradas no hay aviso y el primer clic no cancela')
  headerCancel().click()
  await waitFor(() => window.cancelCalls === 1, 'el segundo clic cancela')
  check(JSON.stringify(window.cancelJobs) === '["job-pb-' + window.startedJobs + '"]', 'una cancelación del job: ' + JSON.stringify(window.cancelJobs))
  await settleCancel()

  // 4b. Un Enter sostenido sobre «Cancelar», sin cobradas: el primer Enter
  // arma el «¿Seguro? Cancelar» y las repeticiones se ignoran (sin eso, la
  // primera repetición cancelaba la generación).
  await mountCreate('held-cancel')
  await startRun('pb2')
  emit({ type: 'avatar-scene-started', sceneId: 2 })
  emit(progress(2, 'upload'))
  await waitFor(() => store().task.scenes[1].avatarActivity?.phase === 'upload', 'una aparición sube su audio')
  headerCancel().focus()
  await waitFor(() => document.activeElement === headerCancel(), 'el foco en «Cancelar»')
  await press(ENTER_HELD)
  await waitFor(() => buttonSaying(document.getElementById('root'), says.cancelConfirm), 'el primer Enter arma el «¿Seguro? Cancelar»')
  await delay(150)
  check(window.cancelCalls === 0 && window.cancelJobs.length === 0 && dialog() === null, 'un Enter sostenido sobre «Cancelar» no cancela: ' + window.cancelCalls)
  const onHeaderCancel = [says.cancel, says.cancelConfirm].map(heldOn)
  const headerRepeats = onHeaderCancel.reduce((sum, seen) => sum + seen.repeats, 0)
  check(headerRepeats > 0 && onHeaderCancel.every((seen) => seen.ignored === seen.repeats), 'cada repetición sobre el «Cancelar» de la cabecera se ignora: ' + JSON.stringify([...window.heldOn]))
  emit({ type: 'job-failed', code: 'render_failed', message: 'fin' })
  await waitFor(() => store().task.status === 'error', 'se libera el turno')

  // 5. Una cobrada y sin terminar: el aviso, con foco en «Seguir generando».
  // Seguir y Escape no cancelan, y el foco vuelve a «Cancelar» (el aviso se
  // abre por estado: sin eso, Radix lo deja en body).
  await mountCreate('one-charged')
  await startRun('pc')
  emit({ type: 'avatar-scene-started', sceneId: 2 })
  emit(progress(2, 'render'))
  emit({ type: 'avatar-scene-started', sceneId: 3 })
  emit(progress(3, 'upload'))
  await waitFor(() => chargedAvatarScenesInFlight(store().task) === 1, 'una cobrada en curso')
  headerCancel().click()
  await waitFor(() => dialog()?.textContent.includes(says.bodyOne), 'el aviso con una aparición cobrada')
  check(dialog().textContent.includes(says.title) && keepButton() && confirmButton(), 'el aviso: su título y sus dos botones')
  await waitFor(() => document.activeElement === keepButton(), 'el foco abre en «Seguir generando»: ' + document.activeElement?.tagName + ' ' + document.activeElement?.textContent)
  checks += 1
  check(!buttonSaying(document.getElementById('root'), says.cancelConfirm), 'con el aviso no hace falta el «¿Seguro?»')
  keepButton().click()
  await waitFor(() => dialog() === null, 'seguir generando cierra el aviso')
  await delay(150)
  check(window.cancelCalls === 0 && window.cancelJobs.length === 0 && store().task?.status === 'generating', 'seguir generando no cancela nada')
  check(document.activeElement === headerCancel(), 'el foco vuelve a «Cancelar», nunca a body: ' + document.activeElement?.tagName)
  headerCancel().click()
  await waitFor(() => dialog()?.textContent.includes(says.bodyOne) && document.activeElement === keepButton(), 'el aviso otra vez')
  await pressEscape()
  await waitFor(() => dialog() === null, 'Escape cierra el aviso')
  await delay(150)
  check(window.cancelCalls === 0 && window.cancelJobs.length === 0 && store().task?.status === 'generating', 'Escape es seguir: no cancela')
  check(document.activeElement === headerCancel(), 'tras Escape el foco vuelve a «Cancelar»: ' + document.activeElement?.tagName)

  // 5b. Un Enter sostenido sobre «Seguir generando» (I-2 de la revisión): el
  // primer Enter cierra el aviso y el foco vuelve a «Cancelar»; las
  // repeticiones que siguen caen ahí y se ignoran: el aviso no rebota ni se
  // cancela nada.
  headerCancel().click()
  await waitFor(() => dialog()?.textContent.includes(says.bodyOne) && document.activeElement === keepButton(), 'el aviso, con el foco en «Seguir generando»')
  window.heldOn.clear()
  await press(ENTER_HELD)
  await waitFor(() => dialog() === null, 'el Enter cierra el aviso')
  await delay(200)
  const heldOnCancel = heldOn(says.cancel)
  check(dialog() === null && window.cancelCalls === 0 && window.cancelJobs.length === 0 && store().task?.status === 'generating', 'el Enter sostenido no reabre el aviso ni cancela')
  check(heldOnCancel.repeats > 0 && heldOnCancel.ignored === heldOnCancel.repeats, 'las repeticiones cayeron en «Cancelar» y se ignoraron todas: ' + JSON.stringify([...window.heldOn]))
  check(document.activeElement === headerCancel(), 'el foco quedó en «Cancelar»: ' + activeName())

  // 6. Tres cobradas y sin terminar (render, download, normalize), una que
  // todavía sube y una lista: el aviso con la cuenta de las tres. «Cancelar
  // igual» con doble clic: un solo pedido.
  emit(progress(3, 'render'))
  emit({ type: 'avatar-scene-started', sceneId: 4 })
  emit(progress(4, 'render'))
  emit(progress(4, 'download'))
  emit(progress(4, 'normalize'))
  emit({ type: 'avatar-scene-started', sceneId: 5 })
  emit(progress(5, 'upload'))
  emit({ type: 'avatar-scene-started', sceneId: 6 })
  emit(progress(6, 'render'))
  emit({ type: 'avatar-scene-ready', sceneId: 6, scene: { ...avatarScene(6, 50), avatar: readyLook } })
  await waitFor(() => chargedAvatarScenesInFlight(store().task) === 3, 'tres cobradas en curso')
  headerCancel().click()
  await waitFor(() => dialog()?.textContent.includes(says.bodyThree), 'el aviso con tres apariciones cobradas')
  checks += 1
  const confirm = confirmButton()
  confirm.click()
  confirm.click()
  await waitFor(() => window.cancelJobs.length > 0, 'se pide la cancelación')
  await delay(200)
  check(window.cancelCalls === 1 && window.cancelJobs.length === 1, '«Cancelar igual» con doble clic cancela una sola vez: ' + window.cancelCalls + ' pedidos, ' + JSON.stringify(window.cancelJobs))
  check(store().task === null, 'cancelar no deja la pantalla a la vista')
  await settleCancel()

  // 6b. La cuenta del aviso (ruling de unificación): la del clic, sube si se
  // cobran más con el aviso abierto y nunca baja; el aviso no se cierra solo
  // aunque terminen todas las cobradas.
  await mountCreate('count-rule')
  await startRun('pc2')
  emit({ type: 'avatar-scene-started', sceneId: 2 })
  emit(progress(2, 'render'))
  await waitFor(() => chargedAvatarScenesInFlight(store().task) === 1, 'una cobrada en curso')
  headerCancel().click()
  await waitFor(() => dialog()?.textContent.includes(says.bodyOne), 'el aviso con una')
  emit({ type: 'avatar-scene-started', sceneId: 3 })
  emit(progress(3, 'download'))
  await waitFor(() => dialog()?.textContent.includes(says.bodyTwo), 'con el aviso abierto se cobra otra: la cuenta sube a dos')
  checks += 1
  emit({ type: 'avatar-scene-ready', sceneId: 2, scene: { ...avatarScene(2, 10), avatar: readyLook } })
  await waitFor(() => chargedAvatarScenesInFlight(store().task) === 1, 'una de las dos termina')
  await delay(150)
  check(dialog()?.textContent.includes(says.bodyTwo), 'la cuenta no baja cuando una termina')
  emit({ type: 'avatar-scene-ready', sceneId: 3, scene: { ...avatarScene(3, 20), avatar: readyLook } })
  await waitFor(() => chargedAvatarScenesInFlight(store().task) === 0, 'terminan todas las cobradas')
  await delay(150)
  check(dialog()?.textContent.includes(says.bodyTwo), 'el aviso no se cierra solo aunque terminen todas: sigue diciendo dos')
  keepButton().click()
  await waitFor(() => dialog() === null, 'seguir generando lo cierra')
  check(window.cancelCalls === 0 && window.cancelJobs.length === 0, 'nada cancelado')

  // 6c. El job cae en la cuenta regresiva del reintento automático con el
  // aviso abierto (M-2 de la revisión): el aviso se cierra —no hay job vivo
  // que cortar— y «Cancelar» vuelve al «¿Seguro?» de siempre (R-2h-5).
  emit({ type: 'avatar-scene-started', sceneId: 4 })
  emit(progress(4, 'render'))
  await waitFor(() => chargedAvatarScenesInFlight(store().task) === 1, 'otra cobrada en curso')
  headerCancel().click()
  await waitFor(() => dialog()?.textContent.includes(says.bodyOne), 'el aviso abierto')
  emit({ type: 'job-failed', code: 'image_rate_limited', message: 'límite de imágenes' })
  await waitFor(() => store().task?.retry && dialog() === null, 'con la cuenta regresiva el aviso se cierra')
  check(store().task.status === 'generating' && store().task.jobId === null && window.cancelJobs.length === 0, 'el reintento espera sin job vivo y nada se canceló')
  await waitFor(() => document.activeElement === headerCancel(), 'el foco vuelve a «Cancelar», que sigue a la vista: ' + activeName())
  checks += 1
  headerCancel().click()
  await waitFor(() => buttonSaying(document.getElementById('root'), says.cancelConfirm), 'durante la cuenta regresiva, «Cancelar» pide el «¿Seguro?» de siempre')
  check(dialog() === null, 'sin el aviso de lo cobrado: no hay un render en curso')
  headerCancel().click()
  await waitFor(() => store().task === null, 'el segundo clic descarta la tarea')
  check(window.cancelCalls === 1 && window.cancelJobs.length === 0, 'sin job vivo, cancelar no le pide nada al sidecar')

  // 7. El job termina con el aviso abierto: el aviso se va y no vuelve solo
  // con la corrida siguiente. La tarjeta del fallo dice lo cobrado.
  await mountCreate('ends-open')
  await startRun('pd')
  emit({ type: 'avatar-scene-started', sceneId: 2 })
  emit(progress(2, 'render'))
  emit({ type: 'avatar-scene-started', sceneId: 3 })
  emit(progress(3, 'render'))
  emit({ type: 'avatar-scene-ready', sceneId: 3, scene: { ...avatarScene(3, 20), avatar: readyLook } })
  emit({ type: 'avatar-scene-started', sceneId: 4 })
  emit(progress(4, 'download'))
  await waitFor(() => chargedAvatarScenesInFlight(store().task) === 2, 'dos cobradas en curso y una lista')
  headerCancel().click()
  await waitFor(() => dialog(), 'el aviso abierto')
  emit({ type: 'job-failed', code: 'render_failed', message: 'se cortó' })
  await waitFor(() => store().task.status === 'error' && dialog() === null, 'con el job terminado el aviso se cierra solo')
  // «Cancelar» ya no está (no hay job): el foco cae en el título de la
  // pantalla, que no actúa con Enter, y no en body (re-revisión de la ronda 1).
  await waitFor(() => document.activeElement?.tagName === 'H1', 'sin «Cancelar», el foco va al título: ' + activeName())
  await waitFor(() => text().includes(says.keptThree), 'la tarjeta del fallo: las tres cobradas (dos en curso y la lista) están guardadas')
  check(window.cancelCalls === 0 && window.cancelJobs.length === 0, 'el fin del job no canceló nada')
  // Reintentar: otra corrida, sin nada cobrado y sin el aviso.
  buttonSaying(document.getElementById('root'), i18n.t('create.progress.error.retryFromCheckpoint')).click()
  await waitFor(() => store().task.status === 'generating' && store().task.jobId !== null, 'la corrida siguiente')
  await delay(200)
  check(dialog() === null && JSON.stringify(store().task.avatarChargedSceneIds) === '[]' && !keptShown(), 'la corrida siguiente arranca sin nada cobrado y el aviso no vuelve solo')
  emit({ type: 'job-failed', code: 'render_failed', message: 'fin' })
  await waitFor(() => store().task.status === 'error', 'se libera el turno')

  // 8. La tarjeta del fallo sin cobradas (una que solo subió su audio, otra
  // que falló) no dice nada; un proyecto sin avatar, tampoco.
  await startRun('pe')
  emit({ type: 'avatar-scene-started', sceneId: 2 })
  emit(progress(2, 'upload'))
  emit({ type: 'avatar-scene-started', sceneId: 3 })
  emit(progress(3, 'render'))
  emit({ type: 'avatar-scene-failed', sceneId: 3, code: 'avatar_render_failed' })
  emit({ type: 'job-failed', code: 'render_failed', message: 'fin' })
  await waitFor(() => store().task.status === 'error' && text().includes(i18n.t('create.progress.error.title')), 'la tarjeta del fallo')
  check(!keptShown(), 'sin apariciones cobradas la tarjeta no dice nada del avatar')
  store().discardTask()
  await waitFor(() => store().task === null, 'se descarta la tarea')
  await store().startPipelineForProject('pf', 'Sin avatar', { seed: { scenes: [imageScene(1, 0)], completedStages: BEFORE_IMAGES, audioDurationSeconds: 10 } })
  await waitFor(() => store().task?.projectId === 'pf' && store().task.jobId !== null, 'arranca sin avatar')
  emit({ type: 'stage-started', stageId: 'images' })
  emit({ type: 'job-failed', code: 'render_failed', message: 'fin' })
  await waitFor(() => store().task.status === 'error' && text().includes(i18n.t('create.progress.error.title')), 'la tarjeta del fallo sin avatar')
  check(!keptShown(), 'un proyecto sin avatar no dice nada del avatar')

  // 9. La pausa por saldo con apariciones cobradas: la línea va debajo de la
  // tarjeta de saldo.
  await startRun('pg')
  emit({ type: 'avatar-scene-started', sceneId: 2 })
  emit(progress(2, 'render'))
  emit({ type: 'stage-completed', stageId: 'images' })
  emit({ type: 'job-failed', code: 'avatar_insufficient_credits', message: 'sin saldo' })
  const creditsCard = await waitFor(() => document.querySelector('[data-credits-card="avatar"]'), 'la tarjeta de saldo del avatar')
  await waitFor(() => text().includes(says.keptOne), 'la pausa por saldo dice que la aparición cobrada está guardada')
  const keptLine = [...document.querySelectorAll('p')].find((paragraph) => paragraph.textContent === says.keptOne)
  check(keptLine && (creditsCard.compareDocumentPosition(keptLine) & Node.DOCUMENT_POSITION_FOLLOWING) && creditsCard.parentElement === keptLine.parentElement, 'la línea va justo debajo de la tarjeta de saldo')

  // 10. La biblioteca: el mismo aviso y una sola cancelación.
  window.projectStatuses = {
    pl: { metadata: { name: 'En la biblioteca', state: 'generating', completedStages: BEFORE_IMAGES, audioDurationSeconds: 60, options: { videoFormat: '16:9', imageProvider: 'fal', avatar: { avatarId: 'a1', lookId: 'look-ana', lookName: 'Ana oficina', lookType: 'photo_avatar', engine: 'avatar_iii', appearances: 3, secondsPerAppearance: 10, startWithAvatar: false, placement: 'auto' } } }, scenes },
  }
  store().discardTask()
  await waitFor(() => store().task === null, 'se descarta la tarea')
  window.cancelCalls = 0
  window.cancelJobs.length = 0
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <div data-probe="library">
        <MemoryRouter initialEntries={['/library/pl/progress']}>
          <LiveStore />
          <Routes><Route path="/library/:projectId/progress" element={<LibraryProgress />} /></Routes>
        </MemoryRouter>
      </div>
    </QueryClientProvider>,
  )
  const resumeButton = await waitFor(() => document.querySelector('[data-probe="library"]') && buttonSaying(document.getElementById('root'), i18n.t('common.resume')), 'el botón de reanudar de la biblioteca')
  resumeButton.click()
  await waitFor(() => store().task?.projectId === 'pl' && store().task.jobId !== null, 'reanuda desde la biblioteca')
  emit({ type: 'stage-started', stageId: 'images' })
  emit({ type: 'stage-started', stageId: 'avatar' })
  emit({ type: 'avatar-scene-started', sceneId: 2 })
  emit(progress(2, 'render'))
  emit({ type: 'avatar-scene-started', sceneId: 3 })
  emit(progress(3, 'normalize'))
  await waitFor(() => chargedAvatarScenesInFlight(store().task) === 2, 'dos cobradas en curso en la biblioteca')
  headerCancel().click()
  await waitFor(() => dialog()?.textContent.includes(phrase('create.progress.cancelAvatarBody', { count: 2 })), 'en la biblioteca, el aviso con dos apariciones cobradas')
  const libraryConfirm = confirmButton()
  libraryConfirm.click()
  libraryConfirm.click()
  await waitFor(() => window.cancelJobs.length > 0, 'la biblioteca pide la cancelación')
  await delay(200)
  check(window.cancelJobs.length === 1, 'en la biblioteca, «Cancelar igual» con doble clic cancela una sola vez: ' + JSON.stringify(window.cancelJobs))
  await settleCancel()

  // 11. «Crear otro» descarta la corrida viva (I-1 de la revisión): con
  // cobradas y sin terminar pasa antes por el mismo aviso, que recuerda qué
  // confirma; seguir y Escape no descartan y el foco vuelve a «Crear otro».
  await mountCreate('create-another')
  await startRun('ph')
  emit({ type: 'avatar-scene-started', sceneId: 2 })
  emit(progress(2, 'render'))
  await waitFor(() => chargedAvatarScenesInFlight(store().task) === 1, 'una cobrada en curso')
  headerBack().click()
  await waitFor(() => dialog()?.textContent.includes(says.bodyOne), '«Crear otro» abre el aviso con una cobrada')
  await delay(150)
  check(window.backCalls === 0 && window.cancelJobs.length === 0 && store().task?.status === 'generating', 'abrir el aviso no descarta nada')
  keepButton().click()
  await waitFor(() => dialog() === null, 'seguir generando cierra el aviso')
  await waitFor(() => document.activeElement === headerBack(), 'el foco vuelve a «Crear otro», el botón que abrió el aviso: ' + activeName())
  checks += 1
  check(window.backCalls === 0 && window.cancelJobs.length === 0, 'seguir generando no descarta')
  headerBack().click()
  await waitFor(() => dialog() && document.activeElement === keepButton(), 'el aviso otra vez')
  await pressEscape()
  await waitFor(() => dialog() === null, 'Escape cierra el aviso')
  await waitFor(() => document.activeElement === headerBack(), 'tras Escape, el foco en «Crear otro»: ' + activeName())
  checks += 1
  check(window.backCalls === 0 && window.cancelJobs.length === 0, 'Escape no descarta')
  // Un Enter sostenido sobre «Crear otro» solo abre el aviso; otro sobre
  // «Seguir generando» lo cierra, y las repeticiones que caen en «Crear otro»
  // no lo reabren ni descartan.
  window.heldOn.clear()
  await press(ENTER_HELD)
  await waitFor(() => dialog()?.textContent.includes(says.bodyOne), 'el Enter sobre «Crear otro» abre el aviso')
  await delay(150)
  check(window.backCalls === 0 && window.cancelJobs.length === 0 && [...window.heldOn.values()].every((seen) => seen.ignored === seen.repeats), 'el Enter sostenido sobre «Crear otro» solo abre el aviso: cada repetición se ignora (' + JSON.stringify([...window.heldOn]) + ')')
  await waitFor(() => document.activeElement === keepButton(), 'el foco en «Seguir generando»')
  window.heldOn.clear()
  await press(ENTER_HELD)
  await waitFor(() => dialog() === null, 'el Enter cierra el aviso')
  await delay(200)
  const heldOnBack = heldOn(says.createAnother)
  check(dialog() === null && window.backCalls === 0 && window.cancelJobs.length === 0 && document.activeElement === headerBack(), 'las repeticiones que caen en «Crear otro» no reabren el aviso ni descartan: ' + activeName())
  check(heldOnBack.repeats > 0 && heldOnBack.ignored === heldOnBack.repeats, '«Crear otro» ignora cada repetición: ' + JSON.stringify([...window.heldOn]))
  // Con tres cobradas, «Cancelar igual» con doble clic vuelve descartando una
  // sola vez, sin pasar por «Cancelar».
  emit({ type: 'avatar-scene-started', sceneId: 3 })
  emit(progress(3, 'download'))
  emit({ type: 'avatar-scene-started', sceneId: 4 })
  emit(progress(4, 'normalize'))
  await waitFor(() => chargedAvatarScenesInFlight(store().task) === 3, 'tres cobradas en curso')
  headerBack().click()
  await waitFor(() => dialog()?.textContent.includes(says.bodyThree), '«Crear otro» con tres cobradas')
  checks += 1
  const backConfirm = confirmButton()
  backConfirm.click()
  backConfirm.click()
  await waitFor(() => window.backCalls > 0, 'vuelve descartando')
  await delay(200)
  check(window.backCalls === 1 && window.cancelCalls === 0 && window.cancelJobs.length === 1, '«Cancelar igual» de «Crear otro» descarta una sola vez y no pasa por «Cancelar»: ' + window.backCalls + ' / ' + window.cancelCalls + ' / ' + JSON.stringify(window.cancelJobs))
  await settleCancel()
  // Sin cobradas, «Crear otro» descarta como siempre.
  await startRun('pi')
  emit({ type: 'avatar-scene-started', sceneId: 2 })
  emit(progress(2, 'upload'))
  await waitFor(() => store().task.scenes[1].avatarActivity?.phase === 'upload', 'una que solo sube su audio')
  headerBack().click()
  await waitFor(() => window.backCalls === 1, '«Crear otro» sin cobradas descarta de una')
  check(dialog() === null && window.cancelJobs.length === 1, 'sin aviso, y la corrida viva se corta como siempre')
  await settleCancel()

  // 12. En la biblioteca el botón de vuelta solo navega (el job sigue): aun con
  // cobradas en curso no abre el aviso ni corta nada.
  window.cancelJobs.length = 0
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <div data-probe="library-back">
        <MemoryRouter initialEntries={['/library/pl/progress']}>
          <LiveStore />
          <Routes><Route path="/library/:projectId/progress" element={<LibraryProgress />} /></Routes>
        </MemoryRouter>
      </div>
    </QueryClientProvider>,
  )
  const libraryResume = await waitFor(() => document.querySelector('[data-probe="library-back"]') && buttonSaying(document.getElementById('root'), i18n.t('common.resume')), 'el botón de reanudar de la biblioteca')
  libraryResume.click()
  await waitFor(() => store().task?.projectId === 'pl' && store().task.jobId !== null, 'reanuda desde la biblioteca')
  emit({ type: 'stage-started', stageId: 'images' })
  emit({ type: 'stage-started', stageId: 'avatar' })
  emit({ type: 'avatar-scene-started', sceneId: 2 })
  emit(progress(2, 'render'))
  await waitFor(() => chargedAvatarScenesInFlight(store().task) === 1 && headerBack()?.textContent.includes(says.backToLibrary), 'una cobrada en curso en la biblioteca')
  headerBack().click()
  await waitFor(() => !headerBack(), 'volver a la biblioteca navega')
  await delay(200)
  check(dialog() === null && window.cancelJobs.length === 0 && store().task?.projectId === 'pl' && store().task.status === 'generating', 'volver a la biblioteca con cobradas en curso no abre el aviso y la generación sigue')
  store().discardTask()
  await settleCancel()

  // 13. La vista Create de verdad le dice a la pantalla que «Crear otro»
  // descarta la corrida (cancelsRun): con una cobrada en curso, el aviso; con
  // «Cancelar igual», vuelve al formulario y corta el job una sola vez.
  window.cancelJobs.length = 0
  window.createFormShown = false
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <div data-probe="create-view">
        <MemoryRouter initialEntries={[VideosRoutes.create]}>
          <LiveStore />
          <Routes><Route path={VideosRoutes.create} element={<Create />} /></Routes>
        </MemoryRouter>
      </div>
    </QueryClientProvider>,
  )
  await waitFor(() => document.querySelector('[data-probe="create-view"]') && store(), 'la vista Create')
  await store().startPipelineForProject('pk', 'Desde Crear', { hasAvatar: true, seed: { scenes, completedStages: BEFORE_IMAGES, audioDurationSeconds: 60 } })
  await waitFor(() => store().task?.projectId === 'pk' && store().task.jobId !== null && headerBack()?.textContent.includes(says.createAnother), 'Create muestra la pantalla de progreso con «Crear otro»')
  emit({ type: 'stage-started', stageId: 'images' })
  emit({ type: 'stage-started', stageId: 'avatar' })
  emit({ type: 'avatar-scene-started', sceneId: 2 })
  emit(progress(2, 'render'))
  await waitFor(() => chargedAvatarScenesInFlight(store().task) === 1, 'una cobrada en curso en Crear')
  headerBack().click()
  await waitFor(() => dialog()?.textContent.includes(says.bodyOne), 'en Crear, «Crear otro» con una cobrada abre el aviso')
  await delay(150)
  check(window.cancelJobs.length === 0 && store().task?.status === 'generating', 'el aviso no corta nada todavía')
  const createConfirm = confirmButton()
  createConfirm.click()
  createConfirm.click()
  await waitFor(() => window.cancelJobs.length > 0 && window.createFormShown, '«Cancelar igual» vuelve al formulario de Crear')
  await delay(200)
  check(window.cancelJobs.length === 1 && store().task === null, 'y corta el job una sola vez: ' + JSON.stringify(window.cancelJobs))
  await settleCancel()

  document.getElementById('result').textContent = 'PASS: cancel with charged avatar appearances (' + checks + ' checks)'
} catch (error) {
  const reason = renderError && renderError !== error ? ' (render error: ' + renderError.message + ')' : ''
  document.getElementById('result').textContent = 'FAIL: ' + error.message + reason
}

// El store sin pantalla propia: la biblioteca monta la suya.
function LiveStore() {
  window.store = useCreateTask()
  return null
}
`

test('«Cancelar» con apariciones del avatar cobradas', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vimo-avatar-cancel-charged-ui-'))
  try {
    const output = await build({
      stdin: { contents: entry, resolveDir: resolve('.'), loader: 'jsx' },
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      tsconfig: 'tsconfig.app.json',
      // La vista Create real (sección 13) arrastra la marca (con la versión)
      // y sus imágenes, como en check-create-draft-ui.mjs.
      define: {
        'process.env.NODE_ENV': '"development"',
        __APP_VERSION__: '"0.0.0-guard"',
      },
      loader: {
        '.png': 'dataurl',
        '.svg': 'dataurl',
        '.jpg': 'dataurl',
        '.webp': 'dataurl',
        '.mp3': 'dataurl',
        '.woff2': 'dataurl',
      },
      plugins: [
        {
          name: 'api-fixtures',
          setup(plugin) {
            plugin.onResolve({ filter: /^@\// }, (args) =>
              mocks[args.path]
                ? { path: args.path, namespace: 'fixture' }
                : undefined,
            )
            // `resolveDir`: el simulacro importa las constantes reales por su ruta.
            plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
              contents: mocks[args.path],
              loader: 'js',
              resolveDir: resolve('.'),
            }))
          },
        },
      ],
    })
    await writeFile(join(root, 'app.js'), output.outputFiles[0].contents)
    await writeFile(
      join(root, 'index.html'),
      // Un error al cargar el módulo (antes del try de la página) se ve con su
      // mensaje en vez de un «UI timeout».
      '<!doctype html><meta charset="utf-8"><script>window.addEventListener("error", (event) => { const out = document.getElementById("result"); if (out && out.textContent === "RUNNING") out.textContent = "FAIL: load " + event.message })</script><div id="root"></div><pre id="result">RUNNING</pre><script type="module" src="./app.js"></script>',
    )
    await withChrome(chrome, join(root, 'profile'), async (call) => {
      const { targetId } = await call('Target.createTarget', {
        url: 'about:blank',
      })
      const { sessionId } = await call('Target.attachToTarget', {
        targetId,
        flatten: true,
      })
      const send = (method, params = {}) => call(method, params, sessionId)
      await send('Page.enable')
      await send('Runtime.enable')
      // Antes de navegar: sin esto, el foco por código no dispara los eventos
      // de foco en Chrome headless y las teclas no caen en el botón enfocado
      // (ERRORES-CONOCIDOS: cdp-sin-emulacion-de-foco-element-focus-no-
      // dispara-los-eventos-focus).
      await send('Emulation.setFocusEmulationEnabled', { enabled: true })
      await send('Page.navigate', {
        url: pathToFileURL(join(root, 'index.html')).href,
      })
      const evaluate = async (expression) =>
        (await send('Runtime.evaluate', { expression, returnByValue: true }))
          .result?.value
      // Atiende las teclas que pide el caso hasta que la página termina.
      let status = null
      for (let attempt = 0; attempt < 2400 && !status; attempt++) {
        await new Promise((done) => setTimeout(done, 25))
        const keys = JSON.parse(
          (await evaluate(
            'JSON.stringify(window.keyQueue ? window.keyQueue.splice(0) : [])',
          )) ?? '[]',
        )
        for (const { id, key: requested } of keys) {
          const held = requested === HELD_KEY
          const key = held ? 'Enter' : requested
          const { text, ...codes } = KEYS[key]
          const keyDown = (autoRepeat) =>
            send('Input.dispatchKeyEvent', {
              type: 'keyDown',
              key,
              ...codes,
              ...(text ? { text, unmodifiedText: text } : {}),
              ...(autoRepeat ? { autoRepeat: true } : {}),
            })
          await keyDown(false)
          for (let repeat = 0; held && repeat < HELD_REPEATS; repeat++) {
            await new Promise((done) => setTimeout(done, HELD_REPEAT_MS))
            await keyDown(true)
          }
          await send('Input.dispatchKeyEvent', { type: 'keyUp', key, ...codes })
          await evaluate('window.keysDone.add(' + id + ')')
        }
        const result = await evaluate(
          'document.getElementById("result")?.textContent',
        )
        if (result && result !== 'RUNNING') status = result
      }
      status ??=
        'FAIL: UI timeout: ' +
        (await evaluate('document.body.innerText.slice(0, 400)'))
      assert.ok(status.startsWith('PASS:'), status)
      process.stdout.write(status + '\n')
    })
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 3 })
  }
})
