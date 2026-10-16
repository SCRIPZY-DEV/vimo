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
// Entrega 2e (§21.4, WP-X, caso 14b): toda escena lista ofrece «Regenerar
// avatar» (un render nuevo pagado: `regenerateSceneIds`) con el costo de SU
// motor; con V o IV, la sección «Movimiento» (el prompt editable con su
// contador, «Usar el automático», «Movimiento más expresivo» con su tooltip y
// la guía «Qué podés pedir»); lo que viaja con el pedido (el movimiento solo
// si la persona lo cambió); la confirmación de regenerar una lista; el aviso
// de una regeneración que falla (quedó el clip anterior); y el borrador, que
// no pasa de una escena a otra y sigue a lo guardado. Ronda 1 de su revisión:
// «más expresivo» solo, sin tocar el prompt (en una lista y en una planeada);
// el campo de una sola línea y el Enter sostenido sobre «Usar el automático»;
// la ayuda según de quién es el prompt; y el aviso «quedó el clip anterior»
// también cuando la regeneración cae entera con job-failed. Ronda 2 (revisión
// final de la 2e): con motionUnsupported la nota va arriba del campo, que
// sigue editable; un prompt nuevo viaja como siempre (el sidecar borra la
// marca y vuelve a probar) y, sin cambiarlo, solo «más expresivo» (si el
// motor y el look lo admiten).
// Entrega 2g (§23.1, §23.3 y §23.4, WP-C): «Movimiento más expresivo» solo con
// IV y un look de foto (V no tiene el interruptor y, si traía «más expresivo»
// guardado de la 2e o la 2f, lo conserva, R-2g-20: sin cambios el pedido no
// lleva `motion` —con el botón de la escena, con «Regenerar todos» y con el
// aviso de las apariciones con la imagen fija— y con el prompt editado la
// entrada lleva `expressive: true`, así ningún pedido del editor cambia la
// huella de un recibo vivo o pago); la sección «Movimiento» compacta (el motor
// con su tooltip, el campo de tres renglones, «Usar el automático» como enlace
// y «Qué podés pedir» en un globo que Escape cierra con el foco de vuelta al
// botón); y la
// «Duración» (caso 14c): el valor inicial redondeado y acotado, los límites
// con sus avisos, el costo y la hora que toma, las tres acciones (la misma
// duración: la de siempre; más corta con el clip listo y sin tocar el
// movimiento: «Recortar a N s», gratis y sin confirmación, con el aviso
// pasajero y el motivo si falla; el resto, un render nuevo con `durations` en
// el pedido, sin `regenerateSceneIds`), la confirmación con la duración nueva
// y las escenas de imagen que tapa, los códigos de error del sidecar, la
// vecina animada y el final del video (R-2g-18: el selector queda quieto y
// dice por qué), y los botones apagados con aria-disabled (nunca con
// disabled: el foco no se pierde). Ronda 1 de su revisión: el recorte sigue
// pendiente mientras la relectura del proyecto está en vuelo (la API ya
// contestó: el botón espera y un clic o un Enter no piden otro), invalida la
// lista de proyectos, un Enter sostenido sobre «Recortar a N s» no activa el
// «Regenerar avatar» en que se convierte el mismo botón, la confirmación que
// achica no dice «Tapa 0 escenas», y el foco queda en el botón del panel (no
// en body); el globo de la guía es un diálogo con nombre y el botón que recorta
// se declara ocupado (aria-busy) mientras trabaja.
// Entrega 2h (§24.4, WP-C, caso 10c): «Cancelar» el avance con apariciones ya
// cobradas (la fase `render`, `download` o `normalize`: AVATAR_CHARGED_PHASES)
// abre el aviso del editor y no corta nada hasta «Cancelar igual»; sin
// ninguna cobrada (en cola, `audio`, `upload`), corta directo como siempre.
// Cuenta las del job entero, no las de la escena elegida. La cuenta es la de lo
// cobrado y sin terminar al tocar «Cancelar»: sube si se cobran más con el
// aviso abierto y nunca baja; el aviso se cierra solo por elección de la
// persona o cuando el job termina (foco al panel, nunca a body), no porque las
// cobradas terminen, y no reaparece con el próximo job. «Seguir generando» y
// Escape no cancelan y el foco vuelve al «Cancelar» que abrió el aviso (con el
// aviso cerrándose con su animación de salida, como en la app); «Cancelar
// igual» pide la cancelación una sola vez aunque se toque dos veces y,
// pedida, otro «Cancelar» no abre nada; Enter sostenido sobre «Cancelar» abre
// el aviso y sobre «Seguir generando» lo cierra, sin que las repeticiones
// reabran ni corten nada; y devolver el foco no desplaza el documento
// (preventScroll).
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
  // Con `holdDetail`, la relectura del proyecto no responde hasta que la
  // prueba la suelta (el recorte la espera: ronda 1, m1).
  '@/modules/videos/api': [
    "import { videosApi as real } from './src/modules/videos/api/index.ts'",
    'export const videosApi = { ...real, isNative: () => true, async projectDetail() { window.detailCalls += 1; if (window.holdDetail) await window.holdDetail; return structuredClone(window.detail) }, async cancelJob(jobId) { window.cancels.push(jobId); if (window.cancelFails) throw new Error("JobNotFound") }, async confirmScenes(payload) { window.confirmCalls.push(structuredClone(payload)) }, async trimAvatarScene(payload) { window.trimCalls.push(structuredClone(payload)); if (window.holdTrim) await window.holdTrim; if (window.trimFails) throw Object.assign(new Error(window.trimFails), { code: window.trimFails }); return structuredClone(window.trimResult) }, imageSource: (path, version) => "fixture-image://" + path + "?v=" + version, videoSource: (path, version) => "fixture-media://" + path + "?v=" + version }',
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
  // El store del editor, el real, con un registro de cada «cancelar» que el
  // panel le pide (entrega 2h): el store corta el avatar una sola vez aunque se
  // lo pidan dos, así que el sidecar (`window.cancels`) no vería un doble
  // pedido del panel.
  '@/modules/videos/hooks/useLibraryEditorTask': [
    "export * from './src/modules/videos/hooks/useLibraryEditorTask.ts'",
    "import { useLibraryEditorTask as real } from './src/modules/videos/hooks/useLibraryEditorTask.ts'",
    'export function useLibraryEditorTask(projectId) { const store = real(projectId); return { ...store, cancelActiveJob(id) { window.cancelRequests.push(id); return store.cancelActiveJob(id) } } }',
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
import { DEFAULT_TIMELINE_LAYOUT, EDITOR_SCENE_PANEL_ID, videosQueryKeys } from '@/modules/videos/constants'
import { EditorScenePanel } from '@/modules/videos/components/EditorScenePanel'
import { EditorTimeline } from '@/modules/videos/components/EditorTimeline'
import { useLibraryEditor } from '@/modules/videos/hooks/useLibraryEditor'
import { LibraryEditor } from '@/modules/videos/views/LibraryEditor/LibraryEditor'
import { avatarSpansCostEstimate } from '@/modules/videos/utilities/avatarCostEstimate'
import { avatarRenderPayload, avatarSceneAction, avatarScenesCost, avatarSceneState, avatarScenesToRender, editorFallbackSceneIds } from '@/modules/videos/utilities/avatarRegeneration'
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
  // Entrega 2e (§21.4).
  ['library.editor.avatar.confirmarTituloRegenerar'],
  ['library.editor.avatar.confirmarRegenerar'],
  ['library.editor.avatar.confirmarTextoRegenerar', { count: 1, amount: '1' }],
  ['library.editor.avatar.confirmarTextoRegenerar', { count: 2, amount: '1' }],
  ['library.editor.avatar.regenerarFalloConservado', { reason: 'x' }],
  ['library.editor.avatar.movimientoTitulo'],
  ['library.editor.avatar.movimientoLabel'],
  ['library.editor.avatar.movimientoHint'],
  ['library.editor.avatar.movimientoVacio'],
  ['library.editor.avatar.movimientoPlaceholder'],
  ['library.editor.avatar.movimientoCaracteres', { used: 1, max: 2 }],
  ['library.editor.avatar.movimientoAutomatico'],
  ['library.editor.avatar.movimientoNoAdmitido', { engine: 'x' }],
  ['library.editor.avatar.expresivo'],
  ['library.editor.avatar.expresivoAyudaAria'],
  ['library.editor.avatar.expresivoTooltip'],
  ['library.editor.avatar.guiaBoton'],
  ['library.editor.avatar.guiaPuedeTitulo'],
  ['library.editor.avatar.guiaNoPuedeTitulo'],
  ...['guiaExpresiones', 'guiaGestos', 'guiaPostura', 'guiaQuietud', 'guiaMirada', 'guiaCamara', 'guiaLugar', 'guiaObjetos', 'guiaCaminar', 'guiaFondo'].map((key) => ['library.editor.avatar.' + key]),
  ['library.editor.avatar.movimientoPendiente'],
  ['library.editor.avatar.movimientoPropio'],
  ['create.avatar.engineDescription.avatar_v'],
  ['create.avatar.engineDescription.avatar_iv'],
  ['avatars.engines.avatar_v'],
  ['avatars.engines.avatar_iv'],
  // Entrega 2g (§23.3 y §23.4).
  ['library.editor.avatar.duracion'],
  ['library.editor.avatar.duracionValor', { seconds: 7 }],
  ['library.editor.avatar.duracionMenos'],
  ['library.editor.avatar.duracionMas'],
  ['library.editor.avatar.duracionActual', { seconds: '10' }],
  ['library.editor.avatar.duracionAyuda'],
  ['library.editor.avatar.duracionLimite', { min: 5, max: 7 }],
  ['library.editor.avatar.duracionBloqueada'],
  ['library.editor.avatar.duracionFinal'],
  ['library.editor.avatar.duracionMasLarga', { time: '0:36' }],
  ['library.editor.avatar.duracionTapa', { count: 0 }],
  ['library.editor.avatar.duracionTapa', { count: 1 }],
  ['library.editor.avatar.duracionTapa', { count: 2 }],
  ['library.editor.avatar.recortar', { seconds: 7 }],
  ['library.editor.avatar.recortarGratis'],
  ['library.editor.avatar.recortado', { seconds: '7' }],
  ['library.editor.avatar.recortarFallo', { reason: 'x' }],
  ['library.editor.avatar.confirmarDuracion', { seconds: 14, current: '10' }],
  ['library.editor.avatar.motorAyudaAria', { engine: 'x' }],
  // Entrega 2h (§24.4).
  ['library.editor.avatar.cancelarTitulo'],
  ['library.editor.avatar.cancelarTexto', { count: 1 }],
  ['library.editor.avatar.cancelarTexto', { count: 2 }],
  ['library.editor.avatar.cancelarSeguir'],
  ['library.editor.avatar.cancelarIgual'],
]
// Los códigos cuyo texto compara el guard: cada uno con el suyo.
const ERROR_CODES = ['avatar_moderation_rejected', 'avatar_download_failed', 'avatar_timeout', 'avatar_insufficient_credits', 'cancelled', 'avatar_trim_unavailable', 'avatar_resize_out_of_range', 'avatar_resize_locked']

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
// Cada «cancelar» que el panel le pidió al store (el simulacro de arriba).
window.cancelRequests = []
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
// El recorte (entrega 2g): cada pedido anotado; con trimFails, la API falla con
// ese código; con holdTrim, no responde hasta que la prueba lo suelta; y con
// holdDetail la relectura del proyecto que le sigue tampoco.
window.trimCalls = []
window.trimResult = { sceneId: 0, startSeconds: 0, endSeconds: 0 }
window.trimFails = null
window.holdTrim = null
window.holdDetail = null
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
// Entrega 2e (§21.4): la sección «Movimiento» del panel es el grupo que se
// llama como su título; sus controles se buscan adentro y por su etiqueta, así
// el campo y el interruptor también prueban que están etiquetados.
const motionGroup = () => [...(panel()?.querySelectorAll('[role="group"]') ?? [])].find((group) => document.getElementById(group.getAttribute('aria-labelledby') ?? '')?.textContent.trim() === t('library.editor.avatar.movimientoTitulo'))
const labelledIn = (text) => { const label = [...(motionGroup()?.querySelectorAll('label') ?? [])].find((item) => item.textContent.trim() === text); return label?.htmlFor ? document.getElementById(label.htmlFor) : null }
const motionField = () => labelledIn(t('library.editor.avatar.movimientoLabel'))
const motionHint = () => document.getElementById(motionField()?.getAttribute('aria-describedby') ?? '')?.textContent.trim()
const expressiveSwitch = () => labelledIn(t('library.editor.avatar.expresivo'))
const motionButton = (label) => [...(motionGroup()?.querySelectorAll('button') ?? [])].find((button) => button.textContent.trim() === label || button.getAttribute('aria-label') === label)
const useAutomatic = () => motionButton(t('library.editor.avatar.movimientoAutomatico'))
// La duración (entrega 2g, §23.3): el grupo que se llama como su título, con
// «−», el valor y «+» (los límites los apagan con aria-disabled, nunca con
// disabled: el foco no se pierde).
const durationGroup = () => [...(panel()?.querySelectorAll('[role="group"]') ?? [])].find((group) => document.getElementById(group.getAttribute('aria-labelledby') ?? '')?.textContent.trim() === t('library.editor.avatar.duracion'))
const durationButton = (key) => [...(durationGroup()?.querySelectorAll('button') ?? [])].find((button) => button.getAttribute('aria-label') === t(key))
const lessButton = () => durationButton('library.editor.avatar.duracionMenos')
const moreButton = () => durationButton('library.editor.avatar.duracionMas')
const durationValue = () => durationGroup()?.querySelector('output')?.textContent.trim()
const durationText = (text) => [...(durationGroup()?.querySelectorAll('p') ?? [])].some((paragraph) => paragraph.textContent.trim() === text)
const stepButtonOff = (button) => button?.getAttribute('aria-disabled') === 'true' && !button.disabled
// Varios clics seguidos como los de una persona: cada uno en su tarea, con el
// cuadro dibujado entre uno y otro (tres click() en la misma tarea ven el mismo
// valor, porque React dibuja entre eventos).
async function clickTimes(find, times) {
  for (let index = 0; index < times; index++) { find().click(); await delay(40) }
}
const guideButton = () => motionButton(t('library.editor.avatar.guiaBoton'))
// La guía es un globo de Radix (Popover): existe solo abierto, fuera del panel
// (en un portal), con role dialog y el id que nombra el botón.
const guideBlock = () => document.getElementById(guideButton()?.getAttribute('aria-controls') ?? '')
const engineButton = (engine) => motionButton(t('library.editor.avatar.motorAyudaAria', { engine: t('avatars.engines.' + engine) }))
const counterOf = (used) => [...(motionGroup()?.querySelectorAll('span') ?? [])].some((item) => item.textContent.trim() === t('library.editor.avatar.movimientoCaracteres', { used, max: 300 }))
// Escribe en el campo controlado por React como lo haría el teclado.
function typeMotion(value) {
  const field = motionField()
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(field, value)
  field.dispatchEvent(new Event('input', { bubbles: true }))
}
const anyAll = () => [...(panel()?.querySelectorAll('button') ?? [])].some((button) => [1, 2, 3, 4, 5, 6, 7, 8].some((count) => button.textContent.trim() === ALL(count)))
const costLine = (amount) => [...(panel()?.querySelectorAll('p') ?? [])].find((paragraph) => paragraph.textContent.trim() === t('library.editor.avatar.costo', { amount: usd(amount) }))

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
  check(JSON.stringify(scenes.map((item) => avatarSceneAction(item, {}))) === JSON.stringify([null, 'generate', null, 'regenerate', 'regenerate', 'retake', 'regenerate', null]), 'la acción por estado: planeada genera; desactualizada, fallida y lista sin clip regeneran; lista y al día, desde la entrega 2e, se vuelve a generar (retake)')
  check(avatarSceneAction(scenes[1], { 2: { startedAt: 1, queued: true } }) === null, 'una escena que se está generando no ofrece nada')
  check(avatarSceneAction({ ...scenes[1], endSeconds: 4.01 }, {}) === null, 'una escena de avatar sin un cuadro de tramo tampoco (no tiene bloque y el carril no la pide)')
  // Ruling del 2026-10-11: desactualizada manda sobre fallida. Una lista
  // desactualizada que perdió su clip llega fallida por la descarga y con
  // stale; una fallida de verdad nunca trae stale.
  const staleWithoutClip = { ...scenes[3], avatar: view({ status: 'failed', clipPath: undefined, clipMtimeMs: undefined, errorCode: 'avatar_download_failed', stale: true }) }
  check(avatarSceneState(staleWithoutClip, {}) === 'stale' && avatarSceneAction(staleWithoutClip, {}) === 'regenerate', 'una lista desactualizada sin su clip: desactualizada (no fallida) y «Regenerar»')
  check(avatarSceneState(scenes[4], {}) === 'failed' && avatarSceneState(scenes[6], {}) === 'failed' && avatarSceneState(scenes[3], {}) === 'stale', 'una fallida de verdad y una lista al día sin clip siguen fallidas; la desactualizada con clip, desactualizada')
  check(JSON.stringify(avatarScenesToRender(scenes, {}).map((item) => item.id)) === '[2,4,5,7]', '«Regenerar todos» pide las cuatro sin clip válido o desactualizadas, en orden (la lista y al día no: no cuenta las que se vuelven a generar)')
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
  check(panelButton(REGENERATE) && !panelButton(GENERATE) && panel().textContent.includes(t('library.editor.avatar.costo', { amount: usd(0.165) })), 'lista y al día (entrega 2e): «Regenerar avatar» con su costo propio')
  check(!panelButton(ALL(4)) && !anyAll(), 'una lista no ofrece «Regenerar todos» (va junto al botón de una pendiente y no cuenta las listas)')
  check(!motionGroup(), 'con Avatar III, sin la sección «Movimiento» (el motor no acepta movimiento)')
  check(panel().textContent.includes(t('library.editor.panel.avatarSceneHint')), 'y la explica')
  await select(2)
  check(panelButton(GENERATE) && !motionGroup(), 'una planeada de Avatar III tampoco tiene la sección')
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
  await waitFor(() => progressRegion() && document.activeElement === progressRegion(), 'el foco queda en la región del avance: ' + activeText())
  check(progressRegion().getAttribute('aria-label') === RENDERING && !panelButton(CANCEL), 'la región se llama «Generando el avatar…» y no ofrece «Cancelar»: con solo confirmar ya se cobra')
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
  check(panelButton(REGENERATE) && !panelButton(GENERATE) && !panelButton(CANCEL), 'la escena lista ya no ofrece «Generar» ni «Cancelar»: ofrece «Regenerar avatar» (entrega 2e)')

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

  // 8. El store cancela antes de que el invoke devuelva el id: se cancela al
  //    llegar. El panel ya no ofrece «Cancelar» (con solo confirmar se cobra),
  //    pero el store conserva el corte para quien cierre el job. El cierre
  //    cancelado devuelve la escena a lo que dice el disco, sin avisos de listo
  //    ni de fallo; el editor dice que se canceló.
  window.holdInvoke = true
  const toastsBeforeCancel = window.toasts.length
  panelButton(REGENERATE).click()
  await waitFor(() => dialog()?.textContent.includes(t('library.editor.avatar.saldo', { balance: usd(5) })), 'la confirmación')
  dialogButton(CONFIRM).click()
  await waitFor(() => window.avatarJobs.length === 3, 'pide la escena 5')
  check(JSON.stringify(window.avatarJobs[2].payload.sceneIds) === '[5]', 'solo la 5')
  await waitFor(() => progressRegion() && !panelButton(CANCEL), 'el avance, sin «Cancelar»')
  window.editor.editorTask.cancelActiveJob('fixture')
  await delay()
  check(window.cancels.length === 0, 'sin id todavía no hay nada que cancelar en el sidecar')
  window.avatarJobs[2].release()
  await waitFor(() => window.cancels.includes('avatar-job-3'), 'al llegar el id, el job se cancela')
  window.avatarJobs[2].onEvent({ type: 'job-failed', code: 'cancelled', message: 'cancelled' })
  await waitFor(() => !window.editor.editorTask.isProjectBusy('fixture'), 'el proyecto se libera')
  await waitFor(() => avatarBlock(5)?.title === t('library.editor.timeline.avatarFailed', { reason: timeoutReason }), 'la escena vuelve a lo del disco')
  check(document.getElementById('banner').textContent === t(errorKeyOf('cancelled')), 'el editor dice que se canceló: ' + document.getElementById('banner').textContent)
  check(window.toasts.length === toastsBeforeCancel, 'cancelar no avisa «listo» ni un fallo')

  // 9. El store cancela con el id ya en mano: va directo al sidecar. Un job que cae
  //    entero (el saldo) lo dice el editor, sin avisos pasajeros.
  window.holdInvoke = false
  panelButton(REGENERATE).click()
  await waitFor(() => dialog()?.textContent.includes(t('library.editor.avatar.saldo', { balance: usd(5) })), 'la confirmación')
  dialogButton(CONFIRM).click()
  await waitFor(() => window.avatarJobs.length === 4 && progressRegion(), 'la cuarta tarea')
  await waitFor(() => window.editor.editorTask.task?.avatarRender?.jobId === 'avatar-job-4', 'con su id')
  window.editor.editorTask.cancelActiveJob('fixture')
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
  //      pasa a la región del avance: lo que se acaba de confirmar no se
  //      cancela. El store corta una sola vez: cancelar otra vez no vuelve a
  //      llamar al sidecar.
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
  window.editor.editorTask.cancelActiveJob('fixture')
  await waitFor(() => window.cancels.length === cancelsBeforeHeld + 1, 'el store cancela')
  check(window.cancels.at(-1) === heldJob.jobId, 'el job que corre: ' + JSON.stringify(window.cancels.slice(cancelsBeforeHeld)))
  window.editor.editorTask.cancelActiveJob('fixture')
  await delay(100)
  check(window.cancels.length === cancelsBeforeHeld + 1, 'cancelar otra vez no vuelve a llamar al sidecar')
  check(window.unhandledRejections.length === 0, 'el JobNotFound de un job que ya terminó no queda sin atender: ' + JSON.stringify(window.unhandledRejections))
  window.cancelFails = false
  heldJob.onEvent({ type: 'job-failed', code: 'cancelled', message: 'cancelled' })
  await waitFor(() => !window.editor.editorTask.isProjectBusy('fixture'), 'liberado')

  // 10c. Sin «Cancelar» en el editor: ni con apariciones ya cobradas (fase
  //      render, download o normalize) el avance ofrece cortar, y no se abre
  //      ningún aviso. Reemplaza el aviso de la entrega 2h (§24.4): con solo
  //      confirmar HeyGen ya cobra.
  const chargedJobsBefore = window.avatarJobs.length
  check(window.editor.editorTask.startAvatarRender('fixture', [4, 5, 7]), 'el editor arranca el avatar de 4, 5 y 7')
  const chargedJob = await waitFor(() => window.avatarJobs[chargedJobsBefore], 'el pedido de las tres')
  await waitFor(() => window.editor.editorTask.task?.avatarRender?.jobId === chargedJob.jobId, 'con su id')
  for (const id of [4, 5, 7]) chargedJob.onEvent({ type: 'avatar-scene-started', sceneId: id })
  chargedJob.onEvent({ type: 'avatar-scene-progress', sceneId: 5, phase: 'render', elapsedSeconds: 8 })
  await waitFor(() => window.editor.editorTask.task?.sceneAvatarRendering?.[5]?.phase === 'render', 'la 5 cobrada')
  await waitFor(() => progressRegion(), 'el avance de la 5')
  check(!panelButton(CANCEL) && !dialog(), 'con una aparición cobrada, el avance no ofrece «Cancelar» ni abre un aviso')
  chargedJob.onEvent({ type: 'job-failed', code: 'cancelled', message: 'cancelled' })
  await waitFor(() => !window.editor.editorTask.isProjectBusy('fixture'), 'liberado')
  await select(5)

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
  check(panel().textContent.includes(t('create.avatar.noKey')) && !panelButton(REGENERATE), 'una lista y al día también tendría «Regenerar avatar» (entrega 2e): sin la clave, el aviso en su lugar')

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

  // 14b. Entrega 2e (§21.4, WP-X): un proyecto con motores y looks distintos.
  //      La 2 es IV con un look de foto y planeada, sin prompt de movimiento
  //      todavía (Vimo lo escribe antes de su primer pedido, §21.2); la 4, IV
  //      con un look de foto, lista y con el prompt que escribió Vimo; la 5, V
  //      con un gemelo digital, lista, con un prompt de la persona y «más
  //      expresivo»; la 6, IV con un gemelo (el proveedor no le acepta
  //      movimiento); la 7, IV con un look de foto y fallida, sin prompt.
  const AUTO_2 = 'Warm, confident smile at the camera with a small welcoming nod.'
  const AUTO_4 = 'Composed posture and sincere expression, with a subtle open-hand gesture on the key point.'
  const AUTO_5 = 'Warm smile at the camera with a gentle, reassuring nod.'
  const USER_5 = 'Leans in with a calm smile and counts on her fingers.'
  const EDITED = 'Smiles warmly and nods on the key point.'
  const READY_4 = view({ engine: 'avatar_iv', motionPrompt: AUTO_4, motionSource: 'auto', autoMotionPrompt: AUTO_4 })
  const avatars2e = {
    2: view({ ...PLANNED, engine: 'avatar_iv' }),
    4: READY_4,
    5: view({ engine: 'avatar_v', lookType: 'digital_twin', motionPrompt: USER_5, motionSource: 'user', autoMotionPrompt: AUTO_5, expressive: true }),
    6: view({ engine: 'avatar_iv', lookType: 'digital_twin' }),
    7: view({ engine: 'avatar_iv', status: 'failed', clipPath: undefined, clipMtimeMs: undefined, errorCode: 'avatar_timeout' }),
  }
  window.detail = { ...structuredClone(INITIAL_DETAIL), scenes: INITIAL_DETAIL.scenes.map((item) => (avatars2e[item.id] ? { ...item, avatar: avatars2e[item.id] } : item)) }
  const scenes2e = window.detail.scenes
  const engineCost = (lookType, engine, spans) => avatarSpansCostEstimate(lookType, spans, engine).estimated
  const IV_PHOTO_10S = engineCost('photo_avatar', 'avatar_iv', [span(18, 28)])
  // Las reglas puras: la acción de cada una, «Regenerar todos», el costo al
  // motor de cada escena y el pedido que arma el store.
  check(JSON.stringify(scenes2e.map((item) => avatarSceneAction(item, {}))) === JSON.stringify([null, 'generate', null, 'retake', 'retake', 'retake', 'regenerate', null]), 'las listas, de cualquier motor, se vuelven a generar: ' + JSON.stringify(scenes2e.map((item) => avatarSceneAction(item, {}))))
  check(JSON.stringify(avatarScenesToRender(scenes2e, {}).map((item) => item.id)) === '[2,7]', '«Regenerar todos» sigue pidiendo solo las que no tienen un clip válido')
  check(IV_PHOTO_10S === 0.385 && avatarScenesCost([scenes2e[3]]).estimated === 0.385, 'el costo al motor de la escena: IV con un look de foto, 2,31 US$/min, 0,385 por 10 s (hasta la 2e se cobraba todo a Avatar III)')
  check(avatarScenesCost([scenes2e[4]]).estimated === 1.2 && avatarScenesCost([scenes2e[5]]).estimated === 0.805, 'V con un gemelo, 1,20; IV con un gemelo, 0,805')
  check(avatarScenesCost([scenes[5], scenes2e[3]]).estimated === createCost([span(38, 48)]) + IV_PHOTO_10S, 'un mismo tipo de look con dos motores: cada escena con la tarifa del suyo')
  check(JSON.stringify(avatarRenderPayload('p', { sceneIds: [7, 2, 7] })) === JSON.stringify({ projectId: 'p', sceneIds: [2, 7] }), 'sin nada más, el pedido de siempre: las escenas sin repetir y en orden')
  check(JSON.stringify(avatarRenderPayload('p', { sceneIds: [2], regenerateSceneIds: [], motion: [] })) === JSON.stringify({ projectId: 'p', sceneIds: [2] }), 'lo que viaja además, vacío, no viaja')
  check(JSON.stringify(avatarRenderPayload('p', { sceneIds: [4], regenerateSceneIds: [9, 4, 4], motion: [{ sceneId: 9, motionPrompt: 'x', expressive: false }, { sceneId: 4, motionPrompt: EDITED, expressive: true }] })) === JSON.stringify({ projectId: 'p', sceneIds: [4], regenerateSceneIds: [4], motion: [{ sceneId: 4, motionPrompt: EDITED, expressive: true }] }), 'regenerar y el movimiento, solo de las escenas pedidas y sin repetir')

  // La lista de IV con un look de foto: «Regenerar avatar» con el costo de su
  // motor y, antes del costo, la sección «Movimiento».
  await queryClient.invalidateQueries({ queryKey: ['videos', 'project', 'fixture', 'detail'] })
  await select(4)
  await waitFor(() => motionGroup(), 'IV con un look de foto y lista: la sección «Movimiento»')
  check(panelButton(REGENERATE) && !panelButton(GENERATE) && !anyAll(), 'la lista ofrece «Regenerar avatar», sin «Regenerar todos»')
  check(costLine(0.385), 'con el costo de su motor: ' + t('library.editor.avatar.costo', { amount: usd(0.385) }))
  check(motionGroup().compareDocumentPosition(costLine(0.385)) & Node.DOCUMENT_POSITION_FOLLOWING, 'la sección va antes del costo')
  // El motor, sin caja ni párrafo (2g): su nombre es un botón con nombre
  // accesible y la descripción va en su tooltip.
  check(engineButton('avatar_iv')?.tagName === 'BUTTON' && engineButton('avatar_iv').textContent.trim() === t('avatars.engines.avatar_iv'), 'el motor, un botón con su nombre y su ayuda accesible: ' + engineButton('avatar_iv')?.outerHTML)
  check(!motionGroup().textContent.includes(t('create.avatar.engineDescription.avatar_iv')), 'la descripción del motor no ocupa un párrafo en la sección')
  engineButton('avatar_iv').focus()
  await waitFor(() => [...document.querySelectorAll('[role="tooltip"]')].some((tip) => tip.textContent.trim() === t('create.avatar.engineDescription.avatar_iv')), 'con el foco en el motor, el tooltip dice la descripción')
  engineButton('avatar_iv').blur()
  await waitFor(() => !document.querySelector('[role="tooltip"]'), 'al salir, el tooltip se cierra')
  const field4 = motionField()
  check(field4?.tagName === 'TEXTAREA' && field4.value === AUTO_4 && field4.maxLength === 300 && field4.placeholder === t('library.editor.avatar.movimientoPlaceholder') && !field4.disabled, 'el prompt de la escena en un campo etiquetado, con su tope (300) y su ejemplo')
  check(counterOf(AUTO_4.length), 'el contador: ' + AUTO_4.length + '/300')
  check(motionHint() === t('library.editor.avatar.movimientoHint'), 'la ayuda, unida al campo: ' + motionHint())
  check(!useAutomatic(), 'sin «Usar el automático»: es el de Vimo')
  const switch4 = expressiveSwitch()
  check(switch4?.getAttribute('role') === 'switch' && switch4.getAttribute('aria-checked') === 'false' && !switch4.disabled, '«Movimiento más expresivo», etiquetado y apagado')
  check(!panel().querySelector('[role="region"]'), 'nada con role="region" en el panel quieto: la única región es la del avance')
  // El tooltip de «más expresivo»: un botón con nombre que lo abre con el foco.
  const help = motionButton(t('library.editor.avatar.expresivoAyudaAria'))
  check(help?.tagName === 'BUTTON' && help.type === 'button', 'la ayuda de «más expresivo» es un botón con nombre')
  help.focus()
  await waitFor(() => [...document.querySelectorAll('[role="tooltip"]')].some((tip) => tip.textContent.trim() === t('library.editor.avatar.expresivoTooltip')), 'con el foco, el tooltip dice qué hace y que no suma costo')
  help.blur()
  await waitFor(() => !document.querySelector('[role="tooltip"]'), 'al salir, el tooltip se cierra')
  // La guía «Qué podés pedir»: un botón que abre un globo (Popover de Radix)
  // con sus dos listas, que se cierra con Escape devolviendo el foco al botón.
  check(guideButton()?.getAttribute('aria-expanded') === 'false' && !guideBlock(), '«Qué podés pedir», cerrado: el globo no existe y el panel no suma un role="region"')
  guideButton().focus()
  await press('Enter')
  await waitFor(() => guideButton().getAttribute('aria-expanded') === 'true' && guideBlock(), 'Enter abre el globo')
  check(guideBlock().getAttribute('role') === 'dialog' && guideBlock().getAttribute('aria-label') === t('library.editor.avatar.guiaBoton'), 'el globo es un diálogo con nombre, el del botón que lo abre (si no, un lector de pantalla anuncia un diálogo sin nombre)')
  const CAN = ['guiaExpresiones', 'guiaGestos', 'guiaPostura', 'guiaQuietud', 'guiaMirada'].map((key) => t('library.editor.avatar.' + key))
  const CANNOT = ['guiaCamara', 'guiaLugar', 'guiaObjetos', 'guiaCaminar', 'guiaFondo'].map((key) => t('library.editor.avatar.' + key))
  const guideLists = [...guideBlock().querySelectorAll('ul')]
  const linesOf = (list) => [...(list?.querySelectorAll('li') ?? [])].map((item) => item.textContent.trim())
  const nameOf = (list) => document.getElementById(list?.getAttribute('aria-labelledby') ?? '')?.textContent.trim()
  check(guideLists.length === 2 && JSON.stringify(linesOf(guideLists[0])) === JSON.stringify(CAN) && JSON.stringify(linesOf(guideLists[1])) === JSON.stringify(CANNOT), 'las diez líneas de la guía en sus dos listas: ' + JSON.stringify(guideLists.map(linesOf)))
  check(nameOf(guideLists[0]) === t('library.editor.avatar.guiaPuedeTitulo') && nameOf(guideLists[1]) === t('library.editor.avatar.guiaNoPuedeTitulo'), 'cada lista nombrada por su título')
  check(guideLists[0].querySelectorAll('svg.lucide-check').length === 5 && guideLists[1].querySelectorAll('svg.lucide-x').length === 5, 'con el ícono de sí en lo que se controla y el de no en lo que no')
  check(!panel().contains(guideBlock()) && !panel().querySelector('[role="region"]'), 'el globo vive en un portal, fuera del panel, y no es una región')
  await press('Escape')
  await waitFor(() => guideButton().getAttribute('aria-expanded') === 'false' && !guideBlock(), 'Escape cierra el globo')
  check(document.activeElement === guideButton(), 'y el foco vuelve al botón, nunca a body: ' + document.activeElement?.tagName)
  guideButton().click()
  await waitFor(() => guideBlock(), 'el clic también lo abre')
  guideButton().click()
  await waitFor(() => !guideBlock(), 'otro clic lo cierra')

  // Editar: «Usar el automático» aparece y vuelve al de Vimo; la ayuda dice de
  // quién es el prompt y, vacío, que se usa el movimiento propio del motor.
  // Ronda 1 de la revisión: el campo es de una sola línea (Enter no agrega
  // saltos y los pegados se vuelven espacios), un Enter sostenido sobre «Usar
  // el automático» no escribe en el campo (M1), y el automático con espacios
  // de más sigue siendo el automático (R3).
  motionField().focus()
  await press('Enter')
  check(motionField().value === AUTO_4 && !useAutomatic(), 'Enter en el campo no agrega un salto de línea: ' + JSON.stringify(motionField().value))
  typeMotion('Smiles warmly.\nNods on the key point.\r\nLooks at the camera.')
  await waitFor(() => motionField()?.value === 'Smiles warmly. Nods on the key point. Looks at the camera.', 'los saltos pegados se vuelven espacios: ' + JSON.stringify(motionField()?.value))
  typeMotion('  ' + AUTO_4 + '  ')
  await waitFor(() => motionField()?.value === '  ' + AUTO_4 + '  ', 'el automático con espacios de más')
  check(!useAutomatic() && motionHint() === t('library.editor.avatar.movimientoHint'), 'con espacios de más sigue siendo el automático: sin «Usar el automático» y con su ayuda: ' + motionHint())
  typeMotion(EDITED)
  await waitFor(() => useAutomatic(), 'tras editarlo, «Usar el automático»')
  check(motionField().value === EDITED && counterOf(EDITED.length) && motionHint() === t('library.editor.avatar.movimientoPropio'), 'el campo, el contador y la ayuda de un prompt propio siguen al borrador: ' + motionHint())
  useAutomatic().focus()
  await press(ENTER_HELD)
  await waitFor(() => !useAutomatic(), 'Enter sostenido sobre «Usar el automático»: el botón se va')
  check(motionField()?.value === AUTO_4, 'vuelve al de Vimo, exacto: las repeticiones no escriben en el campo: ' + JSON.stringify(motionField()?.value))
  check(document.activeElement === motionField(), 'el foco que estaba en el botón pasa al campo, no a body: ' + document.activeElement?.tagName)
  typeMotion('')
  await waitFor(() => motionHint() === t('library.editor.avatar.movimientoVacio'), 'vacío, con un automático: la ayuda dice que se usa el movimiento del motor')
  check(useAutomatic() && counterOf(0), 'con «Usar el automático» y el contador en cero')

  // El borrador vive en la escena elegida: no pasa a otra y se descarta al
  // cambiar de escena.
  typeMotion(EDITED)
  await waitFor(() => motionField()?.value === EDITED, 'la 4 con un borrador')
  await select(5)
  await waitFor(() => motionField()?.value === USER_5, 'la 5 muestra su prompt, no el borrador de la 4')
  check(useAutomatic() && !expressiveSwitch(), 'V con un gemelo: el prompt de la persona (con «Usar el automático») y sin «Movimiento más expresivo»: con V no hay interruptor (entrega 2g, §23.1), aunque la escena lo traiga guardado')
  check(!motionGroup().textContent.includes(t('library.editor.avatar.expresivo')) && !motionButton(t('library.editor.avatar.expresivoAyudaAria')), 'ni su etiqueta ni su ayuda')
  check(motionHint() === t('library.editor.avatar.movimientoPropio'), 'la ayuda de un prompt propio, no «Vimo lo escribió»: ' + motionHint())
  check(engineButton('avatar_v')?.textContent.trim() === t('avatars.engines.avatar_v') && costLine(1.2), 'con el motor Avatar V y su costo, 1,20')
  await select(4)
  await waitFor(() => motionField()?.value === AUTO_4, 'al volver a la 4, el borrador ya no está: muestra lo guardado')
  await select(6)
  await waitFor(() => panelButton(REGENERATE) && costLine(0.805), 'IV con un gemelo: «Regenerar avatar» con su costo, 0,805')
  check(!motionGroup(), 'y sin la sección: el proveedor no le acepta movimiento')
  await select(2)
  await waitFor(() => panelButton(GENERATE) && motionField(), 'la 2, planeada: «Generar avatar» y la sección')
  check(motionField().value === '' && !useAutomatic() && motionHint() === t('library.editor.avatar.movimientoPendiente'), 'sin prompt todavía: el campo vacío y la ayuda dice que Vimo lo escribe al generarla (§21.2): ' + motionHint())
  typeMotion(EDITED)
  await select(7)
  await waitFor(() => panelButton(REGENERATE) && motionField(), 'la 7, fallida, con la sección')
  check(motionField().value === '' && !useAutomatic(), 'el borrador de la 2 no pasa a la 7, aunque las dos tengan lo mismo guardado (la key por escena)')

  // Regenerar una lista sin tocar el movimiento: su confirmación, el pedido
  // con «regenerateSceneIds» y sin «motion», y la lista que vuelve. Cada
  // pedido se cuenta desde el que había antes de confirmarlo.
  window.fixture.balance = USD(5)
  forgetBalance()
  const toastsBefore2e = window.toasts.length
  const RETAKE = t('library.editor.avatar.confirmarRegenerar')
  const BALANCE_5 = t('library.editor.avatar.saldo', { balance: usd(5) })
  const keptNotice = (code) => t('library.editor.avatar.regenerarFalloConservado', { reason: t(errorKeyOf(code)) })
  const idle = () => !window.editor.editorTask.isProjectBusy('fixture')
  // Abre la confirmación con el botón de la escena, la confirma con el que
  // corresponde y devuelve el pedido nuevo.
  async function confirmRequest(sceneButton, confirmButton, message) {
    const before = window.avatarJobs.length
    panelButton(sceneButton).click()
    await waitFor(() => dialogButton(confirmButton) && dialog().textContent.includes(BALANCE_5), 'la confirmación: ' + message)
    dialogButton(confirmButton).click()
    await waitFor(() => window.avatarJobs.length === before + 1, 'el pedido: ' + message)
    return window.avatarJobs.at(-1)
  }
  await select(4)
  await waitFor(() => motionField()?.value === AUTO_4, 'la 4')
  panelButton(REGENERATE).click()
  await waitFor(() => dialog()?.textContent.includes(BALANCE_5), 'la confirmación de regenerar una lista, con el saldo')
  check(dialog().textContent.includes(t('library.editor.avatar.confirmarTituloRegenerar')) && !dialog().textContent.includes(t('library.editor.avatar.confirmarTitulo')), '«¿Regenerar el avatar?»: ' + dialog().textContent)
  check(dialogDescription().includes(t('library.editor.avatar.confirmarTextoRegenerar', { count: 1, amount: usd(0.385) })), 'con el costo de su motor y que el clip actual queda: ' + dialogDescription())
  check(dialogButton(RETAKE) && !dialogButton(CONFIRM) && activeText() === CANCEL, 'el botón dice «Regenerar» y el foco abre en «Cancelar»')
  const jobsBeforeRetake = window.avatarJobs.length
  dialogButton(RETAKE).click()
  await waitFor(() => window.avatarJobs.length === jobsBeforeRetake + 1, 'regenerar pide el avatar')
  const retakeJob = window.avatarJobs.at(-1)
  check(JSON.stringify(retakeJob.payload) === JSON.stringify({ projectId: 'fixture', sceneIds: [4], regenerateSceneIds: [4] }), 'regenerar una lista sin tocar el movimiento: la escena y «regenerateSceneIds», sin «motion»: ' + JSON.stringify(retakeJob.payload))
  await waitFor(() => progressRegion(), 'el avance en el panel')
  check(!motionGroup(), 'mientras se genera, el avance ocupa el lugar de la sección')
  await select(5)
  check(motionField()?.disabled && !expressiveSwitch() && useAutomatic()?.disabled && panelButton(REGENERATE)?.disabled, 'con el proyecto ocupado, el campo, «Usar el automático» y el botón de otra escena esperan (R2 de la revisión; V no tiene interruptor)')
  check(stepButtonOff(lessButton()) && stepButtonOff(moreButton()), 'y los dos botones de la duración también, con aria-disabled y sin disabled: apagarlos con disabled le sacaría el foco al que lo tiene')
  await select(4)
  retakeJob.onEvent({ type: 'avatar-scene-started', sceneId: 4 })
  storeAvatar(4, { ...READY_4, take: 1 })
  retakeJob.onEvent({ type: 'avatar-scene-ready', sceneId: 4, scene: { id: 4 } })
  retakeJob.onEvent({ type: 'job-completed', result: { rendered: [4], failed: [] } })
  await waitFor(() => idle() && window.toasts.at(-1)?.description === t('library.editor.avatar.listo'), 'la regeneración quedó lista: «listo»')
  await waitFor(() => panelButton(REGENERATE) && motionField()?.value === AUTO_4, 'y la lista vuelve a ofrecer «Regenerar avatar» con su sección')

  // Solo «Movimiento más expresivo», sin tocar el prompt (I1 de la revisión):
  // viaja el prompt guardado con el interruptor prendido.
  expressiveSwitch().click()
  await waitFor(() => expressiveSwitch().getAttribute('aria-checked') === 'true' && motionField()?.value === AUTO_4, '«más expresivo» prendido y el prompt sin tocar')
  const expressiveJob = await confirmRequest(REGENERATE, RETAKE, 'solo «más expresivo»')
  check(JSON.stringify(expressiveJob.payload) === JSON.stringify({ projectId: 'fixture', sceneIds: [4], regenerateSceneIds: [4], motion: [{ sceneId: 4, motionPrompt: AUTO_4, expressive: true }] }), 'solo «más expresivo»: viaja con el prompt guardado: ' + JSON.stringify(expressiveJob.payload))
  expressiveJob.onEvent({ type: 'job-failed', code: 'cancelled', message: 'cancelled' })
  await waitFor(() => idle() && expressiveSwitch()?.getAttribute('aria-checked') === 'true', 'cancelada: el borrador sigue con «más expresivo»')

  // Regenerar con el movimiento editado y «más expresivo»; el render nuevo
  // falla y la escena sigue lista con el clip anterior: el aviso lo dice.
  typeMotion('  ' + EDITED + '  ')
  await waitFor(() => motionField()?.value === '  ' + EDITED + '  ' && expressiveSwitch().getAttribute('aria-checked') === 'true', 'el prompt editado y «más expresivo» en el borrador')
  const motionJob = await confirmRequest(REGENERATE, RETAKE, 'con el movimiento editado')
  check(JSON.stringify(motionJob.payload) === JSON.stringify({ projectId: 'fixture', sceneIds: [4], regenerateSceneIds: [4], motion: [{ sceneId: 4, motionPrompt: EDITED, expressive: true }] }), 'con el prompt editado (recortado) y «más expresivo»: ' + JSON.stringify(motionJob.payload))
  motionJob.onEvent({ type: 'avatar-scene-started', sceneId: 4 })
  // El sidecar guardó los ajustes antes de pedir (WP-U); el render nuevo
  // falló y la escena volvió a su estado listo con el clip anterior.
  const EDITED_4 = { ...READY_4, motionPrompt: EDITED, motionSource: 'user', expressive: true, take: 2 }
  storeAvatar(4, EDITED_4)
  const timeout2e = t(errorKeyOf('avatar_timeout'))
  motionJob.onEvent({ type: 'avatar-scene-failed', sceneId: 4, code: 'avatar_timeout' })
  motionJob.onEvent({ type: 'job-completed', result: { rendered: [], failed: [4] } })
  await waitFor(() => window.toasts.at(-1)?.description === keptNotice('avatar_timeout'), 'el aviso de la regeneración que falló: quedó el clip anterior: ' + JSON.stringify(window.toasts.at(-1)))
  check(window.toasts.at(-1).variant === 'destructive' && !window.toasts.slice(toastsBefore2e).some((item) => item.description === t('library.editor.avatar.fallo', { reason: timeout2e })), 'destructivo, y no el aviso de fallo común')
  await waitFor(() => panelButton(REGENERATE) && motionField()?.value === EDITED, 'la escena sigue lista y el campo muestra lo que quedó guardado')
  check(!panel().textContent.includes(t('library.editor.avatar.fallo', { reason: timeout2e })) && useAutomatic() && expressiveSwitch().getAttribute('aria-checked') === 'true', 'sin el motivo de una fallida; el prompt de la persona y «más expresivo», como quedaron')

  // La regeneración de una lista que cae entera con «job-failed» (M6 de la
  // revisión): con la pausa de la cuenta (su escena falló antes) o sin que
  // ninguna escena llegara a arrancar, el aviso también dice que quedó el
  // clip anterior, con el motivo del job. Cancelarla no avisa nada (lo dice el
  // editor, como en la 2d), y si la nueva ya había quedado lista, un cierre
  // fallido no dice que quedó la anterior.
  let toastsBefore = window.toasts.length
  const pausedJob = await confirmRequest(REGENERATE, RETAKE, 'la pausa de la cuenta')
  check(JSON.stringify(pausedJob.payload) === JSON.stringify({ projectId: 'fixture', sceneIds: [4], regenerateSceneIds: [4] }), 'sin cambios en el movimiento, sin «motion»: ' + JSON.stringify(pausedJob.payload))
  pausedJob.onEvent({ type: 'avatar-scene-started', sceneId: 4 })
  pausedJob.onEvent({ type: 'avatar-scene-failed', sceneId: 4, code: 'avatar_insufficient_credits' })
  pausedJob.onEvent({ type: 'job-failed', code: 'avatar_insufficient_credits', message: 'no credits' })
  await waitFor(() => window.toasts.length > toastsBefore && window.toasts.at(-1).description === keptNotice('avatar_insufficient_credits'), 'la pausa de la cuenta: quedó el clip anterior, con el motivo del job: ' + JSON.stringify(window.toasts.at(-1)))
  check(window.toasts.at(-1).variant === 'destructive' && window.toasts.length === toastsBefore + 1 && document.getElementById('banner').textContent === t(errorKeyOf('avatar_insufficient_credits')), 'un solo aviso, destructivo, y el editor dice el motivo del job')
  await waitFor(() => idle() && panelButton(REGENERATE) && motionField()?.value === EDITED, 'la escena sigue lista')
  toastsBefore = window.toasts.length
  const keyJob = await confirmRequest(REGENERATE, RETAKE, 'la clave que deja de servir')
  keyJob.onEvent({ type: 'job-failed', code: 'avatar_invalid_key', message: 'invalid key' })
  await waitFor(() => window.toasts.length > toastsBefore && window.toasts.at(-1).description === keptNotice('avatar_invalid_key'), 'sin que la escena arranque: también quedó el clip anterior: ' + JSON.stringify(window.toasts.at(-1)))
  await waitFor(() => idle() && panelButton(REGENERATE), 'liberado')
  toastsBefore = window.toasts.length
  const cancelledJob = await confirmRequest(REGENERATE, RETAKE, 'una regeneración que se cancela')
  await waitFor(() => !panelButton(CANCEL) && window.editor.editorTask.task?.avatarRender?.jobId === cancelledJob.jobId, 'el avance, sin «Cancelar», y el id del job')
  window.editor.editorTask.cancelActiveJob('fixture')
  await waitFor(() => window.cancels.includes(cancelledJob.jobId), 'cancelar llama al sidecar')
  cancelledJob.onEvent({ type: 'job-failed', code: 'cancelled', message: 'cancelled' })
  await waitFor(() => idle() && panelButton(REGENERATE), 'liberado')
  await delay(100)
  check(window.toasts.length === toastsBefore, 'cancelar una regeneración no avisa nada: ' + JSON.stringify(window.toasts.slice(toastsBefore)))
  toastsBefore = window.toasts.length
  const lateJob = await confirmRequest(REGENERATE, RETAKE, 'una regeneración lista que cierra con un fallo')
  lateJob.onEvent({ type: 'avatar-scene-started', sceneId: 4 })
  storeAvatar(4, { ...EDITED_4, take: 3 })
  lateJob.onEvent({ type: 'avatar-scene-ready', sceneId: 4, scene: { id: 4 } })
  lateJob.onEvent({ type: 'job-failed', code: 'avatar_provider_error', message: 'late' })
  await waitFor(() => idle() && panelButton(REGENERATE), 'liberado')
  await delay(100)
  check(!window.toasts.slice(toastsBefore).some((item) => item.description === keptNotice('avatar_provider_error')), 'la nueva ya había quedado lista: el cierre fallido no dice que quedó la anterior: ' + JSON.stringify(window.toasts.slice(toastsBefore)))

  // Una planeada: el movimiento que escribe la persona viaja con «Generar
  // avatar» y con «Regenerar todos» (que la incluye); solo «más expresivo»
  // viaja con el prompt vacío (I1 de la revisión; el sidecar igual le escribe
  // el automático, R-2e-9); sin tocar nada no viaja y el sidecar escribe el
  // automático, que el campo muestra al quedar lista.
  await select(2)
  await waitFor(() => panelButton(GENERATE) && motionField(), 'la 2, planeada')
  typeMotion(EDITED)
  await waitFor(() => panelButton(ALL(2)) && motionField().value === EDITED, '«Regenerar todos (2)»: la 2 y la 7')
  panelButton(GENERATE).click()
  await waitFor(() => dialogButton(CONFIRM) && dialog().textContent.includes(BALANCE_5), 'la confirmación de generar')
  check(dialog().textContent.includes(t('library.editor.avatar.confirmarTitulo')) && dialogDescription().includes(t('library.editor.avatar.confirmarTexto', { count: 1, amount: usd(0.385) })) && !dialogButton(RETAKE), 'generar una planeada sigue con sus textos («¿Generar el avatar?», «Generar») y el costo de IV')
  const jobsBeforePlanned = window.avatarJobs.length
  dialogButton(CONFIRM).click()
  await waitFor(() => window.avatarJobs.length === jobsBeforePlanned + 1, 'pide la planeada')
  check(JSON.stringify(window.avatarJobs.at(-1).payload) === JSON.stringify({ projectId: 'fixture', sceneIds: [2], motion: [{ sceneId: 2, motionPrompt: EDITED, expressive: false }] }), 'una planeada con el movimiento que escribió la persona, sin «regenerateSceneIds»: ' + JSON.stringify(window.avatarJobs.at(-1).payload))
  window.avatarJobs.at(-1).onEvent({ type: 'job-failed', code: 'cancelled', message: 'cancelled' })
  await waitFor(() => idle() && motionField()?.value === EDITED, 'cancelada: el borrador sigue ahí (no se guardó nada)')
  panelButton(ALL(2)).click()
  await waitFor(() => dialog()?.textContent.includes(BALANCE_5), 'la confirmación de las dos')
  check(dialogDescription().includes(t('library.editor.avatar.confirmarTexto', { count: 2, amount: usd(engineCost('photo_avatar', 'avatar_iv', [span(4, 14), span(48, 58)])) })), 'las dos, de IV con un look de foto: ' + dialogDescription())
  const jobsBeforeAll = window.avatarJobs.length
  dialogButton(CONFIRM).click()
  await waitFor(() => window.avatarJobs.length === jobsBeforeAll + 1, 'pide las dos')
  check(JSON.stringify(window.avatarJobs.at(-1).payload) === JSON.stringify({ projectId: 'fixture', sceneIds: [2, 7], motion: [{ sceneId: 2, motionPrompt: EDITED, expressive: false }] }), '«Regenerar todos» lleva el movimiento editado de la escena elegida, que va en el pedido: ' + JSON.stringify(window.avatarJobs.at(-1).payload))
  window.avatarJobs.at(-1).onEvent({ type: 'job-failed', code: 'cancelled', message: 'cancelled' })
  await waitFor(() => idle() && motionField(), 'cancelada')
  typeMotion('')
  expressiveSwitch().click()
  await waitFor(() => expressiveSwitch().getAttribute('aria-checked') === 'true' && motionField()?.value === '', 'solo «más expresivo» en la planeada, sin prompt')
  const plannedExpressiveJob = await confirmRequest(GENERATE, CONFIRM, 'solo «más expresivo» en la planeada')
  check(JSON.stringify(plannedExpressiveJob.payload) === JSON.stringify({ projectId: 'fixture', sceneIds: [2], motion: [{ sceneId: 2, motionPrompt: '', expressive: true }] }), 'solo «más expresivo» en una planeada sin prompt: viaja con el prompt vacío: ' + JSON.stringify(plannedExpressiveJob.payload))
  plannedExpressiveJob.onEvent({ type: 'job-failed', code: 'cancelled', message: 'cancelled' })
  await waitFor(() => idle() && expressiveSwitch()?.getAttribute('aria-checked') === 'true', 'cancelada')
  expressiveSwitch().click()
  await waitFor(() => expressiveSwitch().getAttribute('aria-checked') === 'false', 'de vuelta a lo guardado')
  const autoJob = await confirmRequest(GENERATE, CONFIRM, 'la planeada sin tocar el movimiento')
  check(JSON.stringify(autoJob.payload) === JSON.stringify({ projectId: 'fixture', sceneIds: [2] }), 'sin tocarlo, sin «motion»: el sidecar escribe el automático antes de pedir (§21.2): ' + JSON.stringify(autoJob.payload))
  autoJob.onEvent({ type: 'avatar-scene-started', sceneId: 2 })
  storeAvatar(2, view({ engine: 'avatar_iv', motionPrompt: AUTO_2, motionSource: 'auto', autoMotionPrompt: AUTO_2 }))
  autoJob.onEvent({ type: 'avatar-scene-ready', sceneId: 2, scene: { id: 2 } })
  autoJob.onEvent({ type: 'job-completed', result: { rendered: [2], failed: [] } })
  await waitFor(() => panelButton(REGENERATE) && motionField()?.value === AUTO_2, 'lista: el campo muestra el prompt que escribió Vimo')
  check(motionHint() === t('library.editor.avatar.movimientoHint') && !useAutomatic(), 'con su ayuda y sin «Usar el automático»')

  // El proveedor rechazó el movimiento (motionUnsupported). Ronda 2 (hallazgo
  // 2 de la revisión final): el rechazo puede no ser del look (un prompt
  // demasiado largo), así que la nota va ARRIBA del campo, que sigue a la
  // vista y editable, con su guía; un prompt nuevo viaja como siempre (el
  // sidecar borra la marca y vuelve a probar) y, sin cambiarlo, no viaja.
  // «Más expresivo» sigue apagado.
  storeAvatar(7, view({ engine: 'avatar_iv', motionUnsupported: true }))
  await queryClient.invalidateQueries({ queryKey: ['videos', 'project', 'fixture', 'detail'] })
  await select(7)
  const unsupported = t('library.editor.avatar.movimientoNoAdmitido', { engine: t('avatars.engines.avatar_iv') })
  const unsupportedNote = (text) => [...(motionGroup()?.querySelectorAll('p') ?? [])].find((paragraph) => paragraph.textContent.trim() === text)
  await waitFor(() => unsupportedNote(unsupported) && motionField(), 'la nota y el campo: ' + unsupported)
  check(unsupportedNote(unsupported).compareDocumentPosition(motionField()) & Node.DOCUMENT_POSITION_FOLLOWING, 'la nota va arriba del campo')
  check(!motionField().disabled && guideButton() && expressiveSwitch()?.disabled, 'el campo editable y la guía a la vista; «más expresivo» apagado')
  const unchangedJob = await confirmRequest(REGENERATE, RETAKE, 'una lista con motionUnsupported, sin cambiar el prompt')
  check(JSON.stringify(unchangedJob.payload) === JSON.stringify({ projectId: 'fixture', sceneIds: [7], regenerateSceneIds: [7] }), 'sin cambiar el prompt, sin «motion»: ' + JSON.stringify(unchangedJob.payload))
  unchangedJob.onEvent({ type: 'job-failed', code: 'cancelled', message: 'cancelled' })
  await waitFor(() => idle(), 'liberado')
  const RETRY_7 = 'Calm smile at the camera.'
  typeMotion(RETRY_7)
  await waitFor(() => motionField()?.value === RETRY_7, 'otro prompt en la escena marcada')
  const newPromptJob = await confirmRequest(REGENERATE, RETAKE, 'una lista con motionUnsupported y otro prompt')
  check(JSON.stringify(newPromptJob.payload) === JSON.stringify({ projectId: 'fixture', sceneIds: [7], regenerateSceneIds: [7], motion: [{ sceneId: 7, motionPrompt: RETRY_7, expressive: false }] }), 'con otro prompt, «motion» viaja como siempre (el sidecar borra la marca y vuelve a probar): ' + JSON.stringify(newPromptJob.payload))
  newPromptJob.onEvent({ type: 'job-failed', code: 'cancelled', message: 'cancelled' })
  await waitFor(() => idle(), 'liberado')

  // Un borrador que quedó escrito cuando la escena pasa a motionUnsupported
  // (M2 de la primera revisión): el campo sigue a la vista con el borrador,
  // que viaja si cambió el prompt; sin cambiar el prompt solo viaja «más
  // expresivo», con el prompt guardado, y solo si el motor y el look lo
  // admiten (IV con un look de foto sí; V no).
  await select(4)
  await waitFor(() => motionField()?.value === EDITED, 'la 4, con el prompt de la persona')
  typeMotion('Probe draft prompt.')
  expressiveSwitch().click()
  await waitFor(() => expressiveSwitch().getAttribute('aria-checked') === 'false' && motionField()?.value === 'Probe draft prompt.', 'un borrador con otro prompt y «más expresivo» apagado')
  storeAvatar(4, { ...EDITED_4, take: 3, motionUnsupported: true })
  await queryClient.invalidateQueries({ queryKey: ['videos', 'project', 'fixture', 'detail'] })
  await waitFor(() => unsupportedNote(unsupported) && motionField()?.value === 'Probe draft prompt.', 'la escena pasa a motionUnsupported: la nota, y el campo con el borrador')
  check(expressiveSwitch()?.disabled && expressiveSwitch().getAttribute('aria-checked') === 'false', 'el interruptor apagado, con el borrador')
  const changedIvJob = await confirmRequest(REGENERATE, RETAKE, 'IV con motionUnsupported y otro prompt')
  check(JSON.stringify(changedIvJob.payload) === JSON.stringify({ projectId: 'fixture', sceneIds: [4], regenerateSceneIds: [4], motion: [{ sceneId: 4, motionPrompt: 'Probe draft prompt.', expressive: false }] }), 'el prompt cambió: viaja el borrador: ' + JSON.stringify(changedIvJob.payload))
  changedIvJob.onEvent({ type: 'job-failed', code: 'cancelled', message: 'cancelled' })
  await waitFor(() => idle(), 'liberado')
  typeMotion(EDITED)
  await waitFor(() => motionField()?.value === EDITED && expressiveSwitch().getAttribute('aria-checked') === 'false', 'el prompt de vuelta al guardado, «más expresivo» todavía apagado')
  const staleIvJob = await confirmRequest(REGENERATE, RETAKE, 'IV con motionUnsupported sin cambiar el prompt')
  check(JSON.stringify(staleIvJob.payload) === JSON.stringify({ projectId: 'fixture', sceneIds: [4], regenerateSceneIds: [4], motion: [{ sceneId: 4, motionPrompt: EDITED, expressive: false }] }), 'sin cambiar el prompt, solo «más expresivo» con el prompt guardado: IV con un look de foto lo admite: ' + JSON.stringify(staleIvJob.payload))
  staleIvJob.onEvent({ type: 'job-failed', code: 'cancelled', message: 'cancelled' })
  await waitFor(() => idle(), 'liberado')
  await select(5)
  await waitFor(() => motionField()?.value === USER_5, 'la 5')
  typeMotion('Probe V draft.')
  await waitFor(() => motionField()?.value === 'Probe V draft.' && !expressiveSwitch(), 'un borrador de V con otro prompt, sin interruptor de «más expresivo»')
  storeAvatar(5, { ...avatars2e[5], motionUnsupported: true })
  await queryClient.invalidateQueries({ queryKey: ['videos', 'project', 'fixture', 'detail'] })
  await waitFor(() => unsupportedNote(t('library.editor.avatar.movimientoNoAdmitido', { engine: t('avatars.engines.avatar_v') })) && motionField()?.value === 'Probe V draft.', 'V pasa a motionUnsupported: la nota y el campo con el borrador')
  const changedVJob = await confirmRequest(REGENERATE, RETAKE, 'V con motionUnsupported y otro prompt')
  check(JSON.stringify(changedVJob.payload) === JSON.stringify({ projectId: 'fixture', sceneIds: [5], regenerateSceneIds: [5], motion: [{ sceneId: 5, motionPrompt: 'Probe V draft.', expressive: true }] }), 'con V, el prompt nuevo también viaja, con el «más expresivo» que traía guardado (R-2g-20): ' + JSON.stringify(changedVJob.payload))
  changedVJob.onEvent({ type: 'job-failed', code: 'cancelled', message: 'cancelled' })
  await waitFor(() => idle(), 'liberado')
  typeMotion(USER_5)
  await waitFor(() => motionField()?.value === USER_5, 'el prompt de V de vuelta al guardado')
  const staleVJob = await confirmRequest(REGENERATE, RETAKE, 'V con motionUnsupported sin cambiar el prompt')
  check(JSON.stringify(staleVJob.payload) === JSON.stringify({ projectId: 'fixture', sceneIds: [5], regenerateSceneIds: [5] }), 'con V y sin cambiar el prompt, no viaja «motion»: V no tiene el interruptor y el «más expresivo» que traía guardado se conserva (R-2g-20): ' + JSON.stringify(staleVJob.payload))
  staleVJob.onEvent({ type: 'job-failed', code: 'cancelled', message: 'cancelled' })
  await waitFor(() => idle(), 'liberado')
  storeAvatar(4, EDITED_4)
  storeAvatar(5, avatars2e[5])
  await queryClient.invalidateQueries({ queryKey: ['videos', 'project', 'fixture', 'detail'] })

  // En la demo, la sección también espera.
  window.fixture.locked = true
  await select(4)
  await waitFor(() => motionField()?.disabled && expressiveSwitch()?.disabled && panelButton(REGENERATE)?.disabled, 'en la demo, el campo, el interruptor y el botón esperan')
  window.fixture.locked = false
  await select(2)

  // 14c. Entrega 2g (§23.3): la duración de una aparición desde el panel. Un
  //      proyecto con imágenes entre las apariciones (el planificador siempre
  //      deja al menos 3 s): la 2, IV con un look de foto y planeada (4 a
  //      14 s); la 4, IV con un look de foto y lista (22 a 32 s); la 8, V con
  //      un gemelo digital, lista, con un prompt de la persona y «más
  //      expresivo» guardado de la 2e (50 a 60 s); la 10, III y lista (72 a
  //      82 s). Entre la 4 y la 8 hay tres escenas de imagen (32 a 38, 38 a 42
  //      y 42 a 50), así alargar la 4 tapa una o dos.
  const GAP_SCENES = () => [
    scene(1, 0, 4),
    scene(2, 4, 14, { imagePath: LOOK, avatar: view({ ...PLANNED, engine: 'avatar_iv' }) }),
    scene(3, 14, 22),
    scene(4, 22, 32, { imagePath: LOOK, avatar: READY_4 }),
    scene(5, 32, 38),
    scene(6, 38, 42),
    scene(7, 42, 50),
    scene(8, 50, 60, { imagePath: LOOK, avatar: avatars2e[5] }),
    scene(9, 60, 72),
    scene(10, 72, 82, { imagePath: LOOK, avatar: view() }),
    scene(11, 82, 96),
  ]
  // Abre la confirmación de la escena y espera el saldo; y, con los textos ya
  // mirados, la confirma y devuelve el pedido.
  async function openConfirmation(sceneButton, message) {
    panelButton(sceneButton).click()
    await waitFor(() => dialog()?.textContent.includes(BALANCE_5), 'la confirmación: ' + message)
  }
  async function confirmOpen(confirmButton, message) {
    const before = window.avatarJobs.length
    dialogButton(confirmButton).click()
    await waitFor(() => window.avatarJobs.length === before + 1, 'el pedido: ' + message)
    return window.avatarJobs.at(-1)
  }
  async function loadScenes(scenes) {
    window.detail = { ...structuredClone(INITIAL_DETAIL), scenes }
    await queryClient.invalidateQueries({ queryKey: ['videos', 'project', 'fixture', 'detail'] })
    await delay(60)
  }
  const costOf = (lookType, engine, startSeconds, endSeconds) => avatarSpansCostEstimate(lookType, [span(startSeconds, endSeconds)], engine).estimated
  const IV = (seconds) => costOf('photo_avatar', 'avatar_iv', 22, 22 + seconds)
  const TRIM = (seconds) => t('library.editor.avatar.recortar', { seconds })
  const VALUE = (seconds) => t('library.editor.avatar.duracionValor', { seconds })
  const NOW = (seconds) => t('library.editor.avatar.duracionActual', { seconds })
  const scissors = () => panelButton(TRIM(7))?.querySelector('svg.lucide-scissors')
  // Una confirmación que no tapa escenas de imagen no lo dice, tampoco con
  // «Tapa 0 escenas de imagen.» (ronda 1, m1): se miran las tres frases.
  const COVERS = (count) => t('library.editor.avatar.duracionTapa', { count })
  const coversNothing = () => [0, 1, 2].every((count) => !dialogDescription().includes(COVERS(count)))
  // Las reglas puras: lo que viaja y lo que cuesta.
  check(JSON.stringify(avatarRenderPayload('p', { sceneIds: [4], durations: [{ sceneId: 9, seconds: 7 }, { sceneId: 4, seconds: 14 }, { sceneId: 4, seconds: 12 }] })) === JSON.stringify({ projectId: 'p', sceneIds: [4], durations: [{ sceneId: 4, seconds: 12 }] }), 'la duración viaja solo de las escenas pedidas y sin repetir')
  check(JSON.stringify(avatarRenderPayload('p', { sceneIds: [2, 10], durations: [{ sceneId: 10, seconds: 9 }, { sceneId: 2, seconds: 8 }] })) === JSON.stringify({ projectId: 'p', sceneIds: [2, 10], durations: [{ sceneId: 2, seconds: 8 }, { sceneId: 10, seconds: 9 }] }), 'y en orden de escena')
  check(JSON.stringify(avatarRenderPayload('p', { sceneIds: [2], durations: [] })) === JSON.stringify({ projectId: 'p', sceneIds: [2] }), 'sin duraciones, el pedido de siempre')
  const gapScenes = GAP_SCENES()
  check(avatarScenesCost([gapScenes[3]], [{ sceneId: 4, seconds: 14 }]).estimated === IV(14) && avatarScenesCost([gapScenes[3]]).estimated === IV(10), 'el costo con una duración nueva es el de esos segundos desde el inicio de la escena, no el de su tramo de hoy')
  await loadScenes(GAP_SCENES())

  // La 4: valor inicial, límites y ayuda.
  await select(4)
  await waitFor(() => durationGroup() && motionField(), 'la 4, con su duración y su movimiento')
  check(durationValue() === VALUE(10) && durationText(NOW('10')), 'arranca en lo que dura hoy, redondeado, y debajo dice cuánto dura de verdad: ' + durationValue())
  check(!stepButtonOff(lessButton()) && !stepButtonOff(moreButton()) && lessButton().type === 'button' && moreButton().type === 'button', '«−» y «+» de un segundo, a la vista y sin apagar (el máximo de la 4 es 25 s: la próxima aparición, la 8, empieza 28 s después de su inicio, menos 3)')
  check(!durationText(t('library.editor.avatar.duracionBloqueada')) && !durationText(t('library.editor.avatar.duracionLimite', { min: 5, max: 25 })) && !durationText(t('library.editor.avatar.duracionMasLarga', { time: '0:32' })), 'sin avisos de límite ni de «más larga» con la misma duración')
  const durationHelp = [...durationGroup().querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === t('library.editor.avatar.duracionAyuda'))
  check(durationHelp?.type === 'button' && !durationGroup().textContent.includes(t('library.editor.avatar.duracionAyuda')), 'la ayuda va en un tooltip con un botón con nombre, no en un párrafo')
  durationHelp.focus()
  await waitFor(() => [...document.querySelectorAll('[role="tooltip"]')].some((tip) => tip.textContent.trim() === t('library.editor.avatar.duracionAyuda')), 'con el foco, el tooltip dice dónde termina la aparición')
  durationHelp.blur()
  await waitFor(() => !document.querySelector('[role="tooltip"]'), 'al salir, el tooltip se cierra')
  check(panelButton(REGENERATE) && !panelButton(TRIM(10)) && costLine(IV(10)), 'misma duración: la acción de siempre, «Regenerar avatar», con el costo de 10 s')
  check(durationGroup().compareDocumentPosition(motionGroup()) & Node.DOCUMENT_POSITION_FOLLOWING && motionGroup().compareDocumentPosition(costLine(IV(10))) & Node.DOCUMENT_POSITION_FOLLOWING, 'el orden del panel: la duración, el movimiento y, al final, el costo y la acción')

  // Más larga: con el teclado, el foco se queda en «+»; el costo y la hora siguen.
  moreButton().focus()
  await press('Enter')
  await waitFor(() => durationValue() === VALUE(11), 'Enter sobre «+» sube un segundo')
  check(document.activeElement === moreButton(), 'el foco se queda en «+»: ' + document.activeElement?.tagName)
  check(durationText(t('library.editor.avatar.duracionMasLarga', { time: '0:33' })) && costLine(IV(11)) && panelButton(REGENERATE), '11 s: la hora donde termina más o menos (22 + 11 = 0:33), el costo de 11 s y «Regenerar avatar»')
  await clickTimes(moreButton, 3)
  await waitFor(() => durationValue() === VALUE(14), 'tres clics más: 14 s')
  check(costLine(IV(14)), 'el costo es el de 14 s: ' + usd(IV(14)))
  await openConfirmation(REGENERATE, 'una aparición más larga')
  check(dialogDescription().includes(t('library.editor.avatar.confirmarTexto', { count: 1, amount: usd(IV(14)) })) && !dialog().textContent.includes(t('library.editor.avatar.confirmarTituloRegenerar')) && dialog().textContent.includes(t('library.editor.avatar.confirmarTitulo')), 'la confirmación dice «Generar» (no «Regenerar»: es un trozo nuevo de la narración, no la misma parte) con el costo de 14 s: ' + dialogDescription())
  check(dialogDescription().includes(t('library.editor.avatar.confirmarDuracion', { seconds: 14, current: '10' })) && dialogDescription().includes(t('library.editor.avatar.duracionTapa', { count: 1 })) && !dialogDescription().includes(t('library.editor.avatar.duracionTapa', { count: 2 })), 'y la duración nueva y las escenas de imagen que tapa: ' + dialogDescription())
  check(dialogButton(CONFIRM) && !dialogButton(RETAKE), 'con el botón «Generar»')
  const lengthenJob = await confirmOpen(CONFIRM, 'una aparición más larga')
  check(JSON.stringify(lengthenJob.payload) === JSON.stringify({ projectId: 'fixture', sceneIds: [4], durations: [{ sceneId: 4, seconds: 14 }] }), 'viaja solo la duración (sin «regenerateSceneIds»: la huella del pedido ya es otra, y pedir lo mismo otra vez cosecha el render pago): ' + JSON.stringify(lengthenJob.payload))
  // El proyecto cambió y esa duración ya no entra: el job cae entero con el
  // código del sidecar y el editor dice su texto (el de siempre, errorKeyOf).
  lengthenJob.onEvent({ type: 'job-failed', code: 'avatar_resize_out_of_range', message: 'out of range' })
  await waitFor(() => idle() && document.getElementById('banner').textContent === t(errorKeyOf('avatar_resize_out_of_range')), 'avatar_resize_out_of_range: el editor dice «' + t(errorKeyOf('avatar_resize_out_of_range')) + '»: ' + document.getElementById('banner').textContent)
  check(durationValue() === VALUE(14) && window.toasts.every((item) => item.description !== t('library.editor.avatar.regenerarFalloConservado', { reason: t(errorKeyOf('avatar_resize_out_of_range')) })), 'nada cambió, el selector sigue en lo elegido y no dice «quedó el clip anterior» (no era una regeneración de la misma parte)')
  const lockedJob = await confirmRequest(REGENERATE, CONFIRM, 'la misma, con la vecina animada de golpe')
  lockedJob.onEvent({ type: 'job-failed', code: 'avatar_resize_locked', message: 'locked' })
  await waitFor(() => idle() && document.getElementById('banner').textContent === t(errorKeyOf('avatar_resize_locked')), 'avatar_resize_locked: el editor dice «' + t(errorKeyOf('avatar_resize_locked')) + '»: ' + document.getElementById('banner').textContent)
  await clickTimes(moreButton, 4)
  await waitFor(() => durationValue() === VALUE(18), '18 s')
  panelButton(REGENERATE).click()
  await waitFor(() => dialog()?.textContent.includes(BALANCE_5), 'la confirmación de 18 s')
  check(dialogDescription().includes(t('library.editor.avatar.duracionTapa', { count: 2 })) && dialogDescription().includes(t('library.editor.avatar.confirmarDuracion', { seconds: 18, current: '10' })), 'con 18 s tapa dos escenas de imagen (la de 32 a 38 y la de 38 a 42, que quedaría con menos de 3 s): ' + dialogDescription())
  dialogButton(CANCEL).click()
  await waitFor(() => !dialog(), 'cerrada')

  // El máximo: 25 s (la próxima aparición menos 3 s de imágenes); en el
  // límite, «+» sigue con el foco y lo dice.
  await clickTimes(moreButton, 6)
  await waitFor(() => durationValue() === VALUE(24) && !stepButtonOff(moreButton()), '24 s, todavía con margen')
  moreButton().focus()
  await press('Enter')
  await waitFor(() => durationValue() === VALUE(25) && stepButtonOff(moreButton()), 'el máximo de la 4: 25 s y «+» apagado')
  check(durationText(t('library.editor.avatar.duracionLimite', { min: 5, max: 25 })) && document.activeElement === moreButton(), 'dice entre qué valores se puede elegir y el foco sigue en «+», apagado con aria-disabled y no con disabled: ' + document.activeElement?.tagName)
  await press('Enter')
  check(durationValue() === VALUE(25), '«+» apagado no sube más')

  // Más corta con un clip listo y sin tocar el movimiento: recortar, gratis y
  // sin confirmación.
  await clickTimes(lessButton, 18)
  await waitFor(() => durationValue() === VALUE(7), '7 s')
  await waitFor(() => panelButton(TRIM(7)), 'la acción pasa a «Recortar a 7 s»')
  check(scissors() && !panelButton(REGENERATE), 'con la tijera, y «Regenerar avatar» ya no está: una sola acción principal a la vez')
  check([...panel().querySelectorAll('p')].some((paragraph) => paragraph.textContent.trim() === t('library.editor.avatar.recortarGratis')) && !costLine(IV(7)) && ![...panel().querySelectorAll('p')].some((paragraph) => paragraph.textContent.startsWith('≈')), 'dice «Gratis…» en vez del costo')
  check(window.trimCalls.length === 0 && panelButton(TRIM(7)).getAttribute('aria-busy') === 'false', 'todavía no recortó nada y el botón no dice que trabaja')
  const balanceCallsBeforeTrim = window.balanceCalls
  const jobsBeforeTrim = window.avatarJobs.length
  // La lista de proyectos no tiene quien la mire en este banco: se siembra al
  // día y se comprueba, al final, que el recorte la invalidó (ronda 1, m1: sin
  // esa línea del hook, nada fallaba).
  queryClient.setQueryData(videosQueryKeys.projects, [])
  check(queryClient.getQueryState(videosQueryKeys.projects)?.isInvalidated === false, 'la lista de proyectos arranca sembrada y al día')
  let releaseTrim
  window.holdTrim = new Promise((done) => { releaseTrim = done })
  window.trimResult = { sceneId: 4, startSeconds: 22, endSeconds: 29.4 }
  panelButton(TRIM(7)).focus()
  await press('Enter')
  await waitFor(() => window.trimCalls.length === 1, 'Enter sobre «Recortar a 7 s» recorta')
  check(JSON.stringify(window.trimCalls[0]) === JSON.stringify({ projectId: 'fixture', sceneId: 4, seconds: 7 }), 'llama a la API con el proyecto, la escena y los segundos: ' + JSON.stringify(window.trimCalls[0]))
  check(!dialog() && window.avatarJobs.length === jobsBeforeTrim && window.balanceCalls === balanceCallsBeforeTrim, 'sin confirmación, sin pedirle nada al proveedor y sin leer el saldo')
  await waitFor(() => panelButton(TRIM(7))?.getAttribute('aria-disabled') === 'true', 'mientras recorta, el botón espera con aria-disabled')
  check(!panelButton(TRIM(7)).disabled && document.activeElement === panelButton(TRIM(7)) && panelButton(TRIM(7)).querySelector('svg.animate-spin') && stepButtonOff(lessButton()) && stepButtonOff(moreButton()), 'conserva el foco, muestra que trabaja y el selector espera')
  check(panelButton(TRIM(7)).getAttribute('aria-busy') === 'true', 'y se lo dice a un lector de pantalla con aria-busy (el ícono que gira es aria-hidden)')
  panelButton(TRIM(7)).click()
  await press('Enter')
  await delay(100)
  check(window.trimCalls.length === 1, 'un segundo clic o Enter mientras recorta no vuelve a pedir')
  window.detail = { ...window.detail, scenes: window.detail.scenes.map((item) => (item.id === 4 ? { ...item, endSeconds: 29.4 } : item.id === 5 ? { ...item, startSeconds: 29.4 } : item)) }
  const detailCallsBeforeTrim = window.detailCalls
  const toastsBeforeTrim = window.toasts.length
  // La API contesta pero la relectura del proyecto queda en vuelo (ronda 1,
  // m1): la mutación sigue pendiente hasta que termina, así que el botón
  // espera y un clic o un Enter no piden otro recorte sobre una escena que
  // todavía muestra la duración vieja.
  let releaseDetail
  window.holdDetail = new Promise((done) => { releaseDetail = done })
  releaseTrim()
  window.holdTrim = null
  await waitFor(() => window.toasts.length > toastsBeforeTrim && window.toasts.at(-1).description === t('library.editor.avatar.recortado', { seconds: '7,4' }), 'el aviso pasajero: «El avatar ahora dura 7,4 s.»: ' + JSON.stringify(window.toasts.at(-1)))
  check(window.toasts.at(-1).variant === undefined && document.body.textContent.includes(t('library.editor.avatar.recortado', { seconds: '7,4' })), 'sin diálogos de más, y se ve (Toaster)')
  await waitFor(() => window.detailCalls > detailCallsBeforeTrim, 'la API contestó: se pide releer el proyecto')
  await delay(100)
  check(panelButton(TRIM(7))?.getAttribute('aria-disabled') === 'true' && panelButton(TRIM(7)).getAttribute('aria-busy') === 'true' && !panelButton(TRIM(7)).disabled && document.activeElement === panelButton(TRIM(7)) && durationText(NOW('10')), 'con la API contestada y la relectura en vuelo, el botón sigue esperando con aria-disabled y aria-busy, conserva el foco y la escena todavía dice 10 s')
  panelButton(TRIM(7)).click()
  await press('Enter')
  await delay(100)
  check(window.trimCalls.length === 1 && !dialog() && window.avatarJobs.length === jobsBeforeTrim, 'un clic o un Enter con la relectura en vuelo no piden otro recorte ni abren nada')
  releaseDetail()
  window.holdDetail = null
  await waitFor(() => durationText(NOW('7,4')), 'relee el proyecto: ahora dura 7,4 s')
  check(durationValue() === VALUE(7) && panelButton(REGENERATE) && !panelButton(TRIM(7)) && costLine(costOf('photo_avatar', 'avatar_iv', 22, 29.4)), 'el selector vuelve a arrancar en la duración nueva y la acción es la de siempre, con el costo del tramo nuevo (7,4 s)')
  check(document.activeElement === panelButton(REGENERATE) && panelButton(REGENERATE).getAttribute('aria-busy') === 'false', 'el foco queda en el botón del panel, que ahora dice «Regenerar avatar» y ya no está ocupado; nunca en body: ' + document.activeElement?.tagName)
  check(queryClient.getQueryState(videosQueryKeys.projects)?.isInvalidated === true, 'el recorte invalida la lista de proyectos: la biblioteca ve el video desactualizado')

  // El recorte que falla: el aviso lleva el motivo y la escena no cambia.
  await clickTimes(lessButton, 3)
  await waitFor(() => durationValue() === VALUE(5) && panelButton(TRIM(5)), 'a 5 s: «Recortar a 5 s»')
  window.trimFails = 'avatar_trim_unavailable'
  const toastsBeforeFail = window.toasts.length
  const detailCallsBeforeFail = window.detailCalls
  panelButton(TRIM(5)).click()
  await waitFor(() => window.trimCalls.length === 2 && window.toasts.length > toastsBeforeFail, 'el recorte falla')
  check(window.toasts.at(-1).description === t('library.editor.avatar.recortarFallo', { reason: t(errorKeyOf('avatar_trim_unavailable')) }) && window.toasts.at(-1).variant === 'destructive', 'el aviso dice el motivo: ' + JSON.stringify(window.toasts.at(-1)))
  await waitFor(() => panelButton(TRIM(5))?.getAttribute('aria-disabled') === 'false' && panelButton(TRIM(5)).getAttribute('aria-busy') === 'false', 'el botón vuelve')
  check(window.detailCalls === detailCallsBeforeFail && durationValue() === VALUE(5), 'la escena no cambia ni se relee el proyecto, y el selector sigue donde estaba')
  window.trimFails = null

  // Más corta con el movimiento cambiado: es un render nuevo, no un recorte.
  typeMotion(EDITED)
  await waitFor(() => motionField()?.value === EDITED && panelButton(REGENERATE) && !panelButton(TRIM(5)), 'cambiar el movimiento deja «Regenerar avatar» (un render nuevo) en vez de recortar')
  check(costLine(costOf('photo_avatar', 'avatar_iv', 22, 27)), 'con el costo de 5 s: ' + usd(costOf('photo_avatar', 'avatar_iv', 22, 27)))
  await openConfirmation(REGENERATE, 'más corta con otro movimiento')
  check(dialogDescription().includes(t('library.editor.avatar.confirmarDuracion', { seconds: 5, current: '7,4' })) && coversNothing(), 'la confirmación dice la duración y, al achicar, no tapa nada (ni «' + COVERS(0) + '»): ' + dialogDescription())
  const shorterRenderJob = await confirmOpen(CONFIRM, 'más corta con otro movimiento')
  check(JSON.stringify(shorterRenderJob.payload) === JSON.stringify({ projectId: 'fixture', sceneIds: [4], motion: [{ sceneId: 4, motionPrompt: EDITED, expressive: false }], durations: [{ sceneId: 4, seconds: 5 }] }), 'viaja el movimiento y la duración: ' + JSON.stringify(shorterRenderJob.payload))
  shorterRenderJob.onEvent({ type: 'job-failed', code: 'cancelled', message: 'cancelled' })
  await waitFor(() => idle(), 'liberado')

  // El borrador de la duración es de la escena: no pasa a otra y se descarta.
  await select(2)
  await waitFor(() => durationValue() === VALUE(10) && durationGroup(), 'la 2, con su propia duración')
  await select(4)
  await waitFor(() => durationValue() === VALUE(7) && durationText(NOW('7,4')) && motionField()?.value === AUTO_4, 'al volver a la 4, los borradores de la duración y del movimiento ya no están')

  // La 2, planeada: más corta es siempre un render nuevo (no hay clip que
  // recortar), con «Generar avatar».
  await select(2)
  await waitFor(() => panelButton(GENERATE) && durationGroup(), 'la 2, planeada')
  const IV_2 = (seconds) => costOf('photo_avatar', 'avatar_iv', 4, 4 + seconds)
  await clickTimes(lessButton, 2)
  await waitFor(() => durationValue() === VALUE(8), '8 s')
  check(panelButton(GENERATE) && !panelButton(TRIM(8)) && costLine(IV_2(8)), 'una planeada no recorta: «Generar avatar» con el costo de 8 s')
  await openConfirmation(GENERATE, 'una planeada más corta')
  check(dialogDescription().includes(t('library.editor.avatar.confirmarDuracion', { seconds: 8, current: '10' })) && coversNothing(), 'la confirmación dice la duración y, al achicar, no tapa nada: ' + dialogDescription())
  const plannedJob = await confirmOpen(CONFIRM, 'una planeada más corta')
  check(JSON.stringify(plannedJob.payload) === JSON.stringify({ projectId: 'fixture', sceneIds: [2], durations: [{ sceneId: 2, seconds: 8 }] }), 'viaja la duración elegida: ' + JSON.stringify(plannedJob.payload))
  plannedJob.onEvent({ type: 'job-failed', code: 'cancelled', message: 'cancelled' })
  await waitFor(() => idle(), 'liberado')

  // «Regenerar todos (2)» con la duración de la elegida: solo ella lleva la suya.
  const FAILED_10 = view({ status: 'failed', clipPath: undefined, clipMtimeMs: undefined, errorCode: 'avatar_timeout' })
  await loadScenes(GAP_SCENES().map((item) => (item.id === 10 ? { ...item, avatar: FAILED_10 } : item)))
  await select(4)
  await select(2)
  await waitFor(() => panelButton(ALL(2)) && durationValue() === VALUE(10), '«Regenerar todos (2)» con la 2 y la 10 pendientes')
  await clickTimes(lessButton, 2)
  await waitFor(() => durationValue() === VALUE(8), '8 s en la 2')
  panelButton(ALL(2)).click()
  await waitFor(() => dialog()?.textContent.includes(BALANCE_5), 'la confirmación de las dos')
  check(dialogDescription().includes(t('library.editor.avatar.confirmarTexto', { count: 2, amount: usd(IV_2(8) + costOf('photo_avatar', 'avatar_iii', 72, 82)) })), 'el costo suma la 2 con 8 s y la 10 con su tramo: ' + dialogDescription())
  const allJobs = window.avatarJobs.length
  dialogButton(CONFIRM).click()
  await waitFor(() => window.avatarJobs.length === allJobs + 1, 'pide las dos')
  check(JSON.stringify(window.avatarJobs.at(-1).payload) === JSON.stringify({ projectId: 'fixture', sceneIds: [2, 10], durations: [{ sceneId: 2, seconds: 8 }] }), 'solo la elegida lleva su duración: ' + JSON.stringify(window.avatarJobs.at(-1).payload))
  window.avatarJobs.at(-1).onEvent({ type: 'job-failed', code: 'cancelled', message: 'cancelled' })
  await waitFor(() => idle(), 'liberado')

  // R-2g-20 en «Regenerar todos»: las V desactualizadas que traían «más
  // expresivo» guardado lo conservan. La 4, que no es la elegida y no cambió
  // nada, no lleva entrada en «motion» (si la llevara con la marca apagada, la
  // huella de su pedido cambiaría y un recibo vivo o pago no se cosecharía); la
  // 8, la elegida, lleva su prompt editado con «más expresivo» como estaba.
  const STALE_V = { ...avatars2e[5], stale: true }
  await loadScenes(GAP_SCENES().map((item) => (item.id === 4 || item.id === 8 ? { ...item, avatar: STALE_V } : item)))
  await select(4)
  await select(8)
  await waitFor(() => panelButton(ALL(3)) && motionField()?.value === USER_5, '«Regenerar todos (3)» con la 2 (planeada) y las dos V desactualizadas, la 4 y la 8')
  typeMotion(EDITED)
  await waitFor(() => motionField()?.value === EDITED, 'el movimiento editado de la 8')
  panelButton(ALL(3)).click()
  await waitFor(() => dialog()?.textContent.includes(BALANCE_5), 'la confirmación de las tres')
  const batchJobs = window.avatarJobs.length
  dialogButton(CONFIRM).click()
  await waitFor(() => window.avatarJobs.length === batchJobs + 1, 'pide la 2, la 4 y la 8')
  check(JSON.stringify(window.avatarJobs.at(-1).payload) === JSON.stringify({ projectId: 'fixture', sceneIds: [2, 4, 8], motion: [{ sceneId: 8, motionPrompt: EDITED, expressive: true }] }), 'las dos V conservan «más expresivo»: la 4 sin entrada y la 8 con su prompt editado y la marca como estaba: ' + JSON.stringify(window.avatarJobs.at(-1).payload))
  window.avatarJobs.at(-1).onEvent({ type: 'job-failed', code: 'cancelled', message: 'cancelled' })
  await waitFor(() => idle(), 'liberado')

  // La 8, V con un gemelo digital: sin «Movimiento más expresivo» (solo IV con
  // un look de foto lo tiene), aunque traiga «más expresivo» guardado de la 2e;
  // al regenerarla sin cambios el pedido no lleva «motion» y la marca guardada
  // queda (R-2g-20). Y recorta como las demás.
  await loadScenes(GAP_SCENES())
  await select(2)
  await select(8)
  await waitFor(() => motionField()?.value === USER_5 && durationValue() === VALUE(10), 'la 8, V con su prompt y su duración')
  check(!expressiveSwitch() && !motionButton(t('library.editor.avatar.expresivoAyudaAria')) && useAutomatic(), 'V no tiene el interruptor, tiene su prompt y «Usar el automático»')
  const vRetakeJob = await confirmRequest(REGENERATE, RETAKE, 'regenerar una V con «más expresivo» guardado')
  check(JSON.stringify(vRetakeJob.payload) === JSON.stringify({ projectId: 'fixture', sceneIds: [8], regenerateSceneIds: [8] }), 'sin «motion»: conserva «más expresivo» y su prompt guardados (R-2g-20): ' + JSON.stringify(vRetakeJob.payload))
  vRetakeJob.onEvent({ type: 'job-failed', code: 'cancelled', message: 'cancelled' })
  await waitFor(() => idle(), 'liberado')
  await clickTimes(lessButton, 3)
  await waitFor(() => durationValue() === VALUE(7) && panelButton(TRIM(7)), 'V más corta, sin tocar el movimiento: «Recortar a 7 s»')
  // Con la tecla Enter sostenida de verdad (ronda 1, m1): la primera pulsación
  // recorta; al terminar, la escena queda en 7 s y el mismo botón pasa a
  // «Regenerar avatar» con el foco puesto. Las repeticiones que llegan ya con
  // la etiqueta nueva se ignoran (ignoreHeldKey, en el botón principal): si no,
  // un Enter que se alarga abriría la confirmación de un render pago.
  window.trimResult = { sceneId: 8, startSeconds: 50, endSeconds: 57 }
  window.detail = { ...window.detail, scenes: window.detail.scenes.map((item) => (item.id === 8 ? { ...item, endSeconds: 57 } : item.id === 9 ? { ...item, startSeconds: 57 } : item)) }
  const balanceCallsBeforeHeldTrim = window.balanceCalls
  const jobsBeforeHeldTrim = window.avatarJobs.length
  window.heldOn.clear()
  panelButton(TRIM(7)).focus()
  await press(ENTER_HELD)
  await waitFor(() => window.trimCalls.length === 3 && JSON.stringify(window.trimCalls[2]) === JSON.stringify({ projectId: 'fixture', sceneId: 8, seconds: 7 }), 'recorta la 8: ' + JSON.stringify(window.trimCalls[2]))
  await waitFor(() => durationText(NOW('7')) && panelButton(REGENERATE) && !panelButton(TRIM(7)), 'terminó: la 8 dura 7 s y el botón dice «Regenerar avatar»')
  const heldOnRegenerate = window.heldOn.get(REGENERATE)
  check(heldOnRegenerate?.repeats > 0, 'parte de las repeticiones del Enter cayeron en el botón ya con la etiqueta «Regenerar avatar»: ' + JSON.stringify([...window.heldOn]))
  check([...window.heldOn.values()].every((seen) => seen.ignored === seen.repeats), 'el botón principal ignora cada repetición, con la etiqueta de recortar y con la de regenerar: ' + JSON.stringify([...window.heldOn]))
  check(window.trimCalls.length === 3 && !dialog() && window.balanceCalls === balanceCallsBeforeHeldTrim && window.avatarJobs.length === jobsBeforeHeldTrim, 'un Enter sostenido recorta una sola vez: ni otro recorte ni la confirmación de «Regenerar avatar» (no pidió el saldo ni el render)')
  check(document.activeElement === panelButton(REGENERATE), 'y el foco sigue en el botón: ' + document.activeElement?.tagName)

  // La 10, III: sin movimiento. Hasta el fin del audio (la 11 termina a 96 s:
  // 24 s desde su inicio).
  await select(10)
  await waitFor(() => durationValue() === VALUE(10) && !motionGroup(), 'la 10, III: duración y sin sección de movimiento')
  await clickTimes(moreButton, 20)
  await waitFor(() => durationValue() === VALUE(24) && stepButtonOff(moreButton()), 'el máximo de la 10 es el fin del audio: 24 s')
  check(durationText(t('library.editor.avatar.duracionLimite', { min: 5, max: 24 })), 'con su aviso de límite')
  await openConfirmation(REGENERATE, 'III más larga')
  check(dialogDescription().includes(t('library.editor.avatar.confirmarTexto', { count: 1, amount: usd(costOf('photo_avatar', 'avatar_iii', 72, 96)) })) && dialogDescription().includes(t('library.editor.avatar.duracionTapa', { count: 1 })), 'con el costo de 24 s a la tarifa de III y la escena de imagen que tapa: ' + dialogDescription())
  const iiiJob = await confirmOpen(CONFIRM, 'III más larga')
  check(JSON.stringify(iiiJob.payload) === JSON.stringify({ projectId: 'fixture', sceneIds: [10], durations: [{ sceneId: 10, seconds: 24 }] }), 'viaja solo la duración: ' + JSON.stringify(iiiJob.payload))
  iiiJob.onEvent({ type: 'job-failed', code: 'cancelled', message: 'cancelled' })
  await waitFor(() => idle(), 'liberado')

  // Una escena que dura 9,6 s arranca en 10 s (redondeado) y dice 9,6 s.
  await loadScenes(GAP_SCENES().map((item) => (item.id === 10 ? { ...item, endSeconds: 81.6 } : item.id === 11 ? { ...item, startSeconds: 81.6 } : item)))
  await select(10)
  await waitFor(() => durationValue() === VALUE(10) && durationText(NOW('9,6')), 'dura 9,6 s: el selector arranca en 10 s y debajo dice 9,6 s')
  check(panelButton(REGENERATE) && !panelButton(TRIM(10)), 'con el valor de arranque, la acción de siempre')

  // La última escena del video (R-2g-18): no se achica (lo que soltaría no
  // tendría una escena de imagen que lo tome) ni se alarga (termina en el fin
  // del audio). El selector queda quieto en lo que dura hoy y dice por qué, con
  // un texto que no es el de la vecina animada.
  await loadScenes(GAP_SCENES().filter((item) => item.id !== 11))
  await select(10)
  await waitFor(() => durationValue() === VALUE(10) && stepButtonOff(lessButton()) && stepButtonOff(moreButton()), 'si la 10 es lo último, el selector queda quieto en 10 s con los dos botones apagados')
  check(durationText(t('library.editor.avatar.duracionFinal')) && !durationText(t('library.editor.avatar.duracionBloqueada')) && !durationText(t('library.editor.avatar.duracionLimite', { min: 10, max: 10 })) && !durationText(t('library.editor.avatar.duracionLimite', { min: 5, max: 10 })), 'y dice que es el final del video (ni «la escena que sigue está animada» ni un aviso de límite)')
  check(panelButton(REGENERATE) && !panelButton(TRIM(10)) && costLine(costOf('photo_avatar', 'avatar_iii', 72, 82)), 'la acción es la de siempre, «Regenerar avatar», con el costo de lo que dura')
  moreButton().focus()
  await press('Enter')
  lessButton().focus()
  await press('Enter')
  check(durationValue() === VALUE(10) && document.activeElement === lessButton(), 'apretar un botón apagado no cambia nada y no suelta el foco: ' + document.activeElement?.tagName)
  // Con un tramo que no es de segundos enteros (9,6 s), el selector queda en lo
  // que dura redondeado y debajo dice lo que dura de verdad.
  await loadScenes(GAP_SCENES().filter((item) => item.id !== 11).map((item) => (item.id === 10 ? { ...item, endSeconds: 81.6 } : item)))
  await select(4)
  await select(10)
  await waitFor(() => durationValue() === VALUE(10) && durationText(NOW('9,6')) && stepButtonOff(lessButton()) && stepButtonOff(moreButton()), 'la última de 9,6 s: quieta en 10 s y dice que dura 9,6 s')
  check(durationText(t('library.editor.avatar.duracionFinal')), 'con el mismo texto del final del video')

  // La escena que sigue, animada: su duración no se puede cambiar. Con una
  // animación lista y con un recibo de animación pendiente.
  const ANIMATED = { id: 'a5', sceneIds: [5], provider: 'kie', status: 'ready', slotSeconds: 6 }
  await loadScenes(GAP_SCENES().map((item) => (item.id === 5 ? { ...item, animations: [ANIMATED] } : item)))
  await select(4)
  await waitFor(() => durationGroup() && durationText(t('library.editor.avatar.duracionBloqueada')), 'la 4 con la 5 animada: la duración no se puede cambiar')
  check(stepButtonOff(lessButton()) && stepButtonOff(moreButton()) && durationValue() === VALUE(10) && !durationText(t('library.editor.avatar.duracionLimite', { min: 10, max: 10 })) && !durationText(t('library.editor.avatar.duracionFinal')), 'los dos botones apagados en 10 s y solo el aviso de que está animada (no el del final del video)')
  check(panelButton(REGENERATE) && !panelButton(TRIM(10)), 'y la acción de siempre')
  lessButton().focus()
  await press('Enter')
  check(durationValue() === VALUE(10) && document.activeElement === lessButton(), 'apretar un botón apagado no cambia nada y no suelta el foco')
  await loadScenes(GAP_SCENES().map((item) => (item.id === 5 ? { ...item, animationPending: [{ ...ANIMATED, status: 'error' }] } : item)))
  await waitFor(() => durationGroup() && durationText(t('library.editor.avatar.duracionBloqueada')), 'un recibo de animación pendiente también la bloquea')
  await loadScenes(GAP_SCENES())

  // La demo: nada se genera ni se recorta.
  window.fixture.locked = true
  await select(2)
  await select(4)
  await waitFor(() => stepButtonOff(lessButton()) && stepButtonOff(moreButton()) && motionField()?.disabled, 'en la demo, la duración y el movimiento esperan')
  window.fixture.locked = false
  await waitFor(() => !stepButtonOff(lessButton()) && !stepButtonOff(moreButton()), 'y al salir de la demo, vuelven')
  await select(2)

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
  check(!percentIn(avatarBlock(2)) && !panelButton(CANCEL), 'en cola, sin porcentaje y sin «Cancelar» en el panel')
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
  // R-2g-20 en el aviso: una aparición de V que traía «más expresivo» guardado
  // y salió con la imagen fija porque su render venció (avatar_timeout: el
  // recibo queda y la interfaz promete no volver a cobrarlo) se pide con
  // «Regenerarlas» sin «motion», así el carril la cosecha en vez de pagar otro
  // render (I-2 de la revisión final; el aviso no tiene sección de movimiento).
  const V_FAILED = view({ engine: 'avatar_v', lookType: 'digital_twin', status: 'failed', clipPath: undefined, clipMtimeMs: undefined, errorCode: 'avatar_timeout', motionPrompt: USER_5, motionSource: 'user', expressive: true })
  await project({ 5: V_FAILED }, () => avatarBlock(5)?.title === failedTitle('avatar_timeout') && notice(1))
  const jobsBeforeVNotice = window.avatarJobs.length
  noticeButton(1).click()
  await waitFor(() => dialog()?.textContent.includes(t('library.editor.avatar.saldo', { balance: usd(5) })), 'la confirmación del aviso con la V')
  dialogButton(CONFIRM).click()
  await waitFor(() => window.avatarJobs.length === jobsBeforeVNotice + 1, 'el aviso pide la V')
  check(JSON.stringify(window.avatarJobs.at(-1).payload) === JSON.stringify({ projectId: 'fixture-view', sceneIds: [5] }), 'con V y «más expresivo» guardado, el aviso la pide como siempre, sin «motion»: ' + JSON.stringify(window.avatarJobs.at(-1).payload))
  window.avatarJobs.at(-1).onEvent({ type: 'job-failed', code: 'cancelled', message: 'cancelled' })
  await waitFor(() => !window.editor.editorTask.isProjectBusy('fixture-view'), 'liberado')
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
  await build({
    stdin: { contents: entry, resolveDir: resolve('.'), loader: 'jsx' },
    bundle: true,
    // El editor importa CSS y CSS Modules: esbuild escribe app.js y app.css.
    outfile: join(root, 'app.js'),
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
  await writeFile(
    join(root, 'index.html'),
    '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="./app.css"><div id="root"></div><pre id="result">RUNNING</pre><script type="module" src="./app.js"></script>',
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
