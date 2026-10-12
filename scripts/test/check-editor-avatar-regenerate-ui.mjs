// «Generar» / «Regenerar» / «Regenerar todos» el avatar desde el editor
// (entrega 2d, spec §11.1, §11.4 y §20) con el panel, la pista, el hook del
// editor y el store de tareas REALES en Chrome headless: qué botón ofrece cada
// estado (planeada → «Generar»; fallida, desactualizada o lista sin clip →
// «Regenerar»; lista y al día → nada) y «Regenerar todos (N)» con más de una;
// la confirmación con la cantidad, el costo (el mismo cálculo que Crear, por la
// duración real de cada escena) y el saldo de avatares; el saldo que no
// alcanza (aviso y confirmar apagado), también cuando recién lo dice la
// relectura de antes de pagar; el pedido con los ids exactos (uno o todos); la
// cola y el progreso en el bloque de la pista con los eventos `avatar-scene-*`;
// el resultado listo (se relee el proyecto y sale «listo») y el fallido (el
// motivo en el bloque, en el panel y en el aviso); cancelar, también antes de
// que el job tenga id; la exclusión con las demás tareas del editor; sin la
// clave, el aviso de siempre; y el teclado (Enter, Tab y Escape de verdad, con
// la emulación de foco, ERRORES-CONOCIDOS: cdp-sin-emulacion-de-foco-element-
// focus-no-dispara-los-eventos-focus y cdp-enter-sin-text-retorno-no-activa-el-
// boton). Ronda 3 (revisión del WP-Q): Enter sostenido de verdad (keydown con
// `autoRepeat`, como la sonda del revisor) sobre «Generar» de la confirmación
// y sobre «Cancelar» del avance (M1); el saldo en la descripción accesible y
// el foco que, al terminar, vuelve al botón que abrió la confirmación o al
// panel y nunca cae en `body` (M2); «Regenerarlas (N)» en el aviso (M4); el
// aviso sin la clave, la fallida que relee el proyecto antes del cierre y el
// panel con el llavero cargando (M5); y el aviso que no cuenta una escena sin
// tramo (M6). Ronda 4 (revisión final de la 2d y re-revisión del WP-Q): cada
// texto con que compara es una frase del catálogo (caso 0); el aviso no cuenta
// una desactualizada que perdió su clip; con el job que cae bajo un Enter
// sostenido, la confirmación que reabre el aviso no se cierra sola (su
// «Cancelar» ignora las repeticiones); y Crear, con su store real, no lanza
// el pipeline sobre un proyecto con una tarea del editor en curso (caso 17).
// Nada habla con HeyGen ni con el sidecar: el fetcher del pipeline
// entrega `avatar-render-scenes` a la prueba, que anota el subcomando y el
// pedido y emite los eventos del job a mano.
// Los simulacros parten del real (ERRORES-CONOCIDOS: simulacro-de-hook-en-un-
// guard-queda-viejo-en-silencio-cuando-el-hook-suma-un-miembro): `videosApi`
// (con su `startAvatarRender` real), `avatarsApi`, `apiKeysApi` y el fetcher
// del pipeline son los reales con solo las llamadas al sidecar reemplazadas,
// el cliente de Supabase es una sesión vacía y `toast` es el real con un
// registro. Casi todo corre con un `Host` que cablea el panel y la pista como
// LibraryEditor (projectId, las escenas y `sceneAvatarRendering` del store);
// el último caso monta la vista REAL en su ruta y recorre el mismo camino
// (ronda 1), con el visor, la música, la mezcla, el audio y la tarea de Crear
// simulados como en check-export-header-ui.mjs. La raíz guarda
// `onUncaughtError` para que un render roto falle con su mensaje.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { withChrome } from './chrome-session.mjs'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'

const chrome =
  process.argv[2] ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const root = await mkdtemp(join(tmpdir(), 'vimo-editor-avatar-regenerate-ui-'))
