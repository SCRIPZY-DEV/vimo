// La puerta de la demo con la descarga en segundo plano (spec demo v4 §3
// «Descarga»): el store del job demo-prepare arranca uno solo, guarda el
// avance con su parte, entrega el manifest, nunca cancela al desuscribirse,
// trata `demo_busy` como espera (mira demo-status hasta que el pack queda
// listo) y toma los GB del disco lleno de `requiredFreeBytes`. Un job mudo
// (un proceso colgado, que no avanza ni termina) pasa a la espera sin
// cancelarlo y sin soltar su listener: si vuelve a hablar, su avance, su fin
// o su fallo cuentan. Un proceso que muere no queda mudo: Rust cierra el job
// con `sidecar_exited` (ADR-0010), un fallo que queda hasta «Reintentar». La
// espera relanza el job cuando demo-status dice que nadie tiene el lock de la
// instalación, y un fallo de la red se olvida cuando nadie mira la puerta:
// volver a entrar sigue solo. Una consulta de demo-status que no vuelve tiene
// tope. Además, qué pantalla
// muestra la puerta (confirmar con el tamaño, seguir sola, avance, espera,
// fallo), el aviso de cada fallo (con el disco lleno, con o sin los GB) y los
// números en el idioma activo. Módulos puros de src/ corridos con Node (type
// stripping), con el sidecar como doble; el aviso del fallo lee constants.ts
// y va empaquetado con esbuild, como en check-app-catalog-payload.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { createDemoPrepareStore } from '../../src/modules/videos/utilities/demoPrepareStore.ts'
import { demoPrepareProgress } from '../../src/modules/videos/utilities/demoPrepareProgress.ts'
import { demoGateScreen } from '../../src/modules/videos/utilities/demoGateScreen.ts'
import {
  demoDownloadGigabytes,
  demoRequiredGigabytes,
  formatGigabytes,
} from '../../src/modules/videos/utilities/demoGigabytes.ts'
import { formatPercent } from '../../src/modules/videos/utilities/formatPercent.ts'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
let workdir
let failureModule

