// La vista ampliada del editor con las apariciones del avatar (entrega 2f,
// spec §22.4): la galería REAL dentro de la vista REAL del editor
// (LibraryEditor), con el panel de la escena, la pista, el hook del editor y
// el store de tareas reales en Chrome headless. Fija:
// - una tarjeta por escena de avatar, en el orden del video y nombrada
//   «Escena N: aparición del avatar», sin botón para elegirla (ni al navegar
//   ni con «Seleccionar»: las acciones en lote siguen siendo de imágenes), y la
//   descripción que cuenta todas las tarjetas;
// - su clip (el de su escena, con su versión, mudo y con la imagen del look de
//   póster) o, sin clip, la imagen del look con «Sin clip todavía»; su número y
//   su tramo; su estado con la regla del bloque de la pista (lista,
//   desactualizada, con la imagen fija o generando, con el porcentaje cuando
//   su render arranca);
// - las acciones del panel en cada tarjeta: «Generar avatar», «Regenerar
//   avatar» (también en una lista, con el costo de su motor), «Regenerar todos
//   (N)» y, con IV y un look de foto, la sección «Movimiento»;
// - «Reproducir» / «Pausar» con nunca dos clips andando a la vez (muestreado
//   en cada cuadro), con el mouse, con Enter y si un clip arranca por otro
//   camino;
// - «Regenerar avatar» de una lista desde su tarjeta, con teclas reales
//   (ERRORES-CONOCIDOS: cdp-sin-emulacion-de-foco-element-focus-no-dispara-
//   los-eventos-focus y cdp-enter-sin-text-retorno-no-activa-el-boton) y el
//   panel de detrás mostrando la MISMA escena con su propio botón: la
//   confirmación con el costo y el saldo, Escape que cierra solo la
//   confirmación y devuelve el foco al botón de la tarjeta, el pedido del panel
//   (`regenerateSceneIds`), el avance en la tarjeta (en cola sin porcentaje; al
//   arrancar, con él), las demás tarjetas esperando, el clip nuevo, el aviso
//   «listo» con la galería abierta y el foco que vuelve a la tarjeta, nunca a
//   `body` ni al panel de detrás;
// - «Generar avatar» con el movimiento editado en la tarjeta (viaja como en el
//   panel) y el aviso del fallo; «Regenerar todos (N)» desde una tarjeta y
//   «Cancelar» de su avance; y la demo.
// Ronda 1: la tarjeta espera también mientras el editor guarda la copia de
// trabajo (el `busy` del panel, con `savingChanges`, que la vista le pasa a la
// galería) y su pastilla lleva de tooltip el título del bloque de la pista.
// Ronda 2: la pastilla dice siempre una etiqueta corta: la del bloque donde la
// tiene («Desactualizado», como la caja de las acciones, y «Generando el
// avatar…» con su porcentaje) y, si no, «Lista» o «Con imagen fija». Ronda 3:
// una planeada también dice «Con imagen fija», con el ícono de imagen, como la
// fallida (en el editor nada la genera sola), y la descripción de la galería
// es la que habla del avatar (`descriptionWithAvatar`).
// Entrega 2g (§23.3 y §23.4, WP-C): las tarjetas abren plegadas (la galería
// siempre abre con todas plegadas), con el borde de una de imagen y sin
// acciones, con «Ajustar avatar» (aria-expanded y el número en su aria-label);
// un clic en la tarjeta o ese botón la despliegan, ocupa la fila entera y
// estrena «Cerrar»; una sola desplegada a la vez; el clip no se corta al
// plegar o desplegar y «Reproducir» no despliega; el foco con teclas reales
// (al desplegar, al primer control; al plegar, a «Ajustar avatar»; al terminar
// un render, a la tarjeta); «Qué podés pedir» en un globo sobre la galería que
// Escape cierra sin cerrarla; y, desplegada, la «Duración» con sus tres
// acciones (recortar sin confirmación, un render con `durations`, la V sin
// interruptor que conserva «más expresivo») y la última escena del video quieta
// con su aviso. Ronda 1 de su revisión: una tarjeta que asoma por el borde de
// abajo del área con scroll entra entera al desplegarse (scrollIntoView) y el
// globo de «Qué podés pedir» es un diálogo con nombre.
// Nada habla con HeyGen ni con el sidecar: como en
// check-editor-avatar-regenerate-ui.mjs, los simulacros parten de los reales
// (`videosApi`, `avatarsApi`, `apiKeysApi` y el fetcher del pipeline, con solo
// las llamadas al sidecar reemplazadas), el fetcher entrega
// `avatar-render-scenes` a la prueba, que emite los eventos del job a mano, y
// `toast` es el real con un registro. El clip y la imagen del look son
// archivos de verdad, generados con el ffmpeg del repo; sus URLs llevan la
// ruta y la versión de cada escena en la consulta. La raíz guarda
// `onUncaughtError` para que un render roto falle con su mensaje.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { executableSuffix, targetTriple } from '../target-triple.mjs'
import { withChrome } from './chrome-session.mjs'

const chrome =
  process.argv[2] ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const triple = targetTriple()
