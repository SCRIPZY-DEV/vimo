// La fase `avatar` en la pantalla de progreso (ADR-0057, spec §8 y §6.1), con
// los componentes reales en Chrome headless: el reductor de los eventos
// `avatar-scene-*` (el tiempo corre entre consultas a HeyGen y se congela al
// terminar), la fila «Avatar» entre imágenes y ensamblado solo cuando la
// corrida tiene avatar (una fase saltada nunca queda en `completedStages`: un
// proyecto sin avatar no la culpa de un fallo), el panel «Avatar n/m» con la
// fase y el reloj de cada render, y la línea de la pausa de escenas que dice
// dónde sale el avatar. Además, el store real de Crear (`useCreateTask`) con
// los eventos del sidecar: la fase se enciende con `avatar-planned`, cada
// render queda en su escena, la pausa trae los tramos, un render anunciado que
// no llegó a cerrarse (saldo, clave o cancelación frenaron la corrida) no
// sigue «generando» cuando el job termina, y el reinicio no resucita relojes.
// Y la pantalla de progreso de la biblioteca de punta a punta (reanudar un
// proyecto desde disco, los eventos del job y lo que se ve): la fila y el panel
// solo con avatar, el fallo que se le atribuye a la fase correcta y la pausa
// por saldo de HeyGen. Y el aviso del final (entrega 2d): la pantalla de Crear
// que termina con apariciones sin generar dice cuántas salieron con la imagen
// fija del look (las que fallaron en la corrida y, sin eventos, las del disco
// fallidas o listas sin clip; nunca las desactualizadas), nunca mientras
// corre, ni con todas listas, ni en un error, ni sin avatar; el reproductor
// de la biblioteca dice lo mismo desde los datos del proyecto, solo con video
// y contando también una planeada (rondas 1 y 2 de WP-P); y la regla única
// (`isAvatarFallback`) en sus dos contextos, la fila que dice «Desactualizada»
// para una desactualizada en vez de «No se completó» y la API del aviso con
// su acción. Y la entrega 2e (diseño §21.5): el porcentaje simulado de cada
// aparición junto al tiempo de su fila (solo mientras se genera, un solo
// spinner, sin barra, el <time> intacto); la tarjeta propia del avatar en la
// grilla «Imágenes» de la pantalla completa (borde y fondo morados, ícono,
// estado con la regla de la fila, mismo número, tramo y tamaño que una
// imagen, también en un short, sin imagen ni «Ampliar»), con el conteo del
// título y el visor solo de imágenes; y el costo de reanudar con el motor del
// proyecto (`estimateResumeCost`: el de la escena, el de las opciones o el
// de siempre) y las opciones de corrida que lo llevan (`avatarRunOptions`).
// Y la entrega 2h (diseño §24.2): el avatar corre junto con las imágenes. El
// store lleva las fases en curso (`activeStages`, en orden de arranque; cada
// una sale al terminar, en cualquier orden; vacías al cerrar el job y al
// reiniciar la app), el arranque del avatar no borra la pasada de
// recuperación de las imágenes ni el de otra fase la vigilancia de prompts;
// la lista de fases hace girar las dos filas (también reescribiendo prompts);
// mientras corren las imágenes la pantalla muestra la grilla, con el
// porcentaje en la tarjeta de la aparición que arrancó y «En espera» en la
// que no, sin el panel del avatar, que aparece cuando las imágenes terminan
// (su reloj y su ayuda, solo con el avatar en curso); en Crear y en la
// biblioteca, con los dos órdenes de terminación.
// Solo `videosApi` se simula (el real importa el cliente
// de Supabase), con las URLs de las miniaturas, la lectura del proyecto y el
// canal de eventos del job; la tarjeta de saldo se reemplaza (su hook lee la
// billetera de HeyGen del sidecar). La raíz guarda `onUncaughtError`.
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
const root = await mkdtemp(join(tmpdir(), 'vimo-avatar-progress-ui-'))
const mocks = {
  // El job simulado entrega sus eventos por `window.emitPipelineEvent`. Antes
  // de que el store lea el almacenamiento (restoreTask corre al importarlo,
  // después de sus imports), este módulo deja guardada una tarea de un
  // arranque anterior con un render «generando»: el reinicio no puede
  // resucitar su reloj.
  '@/modules/videos/api': [
    "import { CREATE_TASK_STORAGE_KEY } from './src/modules/videos/constants.ts'",
    "import { videosApi as real } from './src/modules/videos/api/index.ts'",
    'const look = { lookId: "look-ana", lookName: "Ana oficina", lookType: "photo_avatar", engine: "avatar_iii", origin: "auto", status: "planned" }',
    // La app se cerró con las imágenes y el avatar corriendo a la vez (entrega
    // 2h): la tarea vuelve interrumpida y sin fases en curso.
    'const previous = { id: "tc-previous", jobId: "job-p0", projectId: "p0", projectName: "Anterior", status: "generating", activeStages: ["images", "avatar"], completedStages: ["voice"], scenes: [{ id: 1, text: "", imageStatus: "ok", avatar: look, avatarActivity: { status: "generating", phase: "render", elapsedSeconds: 40, receivedAt: 1 } }], audioDurationSeconds: 150, voiceProgress: null, bgmProgress: null, renderProgress: null, promptsWritten: null, imagesRecovery: null, confirmation: null, logs: [], videoPath: null, errorKey: null, errorCode: null, startedAt: 1, pausedAt: null, pausedMs: 0, finishedAt: null, retry: null, retryAttempts: 0, videoFormat: "16:9", cancelRequested: false, usesCustomStyle: false, promptModel: null, promptsStageActivity: null, promptModelIssue: null, promptModelSwitch: null, imageProvider: null, voiceVendor: null, creditsIssue: null, hasAvatar: true, avatarDropped: 2 }',
    'try { localStorage.setItem(CREATE_TASK_STORAGE_KEY, JSON.stringify(previous)) } catch {}',
    'export const videosApi = {',
    '  ...real,',
    '  isNative: () => true,',
    '  async projectStatus(projectId) { return window.projectStatuses[projectId] },',
    '  async projectDetail(projectId) { return window.projectDetails[projectId] },',
    '  async listProjects() { return [] },',
    '  imageSource: (path) => { window.imageSourceCalls = window.imageSourceCalls ?? {}; window.imageSourceCalls[path] = (window.imageSourceCalls[path] ?? 0) + 1; return "fixture-image://" + path },',
    '  videoSource: (path) => "fixture-media://" + path,',
    '  async createProject() { return { projectId: "pc" + (window.createdProjects = (window.createdProjects ?? 0) + 1) } },',
    '  async startPipeline(payload, onEvent) { window.emitPipelineEvent = onEvent; return { jobId: "job-" + payload.projectId, stop() {} } },',
    '  async cancelJob() {},',
    '  async confirmScenes() {},',
    '  async setPromptModel() {},',
    '  previewSceneCuts: () => new Promise(() => {}),',
    '}',
  ].join('\n'),
  // El real arrastra el cliente de Supabase, que exige variables de entorno
  // al cargarse: una sesión vacía alcanza (ninguna llamada va a vimo.click).
  '@/modules/common/supabase/client':
    'export const supabase = { auth: { getSession: async () => ({ data: { session: null } }) } }',
  // El editor solo se monta en su borrador (sin escenas): la copia de trabajo
  // y el audio son del fixture.
  '@/modules/videos/hooks/useLibraryEditor':
    'export function useLibraryEditor() { return window.editorFixture }',
  '@/modules/videos/hooks/useProjectAudio':
    'export function useProjectAudio() { return { audioBusy: false } }',
  // Su hook lee la billetera de HeyGen del sidecar: acá solo importa que la
  // pantalla lo elija (y ofrezca seguir en el editor) ante un saldo agotado.
  '@/modules/videos/components/InsufficientCreditsCard':
    'import React from "react"\nexport function InsufficientCreditsCard(props) { return React.createElement("div", { "data-credits-card": props.context.domain }, props.message, props.onContinueInEditor ? " [editor]" : "") }',
}
const entry = String.raw`
import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Routes, Route } from 'react-router'
import es from './public/locales/es.json'
import { AvatarFallbackNote } from '@/modules/videos/components/AvatarFallbackNote'
import { ConfirmScenesDialog } from '@/modules/videos/components/ConfirmScenesDialog'
import { GenerationProgress } from '@/modules/videos/components/GenerationProgress'
import { avatarFallbackCount, isAvatarFallback } from '@/modules/videos/utilities/avatarFallback'
import { PipelineAvatarPanel } from '@/modules/videos/components/PipelineAvatarPanel'
import { SecondsPerSceneStep } from '@/modules/videos/components/SecondsPerSceneStep'
import { StageBar } from '@/modules/videos/components/StageBar'
import { useCreateTask } from '@/modules/videos/hooks/useCreateTask'
import { Toaster } from '@/modules/common/ui/toaster'
import { formatUsd } from '@/modules/common/utilities/formatUsd'
import { avatarSpansCostEstimate } from '@/modules/videos/utilities/avatarCostEstimate'
import { avatarSpansLabel } from '@/modules/videos/utilities/avatarSpansLabel'
import { avatarElapsedSeconds, avatarRowStatus, scenesWithAvatarEvent, scenesWithAvatarRunEnded, taskHasAvatar } from '@/modules/videos/utilities/avatarTaskEvents'
import { dominantAvatarFailure, failedStageOf, failureMessageOf } from '@/modules/videos/utilities/failedStage'
import { errorKeyOf } from '@/modules/videos/utilities/errorKeyOf'
import { estimateSceneCount } from '@/modules/videos/utilities/estimateSceneCount'
import { secondsStepSceneEstimate } from '@/modules/videos/utilities/secondsStepSceneEstimate'
import { countStepSceneEstimate } from '@/modules/videos/utilities/countStepSceneEstimate'
import { planPrefixSceneWindows } from '@pipeline/animation/prefix-scenes.ts'
import { animationRangeEnd } from '@pipeline/animation/scope.ts'
import { countScenesAroundSpans } from '@pipeline/stages/scene-cuts/pins.ts'
import { CREATE_ERROR_MESSAGE_KEYS, UNKNOWN_CREATE_ERROR_KEY } from '@/modules/videos/constants'
import { LibraryProgress } from '@/modules/videos/views/LibraryProgress/LibraryProgress'
import { LibraryPlayer } from '@/modules/videos/views/LibraryPlayer/LibraryPlayer'
import { LibraryEditor } from '@/modules/videos/views/LibraryEditor/LibraryEditor'
import { TooltipProvider } from '@/modules/common/ui/tooltip'
import { avatarRunOptions } from '@/modules/videos/utilities/avatarRunOptions'
import { formatSecondsShort } from '@/modules/videos/utilities/formatElapsed'
import { estimateResumeCost } from '@/modules/videos/utilities/estimateResumeCost'
import { formatSceneSeconds } from '@/modules/videos/utilities/formatSceneSeconds'
import { isPromptStageWatched } from '@/modules/videos/utilities/promptStageWatch'

let checks = 0
let renderError
const check = (condition, message) => { if (!condition) throw new Error(message); checks += 1 }
const delay = (ms = 30) => new Promise((done) => setTimeout(done, ms))
async function waitFor(get, message) {
  for (let index = 0; index < 100; index++) { if (renderError) throw renderError; const value = get(); if (value) return value; await delay() }
  throw new Error(message + ' (en pantalla: ' + text().slice(0, 300) + ')')
}
await i18n.init({ lng: 'es', resources: { es: { translation: es } }, interpolation: { escapeValue: false } })
const reactRoot = createRoot(document.getElementById('root'), { onUncaughtError: (error) => { renderError = error } })
let revision = 0
const render = (node) => reactRoot.render(<I18nextProvider key={++revision} i18n={i18n}>{node}</I18nextProvider>)
const text = () => document.getElementById('root').textContent
const rows = () => [...document.querySelectorAll('li')]
const planned = { lookId: 'look-ana', lookName: 'Ana oficina', lookType: 'photo_avatar', engine: 'avatar_iii', origin: 'auto', status: 'planned' }
const avatarScene = (id, startSeconds, extra = {}) => ({ id, text: '', imageStatus: 'ok', imagePath: '/p/scenes/scene_' + id + '.jpg', startSeconds, endSeconds: startSeconds + 10, avatar: planned, ...extra })
const BEFORE_AVATAR = ['voice', 'transcription', 'scene-cuts', 'scene-prompts', 'images']
try {
  // 1. El reductor de los eventos de la fase.
  const base = [avatarScene(1, 0), avatarScene(2, 60), avatarScene(3, 120)]
  let scenes = scenesWithAvatarEvent(base, { type: 'avatar-scene-started', sceneId: 1 }, 1000)
  check(scenes[0].avatarActivity?.status === 'generating' && scenes[0].avatarActivity.elapsedSeconds === 0 && scenes[1].avatarActivity === undefined, 'started marca solo esa escena')
  scenes = scenesWithAvatarEvent(scenes, { type: 'avatar-scene-progress', sceneId: 1, phase: 'render', elapsedSeconds: 40 }, 41000)
  check(scenes[0].avatarActivity.phase === 'render' && avatarElapsedSeconds(scenes[0].avatarActivity, 47000) === 46, 'el tiempo corre entre consultas a HeyGen: 40 s + 6 s')
  const readyView = { ...planned, status: 'ready', clipPath: '/p/avatar/scene_1.mp4', clipMtimeMs: 5 }
  scenes = scenesWithAvatarEvent(scenes, { type: 'avatar-scene-ready', sceneId: 1, scene: { ...base[0], avatar: readyView } }, 50000)
  check(scenes[0].avatar.status === 'ready' && scenes[0].avatarActivity.status === 'ready' && scenes[0].avatarActivity.elapsedSeconds === 49 && avatarElapsedSeconds(scenes[0].avatarActivity, 90000) === 49, 'lista: trae su vista nueva y el tiempo queda fijo en 49 s')
  scenes = scenesWithAvatarEvent(scenes, { type: 'avatar-scene-started', sceneId: 2 }, 50000)
  scenes = scenesWithAvatarEvent(scenes, { type: 'avatar-scene-failed', sceneId: 2, code: 'avatar_moderation_rejected' }, 62000)
  check(scenes[1].avatarActivity.status === 'failed' && scenes[1].avatarActivity.code === 'avatar_moderation_rejected' && scenes[1].avatarActivity.elapsedSeconds === 12, 'fallida con su código y su tiempo')
  // El sidecar vuelve a contar desde 0 entre pasadas (la cosecha de un pedido
  // viejo y después el pedido nuevo): el reloj sigue de lo último que dijo.
  let rerun = scenesWithAvatarEvent(base, { type: 'avatar-scene-started', sceneId: 3 }, 0)
  rerun = scenesWithAvatarEvent(rerun, { type: 'avatar-scene-progress', sceneId: 3, phase: 'render', elapsedSeconds: 90 }, 90000)
  rerun = scenesWithAvatarEvent(rerun, { type: 'avatar-scene-progress', sceneId: 3, phase: 'audio', elapsedSeconds: 0 }, 91000)
  check(rerun[2].avatarActivity.phase === 'audio' && avatarElapsedSeconds(rerun[2].avatarActivity, 94000) === 3, 'una pasada nueva vuelve a 0 y el reloj sigue desde ahí')

  // El job terminó (éxito, fallo, pausa): el render anunciado que nunca se
  // cerró deja de «generar»; los cerrados conservan su fila y su tiempo.
  const open = scenesWithAvatarEvent(scenes, { type: 'avatar-scene-started', sceneId: 3 }, 63000)
  const ended = scenesWithAvatarRunEnded(open)
  check(open[2].avatarActivity.status === 'generating' && ended[2].avatarActivity === undefined && avatarRowStatus(ended[2]) === 'queued', 'al terminar el job, el render anunciado que no se cerró vuelve a esperar')
  check(ended[0].avatarActivity === open[0].avatarActivity && ended[1].avatarActivity === open[1].avatarActivity && ended[0].avatar.status === 'ready', 'la lista y la fallida conservan su actividad')
  check(scenesWithAvatarRunEnded(ended) === ended, 'sin renders abiertos no cambia nada (misma lista)')

  // 2. La fase por datos (hoja R13).
  const done = [...BEFORE_AVATAR, 'animation']
  check(failedStageOf(done, { hasAnimation: true, hasAvatar: false }) === 'render', 'un proyecto sin avatar reanudado desde disco no culpa a la fase avatar')
  check(failedStageOf(done, { hasAnimation: true, hasAvatar: true }) === 'avatar', 'con avatar, la fase sin completar es la suya')
  check(!taskHasAvatar({ activeStages: [], scenes: [{ id: 1, text: '', imageStatus: 'ok' }] }) && !taskHasAvatar({ activeStages: ['images'], scenes: [] }) && taskHasAvatar({ hasAvatar: true, activeStages: [], scenes: [] }) && taskHasAvatar({ activeStages: ['avatar'], scenes: [] }) && taskHasAvatar({ activeStages: ['images', 'avatar'], scenes: [] }) && taskHasAvatar({ activeStages: [], scenes: base }), 'avatar por datos: pedido, en curso (sola o junto con las imágenes) o con escenas de avatar')

  // 3. La fila de la fase.
  render(<StageBar activeStages={['avatar']} showAnimation={false} showAvatar completedStages={BEFORE_AVATAR} paused={false} recovery={null} promptModelStalled={false} />)
  await waitFor(() => rows().length === 7, 'siete fases con la del avatar')
  // La fase pendiente lleva un punto delante («·Ensamblando video»).
  const labels = rows().map((row) => row.textContent)
  check(labels[4] === i18n.t('create.stages.images') && labels[5] === i18n.t('create.stages.avatar') && labels[6].endsWith(i18n.t('create.stages.render')), 'la fila del avatar va entre imágenes y ensamblado: ' + labels.join(' | '))
  check(rows()[5].className.includes('border-amethyst/60'), 'la fase del avatar en curso va en morado')
  // Con animación también: el avatar va antes (la animación respeta sus tramos).
  render(<StageBar activeStages={['animation']} showAnimation showAvatar completedStages={[...BEFORE_AVATAR, 'avatar']} paused={false} recovery={null} promptModelStalled={false} />)
  await waitFor(() => rows().length === 8, 'ocho fases con avatar y animación')
  const allLabels = rows().map((row) => row.textContent)
  check(allLabels[5].endsWith(i18n.t('create.stages.avatar')) && allLabels[6].endsWith(i18n.t('create.stages.animation')) && allLabels[7].endsWith(i18n.t('create.stages.render')) && rows()[6].className.includes('border-sky/60'), 'el avatar va antes de la animación y la animación conserva su celeste')
  render(<StageBar activeStages={['render']} showAnimation={false} showAvatar={false} completedStages={BEFORE_AVATAR} paused={false} recovery={null} promptModelStalled={false} />)
  await waitFor(() => rows().length === 6, 'sin avatar, seis fases')
  check(!rows().some((row) => row.textContent.includes(i18n.t('create.stages.avatar'))), 'sin avatar no hay fila del avatar')

  // 4. El panel «Avatar n/m».
  const now = Date.now()
  const panelScenes = [
    avatarScene(1, 0, { avatar: readyView, avatarActivity: { status: 'ready', phase: 'normalize', elapsedSeconds: 49, receivedAt: now - 30000 } }),
    { id: 2, text: 'una imagen', imageStatus: 'ok', startSeconds: 10, endSeconds: 60 },
    avatarScene(3, 60, { avatarActivity: { status: 'generating', phase: 'render', elapsedSeconds: 40, receivedAt: now - 5000 } }),
    avatarScene(4, 120, { avatarActivity: { status: 'failed', phase: 'render', elapsedSeconds: 12, receivedAt: now, code: 'avatar_moderation_rejected' } }),
    avatarScene(5, 180),
  ]
  render(<PipelineAvatarPanel scenes={panelScenes} dropped={1} active />)
  await waitFor(() => rows().length === 4, 'una fila por aparición')
  check(text().includes(i18n.t('create.progress.avatarCount', { ready: 1, total: 4 })), '1 de 4 apariciones listas')
  check(rows().every((row, index) => row.textContent.includes(i18n.t('create.progress.avatarItem', { index: index + 1, total: 4 }))), 'Avatar 1/4 … 4/4 en orden')
  check(rows()[1].textContent.includes(i18n.t('create.progress.avatarPhase.render')) && rows()[0].textContent.includes(i18n.t('create.progress.avatarReady')) && rows()[3].textContent.includes(i18n.t('create.progress.avatarQueued')), 'la fase del render en curso, la lista y la que espera')
  // El código de HeyGen tiene su texto (lo mapea la tarea 8) y la fila lo muestra.
  check(errorKeyOf('avatar_moderation_rejected') !== UNKNOWN_CREATE_ERROR_KEY && rows()[2].textContent.includes(i18n.t('create.progress.avatarFailed', { reason: i18n.t(errorKeyOf('avatar_moderation_rejected')) })), 'la fallida con el motivo de HeyGen')
  check(text().includes(i18n.t('create.progress.avatarDropped', { count: 1 })) && text().includes(i18n.t('create.progress.avatarHint')), 'la aparición que no entró y la ayuda de la espera')
  const timeOf = (row) => row.querySelector('time')?.textContent
  const before = timeOf(rows()[1])
  check(before === formatSecondsShort(45) && timeOf(rows()[0]) === formatSecondsShort(49) && rows()[3].querySelector('time') === null, 'tiempos: 45 s en curso, 49 s fijos, nada en la que espera')
  await delay(1300)
  check(timeOf(rows()[1]) !== before && timeOf(rows()[0]) === formatSecondsShort(49), 'el reloj del render en curso avanza solo y el de la lista no: ' + before + ' → ' + timeOf(rows()[1]))

  // 5. La línea de la pausa de escenas (spec §6.1).
  const spans = [{ startSeconds: 0, endSeconds: 11 }, { startSeconds: 62, endSeconds: 73 }, { startSeconds: 130, endSeconds: 139 }]
  render(<ConfirmScenesDialog open confirmation={{ suggestedScenes: 18, audioDurationSeconds: 150, wordCount: 320, avatarSpans: spans }} onConfirm={() => {}} onCancel={() => {}} />)
  const line = i18n.t('create.confirmScenes.avatarLine', { count: 3, ranges: avatarSpansLabel(spans, 'es') })
  await waitFor(() => text().includes(line), 'la pausa de escenas dice dónde sale el avatar')
  check(['0:00–0:11', '1:02–1:13', '2:10–2:19'].every((range) => line.includes(range)), 'los tres tramos en la línea: ' + line)
  // El costo real: los segundos de los tramos de la pausa (con la cola ya
  // absorbida) a la tarifa de Avatar III del look elegido, la misma cifra que
  // la tarjeta de Crear y la fase.
  const costLine = (lookType) => i18n.t('create.confirmScenes.avatarCost', { amount: formatUsd(avatarSpansCostEstimate(lookType, spans).estimated, 'es') })
  const costPrefix = i18n.t('create.confirmScenes.avatarCost', { amount: '' })
  const pauseWith = (extra) => <ConfirmScenesDialog open confirmation={{ suggestedScenes: 18, audioDurationSeconds: 150, wordCount: 320, avatarSpans: spans, ...extra }} onConfirm={() => {}} onCancel={() => {}} />
  render(pauseWith({ avatarLookType: 'photo_avatar' }))
  await waitFor(() => text().includes(costLine('photo_avatar')), 'el costo real de los tramos en la pausa')
  check(costLine('photo_avatar').includes('0,51'), '31 s de avatar a 0,99 US$ por minuto: ' + costLine('photo_avatar'))
  render(pauseWith({ avatarLookType: 'digital_twin' }))
  await waitFor(() => text().includes(costLine('digital_twin')) && !text().includes(costLine('photo_avatar')), 'el costo sigue la tarifa del tipo de look')
  checks += 1
  render(pauseWith({}))
  await waitFor(() => text().includes(line) && !text().includes(costPrefix), 'sin el tipo de look no hay costo que decir, pero sí los tramos')
  checks += 1
  // Con tramos y apariciones que no entraron: la línea suma cuántas.
  render(pauseWith({ avatarDropped: 1 }))
  await waitFor(() => text().includes(line) && text().includes(i18n.t('create.confirmScenes.avatarDropped', { count: 1 })), 'la pausa dice cuántas apariciones no entraron')
  checks += 1
  // Sin tramos (ninguna aparición entró): la pausa lo dice, con cuántas se
  // descartaron, ANTES de pagar las imágenes; la salida es cancelar.
  const noneFits = i18n.t('create.confirmScenes.avatarNoneFits', { count: 3 })
  render(pauseWith({ avatarSpans: [], avatarDropped: 3, avatarLookType: 'photo_avatar' }))
  await waitFor(() => text().includes(noneFits) && !text().includes(costPrefix), 'si ninguna aparición entró, la pausa lo dice con cuántas se descartaron')
  checks += 1
  check(!text().includes(i18n.t('create.confirmScenes.avatarLine', { count: 0, ranges: '' }).slice(0, 12)), 'sin tramos no hay línea de tramos ni costo')
  render(pauseWith({ avatarSpans: [] }))
  await waitFor(() => text().includes(i18n.t('create.confirmScenes.avatarNoneFitsUncounted')), 'sin la cifra de descartadas, el aviso igual sale')
  checks += 1
  // Sin avatar (sin tramos en la pausa, ni vacíos) la pausa no habla del
  // avatar. El render es asíncrono: se espera a que el diálogo anterior se
  // vaya antes de afirmar que no está.
  render(pauseWith({ avatarSpans: undefined }))
  const avatarLinePrefix = i18n.t('create.confirmScenes.avatarLine', { count: 0, ranges: '' }).slice(0, 12)
  const noneFitsPrefix = i18n.t('create.confirmScenes.avatarNoneFitsUncounted').slice(0, 20)
  await waitFor(() => !text().includes(avatarLinePrefix) && !text().includes(noneFitsPrefix) && text().includes(i18n.t('create.confirmScenes.confirm')), 'sin avatar la pausa no habla del avatar')
  checks += 1

  // 5b. El diálogo de CANTIDAD con avatar (spec §6.1): lo que deja el corte
  // con la cantidad tecleada (la misma cuenta que corta: countScenesAroundSpans
  // con el total del video, apariciones incluidas), cuántas llevan imagen y,
  // por debajo de la mínima, la cuenta acotada con el porqué.
  const countPins = [{ startSeconds: 10, endSeconds: 21 }, { startSeconds: 40, endSeconds: 50 }]
  const countPause = (extra) => <ConfirmScenesDialog open confirmation={{ suggestedScenes: 10, audioDurationSeconds: 60, wordCount: 100, avatarSpans: countPins, ...extra }} onConfirm={(choice) => { window.confirmedChoice = choice }} onCancel={() => {}} />
  render(countPause({}))
  await waitFor(() => text().includes(i18n.t('create.confirmScenes.estimatedScenes', { count: 10 })) && text().includes(i18n.t('create.confirmScenes.imagesToGenerate', { count: 8 })), 'el diálogo de cantidad con avatar dice el total y las imágenes a generar')
  checks += 1
  check(!text().includes(i18n.t('create.confirmScenes.avatarMinimum', { minimum: 5 })), 'con una cantidad posible no hay aviso de mínima')
  const countInput = document.getElementById('confirm-scene-count')
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(countInput, '3')
  countInput.dispatchEvent(new Event('input', { bubbles: true }))
  await waitFor(() => text().includes(i18n.t('create.confirmScenes.estimatedScenes', { count: 5 })) && text().includes(i18n.t('create.confirmScenes.imagesToGenerate', { count: 3 })) && text().includes(i18n.t('create.confirmScenes.avatarMinimum', { minimum: 5 })), 'por debajo de la mínima, la cuenta sale acotada con el porqué')
  checks += 1
  const prefixSpans = [{ startSeconds: 20, endSeconds: 30 }, { startSeconds: 50, endSeconds: 62 }]
  check(countStepSceneEstimate({ audioDurationSeconds: 60, avatarSpans: countPins }, 12).total === countScenesAroundSpans(60, countPins, { sceneCount: 12, prefixEndSeconds: 0 }) && countStepSceneEstimate({ audioDurationSeconds: 90, animationMinutes: 1, avatarSpans: prefixSpans }, 5).total === countScenesAroundSpans(90, prefixSpans, { sceneCount: 5, prefixEndSeconds: animationRangeEnd(1, 90) }) && countStepSceneEstimate({ audioDurationSeconds: 90, animationMinutes: 1, avatarSpans: prefixSpans }, 5).total > countScenesAroundSpans(90, prefixSpans, { sceneCount: 5, prefixEndSeconds: 0 }), 'la cuenta es la del corte por cantidad, también con el prefijo animado')
  check(countStepSceneEstimate({ audioDurationSeconds: 60 }, 10) === null && countStepSceneEstimate({ audioDurationSeconds: 60, avatarSpans: [] }, 10) === null, 'sin tramos no hay cuenta del avatar')
  render(countPause({ avatarSpans: undefined }))
  await waitFor(() => text().includes(i18n.t('create.confirmScenes.confirm')) && !text().includes('≈') && !text().includes(i18n.t('create.confirmScenes.imagesToGenerate', { count: 8 })), 'sin avatar el diálogo de cantidad queda como siempre')
  checks += 1

  // 6. El «≈ N escenas» del paso de segundos con avatar (spec §6.1): la misma
  // cuenta que el corte de la tarea 4 (sus casos de check-scene-pins: 14 y 20),
  // no la de todo el audio.
  const pins = [{ startSeconds: 10, endSeconds: 21 }, { startSeconds: 40, endSeconds: 50 }]
  check(secondsStepSceneEstimate({ audioDurationSeconds: 60, avatarSpans: pins }, 3) === 14, 'con avatar cuenta los pines y corta solo lo libre: 14')
  check(secondsStepSceneEstimate({ audioDurationSeconds: 90, animationMinutes: 1, avatarSpans: [{ startSeconds: 20, endSeconds: 30 }, { startSeconds: 50, endSeconds: 62 }] }, 5) === 20, 'con avatar y un minuto animado, el prefijo hasta su segundo del video: 20')
  check(secondsStepSceneEstimate({ audioDurationSeconds: 60, avatarSpans: [] }, 3) === estimateSceneCount(60, 3), 'sin avatar, la cuenta de siempre')
  check(secondsStepSceneEstimate({ audioDurationSeconds: 90, animationMinutes: 1 }, 5) === planPrefixSceneWindows({ totalSeconds: 90, minutes: 1, secondsPerScene: 5 }).length, 'sin avatar y con un minuto animado, la cuenta de siempre (las ventanas del prefijo)')
  // El paso real, con la vista previa exacta todavía sin contestar: la cifra
  // en pantalla es la cuenta local con avatar («≈ 14»), con sus tramos y su costo.
  const stepConfirmation = { suggestedScenes: 14, audioDurationSeconds: 60, wordCount: 100, secondsPerScene: 3, avatarSpans: pins, avatarLookType: 'photo_avatar' }
  const stepProvider = (confirmation) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SecondsPerSceneStep projectId="p1" confirmation={confirmation} onConfirm={() => {}} /></QueryClientProvider>
  render(stepProvider(stepConfirmation))
  const pinsLine = i18n.t('create.confirmScenes.avatarLine', { count: 2, ranges: avatarSpansLabel(pins, 'es') })
  await waitFor(() => text().includes('≈ 14') && text().includes(pinsLine), 'el paso de segundos cuenta alrededor del avatar')
  check(text().includes(i18n.t('create.confirmScenes.avatarCost', { amount: formatUsd(avatarSpansCostEstimate('photo_avatar', pins).estimated, 'es') })), 'el paso de segundos también dice lo que cuesta el avatar')
  render(stepProvider({ ...stepConfirmation, avatarSpans: undefined, avatarLookType: undefined }))
  await waitFor(() => text().includes('≈ ' + estimateSceneCount(60, 3)) && !text().includes(pinsLine), 'sin avatar, el paso cuenta como siempre')
  checks += 1

  // 7. El store de Crear con los eventos del sidecar.
  const probe = { task: undefined, api: undefined }
  function Probe() {
    const api = useCreateTask()
    probe.task = api.task
    probe.api = api
    return null
  }
  const emit = (event) => window.emitPipelineEvent(event)
  // El Toaster real de la app: los avisos pasajeros del store se ven.
  render(<><Probe /><Toaster /></>)
  await waitFor(() => probe.api, 'el store monta')
  // El reinicio no resucita el reloj de un render que murió con la app.
  check(probe.task?.scenes[0].avatarActivity === undefined && probe.task.hasAvatar === true && probe.task.avatarDropped === 2, 'una tarea guardada vuelve sin renders «generando» y conserva el avatar pedido')
  // Ni sus fases en curso (entrega 2h): las dos que corrían murieron con el job.
  check(probe.task.status === 'error' && probe.task.jobId === null && JSON.stringify(probe.task.activeStages) === '[]', 'una tarea que quedó con las imágenes y el avatar corriendo vuelve interrumpida y sin fases en curso: ' + JSON.stringify(probe.task.activeStages))

  await probe.api.startPipelineForProject('p1', 'Con avatar', { hasAvatar: true, seed: { scenes: base, completedStages: BEFORE_AVATAR, audioDurationSeconds: 150 } })
  await waitFor(() => probe.task?.projectId === 'p1' && probe.task.status === 'generating', 'el job arranca')
  check(probe.task.hasAvatar === true && probe.task.avatarDropped === undefined, 'el proyecto con avatar lo sabe desde el arranque')
  emit({ type: 'stage-started', stageId: 'avatar' })
  emit({ type: 'avatar-planned', sceneIds: [1, 2, 3], dropped: 2 })
  emit({ type: 'avatar-scene-started', sceneId: 1 })
  emit({ type: 'avatar-scene-progress', sceneId: 1, phase: 'render', elapsedSeconds: 30 })
  await waitFor(() => JSON.stringify(probe.task.activeStages) === '["avatar"]' && probe.task.scenes[0].avatarActivity?.phase === 'render', 'el render llega a su escena')
  check(probe.task.avatarDropped === 2 && probe.task.scenes[1].avatarActivity === undefined, 'avatar-planned cuenta las apariciones que no entraron y el render va solo a su escena')
  emit({ type: 'avatar-scene-ready', sceneId: 1, scene: { ...base[0], avatar: readyView } })
  emit({ type: 'avatar-scene-started', sceneId: 2 })
  emit({ type: 'avatar-scene-started', sceneId: 3 })
  emit({ type: 'avatar-scene-failed', sceneId: 3, code: 'avatar_moderation_rejected' })
  emit({ type: 'avatar-provider-trouble', code: 'avatar_provider_error', httpStatus: 503 })
  await waitFor(() => probe.task.scenes[2].avatarActivity?.status === 'failed', 'el cierre de cada render')
  check(probe.task.scenes[0].avatar.status === 'ready' && probe.task.scenes[0].avatarActivity.status === 'ready' && probe.task.scenes[1].avatarActivity.status === 'generating', 'lista con su vista nueva y la otra todavía generando')
  check(probe.task.logs.some((log) => log.includes('avatar_provider_error') && log.includes('503')), 'el problema de HeyGen queda en los logs internos')
  // Y se ve en un aviso pasajero, traducido, que no frena nada: uno a la vez.
  await waitFor(() => text().includes(i18n.t('create.progress.avatarTroubleTitle')) && text().includes(i18n.t('avatars.errors.providerError')), 'el problema de HeyGen se avisa traducido')
  checks += 1
  emit({ type: 'avatar-provider-trouble', code: 'avatar_network' })
  await waitFor(() => text().includes(i18n.t('avatars.errors.network')) && !text().includes(i18n.t('avatars.errors.providerError')), 'un aviso nuevo reemplaza al anterior: uno visible a la vez')
  checks += 1
  check(probe.task.status === 'generating' && probe.task.errorKey === null, 'un problema de HeyGen no frena el job por sí solo')

  // Sin saldo (el job se frena con una escena anunciada y sin cierre): pausa
  // por saldo del avatar, no un error genérico, y nada sigue «generando».
  emit({ type: 'job-failed', code: 'avatar_insufficient_credits', message: 'sin saldo' })
  await waitFor(() => probe.task.status === 'error', 'el job se frena')
  check(probe.task.creditsIssue?.domain === 'avatar' && probe.task.errorCode === 'avatar_insufficient_credits' && probe.task.retry === null, 'sin saldo en HeyGen es una pausa por saldo, sin reintento automático')
  check(probe.task.scenes[0].avatarActivity.status === 'ready' && probe.task.scenes[2].avatarActivity.status === 'failed' && probe.task.scenes[1].avatarActivity === undefined, 'al frenarse, la escena anunciada y sin cierre deja de generar y las cerradas se quedan')

  // La pausa de escenas trae los tramos del avatar y las descartadas, que el
  // corte anuncia ANTES de la pausa con avatar-planned.
  await probe.api.startPipelineForProject('p2', 'Pausa', { hasAvatar: true, avatarLookType: 'photo_avatar' })
  await waitFor(() => probe.task.projectId === 'p2' && probe.task.status === 'generating', 'segundo job')
  check(probe.task.hasAvatar === true && probe.task.scenes.length === 0, 'el avatar pedido manda aunque todavía no haya escenas que lo muestren')
  emit({ type: 'avatar-planned', sceneIds: [1, 6, 12], dropped: 1 })
  emit({ type: 'awaiting-scene-confirmation', suggestedScenes: 18, audioDurationSeconds: 150, wordCount: 320, avatarSpans: spans })
  emit({ type: 'job-completed', result: { status: 'awaiting-confirmation' } })
  await waitFor(() => probe.task.status === 'awaitingConfirmation', 'la pausa de escenas')
  check(JSON.stringify(probe.task.confirmation.avatarSpans) === JSON.stringify(spans), 'la confirmación guarda los tramos del avatar')
  check(probe.task.confirmation.avatarLookType === 'photo_avatar', 'y el tipo de look, para la tarifa del costo')
  check(probe.task.confirmation.avatarDropped === 1, 'y las descartadas que anunció avatar-planned antes de la pausa')
  // Un segundo anuncio pisa la cifra (no la suma) y llega también a la pausa abierta.
  emit({ type: 'avatar-planned', sceneIds: [1, 6, 12], dropped: 1 })
  await delay()
  check(probe.task.avatarDropped === 1 && probe.task.confirmation.avatarDropped === 1, 'repetir el anuncio no suma descartadas')
  emit({ type: 'avatar-planned', sceneIds: [1, 6], dropped: 2 })
  await waitFor(() => probe.task.confirmation.avatarDropped === 2, 'un anuncio nuevo con la pausa abierta la corrige')
  checks += 1
  await probe.api.startPipelineForProject('p3', 'Sin tramos', { hasAvatar: true })
  await waitFor(() => probe.task.projectId === 'p3' && probe.task.status === 'generating', 'tercer job')
  emit({ type: 'avatar-planned', sceneIds: [], dropped: 3 })
  emit({ type: 'awaiting-scene-confirmation', suggestedScenes: 18, audioDurationSeconds: 150, wordCount: 320, avatarSpans: [] })
  emit({ type: 'job-completed', result: { status: 'awaiting-confirmation' } })
  await waitFor(() => probe.task.status === 'awaitingConfirmation', 'la pausa sin tramos')
  check(JSON.stringify(probe.task.confirmation.avatarSpans) === '[]' && probe.task.confirmation.avatarDropped === 3, 'si ninguna aparición entró, la confirmación lo sabe: tramos vacíos y tres descartadas')
  await probe.api.startPipelineForProject('p4', 'Sin avatar', {})
  await waitFor(() => probe.task.projectId === 'p4' && probe.task.status === 'generating', 'cuarto job')
  emit({ type: 'awaiting-scene-confirmation', suggestedScenes: 18, audioDurationSeconds: 150, wordCount: 320 })
  emit({ type: 'job-completed', result: { status: 'awaiting-confirmation' } })
  await waitFor(() => probe.task.status === 'awaitingConfirmation', 'la pausa sin avatar')
  check(!('avatarSpans' in probe.task.confirmation) && !('avatarDropped' in probe.task.confirmation), 'sin avatar la confirmación queda como siempre')

  // Crear: el payload con avatar enciende la fase desde el arranque, y un job
  // que termina bien con un render que nunca se cerró tampoco deja relojes.
  const avatarOptions = { avatarId: 'a1', lookId: 'look-ana', lookName: 'Ana oficina', lookType: 'photo_avatar', engine: 'avatar_iii', appearances: 3, secondsPerAppearance: 10, startWithAvatar: true, placement: 'auto' }
  await probe.api.startCreation({ payload: { name: 'Nuevo con avatar', script: 'hola', options: { videoFormat: '16:9', imageProvider: 'fal', avatar: avatarOptions } } })
  await waitFor(() => probe.task.projectName === 'Nuevo con avatar' && probe.task.status === 'generating', 'la creación con avatar')
  check(probe.task.hasAvatar === true && probe.task.avatarLookType === 'photo_avatar', 'crear con avatar enciende la fase desde el arranque y recuerda el tipo de look')
  emit({ type: 'scenes-planned', scenes: base, audioDurationSeconds: 150 })
  emit({ type: 'avatar-scene-started', sceneId: 2 })
  await waitFor(() => probe.task.scenes[1]?.avatarActivity?.status === 'generating', 'un render abierto')
  emit({ type: 'job-completed', result: { status: 'completed', videoPath: '/v/video.mp4' } })
  await waitFor(() => probe.task.status === 'completed', 'el job termina')
  check(probe.task.scenes[1].avatarActivity === undefined, 'al terminar el job también se cierran los renders abiertos')
  await probe.api.startCreation({ payload: { name: 'Nuevo sin avatar', script: 'hola', options: { videoFormat: '16:9', imageProvider: 'fal' } } })
  await waitFor(() => probe.task.projectName === 'Nuevo sin avatar' && probe.task.status === 'generating', 'la creación sin avatar')
  check(probe.task.hasAvatar === false, 'crear sin avatar no enciende la fase')

  // 8. La pantalla de progreso de la biblioteca de punta a punta: reanudar un
  // proyecto desde disco, los eventos del job y lo que se ve.
  emit({ type: 'job-completed', result: { status: 'completed', videoPath: '/v/video.mp4' } })
  await waitFor(() => probe.task.status === 'completed', 'se libera el turno')
  const diskStatus = (name, avatar) => ({
    metadata: { name, state: 'generating', completedStages: BEFORE_AVATAR, audioDurationSeconds: 150, options: { videoFormat: '16:9', imageProvider: 'fal', ...(avatar ? { avatar: avatarOptions } : {}) } },
    scenes: avatar ? base : [{ id: 1, text: 'una imagen', imageStatus: 'ok', startSeconds: 0, endSeconds: 150 }],
  })
  // Un proyecto con avatar pedido que se cayó antes del corte: sin escenas que lo muestren.
  const beforeCut = diskStatus('Antes del corte', true)
  beforeCut.metadata.completedStages = ['voice']
  beforeCut.scenes = []
  window.projectStatuses = { pa: diskStatus('Con avatar', true), pb: diskStatus('Sin avatar', false), pc: beforeCut }
  const resumeFromLibrary = async (projectId) => {
    // El render es asíncrono: se espera el nombre del proyecto para no tocar el
    // botón de la pantalla anterior.
    const name = window.projectStatuses[projectId].metadata.name
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Probe />
        <MemoryRouter initialEntries={['/library/' + projectId + '/progress']}>
          <Routes><Route path="/library/:projectId/progress" element={<LibraryProgress />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await waitFor(() => text().includes(name), 'la pantalla de ' + name)
    const button = await waitFor(() => [...document.querySelectorAll('button')].find((candidate) => candidate.textContent.includes(i18n.t('common.resume'))), 'el botón de reanudar')
    button.click()
    await waitFor(() => probe.task?.projectId === projectId && probe.task.status === 'generating', 'reanuda ' + projectId)
  }
  const stageLabels = () => rows().map((row) => row.textContent).filter((label) => Object.keys(es.create.stages).some((key) => label.endsWith(es.create.stages[key])))

  await resumeFromLibrary('pa')
  check(probe.task.hasAvatar === true, 'reanudar desde disco lee el avatar de project.json')
  await waitFor(() => stageLabels().some((label) => label.endsWith(i18n.t('create.stages.avatar'))), 'la fila del avatar aparece desde el arranque')
  emit({ type: 'stage-started', stageId: 'avatar' })
  emit({ type: 'avatar-planned', sceneIds: [1, 2, 3], dropped: 1 })
  emit({ type: 'avatar-scene-started', sceneId: 1 })
  emit({ type: 'avatar-scene-progress', sceneId: 1, phase: 'render', elapsedSeconds: 20 })
  await waitFor(() => text().includes(i18n.t('create.progress.avatarItem', { index: 1, total: 3 })) && text().includes(i18n.t('create.progress.avatarPhase.render')), 'el panel del avatar en la pantalla de progreso')
  check(text().includes(i18n.t('create.progress.avatarDropped', { count: 1 })) && text().includes(i18n.t('create.progress.avatarHint')), 'el panel dice cuántas no entraron y que la espera es normal')
  check(text().includes(i18n.t('create.progress.avatarCount', { ready: 0, total: 3 })), 'el panel cuenta las apariciones de la biblioteca')
  emit({ type: 'job-failed', code: 'avatar_incomplete', message: 'quedaron apariciones' })
  await waitFor(() => probe.task.status === 'error', 'el fallo del avatar')
  await waitFor(() => text().includes(i18n.t('create.errors.continueInEditor')), 'un fallo del avatar ofrece seguir en el editor')
  check(!text().includes(i18n.t('create.progress.avatarPhase.render')), 'al frenarse el job, ningún render sigue «generando»')
  check(stageLabels().length === 7 && !text().includes(i18n.t('create.progress.error.retryRender')), 'el fallo se le atribuye a la fase del avatar, no al ensamblado')

  // Un proyecto sin avatar reanudado desde disco: ni fila, ni culpa.
  probe.api.discardTask()
  await waitFor(() => probe.task === null, 'se descarta la tarea')
  await resumeFromLibrary('pb')
  check(probe.task.hasAvatar === false && stageLabels().length === 6 && !stageLabels().some((label) => label.endsWith(i18n.t('create.stages.avatar'))), 'sin avatar, seis fases')
  emit({ type: 'stage-started', stageId: 'render' })
  emit({ type: 'job-failed', code: 'render_failed', message: 'ffmpeg' })
  await waitFor(() => probe.task.status === 'error', 'el fallo del ensamblado')
  await waitFor(() => text().includes(i18n.t('create.progress.error.retryRender')), 'el fallo cae en el ensamblado')
  check(!text().includes(i18n.t('create.errors.continueInEditor')), 'un proyecto sin avatar no culpa a la fase del avatar ni ofrece su rescate')

  // El avatar pedido manda sobre las escenas: antes del corte la fila ya está.
  probe.api.discardTask()
  await waitFor(() => probe.task === null, 'se descarta la tarea')
  await resumeFromLibrary('pc')
  await waitFor(() => stageLabels().length === 7, 'la fila del avatar desde el arranque, sin escenas todavía')
  check(probe.task.hasAvatar === true && probe.task.scenes.length === 0, 'el proyecto con avatar pedido muestra la fase antes del corte')
  emit({ type: 'job-failed', code: 'voice_failed', message: 'sin voz' })
  await waitFor(() => probe.task.status === 'error', 'el job se cae antes del corte')

  // Sin saldo en HeyGen: la tarjeta de saldo (misma UX que las demás pausas).
  probe.api.discardTask()
  await waitFor(() => probe.task === null, 'se descarta la tarea')
  await resumeFromLibrary('pa')
  emit({ type: 'stage-started', stageId: 'avatar' })
  emit({ type: 'job-failed', code: 'avatar_insufficient_credits', message: 'sin saldo' })
  await waitFor(() => document.querySelector('[data-credits-card="avatar"]'), 'la tarjeta de saldo del avatar')
  check(document.querySelector('[data-credits-card]').textContent.includes('[editor]'), 'la pausa por saldo del avatar también ofrece seguir en el editor')

  // 9. La cabecera de un avatar incompleto (spec §14): con rechazos
  // definitivos de HeyGen dominando, reanudar no lo arregla y el mensaje dice
  // la salida (el editor, o cambiar el look); con fallos pasajeros, «Reanudá».
  const failedScene = (id, code, fromDisk) => avatarScene(id, id * 20, fromDisk ? { avatar: { ...planned, status: 'failed', errorCode: code } } : { avatarActivity: { status: 'failed', phase: 'render', elapsedSeconds: 3, receivedAt: 1, code } })
  const incomplete = (scenes) => ({ errorCode: 'avatar_incomplete', errorKey: 'create.errors.avatarIncomplete', scenes })
  check(dominantAvatarFailure([failedScene(1, 'avatar_timeout'), failedScene(2, 'avatar_moderation_rejected', true), failedScene(3, 'avatar_moderation_rejected')]) === 'avatar_moderation_rejected' && dominantAvatarFailure([failedScene(1, 'avatar_timeout'), failedScene(2, 'avatar_network')]) === 'avatar_timeout' && dominantAvatarFailure([avatarScene(1, 0)]) === undefined, 'el código dominante: el que más se repite (en esta corrida o en disco), y con empate el primero')
  check(JSON.stringify(failureMessageOf(incomplete([failedScene(1, 'avatar_moderation_rejected'), failedScene(2, 'avatar_look_unsupported', true), failedScene(3, 'avatar_timeout')]))) === JSON.stringify({ key: 'create.errors.avatarRejected', count: 2 }), 'rechazos definitivos dominando: el mensaje de la salida, con cuántas apariciones')
  check(failureMessageOf(incomplete([failedScene(1, 'avatar_timeout'), failedScene(2, 'avatar_timeout'), failedScene(3, 'avatar_invalid_request')])).key === 'create.errors.avatarIncomplete', 'con fallos pasajeros dominando, sigue «Reanudá»')
  check(failureMessageOf({ errorCode: 'render_failed', errorKey: 'create.errors.renderFailed', scenes: [failedScene(1, 'avatar_moderation_rejected')] }).key === 'create.errors.renderFailed' && failureMessageOf({ errorCode: null, errorKey: null, scenes: [] }).key === UNKNOWN_CREATE_ERROR_KEY, 'otro código, o ninguno: el mensaje de siempre')
  // El código del render y del export sin clip ni vista previa del look.
  check(errorKeyOf('avatar_render_look_unavailable') === 'library.errors.avatarRenderLookUnavailable' && CREATE_ERROR_MESSAGE_KEYS.avatar_render_look_unavailable === 'create.errors.avatarRenderLookUnavailable' && i18n.exists('create.errors.avatarRenderLookUnavailable') && i18n.exists('library.errors.avatarRenderLookUnavailable'), 'avatar_render_look_unavailable tiene texto en Crear y en el editor')
  // De punta a punta: las tres apariciones de «Con avatar» rechazadas por
  // moderación y el job que termina en avatar_incomplete.
  probe.api.discardTask()
  await waitFor(() => probe.task === null, 'se descarta la tarea')
  await resumeFromLibrary('pa')
  emit({ type: 'stage-started', stageId: 'avatar' })
  for (const sceneId of [1, 2, 3]) {
    emit({ type: 'avatar-scene-started', sceneId })
    emit({ type: 'avatar-scene-failed', sceneId, code: 'avatar_moderation_rejected' })
  }
  emit({ type: 'job-failed', code: 'avatar_incomplete', message: 'rechazadas' })
  await waitFor(() => text().includes(i18n.t('create.errors.avatarRejected', { count: 3 })), 'la cabecera dice la salida de un rechazo definitivo')
  check(!text().includes(i18n.t('create.errors.avatarIncomplete')) && text().includes(i18n.t('create.errors.continueInEditor')), 'sin «Reanudá para completarlas» y con el editor a mano')

  // 10. Las apariciones que no entraron se dicen siempre (spec §5).
  // (a) Ninguna entró: el corte no dejó escenas de avatar, la fase se saltea y
  // el panel nunca aparece; la nota, debajo de las fases, sí (el estado
  // rearmado del disco trae las descartadas).
  const noneFit = diskStatus('Ninguna entró', true)
  noneFit.scenes = [{ id: 1, text: 'una imagen', imageStatus: 'ok', startSeconds: 0, endSeconds: 150 }]
  noneFit.avatarSpans = []
  noneFit.avatarDropped = 3
  window.projectStatuses.pd = noneFit
  probe.api.discardTask()
  await waitFor(() => probe.task === null, 'se descarta la tarea')
  await resumeFromLibrary('pd')
  await waitFor(() => text().includes(i18n.t('create.progress.avatarNoneFit', { count: 3 })), 'si ninguna aparición entró, el progreso lo dice aunque la fase se saltee')
  check(!text().includes(i18n.t('create.progress.avatarHint')) && probe.task.avatarDropped === 3, 'sin el panel del avatar, con las descartadas del disco')
  emit({ type: 'stage-skipped', stageId: 'avatar' })
  emit({ type: 'job-completed', result: { status: 'completed', videoPath: '/v/sin-avatar.mp4' } })
  await waitFor(() => probe.task.status === 'completed', 'el job termina')
  // (b) Algunas entraron: la nota antes de la fase, y el panel la reemplaza.
  probe.api.discardTask()
  await waitFor(() => probe.task === null, 'se descarta la tarea')
  await resumeFromLibrary('pa')
  emit({ type: 'avatar-planned', sceneIds: [1, 2, 3], dropped: 1 })
  await waitFor(() => text().includes(i18n.t('create.progress.avatarDropped', { count: 1 })), 'la nota de las descartadas antes de la fase del avatar')
  checks += 1
  emit({ type: 'stage-started', stageId: 'avatar' })
  await waitFor(() => text().includes(i18n.t('create.progress.avatarHint')), 'el panel del avatar')
  check(text().split(i18n.t('create.progress.avatarDropped', { count: 1 })).length === 2, 'con el panel a la vista, las descartadas se dicen una sola vez')
  // (c) La pausa del mismo proyecto, en vivo: el tipo de look sale de
  // project.json (LibraryProgress) para el costo, y la línea dice las
  // descartadas.
  emit({ type: 'awaiting-scene-confirmation', suggestedScenes: 18, audioDurationSeconds: 150, wordCount: 320, avatarSpans: spans })
  emit({ type: 'job-completed', result: { status: 'awaiting-confirmation' } })
  await waitFor(() => probe.task.status === 'awaitingConfirmation', 'la pausa de un proyecto reanudado')
  check(probe.task.confirmation.avatarLookType === 'photo_avatar' && probe.task.confirmation.avatarDropped === 1, 'la pausa de un proyecto reanudado lleva el tipo de look de project.json y las descartadas')
  await waitFor(() => text().includes(costLine('photo_avatar')) && text().includes(i18n.t('create.confirmScenes.avatarDropped', { count: 1 })), 'el diálogo de la pausa con el costo y las descartadas')
  checks += 1
  // (d) La pausa rearmada desde el disco (tras reiniciar la app, sin tarea
  // viva): los tramos, las descartadas y el costo vienen del estado.
  const pausedOnDisk = (name, avatarSpans, avatarDropped) => ({ ...diskStatus(name, true), avatarSpans, avatarDropped, metadata: { ...diskStatus(name, true).metadata, state: 'awaiting-confirmation', sceneCount: 18, wordCount: 320 } })
  window.projectStatuses.pp = pausedOnDisk('Pausa en disco', spans, 1)
  window.projectStatuses.pn = pausedOnDisk('Pausa sin tramos', [], 3)
  const openFromLibrary = async (projectId) => {
    probe.api.discardTask()
    await waitFor(() => probe.task === null, 'se descarta la tarea')
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Probe />
        <MemoryRouter initialEntries={['/library/' + projectId + '/progress']}>
          <Routes><Route path="/library/:projectId/progress" element={<LibraryProgress />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await waitFor(() => text().includes(window.projectStatuses[projectId].metadata.name), 'la pausa de ' + projectId)
  }
  await openFromLibrary('pp')
  await waitFor(() => text().includes(line) && text().includes(costLine('photo_avatar')) && text().includes(i18n.t('create.confirmScenes.avatarDropped', { count: 1 })), 'la pausa rearmada del disco dice dónde sale el avatar, cuánto cuesta y cuántas no entraron')
  checks += 1
  await openFromLibrary('pn')
  await waitFor(() => text().includes(i18n.t('create.confirmScenes.avatarNoneFits', { count: 3 })), 'la pausa rearmada del disco dice que ninguna entró')
  checks += 1
  // 11. Los otros dos sitios que reanudan un proyecto (el reproductor, tras un
  // error, y el editor, con un borrador) también le dicen a la corrida que
  // tiene avatar y su tipo de look (avatarRunOptions): la fila desde el
  // arranque y el costo de la pausa. Y el reproductor dice la salida de un
  // rechazo definitivo, como la pantalla de progreso.
  check(JSON.stringify(avatarRunOptions(avatarOptions)) === JSON.stringify({ hasAvatar: true, avatarLookType: 'photo_avatar', avatarEngine: 'avatar_iii' }) && JSON.stringify(avatarRunOptions({ ...avatarOptions, engine: 'avatar_iv' })) === JSON.stringify({ hasAvatar: true, avatarLookType: 'photo_avatar', avatarEngine: 'avatar_iv' }) && JSON.stringify(avatarRunOptions(undefined)) === JSON.stringify({ hasAvatar: false }), 'avatarRunOptions: con el motor del proyecto (entrega 2e) y sin avatar')
  const rejectedOnDisk = [1, 2, 3].map((id) => avatarScene(id, id * 20, { avatar: { ...planned, status: 'failed', errorCode: 'avatar_moderation_rejected' } }))
  window.projectDetails = {
    px: { metadata: { id: 'px', name: 'Rechazado', state: 'error', errorCode: 'avatar_incomplete', completedStages: BEFORE_AVATAR, options: { videoFormat: '16:9', imageProvider: 'fal', avatar: avatarOptions } }, scenes: rejectedOnDisk, words: [], script: '' },
    pe: { metadata: { id: 'pe', name: 'Borrador con avatar', state: 'draft', completedStages: [], options: { videoFormat: '16:9', imageProvider: 'fal', avatar: avatarOptions } }, scenes: [], words: [], script: '' },
  }
  const openView = async (path, element, name) => {
    probe.api.discardTask()
    await waitFor(() => probe.task === null, 'se descarta la tarea')
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <TooltipProvider>
          <Probe />
          <MemoryRouter initialEntries={[path]}>
            <Routes><Route path="/view/:projectId" element={element} /></Routes>
          </MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>,
    )
    await waitFor(() => text().includes(name), 'la vista de ' + name)
  }
  await openView('/view/px', <LibraryPlayer />, 'Rechazado')
  check(text().includes(i18n.t('create.errors.avatarRejected', { count: 3 })) && !text().includes(i18n.t('create.errors.avatarIncomplete')), 'el reproductor dice la salida de un rechazo definitivo')
  const retryButton = await waitFor(() => [...document.querySelectorAll('button')].find((candidate) => candidate.textContent.includes(i18n.t('library.player.retry'))), 'el botón de reintentar')
  retryButton.click()
  await waitFor(() => probe.task?.projectId === 'px' && probe.task.status === 'generating', 'reintenta desde el reproductor')
  check(probe.task.hasAvatar === true && probe.task.avatarLookType === 'photo_avatar', 'reintentar desde el reproductor lleva el avatar y su tipo de look')
  emit({ type: 'job-failed', code: 'voice_failed', message: 'fin' })
  await waitFor(() => probe.task.status === 'error', 'se libera el turno')
  window.editorFixture = { detail: window.projectDetails.pe, isLoading: false, errorKey: null, workingScenes: [], selectedScene: null, selectedSceneId: null, configuredProviders: new Set(), videoProvider: 'kie', editorTask: { task: null, isProjectBusy: () => false }, setSelectedSceneId() {} }
  await openView('/view/pe', <LibraryEditor />, i18n.t('library.editor.draftHint'))
  const draftButton = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent.includes(i18n.t('library.editor.generateDraft')))
  draftButton.click()
  await waitFor(() => probe.task?.projectId === 'pe' && probe.task.status === 'generating', 'genera el borrador desde el editor')
  check(probe.task.hasAvatar === true && probe.task.avatarLookType === 'photo_avatar', 'generar el borrador desde el editor lleva el avatar y su tipo de look')

  // 12. El aviso del final (entrega 2d, pregunta 6 del dueño): un job que
  // termina con apariciones sin generar dice cuántas salieron con la imagen
  // fija del look, además del estado por aparición. Es la pantalla de Crear
  // (la de la biblioteca se va al reproductor o al editor al terminar), con el
  // store real y los eventos del sidecar. Lo que pasó en la corrida manda; sin
  // eventos, el disco (sin clip, o desactualizada: la fase no la paga sola).
  // Antes que nada, las claves contra las que comparan las aserciones de las
  // secciones 12 a 14 están en el catálogo: una clave sin texto se traduce
  // como sí misma y comparar con i18n.t de la misma clave pasaría en vacío
  // (registro test-que-compara-el-texto-con-i18n-t-de-la-misma-clave).
  for (const [key, options] of [
    ['create.progress.avatarFallback', { count: 1 }],
    ['create.progress.avatarFallback', { count: 2 }],
    ['create.progress.savedAt'],
    ['create.progress.avatarCount'],
    ['create.progress.avatarItem'],
    ['create.progress.avatarFailed'],
    ['create.progress.avatarQueued'],
    ['create.progress.avatarHint'],
    ['create.progress.avatarStale'],
    ['create.progress.error.retryRender'],
    ['library.player.noVideo'],
    [errorKeyOf('avatar_timeout')],
    [errorKeyOf('avatar_render_failed')],
  ])
    check(i18n.exists(key, options), 'la clave ' + key + ' está en el catálogo')
  emit({ type: 'job-failed', code: 'voice_failed', message: 'fin' })
  await waitFor(() => probe.task.status === 'error', 'se libera el turno del borrador')
  function LiveProgress() {
    const { task } = useCreateTask()
    if (!task) return null
    const noop = () => {}
    return <GenerationProgress task={task} back={{ labelKey: 'create.progress.createAnother', onClick: noop }} onCancel={noop} onRetryPipeline={noop} onContinueInEditor={noop} onConfirmScenes={noop} onDismissConfirmation={noop} onPromptModelStall={noop} onSnoozePromptModelIssue={noop} onSwitchPromptModel={noop} />
  }
  const fallbackShown = (count) => text().includes(i18n.t('create.progress.avatarFallback', { count }))
  const anyFallback = () => [1, 2, 3].some(fallbackShown)
  const savedAt = i18n.t('create.progress.savedAt')
  const runToTheEnd = async (projectId, seedScenes, hasAvatar = true, videoFormat = '16:9') => {
    probe.api.discardTask()
    await waitFor(() => probe.task === null, 'se descarta la tarea')
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <TooltipProvider>
          <Probe />
          <MemoryRouter><LiveProgress /></MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>,
    )
    await waitFor(() => probe.api, 'el store monta')
    await probe.api.startPipelineForProject(projectId, 'Final ' + projectId, { hasAvatar, videoFormat, seed: { scenes: seedScenes, completedStages: BEFORE_AVATAR, audioDurationSeconds: 150 } })
    await waitFor(() => probe.task?.projectId === projectId && probe.task.status === 'generating', 'arranca ' + projectId)
  }
  // (a) Una lista y dos que fallaron en la corrida (render y plazo), con una
  // escena de imagen y una planeada sin eventos, que no cuentan (en la
  // pantalla de progreso la fase todavía la genera: ronda 2 de WP-P): mientras
  // corre no hay aviso (lo dicen las filas); al terminar, «2 apariciones».
  await runToTheEnd('pf', [...base, { id: 4, text: 'una imagen', imageStatus: 'ok', imagePath: '/p/scenes/scene_4.jpg', startSeconds: 130, endSeconds: 150 }, avatarScene(5, 160)])
  emit({ type: 'stage-started', stageId: 'avatar' })
  for (const sceneId of [1, 2, 3]) emit({ type: 'avatar-scene-started', sceneId })
  emit({ type: 'avatar-scene-ready', sceneId: 1, scene: { ...base[0], avatar: readyView } })
  emit({ type: 'avatar-scene-failed', sceneId: 2, code: 'avatar_render_failed' })
  emit({ type: 'avatar-scene-failed', sceneId: 3, code: 'avatar_timeout' })
  emit({ type: 'stage-completed', stageId: 'avatar' })
  await waitFor(() => probe.task.scenes[2].avatarActivity?.status === 'failed' && text().includes(i18n.t('create.progress.avatarCount', { ready: 1, total: 4 })), 'las filas de la corrida')
  check(!anyFallback(), 'mientras el job corre, el aviso no sale')
  emit({ type: 'job-completed', result: { status: 'completed', videoPath: '/v/final-pf.mp4' } })
  await waitFor(() => fallbackShown(2), 'al terminar, cuántas salieron con la imagen fija del look')
  check(text().includes(savedAt) && text().includes(i18n.t('create.progress.avatarItem', { index: 3, total: 4 })) && text().includes(i18n.t('create.progress.avatarFailed', { reason: i18n.t(errorKeyOf('avatar_timeout')) })) && text().includes(i18n.t('create.progress.avatarQueued')), 'el aviso va con el video y con el estado de cada aparición; la planeada, en espera')
  // (b) Todas listas: el video termina sin aviso.
  await runToTheEnd('pg', base)
  for (const scene of base) {
    emit({ type: 'avatar-scene-started', sceneId: scene.id })
    emit({ type: 'avatar-scene-ready', sceneId: scene.id, scene: { ...scene, avatar: { ...readyView, clipPath: '/p/avatar/scene_' + scene.id + '.mp4' } } })
  }
  emit({ type: 'job-completed', result: { status: 'completed', videoPath: '/v/final-pg.mp4' } })
  await waitFor(() => probe.task.status === 'completed' && text().includes(savedAt), 'termina con todas listas')
  check(!anyFallback(), 'con todas listas no hay aviso')
  // (c) Sin eventos (la fase ya terminó y se saltea), lo del disco con la
  // regla de la ronda 1 de WP-P: cuentan las fallidas y la lista que perdió su
  // clip (su vista sale fallida); no la lista, ni las desactualizadas, con o
  // sin clip (se muestran como tales). El panel no aparece; el aviso, sí.
  const onDisk = [
    avatarScene(1, 0, { avatar: readyView }),
    avatarScene(2, 30, { avatar: { ...readyView, clipPath: '/p/avatar/scene_2.mp4', stale: true } }),
    avatarScene(3, 60, { avatar: { ...planned, status: 'failed', errorCode: 'avatar_download_failed', stale: true } }),
    avatarScene(4, 90, { avatar: { ...planned, status: 'failed', errorCode: 'avatar_download_failed' } }),
    avatarScene(5, 120, { avatar: { ...planned, status: 'failed', errorCode: 'avatar_render_failed' } }),
  ]
  await runToTheEnd('ph', onDisk)
  emit({ type: 'stage-skipped', stageId: 'avatar' })
  emit({ type: 'job-completed', result: { status: 'completed', videoPath: '/v/final-ph.mp4' } })
  await waitFor(() => fallbackShown(2), 'el disco: la fallida y la que perdió su clip, sin las desactualizadas')
  check(!text().includes(i18n.t('create.progress.avatarHint')) && !text().includes(i18n.t('create.progress.avatarItem', { index: 1, total: 5 })), 'sin eventos de la fase el panel no aparece, el aviso sí')
  // (d) Un job que termina en error no lo dice: la cabecera del fallo manda.
  await runToTheEnd('pi', base)
  emit({ type: 'avatar-scene-started', sceneId: 2 })
  emit({ type: 'avatar-scene-failed', sceneId: 2, code: 'avatar_render_failed' })
  emit({ type: 'stage-completed', stageId: 'avatar' })
  emit({ type: 'stage-started', stageId: 'render' })
  emit({ type: 'job-failed', code: 'render_failed', message: 'ffmpeg' })
  await waitFor(() => probe.task.status === 'error' && text().includes(i18n.t('create.progress.error.retryRender')), 'el job cae en el ensamblado')
  check(!anyFallback(), 'un job que termina en error no dice el aviso del final')
  // (e) Sin avatar, nada.
  await runToTheEnd('pj', [{ id: 1, text: 'una imagen', imageStatus: 'ok', startSeconds: 0, endSeconds: 150 }], false)
  emit({ type: 'job-completed', result: { status: 'completed', videoPath: '/v/final-pj.mp4' } })
  await waitFor(() => probe.task.status === 'completed' && text().includes(savedAt), 'termina sin avatar')
  check(!anyFallback(), 'un video sin avatar no tiene aviso')

  // 13. El reproductor de la biblioteca (rondas 1 y 2 de WP-P): el mismo
  // aviso, sacado de los datos del proyecto y no de una corrida, así sale cada
  // vez que se abre el proyecto terminado hasta que se regeneran. Es el
  // proyecto ya hecho: cuentan las fallidas, la lista que perdió su clip y una
  // planeada (el camino «Continuar en el editor» → exportar); no las
  // desactualizadas, con o sin clip, ni una lista. Solo con video: el texto
  // habla de él.
  const finishedDetail = (id, scenes, extra = {}) => ({
    metadata: { id, name: 'Terminado ' + id, state: 'completed', completedStages: [...BEFORE_AVATAR, 'avatar', 'render'], options: { videoFormat: '16:9', imageProvider: 'fal', avatar: avatarOptions } },
    scenes,
    words: [],
    script: '',
    videoPath: '/v/' + id + '.mp4',
    videoMtimeMs: 1,
    ...extra,
  })
  window.projectDetails.py = finishedDetail('py', [
    ...onDisk,
    avatarScene(6, 140, { avatar: planned }),
    { id: 7, text: 'una imagen', imageStatus: 'ok', imagePath: '/p/scenes/scene_7.jpg', startSeconds: 150, endSeconds: 160 },
  ])
  window.projectDetails.pz = finishedDetail('pz', [avatarScene(1, 0, { avatar: readyView })])
  window.projectDetails.pw = finishedDetail('pw', onDisk, { videoPath: undefined, metadata: { ...finishedDetail('pw', []).metadata, state: 'draft' } })
  // Concern 6 de WP-Q: la única sin generar es una lista desactualizada que
  // perdió su clip (la vista la manda fallida y con stale): no es fallida.
  window.projectDetails.pv = finishedDetail('pv', [
    avatarScene(1, 0, { avatar: readyView }),
    avatarScene(2, 60, { avatar: { ...planned, status: 'failed', errorCode: 'avatar_download_failed', stale: true } }),
  ])
  await openView('/view/py', <LibraryPlayer />, 'Terminado py')
  await waitFor(() => fallbackShown(3), 'el reproductor dice cuántas apariciones salieron con la imagen fija, con la planeada')
  check(document.querySelector('video') !== null, 'el aviso acompaña al video del proyecto')
  await openView('/view/pv', <LibraryPlayer />, 'Terminado pv')
  await waitFor(() => document.querySelector('video') !== null, 'el reproductor con una desactualizada sin clip')
  check(!anyFallback(), 'una desactualizada sin clip no cuenta como fallida en el reproductor')
  await openView('/view/pz', <LibraryPlayer />, 'Terminado pz')
  await waitFor(() => document.querySelector('video') !== null, 'el reproductor con todas listas')
  check(!anyFallback(), 'con todas las apariciones listas, el reproductor no avisa')
  await openView('/view/pw', <LibraryPlayer />, 'Terminado pw')
  await waitFor(() => text().includes(i18n.t('library.player.noVideo')), 'un borrador sin video')
  check(!anyFallback(), 'sin video no hay aviso: el texto habla del video')

  // 14. Una sola regla (ronda 2 de WP-P): isAvatarFallback decide qué
  // apariciones salen con la imagen fija del look, para la fila de cada
  // aparición, el aviso del final de Crear, el reproductor y el editor. Las
  // desactualizadas nunca cuentan (tienen su propio aviso); una planeada, solo
  // en el proyecto ya hecho; lo que pasó en la corrida manda.
  const failedView = { ...planned, status: 'failed', errorCode: 'avatar_render_failed' }
  const lostClipView = { ...planned, status: 'failed', errorCode: 'avatar_download_failed' }
  const staleNoClip = { ...lostClipView, stale: true }
  const activity = (status) => ({ status, phase: 'render', elapsedSeconds: 3, receivedAt: 1, ...(status === 'failed' ? { code: 'avatar_timeout' } : {}) })
  // [qué es, la escena, ¿cuenta en el progreso?, ¿cuenta en el proyecto?]
  const shapes = [
    ['sin avatar', { id: 1, text: 'x', imageStatus: 'ok' }, false, false],
    ['planeada', avatarScene(1, 0), false, true],
    ['fallida', avatarScene(1, 0, { avatar: failedView }), true, true],
    ['lista que perdió su clip', avatarScene(1, 0, { avatar: lostClipView }), true, true],
    ['lista sin clipPath (la vista no la manda así; el render la deja fija)', avatarScene(1, 0, { avatar: { ...planned, status: 'ready' } }), true, true],
    ['lista con su clip', avatarScene(1, 0, { avatar: readyView }), false, false],
    ['desactualizada con clip', avatarScene(1, 0, { avatar: { ...readyView, stale: true } }), false, false],
    ['desactualizada sin clip', avatarScene(1, 0, { avatar: staleNoClip }), false, false],
    ['falló en la corrida', avatarScene(1, 0, { avatarActivity: activity('failed') }), true, true],
    ['quedó lista en la corrida', avatarScene(1, 0, { avatar: readyView, avatarActivity: activity('ready') }), false, false],
    ['se está generando', avatarScene(1, 0, { avatarActivity: activity('generating') }), false, false],
  ]
  for (const [name, scene, inProgress, inProject] of shapes)
    check(isAvatarFallback(scene, 'progress') === inProgress && isAvatarFallback(scene, 'project') === inProject, 'regla única: ' + name)
  const everyShape = shapes.map(([, scene], index) => ({ ...scene, id: index + 1 }))
  check(avatarFallbackCount(everyShape, 'progress') === 4 && avatarFallbackCount(everyShape, 'project') === 5, 'la cuenta de cada contexto: 4 en el progreso y 5 en el proyecto ya hecho')
  check(everyShape.filter((scene) => scene.avatar && avatarRowStatus(scene) === 'failed').length === avatarFallbackCount(everyShape, 'progress'), 'la fila «No se completó» y el aviso del progreso cuentan las mismas')
  check(avatarRowStatus(avatarScene(1, 0, { avatar: staleNoClip })) === 'stale' && avatarRowStatus(avatarScene(1, 0, { avatar: { ...readyView, stale: true } })) === 'stale', 'una desactualizada, con o sin clip, tiene su propio estado en la fila')
  // El caso raro (concern 6 de WP-Q): una lista desactualizada que perdió su
  // clip decía «No se completó» con el motivo de la descarga, que promete
  // reusar el video pagado, y el aviso no la contaba. Ahora la fila dice
  // «Desactualizada» (create.progress.avatarStale, que concuerda con «Lista»;
  // ronda 3 de WP-P) y el aviso tampoco la cuenta.
  const rareScenes = [avatarScene(1, 0, { avatar: readyView }), avatarScene(2, 60, { avatar: staleNoClip }), avatarScene(3, 120, { avatar: failedView })]
  render(<PipelineAvatarPanel scenes={rareScenes} dropped={0} active={false} />)
  await waitFor(() => rows().length === 3, 'tres filas')
  const notCompleted = i18n.t('create.progress.avatarFailed', { reason: '' }).trim()
  check(rows()[1].textContent.includes(i18n.t('create.progress.avatarStale')) && !rows()[1].textContent.includes(notCompleted), 'la desactualizada sin clip dice «Desactualizada» en su fila, no «No se completó»')
  check(rows()[2].textContent.includes(i18n.t('create.progress.avatarFailed', { reason: i18n.t(errorKeyOf('avatar_render_failed')) })), 'la fallida de verdad sigue con «No se completó» y su motivo')
  check(text().includes(i18n.t('create.progress.avatarCount', { ready: 1, total: 3 })), 'la desactualizada no cuenta como lista')
  render(<AvatarFallbackNote count={avatarFallbackCount(rareScenes, 'progress')} />)
  await waitFor(() => fallbackShown(1), 'el aviso del progreso cuenta solo la fallida')
  checks += 1
  check(dominantAvatarFailure(rareScenes) === 'avatar_render_failed' && dominantAvatarFailure([rareScenes[1]]) === undefined, 'la cabecera de un proyecto de antes de la 2d tampoco toma la desactualizada como fallo')
  // La API del aviso para el editor (WP-Q): la cifra y una acción opcional.
  render(<AvatarFallbackNote count={2} action={<button type="button">Regenerar todos</button>} />)
  await waitFor(() => fallbackShown(2) && [...document.querySelectorAll('button')].some((button) => button.textContent === 'Regenerar todos'), 'el aviso con la acción del editor')
  checks += 1
  render(<AvatarFallbackNote count={0} action={<button type="button">Regenerar todos</button>} />)
  await waitFor(() => !anyFallback() && document.querySelectorAll('button').length === 0, 'sin ninguna, ni el aviso ni la acción')
  checks += 1
  // 15. El porcentaje simulado de cada aparición (entrega 2e, diseño §21.5):
  // junto al tiempo de la fila y solo mientras se genera, con la curva del
  // editor desde el inicio que dan el tiempo y la hora de la última consulta
  // (61 s de render = 46 %, lejos de un borde del redondeo para que una
  // máquina cargada no lo mueva). El spinner del paso se mudó al lado del
  // porcentaje: uno por fila. Sin barra, y el tiempo sigue solo en su <time>.
  // Antes que nada, las claves nuevas tienen su texto: una ausente se traduce
  // como su propia ruta y compararla con i18n.t pasaría en vacío.
  for (const [key, options] of [
    ['create.progress.avatarPercent', { percent: 45 }],
    ['create.progress.avatarPercentAria', { percent: 45 }],
    ['create.progress.avatarCardLabel'],
    ['create.progress.avatarCardAria', { index: 3, status: 'X' }],
    ['create.progress.avatarCardGenerating'],
    ['create.progress.avatarCardFallback'],
  ]) {
    const phrase = i18n.t(key, options)
    check(i18n.exists(key, options) && phrase !== key && !phrase.includes('{{'), 'la clave ' + key + ' tiene su texto')
  }
  const percentPattern = new RegExp('^' + i18n.t('create.progress.avatarPercentAria', { percent: '([0-9]+)' }) + '$')
  const percentIn = (root) => root ? [...root.querySelectorAll('[aria-label]')].filter((node) => percentPattern.test(node.getAttribute('aria-label'))) : []
  const percentValue = (node) => Number(percentPattern.exec(node.getAttribute('aria-label'))[1])
  const percentOf = (root) => { const [node] = percentIn(root); return node ? percentValue(node) : null }
  const spinnersIn = (root) => root ? [...root.querySelectorAll('.animate-spin')] : []
  // Sin barra: ni el rol, ni un <progress> o <meter>, ni un elemento con estilo propio (una barra hecha con divs de ancho en %). El
  // estilo en línea de la raíz de una tarjeta es de framer-motion: se mira lo de adentro (querySelector no mira la raíz).
  const barIn = (root) => root.querySelector('[role="progressbar"], progress, meter, [style]')
  const clockStart = Date.now()
  const generatingScene = (id, elapsedSeconds, phase = 'render') => avatarScene(id, id * 60, { avatarActivity: { status: 'generating', phase, elapsedSeconds, receivedAt: clockStart } })
  render(<PipelineAvatarPanel scenes={[
    generatingScene(1, 61),
    generatingScene(2, 0, 'audio'),
    generatingScene(3, 7200),
    avatarScene(4, 240, { avatar: readyView, avatarActivity: { status: 'ready', phase: 'normalize', elapsedSeconds: 49, receivedAt: clockStart - 30000 } }),
    avatarScene(5, 300, { avatarActivity: { status: 'failed', phase: 'render', elapsedSeconds: 12, receivedAt: clockStart, code: 'avatar_moderation_rejected' } }),
    avatarScene(6, 360),
    avatarScene(7, 420, { avatar: { ...readyView, stale: true } }),
  ]} dropped={0} active />)
  await waitFor(() => rows().length === 7, 'siete filas con el porcentaje')
  const [freshRow, startingRow, cappedRow, readyRow, failedRow, queuedRow, staleRow] = rows()
  const freshPercent = percentIn(freshRow)
  check(freshPercent.length === 1 && percentOf(freshRow) === 46 && freshPercent[0].textContent === i18n.t('create.progress.avatarPercent', { percent: 46 }), 'a los 61 s de render la fila dice 46 %, con la curva del editor desde el inicio de la aparición')
  const freshTime = freshRow.querySelector('time')
  check([freshRow, startingRow, cappedRow].every((row) => percentIn(row)[0]?.getAttribute('role') === 'img'), 'el porcentaje de cada fila es una imagen con nombre (role img): un aria-label sobre un span suelto no es ARIA válido')
  check(freshPercent[0]?.parentElement === freshTime.parentElement && freshTime.textContent === formatSecondsShort(61) && !freshTime.textContent.includes('%'), 'el porcentaje va al lado del tiempo, que sigue solo en su <time>')
  const freshSpinners = spinnersIn(freshRow)
  const stepLine = [...freshRow.querySelectorAll('p')].find((paragraph) => paragraph.textContent.includes(i18n.t('create.progress.avatarPhase.render')))
  check(freshSpinners.length === 1 && freshSpinners[0].parentElement === freshTime.parentElement && freshSpinners[0].classList.contains('text-amethyst'), 'un solo spinner por fila, morado y al lado del tiempo y del porcentaje')
  check(stepLine && stepLine.querySelector('svg') === null, 'la línea del paso ya no lleva el spinner')
  check(percentOf(startingRow) === 0 && percentIn(startingRow)[0].textContent === i18n.t('create.progress.avatarPercent', { percent: 0 }), 'una aparición recién empezada dice 0 %: no se esconde')
  check(percentOf(cappedRow) === 99 && !text().includes('100%'), 'el porcentaje frena en 99 y nunca dice 100')
  check([readyRow, failedRow, queuedRow, staleRow].every((row) => percentIn(row).length === 0 && spinnersIn(row).length === 0), 'ni la lista, ni la fallida, ni la que espera, ni la desactualizada llevan porcentaje ni spinner')
  check(readyRow.querySelector('time').textContent === formatSecondsShort(49) && failedRow.querySelector('time').textContent === formatSecondsShort(12) && queuedRow.querySelector('time') === null, 'los tiempos de la lista y de la fallida siguen fijos, y la que espera no tiene')
  check(document.querySelector('[role="progressbar"]') === null && rows().every((row) => barIn(row) === null), 'el porcentaje va sin barra: ni el rol, ni un progress, ni divs con ancho por estilo en ninguna fila')
  await delay(1300)
  check(percentOf(rows()[0]) > 46 && percentOf(rows()[1]) > 0, 'el porcentaje sube con el reloj, como el tiempo')

  // 16. La grilla «Imágenes» con la tarjeta del avatar (entrega 2e, §21.5), en
  // la pantalla de progreso completa y con el store real. Las escenas de avatar
  // llegan del sidecar con la foto del look como imagen y imageStatus: 'ok'
  // (así lo hace avatarScene): sin tarjeta propia se verían como imágenes.
  // Cada una es una tarjeta morada con el número y el tramo de siempre, su
  // estado con la regla de la fila (en espera, generando con el porcentaje,
  // lista, con la imagen fija, desactualizada), sin imagen ni «Ampliar»; el
  // conteo del título y el visor solo cuentan las imágenes.
  const gridScenes = [
    { id: 1, text: 'una imagen', imageStatus: 'ok', imagePath: '/p/scenes/scene_1.jpg', startSeconds: 0, endSeconds: 10 },
    avatarScene(2, 10),
    avatarScene(3, 20),
    avatarScene(4, 30, { avatar: { ...readyView, clipPath: '/p/avatar/scene_4.mp4' } }),
    avatarScene(5, 40, { avatar: failedView }),
    avatarScene(6, 50, { avatar: { ...readyView, clipPath: '/p/avatar/scene_6.mp4', stale: true } }),
    { id: 7, text: 'otra imagen', imageStatus: 'generating', startSeconds: 60, endSeconds: 70 },
  ]
  await runToTheEnd('pk', gridScenes)
  emit({ type: 'stage-started', stageId: 'avatar' })
  emit({ type: 'avatar-scene-started', sceneId: 3 })
  emit({ type: 'avatar-scene-progress', sceneId: 3, phase: 'render', elapsedSeconds: 60 })
  const cardWith = (sceneId, statusKey) => document.querySelector('[aria-label="' + i18n.t('create.progress.avatarCardAria', { index: sceneId, status: i18n.t(statusKey) }) + '"]')
  await waitFor(() => cardWith(3, 'create.progress.avatarCardGenerating'), 'la tarjeta de la aparición que se genera')
  const cards = [
    [2, 'create.progress.avatarQueued'],
    [3, 'create.progress.avatarCardGenerating'],
    [4, 'create.progress.avatarReady'],
    [5, 'create.progress.avatarCardFallback'],
    [6, 'create.progress.avatarStale'],
  ].map(([sceneId, statusKey]) => ({ sceneId, statusKey, card: cardWith(sceneId, statusKey) }))
  check(cards.every(({ card }) => card), 'cada aparición del avatar es una tarjeta propia con su número y su estado en el nombre; faltan: ' + cards.filter(({ card }) => !card).map(({ sceneId }) => sceneId))
  const numberOf = (cell) => cell.querySelector('.left-2.top-2')?.textContent
  const rangeOf = (cell) => cell.querySelector('.bottom-0 span')?.textContent
  const imageCell = (sceneId) => document.querySelector('button[aria-label="' + i18n.t('create.progress.cell.enlargeAria', { id: sceneId }) + '"]')?.parentElement
  for (const { sceneId, statusKey, card } of cards) {
    if (!card) continue
    const tag = 'tarjeta ' + sceneId + ': '
    check(card.getAttribute('role') === 'group' && ['border-2', 'border-amethyst/60', 'bg-amethyst/10', 'aspect-video'].every((name) => card.classList.contains(name)), tag + 'un grupo con borde y fondo morados, con el tamaño de una imagen 16:9')
    const icon = card.querySelector('svg.lucide-user-round')
    check(icon && ['rounded-full', 'bg-amethyst/15', 'text-amethyst'].every((name) => icon.parentElement.classList.contains(name)), tag + 'el ícono del avatar en su círculo morado')
    check(card.querySelector('img') === null && card.querySelector('button') === null && !card.textContent.includes(i18n.t('create.progress.cell.enlarge')), tag + 'sin imagen ni «Ampliar»')
    check(card.textContent.includes(i18n.t('create.progress.avatarCardLabel')) && card.textContent.includes(i18n.t(statusKey)), tag + 'la etiqueta y el estado')
    check(barIn(card) === null, tag + 'sin barra: ni el rol, ni un progress, ni divs con ancho por estilo')
    const scene = gridScenes.find((candidate) => candidate.id === sceneId)
    check(numberOf(card) === String(sceneId) && rangeOf(card) === formatSceneSeconds(scene.startSeconds) + '–' + formatSceneSeconds(scene.endSeconds), tag + 'el mismo número y tramo que una imagen')
  }
  check(imageCell(1) && imageCell(7) && imageCell(1).classList.contains('aspect-video') && numberOf(imageCell(1)) === '1' && rangeOf(imageCell(1)) === formatSceneSeconds(0) + '–' + formatSceneSeconds(10), 'las imágenes siguen con su «Ampliar», su número y su tramo')
  check([2, 3, 4, 5, 6].every((sceneId) => !imageCell(sceneId)), 'ninguna aparición del avatar se puede ampliar')
  check(cards[3].card && !cards[3].card.textContent.includes(notCompleted), 'la que salió con la imagen fija lo dice corto, sin el «No se completó» de la fila')
  const generatingCard = cards[1].card
  const cardPercent = percentIn(generatingCard)
  check(spinnersIn(generatingCard).length === 1 && spinnersIn(generatingCard)[0].classList.contains('text-amethyst'), 'generando: un spinner morado')
  check(cardPercent[0]?.getAttribute('role') === 'img', 'generando: el porcentaje es una imagen con nombre (role img)')
  check(cardPercent.length === 1 && percentOf(generatingCard) !== null && cardPercent[0].textContent === i18n.t('create.progress.avatarPercent', { percent: percentOf(generatingCard) }), 'generando: el porcentaje simulado, con su texto y su nombre de acceso')
  check(cards.every(({ card }) => card) && cards.filter(({ sceneId }) => sceneId !== 3).every(({ card }) => spinnersIn(card).length === 0 && percentIn(card).length === 0), 'solo la tarjeta que se genera lleva spinner y porcentaje')
  check(text().includes(i18n.t('create.progress.imagesCount', { ready: 1, total: 2 })) && !text().includes(i18n.t('create.progress.imagesCount', { ready: 6, total: 7 })), 'el conteo del título cuenta solo las imágenes (1 de 2), no las apariciones del avatar')
  await delay(1300)
  // La tarjeta es dueña de su reloj y lo arranca cuando su aparición se
  // genera: tras su primer tick, los 60 s que informó el sidecar más 1 s
  // corrido son 61 s de render = 46 %.
  check(percentOf(cardWith(3, 'create.progress.avatarCardGenerating')) === 46, 'tras el primer tick del reloj de la tarjeta, dice 46 % (60 s del sidecar y 1 s corrido)')
  // El visor de «Ampliar» recorre solo las imágenes: la flecha salta de la 1 a
  // la 7 sin detenerse en la foto fija de una aparición.
  imageCell(1).querySelector('button').click()
  const viewer = await waitFor(() => document.querySelector('[role="dialog"]'), 'el visor de la escena 1')
  check(viewer.getAttribute('aria-label') === i18n.t('create.viewer.aria', { id: 1, index: 1, total: 2 }), 'el visor cuenta solo las imágenes: escena 1, 1 de 2')
  // Con el visor abierto y una aparición generándose, el foco no se mueve y la
  // grilla no se repinta: el reloj es de cada tarjeta, no de la grilla (una
  // celda de imagen que se repinta le vuelve a pedir su fuente al simulacro).
  // Un repintado de la grilla le daría al visor un onClose nuevo y su efecto
  // le devolvería el foco al contenedor del diálogo. El porcentaje de la
  // tarjeta tiene que seguir corriendo en esa ventana: si no, la quietud no
  // prueba nada.
  const viewerClose = [...viewer.querySelectorAll('button')].find((button) => button.textContent === i18n.t('create.viewer.close'))
  const percentBeforeFocus = percentOf(cardWith(3, 'create.progress.avatarCardGenerating'))
  const imageCalls = () => window.imageSourceCalls['/p/scenes/scene_1.jpg'] ?? 0
  const imageCallsBefore = imageCalls()
  viewerClose.focus()
  check(document.activeElement === viewerClose, 'el foco se pone en un botón del visor')
  await delay(3200)
  check(document.activeElement === viewerClose, 'con el visor abierto y una aparición generándose, el foco sigue en su botón después de 3 s')
  check(percentOf(cardWith(3, 'create.progress.avatarCardGenerating')) > percentBeforeFocus, 'y en esos 3 s el porcentaje de la tarjeta siguió corriendo')
  check(imageCalls() === imageCallsBefore, 'y la grilla no se repintó en esos 3 s: el reloj es de la tarjeta, no de la grilla')
  // Y un evento del store (el avance de la aparición repinta la pantalla entera)
  // tampoco le quita el foco: el visor recibe un onClose estable y su efecto
  // no vuelve a correr.
  emit({ type: 'avatar-scene-progress', sceneId: 3, phase: 'render', elapsedSeconds: 70 })
  await waitFor(() => probe.task.scenes.find((candidate) => candidate.id === 3)?.avatarActivity?.elapsedSeconds === 70, 'el evento del store llega a la escena')
  await delay(400)
  check(document.activeElement === viewerClose, 'un evento del store con el visor abierto tampoco le quita el foco')
  ;[...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === i18n.t('create.viewer.next')).click()
  await waitFor(() => document.querySelector('[role="dialog"]')?.getAttribute('aria-label') === i18n.t('create.viewer.aria', { id: 7, index: 2, total: 2 }), 'la flecha del visor salta de la escena 1 a la 7 sin pasar por el avatar')
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  await waitFor(() => !document.querySelector('[role="dialog"]'), 'se cierra el visor')
  emit({ type: 'job-completed', result: { status: 'completed', videoPath: '/v/final-pk.mp4' } })
  await waitFor(() => probe.task.status === 'completed', 'termina la grilla')
  // En un short las celdas son verticales y la tarjeta también.
  await runToTheEnd('pm', [gridScenes[0], avatarScene(2, 10)], true, '9:16')
  const verticalCard = await waitFor(() => cardWith(2, 'create.progress.avatarQueued'), 'la tarjeta en un short')
  check(verticalCard?.classList.contains('aspect-[9/16]') && imageCell(1).classList.contains('aspect-[9/16]'), 'en un short, la tarjeta del avatar es vertical como las imágenes')
  emit({ type: 'job-completed', result: { status: 'completed', videoPath: '/v/final-pm.mp4' } })
  await waitFor(() => probe.task.status === 'completed', 'termina el short')
  // Una aparición que cubre toda la narración no deja escenas de imagen: el
  // título no dice «Imágenes (0/0)» sobre una grilla de puras tarjetas del
  // avatar. Sin escenas y sin avatar (la grilla vacía de siempre), sí.
  const imagesHeading = i18n.t('create.progress.imagesCount', { ready: '#', total: '#' }).split('#')[0]
  await runToTheEnd('pn', [avatarScene(1, 0)])
  await waitFor(() => cardWith(1, 'create.progress.avatarQueued'), 'la tarjeta de una aparición que cubre toda la narración')
  check(!text().includes(imagesHeading), 'sin escenas de imagen, el título no cuenta imágenes: no dice «Imágenes (0/0)» sobre las tarjetas del avatar')
  emit({ type: 'job-completed', result: { status: 'completed', videoPath: '/v/final-pn.mp4' } })
  await waitFor(() => probe.task.status === 'completed', 'termina la aparición sola')
  await runToTheEnd('pq', [], false)
  await waitFor(() => text().includes(i18n.t('create.progress.imagesEmpty')), 'la grilla vacía de un proyecto sin escenas')
  check(text().includes(i18n.t('create.progress.imagesCount', { ready: 0, total: 0 })), 'sin escenas y sin avatar, el título es el de siempre: Imágenes (0/0)')
  emit({ type: 'job-completed', result: { status: 'completed', videoPath: '/v/final-pq.mp4' } })
  await waitFor(() => probe.task.status === 'completed', 'termina el proyecto sin escenas')

  // 17. El costo de reanudar con el motor del proyecto (entrega 2e): la pausa
  // por saldo estima lo que falta con la tarifa del motor de cada escena; si
  // la escena no lo trae, el de las opciones del proyecto; si tampoco, Avatar
  // III. Y las opciones de corrida que parten de options.avatar lo llevan.
  const resumeStatus = (avatar, scenes, completedStages = BEFORE_AVATAR) => ({
    metadata: { id: 'p', name: 'p', state: 'paused', completedStages, options: { styleId: 'normal', sceneCount: 0, narrationMode: 'tts', imageProvider: 'evolink', useBgm: false, useOverlay: false, confirmScenes: false, avatar } },
    scenes,
  })
  const resumeLine = (status) => {
    const lines = estimateResumeCost(status).filter((candidate) => candidate.domain === 'avatar')
    return lines.length === 1 ? lines[0] : null
  }
  const withEngine = (engine) => ({ ...avatarOptions, engine })
  const pendingScene = (id, startSeconds, endSeconds, engine) => ({ id, text: '', imageStatus: 'pending', startSeconds, endSeconds, avatar: { ...planned, engine } })
  const beforeTheCut = ['voice', 'transcription']
  // Antes del corte: lo que pidió Crear (3 × 10 s) con la tarifa del motor.
  check(resumeLine(resumeStatus(withEngine('avatar_iii'), [], beforeTheCut))?.estimated === 0.495 && resumeLine(resumeStatus(withEngine('avatar_iv'), [], beforeTheCut))?.estimated === 1.155 && resumeLine(resumeStatus({ ...withEngine('avatar_v'), lookType: 'digital_twin' }, [], beforeTheCut))?.estimated === 3.6, 'antes del corte, reanudar cuenta lo pedido (30 s) con el motor del proyecto: III 0,495, IV 1,155 y V con un gemelo digital 3,6')
  check(resumeLine(resumeStatus(withEngine('avatar_iv'), [], beforeTheCut)) !== null && !('upperBound' in resumeLine(resumeStatus(withEngine('avatar_iv'), [], beforeTheCut))), 'y sigue sin la marca de techo')
  // Con escenas cortadas: el motor de la escena, el del proyecto o el de siempre.
  const sceneLine = (avatar, ...scenes) => resumeLine(resumeStatus(avatar, scenes))
  check(sceneLine(withEngine('avatar_iii'), pendingScene(1, 0, 10, 'avatar_iv'))?.estimated === 0.385, 'la escena manda: 10 s con Avatar IV en un proyecto de Avatar III cuestan 0,385')
  check(sceneLine(withEngine('avatar_iv'), pendingScene(1, 0, 10, undefined))?.estimated === 0.385, 'sin motor en la escena, el del proyecto: Avatar IV, 0,385')
  check(sceneLine(withEngine(undefined), pendingScene(1, 0, 10, undefined))?.estimated === 0.165 && sceneLine(withEngine('avatar_iii'), pendingScene(1, 0, 10, 'avatar_iii'))?.estimated === 0.165, 'sin motor en ninguno, Avatar III de siempre: 10 s cuestan 0,165, igual que con Avatar III declarado')
  check(sceneLine(withEngine('avatar_iv'), pendingScene(1, 0, 10, 'avatar_iv'))?.upperBound === true, 'con escenas cortadas la cifra sigue siendo un techo')
  const mixedLine = sceneLine(withEngine('avatar_iii'), pendingScene(1, 0, 10, 'avatar_iv'), pendingScene(2, 30, 42, 'avatar_iii'))
  check(mixedLine !== null && Math.abs(mixedLine.estimated - 0.583) < 1e-9 && mixedLine.upperBound === true, 'dos motores en un mismo proyecto: cada escena con su tarifa, sumadas (0,385 + 0,198)')
  const readyWithClip = { ...pendingScene(3, 60, 70, 'avatar_iv'), avatar: { ...planned, engine: 'avatar_iv', status: 'ready', clipPath: '/p/avatar/scene_3.mp4' } }
  check(Math.abs(sceneLine(withEngine('avatar_iii'), readyWithClip, pendingScene(2, 30, 42, 'avatar_iii')).estimated - 0.198) < 1e-9, 'una escena que ya tiene su clip no suma, tenga el motor que tenga')
  check(JSON.stringify(avatarRunOptions({ ...avatarOptions, engine: 'avatar_v' })) === JSON.stringify({ hasAvatar: true, avatarLookType: 'photo_avatar', avatarEngine: 'avatar_v' }), 'las opciones de corrida llevan el motor del proyecto, también Avatar V')

  // 18. El avatar junto con las imágenes (entrega 2h, diseño §24.2). La lista
  // de fases hace girar las dos filas a la vez; el store lleva las fases en
  // curso (activeStages) en orden de arranque y cada una sale cuando
  // termina, en cualquier orden (y completedStages puede quedar con el
  // avatar antes que las imágenes); el arranque del avatar no borra la pasada
  // de recuperación de las imágenes, ni el de otra fase la vigilancia del
  // modelo de prompts; el fin del job las vacía. En pantalla, una fase, un
  // panel: mientras corren las imágenes, la grilla, con el porcentaje en la
  // tarjeta de la aparición que arrancó y «En espera» en la que no, sin el
  // panel del avatar; cuando las imágenes terminan y el avatar sigue, su
  // panel, con el reloj y la ayuda solo mientras el avatar corre. La pantalla
  // de la biblioteca, igual.
  const BEFORE_IMAGES = ['voice', 'transcription', 'scene-cuts', 'scene-prompts']
  // (a) La lista de fases. Cada caso en su propio contenedor: el árbol del
  // caso anterior sigue en la página hasta que React confirma el nuevo.
  const stageBarCase = async (probeId, props) => {
    render(<div data-probe={probeId}><StageBar showAnimation={false} showAvatar paused={false} recovery={null} promptModelStalled={false} {...props} /></div>)
    return waitFor(() => { const items = [...document.querySelectorAll('[data-probe="' + probeId + '"] li')]; return items.length === 7 ? items : null }, 'la lista de fases de ' + probeId)
  }
  const spins = (row) => row.querySelector('.animate-spin') !== null
  const isDone = (row) => row.querySelector('svg.lucide-check') !== null
  let stageRows = await stageBarCase('both-running', { activeStages: ['images', 'avatar'], completedStages: BEFORE_IMAGES })
  check(spins(stageRows[4]) && spins(stageRows[5]) && stageRows.filter(spins).length === 2, 'imágenes y avatar giran juntas, y ninguna otra fila')
  check(stageRows[4].className.includes('border-ocean/60') && stageRows[5].className.includes('border-amethyst/60') && !isDone(stageRows[4]) && !isDone(stageRows[5]), 'cada una con su color: las imágenes en ocean y el avatar en morado')
  stageRows = await stageBarCase('images-first', { activeStages: ['avatar'], completedStages: [...BEFORE_IMAGES, 'images'] })
  check(isDone(stageRows[4]) && !spins(stageRows[4]) && spins(stageRows[5]) && stageRows.filter(spins).length === 1, 'las imágenes terminan primero: su fila queda hecha y la del avatar sigue girando')
  stageRows = await stageBarCase('avatar-first', { activeStages: ['images'], completedStages: [...BEFORE_IMAGES, 'avatar'] })
  check(isDone(stageRows[5]) && !spins(stageRows[5]) && spins(stageRows[4]) && stageRows.filter(spins).length === 1, 'el avatar termina primero: su fila queda hecha y la de imágenes sigue girando')
  stageRows = await stageBarCase('rewriting', { activeStages: ['images', 'avatar'], completedStages: BEFORE_IMAGES, recovery: { kind: 'rewrite', sceneIds: [1], pass: 1, maxPasses: 2, streamed: 0 } })
  check(spins(stageRows[3]) && !spins(stageRows[4]) && spins(stageRows[5]) && stageRows.filter(spins).length === 2, 'reescribiendo prompts: gira la de prompts, la de imágenes espera y la del avatar sigue girando')

  // (b) El store y la pantalla de Crear, con los eventos del sidecar.
  const imageScene = (id, startSeconds) => ({ id, text: 'imagen ' + id, imageStatus: 'pending', startSeconds, endSeconds: startSeconds + 10 })
  const alongsideScenes = [imageScene(1, 0), avatarScene(2, 10), avatarScene(3, 20), imageScene(4, 30)]
  const stagesNow = () => JSON.stringify(probe.task.activeStages)
  const runAlongside = async (projectId) => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <TooltipProvider>
          <div data-probe={'alongside-' + projectId}>
            <Probe />
            <MemoryRouter><LiveProgress /></MemoryRouter>
          </div>
        </TooltipProvider>
      </QueryClientProvider>,
    )
    await waitFor(() => document.querySelector('[data-probe="alongside-' + projectId + '"]'), 'la pantalla de ' + projectId)
    probe.api.discardTask()
    await waitFor(() => probe.task === null, 'se descarta la tarea')
    await probe.api.startPipelineForProject(projectId, 'Juntos ' + projectId, { hasAvatar: true, seed: { scenes: alongsideScenes, completedStages: BEFORE_IMAGES, audioDurationSeconds: 40 } })
    await waitFor(() => probe.task?.projectId === projectId && probe.task.status === 'generating', 'arranca ' + projectId)
  }
  const liveStageRows = () => [...document.querySelectorAll('aside ul > li')]
  const hint = i18n.t('create.progress.avatarHint')
  const panelRow = (index) => rows().find((row) => row.textContent.includes(i18n.t('create.progress.avatarItem', { index, total: 2 })))

  // Las imágenes terminan primero.
  await runAlongside('pa1')
  emit({ type: 'stage-started', stageId: 'images' })
  emit({ type: 'images-recovery-pass', kind: 'retry', sceneIds: [1], pass: 1, maxPasses: 2 })
  emit({ type: 'stage-started', stageId: 'avatar' })
  await waitFor(() => stagesNow() === '["images","avatar"]', 'las dos fases en curso, en el orden en que arrancaron')
  check(probe.task.imagesRecovery?.kind === 'retry' && JSON.stringify(probe.task.imagesRecovery.sceneIds) === '[1]', 'el arranque del avatar no borra la pasada de recuperación de las imágenes')
  emit({ type: 'avatar-scene-started', sceneId: 2 })
  emit({ type: 'avatar-scene-progress', sceneId: 2, phase: 'upload', elapsedSeconds: 61 })
  const startedCard = await waitFor(() => cardWith(2, 'create.progress.avatarCardGenerating'), 'mientras corren las imágenes, la tarjeta de la aparición que arrancó se genera')
  check(percentOf(startedCard) !== null && percentIn(startedCard)[0].textContent === i18n.t('create.progress.avatarPercent', { percent: percentOf(startedCard) }), 'con su porcentaje simulado, como las filas del panel del avatar')
  check(cardWith(3, 'create.progress.avatarQueued') !== null && percentIn(cardWith(3, 'create.progress.avatarQueued')).length === 0, 'la que todavía no arrancó dice «En espera», sin porcentaje')
  check(!text().includes(hint) && !panelRow(1) && !panelRow(2), 'mientras corren las imágenes no está el panel del avatar: su avance va en las tarjetas de la grilla')
  check(liveStageRows().length === 7 && spins(liveStageRows()[4]) && spins(liveStageRows()[5]) && liveStageRows().filter(spins).length === 2, 'en la pantalla, «Generando imágenes» y «Generando el avatar» giran juntas')
  emit({ type: 'stage-completed', stageId: 'images' })
  await waitFor(() => stagesNow() === '["avatar"]' && text().includes(hint), 'las imágenes terminan y el avatar sigue: su panel, con su ayuda')
  check(probe.task.completedStages.at(-1) === 'images' && probe.task.imagesRecovery === null, 'las imágenes quedan hechas y su pasada de recuperación se cierra')
  check(panelRow(1) && panelRow(2) && cardWith(2, 'create.progress.avatarCardGenerating') !== null, 'el panel lista las dos apariciones y la grilla sigue a la vista')
  const panelTime = () => panelRow(1)?.querySelector('time')?.textContent
  const timeBefore = panelTime()
  await delay(1300)
  check(timeBefore && panelTime() !== timeBefore, 'el reloj del panel corre mientras el avatar sigue: ' + timeBefore + ' → ' + panelTime())
  emit({ type: 'avatar-scene-ready', sceneId: 2, scene: { ...alongsideScenes[1], avatar: readyView } })
  emit({ type: 'stage-completed', stageId: 'avatar' })
  await waitFor(() => stagesNow() === '[]' && !text().includes(hint), 'el avatar termina: sin fases en curso, el panel sin su ayuda')
  check(JSON.stringify(probe.task.completedStages.slice(-2)) === '["images","avatar"]' && panelRow(1), 'las dos hechas, en el orden en que terminaron, y el panel sigue con lo que pasó')
  emit({ type: 'job-completed', result: { status: 'completed', videoPath: '/v/juntos-1.mp4' } })
  await waitFor(() => probe.task.status === 'completed', 'termina el primer orden')

  // El avatar termina primero.
  await runAlongside('pa2')
  emit({ type: 'stage-started', stageId: 'images' })
  emit({ type: 'stage-started', stageId: 'avatar' })
  emit({ type: 'avatar-scene-started', sceneId: 2 })
  emit({ type: 'avatar-scene-ready', sceneId: 2, scene: { ...alongsideScenes[1], avatar: readyView } })
  emit({ type: 'avatar-scene-started', sceneId: 3 })
  emit({ type: 'avatar-scene-failed', sceneId: 3, code: 'avatar_render_failed' })
  emit({ type: 'stage-completed', stageId: 'avatar' })
  await waitFor(() => stagesNow() === '["images"]' && cardWith(2, 'create.progress.avatarReady') && cardWith(3, 'create.progress.avatarCardFallback'), 'el avatar termina primero: las tarjetas dicen cómo quedó cada aparición')
  check(probe.task.completedStages.at(-1) === 'avatar' && !probe.task.completedStages.includes('images'), 'el avatar queda hecho antes que las imágenes')
  check(!text().includes(hint) && !panelRow(1), 'con las imágenes corriendo, el panel del avatar sigue sin aparecer aunque el avatar terminó')
  check(isDone(liveStageRows()[5]) && spins(liveStageRows()[4]) && liveStageRows().filter(spins).length === 1, 'la fila del avatar queda hecha y la de imágenes sigue girando')
  emit({ type: 'stage-completed', stageId: 'images' })
  await waitFor(() => stagesNow() === '[]' && panelRow(1), 'las imágenes terminan después: el panel del avatar, con lo que pasó')
  check(JSON.stringify(probe.task.completedStages.slice(-2)) === '["avatar","images"]', 'completedStages queda con el avatar antes que las imágenes: nadie supone el orden')
  check(!text().includes(hint) && panelRow(1).textContent.includes(i18n.t('create.progress.avatarReady')), 'sin el avatar en curso, el panel no corre su reloj ni muestra la ayuda')
  // El cierre del job vacía las fases en curso aunque una no haya avisado que
  // terminaba: la pantalla del video listo no deja una fila girando.
  emit({ type: 'stage-started', stageId: 'render' })
  await waitFor(() => stagesNow() === '["render"]', 'el ensamblado en curso')
  emit({ type: 'job-completed', result: { status: 'completed', videoPath: '/v/juntos-2.mp4' } })
  await waitFor(() => probe.task.status === 'completed', 'termina el segundo orden')
  check(stagesNow() === '[]' && liveStageRows().filter(spins).length === 0, 'el video listo no deja fases en curso ni filas girando')

  // Una fase salteada sale de las que corren sin haber corrido; la vigilancia
  // del modelo de prompts solo la reinicia el arranque de su fase; el fin del
  // job vacía las fases en curso, también las que no avisaron que terminaban.
  await runAlongside('pa3')
  emit({ type: 'stage-started', stageId: 'scene-prompts' })
  await waitFor(() => probe.task.promptsStageActivity !== null, 'arranca la vigilancia de los prompts')
  const watch = probe.task.promptsStageActivity
  emit({ type: 'stage-started', stageId: 'images' })
  emit({ type: 'stage-skipped', stageId: 'avatar' })
  await waitFor(() => stagesNow() === '["scene-prompts","images"]' && probe.task.completedStages.includes('avatar'), 'el avatar salteado no queda en curso')
  check(probe.task.promptsStageActivity === watch, 'el arranque de otra fase no toca la vigilancia del modelo de prompts')
  emit({ type: 'stage-completed', stageId: 'scene-prompts' })
  await waitFor(() => stagesNow() === '["images"]' && probe.task.promptsStageActivity === null, 'la vigilancia termina con su fase')
  checks += 1
  emit({ type: 'stage-started', stageId: 'avatar' })
  await waitFor(() => stagesNow() === '["images","avatar"]', 'otra vez las dos')
  emit({ type: 'job-failed', code: 'render_failed', message: 'fin' })
  await waitFor(() => probe.task.status === 'error' && stagesNow() === '[]', 'el fin del job vacía las fases en curso')
  checks += 1
  // Cambiar de modelo de prompts a mitad de la fase: el cierre del job viejo
  // no pasa por el reductor (la tarea espera el cambio), así que el job nuevo
  // arranca sin las fases del anterior.
  probe.api.discardTask()
  await waitFor(() => probe.task === null, 'se descarta la tarea')
  await probe.api.startPipelineForProject('pa4', 'Cambio de modelo', { usesCustomStyle: true, promptModel: 'modelo-a', seed: { scenes: [], completedStages: ['voice', 'transcription', 'scene-cuts'], audioDurationSeconds: 40 } })
  await waitFor(() => probe.task?.projectId === 'pa4' && probe.task.jobId === 'job-pa4', 'arranca el job con estilo propio')
  emit({ type: 'stage-started', stageId: 'scene-prompts' })
  await waitFor(() => stagesNow() === '["scene-prompts"]', 'los prompts en curso')
  const switching = probe.api.switchPromptModel('modelo-b')
  await waitFor(() => probe.task.promptModelSwitch === 'cancelling', 'se cierra el job viejo')
  emit({ type: 'job-failed', code: 'cancelled', message: 'cancelado' })
  await switching
  await waitFor(() => probe.task.promptModel === 'modelo-b' && probe.task.status === 'generating', 'el job nuevo con el otro modelo')
  check(stagesNow() === '[]', 'el job relanzado arranca sin las fases en curso del anterior: ' + stagesNow())
  emit({ type: 'job-failed', code: 'render_failed', message: 'fin' })
  await waitFor(() => probe.task.status === 'error', 'se libera el turno del cambio de modelo')

  // (d) Los otros lectores de las fases en curso (M-1 de la revisión de WP-B).
  // El panel de la voz sigue a su fase aunque el disco ya la tenga terminada
  // (cambiar de voz relanza la misma tarea); el del ensamblado, a la suya y
  // al cierre del job.
  await runAlongside('pv')
  check(probe.task.completedStages.includes('voice'), 'la voz ya figura terminada en el disco')
  const voiceTitle = i18n.t('create.progress.voice.title', { provider: 'edge' })
  const renderHint = i18n.t('create.progress.render.chunks')
  check(i18n.exists('create.progress.voice.title') && i18n.exists('create.progress.render.chunks') && voiceTitle.includes('edge'), 'los textos de los paneles de voz y de ensamblado son frases del catálogo')
  emit({ type: 'stage-started', stageId: 'voice' })
  emit({ type: 'voice-progress', provider: 'edge', totalChars: 1200, elapsedSeconds: 3, percent: 40 })
  await waitFor(() => text().includes(voiceTitle), 'el panel de la voz mientras la voz corre de nuevo')
  checks += 1
  emit({ type: 'stage-completed', stageId: 'voice' })
  await waitFor(() => stagesNow() === '[]' && !text().includes(voiceTitle), 'al terminar la voz, su panel se va')
  checks += 1
  emit({ type: 'stage-started', stageId: 'render' })
  emit({ type: 'render-progress', percent: 40, phase: 'chunks' })
  await waitFor(() => text().includes(renderHint), 'el panel del ensamblado mientras ensambla')
  checks += 1
  emit({ type: 'job-completed', result: { status: 'completed', videoPath: '/v/pv.mp4' } })
  await waitFor(() => probe.task.status === 'completed' && !text().includes(renderHint), 'al cerrar el job, el panel del ensamblado se va')
  checks += 1
  // La animación en curso trae su fila y su panel, con la ayuda y el reloj de
  // cada clip, aunque la tarea no la tenga por datos; al terminar, la ayuda se
  // va.
  await runAlongside('pw')
  const animationHint = i18n.t('create.progress.animationProgressHint')
  check(i18n.exists('create.progress.animationProgressHint') && !text().includes(animationHint) && liveStageRows().length === 7, 'antes de la animación, ni su fila ni su panel')
  emit({ type: 'stage-started', stageId: 'animation' })
  await waitFor(() => text().includes(animationHint) && liveStageRows().length === 8 && spins(liveStageRows()[6]), 'con la animación en curso, su fila gira y su panel corre el reloj con la ayuda')
  checks += 1
  emit({ type: 'stage-completed', stageId: 'animation' })
  await waitFor(() => !text().includes(animationHint), 'al terminar la animación, el panel ya no corre')
  checks += 1
  emit({ type: 'job-completed', result: { status: 'completed', videoPath: '/v/pw.mp4' } })
  await waitFor(() => probe.task.status === 'completed', 'termina la animación')
  // Un fallo del proveedor con los prompts en curso bloquea el modelo elegido
  // y abre la decisión; el mismo fallo con otra fase en curso, no.
  const customRun = async (projectId, stageId) => {
    probe.api.discardTask()
    await waitFor(() => probe.task === null, 'se descarta la tarea')
    await probe.api.startPipelineForProject(projectId, 'Modelo ' + projectId, { usesCustomStyle: true, promptModel: 'modelo-' + projectId, seed: { scenes: [], completedStages: ['voice', 'transcription', 'scene-cuts'], audioDurationSeconds: 40 } })
    await waitFor(() => probe.task?.projectId === projectId && probe.task.jobId !== null, 'arranca ' + projectId)
    emit({ type: 'stage-started', stageId })
    await waitFor(() => stagesNow() === '["' + stageId + '"]', stageId + ' en curso')
    emit({ type: 'job-failed', code: 'llm_provider_error', message: 'el proveedor falló' })
    await waitFor(() => probe.task.status === 'error', 'el fallo de ' + projectId)
  }
  await customRun('pp1', 'scene-prompts')
  check(probe.task.promptModelIssue?.reason === 'error' && probe.task.promptModelIssue.modelId === 'modelo-pp1' && stagesNow() === '[]', 'con los prompts en curso, el fallo del proveedor bloquea el modelo y abre la decisión: ' + JSON.stringify(probe.task.promptModelIssue))
  await customRun('pp2', 'images')
  check(probe.task.promptModelIssue === null && probe.task.errorCode === 'llm_provider_error', 'con otra fase en curso, el mismo fallo es un error más, sin bloquear el modelo')
  // El vigilante del modelo de prompts mira que su fase esté entre las que
  // corren (puede correr otra a la vez); el resto de sus condiciones, igual.
  const watchedTask = { usesCustomStyle: true, status: 'generating', activeStages: ['scene-prompts'], imagesRecovery: null, promptModelSwitch: null, promptsStageActivity: { startedAt: 1, lastProgressAt: 1 }, promptModelIssue: null }
  check(isPromptStageWatched(watchedTask) && isPromptStageWatched({ ...watchedTask, activeStages: ['scene-prompts', 'images'] }), 'el vigilante mira los prompts en curso, también con otra fase a la vez')
  check(!isPromptStageWatched({ ...watchedTask, activeStages: ['images', 'avatar'] }) && !isPromptStageWatched({ ...watchedTask, activeStages: [] }), 'sin los prompts en curso no vigila, aunque corran las imágenes y el avatar')
  check(!isPromptStageWatched({ ...watchedTask, usesCustomStyle: false }) && !isPromptStageWatched({ ...watchedTask, status: 'error' }) && !isPromptStageWatched({ ...watchedTask, imagesRecovery: { kind: 'rewrite', sceneIds: [1], pass: 1, maxPasses: 2, streamed: 0 } }) && !isPromptStageWatched({ ...watchedTask, promptModelSwitch: 'cancelling' }) && !isPromptStageWatched({ ...watchedTask, promptsStageActivity: null }), 'sin estilo propio, sin job, en una recuperación, cambiando de modelo o sin actividad, no vigila')
  check(!isPromptStageWatched({ ...watchedTask, promptModelIssue: { reason: 'stalled', modelId: 'm', snoozedUntil: null } }) && isPromptStageWatched({ ...watchedTask, promptModelIssue: { reason: 'stalled', modelId: 'm', snoozedUntil: 5 } }), 'con el aviso a la vista no vigila; silenciado, sí')

  // (c) La pantalla de la biblioteca hace lo mismo.
  const alongsideOnDisk = diskStatus('Juntos en la biblioteca', true)
  alongsideOnDisk.metadata.completedStages = BEFORE_IMAGES
  alongsideOnDisk.scenes = alongsideScenes
  window.projectStatuses.pl = alongsideOnDisk
  probe.api.discardTask()
  await waitFor(() => probe.task === null, 'se descarta la tarea')
  await resumeFromLibrary('pl')
  emit({ type: 'stage-started', stageId: 'images' })
  emit({ type: 'stage-started', stageId: 'avatar' })
  emit({ type: 'avatar-scene-started', sceneId: 3 })
  emit({ type: 'avatar-scene-progress', sceneId: 3, phase: 'render', elapsedSeconds: 30 })
  const libraryCard = await waitFor(() => cardWith(3, 'create.progress.avatarCardGenerating'), 'en la biblioteca, la tarjeta de la aparición que arrancó se genera')
  check(percentOf(libraryCard) !== null && cardWith(2, 'create.progress.avatarQueued') !== null, 'con su porcentaje, y la que no arrancó en espera')
  check(!text().includes(hint) && liveStageRows().length === 7 && spins(liveStageRows()[4]) && spins(liveStageRows()[5]), 'en la biblioteca giran las dos filas y el panel del avatar espera a que terminen las imágenes')
  emit({ type: 'stage-completed', stageId: 'images' })
  await waitFor(() => text().includes(hint) && panelRow(2), 'en la biblioteca, el panel del avatar cuando las imágenes terminan')
  checks += 1
  emit({ type: 'job-failed', code: 'render_failed', message: 'fin' })
  await waitFor(() => probe.task.status === 'error', 'se libera el turno')
  document.getElementById('result').textContent = 'PASS: avatar progress (' + checks + ' checks)'
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
    '<!doctype html><meta charset="utf-8"><div id="root"></div><pre id="result">RUNNING</pre><script type="module" src="./app.js"></script>',
  )
  await withChrome(chrome, join(root, 'profile'), async (call) => {
    const { targetId } = await call('Target.createTarget', {
      url: pathToFileURL(join(root, 'index.html')).href,
    })
    const { sessionId } = await call('Target.attachToTarget', {
      targetId,
      flatten: true,
    })
    await new Promise((done) => setTimeout(done, 1000))
    const result = await call(
      'Runtime.evaluate',
      {
        expression:
          '(async () => { for (let i = 0; i < 400; i++) { const text = document.getElementById("result")?.textContent; if (text && text !== "RUNNING") return text; await new Promise(resolve => setTimeout(resolve, 50)); } return "FAIL: UI timeout: " + document.body.innerText; })()',
        awaitPromise: true,
        returnByValue: true,
      },
      sessionId,
    )
    const status = result.result?.value
    assert.ok(status?.startsWith('PASS:'), status ?? JSON.stringify(result))
    process.stdout.write(status + '\n')
  })
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 3 })
}