before(async () => {
  const output = await build({
    stdin: {
      contents:
        "export * from './src/modules/videos/utilities/demoFailureMessage.ts'",
      resolveDir: repoRoot,
      sourcefile: 'demo-failure-entry.ts',
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    tsconfig: join(repoRoot, 'tsconfig.app.json'),
  })
  workdir = await mkdtemp(join(tmpdir(), 'demo-gate-guard-'))
  const file = join(workdir, 'demo-failure.mjs')
  await writeFile(file, output.outputFiles[0].contents)
  failureModule = await import(pathToFileURL(file).href)
})

after(async () => {
  await rm(workdir, { recursive: true, force: true })
})

// Los tiempos del store, cortos: la espera consulta cada 5 ms; el perro
// guardián y el tope de demo-status, en 1 s, pasan enseguida a la espera los
// jobs que un test deja corriendo (cada test que los prueba los baja todavía
// más).
const TIMING = {
  pollIntervalMs: 5,
  silenceLimitMs: 1_000,
  statusTimeoutMs: 1_000,
}
const POLL_MS = TIMING.pollIntervalMs
// En la cola de demo-status: una consulta que nunca vuelve.
const NEVER = Symbol('never')
const MANIFEST = {
  version: 'v4',
  voice: { provider: 'ai33', voiceId: 'abel', name: 'Abel' },
  gems: [],
  stories: { '16:9': { styles: [], gems: [] } },
}
const idleJob = {
  status: 'idle',
  progress: null,
  manifest: null,
  errorCode: null,
  requiredFreeBytes: null,
}
const missingPack = (extra = {}) => ({
  ready: false,
  version: 'v4',
  downloadBytes: 4_000_000_000,
  downloadedBytes: 0,
  requiredFreeBytes: 5_000_000_000,
  installing: false,
  ...extra,
})
// Otro demo-prepare vivo tiene el lock de la instalación: la espera sigue
// esperando, no relanza.
const busyPack = (extra = {}) => missingPack({ installing: true, ...extra })

// El sidecar de mentira: demo-prepare entrega sus eventos por `emit` (al
// último job lanzado) o por `emitTo` (al job `n`, desde 0: uno viejo sigue
// pudiendo hablar); demo-status responde la cola `statuses` (el último se
// repite), un Error en la cola es una consulta que falla y NEVER, una que
// nunca vuelve. `holdHandle` deja el invoke en vuelo hasta que el test lo
// suelta y `holdStatus` hace lo mismo con cada consulta; `startError` rechaza
// el invoke. `cancelJob` es una trampa: el store nunca debería llamarlo.
function sidecar({
  statuses = [],
  holdHandle = false,
  holdStatus = false,
  startError = null,
} = {}) {
  const calls = { starts: 0, statuses: 0, stops: 0, cancels: [] }
  const queue = [...statuses]
  const heldStatuses = []
  const jobListeners = []
  let releaseHandle = () => {}
  const handle = {
    jobId: 'demo-job',
    stop() {
      calls.stops += 1
    },
  }
  const api = {
    startDemoPrepare(listener) {
      calls.starts += 1
      jobListeners.push(listener)
      if (startError) return Promise.reject(startError)
      if (!holdHandle) return Promise.resolve(handle)
      return new Promise((resolve) => {
        releaseHandle = () => resolve(handle)
      })
    },
    async demoStatus() {
      calls.statuses += 1
      const next = queue.length > 1 ? queue.shift() : queue[0]
      if (next === NEVER) return new Promise(() => {})
      if (holdStatus) await new Promise((resolve) => heldStatuses.push(resolve))
      if (next instanceof Error) throw next
      return next
    },
    errorCode: (error) => error?.code ?? null,
    async cancelJob(jobId) {
      calls.cancels.push(jobId)
    },
  }
  return {
    api,
    calls,
    emit: (event) => jobListeners.at(-1)(event),
    emitTo: (job, event) => jobListeners[job](event),
    releaseHandle: () => releaseHandle(),
    releaseStatuses: () =>
      heldStatuses.splice(0).forEach((resolve) => resolve()),
  }
}

// Una puerta montada mientras dura el test: al terminar se desmonta, así la
// espera deja de consultar y el proceso puede salir.
function mountGate(t, store, listener = () => {}) {
  t.after(store.subscribe(listener))
}

// Cada snapshot que el store publica, en orden (los estados que duran un
// instante también quedan), con la puerta montada.
function record(t, store) {
  const seen = []
  mountGate(t, store, () => seen.push(store.getSnapshot()))
  return seen
}

// Deja correr las microtareas y los timers cortos.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
// Con los timers simulados: solo las microtareas.
const flush = () => new Promise((resolve) => setImmediate(resolve))
async function waitFor(predicate, what) {
  for (let turn = 0; turn < 400; turn++) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
  throw new Error(`nunca pasó: ${what}`)
}
const progressEvent = (percent, detail) => ({
  type: 'progress',
  percent,
  detail,
})
const failed = (code) => ({ type: 'job-failed', code, message: code })
const completed = (manifest = MANIFEST) => ({
  type: 'job-completed',
  result: { manifest },
})

async function running(options, timing = TIMING) {
  const fake = sidecar(options)
  const store = createDemoPrepareStore(fake.api, timing)
  store.start()
  await settle()
  return { ...fake, store }
}

// ── El store del job ──

test('el store expone solo subscribe, getSnapshot, start y reset', () => {
  const store = createDemoPrepareStore(sidecar().api, TIMING)
  assert.deepEqual(Object.keys(store).sort(), [
    'getSnapshot',
    'reset',
    'start',
    'subscribe',
  ])
  assert.deepEqual(store.getSnapshot(), idleJob)
})

test('start arranca un solo job aunque se llame dos veces', async () => {
  const { store, calls } = await running()
  store.start()
  await settle()

  assert.equal(calls.starts, 1)
  assert.equal(store.getSnapshot().status, 'running')
})

test('el avance guarda el porcentaje total, la fase y la parte', async () => {
  const { store, emit } = await running()

  emit(progressEvent(37, { phase: 'download', part: 2, parts: 4 }))
  assert.deepEqual(store.getSnapshot().progress, {
    percent: 37,
    phase: 'download',
    part: 2,
    parts: 4,
  })

  emit(progressEvent(50, { phase: 'install', part: 2, parts: 4 }))
  assert.equal(store.getSnapshot().progress.phase, 'install')

  // Un detalle sin una fase conocida no cambia nada.
  emit(progressEvent(60, { phase: 'other', part: 3, parts: 4 }))
  assert.equal(store.getSnapshot().progress.percent, 50)
})

test('job-completed deja el manifest y suelta el canal', async () => {
  const { store, emit, calls } = await running()
  emit(progressEvent(99, { phase: 'install', part: 4, parts: 4 }))
  emit(completed())

  const snapshot = store.getSnapshot()
  assert.equal(snapshot.status, 'done')
  assert.deepEqual(snapshot.manifest, MANIFEST)
  assert.equal(snapshot.progress, null)
  assert.equal(calls.stops, 1)
})

test('un resultado sin manifest es un fallo sin código, no una demo lista', async () => {
  const { store, emit } = await running()
  emit({ type: 'job-completed', result: { other: true } })

  assert.equal(store.getSnapshot().status, 'error')
  assert.equal(store.getSnapshot().errorCode, null)
  assert.equal(store.getSnapshot().manifest, null)
})

test('desuscribirse nunca cancela: el job sigue y su avance llega igual', async () => {
  const fake = sidecar()
  const store = createDemoPrepareStore(fake.api, TIMING)
  const unsubscribe = store.subscribe(() => {})
  store.start()
  await settle()
  unsubscribe()

  fake.emit(progressEvent(12, { phase: 'download', part: 1, parts: 4 }))
  assert.equal(store.getSnapshot().status, 'running')
  assert.equal(store.getSnapshot().progress.percent, 12)
  assert.deepEqual(fake.calls.cancels, [])
  assert.equal(fake.calls.stops, 0, 'el listener del canal sigue puesto')

  fake.emit(completed())
  assert.equal(store.getSnapshot().status, 'done')
  assert.deepEqual(fake.calls.cancels, [])
})

test('un evento que llega antes que el handle: el job terminado no revive', async () => {
  const { store, emit, calls, releaseHandle } = await running({
    holdHandle: true,
  })
  emit(completed())
  assert.equal(store.getSnapshot().status, 'done')

  releaseHandle()
  await settle()
  assert.equal(calls.stops, 1)
  assert.equal(store.getSnapshot().status, 'done')
  assert.deepEqual(calls.cancels, [])
})

test('el invoke rechazado deja el error con su código', async () => {
  const { store } = await running({
    startError: Object.assign(new Error('x'), {
      code: 'missing_projects_root',
    }),
  })

  assert.equal(store.getSnapshot().status, 'error')
  assert.equal(store.getSnapshot().errorCode, 'missing_projects_root')
})

test('reset con un job vivo no lo suelta ni lo cancela', async () => {
  const { store, calls } = await running()
  store.reset()
  store.start()
  await settle()

  assert.equal(store.getSnapshot().status, 'running')
  assert.equal(calls.starts, 1)
  assert.deepEqual(calls.cancels, [])
})

test('Reintentar tras un fallo relanza el job', async (t) => {
  const { store, emit, calls } = await running()
  // La persona mira el fallo en la puerta y pulsa «Reintentar».
  mountGate(t, store)
  emit(failed('demo_offline'))
  assert.equal(store.getSnapshot().status, 'error')
  assert.equal(store.getSnapshot().errorCode, 'demo_offline')

  store.start()
  await settle()
  assert.equal(calls.starts, 1, 'start no relanza sobre un fallo sin reset')

  store.reset()
  assert.deepEqual(store.getSnapshot(), idleJob)
  store.start()
  await settle()
  assert.equal(calls.starts, 2)
  assert.equal(store.getSnapshot().status, 'running')
})

test('una demo lista se entrega una vez: sin nadie mirando se olvida', async () => {
  const fake = sidecar()
  const store = createDemoPrepareStore(fake.api, TIMING)
  const unsubscribe = store.subscribe(() => {})
  store.start()
  await settle()
  fake.emit(completed())
  assert.equal(store.getSnapshot().status, 'done')
  unsubscribe()
  assert.deepEqual(store.getSnapshot(), idleJob)

  // Si terminó sin la puerta montada, la espera hasta la próxima visita.
  store.start()
  await settle()
  fake.emit(completed())
  const gate = store.subscribe(() => {})
  assert.deepEqual(store.getSnapshot().manifest, MANIFEST)
  gate()
  assert.deepEqual(store.getSnapshot(), idleJob)
})

// ── Un job mudo: un proceso colgado, que no avanza ni termina ──

test('un job que se queda mudo pasa a la espera sin cancelarlo y entra cuando el pack queda listo', async (t) => {
  // El job sigue vivo con el lock (una parte lenta): la espera no lo relanza.
  const fake = sidecar({
    statuses: [
      busyPack({ downloadedBytes: 2_000_000_000 }),
      { ...missingPack(), ready: true, manifest: MANIFEST },
    ],
  })
  const store = createDemoPrepareStore(fake.api, {
    ...TIMING,
    silenceLimitMs: 30,
  })
  const seen = record(t, store)
  store.start()
  await settle()
  fake.emit(progressEvent(37, { phase: 'download', part: 3, parts: 8 }))

  // El proceso sigue vivo pero no dice nada: solo silencio.
  await waitFor(() => store.getSnapshot().status === 'done', 'la demo lista')
  const waiting = seen.filter((snapshot) => snapshot.status === 'waiting')
  assert.deepEqual(waiting[0].progress, {
    percent: 37,
    phase: null,
    part: null,
    parts: null,
  })
  assert.deepEqual(
    waiting.map((snapshot) => snapshot.progress.percent),
    [37, 50],
  )
  assert.deepEqual(store.getSnapshot().manifest, MANIFEST)
  assert.equal(fake.calls.starts, 1, 'con alguien instalando no lo relanza')
  assert.equal(fake.calls.stops, 1, 'con la demo lista suelta el listener')
  assert.deepEqual(fake.calls.cancels, [], 'nunca cancela el job')

  // Con la demo lista, lo que diga el job después ya no cuenta.
  fake.emit(failed('demo_offline'))
  assert.equal(store.getSnapshot().status, 'done')
})

test('cada evento reinicia el perro guardián: un job que sigue hablando no se da por mudo', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const fake = sidecar()
  const store = createDemoPrepareStore(fake.api, {
    ...TIMING,
    silenceLimitMs: 100,
  })
  store.start()
  await flush()

  // 400 ms en total, pero nunca 100 seguidos sin un evento (de cualquier tipo).
  for (let tick = 0; tick < 5; tick++) {
    t.mock.timers.tick(80)
    fake.emit({ type: 'log', level: 'info', message: 'sigue vivo' })
  }
  assert.equal(store.getSnapshot().status, 'running')

  t.mock.timers.tick(99)
  assert.equal(store.getSnapshot().status, 'running')
  t.mock.timers.tick(1)
  assert.equal(store.getSnapshot().status, 'waiting')
  assert.deepEqual(fake.calls.cancels, [])
})