// El mismo binario que Rust inyecta en `binaryPaths.ffmpeg` (ADR-0026).
const ffmpeg = fileURLToPath(
  new URL(
    `../../src-tauri/binaries/ffmpeg-${triple}${executableSuffix(triple)}`,
    import.meta.url,
  ),
)
const root = await mkdtemp(join(tmpdir(), 'vimo-editor-avatar-gallery-ui-'))
// Las teclas que el caso puede pedir. Enter lleva su texto: sin él Chrome no
// activa el botón.
const KEYS = {
  Tab: { code: 'Tab', windowsVirtualKeyCode: 9 },
  Enter: { code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
  Escape: { code: 'Escape', windowsVirtualKeyCode: 27 },
}
const mocks = {
  '@/modules/common/supabase/client':
    'export const supabase = { auth: { getSession: async () => ({ data: { session: null } }) } }',
  // El detalle del proyecto sale del fixture (lo que el sidecar tiene en
  // disco). Las URLs de los medios apuntan al clip y a la imagen generados,
  // con la ruta y la versión que pidió cada escena en la consulta.
  // `startAvatarRender` es el real: el job lo lanza el fetcher del pipeline.
  // `updateScenes` (el guardado de la copia de trabajo) se anota y, con
  // `holdUpdate`, no termina hasta que la prueba lo suelta.
  '@/modules/videos/api': [
    "import { videosApi as real } from './src/modules/videos/api/index.ts'",
    'const media = (file, path, version) => new URL("./" + file, location.href).href + "?path=" + encodeURIComponent(path) + "&v=" + version',
    'export const videosApi = { ...real, isNative: () => true, async projectDetail() { window.detailCalls += 1; return structuredClone(window.detail) }, async cancelJob(jobId) { window.cancels.push(jobId) }, async trimAvatarScene(payload) { window.trimCalls.push(structuredClone(payload)); if (window.trimFails) throw Object.assign(new Error(window.trimFails), { code: window.trimFails }); return structuredClone(window.trimResult) }, async updateScenes(projectId, changes) { window.updateCalls.push({ projectId, changes: structuredClone(changes) }); if (window.holdUpdate) await window.holdUpdate; return { applied: changes.length } }, imageSource: (path, version) => media("look.png", path, version), videoSource: (path, version) => media("clip.mp4", path, version) }',
  ].join('\n'),
  '@/modules/common/fetcher/pipeline': [
    "export * from './src/modules/common/fetcher/pipeline.ts'",
    "import { startPipelineJob as realStart } from './src/modules/common/fetcher/pipeline.ts'",
    'export function startPipelineJob(subcommand, payload, onEvent) { if (subcommand === "avatar-render-scenes") return window.startAvatarRender(subcommand, payload, onEvent); return realStart(subcommand, payload, onEvent) }',
  ].join('\n'),
  '@/modules/avatars/api': [
    "import { avatarsApi as real } from './src/modules/avatars/api/index.ts'",
    'export const avatarsApi = { ...real, isNative: () => true, async balance() { window.balanceCalls += 1; return structuredClone(window.fixture.balance) } }',
  ].join('\n'),
  '@/modules/api-keys/api': [
    "import { apiKeysApi as real } from './src/modules/api-keys/api/index.ts'",
    'export const apiKeysApi = { ...real, isNative: () => true, async getStatus() { return window.fixture.keys.map((providerId) => ({ providerId, configured: true, source: "manual", maskedKey: "••••", savedAt: 0, lastValidatedAt: null })) } }',
  ].join('\n'),
  // El toast real (el Toaster lo dibuja) con un registro de cada aviso.
  '@/modules/common/hooks/useToast': [
    "import { useToast as realUseToast, toast as realToast } from './src/modules/common/hooks/useToast.ts'",
    'export const useToast = realUseToast',
    'export function toast(props) { window.toasts.push({ description: props.description, variant: props.variant }); return realToast(props) }',
  ].join('\n'),
  // La vista real, como en check-export-header-ui.mjs: sin otra tarea de
  // Crear, sin audio en curso ni saldos de imágenes, y sin el visor ni los
  // diálogos de música y mezcla (medios que acá no se prueban).
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
import { formatTime } from '@/modules/common/utilities/formatTime'
import { formatUsd } from '@/modules/common/utilities/formatUsd'
import { EDITOR_SCENE_PANEL_ID } from '@/modules/videos/constants'
import { LibraryEditor } from '@/modules/videos/views/LibraryEditor/LibraryEditor'
import { avatarSpansCostEstimate } from '@/modules/videos/utilities/avatarCostEstimate'
import { errorKeyOf } from '@/modules/videos/utilities/errorKeyOf'
import { formatSlotSeconds } from '@/modules/videos/utilities/formatSlotSeconds'

let checks = 0
let renderError
const check = (condition, message) => { if (!condition) throw new Error(message); checks += 1 }
const delay = (ms = 30) => new Promise((done) => setTimeout(done, ms))
// Varios clics como los de una persona: cada uno en su tarea, con el cuadro
// dibujado entre uno y otro.
async function clickTimes(find, times) {
  for (let index = 0; index < times; index++) { find().click(); await delay(40) }
}
async function waitFor(get, message, attempts = 150) {
  for (let index = 0; index < attempts; index++) { if (renderError) throw renderError; const value = get(); if (value) return value; await delay() }
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
await i18n.init({ lng: 'es', resources: { es: { translation: es } }, interpolation: { escapeValue: false } })
const t = (key, options) => i18n.t(key, options)
const usd = (amount) => formatUsd(amount, 'es')
// Una frase del catálogo: la clave existe, no sale como su ruta cruda y no
// deja variables sin resolver (ERRORES-CONOCIDOS: test-que-compara-el-texto-
// con-i18n-t-de-la-misma-clave-pasa-en-vacio-si-la-clave-no-existe).
function phrase(key, options) {
  const sentence = i18n.t(key, options)
  check(i18n.exists(key, options) && sentence !== key && !sentence.includes('{{'), 'la clave ' + key + ' es una frase del catálogo, no su ruta cruda ni una variable sin resolver: ' + sentence)
  return sentence
}
const CATALOG_PHRASES = [
  ['library.editor.imageGallery.label'],
  ['library.editor.imageGallery.descriptionWithAvatar', { count: 8 }],
  ['library.editor.imageGallery.description', { count: 8 }],
  ['library.editor.imageGallery.avatarCardAria', { index: 2 }],
  ['library.editor.imageGallery.avatarPlay'],
  ['library.editor.imageGallery.avatarPause'],
  ['library.editor.imageGallery.avatarNoClip'],
  ['library.editor.imageGallery.select', { id: 1 }],
  ['library.editor.imageGallery.toggleScene', { id: 1 }],
  ['library.editor.imageGallery.selectMultiple'],
  ['library.editor.imageGallery.cancelSelection'],
  ['library.editor.imageGallery.selectedCount', { count: 3 }],
  ['create.progress.avatarCardFallback'],
  ['create.progress.avatarReady'],
  ['library.editor.timeline.avatarTitle', { name: 'x', seconds: '1' }],
  ['library.editor.timeline.avatarStale'],
  ['library.editor.timeline.avatarPlanned'],
  ['library.editor.timeline.avatarFailed', { reason: 'x' }],
  ['library.editor.timeline.avatarRenderingPercent', { percent: 1 }],
  ['library.editor.imageGallery.close'],
  ['library.editor.panel.sceneTitle', { id: 1 }],
  ['library.editor.avatar.generar'],
  ['library.editor.avatar.regenerar'],
  ['library.editor.avatar.regenerarTodos', { count: 3 }],
  ['library.editor.avatar.costo', { amount: '1' }],
  ['library.editor.avatar.saldo', { balance: '1' }],
  ['library.editor.avatar.confirmarTitulo'],
  ['library.editor.avatar.confirmarTexto', { count: 1, amount: '1' }],
  ['library.editor.avatar.confirmarTexto', { count: 3, amount: '1' }],
  ['library.editor.avatar.confirmar'],
  ['library.editor.avatar.confirmarTituloRegenerar'],
  ['library.editor.avatar.confirmarTextoRegenerar', { count: 1, amount: '1' }],
  ['library.editor.avatar.confirmarRegenerar'],
  ['library.editor.avatar.cancelar'],
  ['library.editor.avatar.listo'],
  ['library.editor.avatar.fallo', { reason: 'x' }],
  ['library.editor.avatar.movimientoTitulo'],
  ['library.editor.avatar.movimientoLabel'],
  ['library.editor.timeline.avatarRendering'],
  ['library.editor.timeline.avatarStaleHint'],
  ['library.editor.demoLocked'],
  // Entrega 2g (§23.3 y §23.4).
  ['library.editor.avatar.ajustar'],
  ['library.editor.avatar.cerrarAjustes'],
  ['library.editor.imageGallery.avatarExpand', { index: 4 }],
  ['library.editor.imageGallery.avatarCollapse', { index: 4 }],
  ['library.editor.avatar.duracion'],
  ['library.editor.avatar.duracionValor', { seconds: 7 }],
  ['library.editor.avatar.duracionMenos'],
  ['library.editor.avatar.duracionMas'],
  ['library.editor.avatar.duracionActual', { seconds: '10' }],
  ['library.editor.avatar.duracionAyuda'],
  ['library.editor.avatar.duracionFinal'],
  ['library.editor.avatar.duracionMasLarga', { time: '0:36' }],
  ['library.editor.avatar.duracionTapa', { count: 1 }],
  ['library.editor.avatar.duracionTapa', { count: 2 }],
  ['library.editor.avatar.recortar', { seconds: 7 }],
  ['library.editor.avatar.recortarGratis'],
  ['library.editor.avatar.recortado', { seconds: '7' }],
  ['library.editor.avatar.recortarFallo', { reason: 'x' }],
  ['library.editor.avatar.confirmarDuracion', { seconds: 14, current: '10' }],
  ['library.editor.avatar.motorAyudaAria', { engine: 'x' }],
  ['library.editor.avatar.guiaBoton'],
]

// El proyecto en disco: tres escenas de imagen y cinco de avatar, de 10 s y
// con un look de foto. La 2, IV y planeada (sin clip ni prompt todavía); la
// 4, IV y lista, con el prompt que escribió Vimo; la 5, III y desactualizada,
// con su clip viejo; la 6, III y lista; la 7, III y fallida, sin clip.
const LOOK = '/p/avatar/look.png'
const AUTO_4 = 'Composed posture and sincere expression, with a subtle open-hand gesture on the key point.'
const EDITED = 'Smiles warmly and nods on the key point.'
const view = (overrides = {}) => ({ lookId: 'look-ana', lookName: 'Ana oficina', lookType: 'photo_avatar', engine: 'avatar_iii', origin: 'auto', status: 'ready', clipPath: '/p/avatar/clip.mp4', clipMtimeMs: 1, normalizedSeconds: 10, ...overrides })
const scene = (id, startSeconds, endSeconds, extra = {}) => ({ id, text: 'Escena ' + id, imageStatus: 'ok', imagePath: '/p/scenes/scene_' + id + '.jpg', startSeconds, endSeconds, ...extra })
const PLANNED = { status: 'planned', clipPath: undefined, clipMtimeMs: undefined, normalizedSeconds: undefined }
const READY_4 = { engine: 'avatar_iv', clipPath: '/p/avatar/scene_4.mp4', clipMtimeMs: 11, motionPrompt: AUTO_4, motionSource: 'auto', autoMotionPrompt: AUTO_4 }
window.detail = {
  metadata: { id: 'fixture', name: 'Fixture', state: 'ready', audioDurationSeconds: 64, options: { videoFormat: '16:9', imageProvider: 'fal', imageQuality: 'low' } },
  words: [],
  script: '',
  scenes: [
    scene(1, 0, 4),
    scene(2, 4, 14, { imagePath: LOOK, avatar: view({ ...PLANNED, engine: 'avatar_iv' }) }),
    scene(3, 14, 18),
    scene(4, 18, 28, { imagePath: LOOK, avatar: view(READY_4) }),
    scene(5, 28, 38, { imagePath: LOOK, avatar: view({ clipPath: '/p/avatar/scene_5.mp4', clipMtimeMs: 12, stale: true }) }),
    scene(6, 38, 48, { imagePath: LOOK, avatar: view({ clipPath: '/p/avatar/scene_6.mp4', clipMtimeMs: 13 }) }),
    scene(7, 48, 58, { imagePath: LOOK, avatar: view({ status: 'failed', clipPath: undefined, clipMtimeMs: undefined, errorCode: 'avatar_moderation_rejected' }) }),
    scene(8, 58, 64),
  ],
}
// Lo que el sidecar deja en disco al cerrar cada escena.
function storeAvatar(id, avatar) {
  window.detail = { ...window.detail, scenes: window.detail.scenes.map((item) => (item.id === id ? { ...item, avatar } : item)) }
}
const USD = (remaining) => ({ available: true, remaining, currency: 'usd' })
window.fixture = { keys: ['heygen', 'fal', 'deepinfra'], balance: USD(5) }
window.detailCalls = 0
window.trimCalls = []
window.trimResult = { sceneId: 0, startSeconds: 0, endSeconds: 0 }
window.trimFails = null
window.updateCalls = []
window.balanceCalls = 0
window.toasts = []
window.cancels = []
window.unhandledRejections = []
window.addEventListener('unhandledrejection', (event) => { window.unhandledRejections.push(String(event.reason?.message ?? event.reason)) })
// Cada pedido de avatar queda anotado con su payload y su canal de eventos.
window.avatarJobs = []
window.startAvatarRender = (subcommand, payload, onEvent) => {
  const job = { subcommand, payload: structuredClone(payload), onEvent, jobId: 'avatar-job-' + (window.avatarJobs.length + 1) }
  window.avatarJobs.push(job)
  return Promise.resolve({ jobId: job.jobId, stop() { job.stopped = true } })
}

const reactRoot = createRoot(document.getElementById('root'), { onUncaughtError: (error) => { renderError = error } })
reactRoot.render(<QueryClientProvider client={queryClient}><I18nextProvider i18n={i18n}><TooltipProvider><MemoryRouter initialEntries={['/editor/fixture']}><div id={EDITOR_BAR_SLOT_IDS.title} /><div id={EDITOR_BAR_SLOT_IDS.actions} /><Routes><Route path="/editor/:projectId" element={<LibraryEditor />} /></Routes></MemoryRouter><Toaster /></TooltipProvider></I18nextProvider></QueryClientProvider>)

// La key de React no sale al DOM: se lee de la fibra del contenedor del bloque.
const reactKeyOf = (element) => { const name = Object.keys(element).find((key) => key.startsWith('__reactFiber$')); return name ? element[name].key : null }
const avatarBlock = (id) => [...document.querySelectorAll('#root div.absolute.top-0.h-full > button')].find((block) => reactKeyOf(block.parentElement) === 'avatar-' + id)
const panel = () => document.getElementById(EDITOR_SCENE_PANEL_ID)
const panelButton = (label) => [...(panel()?.querySelectorAll('button') ?? [])].find((button) => button.textContent.trim() === label)
const galleryTrigger = () => [...document.querySelectorAll('#root label')].find((label) => label.textContent.trim() === t('library.editor.imageGallery.label'))?.querySelector('input')
// Todo se busca adentro de la galería y de cada tarjeta: el panel de detrás
// muestra la misma escena con los mismos botones (ERRORES-CONOCIDOS: ayudante-
// de-banco-que-busca-un-boton-solo-por-su-texto-se-rompe-cuando-otro-
// componente-lo-repite-oculto).
const gallery = () => [...document.querySelectorAll('[role="dialog"]')].find((item) => item.querySelector('h2')?.textContent.trim() === t('library.editor.imageGallery.label'))
const card = (id) => gallery()?.querySelector('[data-gallery-scene="' + id + '"]')
const cardIds = () => [...(gallery()?.querySelectorAll('[data-gallery-scene]') ?? [])].map((item) => Number(item.getAttribute('data-gallery-scene')))
const cardButton = (id, label) => [...(card(id)?.querySelectorAll('button') ?? [])].find((button) => button.textContent.trim() === label || button.getAttribute('aria-label') === label)
const galleryButton = (label) => [...(gallery()?.querySelectorAll('button') ?? [])].find((button) => button.textContent.trim() === label)
const stateOf = (id) => card(id)?.querySelector('[data-avatar-state]')
const videoOf = (id) => card(id)?.querySelector('video')
const regionOf = (id) => card(id)?.querySelector('[role="region"]')
const costIn = (id, amount) => [...(card(id)?.querySelectorAll('p') ?? [])].find((paragraph) => paragraph.textContent.trim() === t('library.editor.avatar.costo', { amount: usd(amount) }))
const motionGroupIn = (id) => [...(card(id)?.querySelectorAll('[role="group"]') ?? [])].find((group) => document.getElementById(group.getAttribute('aria-labelledby') ?? '')?.textContent.trim() === t('library.editor.avatar.movimientoTitulo'))
const motionFieldIn = (id) => { const label = [...(motionGroupIn(id)?.querySelectorAll('label') ?? [])].find((item) => item.textContent.trim() === t('library.editor.avatar.movimientoLabel')); return label?.htmlFor ? document.getElementById(label.htmlFor) : null }
// Plegar y desplegar la tarjeta (entrega 2g, §23.4): «Ajustar avatar» la
// despliega y, desplegada, «Cerrar» la pliega; una sola a la vez.
const expandButton = (id) => cardButton(id, t('library.editor.imageGallery.avatarExpand', { index: id }))
const collapseButton = (id) => cardButton(id, t('library.editor.imageGallery.avatarCollapse', { index: id }))
const expandedIds = () => cardIds().filter((id) => collapseButton(id))
async function expand(id) {
  const button = await waitFor(() => expandButton(id), 'la tarjeta ' + id + ' tiene su «Ajustar avatar» (plegada): desplegadas ' + expandedIds().join())
  button.click()
  await waitFor(() => collapseButton(id), 'la tarjeta ' + id + ' se despliega')
  await delay()
}
async function collapse(id) {
  const button = await waitFor(() => collapseButton(id), 'la tarjeta ' + id + ' tiene su «Cerrar» (desplegada)')
  button.click()
  await waitFor(() => expandButton(id), 'la tarjeta ' + id + ' se pliega')
  await delay()
}
// La duración dentro de la tarjeta (los botones se apagan con aria-disabled,
// nunca con disabled).
const durationGroupIn = (id) => [...(card(id)?.querySelectorAll('[role="group"]') ?? [])].find((group) => document.getElementById(group.getAttribute('aria-labelledby') ?? '')?.textContent.trim() === t('library.editor.avatar.duracion'))
const stepIn = (id, key) => [...(durationGroupIn(id)?.querySelectorAll('button') ?? [])].find((button) => button.getAttribute('aria-label') === t(key))
const lessIn = (id) => stepIn(id, 'library.editor.avatar.duracionMenos')
const moreIn = (id) => stepIn(id, 'library.editor.avatar.duracionMas')
const durationValueIn = (id) => durationGroupIn(id)?.querySelector('output')?.textContent.trim()
const stepOff = (button) => button?.getAttribute('aria-disabled') === 'true' && !button.disabled
const alertDialog = () => document.querySelector('[role="alertdialog"]')
const alertButton = (label) => [...(alertDialog()?.querySelectorAll('button') ?? [])].find((button) => button.textContent.trim() === label)
const percentIn = (element) => element?.textContent.match(/(\d+)%/)?.[1]
const describe = (element) => (element ? element.tagName + '[' + (element.getAttribute('aria-label') ?? '') + '] ' + element.textContent.trim().slice(0, 40) : 'null')
const media = (file, path, version) => new URL('./' + file, location.href).href + '?path=' + encodeURIComponent(path) + '&v=' + version
// Escribe en el campo controlado por React como lo haría el teclado.
function typeInto(field, value) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(field, value)
  field.dispatchEvent(new Event('input', { bubbles: true }))
}
const GENERATE = t('library.editor.avatar.generar')
const REGENERATE = t('library.editor.avatar.regenerar')
const ALL = (count) => t('library.editor.avatar.regenerarTodos', { count })
const AJUSTAR = t('library.editor.avatar.ajustar')
const CLOSE = t('library.editor.avatar.cerrarAjustes')
const CONFIRM = t('library.editor.avatar.confirmar')
const CONFIRM_RETAKE = t('library.editor.avatar.confirmarRegenerar')
const CANCEL = t('library.editor.avatar.cancelar')
const PLAY = t('library.editor.imageGallery.avatarPlay')
const PAUSE = t('library.editor.imageGallery.avatarPause')
const NO_CLIP = t('library.editor.imageGallery.avatarNoClip')
const BALANCE = t('library.editor.avatar.saldo', { balance: usd(5) })
// La pastilla (rondas 1 y 2): una etiqueta corta, la del bloque de la pista
// donde la tiene y, si no, la de la tarjeta del avatar del progreso; de
// tooltip, el título del bloque.
const READY_TITLE = t('library.editor.timeline.avatarTitle', { name: 'Ana oficina', seconds: formatSlotSeconds(10, 'es') })
const STATE_LABELS = { ready: t('create.progress.avatarReady'), stale: t('library.editor.timeline.avatarStale'), planned: t('create.progress.avatarCardFallback'), failed: t('create.progress.avatarCardFallback'), generating: t('library.editor.timeline.avatarRendering') }
const titleOf = (id) => stateOf(id)?.getAttribute('title')
const span = (startSeconds, endSeconds) => ({ startSeconds, endSeconds })
const IV_10S = avatarSpansCostEstimate('photo_avatar', [span(4, 14)], 'avatar_iv').estimated
const III_10S = avatarSpansCostEstimate('photo_avatar', [span(38, 48)], 'avatar_iii').estimated
const hasState = (id, state, label) => stateOf(id)?.getAttribute('data-avatar-state') === state && stateOf(id).textContent.trim() === label

try {
  // 0. Cada texto con que se compara es una frase del catálogo; el costo de
  //    10 s con un look de foto, el de Crear para cada motor.
  for (const [key, options] of CATALOG_PHRASES) phrase(key, options)
  check(IV_10S === 0.385 && III_10S === 0.165, 'el costo de 10 s: 0,385 con IV y 0,165 con III')

  // 1. Ronda 1: mientras el editor guarda la copia de trabajo, las tarjetas
  //    esperan como el panel. La descripción de la escena 1 (la que el panel
  //    muestra al abrir) se guarda al salir del campo, justo cuando el foco
  //    pasa al interruptor de la galería; el guardado queda en vuelo.
  const scenePrompt = () => document.getElementById('scene-user-prompt')
  await waitFor(() => scenePrompt() && panel().textContent.includes(t('library.editor.panel.sceneTitle', { id: 1 })), 'el panel arranca en la escena 1 con su descripción')
  let releaseUpdate
  window.holdUpdate = new Promise((done) => { releaseUpdate = done })
  scenePrompt().focus()
  typeInto(scenePrompt(), 'Un atardecer sobre el mar')
  await waitFor(() => scenePrompt()?.value === 'Un atardecer sobre el mar', 'la descripción escrita')
  ;(await waitFor(() => galleryTrigger(), 'el interruptor de la vista ampliada')).focus()
  await waitFor(() => window.updateCalls.length === 1, 'al salir del campo, el editor guarda la descripción')
  check(window.updateCalls[0].projectId === 'fixture' && window.updateCalls[0].changes[0]?.id === 1, 'el guardado de la escena 1: ' + JSON.stringify(window.updateCalls[0]))
  galleryTrigger().click()
  await waitFor(() => cardIds().length === 8 && expandButton(6), 'la galería abre con el guardado en vuelo')
  // Las tarjetas abren plegadas: se despliega cada una para ver sus controles.
  await expand(6)
  check(cardButton(6, REGENERATE).disabled && stepOff(lessIn(6)) && stepOff(moreIn(6)), 'mientras el editor guarda, las acciones y la duración de la 6 esperan, como las del panel')
  await expand(4)
  check(cardButton(4, REGENERATE)?.disabled && motionFieldIn(4)?.disabled && stepOff(lessIn(4)), 'y las de la 4, con su movimiento')
  await expand(5)
  check(cardButton(5, REGENERATE)?.disabled && cardButton(5, ALL(3))?.disabled, 'y las de la 5, con «Regenerar todos»')
  await expand(2)
  check(cardButton(2, GENERATE)?.disabled && motionFieldIn(2)?.disabled, 'y las de la 2')
  check(window.avatarJobs.length === 0 && window.trimCalls.length === 0, 'nada pedido')
  releaseUpdate()
  window.holdUpdate = null
  await waitFor(() => !cardButton(2, GENERATE)?.disabled && !motionFieldIn(2)?.disabled && !stepOff(lessIn(2)), 'al terminar el guardado, la tarjeta vuelve')
  await expand(4)
  check(!cardButton(4, REGENERATE).disabled && !motionFieldIn(4).disabled && !stepOff(lessIn(4)), 'las demás también (el «+» de la 4 sigue apagado: la próxima aparición empieza justo donde termina, no hay margen para alargarla)')
  gallery().querySelector('button[aria-label="' + t('library.editor.imageGallery.close') + '"]').click()
  await waitFor(() => !gallery(), 'la galería se cierra con la tarjeta 4 desplegada')

  // 1b. La vista real con la escena 4 elegida en el panel (queda detrás de la
  //    galería con su propio «Regenerar avatar»); la galería abre con una
  //    tarjeta por escena, en el orden del video.
  await waitFor(() => avatarBlock(4), 'la vista real dibuja el bloque de la escena 4')
  avatarBlock(4).click()
  await waitFor(() => panelButton(REGENERATE) && panel().textContent.includes(t('library.editor.panel.sceneTitle', { id: 4 })), 'el panel muestra la escena 4 con «Regenerar avatar»')
  const trigger = await waitFor(() => galleryTrigger(), 'el interruptor de la vista ampliada')
  check(!trigger.disabled, 'la vista ampliada se puede abrir')
  trigger.click()
  await waitFor(() => cardIds().length === 8, 'la vista ampliada abre con una tarjeta por escena: ' + cardIds().join(', '))
  check(JSON.stringify(cardIds()) === '[1,2,3,4,5,6,7,8]', 'las de avatar también, en el orden del video: ' + cardIds().join(', '))
  check(gallery().textContent.includes(t('library.editor.imageGallery.descriptionWithAvatar', { count: 8 })) && t('library.editor.imageGallery.descriptionWithAvatar', { count: 8 }) !== t('library.editor.imageGallery.description', { count: 8 }), 'con escenas de avatar, la descripción que habla del avatar cuenta las ocho tarjetas')
  // Plegadas por defecto (entrega 2g, §23.4): la galería abre siempre con todas
  // plegadas, también si antes quedó una desplegada; con el borde de una de
  // imagen (el morado la hacía parecer elegida) y sin acciones.
  check(expandedIds().length === 0, 'la vista ampliada abre con todas las tarjetas del avatar plegadas, también si la vez anterior quedó una desplegada: ' + expandedIds().join(', '))
  for (const id of [2, 4, 5, 6, 7]) {
    const className = card(id).className
    check(className.includes('border-border') && !className.includes('amethyst') && className.includes('border-2') && card(1).className.includes('border-border'), 'plegada, la tarjeta ' + id + ' tiene el borde de una de imagen y no el morado que la hacía parecer elegida: ' + className)
    check(!card(id).classList.contains('col-span-full') && !card(id).querySelector('[role="group"]') && !card(id).querySelector('textarea') && !card(id).querySelector('[role="switch"]') && !cardButton(id, REGENERATE) && !cardButton(id, GENERATE) && !cardButton(id, ALL(3)), 'plegada, la tarjeta ' + id + ' no muestra acciones ni controles')
    check(expandButton(id)?.getAttribute('aria-expanded') === 'false' && expandButton(id).textContent.trim() === AJUSTAR && !collapseButton(id), '«Ajustar avatar» con aria-expanded en false y su aria-label con el número: ' + id)
  }
  for (const id of [2, 4, 5, 6, 7]) {
    check(card(id).tagName === 'ARTICLE' && card(id).getAttribute('aria-label') === t('library.editor.imageGallery.avatarCardAria', { index: id }) && card(id).tabIndex === -1, 'la tarjeta del avatar ' + id + ': «' + t('library.editor.imageGallery.avatarCardAria', { index: id }) + '», enfocable por código')
    check(!card(id).querySelector('button[aria-pressed]'), 'la tarjeta del avatar ' + id + ' no tiene botón para elegirla')
    const item = window.detail.scenes.find((candidate) => candidate.id === id)
    check(card(id).querySelector('h3')?.textContent.trim() === t('library.editor.panel.sceneTitle', { id }) && card(id).textContent.includes(formatTime(item.startSeconds) + ' – ' + formatTime(item.endSeconds)), 'su número y su tramo, como las de imagen: ' + id)
  }
  for (const id of [1, 3, 8]) check(cardButton(id, t('library.editor.imageGallery.select', { id }))?.getAttribute('aria-pressed') === 'false', 'la de imagen ' + id + ' se elige como siempre')

  // 2. Cada tarjeta plegada: su clip o la imagen del look y su estado; y, al
  //    desplegarla, sus acciones.
  await waitFor(() => [4, 5, 6].every((id) => videoOf(id)?.readyState >= 1), 'los clips cargan', 400)
  check(videoOf(4).getAttribute('src') === media('clip.mp4', '/p/avatar/scene_4.mp4', 11) && videoOf(4).getAttribute('poster') === media('look.png', LOOK, 0) && videoOf(4).muted, 'la 4: el clip de su escena con su versión, mudo y con la imagen del look de póster: ' + videoOf(4).getAttribute('src'))
  check(hasState(4, 'ready', STATE_LABELS.ready) && titleOf(4) === READY_TITLE && cardButton(4, PLAY) && !card(4).textContent.includes(NO_CLIP), 'la 4: «' + STATE_LABELS.ready + '», el título del bloque de tooltip («' + READY_TITLE + '») y «Reproducir»')
  check(videoOf(5).getAttribute('src') === media('clip.mp4', '/p/avatar/scene_5.mp4', 12) && hasState(5, 'stale', STATE_LABELS.stale) && titleOf(5) === t('library.editor.timeline.avatarStaleHint'), 'la 5, desactualizada, con su clip viejo, «Desactualizado» y la explicación del bloque de tooltip')
  check(t('library.editor.timeline.avatarStaleHint').startsWith(STATE_LABELS.stale + ':'), 'la pastilla y la explicación dicen lo mismo: «' + STATE_LABELS.stale + '»')
  check(videoOf(6).getAttribute('src') === media('clip.mp4', '/p/avatar/scene_6.mp4', 13) && hasState(6, 'ready', STATE_LABELS.ready), 'la 6, lista con III')
  check(!videoOf(2) && card(2).querySelector('img')?.getAttribute('src') === media('look.png', LOOK, 0) && card(2).textContent.includes(NO_CLIP) && !cardButton(2, PLAY), 'la 2, sin clip: la imagen del look con «' + NO_CLIP + '»')
  check(titleOf(2) === t('library.editor.timeline.avatarPlanned') && titleOf(7) === t('library.editor.timeline.avatarFailed', { reason: t(errorKeyOf('avatar_moderation_rejected')) }), 'planeada y fallida: de tooltip, el título de su bloque')
  check(stateOf(2).querySelector('svg.lucide-image') && !stateOf(2).querySelector('svg.lucide-clock') && stateOf(7).querySelector('svg.lucide-image'), 'planeada y fallida, con el ícono de imagen (no un reloj: en el editor nada la genera sola)')
  check(hasState(2, 'planned', STATE_LABELS.planned) && !videoOf(7) && card(7).querySelector('img') && card(7).textContent.includes(NO_CLIP) && hasState(7, 'failed', STATE_LABELS.failed), 'la 2: «' + STATE_LABELS.planned + '»; la 7, fallida y sin clip: la imagen del look y «' + STATE_LABELS.failed + '»')
  check(window.balanceCalls === 0, 'el saldo no se pide hasta abrir una confirmación: ' + window.balanceCalls)
  // Desplegada, cada una con sus acciones.
  await expand(4)
  check(cardButton(4, REGENERATE) && !cardButton(4, GENERATE) && costIn(4, IV_10S) && !cardButton(4, ALL(3)), 'la 4 ofrece «Regenerar avatar» con el costo de IV, sin «Regenerar todos»')
  check(motionGroupIn(4) && motionFieldIn(4)?.value === AUTO_4, 'IV con un look de foto: la sección «Movimiento» con el prompt de la escena')
  check(durationGroupIn(4) && durationValueIn(4) === t('library.editor.avatar.duracionValor', { seconds: 7 }) && durationGroupIn(4).textContent.includes(t('library.editor.avatar.duracionActual', { seconds: '10' })), 'y la duración, que arranca en lo que dura hoy (10 s) acotado a lo que entra: en este proyecto la próxima aparición empieza donde termina la 4, así que el máximo es 7 s; debajo dice que dura 10 s: ' + durationValueIn(4))
  await expand(5)
  check(card(5).textContent.includes(t('library.editor.timeline.avatarStaleHint')) && cardButton(5, REGENERATE) && cardButton(5, ALL(3)) && costIn(5, III_10S) && !motionGroupIn(5) && durationGroupIn(5), 'la 5 explica por qué y ofrece «Regenerar avatar» y «Regenerar todos (3)», con su duración y sin «Movimiento» (III)')
  await expand(6)
  check(cardButton(6, REGENERATE) && costIn(6, III_10S) && !motionGroupIn(6) && !cardButton(6, ALL(3)), 'la 6, lista con III: «Regenerar avatar» con su costo')
  await expand(2)
  check(cardButton(2, GENERATE) && cardButton(2, ALL(3)) && costIn(2, IV_10S) && motionFieldIn(2)?.value === '', 'la 2, planeada: «Generar avatar» con su costo y «Movimiento» vacío')
  await expand(7)
  check(card(7).textContent.includes(t('library.editor.avatar.fallo', { reason: t(errorKeyOf('avatar_moderation_rejected')) })) && cardButton(7, REGENERATE) && cardButton(7, ALL(3)), 'la 7 dice el motivo y ofrece «Regenerar avatar»')
  await collapse(7)
  check(window.balanceCalls === 0, 'desplegar y plegar no pide el saldo')

  // 3. Las acciones de imágenes en lote siguen siendo de imágenes: con
  //    «Seleccionar», solo las de imagen se marcan.
  galleryButton(t('library.editor.imageGallery.selectMultiple')).click()
  await waitFor(() => [1, 3, 8].every((id) => cardButton(id, t('library.editor.imageGallery.toggleScene', { id }))), 'con «Seleccionar», las de imagen se marcan')
  check([2, 4, 5, 6, 7].every((id) => !card(id).querySelector('button[aria-pressed]')), 'las de avatar no tienen con qué marcarse')
  for (const id of [1, 3, 8]) cardButton(id, t('library.editor.imageGallery.toggleScene', { id })).click()
  await waitFor(() => gallery().textContent.includes(t('library.editor.imageGallery.selectedCount', { count: 3 })), 'marcar todo lo que se puede marcar da tres: las de imagen')
  check([2, 4, 5, 6, 7].every((id) => expandButton(id)), 'las tarjetas del avatar siguen con su «Ajustar avatar»')
  galleryButton(t('library.editor.imageGallery.cancelSelection')).click()
  await waitFor(() => galleryButton(t('library.editor.imageGallery.selectMultiple')), 'sin selección')

  // 4. «Reproducir» / «Pausar»: nunca dos clips andando a la vez, muestreado
  //    en cada cuadro, con el mouse y con Enter.
  const playing = () => [...gallery().querySelectorAll('video')].filter((video) => !video.paused)
  let maxPlaying = 0
  let sampling = true
  const sample = () => { if (!sampling) return; maxPlaying = Math.max(maxPlaying, playing().length); requestAnimationFrame(sample) }
  requestAnimationFrame(sample)
  cardButton(4, PLAY).click()
  await waitFor(() => !videoOf(4).paused && cardButton(4, PAUSE), '«Reproducir» arranca el clip de la 4 y el botón pasa a «Pausar»')
  await waitFor(() => videoOf(4).currentTime > 0.2, 'el clip de la 4 avanza', 300)
  cardButton(6, PLAY).click()
  // En el mismo instante del clic: el de la 4 se pausó ANTES de arrancar el
  // de la 6 (el evento «play» llega después, en otra tarea).
  check(playing().length === 1 && videoOf(4).paused && !videoOf(6).paused, 'al apretar «Reproducir» de la 6 nunca hay dos andando, ni por un instante: ' + playing().length)
  await waitFor(() => !videoOf(6).paused && videoOf(4).paused, 'el de la 6 arranca y el de la 4 se pausa')
  await waitFor(() => cardButton(4, PLAY) && cardButton(6, PAUSE), 'cada botón dice lo suyo')
  cardButton(4, PLAY).focus()
  await press('Enter')
  await waitFor(() => !videoOf(4).paused && videoOf(6).paused && cardButton(4, PAUSE) && cardButton(6, PLAY), 'Enter sobre «Reproducir» de la 4: arranca y el de la 6 se pausa')
  await press('Enter')
  await waitFor(() => playing().length === 0 && cardButton(4, PLAY), 'Enter sobre «Pausar» lo detiene')
  sampling = false
  check(maxPlaying === 1, 'nunca dos clips andando a la vez, en ningún cuadro: ' + maxPlaying)
  // Un clip que arranca por otro camino también pausa al que sonaba.
  cardButton(5, PLAY).click()
  await waitFor(() => !videoOf(5).paused, 'el de la 5 arranca')
  void videoOf(6).play()
  await waitFor(() => !videoOf(6).paused && videoOf(5).paused && playing().length === 1, 'el de la 6 arrancó por código y el de la 5 se pausó')
  cardButton(6, PAUSE).click()
  await waitFor(() => playing().length === 0, 'todos quietos')
  check(expandedIds().length === 0, '«Reproducir» y «Pausar» no despliegan la tarjeta: sus botones no son los de la tarjeta entera')

  // 4b. Desplegar y plegar (entrega 2g, §23.4): un clic en la tarjeta o
  //     «Ajustar avatar» la despliegan; desplegada ocupa la fila entera; una
  //     sola a la vez; con el teclado, el foco va al primer control al
  //     desplegar y vuelve a «Ajustar avatar» al plegar.
  // El clip no se corta al desplegar ni al plegar: es el mismo nodo y sigue
  // andando.
  const clipNode = videoOf(4)
  cardButton(4, PLAY).click()
  await waitFor(() => !videoOf(4).paused && videoOf(4).currentTime > 0.1, 'el clip de la 4 arranca y avanza', 300)
  card(4).querySelector('h3').click()
  await waitFor(() => collapseButton(4), 'un clic en la tarjeta (en su título) la despliega')
  check(videoOf(4) === clipNode && !videoOf(4).paused, 'desplegada, el clip es el mismo nodo y sigue andando')
  await collapse(4)
  check(videoOf(4) === clipNode && !videoOf(4).paused, 'plegada otra vez, también')
  cardButton(4, PAUSE).click()
  await waitFor(() => videoOf(4).paused && cardButton(4, PLAY), 'se pausa')
  card(4).querySelector('h3').click()
  await waitFor(() => collapseButton(4), 'otro clic en la tarjeta la despliega')
  check(expandedIds().join() === '4', 'solo la 4: ' + expandedIds().join())
  check(card(4).classList.contains('col-span-full') && card(4).classList.contains('grid') && card(4).querySelectorAll('video').length === 1, 'desplegada ocupa la fila entera de la grilla (col-span-full) y su clip sigue en la tarjeta')
  check(collapseButton(4).textContent.trim() === CLOSE && !expandButton(4) && durationGroupIn(4) && motionGroupIn(4), '«Cerrar» (con su aria-label y el número) en el lugar de «Ajustar avatar», y la duración y el movimiento a la vista')
  await expand(2)
  check(expandedIds().join() === '2' && !card(4).classList.contains('col-span-full') && expandButton(4)?.getAttribute('aria-expanded') === 'false', 'desplegar otra pliega la anterior: una sola a la vez')
  collapseButton(2).focus()
  await press('Enter')
  await waitFor(() => expandButton(2) && document.activeElement === expandButton(2), 'Enter sobre «Cerrar»: la pliega y el foco vuelve a «Ajustar avatar»: ' + describe(document.activeElement))
  check(expandedIds().length === 0, 'todas plegadas')
  expandButton(4).focus()
  await press('Enter')
  await waitFor(() => collapseButton(4), 'Enter sobre «Ajustar avatar» la despliega')
  check(document.activeElement === lessIn(4), 'al desplegar, el foco va al primer control (el «−» de la duración, no «Cerrar»): ' + describe(document.activeElement))
  expandButton(6).focus()
  await press('Enter')
  await waitFor(() => collapseButton(6) && !collapseButton(4), 'Enter sobre «Ajustar avatar» de otra: se pliega la 4 y se despliega la 6')
  check(document.activeElement === lessIn(6) && expandedIds().join() === '6', 'y el foco queda en el primer control de la nueva, la que se plegó no se lo roba: ' + describe(document.activeElement))
  collapseButton(6).click()
  await waitFor(() => expandButton(6), 'el clic en «Cerrar» la pliega')
  check(document.activeElement === expandButton(6), 'con el mouse también: el foco vuelve a «Ajustar avatar», nunca a body: ' + describe(document.activeElement))

  // 4c. «Qué podés pedir» dentro de la vista ampliada: un globo que se abre
  //     sobre el diálogo y que Escape cierra sin cerrar la galería.
  await expand(4)
  const guideTrigger = () => cardButton(4, t('library.editor.avatar.guiaBoton'))
  const guideContent = () => document.getElementById(guideTrigger()?.getAttribute('aria-controls') ?? '')
  check(guideTrigger()?.getAttribute('aria-expanded') === 'false' && !guideContent(), '«Qué podés pedir», cerrado, sin globo')
  guideTrigger().focus()
  await press('Enter')
  await waitFor(() => guideTrigger().getAttribute('aria-expanded') === 'true' && guideContent(), 'Enter abre el globo con la guía')
  check(guideContent().querySelectorAll('li').length === 10 && guideContent().textContent.includes(t('library.editor.avatar.guiaPuedeTitulo')) && guideContent().textContent.includes(t('library.editor.avatar.guiaNoPuedeTitulo')), 'el globo trae las dos listas, diez líneas')
  check(guideContent().getAttribute('role') === 'dialog' && guideContent().getAttribute('aria-label') === t('library.editor.avatar.guiaBoton'), 'y es un diálogo con nombre, el del botón que lo abre')
  await press('Escape')
  await waitFor(() => !guideContent() && guideTrigger().getAttribute('aria-expanded') === 'false', 'Escape cierra el globo')
  check(gallery() && document.activeElement === guideTrigger() && collapseButton(4), 'y solo el globo: la galería sigue abierta, la tarjeta desplegada y el foco vuelve a su botón: ' + describe(document.activeElement))
  await collapse(4)

  // 4d. Ronda 1 (m1): al desplegar, la tarjeta entra entera en la vista del
  //     área con scroll de la galería (scrollIntoView con block nearest). La
  //     prueba corre sin CSS: el área se arma con estilos en línea, de la
  //     altura de una tarjeta desplegada más un margen, y la 7 se deja asomando
  //     por el borde de abajo (o más abajo todavía), así que desplegada se pasa
  //     del borde si nadie la sube.
  const scrollArea = () => gallery().querySelector('[data-gallery-scroll]')
  const boxOf = (element) => element.getBoundingClientRect()
  const insideArea = (element) => boxOf(element).top >= boxOf(scrollArea()).top - 1 && boxOf(element).bottom <= boxOf(scrollArea()).bottom + 1
  await expand(7)
  const unfoldedHeight = Math.ceil(boxOf(card(7)).height)
  await collapse(7)
  const areaHeight = unfoldedHeight + 80
  scrollArea().style.cssText = 'overflow-y:auto;height:' + areaHeight + 'px'
  card(7).style.marginTop = '0px'
  scrollArea().scrollTop = 0
  await delay()
  const naturalTop = boxOf(card(7)).top - boxOf(scrollArea()).top
  card(7).style.marginTop = Math.max(0, areaHeight - 100 - naturalTop) + 'px'
  scrollArea().scrollTop = 0
  await delay()
  check(scrollArea().scrollHeight > scrollArea().clientHeight && scrollArea().scrollTop === 0 && boxOf(card(7)).top >= boxOf(scrollArea()).bottom - 100 - 1, 'la 7, plegada, asoma por el borde de abajo del área con scroll: arriba del área en ' + Math.round(boxOf(card(7)).top - boxOf(scrollArea()).top) + ' px de ' + areaHeight)
  await expand(7)
  check(scrollArea().scrollTop > 0 && insideArea(card(7)), 'desplegada, la 7 entra entera en el área con scroll (la galería la sube): scrollTop ' + scrollArea().scrollTop + ', tarjeta de ' + Math.round(boxOf(card(7)).top - boxOf(scrollArea()).top) + ' a ' + Math.round(boxOf(card(7)).bottom - boxOf(scrollArea()).top) + ' px en un área de ' + areaHeight)
  await collapse(7)
  card(7).style.marginTop = ''
  scrollArea().style.cssText = ''

  // 5. «Regenerar avatar» de la 4 (lista) desde su tarjeta, con el panel de
  //    detrás en la misma escena: la confirmación, Escape, el pedido del
  //    panel, el avance, el aviso al terminar y el foco.
  check(panelButton(REGENERATE), 'detrás, el panel de la escena 4 tiene su propio «Regenerar avatar»')
  await expand(4)
  cardButton(4, REGENERATE).focus()
  await press('Enter')
  await waitFor(() => alertDialog()?.textContent.includes(BALANCE), 'Enter sobre «Regenerar avatar» de la tarjeta abre la confirmación con el saldo')
  check(alertDialog().textContent.includes(t('library.editor.avatar.confirmarTituloRegenerar')) && alertDialog().textContent.includes(t('library.editor.avatar.confirmarTextoRegenerar', { count: 1, amount: usd(IV_10S) })), '«¿Regenerar el avatar?» con el costo de IV: ' + alertDialog().textContent)
  check(document.activeElement === alertButton(CANCEL), 'el foco abre en «Cancelar»: ' + describe(document.activeElement))
  await press('Escape')
  await waitFor(() => !alertDialog(), 'Escape cierra la confirmación')
  check(gallery(), 'y solo la confirmación: la vista ampliada sigue abierta')
  check(await waitFor(() => document.activeElement === cardButton(4, REGENERATE), 'el foco vuelve al botón de la tarjeta: ' + describe(document.activeElement)), 'el foco vuelve al «Regenerar avatar» de la tarjeta, no al del panel')
  check(window.avatarJobs.length === 0, 'Escape no pide nada')
  await press('Enter')
  await waitFor(() => alertDialog()?.textContent.includes(BALANCE), 'Enter la vuelve a abrir')
  await press('Tab')
  check(document.activeElement === alertButton(CONFIRM_RETAKE), 'Tab pasa a «Regenerar»: ' + describe(document.activeElement))
  await press('Enter')
  await waitFor(() => window.avatarJobs.length === 1, 'Enter sobre «Regenerar» pide el avatar')
  const retake = window.avatarJobs[0]
  check(retake.subcommand === 'avatar-render-scenes' && JSON.stringify(retake.payload) === JSON.stringify({ projectId: 'fixture', sceneIds: [4], regenerateSceneIds: [4] }), 'el mismo pedido que el panel: la escena y que se vuelve a generar (sin movimiento: no se cambió): ' + JSON.stringify(retake.payload))
  await waitFor(() => !alertDialog(), 'la confirmación se cierra al arrancar')
  await waitFor(() => regionOf(4) && document.activeElement === regionOf(4), 'el foco va a la región del avance de la tarjeta, no al del panel: ' + describe(document.activeElement))
  check(gallery() && regionOf(4).getAttribute('aria-label') === t('library.editor.timeline.avatarRendering') && cardButton(4, CANCEL), 'la vista sigue abierta y la tarjeta muestra el avance con «Cancelar», como el panel')
  check(hasState(4, 'generating', STATE_LABELS.generating) && titleOf(4) === STATE_LABELS.generating && !percentIn(stateOf(4)) && !percentIn(regionOf(4)), 'en cola: «Generando el avatar…», sin porcentaje')
  check(panel().querySelector('[role="region"]'), 'el panel de detrás muestra el mismo avance')
  // Desplegar otra pliega la 4 con su render en curso: plegada, su pastilla
  // sigue diciendo que se genera y, al volver a desplegarla, ve su avance con
  // el foco en él.
  await expand(6)
  check(hasState(4, 'generating', STATE_LABELS.generating) && !regionOf(4), 'plegada, la 4 sigue con «Generando el avatar…» en su pastilla: el avance no depende de que esté desplegada')
  check(cardButton(6, REGENERATE)?.disabled && stepOff(lessIn(6)) && stepOff(moreIn(6)), 'la 6, desplegada, espera mientras se genera otra')
  await expand(4)
  await waitFor(() => regionOf(4) && document.activeElement === regionOf(4), 'al volver a desplegar la 4, su avance con el foco en la región: ' + describe(document.activeElement))
  retake.onEvent({ type: 'avatar-scene-started', sceneId: 4 })
  await waitFor(() => percentIn(stateOf(4)) && percentIn(regionOf(4)), 'al arrancar su render, el porcentaje en el estado y en el avance de la tarjeta')
  const startedPercent = Number(percentIn(stateOf(4)))
  check(await waitFor(() => Number(percentIn(stateOf(4)) ?? -1) > startedPercent, 'el porcentaje avanza solo (sigue en ' + startedPercent + ')', 200), 'el porcentaje avanza solo')
  storeAvatar(4, view({ ...READY_4, clipMtimeMs: 21 }))
  const toastsBeforeRetake = window.toasts.length
  retake.onEvent({ type: 'avatar-scene-ready', sceneId: 4, scene: { id: 4 } })
  await waitFor(() => videoOf(4)?.getAttribute('src') === media('clip.mp4', '/p/avatar/scene_4.mp4', 21), 'la tarjeta toma el clip nuevo, con su versión nueva')
  retake.onEvent({ type: 'job-completed', result: { rendered: [4], failed: [] } })
  await waitFor(() => window.toasts.length > toastsBeforeRetake && window.toasts.at(-1).description === t('library.editor.avatar.listo'), 'el aviso «listo» al terminar')
  check(document.body.textContent.includes(t('library.editor.avatar.listo')), 'que se ve con la galería abierta (Toaster)')
  await waitFor(() => !regionOf(4) && hasState(4, 'ready', STATE_LABELS.ready), 'la tarjeta vuelve a «Lista»')
  check(await waitFor(() => document.activeElement === card(4), 'el foco que estaba en el avance vuelve a la tarjeta: ' + describe(document.activeElement)), 'el foco vuelve a la tarjeta, nunca a body ni al panel de detrás')
  check(gallery() && cardButton(4, REGENERATE) && !cardButton(4, REGENERATE).disabled, 'la vista sigue abierta y la tarjeta vuelve a ofrecer «Regenerar avatar»')

  // 6. «Generar avatar» de la 2 (planeada) con el movimiento editado en su
  //    tarjeta: viaja como desde el panel; el render falla y lo dicen el aviso
  //    y la tarjeta.
  await expand(2)
  typeInto(motionFieldIn(2), EDITED)
  await waitFor(() => motionFieldIn(2)?.value === EDITED, 'el prompt de movimiento de la 2, editado en su tarjeta')
  await expand(4)
  check(motionFieldIn(4)?.value === AUTO_4, 'el borrador es de la tarjeta 2: la 4 tiene el suyo')
  await expand(2)
  check(motionFieldIn(2)?.value === '', 'plegada, la 2 descarta su borrador: las acciones se montan al desplegar')
  typeInto(motionFieldIn(2), EDITED)
  await waitFor(() => motionFieldIn(2)?.value === EDITED, 'otra vez el prompt de movimiento de la 2')
  cardButton(2, GENERATE).click()
  await waitFor(() => alertDialog()?.textContent.includes(BALANCE), 'la confirmación de la 2')
  check(alertDialog().textContent.includes(t('library.editor.avatar.confirmarTitulo')) && alertDialog().textContent.includes(t('library.editor.avatar.confirmarTexto', { count: 1, amount: usd(IV_10S) })), '«¿Generar el avatar?» con el costo de IV: ' + alertDialog().textContent)
  alertButton(CONFIRM).click()
  await waitFor(() => window.avatarJobs.length === 2, 'pide la 2')
  const generate = window.avatarJobs[1]
  check(JSON.stringify(generate.payload) === JSON.stringify({ projectId: 'fixture', sceneIds: [2], motion: [{ sceneId: 2, motionPrompt: EDITED, expressive: false }] }), 'con el movimiento editado en la tarjeta, como el panel: ' + JSON.stringify(generate.payload))
  await waitFor(() => regionOf(2) && document.activeElement === regionOf(2), 'el foco va al avance de la 2: ' + describe(document.activeElement))
  generate.onEvent({ type: 'avatar-scene-started', sceneId: 2 })
  storeAvatar(2, view({ engine: 'avatar_iv', status: 'failed', clipPath: undefined, clipMtimeMs: undefined, errorCode: 'avatar_timeout', motionPrompt: EDITED, motionSource: 'user' }))
  generate.onEvent({ type: 'avatar-scene-failed', sceneId: 2, code: 'avatar_timeout' })
  generate.onEvent({ type: 'job-completed', result: { rendered: [], failed: [2] } })
  const timeoutFailure = t('library.editor.avatar.fallo', { reason: t(errorKeyOf('avatar_timeout')) })
  await waitFor(() => window.toasts.at(-1)?.description === timeoutFailure && window.toasts.at(-1).variant === 'destructive', 'el aviso del fallo al terminar: ' + JSON.stringify(window.toasts.at(-1)))
  await waitFor(() => card(2)?.textContent.includes(timeoutFailure) && hasState(2, 'failed', STATE_LABELS.failed), 'la tarjeta dice el motivo y queda con la imagen fija')
  check(await waitFor(() => document.activeElement === card(2), 'el foco vuelve a la tarjeta 2: ' + describe(document.activeElement)), 'el foco vuelve a la tarjeta 2, nunca a body')
  check(motionFieldIn(2)?.value === EDITED, 'la tarjeta muestra el prompt que quedó guardado en la escena')

  // 7. «Regenerar todos (3)» desde la tarjeta de la 5: el pedido con las tres
  //    sin clip válido, el avance en las tres tarjetas y «Cancelar».
  await expand(5)
  await waitFor(() => cardButton(5, ALL(3)) && !cardButton(5, ALL(3)).disabled, '«Regenerar todos (3)» en la 5')
  cardButton(5, ALL(3)).click()
  await waitFor(() => alertDialog()?.textContent.includes(BALANCE), 'la confirmación de las tres')
  const allCost = avatarSpansCostEstimate('photo_avatar', [span(4, 14)], 'avatar_iv').estimated + avatarSpansCostEstimate('photo_avatar', [span(28, 38), span(48, 58)], 'avatar_iii').estimated
  check(alertDialog().textContent.includes(t('library.editor.avatar.confirmarTexto', { count: 3, amount: usd(allCost) })), '«Se generan 3 apariciones» con el costo de cada motor: ' + alertDialog().textContent)
  alertButton(CONFIRM).click()
  await waitFor(() => window.avatarJobs.length === 3, 'pide las tres')
  const all = window.avatarJobs[2]
  check(JSON.stringify(all.payload) === JSON.stringify({ projectId: 'fixture', sceneIds: [2, 5, 7] }), 'las tres, en orden, sin las listas: ' + JSON.stringify(all.payload))
  await waitFor(() => [2, 5, 7].every((id) => hasState(id, 'generating', STATE_LABELS.generating)) && regionOf(5), 'las tres tarjetas dicen que se generan y la desplegada muestra su avance')
  check(hasState(4, 'ready', STATE_LABELS.ready) && hasState(6, 'ready', STATE_LABELS.ready), 'las listas siguen listas')
  await waitFor(() => document.activeElement === regionOf(5), 'el foco va al avance de la tarjeta que la pidió: ' + describe(document.activeElement))
  const toastsBeforeCancel = window.toasts.length
  cardButton(5, CANCEL).click()
  await waitFor(() => window.cancels.includes('avatar-job-3'), '«Cancelar» de la tarjeta corta el job')
  all.onEvent({ type: 'job-failed', code: 'cancelled', message: 'cancelled' })
  await waitFor(() => [2, 5, 7].every((id) => !regionOf(id)), 'las tres salen del avance')
  check(await waitFor(() => document.activeElement === card(5), 'el foco vuelve a la tarjeta 5: ' + describe(document.activeElement)), 'el foco vuelve a la tarjeta 5, nunca a body')
  check(window.toasts.length === toastsBeforeCancel, 'cancelar no avisa nada')

  // 8. La duración desde la tarjeta (entrega 2g, §23.3): un proyecto con
  //    imágenes entre las apariciones (el planificador siempre deja al menos
  //    3 s). La 4, IV con un look de foto, lista, de 22 a 32 s; la 8, V con un
  //    gemelo digital, lista, con «más expresivo» guardado de la 2e. Es el
  //    mismo hook del panel: lo que cambia es dónde vive.
  const COSTO = (lookType, engine, startSeconds, endSeconds) => avatarSpansCostEstimate(lookType, [span(startSeconds, endSeconds)], engine).estimated
  const USER_8 = 'Leans in with a calm smile and counts on her fingers.'
  const GAP = () => [
    scene(1, 0, 4),
    scene(2, 4, 14, { imagePath: LOOK, avatar: view({ ...PLANNED, engine: 'avatar_iv' }) }),
    scene(3, 14, 22),
    scene(4, 22, 32, { imagePath: LOOK, avatar: view(READY_4) }),
    scene(5, 32, 38),
    scene(6, 38, 42),
    scene(7, 42, 50),
    scene(8, 50, 60, { imagePath: LOOK, avatar: view({ lookType: 'digital_twin', engine: 'avatar_v', clipPath: '/p/avatar/scene_8.mp4', clipMtimeMs: 31, motionPrompt: USER_8, motionSource: 'user', autoMotionPrompt: AUTO_4, expressive: true }) }),
    scene(9, 60, 72),
    scene(10, 72, 96, { imagePath: LOOK, avatar: view({ clipPath: '/p/avatar/scene_10.mp4', clipMtimeMs: 41 }) }),
  ]
  window.detail = { ...window.detail, scenes: GAP() }
  await queryClient.invalidateQueries({ queryKey: ['videos', 'project', 'fixture', 'detail'] })
  await waitFor(() => cardIds().length === 10, 'la galería con las diez escenas del proyecto con imágenes entre las apariciones')
  const TRIM = (seconds) => t('library.editor.avatar.recortar', { seconds })
  const VALUE = (seconds) => t('library.editor.avatar.duracionValor', { seconds })
  const IV = (seconds) => COSTO('photo_avatar', 'avatar_iv', 22, 22 + seconds)
  await expand(4)
  check(durationValueIn(4) === VALUE(10) && durationGroupIn(4).textContent.includes(t('library.editor.avatar.duracionActual', { seconds: '10' })) && !stepOff(lessIn(4)) && !stepOff(moreIn(4)), 'la 4 arranca en 10 s, lo que dura hoy, con el máximo de 25 s: ' + durationValueIn(4))
  check(cardButton(4, REGENERATE) && !cardButton(4, TRIM(10)) && costIn(4, IV(10)), 'misma duración: «Regenerar avatar» con el costo de 10 s')
  await clickTimes(() => moreIn(4), 4)
  await waitFor(() => durationValueIn(4) === VALUE(14) && costIn(4, IV(14)), '14 s con el costo de 14 s: ' + durationValueIn(4))
  check(durationGroupIn(4).textContent.includes(t('library.editor.avatar.duracionMasLarga', { time: '0:36' })), 'dice hasta dónde toma la narración: 22 + 14 = 0:36')
  cardButton(4, REGENERATE).click()
  await waitFor(() => alertDialog()?.textContent.includes(BALANCE), 'la confirmación de 14 s')
  check(alertDialog().textContent.includes(t('library.editor.avatar.confirmarTitulo')) && !alertDialog().textContent.includes(t('library.editor.avatar.confirmarTituloRegenerar')) && alertDialog().textContent.includes(t('library.editor.avatar.confirmarTexto', { count: 1, amount: usd(IV(14)) })), '«¿Generar el avatar?» con el costo de 14 s: ' + alertDialog().textContent)
  check(alertDialog().textContent.includes(t('library.editor.avatar.confirmarDuracion', { seconds: 14, current: '10' })) && alertDialog().textContent.includes(t('library.editor.avatar.duracionTapa', { count: 1 })), 'con la duración nueva y las escenas de imagen que tapa: ' + alertDialog().textContent)
  const jobsBeforeLonger = window.avatarJobs.length
  alertButton(CONFIRM).click()
  await waitFor(() => window.avatarJobs.length === jobsBeforeLonger + 1, 'pide la 4 más larga')
  const longer = window.avatarJobs.at(-1)
  check(JSON.stringify(longer.payload) === JSON.stringify({ projectId: 'fixture', sceneIds: [4], durations: [{ sceneId: 4, seconds: 14 }] }), 'el pedido de la tarjeta lleva la duración, como el del panel: ' + JSON.stringify(longer.payload))
  await waitFor(() => regionOf(4) && document.activeElement === regionOf(4), 'el foco va al avance de la tarjeta: ' + describe(document.activeElement))
  longer.onEvent({ type: 'job-failed', code: 'cancelled', message: 'cancelled' })
  await waitFor(() => !regionOf(4) && cardButton(4, REGENERATE), 'cancelada: la tarjeta vuelve')
  check(await waitFor(() => document.activeElement === card(4), 'el foco vuelve a la tarjeta: ' + describe(document.activeElement)), 'el foco que estaba en el avance vuelve a la tarjeta')
  // Más corta con el clip listo: recortar, gratis y sin confirmación.
  await clickTimes(() => lessIn(4), 7)
  await waitFor(() => durationValueIn(4) === VALUE(7) && cardButton(4, TRIM(7)), 'a 7 s la acción es «Recortar a 7 s»')
  check(!cardButton(4, REGENERATE) && cardButton(4, TRIM(7)).querySelector('svg.lucide-scissors') && [...card(4).querySelectorAll('p')].some((paragraph) => paragraph.textContent.trim() === t('library.editor.avatar.recortarGratis')) && !costIn(4, IV(7)), 'una sola acción principal, con la tijera y «Gratis…» en vez del costo')
  const balanceBeforeTrim = window.balanceCalls
  const jobsBeforeTrim = window.avatarJobs.length
  window.trimResult = { sceneId: 4, startSeconds: 22, endSeconds: 29.4 }
  window.detail = { ...window.detail, scenes: window.detail.scenes.map((item) => (item.id === 4 ? { ...item, endSeconds: 29.4 } : item.id === 5 ? { ...item, startSeconds: 29.4 } : item)) }
  const toastsBeforeTrim = window.toasts.length
  cardButton(4, TRIM(7)).focus()
  await press('Enter')
  await waitFor(() => window.trimCalls.length === 1 && window.toasts.length > toastsBeforeTrim, 'Enter sobre «Recortar a 7 s» recorta')
  check(JSON.stringify(window.trimCalls[0]) === JSON.stringify({ projectId: 'fixture', sceneId: 4, seconds: 7 }), 'llama a la API con el proyecto, la escena y los segundos: ' + JSON.stringify(window.trimCalls[0]))
  check(!alertDialog() && window.avatarJobs.length === jobsBeforeTrim && window.balanceCalls === balanceBeforeTrim, 'sin confirmación, sin pedirle nada al proveedor y sin leer el saldo')
  check(window.toasts.at(-1).description === t('library.editor.avatar.recortado', { seconds: '7,4' }) && window.toasts.at(-1).variant === undefined, 'el aviso pasajero dice cuánto dura ahora: ' + JSON.stringify(window.toasts.at(-1)))
  await waitFor(() => durationGroupIn(4)?.textContent.includes(t('library.editor.avatar.duracionActual', { seconds: '7,4' })) && cardButton(4, REGENERATE), 'la tarjeta relee el proyecto: ahora dura 7,4 s y la acción es la de siempre')
  check(card(4).textContent.includes(formatTime(22) + ' – ' + formatTime(29.4)) && durationValueIn(4) === VALUE(7), 'su tramo nuevo y el selector en 7 s')
  check(document.activeElement && card(4).contains(document.activeElement), 'el foco sigue en la tarjeta: ' + describe(document.activeElement))
  // El recorte que falla.
  await clickTimes(() => lessIn(4), 2)
  await waitFor(() => durationValueIn(4) === VALUE(5) && cardButton(4, TRIM(5)), 'a 5 s: «Recortar a 5 s»')
  window.trimFails = 'avatar_trim_unavailable'
  const toastsBeforeFail = window.toasts.length
  cardButton(4, TRIM(5)).click()
  await waitFor(() => window.trimCalls.length === 2 && window.toasts.length > toastsBeforeFail, 'el recorte falla')
  check(window.toasts.at(-1).description === t('library.editor.avatar.recortarFallo', { reason: t(errorKeyOf('avatar_trim_unavailable')) }) && window.toasts.at(-1).variant === 'destructive', 'el aviso dice el motivo: ' + JSON.stringify(window.toasts.at(-1)))
  window.trimFails = null
  // La 8, V con un gemelo digital: sin «Movimiento más expresivo» y, al
  // regenerarla sin cambios, el pedido no lleva «motion»: el «más expresivo»
  // que traía guardado se conserva (R-2g-20).
  await expand(8)
  check(durationGroupIn(8) && motionFieldIn(8)?.value === USER_8 && !card(8).querySelector('[role="switch"]') && !cardButton(8, t('library.editor.avatar.expresivoAyudaAria')), 'V: su prompt y su duración, sin interruptor de «más expresivo»')
  check(cardButton(8, t('library.editor.avatar.motorAyudaAria', { engine: t('avatars.engines.avatar_v') }))?.textContent.trim() === t('avatars.engines.avatar_v'), 'el motor, un botón con su nombre')
  cardButton(8, REGENERATE).click()
  await waitFor(() => alertDialog()?.textContent.includes(BALANCE), 'la confirmación de la 8')
  const jobsBeforeV = window.avatarJobs.length
  alertButton(CONFIRM_RETAKE).click()
  await waitFor(() => window.avatarJobs.length === jobsBeforeV + 1, 'pide la 8')
  check(JSON.stringify(window.avatarJobs.at(-1).payload) === JSON.stringify({ projectId: 'fixture', sceneIds: [8], regenerateSceneIds: [8] }), 'sin «motion»: conserva lo guardado: ' + JSON.stringify(window.avatarJobs.at(-1).payload))
  window.avatarJobs.at(-1).onEvent({ type: 'job-failed', code: 'cancelled', message: 'cancelled' })
  await waitFor(() => !regionOf(8) && cardButton(8, REGENERATE), 'cancelada')
  // La 10 es la última escena del video (R-2g-18): su duración no cambia, y la
  // tarjeta dice por qué.
  await expand(10)
  check(durationValueIn(10) === VALUE(24) && stepOff(lessIn(10)) && stepOff(moreIn(10)), 'la última escena del video: el selector queda quieto en 24 s, con los dos botones apagados')
  check(durationGroupIn(10).textContent.includes(t('library.editor.avatar.duracionFinal')) && !durationGroupIn(10).textContent.includes(t('library.editor.avatar.duracionBloqueada')), 'y dice que es el final del video')
  check(cardButton(10, REGENERATE) && !cardButton(10, TRIM(24)), 'con la acción de siempre')
  await expand(8)

  // 9. La demo: la tarjeta espera y lo dice, también su duración.
  window.detail = { ...window.detail, metadata: { ...window.detail.metadata, options: { ...window.detail.metadata.options, demo: true } } }
  await queryClient.invalidateQueries({ queryKey: ['videos', 'project', 'fixture', 'detail'] })
  check(collapseButton(8), 'la 8 está desplegada')
  await waitFor(() => cardButton(8, REGENERATE)?.disabled && card(8).textContent.includes(t('library.editor.demoLocked')), 'en la demo, la tarjeta espera y lo dice')
  check(stepOff(lessIn(8)) && stepOff(moreIn(8)), 'y los botones de su duración también')
  check(window.unhandledRejections.length === 0, 'sin promesas rechazadas sin atender: ' + window.unhandledRejections.join(' | '))

  document.getElementById('result').textContent = 'PASS: editor avatar gallery (' + checks + ' checks)'
} catch (error) {
  const reason = renderError && renderError !== error ? ' (render error: ' + renderError.message + ')' : ''
  document.getElementById('result').textContent = 'FAIL: ' + error.message + reason
}
`

function generate(args) {
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', ...args])
}

try {
  // Un clip de 20 s (no termina mientras se prueba) y la imagen del look.
  generate([
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=320x180:rate=25:duration=20',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-g',
    '25',
    '-pix_fmt',
    'yuv420p',
    '-an',
    '-movflags',
    '+faststart',
    '-y',
    join(root, 'clip.mp4'),
  ])
  generate([
    '-f',
    'lavfi',
    '-i',
    'color=c=0x8b5cf6:size=320x180',
    '-frames:v',
    '1',
    '-y',
    join(root, 'look.png'),
  ])
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
    // de foco en Chrome headless.
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
      for (const { id, key } of keys) {
        const { text, ...codes } = KEYS[key]
        await send('Input.dispatchKeyEvent', {
          type: 'keyDown',
          key,
          ...codes,
          ...(text ? { text, unmodifiedText: text } : {}),
        })
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
