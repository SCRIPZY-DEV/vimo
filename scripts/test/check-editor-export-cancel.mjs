// Cancelar «Exportar para editar» (entrega 2h) con el store REAL del editor
// (useLibraryEditorTask): el sidecar no corre; `videosApi` es el real con
// solo las llamadas al sidecar reemplazadas (startExportClips, startRender,
// cancelJob, openFolder), así que los eventos del job los emite la prueba.
// Fija: cancelar con el id del job pide la cancelación UNA vez (un segundo
// clic o una tecla repetida no vuelve a llamar); el cierre con `cancelled`
// devuelve el botón sin aviso de error, sin abrir la carpeta y con el proyecto
// libre; un «Cancelar» que llega antes que el id se cumple apenas el id llega;
// un job que termina después de pedir cancelar no abre la carpeta; cancelar
// un job que ya terminó (`JobNotFound`) no deja una promesa rechazada sin
// atender. Y las regresiones: una exportación entera abre su carpeta, un fallo
// real deja su aviso, y cancelar un render sigue cancelando el render.
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
const mocks = {
  '@/modules/common/supabase/client':
    'export const supabase = { auth: { getSession: async () => ({ data: { session: null } }) } }',
  '@/modules/videos/api': [
    "import { videosApi as real } from './src/modules/videos/api/index.ts'",
    'export const videosApi = { ...real, isNative: () => true, startExportClips: (payload, onEvent) => window.startExport(payload, onEvent), startRender: (payload, onEvent) => window.startRender(payload, onEvent), async cancelJob(jobId) { window.cancels.push(jobId); if (window.cancelFails) throw new Error("JobNotFound") }, async openFolder(directory) { window.opened.push(directory) } }',
  ].join('\n'),
  // El store lee si hay otra tarea pesada de Crear: acá no hay ninguna.
  '@/modules/videos/hooks/useCreateTask':
    'export function useCreateTask() { return { task: null } } export function hasBusyCreateTask() { return false } export function subscribeCreateTask() { return () => {} }',
}
const entry = String.raw`
import React from 'react'
import { createRoot } from 'react-dom/client'
import { videosApi } from '@/modules/videos/api'
import { useLibraryEditorTask } from '@/modules/videos/hooks/useLibraryEditorTask'

const check = (condition, message) => { if (!condition) throw new Error(message) }
const delay = (ms = 20) => new Promise(resolve => setTimeout(resolve, ms))
async function waitFor(get, message) {
  for (let index = 0; index < 150; index++) { const value = get(); if (value) return value; await delay() }
  throw new Error('timeout: ' + message)
}
window.cancels = []
window.opened = []
window.unhandled = []
window.addEventListener('unhandledrejection', event => { window.unhandled.push(String(event.reason)) })

function Host() {
  window.store = useLibraryEditorTask('fixture')
  return null
}
const store = () => window.store
// Un job del sidecar simulado: el invoke devuelve el id (al toque o cuando la
// prueba lo suelta) y la prueba emite sus eventos con job.emit.
function fakeJob(jobId, { held = false } = {}) {
  const job = { jobId, stopped: false, emit: null, release: null }
  const handle = { jobId, stop() { job.stopped = true } }
  job.start = (payload, onEvent) => {
    job.emit = onEvent
    if (!held) return Promise.resolve(handle)
    return new Promise(resolve => { job.release = () => resolve(handle) })
  }
  return job
}

createRoot(document.getElementById('root')).render(<Host />)
try {
  await waitFor(() => store(), 'el store montado')

  // 1. Cancelar con el id: una sola vez, sin aviso, sin carpeta, libre.
  let job = fakeJob('export-1')
  window.startExport = job.start
  await store().startExport('fixture')
  await waitFor(() => store().task?.export?.jobId === 'export-1', 'el id del export')
  check(store().isProjectBusy('fixture'), 'el proyecto queda ocupado mientras exporta')
  job.emit({ type: 'progress', percent: 40 })
  await waitFor(() => store().task.export.percent === 40, 'el progreso llega al botón')
  store().cancelActiveJob('fixture')
  store().cancelActiveJob('fixture')
  await delay()
  check(JSON.stringify(window.cancels) === '["export-1"]', 'cancela una sola vez: ' + JSON.stringify(window.cancels))
  check(store().task.export.cancelled === true, 'la exportación queda marcada como cancelada')
  job.emit({ type: 'job-failed', code: 'cancelled', message: 'job cancelled' })
  await waitFor(() => store().task.export === null, 'el botón vuelve')
  check(store().task.errorKey === null && store().task.errorCode === null, 'cancelar no deja aviso de error: ' + store().task.errorKey)
  check(window.opened.length === 0, 'no abre ninguna carpeta')
  check(!store().isProjectBusy('fixture'), 'el proyecto se libera')

  // 2. «Cancelar» antes de que el invoke devuelva el id: se cumple al llegar.
  window.cancels.length = 0
  job = fakeJob('export-2', { held: true })
  window.startExport = job.start
  const started = store().startExport('fixture')
  await waitFor(() => store().task?.export && job.release, 'la exportación pedida, sin id')
  store().cancelActiveJob('fixture')
  await delay()
  check(window.cancels.length === 0 && store().task.export.cancelled, 'sin id no hay a quién cancelar, pero queda pedido')
  job.release()
  await started
  await waitFor(() => window.cancels.length === 1, 'al llegar el id se cancela')
  check(window.cancels[0] === 'export-2' && !job.stopped, 'cancela ese job (y lo sigue escuchando hasta su cierre)')
  job.emit({ type: 'job-failed', code: 'cancelled', message: 'job cancelled' })
  await waitFor(() => store().task.export === null, 'el botón vuelve tras el cierre')
  check(store().task.errorKey === null, 'sin aviso')

  // 3. Pidió cancelar, pero el job terminó antes de cortarse: no abre nada.
  window.cancels.length = 0
  job = fakeJob('export-3')
  window.startExport = job.start
  await store().startExport('fixture')
  await waitFor(() => store().task?.export?.jobId === 'export-3', 'el id del export 3')
  store().cancelActiveJob('fixture')
  job.emit({ type: 'job-completed', result: { directory: '/fixture/clips', clipCount: 3 } })
  await waitFor(() => store().task.export === null, 'el botón vuelve')
  check(window.opened.length === 0, 'no abre la carpeta de una exportación que se pidió cancelar')

  // 4. Regresión: una exportación entera abre su carpeta.
  job = fakeJob('export-4')
  window.startExport = job.start
  await store().startExport('fixture')
  await waitFor(() => store().task?.export?.jobId === 'export-4', 'el id del export 4')
  job.emit({ type: 'job-completed', result: { directory: '/fixture/clips', clipCount: 3 } })
  await waitFor(() => window.opened.length === 1, 'abre la carpeta exportada')
  check(window.opened[0] === '/fixture/clips' && store().task.export === null, 'la carpeta es la del resultado')

  // 5. Regresión: un fallo de verdad deja su aviso.
  job = fakeJob('export-5')
  window.startExport = job.start
  await store().startExport('fixture')
  await waitFor(() => store().task?.export?.jobId === 'export-5', 'el id del export 5')
  job.emit({ type: 'job-failed', code: 'clips_no_images', message: 'scenes without a valid image: 2' })
  await waitFor(() => store().task.export === null, 'el botón vuelve tras el fallo')
  check(store().task.errorCode === 'clips_no_images' && store().task.errorKey === videosApi.errorMessageKey({ code: 'clips_no_images' }), 'un fallo real avisa: ' + store().task.errorKey)
  store().clearError('fixture')

  // 6. Cancelar un job que ya terminó responde JobNotFound: nada queda
  // rechazado sin atender.
  window.cancels.length = 0
  window.cancelFails = true
  job = fakeJob('export-6')
  window.startExport = job.start
  await store().startExport('fixture')
  await waitFor(() => store().task?.export?.jobId === 'export-6', 'el id del export 6')
  store().cancelActiveJob('fixture')
  await delay(60)
  check(window.cancels.length === 1 && window.unhandled.length === 0, 'JobNotFound se atiende: ' + JSON.stringify(window.unhandled))
  job.emit({ type: 'job-failed', code: 'cancelled', message: 'job cancelled' })
  await waitFor(() => store().task.export === null, 'el botón vuelve')
  window.cancelFails = false

  // 7. Regresión: cancelar un render sigue cancelando el render.
  window.cancels.length = 0
  const render = fakeJob('render-1')
  window.startRender = render.start
  await store().startRender('fixture')
  await waitFor(() => store().task?.render?.jobId === 'render-1', 'el id del render')
  store().cancelActiveJob('fixture')
  await delay()
  check(JSON.stringify(window.cancels) === '["render-1"]', 'cancela el render: ' + JSON.stringify(window.cancels))
  render.emit({ type: 'job-failed', code: 'cancelled', message: 'job cancelled' })
  await waitFor(() => store().task.render === null, 'el render se cierra')

  document.getElementById('result').textContent = 'PASS: cancelar «Exportar para editar» (7 casos)'
} catch (error) {
  document.getElementById('result').textContent = 'FAIL: ' + error.message
}
`

test('cancelar «Exportar para editar» con el store real del editor', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vimo-editor-export-cancel-'))
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
      // Como check-export-header-ui.mjs: la página termina de cargar antes de
      // evaluar (si no, Chrome responde «Execution context was destroyed»).
      await new Promise((resolve) => setTimeout(resolve, 1000))
      const result = await call(
        'Runtime.evaluate',
        {
          expression:
            '(async () => { for (let i = 0; i < 300; i++) { const text = document.getElementById("result")?.textContent; if (text && text !== "RUNNING") return text; await new Promise(resolve => setTimeout(resolve, 50)); } return "FAIL: UI timeout"; })()',
          awaitPromise: true,
          returnByValue: true,
        },
        sessionId,
      )
      const status = result.result?.value
      assert.ok(status?.startsWith('PASS:'), status ?? JSON.stringify(result))
    })
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 3 })
  }
})