test('un job que termina o falla apaga el perro guardián', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const done = sidecar()
  const doneStore = createDemoPrepareStore(done.api, {
    ...TIMING,
    silenceLimitMs: 100,
  })
  doneStore.start()
  await flush()
  done.emit(completed())

  const offline = sidecar()
  const offlineStore = createDemoPrepareStore(offline.api, {
    ...TIMING,
    silenceLimitMs: 100,
  })
  // Con la puerta montada: un fallo de la red se muestra mientras alguien
  // mira.
  mountGate(t, offlineStore)
  offlineStore.start()
  await flush()
  offline.emit(failed('demo_offline'))

  t.mock.timers.tick(1_000)
  assert.equal(doneStore.getSnapshot().status, 'done')
  assert.equal(offlineStore.getSnapshot().status, 'error')
  assert.equal(done.calls.stops + offline.calls.stops, 2)
})

// ── El perro guardián no suelta un job vivo ──

test('el perro guardián dispara y después llega job-failed: la puerta muestra el fallo, no queda esperando', async (t) => {
  // El job sigue con el lock: la espera no lo relanza.
  const fake = sidecar({
    statuses: [busyPack({ downloadedBytes: 2_000_000_000 })],
  })
  const store = createDemoPrepareStore(fake.api, {
    ...TIMING,
    silenceLimitMs: 30,
  })
  mountGate(t, store)
  store.start()
  await settle()
  fake.emit(progressEvent(37, { phase: 'download', part: 3, parts: 8 }))
  await waitFor(
    () => store.getSnapshot().status === 'waiting',
    'la espera del perro guardián',
  )
  assert.equal(fake.calls.stops, 0, 'la espera no suelta el listener del job')

  // El sidecar cortó la parte por inactividad: su fallo llega tarde.
  fake.emit(failed('demo_download_failed'))
  const job = store.getSnapshot()
  assert.equal(job.status, 'error')
  assert.equal(job.errorCode, 'demo_download_failed')
  assert.equal(fake.calls.stops, 1, 'el evento final suelta el listener')
  assert.equal(fake.calls.starts, 1)
  assert.deepEqual(fake.calls.cancels, [])
  assert.deepEqual(demoGateScreen({ status: null, statusError: null, job }), {
    kind: 'failed',
    source: 'job',
    errorCode: 'demo_download_failed',
    requiredFreeBytes: null,
  })
})

