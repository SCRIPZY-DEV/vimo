// El borrador de Crear montado de verdad (design §9, entrega 2b): la vista
// Create entera, con sus hooks reales, en Chrome headless. Afirma el
// cableado de Create.tsx que check-create-draft.mjs (el módulo puro) no ve:
// un formulario intacto no se guarda (así Crear sigue tomando las
// preferencias del momento); la selección de la otra pestaña también es
// borrador y, una vez escrito, el borrador refleja todo (también una vuelta
// a los valores de la semilla); cambiar el nombre y el avatar, salir y volver
// los conserva; si un pre-chequeo frena (el saldo de HeyGen releído no
// alcanza) o se cancela mientras corren, no se crea el proyecto y el borrador
// sigue; si createProject falla (una clave o un avatar rechazados) el
// borrador también sigue, así salir por el menú sin «Crear otro» y volver no
// pierde el formulario; recién con el proyecto creado se descarta; «Crear
// otro» vuelve al formulario tal como estaba y lo guarda de nuevo, así salir
// sin tocar nada y volver lo conserva, salvo la semilla intacta de un montaje
// nuevo (salir durante el job y volver), que no se guarda hasta que se cambia
// algo; cerrar la confirmación de escenas hace lo mismo; la
// autonavegación al editor (un proyecto terminado sin video) no lo guarda;
// sin borrador, Crear toma la preferencia nueva; con borrador manda el
// borrador, salvo lo que Crear no edita y solo siembra Ajustes (la duración
// de escena de las gemas y su pausa), que sale de la preferencia actual y es
// lo que viaja en el envío; y la demo no lo lee, no lo escribe ni lo
// descarta, tampoco con «Crear otro».
// Sin red: Tauri y fetch van simulados y rechazan todo lo que no se fija acá;
// las APIs que importan parten de las reales con solo esas lecturas
// reemplazadas, y un envoltorio de CreateForm expone lo que Create le pasa
// (valor, onChange y onSubmit) para manejar el estado sin llenar la UI. El
// pipeline se simula por eventos: el proyecto falla al crearse, o se crea y
// el job falla, pausa en la confirmación de escenas o termina sin video.
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
const root = await mkdtemp(join(tmpdir(), 'vimo-create-draft-ui-'))
// Cada lectura nueva del guard se reemplaza en el módulo real (el simulacro
// parte de él), así un miembro nuevo del api no queda viejo en silencio.
const mocks = {
  '@/modules/common/supabase/client':
    'export const supabase = { auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, functions: { invoke: async () => ({ data: null, error: new Error("guard: sin red") }) } }',
  '@/modules/avatars/api': [
    "import { avatarsApi as real } from './src/modules/avatars/api/index.ts'",
    'export const avatarsApi = { ...real, isNative: () => true, async list() { return structuredClone(window.fixture.avatars) }, async refresh(id) { return structuredClone(window.fixture.avatars.find((item) => item.id === id)) }, async balance() { window.balanceCalls += 1; if (window.fixture.balanceDelayMs) await new Promise((done) => setTimeout(done, window.fixture.balanceDelayMs)); return structuredClone(window.fixture.balance) }, async listStockLooks() { return { looks: [], nextToken: null } }, async listStockGroups() { return { groups: [], nextToken: null } }, imageSource: (path) => "fixture://" + path }',
  ].join('\n'),
  '@/modules/api-keys/api': [
    "import { apiKeysApi as real } from './src/modules/api-keys/api/index.ts'",
    'export const apiKeysApi = { ...real, isNative: () => true, async getStatus() { return window.fixture.keys.map((providerId) => ({ providerId, configured: true, source: "manual", maskedKey: "••••", savedAt: 0, lastValidatedAt: null })) } }',
  ].join('\n'),
  '@/modules/settings/api': [
    "import { settingsApi as real } from './src/modules/settings/api/index.ts'",
    'export const settingsApi = { ...real, async getDefaultSceneCount() { return window.prefs.sceneCount }, async getSceneDurationDefaults() { return { secondsPerScene: window.prefs.secondsPerScene, confirmScenes: window.prefs.confirmScenes } }, async getPromptModelDefaults() { return { modelId: null, compact: false } }, async getVoiceVendor() { return null } }',
  ].join('\n'),
  // `fixture.pipeline`: «fail» = el proyecto falla al crearse; con el
  // proyecto creado, «pipeline-fail» = el job falla, «confirm» = pausa en la
  // confirmación de escenas, «complete» = termina sin video y «hang» = el job
  // sigue corriendo.
  // `fixture.balanceDelayMs` demora la lectura del saldo (los pre-chequeos) y
  // `fixture.createDelayMs`, la creación del proyecto.
  '@/modules/videos/api': [
    "import { videosApi as real } from './src/modules/videos/api/index.ts'",
    'export const videosApi = { ...real, isNative: () => true, async createProject(payload) { window.createProjectCalls += 1; window.lastPayload = payload; if (window.fixture.createDelayMs) await new Promise((done) => setTimeout(done, window.fixture.createDelayMs)); if (window.fixture.pipeline === "fail") { const error = new Error("guard: sin proyecto"); error.code = "guard_stop"; throw error } return { projectId: "p-guard" } }, async startPipeline(payload, onEvent) { setTimeout(() => { if (window.fixture.pipeline === "hang") return; if (window.fixture.pipeline === "confirm") { onEvent({ type: "awaiting-scene-confirmation", suggestedScenes: 8, audioDurationSeconds: 60, wordCount: 150, animationMinutes: 0 }); onEvent({ type: "job-completed", result: { status: "awaiting-confirmation" } }); return } if (window.fixture.pipeline === "pipeline-fail") { onEvent({ type: "job-failed", code: "guard_pipeline_failed", message: "guard: el pipeline falla" }); return } onEvent({ type: "job-completed", result: { status: "completed", videoPath: null } }) }, 30); return { jobId: "job-guard", stop() {} } } }',
  ].join('\n'),
  // Lo que Create le pasa al formulario: el valor, onChange y onSubmit.
  '@/modules/videos/components/CreateForm': [
    "import React from 'react'",
    "import { CreateForm as Real } from './src/modules/videos/components/CreateForm.tsx'",
    'export function CreateForm(props) { window.formProps = props; return React.createElement(Real, props) }',
  ].join('\n'),
}
const entry = String.raw`
import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import i18n from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router'
import es from './public/locales/es.json'
import { TooltipProvider } from '@/modules/common/ui/tooltip'
import { queryClient } from '@/modules/common/queryClient'
import { Create } from '@/modules/videos/views/Create'
import { VideosRoutes, libraryEditorPath } from '@/modules/videos/constants'
import { hasBusyCreateTask, useCreateTask } from '@/modules/videos/hooks/useCreateTask'
import { readCreateDraft } from '@/modules/videos/utilities/createDraft'

let checks = 0
let renderError
const check = (condition, message) => { if (!condition) throw new Error(message); checks += 1 }
const delay = (ms = 30) => new Promise((done) => setTimeout(done, ms))
async function waitFor(get, message) {
  for (let index = 0; index < 200; index++) { if (renderError) throw renderError; const value = get(); if (value) return value; await delay() }
  throw new Error(message)
}
await i18n.init({ lng: 'es', resources: { es: { translation: es } }, interpolation: { escapeValue: false } })

const look = (lookId, name) => ({ lookId, name, lookType: 'photo_avatar', supportedEngines: ['avatar_iii'], preferredOrientation: 'landscape', status: 'ready', origin: 'heygen', previewPath: '/library/looks/' + lookId + '.png', createdAt: '2026-10-09T00:00:00Z' })
const LIBRARY = [{ id: 'ana-1', name: 'Ana', groupId: 'group-ana-1', ownership: 'own', status: 'ready', mainLookId: 'look-ana', looks: [look('look-ana', 'Ana oficina')], previewPath: '/library/ana-1.jpg', createdAt: '2026-10-09T00:00:00Z' }]
const ANA = { id: 'ana-1', name: 'Ana', lookId: 'look-ana', lookName: 'Ana oficina', lookType: 'photo_avatar' }
const story = (id, name) => ({ id, suggestedName: name, script: 'Guion de ' + name, sceneCount: 6, audioDurationSeconds: 30, audioFile: '/pack/' + id + '.mp3' })
const DEMO = { version: '3', voice: { provider: 'minimax', voiceId: 'v1', name: 'Lucía' }, stories: { '16:9': { styles: [story('normal', 'Historia demo')], customStyle: story('gema', 'Gema demo') } }, customStyleId: 'demo-gem' }
const USD = (remaining) => ({ available: true, remaining, currency: 'usd' })
// Una gema de Mi estilo: con ella el envío lleva la duración de escena y la
// pausa que siembra Ajustes (formPayload).
const GEM = { styleId: 'gema-guard', name: 'Gema del guard', systemPrompt: 'Prompt de la gema', shots: [] }

window.fixture = { avatars: LIBRARY, balance: USD(5), keys: ['heygen'], pipeline: 'fail' }
window.prefs = { sceneCount: 0, secondsPerScene: 5, confirmScenes: true }
window.balanceCalls = 0
window.createProjectCalls = 0

// El router, la tarea y la URL, al alcance del guard. Una tarea frenada por
// un pre-chequeo aparece y se va más rápido que el sondeo del guard: cada
// render con tarea se cuenta.
window.tasksSeen = 0
function Probe() {
  window.navigate = useNavigate()
  window.pathname = useLocation().pathname
  window.task = useCreateTask().task
  if (window.task) window.tasksSeen += 1
  return null
}
const reactRoot = createRoot(document.getElementById('root'), { onUncaughtError: (error) => { renderError = error } })
reactRoot.render(<QueryClientProvider client={queryClient}><I18nextProvider i18n={i18n}><TooltipProvider><MemoryRouter initialEntries={['/fuera']}><Probe /><Routes><Route path={VideosRoutes.create} element={<Create />} /><Route path="*" element={<p id="away">fuera de Crear</p>} /></Routes></MemoryRouter></TooltipProvider></I18nextProvider></QueryClientProvider>)

const form = () => window.formProps?.value
async function goToCreate(state) {
  window.formProps = null
  window.navigate(VideosRoutes.create, state ? { state } : undefined)
  return waitFor(() => form(), 'Crear montado')
}
async function leaveCreate() {
  window.navigate('/fuera')
  await waitFor(() => document.getElementById('away'), 'fuera de Crear')
  window.formProps = null
}
async function change(patch) {
  const before = form()
  window.formProps.onChange(patch)
  return waitFor(() => form() !== before && form(), 'el cambio llega al formulario')
}
const buttonNamed = (label, scope = document) => [...scope.querySelectorAll('button')].find((button) => button.textContent.trim() === label)
// «Crear otro» de la pantalla de progreso, con el formulario de vuelta.
async function createAnother() {
  const button = await waitFor(() => buttonNamed(i18n.t('create.progress.createAnother')), 'la pantalla de progreso con «Crear otro»')
  window.formProps = null
  button.click()
  return waitFor(() => window.task === null && form(), '«Crear otro» vuelve al formulario')
}

try {
  await waitFor(() => window.navigate, 'router listo')

  // 1. Montar sin borrador: el formulario intacto no se guarda.
  check(readCreateDraft() === null, 'sin borrador al cargar la app')
  await goToCreate()
  await delay(200)
  check(readCreateDraft() === null, 'un formulario intacto no se guarda como borrador')

  // 1b. La selección de la otra pestaña también es borrador. Una vez escrito,
  // el borrador refleja todo: volver al valor con el que Crear se montó (acá,
  // sin selección y con el formulario intacto) tampoco deja uno viejo.
  window.formProps.onOtherTabStyleChange(GEM)
  await waitFor(() => readCreateDraft()?.otherTabStyle?.styleId === GEM.styleId, 'la selección de la otra pestaña llega al borrador')
  window.formProps.onOtherTabStyleChange(null)
  await delay(200)
  check(readCreateDraft()?.otherTabStyle === null, 'volver a la selección con la que Crear se montó también se guarda: el borrador no queda con la vieja')
  window.formProps.onOtherTabStyleChange(GEM)
  await waitFor(() => readCreateDraft()?.otherTabStyle?.styleId === GEM.styleId, 'la selección vuelve al borrador')
  await leaveCreate()
  await goToCreate()
  check(window.formProps.otherTabStyle?.styleId === GEM.styleId, 'al volver, la selección de la otra pestaña sigue')

  // 2. Cambiar el nombre y el avatar: se escriben; salir y volver los conserva.
  await change({ name: 'Video A' })
  await waitFor(() => readCreateDraft()?.form.name === 'Video A', 'el nombre llega al borrador')
  await change({ useAvatar: true, avatar: ANA })
  await waitFor(() => readCreateDraft()?.form.avatar?.id === 'ana-1', 'el avatar llega al borrador')
  await leaveCreate()
  await goToCreate()
  check(form().name === 'Video A' && form().useAvatar === true && form().avatar?.lookId === 'look-ana', 'al volver, el nombre y el avatar siguen: ' + JSON.stringify({ name: form().name, avatar: form().avatar }))

  // 3. Un pre-chequeo frena (el saldo de HeyGen releído no alcanza): el borrador sigue.
  await delay(300)
  window.fixture.balance = USD(0.2)
  const blockedCalls = window.balanceCalls
  const tasksBefore = window.tasksSeen
  window.formProps.onSubmit()
  await waitFor(() => window.tasksSeen > tasksBefore && window.balanceCalls > blockedCalls && window.task === null, 'la tarea aparece y el pre-check releído frena el envío')
  await delay(200)
  check(window.createProjectCalls === 0, 'con el pre-check frenado no se crea el proyecto')
  check(readCreateDraft()?.form.name === 'Video A', 'si los pre-chequeos frenan, el borrador sigue')

  // 3b. Cancelar mientras corren los pre-chequeos (el saldo tarda): no se crea
  // el proyecto y el borrador sigue.
  window.fixture.balance = USD(5)
  window.fixture.balanceDelayMs = 800
  window.formProps.onSubmit()
  ;(await waitFor(() => buttonNamed(i18n.t('create.progress.cancel')), 'la pantalla de progreso con «Cancelar» mientras corren los pre-chequeos')).click()
  ;(await waitFor(() => buttonNamed(i18n.t('create.progress.cancelConfirm')), 'la confirmación de cancelar')).click()
  await waitFor(() => document.getElementById('away') && window.task === null, 'cancelar lleva a la biblioteca')
  await delay(1100)
  window.fixture.balanceDelayMs = 0
  check(window.createProjectCalls === 0, 'cancelar durante los pre-chequeos no crea el proyecto')
  check(readCreateDraft()?.form.name === 'Video A', 'cancelar durante los pre-chequeos deja el borrador')
  await goToCreate()

  // 3c. Cancelar mientras se crea el proyecto (createProject tarda y después
  // resuelve): el aviso de proyecto creado solo llega con la tarea vigente,
  // así que el borrador sigue.
  window.fixture.pipeline = 'pipeline-fail'
  window.fixture.createDelayMs = 800
  window.formProps.onSubmit()
  await waitFor(() => window.createProjectCalls === 1, 'createProject en curso')
  ;(await waitFor(() => buttonNamed(i18n.t('create.progress.cancel')), '«Cancelar» mientras se crea el proyecto')).click()
  ;(await waitFor(() => buttonNamed(i18n.t('create.progress.cancelConfirm')), 'la confirmación de cancelar')).click()
  await waitFor(() => document.getElementById('away') && window.task === null, 'cancelar lleva a la biblioteca')
  await delay(1100)
  window.fixture.createDelayMs = 0
  window.fixture.pipeline = 'fail'
  check(readCreateDraft()?.form.name === 'Video A', 'cancelar mientras se crea el proyecto deja el borrador: el aviso solo llega con la tarea vigente')
  await goToCreate()

  // 4. Los pre-chequeos pasan pero createProject falla (una clave o un avatar
  // rechazados): el borrador sigue. Salir por el menú sin «Crear otro» y
  // volver: la tarea sigue en error y «Crear otro» muestra el formulario.
  window.formProps.onSubmit()
  await waitFor(() => window.createProjectCalls === 2 && window.task?.status === 'error', 'createProject falla y la tarea queda en error')
  check(readCreateDraft()?.form.name === 'Video A' && readCreateDraft().form.avatar?.id === 'ana-1', 'un createProject que rechaza deja el borrador')
  await leaveCreate()
  window.navigate(VideosRoutes.create)
  await createAnother()
  check(form().name === 'Video A' && form().avatar?.id === 'ana-1', 'createProject falló, se salió por el menú sin «Crear otro» y al volver «Crear otro» muestra el formulario')

  // 5. Con el proyecto creado el borrador se descarta. Si después el job
  // falla, «Crear otro» vuelve al formulario tal como estaba y lo guarda de
  // nuevo: salir sin tocar nada y volver lo conserva.
  window.fixture.pipeline = 'pipeline-fail'
  window.formProps.onSubmit()
  await waitFor(() => window.task?.status === 'error' && window.task.projectId === 'p-guard', 'el proyecto se crea y el job falla')
  check(readCreateDraft() === null, 'un createProject que resuelve descarta el borrador')
  await createAnother()
  check(form().name === 'Video A' && form().avatar?.id === 'ana-1', '«Crear otro» vuelve al formulario tal como estaba')
  check(readCreateDraft()?.form.name === 'Video A' && readCreateDraft().form.avatar?.id === 'ana-1', '«Crear otro» guarda el formulario que vuelve a mostrar')
  await leaveCreate()
  await goToCreate()
  check(form().name === 'Video A' && form().avatar?.id === 'ana-1', 'tras «Crear otro», salir sin tocar nada y volver: el formulario sigue')

  // 5b. Con el proyecto creado, salir de Crear mientras corre el job y volver:
  // la vista se monta con la semilla fresca de las preferencias. «Crear otro»
  // no guarda esa semilla intacta (Crear sigue tomando las preferencias y las
  // claves); en cuanto se cambia algo, sí.
  window.fixture.pipeline = 'hang'
  window.formProps.onSubmit()
  await waitFor(() => window.task?.status === 'generating' && window.task.projectId === 'p-guard' && readCreateDraft() === null, 'el proyecto se crea y el job sigue corriendo')
  await leaveCreate()
  window.navigate(VideosRoutes.create)
  await createAnother()
  check(form().name === '' && form().avatar === null, 'volver durante el job monta la semilla fresca de las preferencias')
  await delay(200)
  check(readCreateDraft() === null, '«Crear otro» con la semilla intacta de un montaje nuevo no la guarda: Crear sigue tomando las preferencias')
  await waitFor(() => !hasBusyCreateTask(), 'el job cancelado libera el turno')
  await change({ name: 'Video A' })
  await waitFor(() => readCreateDraft()?.form.name === 'Video A', 'después de cambiar algo, el formulario llega al borrador')
  check(readCreateDraft()?.form.name === 'Video A', 'después de cambiar algo, el borrador sí se guarda')

  // 6. Cerrar la confirmación de escenas vuelve al formulario igual que «Crear
  // otro» (el store los trata como el mismo cierre) y también lo guarda.
  window.fixture.pipeline = 'confirm'
  window.formProps.onSubmit()
  const title = await waitFor(() => [...document.querySelectorAll('h2')].find((element) => element.textContent === i18n.t('create.confirmScenes.title')), 'la confirmación de escenas se abre')
  check(window.task?.status === 'awaitingConfirmation' && readCreateDraft() === null, 'en la pausa el borrador ya se descartó (el proyecto existe)')
  window.formProps = null
  buttonNamed(i18n.t('create.form.cancel'), title.parentElement).click()
  await waitFor(() => window.task === null && form(), 'cerrar la confirmación vuelve al formulario')
  check(readCreateDraft()?.form.name === 'Video A', 'cerrar la confirmación guarda el formulario que vuelve a mostrar')
  await leaveCreate()
  await goToCreate()
  check(form().name === 'Video A', 'tras cerrar la confirmación, salir y volver: el formulario sigue')

  // 7. Un proyecto que termina sin video lleva al editor: esa autonavegación
  // descarta la tarea y no guarda el borrador.
  window.fixture.pipeline = 'complete'
  window.formProps.onSubmit()
  await waitFor(() => window.pathname === libraryEditorPath('p-guard'), 'terminado sin video, Crear lleva al editor')
  await delay(200)
  check(window.task === null && readCreateDraft() === null, 'la autonavegación al editor no guarda el borrador')

  // 8. Sin borrador, Crear toma las preferencias nuevas. Con borrador manda el
  // borrador, salvo lo que Crear no edita y solo siembra Ajustes (la duración
  // de escena de las gemas y su pausa): eso sale de la preferencia actual y es
  // lo que viaja al generar.
  window.prefs = { sceneCount: 12, secondsPerScene: 5, confirmScenes: true }
  queryClient.removeQueries()
  await goToCreate()
  check(form().sceneCount === 12 && form().name === '', 'sin borrador, Crear toma la preferencia nueva (' + form().sceneCount + ')')
  await change({ name: 'Video B', styleSource: 'custom', customStyle: GEM })
  await waitFor(() => readCreateDraft()?.form.name === 'Video B', 'el nombre B y la gema llegan al borrador')
  check(readCreateDraft().form.secondsPerScene === 5 && readCreateDraft().form.confirmSceneDuration === true, 'el borrador guarda la duración de escena y la pausa de Ajustes de ese momento')
  await leaveCreate()
  window.prefs = { sceneCount: 20, secondsPerScene: 9, confirmScenes: false }
  queryClient.removeQueries()
  await goToCreate()
  check(form().sceneCount === 12 && form().name === 'Video B' && form().customStyle?.styleId === GEM.styleId, 'con borrador, lo que Crear edita sigue como se dejó (' + form().sceneCount + ', ' + form().name + ')')
  check(form().secondsPerScene === 9 && form().confirmSceneDuration === false, 'con borrador, lo que solo siembra Ajustes sale de la preferencia nueva (' + form().secondsPerScene + ', ' + form().confirmSceneDuration + ')')
  window.fixture.pipeline = 'fail'
  window.lastPayload = null
  window.formProps.onSubmit()
  await waitFor(() => window.lastPayload && window.task?.status === 'error', 'el envío con la gema llega a crear el proyecto')
  check(window.lastPayload.options.secondsPerScene === 9 && window.lastPayload.options.confirmScenes === false, 'el envío usa la duración de escena y la pausa nuevas de Ajustes: ' + JSON.stringify({ secondsPerScene: window.lastPayload.options.secondsPerScene, confirmScenes: window.lastPayload.options.confirmScenes }))
  await createAnother()

  // 9. La demo no lee el borrador, no lo escribe y no lo descarta: ni al
  // generar ni con «Crear otro».
  await leaveCreate()
  const normal = readCreateDraft()
  await goToCreate({ demo: DEMO })
  check(form().name === 'Historia demo', 'en la demo el formulario sale del pack, no del borrador: ' + form().name)
  await change({ name: 'Cambio en la demo' })
  await delay(200)
  check(readCreateDraft() === normal && normal.form.name === 'Video B', 'la demo no escribe el borrador')
  // El proyecto de la demo se crea (y su job falla): onProjectCreated corre.
  window.fixture.pipeline = 'pipeline-fail'
  const demoCalls = window.createProjectCalls
  window.formProps.onSubmit()
  await waitFor(() => window.createProjectCalls > demoCalls && window.task?.status === 'error' && window.task.projectId === 'p-guard', 'en la demo el proyecto se crea y el job falla')
  check(readCreateDraft() === normal, 'la demo no descarta el borrador al crear el proyecto')
  await createAnother()
  check(readCreateDraft() === normal, 'en la demo, «Crear otro» no escribe el borrador')

  document.getElementById('result').textContent = 'PASS: create draft wiring (' + checks + ' checks)'
} catch (error) {
  const reason = renderError && renderError !== error ? ' (render error: ' + renderError.message + ')' : ''
  document.getElementById('result').textContent = 'FAIL: ' + error.message + reason
}
`