// Las teclas que el caso puede pedir. Enter lleva su texto: sin él Chrome no
// activa el botón (ERRORES-CONOCIDOS: cdp-enter-sin-text-retorno-no-activa-el-
// boton).
const KEYS = {
  Tab: { code: 'Tab', windowsVirtualKeyCode: 9 },
  Enter: { code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
  Escape: { code: 'Escape', windowsVirtualKeyCode: 27 },
}
// Enter sostenido de verdad: un keyDown, después HELD_REPEATS keyDown con
// `autoRepeat` (lo que manda el teclado mientras la tecla sigue apretada) cada
// HELD_REPEAT_MS, y recién ahí el keyUp. Como la sonda del revisor (M1).
const HELD_KEY = 'EnterHeld'
const HELD_REPEATS = 25
const HELD_REPEAT_MS = 20
const mocks = {
  '@/modules/common/supabase/client':
    'export const supabase = { auth: { getSession: async () => ({ data: { session: null } }) } }',
  // El detalle del proyecto sale del fixture (lo que el sidecar tiene en
  // disco). `startAvatarRender` es el real: el job lo lanza el fetcher del
  // pipeline, que acá entrega `avatar-render-scenes` a la prueba
  // (window.startAvatarRender) con su subcomando, y también
  // `run-video-pipeline` (window.startRunPipeline), el pipeline que lanza el
  // store real de Crear en el caso 17. Con `cancelFails`, cancelar responde
  // como un job que ya terminó (`JobNotFound`); confirmar el corte se anota.
  '@/modules/videos/api': [
    "import { videosApi as real } from './src/modules/videos/api/index.ts'",
    'export const videosApi = { ...real, isNative: () => true, async projectDetail() { window.detailCalls += 1; return structuredClone(window.detail) }, async cancelJob(jobId) { window.cancels.push(jobId); if (window.cancelFails) throw new Error("JobNotFound") }, async confirmScenes(payload) { window.confirmCalls.push(structuredClone(payload)) }, imageSource: (path, version) => "fixture-image://" + path + "?v=" + version, videoSource: (path, version) => "fixture-media://" + path + "?v=" + version }',
  ].join('\n'),
  '@/modules/common/fetcher/pipeline': [
    "export * from './src/modules/common/fetcher/pipeline.ts'",
    "import { startPipelineJob as realStart } from './src/modules/common/fetcher/pipeline.ts'",
    'export function startPipelineJob(subcommand, payload, onEvent) { if (subcommand === "avatar-render-scenes") return window.startAvatarRender(subcommand, payload, onEvent); if (subcommand === "run-video-pipeline") return window.startRunPipeline(subcommand, payload, onEvent); return realStart(subcommand, payload, onEvent) }',
  ].join('\n'),
  '@/modules/avatars/api': [
    "import { avatarsApi as real } from './src/modules/avatars/api/index.ts'",
    'export const avatarsApi = { ...real, isNative: () => true, async balance() { window.balanceCalls += 1; if (window.holdBalance) await window.holdBalance; return structuredClone(window.fixture.balance) } }',
  ].join('\n'),
  '@/modules/api-keys/api': [
    "import { apiKeysApi as real } from './src/modules/api-keys/api/index.ts'",
    'export const apiKeysApi = { ...real, isNative: () => true, async getStatus() { if (window.holdKeys) await window.holdKeys; return window.fixture.keys.map((providerId) => ({ providerId, configured: true, source: "manual", maskedKey: "••••", savedAt: 0, lastValidatedAt: null })) } }',
  ].join('\n'),
  // El toast real (el Toaster lo dibuja) con un registro de cada aviso.
  '@/modules/common/hooks/useToast': [
    "import { useToast as realUseToast, toast as realToast } from './src/modules/common/hooks/useToast.ts'",
    'export const useToast = realUseToast',
    'export function toast(props) { window.toasts.push({ description: props.description, variant: props.variant }); return realToast(props) }',
  ].join('\n'),
  // Para la vista real (caso 15), como check-export-header-ui.mjs: sin otra
  // tarea pesada de Crear, sin audio en curso ni saldos de imágenes, y sin el
  // visor ni los diálogos de música y mezcla (medios que acá no se prueban).
  // El store del editor también lee useCreateTask: el simulacro dice lo mismo
  // que el real sin una tarea de Crear.
  '@/modules/videos/hooks/useCreateTask':
    'export function useCreateTask() { return { task: null, startPipelineForProject() {} } } export function hasBusyCreateTask() { return false } export function subscribeCreateTask() { return () => {} }',
  '@/modules/videos/hooks/useProjectAudio':
    'export function useProjectAudio() { return { audioBusy: false } }',
  '@/modules/common/hooks/useImageCredits':
    'export function useImageCredits() { return { credits: null, isLoading: false, isRefreshing: false, refresh() {} } }',
  '@/modules/videos/components/EditorPreviewPlayer':
    'export function EditorPreviewPlayer() { return null }',
  '@/modules/videos/components/MusicDialog':
    'export function MusicDialog() { return null }',
  '@/modules/videos/components/AudioMixDialog':
    'export function AudioMixDialog() { return null }',
}
const entry = String.raw`
import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import i18n from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router'
import es from './public/locales/es.json'
import { EDITOR_BAR_SLOT_IDS } from '@/modules/common/constants'
import { queryClient } from '@/modules/common/queryClient'
import { TooltipProvider } from '@/modules/common/ui/tooltip'
import { Toaster } from '@/modules/common/ui/toaster'
import { formatUsd } from '@/modules/common/utilities/formatUsd'
import { DEFAULT_TIMELINE_LAYOUT, EDITOR_SCENE_PANEL_ID } from '@/modules/videos/constants'
import { EditorScenePanel } from '@/modules/videos/components/EditorScenePanel'
import { EditorTimeline } from '@/modules/videos/components/EditorTimeline'
import { useLibraryEditor } from '@/modules/videos/hooks/useLibraryEditor'
import { LibraryEditor } from '@/modules/videos/views/LibraryEditor/LibraryEditor'
import { avatarSpansCostEstimate } from '@/modules/videos/utilities/avatarCostEstimate'
import { avatarSceneAction, avatarScenesCost, avatarSceneState, avatarScenesToRender, editorFallbackSceneIds } from '@/modules/videos/utilities/avatarRegeneration'
import { errorKeyOf } from '@/modules/videos/utilities/errorKeyOf'
import { formatSlotSeconds } from '@/modules/videos/utilities/formatSlotSeconds'
// El store REAL de Crear, por su ruta: el alias @/ lo reemplaza el simulacro
// (caso 17).
import { hasBusyCreateTask as realHasBusyCreateTask, useCreateTask as useRealCreateTask } from './src/modules/videos/hooks/useCreateTask.ts'

let checks = 0
let renderError
const check = (condition, message) => { if (!condition) throw new Error(message); checks += 1 }
const delay = (ms = 30) => new Promise((done) => setTimeout(done, ms))
async function waitFor(get, message) {
  for (let index = 0; index < 150; index++) { if (renderError) throw renderError; const value = get(); if (value) return value; await delay() }
  throw new Error(message)
}
// Las teclas son de verdad: la página las pide y el arnés las manda por CDP.
window.keyQueue = []
window.keysDone = new Set()
let keyId = 0
async function press(key) {
  const id = ++keyId
  window.keyQueue.push({ id, key })
  await waitFor(() => window.keysDone.has(id), 'la tecla ' + key + ' llegó')
  await delay()
}
// Enter sostenido: el arnés lo manda con sus repeticiones (HELD_KEY).
const ENTER_HELD = 'EnterHeld'
await i18n.init({ lng: 'es', resources: { es: { translation: es } }, interpolation: { escapeValue: false } })
const t = (key, options) => i18n.t(key, options)
const usd = (amount) => formatUsd(amount, 'es')
// Una frase del catálogo, como en check-create-avatar-ui.mjs: la clave existe,
// no sale como su ruta cruda y no deja variables sin resolver. Comparar con
// t() de una clave que no existe pasa en vacío: i18next la traduce como su
// ruta y el componente y el guard reciben lo mismo (ERRORES-CONOCIDOS: test-
// que-compara-el-texto-con-i18n-t-de-la-misma-clave-pasa-en-vacio-si-la-
// clave-no-existe).
function phrase(key, options) {
  const sentence = i18n.t(key, options)
  check(i18n.exists(key, options) && sentence !== key && !sentence.includes('{{'), 'la clave ' + key + ' es una frase del catálogo, no su ruta cruda ni una variable sin resolver: ' + sentence)
  return sentence
}
// Las claves con que el guard compara (M2 de la revisión final de la 2d): las
// de plural, en sus dos formas; las que llevan datos, con un dato de muestra.
const CATALOG_PHRASES = [
  ['library.editor.avatar.generar'],
  ['library.editor.avatar.regenerar'],
  ['library.editor.avatar.regenerarTodos', { count: 2 }],
  ['library.editor.avatar.regenerarAviso', { count: 2 }],
  ['library.editor.avatar.costo', { amount: '1' }],
  ['library.editor.avatar.saldo', { balance: '1' }],
  ['library.editor.avatar.saldoInsuficiente'],
  ['library.editor.avatar.confirmarTitulo'],
  ['library.editor.avatar.confirmarTexto', { count: 1, amount: '1' }],
  ['library.editor.avatar.confirmarTexto', { count: 2, amount: '1' }],
  ['library.editor.avatar.confirmar'],
  ['library.editor.avatar.cancelar'],
  ['library.editor.avatar.listo'],
  ['library.editor.avatar.fallo', { reason: 'x' }],
  ['library.editor.avatar.fallbackNote', { count: 1 }],
  ['library.editor.avatar.fallbackNote', { count: 2 }],
  ['library.editor.timeline.avatarRendering'],
  ['library.editor.timeline.avatarStale'],
  ['library.editor.timeline.avatarStaleHint'],
  ['library.editor.timeline.avatarPlanned'],
  ['library.editor.timeline.avatarTitle', { name: 'x', seconds: '1' }],
  ['library.editor.timeline.avatarFailed', { reason: 'x' }],
  ['library.editor.panel.sceneTitle', { id: 1 }],
  ['library.editor.panel.avatarSceneHint'],
  ['library.editor.demoLocked'],
  ['library.editor.render.render'],
  ['library.errors.projectBusy'],
  ['create.avatar.noKey'],
  ['create.avatar.goToApiKeys'],
  ['create.progress.avatarFallback', { count: 1 }],
  ['avatars.saldo.creditos', { amount: '1' }],
  ['avatars.saldo.noDisponible'],
]
// Los códigos cuyo texto compara el guard: cada uno con el suyo.
const ERROR_CODES = ['avatar_moderation_rejected', 'avatar_download_failed', 'avatar_timeout', 'avatar_insufficient_credits', 'cancelled']

// El proyecto en disco: dos escenas de imagen en las puntas y escenas de
// avatar en cada estado, todas de 10 s (250 cuadros) con un look de foto.
const LOOK = '/p/avatar/look.png'
const view = (overrides = {}) => ({ lookId: 'look-ana', lookName: 'Ana oficina', lookType: 'photo_avatar', engine: 'avatar_iii', origin: 'auto', status: 'ready', clipPath: '/p/avatar/clip.mp4', clipMtimeMs: 1, normalizedSeconds: 10, ...overrides })
const scene = (id, startSeconds, endSeconds, extra = {}) => ({ id, text: 'Escena ' + id, imageStatus: 'ok', imagePath: '/p/scenes/scene_' + id + '.jpg', startSeconds, endSeconds, ...extra })
const PLANNED = { status: 'planned', clipPath: undefined, clipMtimeMs: undefined, normalizedSeconds: undefined }
window.detail = {
  metadata: { id: 'fixture', name: 'Fixture', state: 'ready', options: { videoFormat: '16:9', imageProvider: 'fal', imageQuality: 'low' } },
  words: [],
  script: '',
  scenes: [
    scene(1, 0, 4),
    scene(2, 4, 14, { imagePath: LOOK, avatar: view(PLANNED) }),
    scene(3, 14, 18),
    scene(4, 18, 28, { imagePath: LOOK, avatar: view({ stale: true }) }),
    scene(5, 28, 38, { imagePath: LOOK, avatar: view({ status: 'failed', clipPath: undefined, errorCode: 'avatar_moderation_rejected' }) }),
    scene(6, 38, 48, { imagePath: LOOK, avatar: view() }),
    // Lista y al día pero sin su archivo: el sidecar la manda fallida por la
    // descarga (toSceneAvatarView); repetir el mismo pedido reusa el video
    // pagado, así que su motivo es cierto.
    scene(7, 48, 58, { imagePath: LOOK, avatar: view({ status: 'failed', clipPath: undefined, clipMtimeMs: undefined, errorCode: 'avatar_download_failed' }) }),
    scene(8, 58, 64),
  ],
}
const INITIAL_DETAIL = structuredClone(window.detail)
// Lo que el sidecar deja en disco al cerrar cada escena.
function storeAvatar(id, avatar) {
  window.detail = { ...window.detail, scenes: window.detail.scenes.map((item) => (item.id === id ? { ...item, avatar } : item)) }
}
const USD = (remaining) => ({ available: true, remaining, currency: 'usd' })
window.fixture = { keys: ['heygen', 'fal', 'deepinfra'], balance: USD(5) }
window.detailCalls = 0
window.balanceCalls = 0
window.toasts = []
window.cancels = []
// Una promesa rechazada que nadie atiende (cancelar un job que ya terminó).
window.unhandledRejections = []
window.addEventListener('unhandledrejection', (event) => { window.unhandledRejections.push(String(event.reason?.message ?? event.reason)) })
// Cada pedido de avatar queda anotado con su payload y su canal de eventos;
// con holdInvoke el invoke no devuelve el id hasta que la prueba lo suelta.
window.avatarJobs = []
window.holdInvoke = false
// El pipeline que lanza el store real de Crear (caso 17): se anota con su
// canal de eventos, sin hablar con el sidecar. Y el corte confirmado.
window.pipelineRuns = []
window.confirmCalls = []
window.startRunPipeline = (subcommand, payload, onEvent) => {
  const run = { subcommand, payload: structuredClone(payload), onEvent, jobId: 'pipeline-job-' + (window.pipelineRuns.length + 1) }
  window.pipelineRuns.push(run)
  return Promise.resolve({ jobId: run.jobId, stop() { run.stopped = true } })
}
window.startAvatarRender = (subcommand, payload, onEvent) => new Promise((resolve) => {
  const job = { subcommand, payload: structuredClone(payload), onEvent, jobId: 'avatar-job-' + (window.avatarJobs.length + 1) }
  job.release = () => resolve({ jobId: job.jobId, stop() { job.stopped = true } })
  window.avatarJobs.push(job)
  if (!window.holdInvoke) job.release()
})

const noop = () => {}
const panelAnimation = { busy: false, provider: 'kie', configuredProviders: new Set(), credits: null, creditsLoading: false, creditsRefreshing: false, onRefreshCredits() {}, activity: undefined, progress: undefined, error: undefined, plan: undefined, onAnimate() {} }
// Cablea el panel y la pista como LibraryEditor: el proyecto, sus escenas, el
// «ocupado» del store y los renders de avatar en curso.
function Host() {
  const editor = useLibraryEditor('fixture')
  window.editor = editor
  if (!editor.detail) return null
  const task = editor.editorTask.task
  const busy = editor.editorTask.isProjectBusy('fixture') || editor.savingChanges
  return (
    <>
      <div id="panel">
        <EditorScenePanel scene={editor.selectedScene} projectId="fixture" scenes={editor.workingScenes} characters={[]} imageChoice={editor.imageChoice} videoFormat="16:9" credits={null} creditsLoading={false} creditsRefreshing={false} onRefreshCredits={noop} busy={busy} regenerateLocked={window.fixture.locked === true} userPromptPending={false} errorKey={undefined} onUserPromptChange={noop} onUserPromptBlur={noop} canEditClipIn={false} canEditClipOut={false} onClipTimeChange={noop} onImageChoiceChange={noop} onCharactersChange={noop} onRegenerate={noop} animation={panelAnimation} />
      </div>
      <div id="timeline">
        <EditorTimeline scenes={editor.workingScenes} timingBusy={busy} durationSeconds={64} playheadSeconds={0} selectedSceneId={editor.selectedSceneId} sceneStatus={{}} sceneErrors={{}} sceneVersions={{}} sceneAnimationStatus={{}} sceneAnimationProgress={{}} sceneAnimationErrors={{}} plannedSceneIds={[]} narrationSrc={null} musicSrc={null} sceneAvatarRendering={task?.sceneAvatarRendering ?? {}} layout={DEFAULT_TIMELINE_LAYOUT} onReorderTracks={noop} onToggleMuted={noop} onToggleLocked={noop} zoomIndex={3} onZoomChange={noop} onSelectScene={editor.setSelectedSceneId} onSeek={noop} onScrub={noop} onScrubStart={noop} onScrubEnd={noop} onBoundaryDrag={noop} onBoundaryCommit={noop} onOpenAudio={noop} onOpenMusic={noop} />
      </div>
      <p id="banner">{task?.errorKey ? t(task.errorKey) : ''}</p>
    </>
  )
}
const reactRoot = createRoot(document.getElementById('root'), { onUncaughtError: (error) => { renderError = error } })
reactRoot.render(<QueryClientProvider client={queryClient}><I18nextProvider i18n={i18n}><MemoryRouter><TooltipProvider><Host /><Toaster /></TooltipProvider></MemoryRouter></I18nextProvider></QueryClientProvider>)

let panelRoot = () => document.getElementById('panel')
let timelineRoot = () => document.getElementById('timeline')
const panel = () => panelRoot()
const panelButton = (label) => [...(panel()?.querySelectorAll('button') ?? [])].find((button) => button.textContent.trim() === label)
const dialog = () => document.querySelector('[role="alertdialog"]')
const dialogButton = (label) => [...(dialog()?.querySelectorAll('button') ?? [])].find((button) => button.textContent.trim() === label)
// La key de React no sale al DOM: se lee de la fibra del contenedor del bloque.
const reactKeyOf = (element) => { const name = Object.keys(element).find((key) => key.startsWith('__reactFiber$')); return name ? element[name].key : null }
const avatarBlock = (id) => [...(timelineRoot()?.querySelectorAll('div.absolute.top-0.h-full > button') ?? [])].find((card) => reactKeyOf(card.parentElement) === 'avatar-' + id)
const percentIn = (element) => element?.textContent.match(/\d+%/)?.[0]
const activeText = () => document.activeElement?.textContent.trim()
// La región del avance del panel (adonde va el foco al arrancar) y el panel
// (adonde vuelve si lo que lo tenía desaparece).
const progressRegion = () => panel()?.querySelector('[role="region"]')
const panelAside = () => document.getElementById(EDITOR_SCENE_PANEL_ID)
const focusIsOnPanel = () => document.activeElement === panelAside() && document.activeElement !== document.body
// Lo que un lector de pantalla anuncia del diálogo: su aria-describedby.
const dialogDescription = () => document.getElementById(dialog()?.getAttribute('aria-describedby') ?? '')?.textContent ?? ''
// Las repeticiones de Enter sobre un botón: si cada una se ignoró (M1); y
// cuántas cayeron en otra cosa (la región del avance).
window.heldOn = new Map()
window.heldElsewhere = 0
document.addEventListener('keydown', (event) => {
  if (!event.repeat) return
  if (!(event.target instanceof HTMLButtonElement)) {
    window.heldElsewhere += 1
    window.onHeldElsewhere?.(window.heldElsewhere)
    return
  }
  const label = event.target.textContent.trim()
  const seen = window.heldOn.get(label) ?? { repeats: 0, ignored: 0 }
  seen.repeats += 1
  if (event.defaultPrevented) seen.ignored += 1
  window.heldOn.set(label, seen)
  window.onHeldRepeat?.(label, seen)
})
async function select(id) {
  window.editor.setSelectedSceneId(id)
  await waitFor(() => panel()?.textContent.includes(t('library.editor.panel.sceneTitle', { id })), 'el panel muestra la escena ' + id)
  await delay()
}
const GENERATE = t('library.editor.avatar.generar')
const REGENERATE = t('library.editor.avatar.regenerar')
const ALL = (count) => t('library.editor.avatar.regenerarTodos', { count })
const CONFIRM = t('library.editor.avatar.confirmar')
const CANCEL = t('library.editor.avatar.cancelar')
const RENDERING = t('library.editor.timeline.avatarRendering')
const span = (startSeconds, endSeconds) => ({ startSeconds, endSeconds })
// El costo de Crear para esos tramos (avatarSpansCostEstimate): la cifra que
// tiene que decir la confirmación.
const createCost = (spans) => avatarSpansCostEstimate('photo_avatar', spans).estimated
const forgetBalance = () => queryClient.removeQueries({ queryKey: ['avatars', 'balance'] })

try {
  await waitFor(() => panel()?.textContent.includes(t('library.editor.panel.sceneTitle', { id: 1 })), 'el editor cargó con la escena 1')

  // 0. Cada texto con que el guard compara es una frase del catálogo (M2 de
  //    la revisión final de la 2d): si una clave se renombra o se borra, el
  //    guard cae acá y no compara la ruta cruda consigo misma.
  for (const [key, options] of CATALOG_PHRASES) phrase(key, options)
  for (const code of ERROR_CODES) {
    check(errorKeyOf(code) !== errorKeyOf(undefined), 'el código ' + code + ' tiene su propio texto, no el genérico')
    phrase(errorKeyOf(code))
  }

  // 1. Las reglas puras sobre el fixture: qué ofrece cada estado, qué pide
  //    «Regenerar todos» y lo que cuesta (lo mismo que Crear por esos tramos).
  const scenes = window.detail.scenes
  check(JSON.stringify(scenes.map((item) => avatarSceneAction(item, {}))) === JSON.stringify([null, 'generate', null, 'regenerate', 'regenerate', null, 'regenerate', null]), 'la acción por estado: planeada genera; desactualizada, fallida y lista sin clip regeneran; lista y al día, nada')
  check(avatarSceneAction(scenes[1], { 2: { startedAt: 1, queued: true } }) === null, 'una escena que se está generando no ofrece nada')
  check(avatarSceneAction({ ...scenes[1], endSeconds: 4.01 }, {}) === null, 'una escena de avatar sin un cuadro de tramo tampoco (no tiene bloque y el carril no la pide)')
  // Ruling del 2026-10-11: desactualizada manda sobre fallida. Una lista
  // desactualizada que perdió su clip llega fallida por la descarga y con
  // stale; una fallida de verdad nunca trae stale.
  const staleWithoutClip = { ...scenes[3], avatar: view({ status: 'failed', clipPath: undefined, clipMtimeMs: undefined, errorCode: 'avatar_download_failed', stale: true }) }
  check(avatarSceneState(staleWithoutClip, {}) === 'stale' && avatarSceneAction(staleWithoutClip, {}) === 'regenerate', 'una lista desactualizada sin su clip: desactualizada (no fallida) y «Regenerar»')
  check(avatarSceneState(scenes[4], {}) === 'failed' && avatarSceneState(scenes[6], {}) === 'failed' && avatarSceneState(scenes[3], {}) === 'stale', 'una fallida de verdad y una lista al día sin clip siguen fallidas; la desactualizada con clip, desactualizada')
  check(JSON.stringify(avatarScenesToRender(scenes, {}).map((item) => item.id)) === '[2,4,5,7]', '«Regenerar todos» pide las cuatro sin clip válido o desactualizadas, en orden')
  check(createCost([span(4, 14)]) === 0.165 && avatarScenesCost([scenes[1]]).estimated === 0.165, 'una aparición de 10 s de un look de foto: 0,165 US$, el cálculo de Crear')
  check(avatarScenesCost(avatarScenesToRender(scenes, {})).estimated === createCost([span(4, 14), span(18, 28), span(28, 38), span(48, 58)]) && createCost([span(4, 14), span(18, 28), span(28, 38), span(48, 58)]) === 0.66, 'las cuatro: 40 s, 0,66 US$, el mismo cálculo')
  check(avatarScenesCost([{ ...scenes[1], avatar: { ...scenes[1].avatar, lookType: 'digital_twin' } }, scenes[3]]).estimated === avatarSpansCostEstimate('digital_twin', [span(4, 14)]).estimated + avatarSpansCostEstimate('photo_avatar', [span(18, 28)]).estimated, 'con dos tipos de look, cada uno con su tarifa')
  check(avatarScenesCost([scenes[0]]) === null && avatarScenesCost([]) === null, 'sin escenas de avatar no hay nada que cobrar')
  // El aviso de arriba cuenta las que salen con la imagen fija y tienen tramo,
  // como las que el panel puede pedir (M6): una sin un cuadro de tramo no.
  check(JSON.stringify(editorFallbackSceneIds(scenes)) === '[2,5,7]', 'el aviso del editor: la planeada, la fallida y la lista sin clip (no la desactualizada): ' + JSON.stringify(editorFallbackSceneIds(scenes)))
  check(JSON.stringify(editorFallbackSceneIds([scenes[1], { ...scenes[4], endSeconds: 28.01 }])) === '[2]', 'una fallida sin tramo no cuenta en el aviso del editor')

  // 2. Los botones por estado, en el panel real.
  await select(2)
  check(panel().textContent.includes(t('library.editor.panel.avatarSceneHint')), 'el panel explica la escena de avatar (avatarSceneHint)')
  check(panelButton(GENERATE) && !panelButton(REGENERATE), 'planeada: «Generar avatar»')
  check(panel().textContent.includes(t('library.editor.avatar.costo', { amount: usd(0.165) })), 'con su costo a la vista: ' + t('library.editor.avatar.costo', { amount: usd(0.165) }))
  check(panelButton(ALL(4)), 'y «Regenerar todos (4)»')
  await select(4)
  check(panelButton(REGENERATE) && !panelButton(GENERATE) && panelButton(ALL(4)), 'desactualizada: «Regenerar avatar»')
  await select(5)
  check(panelButton(REGENERATE) && panel().textContent.includes(t('library.editor.avatar.fallo', { reason: t(errorKeyOf('avatar_moderation_rejected')) })), 'fallida: «Regenerar avatar» y el motivo guardado')
  await select(7)
  check(panelButton(REGENERATE) && panel().textContent.includes(t('library.editor.avatar.fallo', { reason: t(errorKeyOf('avatar_download_failed')) })), 'lista al día sin clip: «Regenerar avatar» y el motivo de la descarga (ya está pago)')
  check(!panel().textContent.includes(t('library.editor.timeline.avatarStaleHint')), 'sin «Desactualizado»: no lo está')
  await select(4)
  check(panel().textContent.includes(t('library.editor.timeline.avatarStaleHint')), 'la desactualizada dice «Desactualizado» con su explicación en el panel')
  await select(6)
  check(!panelButton(GENERATE) && !panelButton(REGENERATE) && !panel().textContent.includes(t('library.editor.avatar.costo', { amount: usd(0.165) })), 'lista y al día: ni botón ni costo propio')
  check(!panelButton(ALL(4)), 'lista y al día no ofrece nada: tampoco «Regenerar todos» (va junto al botón de una pendiente)')
  check(panel().textContent.includes(t('library.editor.panel.avatarSceneHint')), 'pero sí la explica')
  await select(1)
  check(!panelButton(GENERATE) && !panelButton(ALL(4)) && !panel().textContent.includes(t('library.editor.panel.avatarSceneHint')), 'una escena de imagen no ofrece nada del avatar')
  check(window.balanceCalls === 0, 'el saldo no se pide hasta abrir una confirmación: ' + window.balanceCalls)

  // 3. La confirmación: cantidad, costo y saldo; «Cancelar» con el foco y
  //    cerrar sin pagar (con el mouse y con Escape), y el foco de vuelta.
  await select(2)
  panelButton(GENERATE).focus()
  await press('Enter')
  await waitFor(() => dialog(), 'Enter sobre «Generar avatar» abre la confirmación')
  await waitFor(() => dialog().textContent.includes(t('library.editor.avatar.saldo', { balance: usd(5) })), 'la confirmación muestra el saldo: ' + dialog()?.textContent)
  check(dialog().textContent.includes(t('library.editor.avatar.confirmarTitulo')) && dialog().textContent.includes(t('library.editor.avatar.confirmarTexto', { count: 1, amount: usd(0.165) })), 'el título y «Se genera 1 aparición por ≈ ' + usd(0.165) + '»: ' + dialog().textContent)
  check(!dialog().textContent.includes(t('library.editor.avatar.saldoInsuficiente')) && !dialogButton(CONFIRM).disabled, 'con saldo, sin aviso y confirmar habilitado')
  check(activeText() === CANCEL && dialog().contains(document.activeElement), 'el foco abre en «Cancelar»: un Enter distraído no paga (' + activeText() + ')')
  check(dialogDescription().includes(t('library.editor.avatar.confirmarTexto', { count: 1, amount: usd(0.165) })) && dialogDescription().includes(t('library.editor.avatar.saldo', { balance: usd(5) })), 'la descripción accesible del diálogo dice el costo y el saldo: ' + dialogDescription())
  check(window.balanceCalls === 1, 'abrir la confirmación lee el saldo una vez: ' + window.balanceCalls)
  await press('Escape')
  await waitFor(() => !dialog(), 'Escape cierra la confirmación')
  check(window.avatarJobs.length === 0, 'Escape no pide nada')
  check(await waitFor(() => document.activeElement === panelButton(GENERATE), 'el foco vuelve a «Generar avatar»: ' + activeText()), 'el foco vuelve a «Generar avatar»')
  panelButton(GENERATE).click()
  await waitFor(() => dialog(), 'el clic también la abre')
  dialogButton(CANCEL).click()
  await waitFor(() => !dialog(), '«Cancelar» la cierra')
  check(window.avatarJobs.length === 0, '«Cancelar» no pide nada')

  // 4. El saldo que no alcanza: el aviso y confirmar apagado; un clic igual
  //    no pide nada.
  window.fixture.balance = USD(0.5)
  forgetBalance()
  await select(4)
  panelButton(ALL(4)).click()
  await waitFor(() => dialog()?.textContent.includes(t('library.editor.avatar.saldoInsuficiente')), 'con 0,50 US$ y 0,66 por pagar, el aviso de saldo')
  check(dialog().textContent.includes(t('library.editor.avatar.confirmarTexto', { count: 4, amount: usd(0.66) })) && dialog().textContent.includes(t('library.editor.avatar.saldo', { balance: usd(0.5) })), '«Se generan 4 apariciones por ≈ ' + usd(0.66) + '» y el saldo leído')
  check(dialogButton(CONFIRM).disabled, 'confirmar apagado')
  check(dialogDescription().includes(t('library.editor.avatar.saldoInsuficiente')), 'la descripción accesible también lleva el aviso de saldo corto')
  dialogButton(CONFIRM).click()
  await delay(100)
  check(window.avatarJobs.length === 0 && dialog(), 'apagado no pide nada')
  dialogButton(CANCEL).click()
  await waitFor(() => !dialog(), 'cerrada')

  // 4b. Una billetera en créditos (la OpenAPI la admite) se muestra tal cual y
  //     no bloquea; un saldo ilegible tampoco: lo dice y deja confirmar (el
  //     sidecar vuelve a mirar antes de cada pago).
  window.fixture.balance = { available: true, remaining: 120, currency: 'credits' }
  forgetBalance()
  panelButton(REGENERATE).click()
  await waitFor(() => dialog()?.textContent.includes(t('library.editor.avatar.saldo', { balance: t('avatars.saldo.creditos', { amount: '120' }) })), 'el saldo en créditos, tal cual: ' + dialog()?.textContent)
  check(!dialog().textContent.includes(t('library.editor.avatar.saldoInsuficiente')) && !dialogButton(CONFIRM).disabled, 'en créditos no se compara con dólares: sin aviso y confirmar habilitado')
  dialogButton(CANCEL).click()
  await waitFor(() => !dialog(), 'cerrada')
  window.fixture.balance = { available: false, errorCode: 'avatar_balance_unavailable' }
  forgetBalance()
  panelButton(REGENERATE).click()
  await waitFor(() => dialog()?.textContent.includes(t('library.editor.avatar.saldo', { balance: t('avatars.saldo.noDisponible') })), 'el saldo ilegible lo dice: ' + dialog()?.textContent)
  check(!dialog().textContent.includes(t('library.editor.avatar.saldoInsuficiente')) && !dialogButton(CONFIRM).disabled, 'ilegible no bloquea')
  dialogButton(CANCEL).click()
  await waitFor(() => !dialog(), 'cerrada')

  // 5. La relectura de antes de pagar: la caché decía que alcanzaba y la
  //    billetera ya no; no se pide nada, aparece el aviso y el foco pasa a
  //    «Cancelar» (confirmar se apagó con el foco encima).
  window.fixture.balance = USD(5)
  forgetBalance()
  await select(2)
  panelButton(GENERATE).click()
  await waitFor(() => dialog()?.textContent.includes(t('library.editor.avatar.saldo', { balance: usd(5) })), 'la confirmación con saldo')
  window.fixture.balance = USD(0.1)
  const callsBeforeVerify = window.balanceCalls
  dialogButton(CONFIRM).focus()
  await press('Enter')
  await waitFor(() => dialog()?.textContent.includes(t('library.editor.avatar.saldoInsuficiente')), 'la relectura trae el saldo corto')
  check(window.balanceCalls === callsBeforeVerify + 1, 'confirmar relee la billetera antes de pagar: ' + (window.balanceCalls - callsBeforeVerify))
  check(window.avatarJobs.length === 0, 'con la relectura corta no se pide nada')
  check(dialogButton(CONFIRM).disabled && activeText() === CANCEL && dialog().contains(document.activeElement), 'confirmar apagado y el foco en «Cancelar», dentro del diálogo: ' + activeText())
  await press('Escape')
  await waitFor(() => !dialog(), 'cerrada')

  // 5b. Mientras se relee el saldo la confirmación no se cierra (si se
  //     cerrara, la lectura en vuelo arrancaría igual un pago descartado) y
  //     el foco no se escapa: los botones esperan con aria-disabled, no con
  //     disabled (ERRORES-CONOCIDOS: dialogo-radix-con-controles-y-x-
  //     deshabilitados-deja-escapar-el-foco).
  window.fixture.balance = USD(5)
  forgetBalance()
  panelButton(GENERATE).click()
  await waitFor(() => dialog()?.textContent.includes(t('library.editor.avatar.saldo', { balance: usd(5) })), 'la confirmación con saldo')
  let releaseBalance
  window.holdBalance = new Promise((done) => { releaseBalance = done })
  dialogButton(CONFIRM).focus()
  await press('Enter')
  await waitFor(() => dialogButton(CONFIRM)?.getAttribute('aria-disabled') === 'true', 'confirmar espera mientras relee')
  check(dialogButton(CANCEL).getAttribute('aria-disabled') === 'true' && !dialogButton(CONFIRM).disabled && document.activeElement === dialogButton(CONFIRM), 'los dos esperan con aria-disabled y el foco sigue en «Generar»')
  // Un segundo «Generar» mientras relee lo descarta el candado, y descartado
  // no mueve el foco: solo el saldo corto lo lleva a «Cancelar» (M1).
  dialogButton(CONFIRM).click()
  await delay()
  check(document.activeElement === dialogButton(CONFIRM) && window.avatarJobs.length === 0, 'un segundo «Generar» mientras relee no pide nada ni mueve el foco: ' + activeText())
  await press('Escape')
  await delay(150)
  check(dialog(), 'Escape no la cierra mientras relee')
  dialogButton(CANCEL).click()
  await delay(150)
  check(dialog() && window.avatarJobs.length === 0, 'ni Escape ni «Cancelar» la cierran mientras relee')
  await press('Tab')
  check(dialog().contains(document.activeElement), 'Tab no saca el foco del diálogo: ' + activeText())
  window.fixture.balance = USD(0.1)
  window.holdBalance = null
  releaseBalance()
  await waitFor(() => dialog()?.textContent.includes(t('library.editor.avatar.saldoInsuficiente')), 'la relectura corta llega')
  check(window.avatarJobs.length === 0 && dialogButton(CANCEL).getAttribute('aria-disabled') === 'false', 'no se pidió nada y cancelar vuelve a responder')
  dialogButton(CANCEL).click()
  await waitFor(() => !dialog(), 'ahora sí se cierra')

  // 6. Confirmar una escena con el teclado: el pedido exacto, la cola, el
  //    progreso en la pista y en el panel, la exclusión, y el resultado listo.
  window.fixture.balance = USD(5)
  forgetBalance()
  await select(2)
  panelButton(GENERATE).focus()
  await press('Enter')
  await waitFor(() => dialog()?.textContent.includes(t('library.editor.avatar.saldo', { balance: usd(5) })), 'la confirmación con saldo')
  await press('Tab')
  check(activeText() === CONFIRM, 'Tab pasa a «Generar»: ' + activeText())
  await press('Enter')
  await waitFor(() => window.avatarJobs.length === 1, 'Enter sobre «Generar» pide el avatar')
  const first = window.avatarJobs[0]
  check(first.subcommand === 'avatar-render-scenes', 'corre el subcomando avatar-render-scenes: ' + first.subcommand)
  check(JSON.stringify(first.payload) === JSON.stringify({ projectId: 'fixture', sceneIds: [2] }), 'el pedido lleva el proyecto y SOLO la escena elegida: ' + JSON.stringify(first.payload))
  await waitFor(() => !dialog(), 'la confirmación se cierra al arrancar')
  await waitFor(() => progressRegion() && document.activeElement === progressRegion(), 'el foco queda en la región del avance, no en su «Cancelar»: ' + activeText())
  check(progressRegion().getAttribute('aria-label') === RENDERING && panelButton(CANCEL), 'la región se llama «Generando el avatar…» y adentro está «Cancelar»')
  await waitFor(() => avatarBlock(2)?.title === RENDERING, 'el bloque de la escena 2 dice «Generando el avatar…»')
  check(!percentIn(avatarBlock(2)) && !percentIn(panel()), 'en cola, sin porcentaje en el bloque ni en el panel')
  check(window.editor.editorTask.isProjectBusy('fixture'), 'el proyecto queda ocupado mientras corre')
  // Una tarea a la vez: nada más entra mientras el avatar se genera.
  check(window.editor.editorTask.startAvatarRender('fixture', [4]) === false && window.avatarJobs.length === 1, 'otro avatar no arranca')
  check(window.editor.editorTask.enqueueRegen('fixture', [{ id: 1, rewritePrompt: false }]) === false, 'regenerar una imagen tampoco')
  check((await window.editor.editorTask.startRender('fixture')) === false && !window.editor.editorTask.canStartAnimation('fixture', [8]), 'ni exportar ni animar')
  await select(4)
  check(focusIsOnPanel(), 'al cambiar de escena con el foco en el avance, el foco pasa al panel y no a body: ' + document.activeElement?.tagName)
  check(panelButton(REGENERATE)?.disabled && panelButton(ALL(3))?.disabled, 'los botones de las otras escenas esperan (y «Regenerar todos» ya no cuenta la que se genera)')
  await select(2)
  first.onEvent({ type: 'avatar-scene-started', sceneId: 2 })
  await waitFor(() => percentIn(avatarBlock(2)) && percentIn(panel()), 'al arrancar, el porcentaje en el bloque y en el panel')
  check(panel().querySelector('[role="progressbar"]'), 'con su barra de avance en el panel')
  const startedPercent = Number(percentIn(avatarBlock(2)).slice(0, -1))
  first.onEvent({ type: 'avatar-scene-progress', sceneId: 2, phase: 'render', elapsedSeconds: 30 })
  await delay(1200)
  check(Number(percentIn(avatarBlock(2))?.slice(0, -1)) >= startedPercent, 'un aviso de fase no vuelve el porcentaje a cero')
  storeAvatar(2, view())
  const detailCallsBeforeReady = window.detailCalls
  first.onEvent({ type: 'avatar-scene-ready', sceneId: 2, scene: { id: 2 } })
  await waitFor(() => window.detailCalls > detailCallsBeforeReady, 'la escena lista relee el proyecto')
  await waitFor(() => avatarBlock(2)?.title === t('library.editor.timeline.avatarTitle', { name: 'Ana oficina', seconds: formatSlotSeconds(10, 'es') }), 'el bloque queda listo con su clip: ' + avatarBlock(2)?.title)
  first.onEvent({ type: 'job-completed', result: { rendered: [2], failed: [] } })
  await waitFor(() => !window.editor.editorTask.isProjectBusy('fixture'), 'al cerrar el job el proyecto se libera')
  await waitFor(() => window.toasts.some((item) => item.description === t('library.editor.avatar.listo')), 'el aviso «listo»')
  check(document.body.textContent.includes(t('library.editor.avatar.listo')), 'que se ve (Toaster)')
  check(queryClient.getQueryState(['avatars', 'balance'])?.isInvalidated, 'el saldo de avatares queda para releer')
  check(!panelButton(GENERATE) && !panelButton(REGENERATE) && !panelButton(CANCEL), 'la escena lista ya no ofrece nada')

  // 7. «Regenerar todos» con un fallo: el pedido con todas, en orden; cada una
  //    sale de la cola con su arranque; la fallida muestra su motivo en el
  //    bloque, en el panel y en el aviso; sin «listo».
  forgetBalance()
  await select(7)
  panelButton(ALL(3)).click()
  await waitFor(() => dialog()?.textContent.includes(t('library.editor.avatar.saldo', { balance: usd(5) })), 'la confirmación de las tres')
  check(dialog().textContent.includes(t('library.editor.avatar.confirmarTexto', { count: 3, amount: usd(createCost([span(18, 28), span(28, 38), span(48, 58)])) })), '«Se generan 3 apariciones» con el costo de Crear: ' + dialog().textContent)
  dialogButton(CONFIRM).click()
  await waitFor(() => window.avatarJobs.length === 2, 'pide las tres')
  const second = window.avatarJobs[1]
  check(JSON.stringify(second.payload) === JSON.stringify({ projectId: 'fixture', sceneIds: [4, 5, 7] }), 'el pedido lleva todas, en orden: ' + JSON.stringify(second.payload))
  await waitFor(() => progressRegion() && document.activeElement === progressRegion(), 'la elegida entra en la tarea: el foco va a la región de su avance: ' + activeText())
  await waitFor(() => [4, 5, 7].every((id) => avatarBlock(id)?.title === RENDERING), 'las tres en la pista, generándose')
  second.onEvent({ type: 'avatar-scene-started', sceneId: 4 })
  await waitFor(() => percentIn(avatarBlock(4)), 'la que arrancó muestra su porcentaje')
  check(!percentIn(avatarBlock(5)) && !percentIn(avatarBlock(7)), 'las que esperan turno, no')
  second.onEvent({ type: 'avatar-scene-started', sceneId: 5 })
  second.onEvent({ type: 'avatar-scene-started', sceneId: 7 })
  storeAvatar(4, view())
  const detailCallsBeforeFourReady = window.detailCalls
  second.onEvent({ type: 'avatar-scene-ready', sceneId: 4, scene: { id: 4 } })
  await waitFor(() => window.detailCalls > detailCallsBeforeFourReady && avatarBlock(4)?.title === t('library.editor.timeline.avatarTitle', { name: 'Ana oficina', seconds: formatSlotSeconds(10, 'es') }), 'la lista relee el proyecto y su bloque queda listo')
  await delay(100)
  // La fallida llega sola, con la relectura de la lista ya cerrada: la que la
  // trae tiene que ser la suya (Q3 de la revisión del WP-Q).
  storeAvatar(5, view({ status: 'failed', clipPath: undefined, errorCode: 'avatar_timeout' }))
  const timeoutReason = t(errorKeyOf('avatar_timeout'))
  const detailCallsBeforeFailed = window.detailCalls
  second.onEvent({ type: 'avatar-scene-failed', sceneId: 5, code: 'avatar_timeout' })
  await waitFor(() => window.detailCalls > detailCallsBeforeFailed, 'la fallida relee el proyecto en ese momento, sin esperar el cierre del job')
  await waitFor(() => avatarBlock(5)?.title === t('library.editor.timeline.avatarFailed', { reason: timeoutReason }), 'su bloque dice el motivo antes de que el job cierre: ' + avatarBlock(5)?.title)
  check(window.editor.editorTask.isProjectBusy('fixture'), 'con el job todavía corriendo')
  storeAvatar(7, view())
  second.onEvent({ type: 'avatar-scene-ready', sceneId: 7, scene: { id: 7 } })
  await waitFor(() => !progressRegion(), 'la elegida quedó lista: su avance se va')
  check(focusIsOnPanel(), 'y el foco que estaba en él pasa al panel, nunca a body: ' + document.activeElement?.tagName)
  second.onEvent({ type: 'job-completed', result: { rendered: [4, 7], failed: [5] } })
  await waitFor(() => avatarBlock(5)?.title === t('library.editor.timeline.avatarFailed', { reason: timeoutReason }), 'el bloque fallido dice su motivo: ' + avatarBlock(5)?.title)
  check(avatarBlock(4)?.title !== RENDERING && avatarBlock(7)?.title !== RENDERING, 'las listas salieron de «generando»')
  check(window.toasts.at(-1)?.description === t('library.editor.avatar.fallo', { reason: timeoutReason }) && window.toasts.at(-1)?.variant === 'destructive', 'el aviso del final dice el motivo: ' + JSON.stringify(window.toasts.at(-1)))
  check(window.toasts.filter((item) => item.description === t('library.editor.avatar.listo')).length === 1, 'sin un segundo «listo»')
  await select(5)
  check(panelButton(REGENERATE) && panel().textContent.includes(t('library.editor.avatar.fallo', { reason: timeoutReason })), 'el panel de la fallida dice el motivo y ofrece «Regenerar avatar»')
  check(!panelButton(ALL(1)) && !panelButton(ALL(2)), 'con una sola pendiente no hay «Regenerar todos»')

  // 8. Cancelar antes de que el invoke devuelva el id: se cancela al llegar.
  //    El cierre cancelado devuelve la escena a lo que dice el disco, sin
  //    avisos de listo ni de fallo; el editor dice que se canceló.
  window.holdInvoke = true
  const toastsBeforeCancel = window.toasts.length
  panelButton(REGENERATE).click()
  await waitFor(() => dialog()?.textContent.includes(t('library.editor.avatar.saldo', { balance: usd(5) })), 'la confirmación')
  dialogButton(CONFIRM).click()
  await waitFor(() => window.avatarJobs.length === 3, 'pide la escena 5')
  check(JSON.stringify(window.avatarJobs[2].payload.sceneIds) === '[5]', 'solo la 5')
  await waitFor(() => panelButton(CANCEL), 'el avance con «Cancelar»')
  panelButton(CANCEL).click()
  await delay()
  check(window.cancels.length === 0, 'sin id todavía no hay nada que cancelar en el sidecar')
  window.avatarJobs[2].release()
  await waitFor(() => window.cancels.includes('avatar-job-3'), 'al llegar el id, el job se cancela')
  window.avatarJobs[2].onEvent({ type: 'job-failed', code: 'cancelled', message: 'cancelled' })
  await waitFor(() => !window.editor.editorTask.isProjectBusy('fixture'), 'el proyecto se libera')
  await waitFor(() => avatarBlock(5)?.title === t('library.editor.timeline.avatarFailed', { reason: timeoutReason }), 'la escena vuelve a lo del disco')
  check(document.getElementById('banner').textContent === t(errorKeyOf('cancelled')), 'el editor dice que se canceló: ' + document.getElementById('banner').textContent)
  check(window.toasts.length === toastsBeforeCancel, 'cancelar no avisa «listo» ni un fallo')

  // 9. Cancelar con el id ya en mano: va directo al sidecar. Un job que cae
  //    entero (el saldo) lo dice el editor, sin avisos pasajeros.
  window.holdInvoke = false
  panelButton(REGENERATE).click()
  await waitFor(() => dialog()?.textContent.includes(t('library.editor.avatar.saldo', { balance: usd(5) })), 'la confirmación')
  dialogButton(CONFIRM).click()
  await waitFor(() => window.avatarJobs.length === 4 && panelButton(CANCEL), 'la cuarta tarea')
  await waitFor(() => window.editor.editorTask.task?.avatarRender?.jobId === 'avatar-job-4', 'con su id')
  panelButton(CANCEL).click()
  await waitFor(() => window.cancels.includes('avatar-job-4'), 'cancelar llama al sidecar con su id')
  window.avatarJobs[3].onEvent({ type: 'job-failed', code: 'avatar_insufficient_credits', message: 'no credits' })
  await waitFor(() => !window.editor.editorTask.isProjectBusy('fixture'), 'liberado')
  check(window.editor.editorTask.task.errorCode === 'avatar_insufficient_credits' && document.getElementById('banner').textContent === t(errorKeyOf('avatar_insufficient_credits')), 'el saldo agotado queda en el editor (su alerta de la cuenta, ADR-0031)')
  check(window.toasts.length === toastsBeforeCancel, 'sin avisos pasajeros')

  // 10. Doble clic en confirmar: un solo pedido.
  forgetBalance()
  panelButton(REGENERATE).click()
  await waitFor(() => dialog()?.textContent.includes(t('library.editor.avatar.saldo', { balance: usd(5) })), 'la confirmación')
  dialogButton(CONFIRM).click()
  dialogButton(CONFIRM)?.click()
  await waitFor(() => window.avatarJobs.length === 5, 'el pedido')
  await delay(200)
  check(window.avatarJobs.length === 5, 'el doble clic no pide dos veces')
  window.avatarJobs[4].onEvent({ type: 'job-failed', code: 'cancelled', message: 'cancelled' })
  await waitFor(() => !window.editor.editorTask.isProjectBusy('fixture'), 'liberado')

  // 10b. Enter sostenido de verdad (M1 de la revisión del WP-Q, como su
  //      sonda): sobre «Generar» de la confirmación pide una sola vez, cada
  //      repetición se ignora (mientras relee el saldo y después) y el foco
  //      pasa a la región del avance, no a su «Cancelar»: lo que se acaba de
  //      confirmar no se cancela. Sobre «Cancelar» del avance, una sola
  //      cancelación; cancelar otra vez no vuelve a llamar al sidecar.
  forgetBalance()
  panelButton(REGENERATE).click()
  await waitFor(() => dialog()?.textContent.includes(t('library.editor.avatar.saldo', { balance: usd(5) })), 'la confirmación')
  const jobsBeforeHeld = window.avatarJobs.length
  const cancelsBeforeHeld = window.cancels.length
  let releaseHeldBalance
  window.holdBalance = new Promise((done) => { releaseHeldBalance = done })
  // La billetera responde después de tres repeticiones sobre «Generar»: esas
  // caen mientras relee y las demás, después del arranque.
  window.onHeldRepeat = (label, seen) => {
    if (label !== CONFIRM || seen.repeats !== 3) return
    window.holdBalance = null
    releaseHeldBalance()
  }
  window.heldOn.clear()
  window.heldElsewhere = 0
  dialogButton(CONFIRM).focus()
  await press(ENTER_HELD)
  window.onHeldRepeat = null
  const heldJob = await waitFor(() => window.avatarJobs[jobsBeforeHeld], 'Enter sostenido sobre «Generar» pide el avatar')
  check(window.avatarJobs.length === jobsBeforeHeld + 1 && JSON.stringify(heldJob.payload.sceneIds) === '[5]', 'una sola vez, la escena elegida: ' + (window.avatarJobs.length - jobsBeforeHeld))
  check(window.cancels.length === cancelsBeforeHeld && window.editor.editorTask.task.avatarRender && !window.editor.editorTask.task.avatarRender.cancelled, 'y no cancela lo que acaba de confirmar: ' + JSON.stringify(window.cancels.slice(cancelsBeforeHeld)))
  const heldOnConfirm = window.heldOn.get(CONFIRM)
  check(heldOnConfirm?.repeats > 0 && heldOnConfirm.ignored === heldOnConfirm.repeats, '«Generar» ignora cada repetición: ' + JSON.stringify(heldOnConfirm))
  check(document.activeElement === progressRegion() && window.heldElsewhere > 0 && !window.heldOn.has(CANCEL), 'el foco pasó a la región del avance: las repeticiones que siguieron al arranque cayeron ahí (' + window.heldElsewhere + ') y ninguna en un «Cancelar»: ' + activeText())
  await waitFor(() => window.editor.editorTask.task?.avatarRender?.jobId === heldJob.jobId, 'con su id')
  window.heldOn.clear()
  // El sidecar ya lo cerró: su cancelar responde JobNotFound, y esa respuesta
  // no queda como una promesa rechazada sin atender.
  window.cancelFails = true
  panelButton(CANCEL).focus()
  await press(ENTER_HELD)
  await waitFor(() => window.cancels.length === cancelsBeforeHeld + 1, 'Enter sobre «Cancelar» cancela')
  await delay(100)
  check(window.cancels.length === cancelsBeforeHeld + 1 && window.cancels.at(-1) === heldJob.jobId, 'Enter sostenido sobre «Cancelar» cancela una sola vez el job que corre: ' + JSON.stringify(window.cancels.slice(cancelsBeforeHeld)))
  const heldOnCancel = window.heldOn.get(CANCEL)
  check(heldOnCancel?.repeats > 0 && heldOnCancel.ignored === heldOnCancel.repeats, '«Cancelar» ignora cada repetición: ' + JSON.stringify(heldOnCancel))
  window.editor.editorTask.cancelActiveJob('fixture')
  await delay(100)
  check(window.cancels.length === cancelsBeforeHeld + 1, 'cancelar otra vez no vuelve a llamar al sidecar')
  check(window.unhandledRejections.length === 0, 'el JobNotFound de un job que ya terminó no queda sin atender: ' + JSON.stringify(window.unhandledRejections))
  window.cancelFails = false
  heldJob.onEvent({ type: 'job-failed', code: 'cancelled', message: 'cancelled' })
  await waitFor(() => !window.editor.editorTask.isProjectBusy('fixture'), 'liberado')

  // 11. Otra tarea en curso: los botones esperan y el store no arranca.
  window.editor.editorTask.beginAudioOperation('fixture')
  await waitFor(() => panelButton(REGENERATE)?.disabled, 'con el audio cambiando, «Regenerar avatar» espera')
  check(window.editor.editorTask.startAvatarRender('fixture', [5]) === false, 'y el store no lo arranca')
  window.editor.editorTask.endAudioOperation('fixture', null)
  await waitFor(() => panelButton(REGENERATE) && !panelButton(REGENERATE).disabled, 'al terminar, vuelve')

  // 12. La demo: nada se genera.
  window.fixture.locked = true
  await select(4)
  await select(5)
  check(panelButton(REGENERATE)?.disabled && panel().textContent.includes(t('library.editor.demoLocked')), 'en la demo, deshabilitado y con el porqué')
  window.fixture.locked = false

  // 13. Sin la clave del avatar presentador: el aviso de siempre con su
  //     enlace, sin botones.
  window.fixture.keys = ['fal', 'deepinfra']
  await queryClient.invalidateQueries({ queryKey: ['apiKeys'] })
  await waitFor(() => panel()?.textContent.includes(t('create.avatar.noKey')), 'sin clave, el aviso')
  check([...panel().querySelectorAll('a')].some((link) => link.textContent.trim() === t('create.avatar.goToApiKeys')), 'con el enlace a Claves API')
  check(!panelButton(REGENERATE) && !panelButton(GENERATE), 'y sin botones que paguen')
  await select(6)
  check(!panel().textContent.includes(t('create.avatar.noKey')), 'una lista y al día no ofrece nada: tampoco el aviso de la clave')

  // 13b. Mientras el llavero responde (Q5 de la revisión del WP-Q), el panel
  //      todavía no sabe: ni botones que paguen ni el aviso de la clave. Cuando
  //      responde con la clave, aparecen.
  await select(5)
  check(panel().textContent.includes(t('create.avatar.noKey')), 'la fallida, sin la clave: el aviso')
  let releaseKeys
  window.holdKeys = new Promise((done) => { releaseKeys = done })
  window.fixture.keys = ['heygen', 'fal', 'deepinfra']
  void queryClient.resetQueries({ queryKey: ['apiKeys'] })
  await waitFor(() => !panel()?.textContent.includes(t('create.avatar.noKey')), 'con el llavero cargando, el aviso se va')
  await delay(150)
  check(!panelButton(REGENERATE) && !panelButton(GENERATE) && !panel().textContent.includes(t('create.avatar.noKey')) && !panel().textContent.includes(t('library.editor.avatar.costo', { amount: usd(0.165) })), 'con el llavero cargando: ni botones, ni costo, ni el aviso de la clave')
  window.holdKeys = null
  releaseKeys()
  await waitFor(() => panelButton(REGENERATE) && panel().textContent.includes(t('library.editor.avatar.costo', { amount: usd(0.165) })), 'cuando responde con la clave, «Regenerar avatar» y su costo')
  await select(6)

  // 14. Ruling del 2026-10-11: una lista DESACTUALIZADA que perdió su clip
  //     llega del sidecar fallida por la descarga («ya está pago») y con
  //     stale, pero regenerarla paga otro render. La pista y el panel la
  //     muestran «Desactualizado» con su explicación, nunca el texto de la
  //     descarga; el botón es «Regenerar» y el costo, el de un render nuevo.
  //     Una lista al día que perdió su clip sigue fallida con ese texto (ahí
  //     sí es cierto).
  window.fixture.keys = ['heygen', 'fal', 'deepinfra']
  await queryClient.invalidateQueries({ queryKey: ['apiKeys'] })
  storeAvatar(6, view({ status: 'failed', clipPath: undefined, clipMtimeMs: undefined, errorCode: 'avatar_download_failed', stale: true }))
  storeAvatar(2, view({ status: 'failed', clipPath: undefined, clipMtimeMs: undefined, errorCode: 'avatar_download_failed' }))
  await queryClient.invalidateQueries({ queryKey: ['videos', 'project', 'fixture', 'detail'] })
  const downloadReason = t(errorKeyOf('avatar_download_failed'))
  await waitFor(() => avatarBlock(6)?.title === t('library.editor.timeline.avatarStaleHint'), 'la pista dice «Desactualizado» con su explicación: ' + avatarBlock(6)?.title)
  check(avatarBlock(6).textContent.includes(t('library.editor.timeline.avatarStale')) && ![...avatarBlock(6).querySelectorAll('span')].some((element) => element.className.includes('bg-destructive/40')), 'con su etiqueta y sin el velo rojo de fallida')
  await waitFor(() => panelButton(REGENERATE), 'el panel ofrece «Regenerar avatar»')
  check(panel().textContent.includes(t('library.editor.timeline.avatarStaleHint')), 'el panel también: «Desactualizado» con su explicación')
  check(!panel().textContent.includes(downloadReason) && !avatarBlock(6).title.includes(downloadReason), 'nunca el texto de la descarga («ya está pago»)')
  check(panel().textContent.includes(t('library.editor.avatar.costo', { amount: usd(0.165) })), 'el costo de un render nuevo')
  panelButton(REGENERATE).click()
  await waitFor(() => dialog()?.textContent.includes(t('library.editor.avatar.confirmarTexto', { count: 1, amount: usd(0.165) })), 'la confirmación cobra un render nuevo')
  dialogButton(CANCEL).click()
  await waitFor(() => !dialog(), 'cerrada')
  await waitFor(() => avatarBlock(2)?.title === t('library.editor.timeline.avatarFailed', { reason: downloadReason }), 'la lista al día sin clip sigue fallida, con el motivo de la descarga')
  await select(2)
  check(panel().textContent.includes(t('library.editor.avatar.fallo', { reason: downloadReason })) && !panel().textContent.includes(t('library.editor.timeline.avatarStaleHint')), 'y su panel lo dice, sin «Desactualizado»')

  // 15. La vista real (LibraryEditor) con su cableado (ronda 1): el panel
  //     recibe el proyecto de la ruta y las escenas, y la pista los renders del
  //     store. Un proyecto nuevo, como en disco al principio: clic en el bloque
  //     planeado, el costo, la confirmación, el pedido con el proyecto de la
  //     ruta, el bloque de la pista generando (en cola y después con su
  //     porcentaje), «Cancelar» en el panel, exportar que espera mientras se
  //     genera, y el resultado listo con su aviso.
  reactRoot.unmount()
  window.fixture.balance = USD(5)
  forgetBalance()
  window.holdInvoke = false
  window.detail = structuredClone(INITIAL_DETAIL)
  const jobsBeforeView = window.avatarJobs.length
  const toastsBeforeView = window.toasts.length
  const viewRoot = createRoot(document.getElementById('root'), { onUncaughtError: (error) => { renderError = error } })
  viewRoot.render(<QueryClientProvider client={queryClient}><I18nextProvider i18n={i18n}><TooltipProvider><MemoryRouter initialEntries={['/editor/fixture-view']}><div id={EDITOR_BAR_SLOT_IDS.title} /><div id={EDITOR_BAR_SLOT_IDS.actions} /><Routes><Route path="/editor/:projectId" element={<LibraryEditor />} /></Routes></MemoryRouter><Toaster /></TooltipProvider></I18nextProvider></QueryClientProvider>)
  panelRoot = () => document.querySelector('#root aside')
  timelineRoot = () => document.getElementById('root')
  const exportButton = () => [...(document.getElementById(EDITOR_BAR_SLOT_IDS.actions)?.querySelectorAll('button') ?? [])].find((button) => button.textContent.trim() === t('library.editor.render.render'))
  await waitFor(() => avatarBlock(2), 'la vista real dibuja el bloque de la escena 2')
  avatarBlock(2).click()
  await waitFor(() => panelButton(GENERATE), 'clic en el bloque: el panel de la vista ofrece «Generar avatar» (proyecto y escenas cableados)')
  check(panel().textContent.includes(t('library.editor.avatar.costo', { amount: usd(0.165) })) && panelButton(ALL(4)), 'en la vista, con su costo y «Regenerar todos (4)»')
  check(exportButton() && !exportButton().disabled, 'exportar, habilitado antes de pedir')
  panelButton(GENERATE).click()
  await waitFor(() => dialog()?.textContent.includes(t('library.editor.avatar.saldo', { balance: usd(5) })), 'la confirmación de la vista con el saldo')
  dialogButton(CONFIRM).click()
  await waitFor(() => window.avatarJobs.length === jobsBeforeView + 1, 'la vista pide el avatar')
  const viewJob = window.avatarJobs.at(-1)
  check(viewJob.subcommand === 'avatar-render-scenes' && JSON.stringify(viewJob.payload) === JSON.stringify({ projectId: 'fixture-view', sceneIds: [2] }), 'con el proyecto de la ruta y la escena elegida: ' + JSON.stringify(viewJob.payload))
  await waitFor(() => avatarBlock(2)?.title === RENDERING, 'la pista de la vista muestra el bloque generando (sceneAvatarRendering cableado)')
  check(!percentIn(avatarBlock(2)) && panelButton(CANCEL), 'en cola, sin porcentaje y con «Cancelar» en el panel')
  check(exportButton()?.disabled, 'mientras se genera, exportar espera (el ocupado de la vista)')
  viewJob.onEvent({ type: 'avatar-scene-started', sceneId: 2 })
  await waitFor(() => percentIn(avatarBlock(2)) && percentIn(panel()), 'arrancó: el porcentaje en la pista y en el panel de la vista')
  storeAvatar(2, view())
  viewJob.onEvent({ type: 'avatar-scene-ready', sceneId: 2, scene: { id: 2 } })
  viewJob.onEvent({ type: 'job-completed', result: { rendered: [2], failed: [] } })
  await waitFor(() => avatarBlock(2)?.title === t('library.editor.timeline.avatarTitle', { name: 'Ana oficina', seconds: formatSlotSeconds(10, 'es') }), 'el bloque de la vista queda listo')
  await waitFor(() => window.toasts.length > toastsBeforeView && window.toasts.at(-1).description === t('library.editor.avatar.listo'), 'y el aviso «listo»')
  check(await waitFor(() => exportButton() && !exportButton().disabled, 'exportar vuelve al cerrar el job'), 'exportar vuelve al cerrar el job')

  // 16. Ronda 2 (I1 de la revisión de WP-P, y F2 y F3 de su re-revisión):
  //     arriba del editor, el aviso de las apariciones con la imagen fija del
  //     look (AvatarFallbackNote con la regla única, isAvatarFallback en el
  //     contexto del proyecto) con el texto del editor, sin el «podés
  //     regenerarlas desde el editor» que acá sería circular, y su botón con la
  //     misma confirmación. Aparece con una fallida, una planeada o una lista
  //     sin clip; no con una desactualizada sola ni con todo al día; el número
  //     de su botón es el del aviso y pide exactamente esas escenas, aunque
  //     haya una desactualizada (esa sigue con su aviso propio y su
  //     «Regenerar» del panel); espera con otra tarea en curso; y el aviso se
  //     va cuando la regeneración deja listas las que contaba. Ronda 3: el
  //     botón dice «Regenerarlas (N)», no el «Regenerar todos (N)» del panel
  //     (M4); sin la clave, el aviso sin botón (Q2); una escena sin tramo no
  //     cuenta (M6); y el foco nunca cae en body al terminar (M2).
  const FAILED = view({ status: 'failed', clipPath: undefined, clipMtimeMs: undefined, errorCode: 'avatar_timeout' })
  const LOST = view({ status: 'failed', clipPath: undefined, clipMtimeMs: undefined, errorCode: 'avatar_download_failed' })
  // Las escenas de avatar del proyecto en esos estados (las demás, listas) y,
  // si hace falta, otros tramos; y la vista releída: espera a que se vea.
  async function project(avatars, settled, spans = {}) {
    window.detail = { ...structuredClone(INITIAL_DETAIL), scenes: INITIAL_DETAIL.scenes.map((item) => ({ ...(item.avatar ? { ...item, avatar: avatars[item.id] ?? view() } : item), ...spans[item.id] })) }
    await queryClient.invalidateQueries({ queryKey: ['videos', 'project', 'fixture-view', 'detail'] })
    await waitFor(settled, 'la vista releyó el proyecto')
    await delay(60)
  }
  // Los textos del editor existen en el catálogo (comparar con i18n.t de una
  // clave que no existe pasa en vacío: daría la clave cruda en los dos lados).
  check(i18n.exists('library.editor.avatar.fallbackNote_one') && i18n.exists('library.editor.avatar.fallbackNote_other'), 'el texto del aviso del editor está en el catálogo')
  check(i18n.exists('library.editor.avatar.regenerarAviso'), 'el texto del botón del aviso está en el catálogo')
  const fallbackText = (count) => t('library.editor.avatar.fallbackNote', { count })
  const NOTICE_ALL = (count) => t('library.editor.avatar.regenerarAviso', { count })
  const notice = (count) => [...document.querySelectorAll('#root p')].find((paragraph) => paragraph.textContent === fallbackText(count))?.parentElement
  const anyNotice = () => [1, 2, 3, 4, 5].some((count) => notice(count))
  const noticeButton = (count) => [...(notice(count)?.querySelectorAll('button') ?? [])].find((button) => button.textContent.trim() === NOTICE_ALL(count))
  const failedTitle = (code) => t('library.editor.timeline.avatarFailed', { reason: t(errorKeyOf(code)) })
  const readyTitle = t('library.editor.timeline.avatarTitle', { name: 'Ana oficina', seconds: formatSlotSeconds(10, 'es') })
  await project({ 5: FAILED }, () => avatarBlock(5)?.title === failedTitle('avatar_timeout'))
  check(notice(1) && noticeButton(1), 'una fallida: el aviso con «' + NOTICE_ALL(1) + '»')
  check(!notice(1).textContent.includes(t('create.progress.avatarFallback', { count: 1 })) && !/editor/i.test(notice(1).querySelector('p').textContent), 'con el texto del editor, sin mandar «al editor»: ' + notice(1).querySelector('p').textContent)
  // Sin la clave del avatar presentador (Q2 de la revisión del WP-Q): el
  // aviso igual cuenta, pero sin su botón. Con la clave, el botón vuelve.
  window.fixture.keys = ['fal', 'deepinfra']
  await queryClient.invalidateQueries({ queryKey: ['apiKeys'] })
  await waitFor(() => notice(1) && !notice(1).querySelector('button'), 'sin la clave, el aviso sin su botón')
  check(fallbackText(1) === notice(1).querySelector('p').textContent, 'con su texto de siempre')
  window.fixture.keys = ['heygen', 'fal', 'deepinfra']
  await queryClient.invalidateQueries({ queryKey: ['apiKeys'] })
  await waitFor(() => noticeButton(1), 'con la clave, su botón vuelve')
  await project({ 2: view(PLANNED) }, () => avatarBlock(2)?.title === t('library.editor.timeline.avatarPlanned'))
  check(notice(1) && noticeButton(1), 'una planeada: el aviso')
  await project({ 7: LOST }, () => avatarBlock(7)?.title === failedTitle('avatar_download_failed'))
  check(notice(1) && noticeButton(1), 'una lista sin clip (fallida por la descarga): el aviso')
  await project({ 4: view({ stale: true }) }, () => avatarBlock(4)?.title === t('library.editor.timeline.avatarStaleHint') && avatarBlock(7)?.title !== failedTitle('avatar_download_failed'))
  check(!anyNotice(), 'una desactualizada sola: sin aviso (tiene el suyo en la pista y en el panel)')
  await project({}, () => avatarBlock(4)?.title !== t('library.editor.timeline.avatarStaleHint'))
  check(!anyNotice(), 'todo al día: sin aviso')
  // La desactualizada que perdió su clip: el sidecar la manda fallida por la
  // descarga y con stale. Tampoco cuenta, aunque no tenga clip (M1 de la
  // revisión final de la 2d): el aviso pagaría por una escena que el panel
  // ya ofrece con su «Regenerar», sola.
  const STALE_LOST = view({ status: 'failed', clipPath: undefined, clipMtimeMs: undefined, errorCode: 'avatar_download_failed', stale: true })
  const anyAllButton = () => [...(panel()?.querySelectorAll('button') ?? [])].some((button) => [1, 2, 3, 4, 5, 6, 7, 8].some((count) => button.textContent.trim() === ALL(count)))
  await project({ 4: STALE_LOST }, () => avatarBlock(4)?.title === t('library.editor.timeline.avatarStaleHint'))
  check(!anyNotice(), 'una desactualizada que perdió su clip (fallida y stale): sin aviso')
  avatarBlock(4).click()
  await waitFor(() => panel()?.textContent.includes(t('library.editor.panel.sceneTitle', { id: 4 })) && panelButton(REGENERATE), 'el panel de la 4 ofrece «Regenerar avatar»')
  check(panel().textContent.includes(t('library.editor.timeline.avatarStaleHint')) && !anyAllButton(), 'con «Desactualizado» y sola, sin «Regenerar todos»')
  avatarBlock(2).click()
  await waitFor(() => panel()?.textContent.includes(t('library.editor.panel.sceneTitle', { id: 2 })), 'de vuelta a la 2')
  // Una escena de avatar sin un cuadro de tramo no tiene bloque y el panel no
  // la puede pedir: el aviso tampoco la cuenta ni la pide (M6).
  await project({ 2: view(PLANNED), 5: FAILED, 7: LOST }, () => notice(2), { 7: { endSeconds: 48.01 }, 8: { startSeconds: 48.01 } })
  check(noticeButton(2) && !notice(3) && !avatarBlock(7), 'tres con la imagen fija, una sin tramo: el aviso cuenta dos')
  noticeButton(2).click()
  await waitFor(() => dialog()?.textContent.includes(t('library.editor.avatar.saldo', { balance: usd(5) })), 'la confirmación del aviso')
  check(dialog().textContent.includes(t('library.editor.avatar.confirmarTexto', { count: 2, amount: usd(createCost([span(4, 14), span(28, 38)])) })), 'y la confirmación cobra esas dos: ' + dialog().textContent)
  dialogButton(CANCEL).click()
  await waitFor(() => !dialog(), 'cerrada')
  await project({ 2: view(PLANNED), 4: view({ stale: true }), 5: FAILED, 7: LOST }, () => notice(3))
  check(noticeButton(3) && !noticeButton(3).disabled, 'tres con la imagen fija y «' + NOTICE_ALL(3) + '»: el número del botón es el del aviso aunque haya una desactualizada')
  check(panelButton(ALL(4)) && NOTICE_ALL(3) !== ALL(3) && ![...notice(3).querySelectorAll('button')].some((button) => button.textContent.includes(t('library.editor.avatar.regenerarTodos', { count: 3 })) || button.textContent.includes(ALL(4))), 'el panel dice «' + ALL(4) + '» (con la desactualizada) y el aviso «' + NOTICE_ALL(3) + '»: dos textos para dos conjuntos (M4)')
  window.editor.editorTask.beginAudioOperation('fixture-view')
  await waitFor(() => noticeButton(3)?.disabled, 'con otra tarea del editor en curso, el botón del aviso espera')
  window.editor.editorTask.endAudioOperation('fixture-view', null)
  await waitFor(() => noticeButton(3) && !noticeButton(3).disabled, 'al terminar, vuelve')
  noticeButton(3).focus()
  await press('Enter')
  await waitFor(() => dialog()?.textContent.includes(t('library.editor.avatar.saldo', { balance: usd(5) })), 'Enter abre la misma confirmación, con el saldo')
  check(dialog().textContent.includes(t('library.editor.avatar.confirmarTexto', { count: 3, amount: usd(createCost([span(4, 14), span(28, 38), span(48, 58)])) })), '«Se generan 3 apariciones» con el costo de Crear de esas tres: ' + dialog().textContent)
  await press('Escape')
  await waitFor(() => !dialog() && document.activeElement === noticeButton(3), 'Escape cierra y el foco vuelve al botón del aviso: ' + activeText())
  const jobsBeforeNotice = window.avatarJobs.length
  noticeButton(3).click()
  await waitFor(() => dialog()?.textContent.includes(t('library.editor.avatar.saldo', { balance: usd(5) })), 'la confirmación')
  dialogButton(CONFIRM).click()
  await waitFor(() => window.avatarJobs.length === jobsBeforeNotice + 1, 'el aviso pide el avatar')
  const noticeJob = window.avatarJobs.at(-1)
  check(JSON.stringify(noticeJob.payload) === JSON.stringify({ projectId: 'fixture-view', sceneIds: [2, 5, 7] }), 'pide exactamente las que cuenta, sin la desactualizada: ' + JSON.stringify(noticeJob.payload))
  await waitFor(() => !dialog() && document.activeElement === notice(3)?.parentElement, 'al arrancar, el foco queda en el aviso: ' + activeText())
  check(noticeButton(3)?.disabled, 'mientras se generan, el aviso sigue con su botón apagado')
  // Todo seguido, como cuando el cierre llega antes que la relectura: al
  // cerrar, el foco vuelve al botón que abrió la confirmación (todavía con la
  // cuenta vieja) y, cuando la relectura las trae listas y el aviso se va, al
  // panel (M2).
  for (const id of [2, 5, 7]) noticeJob.onEvent({ type: 'avatar-scene-started', sceneId: id })
  for (const id of [2, 5, 7]) {
    storeAvatar(id, view())
    noticeJob.onEvent({ type: 'avatar-scene-ready', sceneId: id, scene: { id } })
  }
  noticeJob.onEvent({ type: 'job-completed', result: { rendered: [2, 5, 7], failed: [] } })
  await waitFor(() => !anyNotice() && [2, 5, 7].every((id) => avatarBlock(id)?.title === readyTitle), 'la regeneración dejó listas las que contaba: el aviso se fue')
  check(avatarBlock(4)?.title === t('library.editor.timeline.avatarStaleHint'), 'la desactualizada sigue con su aviso propio en la pista')
  check(window.toasts.at(-1)?.description === t('library.editor.avatar.listo'), 'y salió «listo»')
  check(await waitFor(() => focusIsOnPanel(), 'el foco que estaba en el aviso pasa al panel, nunca a body: ' + document.activeElement?.tagName), 'el foco que estaba en el aviso pasa al panel, nunca a body')
  // Si una vuelve a fallar, el aviso sigue y el foco vuelve a su botón, el
  // que abrió la confirmación (M2).
  await project({ 5: FAILED, 7: LOST }, () => notice(2) && avatarBlock(7)?.title === failedTitle('avatar_download_failed'))
  noticeButton(2).click()
  await waitFor(() => dialog()?.textContent.includes(t('library.editor.avatar.saldo', { balance: usd(5) })), 'la confirmación de las dos')
  dialogButton(CONFIRM).click()
  await waitFor(() => window.avatarJobs.length === jobsBeforeNotice + 2, 'el aviso pide las dos')
  const retryJob = window.avatarJobs.at(-1)
  check(JSON.stringify(retryJob.payload.sceneIds) === '[5,7]', 'las dos que cuenta: ' + JSON.stringify(retryJob.payload.sceneIds))
  await waitFor(() => !dialog() && document.activeElement === notice(2)?.parentElement, 'al arrancar, el foco en el aviso: ' + activeText())
  for (const id of [5, 7]) retryJob.onEvent({ type: 'avatar-scene-started', sceneId: id })
  storeAvatar(5, FAILED)
  retryJob.onEvent({ type: 'avatar-scene-failed', sceneId: 5, code: 'avatar_timeout' })
  storeAvatar(7, view())
  retryJob.onEvent({ type: 'avatar-scene-ready', sceneId: 7, scene: { id: 7 } })
  retryJob.onEvent({ type: 'job-completed', result: { rendered: [7], failed: [5] } })
  await waitFor(() => notice(1) && avatarBlock(7)?.title === readyTitle, 'quedó una con la imagen fija: el aviso sigue con una')
  check(await waitFor(() => document.activeElement === noticeButton(1), 'el foco vuelve al botón del aviso: ' + activeText()), 'el foco vuelve al botón del aviso')
  // Y si la relectura las trae listas antes de que el job cierre, el aviso se
  // va con el foco encima mientras corre: al panel (M2).
  noticeButton(1).click()
  await waitFor(() => dialog()?.textContent.includes(t('library.editor.avatar.saldo', { balance: usd(5) })), 'la confirmación de la que quedó')
  dialogButton(CONFIRM).click()
  await waitFor(() => window.avatarJobs.length === jobsBeforeNotice + 3, 'el aviso la pide')
  const lastJob = window.avatarJobs.at(-1)
  check(JSON.stringify(lastJob.payload.sceneIds) === '[5]', 'la que quedó: ' + JSON.stringify(lastJob.payload.sceneIds))
  await waitFor(() => !dialog() && document.activeElement === notice(1)?.parentElement, 'al arrancar, el foco en el aviso: ' + activeText())
  lastJob.onEvent({ type: 'avatar-scene-started', sceneId: 5 })
  storeAvatar(5, view())
  lastJob.onEvent({ type: 'avatar-scene-ready', sceneId: 5, scene: { id: 5 } })
  await waitFor(() => !anyNotice() && avatarBlock(5)?.title === readyTitle, 'la relectura la trae lista con el job corriendo: el aviso se va')
  check(window.editor.editorTask.isProjectBusy('fixture-view'), 'con el job todavía abierto')
  check(focusIsOnPanel(), 'y el foco que estaba en el aviso pasa al panel, nunca a body: ' + document.activeElement?.tagName)
  lastJob.onEvent({ type: 'job-completed', result: { rendered: [5], failed: [] } })
  await waitFor(() => !window.editor.editorTask.isProjectBusy('fixture-view'), 'liberado')
  check(focusIsOnPanel(), 'el cierre no lo mueve')
  // F1 de la re-revisión del WP-Q, como la sonda A del revisor: Enter
  // sostenido sobre «Generar» y el job que cae (sin saldo) con la tecla
  // todavía apretada. El foco vuelve al botón del aviso y una repetición
  // reabre la confirmación; su «Cancelar» ignora las que siguen. La
  // confirmación queda abierta: no se abre y se cierra en bucle, y nada paga
  // ni cancela de más.
  await project({ 5: FAILED, 7: LOST }, () => notice(2) && avatarBlock(5)?.title === failedTitle('avatar_timeout'))
  noticeButton(2).click()
  await waitFor(() => dialog()?.textContent.includes(t('library.editor.avatar.saldo', { balance: usd(5) })), 'la confirmación del aviso')
  const jobsBeforeLoop = window.avatarJobs.length
  const cancelsBeforeLoop = window.cancels.length
  window.heldOn.clear()
  window.heldElsewhere = 0
  // El job cae después de la tercera repetición que llega al aviso, ya
  // arrancado, en su propia tarea como un evento del sidecar: dentro del
  // keydown, el foco movido se llevaría el keypress de esa misma tecla.
  window.onHeldElsewhere = (count) => {
    if (count !== 3) return
    setTimeout(() => window.avatarJobs[jobsBeforeLoop]?.onEvent({ type: 'job-failed', code: 'avatar_insufficient_credits', message: 'no credits' }))
  }
  dialogButton(CONFIRM).focus()
  await press(ENTER_HELD)
  window.onHeldElsewhere = null
  check(window.avatarJobs.length === jobsBeforeLoop + 1 && window.cancels.length === cancelsBeforeLoop, 'un solo pedido y ninguna cancelación: ' + (window.avatarJobs.length - jobsBeforeLoop))
  check(window.heldElsewhere >= 3 && !window.editor.editorTask.isProjectBusy('fixture-view'), 'el job cayó con la tecla apretada')
  const heldOnNoticeButton = window.heldOn.get(NOTICE_ALL(2))
  check(heldOnNoticeButton?.repeats === 1, 'una sola repetición cayó en el botón del aviso, la que reabrió la confirmación: ' + JSON.stringify([...window.heldOn]))
  const heldOnDialogCancel = window.heldOn.get(CANCEL)
  check(heldOnDialogCancel?.repeats > 0 && heldOnDialogCancel.ignored === heldOnDialogCancel.repeats, 'el «Cancelar» de la confirmación ignora cada repetición: ' + JSON.stringify(heldOnDialogCancel))
  check(dialog() && document.activeElement === dialogButton(CANCEL), 'la confirmación quedó abierta, con el foco en su «Cancelar»')
  await press('Escape')
  await waitFor(() => !dialog() && document.activeElement === noticeButton(2), 'Escape la cierra y el foco vuelve al botón del aviso: ' + activeText())

  // 17. M3 de la revisión final de la 2d: Crear no lanza el pipeline sobre un
  //     proyecto con una tarea del editor en curso; el sidecar la rechazaría
  //     con animation_project_busy y la tarea quedaría en error. Es el store
  //     REAL de Crear (el resto del guard usa su simulacro, sin tarea de
  //     Crear), con el pipeline simulado por el fetcher. Con el avatar
  //     generándose desde el editor: «Reanudar», reintentar o «Generar
  //     borrador» (startPipelineForProject), confirmar el corte desde el disco
  //     (confirmScenesForProject) y «Reintentar» de Crear (resume) dan el
  //     aviso de «ocupado» y no le piden nada al sidecar. Con el editor libre,
  //     arrancan.
  const probeHost = document.createElement('div')
  document.body.append(probeHost)
  function CreateProbe() {
    window.realCreate = useRealCreateTask()
    return null
  }
  createRoot(probeHost).render(<CreateProbe />)
  await waitFor(() => window.realCreate, 'el store real de Crear')
  const PROJECT = 'fixture-view'
  const RUN_OPTIONS = { videoFormat: '16:9' }
  const CUT = { sceneCount: 8 }
  const BUSY = t('library.errors.projectBusy')
  const busyToasts = () => window.toasts.filter((item) => item.description === BUSY && item.variant === 'destructive').length
  const busyToastsBefore = busyToasts()
  const editorJobsBefore = window.avatarJobs.length
  check(window.editor.editorTask.startAvatarRender(PROJECT, [5]), 'el editor arranca el avatar de la 5')
  await waitFor(() => window.avatarJobs.length === editorJobsBefore + 1, 'el pedido del avatar')
  check((await window.realCreate.startPipelineForProject(PROJECT, 'Fixture', RUN_OPTIONS)) === false, '«Reanudar» de la biblioteca no arranca con el avatar del editor en curso')
  check((await window.realCreate.confirmScenesForProject(PROJECT, 'Fixture', CUT, RUN_OPTIONS)) === false, 'confirmar el corte desde el disco tampoco')
  check(window.pipelineRuns.length === 0 && window.confirmCalls.length === 0 && !realHasBusyCreateTask(), 'sin pedirle nada al sidecar ni abrir una tarea de Crear')
  check(busyToasts() === busyToastsBefore + 2, 'cada uno da el aviso de «ocupado»: ' + BUSY)
  window.avatarJobs.at(-1).onEvent({ type: 'job-failed', code: 'cancelled', message: 'cancelled' })
  await waitFor(() => !window.editor.editorTask.isProjectBusy(PROJECT), 'el editor quedó libre')
  check((await window.realCreate.startPipelineForProject(PROJECT, 'Fixture', RUN_OPTIONS)) === true, 'con el editor libre, «Reanudar» arranca')
  check(window.pipelineRuns.length === 1 && JSON.stringify(window.pipelineRuns[0].payload) === JSON.stringify({ projectId: PROJECT }) && realHasBusyCreateTask(), 'el pipeline del proyecto: ' + JSON.stringify(window.pipelineRuns[0]?.payload))
  // La tarea de Crear cae y queda en error, lista para «Reintentar».
  window.pipelineRuns[0].onEvent({ type: 'job-failed', code: 'cancelled', message: 'cancelled' })
  await waitFor(() => !realHasBusyCreateTask(), 'la tarea de Crear quedó en error')
  check(window.editor.editorTask.startAvatarRender(PROJECT, [5]), 'el editor vuelve a arrancar el avatar')
  await waitFor(() => window.avatarJobs.length === editorJobsBefore + 2, 'el segundo pedido del avatar')
  await window.realCreate.resume()
  check(window.pipelineRuns.length === 1 && !realHasBusyCreateTask() && busyToasts() === busyToastsBefore + 3, '«Reintentar» de Crear no relanza con el avatar del editor en curso y da el mismo aviso')
  window.avatarJobs.at(-1).onEvent({ type: 'job-failed', code: 'cancelled', message: 'cancelled' })
  await waitFor(() => !window.editor.editorTask.isProjectBusy(PROJECT), 'el editor quedó libre otra vez')
  await window.realCreate.resume()
  check(window.pipelineRuns.length === 2 && realHasBusyCreateTask(), 'con el editor libre, «Reintentar» relanza')
  window.pipelineRuns[1].onEvent({ type: 'job-failed', code: 'cancelled', message: 'cancelled' })
  await waitFor(() => !realHasBusyCreateTask(), 'cerrada')
  check((await window.realCreate.confirmScenesForProject(PROJECT, 'Fixture', CUT, RUN_OPTIONS)) === true && JSON.stringify(window.confirmCalls) === JSON.stringify([{ projectId: PROJECT, ...CUT }]) && window.pipelineRuns.length === 3, 'con el editor libre, confirmar el corte confirma y arranca: ' + JSON.stringify(window.confirmCalls))
  window.pipelineRuns[2].onEvent({ type: 'job-failed', code: 'cancelled', message: 'cancelled' })
  await waitFor(() => !realHasBusyCreateTask(), 'cerrada')
  check(busyToasts() === busyToastsBefore + 3, 'sin avisos de «ocupado» de más')

  document.getElementById('result').textContent = 'PASS: editor avatar regenerate (' + checks + ' checks)'
} catch (error) {
  const reason = renderError && renderError !== error ? ' (render error: ' + renderError.message + ')' : ''
  document.getElementById('result').textContent = 'FAIL: ' + error.message + reason
}
`

try {
  const output = await build({
    stdin: { contents: entry, resolveDir: resolve('.'), loader: 'jsx' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    tsconfig: 'tsconfig.app.json',
    define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [
      {
        name: 'api-fixtures',
        setup(plugin) {
          plugin.onResolve({ filter: /^@\// }, (args) =>
            mocks[args.path]
              ? { path: args.path, namespace: 'fixture' }
              : undefined,
          )
          // `resolveDir`: el simulacro importa el módulo real por su ruta.
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
    '<!doctype html><meta charset="utf-8"><div id="root"></div><pre id="result">RUNNING</pre><script type="module" src="./app.js"></script>',
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
    // de foco en Chrome headless (ERRORES-CONOCIDOS: cdp-sin-emulacion-de-
    // foco-element-focus-no-dispara-los-eventos-focus).
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
      'FAIL: UI timeout: ' + (await evaluate('document.body.innerText'))
    assert.ok(status.startsWith('PASS:'), status)
    process.stdout.write(status + '\n')
  })
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 3 })
}