test('un job-completed tardío, después del perro guardián, entra con su manifest', async (t) => {
  const fake = sidecar({
    statuses: [busyPack({ downloadedBytes: 2_000_000_000 })],
  })
  const store = createDemoPrepareStore(fake.api, {
    ...TIMING,
    silenceLimitMs: 30,
  })
  mountGate(t, store)
  store.start()
  await settle()
  await waitFor(
    () => store.getSnapshot().status === 'waiting',
    'la espera del perro guardián',
  )

  fake.emit(completed())
  assert.equal(store.getSnapshot().status, 'done')
  assert.deepEqual(store.getSnapshot().manifest, MANIFEST)
  assert.equal(fake.calls.stops, 1)
})

test('un progress tardío vuelve a running y rearma el perro guardián', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const fake = sidecar()
  const store = createDemoPrepareStore(fake.api, {
    ...TIMING,
    silenceLimitMs: 100,
  })
  store.start()
  await flush()
  fake.emit(progressEvent(37, { phase: 'download', part: 3, parts: 8 }))
  t.mock.timers.tick(100)
  assert.equal(store.getSnapshot().status, 'waiting')

  // Una conexión lenta: el job vuelve a hablar después del perro guardián.
  fake.emit(progressEvent(38, { phase: 'download', part: 3, parts: 8 }))
  assert.equal(store.getSnapshot().status, 'running')
  assert.deepEqual(store.getSnapshot().progress, {
    percent: 38,
    phase: 'download',
    part: 3,
    parts: 8,
  })

  t.mock.timers.tick(99)
  assert.equal(store.getSnapshot().status, 'running')
  t.mock.timers.tick(1)
  assert.equal(
    store.getSnapshot().status,
    'waiting',
    'el perro guardián volvió a armarse',
  )
  assert.equal(fake.calls.stops, 0)
  assert.deepEqual(fake.calls.cancels, [])
})

test('Reintentar en la espera del perro guardián suelta el listener del job mudo', async (t) => {
  const fake = sidecar({
    statuses: [busyPack({ downloadedBytes: 2_000_000_000 })],
  })
  const store = createDemoPrepareStore(fake.api, {
    ...TIMING,
    silenceLimitMs: 30,
  })
  mountGate(t, store)
  store.start()
  await settle()
  await waitFor(() => store.getSnapshot().status === 'waiting', 'la espera')
  assert.equal(fake.calls.stops, 0)

  store.reset()
  assert.equal(fake.calls.stops, 1, 'Reintentar suelta el listener del mudo')
  store.start()
  assert.equal(fake.calls.starts, 2)
  fake.emitTo(0, completed())
  assert.equal(
    store.getSnapshot().status,
    'running',
    'lo que diga el job viejo ya no cuenta',
  )
  assert.deepEqual(fake.calls.cancels, [])
})

test('un demo_disk_full tardío del job mudo no pisa al job relanzado mientras consulta demo-status', async (t) => {
  const fake = sidecar({
    statuses: [busyPack({ downloadedBytes: 2_000_000_000 })],
    holdStatus: true,
  })
  const store = createDemoPrepareStore(fake.api, {
    ...TIMING,
    silenceLimitMs: 30,
  })
  mountGate(t, store)
  store.start()
  await settle()
  await waitFor(() => store.getSnapshot().status === 'waiting', 'la espera')

  // El mudo falla por disco lleno: el aviso espera la consulta de los GB.
  fake.emitTo(0, failed('demo_disk_full'))
  // Mientras tanto, Reintentar lanza otro job.
  store.reset()
  store.start()
  assert.equal(fake.calls.starts, 2)
  fake.releaseStatuses()
  await settle()

  assert.equal(
    store.getSnapshot().status,
    'running',
    'el fallo del job viejo no pisa al nuevo',
  )
  assert.equal(store.getSnapshot().errorCode, null)
})