// Antes del bundle: sin red, sin Tauri y con los errores de carga a la vista.
const stubs = [
  '<script>',
  'window.addEventListener("error", (event) => { const out = document.getElementById("result"); if (out) out.textContent = "FAIL: load " + event.message })',
  'window.fetch = () => Promise.reject(new Error("guard: sin red"))',
  'window.isTauri = true',
  'window.__TAURI_INTERNALS__ = { invoke: () => Promise.reject(new Error("guard: sin tauri")), convertFileSrc: (path) => "fixture://" + path, transformCallback: () => 0, unregisterCallback: () => {}, metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } } }',
  'window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} }',
  '</script>',
].join('\n')

try {
  const output = await build({
    stdin: { contents: entry, resolveDir: resolve('.'), loader: 'jsx' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    tsconfig: 'tsconfig.app.json',
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
    '<!doctype html><meta charset="utf-8">' +
      stubs +
      '<div id="root"></div><pre id="result">RUNNING</pre><script type="module" src="./app.js"></script>',
  )
  await withChrome(chrome, join(root, 'profile'), async (call) => {
    const { targetId } = await call('Target.createTarget', {
      url: pathToFileURL(join(root, 'index.html')).href,
    })
    const { sessionId } = await call('Target.attachToTarget', {
      targetId,
      flatten: true,
    })
    // Pedidos cortos: cada llamada de CDP tiene su propio plazo (20 s) y la
    // corrida entera tarda más.
    let status = 'RUNNING'
    for (let attempt = 0; attempt < 240 && status === 'RUNNING'; attempt++) {
      await new Promise((done) => setTimeout(done, 250))
      const result = await call(
        'Runtime.evaluate',
        {
          expression: 'document.getElementById("result")?.textContent',
          returnByValue: true,
        },
        sessionId,
      )
      status = result.result?.value ?? 'RUNNING'
    }
    assert.ok(status.startsWith('PASS:'), status)
    process.stdout.write(status + '\n')
  })
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 3 })
}
