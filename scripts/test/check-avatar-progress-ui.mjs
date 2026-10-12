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
// su acción. Solo `videosApi` se simula (el real importa el cliente
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
    'const previous = { id: "tc-previous", jobId: null, projectId: "p0", projectName: "Anterior", status: "completed", stage: null, completedStages: ["voice"], scenes: [{ id: 1, text: "", imageStatus: "ok", avatar: look, avatarActivity: { status: "generating", phase: "render", elapsedSeconds: 40, receivedAt: 1 } }], audioDurationSeconds: 150, voiceProgress: null, bgmProgress: null, renderProgress: null, promptsWritten: null, imagesRecovery: null, confirmation: null, logs: [], videoPath: null, errorKey: null, errorCode: null, startedAt: 1, pausedAt: null, pausedMs: 0, finishedAt: 2, retry: null, retryAttempts: 0, videoFormat: "16:9", cancelRequested: false, usesCustomStyle: false, promptModel: null, promptsStageActivity: null, promptModelIssue: null, promptModelSwitch: null, imageProvider: null, voiceVendor: null, creditsIssue: null, hasAvatar: true, avatarDropped: 2 }',
    'try { localStorage.setItem(CREATE_TASK_STORAGE_KEY, JSON.stringify(previous)) } catch {}',
    'export const videosApi = {',
    '  ...real,',
    '  isNative: () => true,',
    '  async projectStatus(projectId) { return window.projectStatuses[projectId] },',
    '  async projectDetail(projectId) { return window.projectDetails[projectId] },',
    '  async listProjects() { return [] },',
    '  imageSource: (path) => "fixture-image://" + path,',
    '  videoSource: (path) => "fixture-media://" + path,',
    '  async createProject() { return { projectId: "pc" + (window.createdProjects = (window.createdProjects ?? 0) + 1) } },',
    '  async startPipeline(payload, onEvent) { window.emitPipelineEvent = onEvent; return { jobId: "job-" + payload.projectId, stop() {} } },',
    '  async cancelJob() {},',
    '  async confirmScenes() {},',
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
  check(!taskHasAvatar({ stage: null, scenes: [{ id: 1, text: '', imageStatus: 'ok' }] }) && taskHasAvatar({ hasAvatar: true, stage: null, scenes: [] }) && taskHasAvatar({ stage: 'avatar', scenes: [] }) && taskHasAvatar({ stage: null, scenes: base }), 'avatar por datos: pedido, en curso o con escenas de avatar')

  // 3. La fila de la fase.
  render(<StageBar currentStage="avatar" showAnimation={false} showAvatar completedStages={BEFORE_AVATAR} paused={false} recovery={null} promptModelStalled={false} />)
  await waitFor(() => rows().length === 7, 'siete fases con la del avatar')
  // La fase pendiente lleva un punto delante («·Ensamblando video»).
  const labels = rows().map((row) => row.textContent)
  check(labels[4] === i18n.t('create.stages.images') && labels[5] === i18n.t('create.stages.avatar') && labels[6].endsWith(i18n.t('create.stages.render')), 'la fila del avatar va entre imágenes y ensamblado: ' + labels.join(' | '))
  check(rows()[5].className.includes('border-amethyst/60'), 'la fase del avatar en curso va en morado')
  // Con animación también: el avatar va antes (la animación respeta sus tramos).
  render(<StageBar currentStage="animation" showAnimation showAvatar completedStages={[...BEFORE_AVATAR, 'avatar']} paused={false} recovery={null} promptModelStalled={false} />)
  await waitFor(() => rows().length === 8, 'ocho fases con avatar y animación')
  const allLabels = rows().map((row) => row.textContent)
  check(allLabels[5].endsWith(i18n.t('create.stages.avatar')) && allLabels[6].endsWith(i18n.t('create.stages.animation')) && allLabels[7].endsWith(i18n.t('create.stages.render')) && rows()[6].className.includes('border-sky/60'), 'el avatar va antes de la animación y la animación conserva su celeste')
  render(<StageBar currentStage="render" showAnimation={false} showAvatar={false} completedStages={BEFORE_AVATAR} paused={false} recovery={null} promptModelStalled={false} />)
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

  await probe.api.startPipelineForProject('p1', 'Con avatar', { hasAvatar: true, seed: { scenes: base, completedStages: BEFORE_AVATAR, audioDurationSeconds: 150 } })
  await waitFor(() => probe.task?.projectId === 'p1' && probe.task.status === 'generating', 'el job arranca')
  check(probe.task.hasAvatar === true && probe.task.avatarDropped === undefined, 'el proyecto con avatar lo sabe desde el arranque')
  emit({ type: 'stage-started', stageId: 'avatar' })
  emit({ type: 'avatar-planned', sceneIds: [1, 2, 3], dropped: 2 })
  emit({ type: 'avatar-scene-started', sceneId: 1 })
  emit({ type: 'avatar-scene-progress', sceneId: 1, phase: 'render', elapsedSeconds: 30 })
  await waitFor(() => probe.task.stage === 'avatar' && probe.task.scenes[0].avatarActivity?.phase === 'render', 'el render llega a su escena')
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
  check(JSON.stringify(avatarRunOptions(avatarOptions)) === JSON.stringify({ hasAvatar: true, avatarLookType: 'photo_avatar' }) && JSON.stringify(avatarRunOptions(undefined)) === JSON.stringify({ hasAvatar: false }), 'avatarRunOptions: con y sin avatar')
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
  const runToTheEnd = async (projectId, seedScenes, hasAvatar = true) => {
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
    await probe.api.startPipelineForProject(projectId, 'Final ' + projectId, { hasAvatar, seed: { scenes: seedScenes, completedStages: BEFORE_AVATAR, audioDurationSeconds: 150 } })
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