// ── La espera relanza el job cuando nadie instala ──

test('la espera del perro guardián relanza el job si nadie tiene el lock y suelta el listener del mudo', async (t) => {
  // El job quedó mudo y ya no tiene el lock (dejó de latir): nadie lo tiene.
  const fake = sidecar({
    statuses: [missingPack({ downloadedBytes: 2_000_000_000 })],
  })
  const store = createDemoPrepareStore(fake.api, {
    ...TIMING,
    silenceLimitMs: 200,
  })
  mountGate(t, store)
  store.start()
  await settle()
  fake.emit(progressEvent(37, { phase: 'download', part: 3, parts: 8 }))

  await waitFor(() => fake.calls.starts === 2, 'el job relanzado')
  assert.equal(store.getSnapshot().status, 'running')
  assert.equal(fake.calls.stops, 1, 'suelta el listener del job mudo')
  assert.deepEqual(fake.calls.cancels, [])

  // Lo que diga el job mudo ya no cuenta; lo del nuevo, sí.
  fake.emitTo(0, failed('demo_offline'))
  assert.equal(store.getSnapshot().status, 'running')
  fake.emit(completed())
  assert.equal(store.getSnapshot().status, 'done')
})

test('al volver a entrar, una espera sin nadie instalando relanza el job', async (t) => {
  const fake = sidecar({
    statuses: [missingPack({ downloadedBytes: 2_000_000_000 })],
  })
  const store = createDemoPrepareStore(fake.api, {
    ...TIMING,
    silenceLimitMs: 200,
  })
  store.start()
  await settle()
  await waitFor(() => store.getSnapshot().status === 'waiting', 'la espera')
  await sleep(POLL_MS * 6)
  assert.equal(fake.calls.statuses, 0, 'sin nadie mirando no consulta')
  assert.equal(fake.calls.starts, 1, 'ni relanza')

  mountGate(t, store)
  await waitFor(() => fake.calls.starts === 2, 'el job relanzado')
  assert.equal(fake.calls.stops, 1)
  fake.emit(completed())
  assert.equal(store.getSnapshot().status, 'done')
})

// ── demo_busy: otro job instala ──

test('demo_busy no es un fallo: espera mirando demo-status y entra con su manifest', async (t) => {
  const fake = sidecar({
    statuses: [
      busyPack({ downloadedBytes: 1_000_000_000 }),
      busyPack({ downloadedBytes: 4_000_000_000 }),
      {
        ...missingPack({ downloadedBytes: 4_000_000_000 }),
        ready: true,
        manifest: MANIFEST,
      },
    ],
  })
  const store = createDemoPrepareStore(fake.api, TIMING)
  const seen = record(t, store)
  store.start()
  await settle()
  fake.emit(failed('demo_busy'))

  assert.equal(store.getSnapshot().status, 'waiting')
  assert.equal(store.getSnapshot().errorCode, null)

  await waitFor(() => store.getSnapshot().status === 'done', 'la demo lista')
  assert.deepEqual(store.getSnapshot().manifest, MANIFEST)
  assert.equal(fake.calls.statuses, 3)
  assert.deepEqual(fake.calls.cancels, [])

  // El avance sale de lo bajado según demo-status, sin parte; con todo bajado
  // pero sin instalar queda en 99 hasta que el pack está listo.
  const waiting = seen.filter((snapshot) => snapshot.status === 'waiting')
  assert.deepEqual(
    waiting.map((snapshot) => snapshot.progress?.percent ?? null),
    [null, 25, 99],
  )
  assert.deepEqual(waiting.at(-1).progress, {
    percent: 99,
    phase: null,
    part: null,
    parts: null,
  })
  assert.ok(
    seen.every((snapshot) => snapshot.status !== 'error'),
    'demo_busy nunca pasa por error',
  )
})

test('mientras espera, el avance de demo-status no retrocede', async (t) => {
  const fake = sidecar({
    statuses: [busyPack({ downloadedBytes: 1_000_000_000 })],
  })
  const store = createDemoPrepareStore(fake.api, TIMING)
  mountGate(t, store)
  store.start()
  await settle()
  fake.emit(progressEvent(40, { phase: 'download', part: 2, parts: 4 }))
  fake.emit(failed('demo_busy'))

  await waitFor(() => fake.calls.statuses >= 2, 'dos consultas')
  assert.equal(store.getSnapshot().progress.percent, 40)
  assert.equal(store.getSnapshot().progress.part, null)
})

test('la espera consulta solo con la puerta montada y retoma al volver', async () => {
  const fake = sidecar({
    statuses: [busyPack({ downloadedBytes: 2_000_000_000 })],
  })
  const store = createDemoPrepareStore(fake.api, TIMING)
  store.start()
  await settle()
  fake.emit(failed('demo_busy'))
  await sleep(POLL_MS * 6)
  assert.equal(fake.calls.statuses, 0, 'sin nadie mirando no consulta')

  const gate = store.subscribe(() => {})
  await waitFor(() => store.getSnapshot().progress?.percent === 50, 'retoma')
  gate()
  await settle()
  const polled = fake.calls.statuses
  await sleep(POLL_MS * 6)
  assert.equal(
    fake.calls.statuses,
    polled,
    'al salir de la puerta deja de consultar',
  )
  assert.equal(store.getSnapshot().status, 'waiting')
})

test('Reintentar durante la espera relanza el job y descarta la consulta en vuelo', async (t) => {
  const fake = sidecar({
    statuses: [busyPack({ downloadedBytes: 2_000_000_000 })],
    holdStatus: true,
  })
  const store = createDemoPrepareStore(fake.api, TIMING)
  mountGate(t, store)
  store.start()
  await settle()
  fake.emit(failed('demo_busy'))
  await waitFor(() => fake.calls.statuses === 1, 'la consulta en vuelo')

  store.reset()
  store.start()
  fake.releaseStatuses()
  await settle()
  assert.equal(fake.calls.starts, 2)
  assert.equal(store.getSnapshot().status, 'running')
  assert.equal(
    store.getSnapshot().progress,
    null,
    'la consulta vieja no cuenta',
  )

  await sleep(POLL_MS * 6)
  assert.equal(fake.calls.statuses, 1, 'con el job nuevo ya no consulta')
})

test('una consulta de demo-status que no vuelve no frena la espera: tras el tope consulta otra vez', async (t) => {
  const fake = sidecar({
    statuses: [NEVER, { ...missingPack(), ready: true, manifest: MANIFEST }],
  })
  const store = createDemoPrepareStore(fake.api, {
    ...TIMING,
    statusTimeoutMs: 20,
  })
  mountGate(t, store)
  store.start()
  await settle()
  fake.emit(failed('demo_busy'))

  await waitFor(() => store.getSnapshot().status === 'done', 'la demo lista')
  assert.equal(fake.calls.statuses, 2)
  assert.deepEqual(store.getSnapshot().manifest, MANIFEST)
})

test('demo_busy: si quien tenía el lock termina sin dejar la demo lista, la espera relanza el job', async (t) => {
  // El otro job falló (se quedó sin red, por ejemplo) y soltó el lock.
  const fake = sidecar({
    statuses: [
      busyPack({ downloadedBytes: 1_000_000_000 }),
      missingPack({ downloadedBytes: 1_000_000_000 }),
    ],
  })
  const store = createDemoPrepareStore(fake.api, TIMING)
  mountGate(t, store)
  store.start()
  await settle()
  fake.emit(failed('demo_busy'))

  await waitFor(() => fake.calls.starts === 2, 'el job relanzado')
  assert.equal(store.getSnapshot().status, 'running')
  assert.equal(fake.calls.statuses, 2, 'esperó mientras el otro tenía el lock')
  assert.deepEqual(fake.calls.cancels, [])
})

// ── Un fallo de la red no queda guardado: volver a entrar sigue solo ──

test('un fallo de la red se muestra mientras se mira y se olvida al salir: la visita siguiente sigue sola', async () => {
  for (const code of ['demo_offline', 'demo_download_failed']) {
    const fake = sidecar()
    const store = createDemoPrepareStore(fake.api, TIMING)
    const gate = store.subscribe(() => {})
    store.start()
    await settle()
    fake.emit(failed(code))
    assert.equal(store.getSnapshot().errorCode, code, `${code}: se muestra`)

    gate()
    assert.deepEqual(
      store.getSnapshot(),
      idleJob,
      `${code}: al salir se olvida`,
    )
    // La visita siguiente: con avance previo, la puerta sigue sola.
    const screen = demoGateScreen({
      status: missingPack({ downloadedBytes: 1_000_000_000 }),
      statusError: null,
      job: store.getSnapshot(),
    })
    assert.deepEqual(screen, { kind: 'resume' }, code)
    store.start()
    assert.equal(fake.calls.starts, 2, `${code}: sigue sin «Reintentar»`)
    fake.emit(completed())
  }
})

test('un fallo de la red sin nadie mirando no se guarda; los demás fallos sí', async () => {
  const { store, emit } = await running()
  emit(progressEvent(40, { phase: 'download', part: 4, parts: 8 }))
  emit(failed('demo_download_failed'))
  assert.deepEqual(
    store.getSnapshot(),
    idleJob,
    'la próxima visita no ve el fallo viejo',
  )

  for (const code of ['demo_pack_corrupt', 'demo_disk_full']) {
    const fake = sidecar({ statuses: [missingPack()] })
    const kept = createDemoPrepareStore(fake.api, TIMING)
    const gate = kept.subscribe(() => {})
    kept.start()
    await settle()
    fake.emit(failed(code))
    await waitFor(() => kept.getSnapshot().status === 'error', code)
    gate()
    assert.equal(
      kept.getSnapshot().errorCode,
      code,
      `${code} queda para la próxima visita`,
    )
  }
})

// ── Un proceso que muere: Rust cierra el job con `sidecar_exited` ──

test('un proceso que muere llega como sidecar_exited: un fallo que queda, sin espera ni relanzamiento', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const fake = sidecar({
    statuses: [missingPack({ downloadedBytes: 2_000_000_000 })],
  })
  const store = createDemoPrepareStore(fake.api, {
    ...TIMING,
    silenceLimitMs: 100,
  })
  const gate = store.subscribe(() => {})
  store.start()
  await flush()
  fake.emit(progressEvent(37, { phase: 'download', part: 3, parts: 8 }))

  // El job-failed que manda Rust cuando el proceso termina sin evento final.
  fake.emit(failed('sidecar_exited'))
  assert.equal(store.getSnapshot().status, 'error')
  assert.equal(store.getSnapshot().errorCode, 'sidecar_exited')
  assert.equal(fake.calls.stops, 1, 'el cierre suelta el listener')

  // Sin perro guardián ni espera: no consulta demo-status ni relanza solo.
  t.mock.timers.tick(1_000)
  await flush()
  assert.equal(store.getSnapshot().status, 'error')
  assert.equal(fake.calls.starts, 1)
  assert.equal(fake.calls.statuses, 0)
  assert.deepEqual(fake.calls.cancels, [])

  // A diferencia de un fallo de la red, queda para la próxima visita.
  gate()
  const job = store.getSnapshot()
  assert.equal(job.errorCode, 'sidecar_exited')
  assert.deepEqual(demoGateScreen({ status: null, statusError: null, job }), {
    kind: 'failed',
    source: 'job',
    errorCode: 'sidecar_exited',
    requiredFreeBytes: null,
  })
})

// ── Disco lleno ──

test('demo_disk_full: los GB salen de requiredFreeBytes, no de lo que falta bajar', async () => {
  // Al fallar: faltan 2 GB por bajar, pero el instalador pide 2,62 GB libres.
  const atFailure = missingPack({
    downloadedBytes: 2_000_000_000,
    requiredFreeBytes: 2_620_000_000,
  })
  const { store, emit, calls } = await running({ statuses: [atFailure] })
  emit(progressEvent(51, { phase: 'download', part: 3, parts: 4 }))
  emit(failed('demo_disk_full'))
  await waitFor(() => store.getSnapshot().status === 'error', 'el fallo')

  const job = store.getSnapshot()
  assert.equal(calls.statuses, 1)
  assert.equal(job.errorCode, 'demo_disk_full')
  assert.equal(job.requiredFreeBytes, 2_620_000_000)

  // La consulta de la puerta es de cuando se montó: la del fallo manda.
  const atMount = missingPack({ requiredFreeBytes: 5_000_000_000 })
  const screen = demoGateScreen({ status: atMount, statusError: null, job })
  assert.deepEqual(screen, {
    kind: 'failed',
    source: 'job',
    errorCode: 'demo_disk_full',
    requiredFreeBytes: 2_620_000_000,
  })
  assert.equal(demoRequiredGigabytes(screen.requiredFreeBytes), 2.7)
  assert.equal(formatGigabytes(2.7, 'es'), '2,7')
})

test('disco lleno sin respuesta de demo-status: la cifra de la puerta o el porqué sin cifra', async () => {
  const { store, emit } = await running({ statuses: [new Error('down')] })
  emit(failed('demo_disk_full'))
  await waitFor(() => store.getSnapshot().status === 'error', 'el fallo')
  const job = store.getSnapshot()
  assert.equal(job.requiredFreeBytes, null)

  const withGate = demoGateScreen({
    status: missingPack({ requiredFreeBytes: 3_100_000_000 }),
    statusError: null,
    job,
  })
  assert.equal(withGate.errorCode, 'demo_disk_full')
  assert.equal(withGate.requiredFreeBytes, 3_100_000_000)

  // Sin ninguna cifra, el porqué se conserva: no es el aviso genérico.
  assert.deepEqual(demoGateScreen({ status: null, statusError: null, job }), {
    kind: 'failed',
    source: 'job',
    errorCode: 'demo_disk_full',
    requiredFreeBytes: null,
  })
})

test('una consulta de demo-status que no vuelve no cuelga el aviso del disco lleno', async () => {
  const { store, emit } = await running(
    { statuses: [NEVER] },
    { ...TIMING, statusTimeoutMs: 20 },
  )
  emit(failed('demo_disk_full'))
  assert.equal(
    store.getSnapshot().status,
    'running',
    'mientras consulta, el job cuenta como vivo',
  )

  await waitFor(() => store.getSnapshot().status === 'error', 'el aviso')
  assert.equal(store.getSnapshot().errorCode, 'demo_disk_full')
  assert.equal(store.getSnapshot().requiredFreeBytes, null)
})

test('el aviso de cada fallo: los GB del disco lleno, el porqué sin cifra si falta y la genérica sin código', () => {
  const { demoFailureMessage } = failureModule
  assert.deepEqual(demoFailureMessage('demo_disk_full', 2_620_000_000, 'es'), {
    key: 'createDemo.errors.diskFull',
    values: { gb: '2,7' },
  })
  assert.deepEqual(demoFailureMessage('demo_disk_full', 2_620_000_000, 'en'), {
    key: 'createDemo.errors.diskFull',
    values: { gb: '2.7' },
  })
  assert.deepEqual(demoFailureMessage('demo_disk_full', null, 'es'), {
    key: 'createDemo.errors.diskFullUnknown',
  })
  assert.deepEqual(demoFailureMessage('demo_offline', null, 'es'), {
    key: 'createDemo.errors.offline',
  })
  assert.deepEqual(demoFailureMessage('missing_projects_root', null, 'es'), {
    key: 'create.errors.missingProjectsRoot',
  })
  assert.deepEqual(demoFailureMessage('sidecar_exited', null, 'es'), {
    key: 'createDemo.errors.sidecarExited',
  })
  for (const code of [null, 'demo_busy', 'cancelled', 'constructor'])
    assert.deepEqual(demoFailureMessage(code, null, 'es'), {
      key: 'createDemo.errors.unknown',
    })
})

test('los tres catálogos: el disco lleno lleva los GB y su versión sin cifra no', () => {
  for (const locale of ['es', 'en', 'pt']) {
    const catalog = JSON.parse(
      readFileSync(join(repoRoot, 'public/locales', `${locale}.json`), 'utf8'),
    )
    const errors = catalog.createDemo.errors
    assert.match(errors.diskFull, /\{\{gb\}\}/, locale)
    assert.equal(typeof errors.diskFullUnknown, 'string', locale)
    assert.doesNotMatch(errors.diskFullUnknown, /\{\{/, locale)
  }
})

// ── La pantalla de la puerta ──

test('sin pack ni avance: confirmar con el tamaño; con avance previo sigue sola', () => {
  assert.deepEqual(
    demoGateScreen({ status: missingPack(), statusError: null, job: idleJob }),
    { kind: 'offer', downloadBytes: 4_000_000_000 },
  )
  assert.deepEqual(
    demoGateScreen({
      status: missingPack({ downloadedBytes: 1 }),
      statusError: null,
      job: idleJob,
    }),
    { kind: 'resume' },
  )
})

test('un job vivo se muestra aunque la consulta no haya llegado', () => {
  const progress = { percent: 12, phase: 'download', part: 1, parts: 4 }
  const job = { ...idleJob, status: 'running', progress }
  assert.deepEqual(demoGateScreen({ status: null, statusError: null, job }), {
    kind: 'progress',
    progress,
  })
  assert.deepEqual(
    demoGateScreen({ status: missingPack(), statusError: null, job }),
    { kind: 'progress', progress },
  )
  const waiting = { ...idleJob, status: 'waiting', progress }
  assert.deepEqual(
    demoGateScreen({ status: null, statusError: null, job: waiting }),
    { kind: 'waiting', progress },
  )
})

test('revisando, lista, demo del job y fallos', () => {
  assert.deepEqual(
    demoGateScreen({ status: null, statusError: null, job: idleJob }),
    { kind: 'checking' },
  )
  assert.deepEqual(
    demoGateScreen({
      status: { ...missingPack(), ready: true, manifest: MANIFEST },
      statusError: null,
      job: idleJob,
    }),
    { kind: 'enter', manifest: MANIFEST },
  )
  assert.deepEqual(
    demoGateScreen({
      status: missingPack(),
      statusError: null,
      job: { ...idleJob, status: 'done', manifest: MANIFEST },
    }),
    { kind: 'enter', manifest: MANIFEST },
  )
  assert.deepEqual(
    demoGateScreen({
      status: null,
      statusError: { code: 'missing_projects_root' },
      job: idleJob,
    }),
    {
      kind: 'failed',
      source: 'status',
      errorCode: 'missing_projects_root',
      requiredFreeBytes: null,
    },
  )
  // El fallo del job manda sobre el de la consulta.
  assert.deepEqual(
    demoGateScreen({
      status: null,
      statusError: { code: null },
      job: { ...idleJob, status: 'error', errorCode: 'demo_offline' },
    }),
    {
      kind: 'failed',
      source: 'job',
      errorCode: 'demo_offline',
      requiredFreeBytes: null,
    },
  )
})

// ── Avance y GB ──

test('demoPrepareProgress lee la fase y la parte; sin ellas no hay parte', () => {
  assert.deepEqual(
    demoPrepareProgress(
      progressEvent(7, { phase: 'download', part: 1, parts: 8 }),
    ),
    { percent: 7, phase: 'download', part: 1, parts: 8 },
  )
  assert.deepEqual(
    demoPrepareProgress(progressEvent(9, { phase: 'install' })),
    {
      percent: 9,
      phase: 'install',
      part: null,
      parts: null,
    },
  )
  assert.equal(demoPrepareProgress(progressEvent(9, { phase: 'x' })), null)
  assert.equal(demoPrepareProgress(progressEvent(9, 'install')), null)
})

test('GB con un decimal: el tamaño al más cercano, el espacio pedido hacia arriba', () => {
  assert.equal(demoDownloadGigabytes(3_341_476_006), 3.3)
  assert.equal(demoDownloadGigabytes(3_360_000_000), 3.4)
  assert.equal(demoRequiredGigabytes(4_200_000_001), 4.3)
  assert.equal(demoRequiredGigabytes(1_100_000_000), 1.1)
  assert.equal(formatGigabytes(3.3, 'es'), '3,3')
  assert.equal(formatGigabytes(3.3, 'en'), '3.3')
  assert.equal(formatGigabytes(3.3, 'pt'), '3,3')
  assert.equal(formatGigabytes(4, 'es'), '4')
})

test('el porcentaje en el formato del idioma activo', () => {
  assert.equal(formatPercent(37, 'es'), '37 %')
  assert.equal(formatPercent(37, 'en'), '37%')
  assert.equal(formatPercent(37, 'pt'), '37%')
  assert.equal(formatPercent(0, 'en'), '0%')
  assert.equal(formatPercent(100, 'en'), '100%')
})
