// Vista, encabezado y botones reales; media y jobs aislados para no exportar archivos.
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
const root = await mkdtemp(join(tmpdir(), 'vimo-export-header-ui-'))
const mocks = {
  // `isNative` en falso: las piezas del editor que leen del sidecar por su
  // cuenta (galería, estimación de la animación) no consultan nada.
  '@/modules/videos/api':
    'export const videosApi = { videoSource: () => "fixture-media", isNative: () => false }',
  '@/modules/videos/hooks/useLibraryEditor':
    'export function useLibraryEditor() { return window.fixture }',
  '@/modules/videos/hooks/useProjectAudio':
    'export function useProjectAudio() { return { audioBusy: false } }',
  '@/modules/common/hooks/useImageCredits':
    'export function useImageCredits() { return { credits: null, isLoading: false, isRefreshing: false, refresh() {} } }',
  // Desde el PR #91 la vista importa componentes que usan la cola real del
  // editor (useLibraryEditorTask), que a su vez lee del pipeline de Crear si
  // hay otra tarea pesada en curso: acá no hay ninguna.
  '@/modules/videos/hooks/useCreateTask':
    'export function useCreateTask() { return { task: null } } export function hasBusyCreateTask() { return false } export function subscribeCreateTask() { return () => {} }',
  '@/modules/videos/components/EditorPreviewPlayer':
    'export function EditorPreviewPlayer() { return null }',
  '@/modules/videos/components/EditorTimeline':
    'export function EditorTimeline() { return null }',
  '@/modules/videos/components/MusicDialog':
    'export function MusicDialog() { return null }',
  '@/modules/videos/components/AudioMixDialog':
    'export function AudioMixDialog() { return null }',
}
const entry = String.raw`
import React from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Routes, Route } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from 'i18next'
import { I18nextProvider } from 'react-i18next'
import es from './public/locales/es.json'
import { TooltipProvider } from '@/modules/common/ui/tooltip'
import { EDITOR_BAR_SLOT_IDS } from '@/modules/common/constants'
import { TRANSITION_POLICY_VERSION } from '@pipeline/animation/transitions.ts'
import { LibraryEditor } from '@/modules/videos/views/LibraryEditor/LibraryEditor'

const check = (condition, message) => { if (!condition) throw new Error(message) }
const delay = () => new Promise(resolve => setTimeout(resolve, 30))
async function waitFor(get, message) {
  for (let index = 0; index < 100; index++) { const value = get(); if (value) return value; await delay() }
  throw new Error(message)
}
await i18n.init({ lng: 'es', resources: { es: { translation: es } }, interpolation: { escapeValue: false } })
let renderError
const root = createRoot(document.getElementById('root'), { onUncaughtError: error => { renderError = error } })
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const calls = []
let revision = 0
let cases = 0
try {
  for (const format of ['9:16', '16:9']) {
    for (const state of ['draft', 'current', 'outdated', 'busy', 'rendering']) {
      const scene = { id: 1, text: 'Fixture', startSeconds: 0, endSeconds: 4, imagePath: 'fixture.jpg' }
      const busy = state === 'busy' || state === 'rendering'
      // Lo que el editor de hoy lee de useLibraryEditor al renderizar (sin
      // escena elegida, sin claves de animación); la versión de transiciones
      // vigente hace que «current» sea un render al día.
      window.fixture = {
        detail: { metadata: { name: format + ' ' + state, state: 'draft', videoOutdated: state === 'outdated', renderTransitionVersion: TRANSITION_POLICY_VERSION, options: { videoFormat: format, imageProvider: 'fal' } }, videoPath: state === 'current' || state === 'outdated' ? 'fixture.mp4' : null },
        workingScenes: [scene], selectedScene: null, selectedSceneId: null, imageChoice: { provider: 'fal', quality: 'low' },
        videoProvider: 'kie', configuredProviders: new Set(), savingChanges: false, userPromptPending: false,
        canEditClipIn: false, canEditClipOut: false, selectedAnimationSceneCount: 0, selectedAnimationUndoPending: false, undoingSceneId: null,
        setSelectedSceneId() {},
        editorTask: {
          task: { render: state === 'rendering' ? { phase: 'chunks', percent: 45 } : null },
          isProjectBusy: () => busy,
          canStartAnimation: () => false,
          startRender: projectId => calls.push(['render', projectId]),
          cancelActiveJob: projectId => calls.push(['cancel', projectId]),
          startExport: projectId => calls.push(['clips', projectId]),
        }
      }
      // ADR-0056: el título y las acciones del editor van por portal a los
      // huecos de la barra del layout; acá los huecos los pone la prueba.
      // Algunas piezas del editor (saldo de animación, galería) usan TanStack
      // Query aunque acá no consulten nada.
      root.render(<QueryClientProvider client={queryClient}><I18nextProvider key={++revision} i18n={i18n}><TooltipProvider><MemoryRouter initialEntries={['/editor/fixture']}><div id={EDITOR_BAR_SLOT_IDS.title} /><div id={EDITOR_BAR_SLOT_IDS.actions} /><Routes><Route path="/editor/:projectId" element={<LibraryEditor />} /></Routes></MemoryRouter></TooltipProvider></I18nextProvider></QueryClientProvider>)
      await waitFor(() => {
        if (renderError) throw renderError
        return document.querySelector('h1')?.textContent === format + ' ' + state
      }, 'vista del editor: ' + format + ' ' + state)
      const header = document.getElementById(EDITOR_BAR_SLOT_IDS.actions)
      const buttons = [...document.querySelectorAll('button')]
      const cancel = buttons.filter(button => button.getAttribute('aria-label') === i18n.t('library.editor.render.cancel'))
      const label = i18n.t(state === 'current' ? 'library.editor.render.rerenderClean' : state === 'outdated' ? 'library.editor.render.rerender' : 'library.editor.render.render')
      const render = buttons.filter(button => button.textContent.trim() === label)
      if (state === 'rendering') {
        check(cancel.length === 1 && header.contains(cancel[0]), 'cancelación única en header: ' + format)
        check(header.textContent.includes('45%'), 'progreso en header: ' + format)
        check(render.length === 0, 'no duplica Exportar mientras renderiza')
        cancel[0].click()
        check(calls.at(-1)[0] === 'cancel' && calls.at(-1)[1] === 'fixture', 'conserva handler cancelar')
      } else {
        check(render.length === 1 && header.contains(render[0]), 'Exportar único dentro del header: ' + format + ' ' + state)
        check(render[0].disabled === busy, 'bloqueo ocupado conservado')
        if (!busy) {
          render[0].click()
          check(calls.at(-1)[0] === 'render' && calls.at(-1)[1] === 'fixture', 'conserva handler exportar video')
        }
      }
      check(!document.querySelector('.fixed.bottom-6.right-6'), 'sin flotante superpuesto al timeline')
      const clips = buttons.filter(button => button.textContent.trim() === i18n.t('library.editor.export.button'))
      check(clips.length === 1 && header.contains(clips[0]), 'exportar clips sigue separado en header')
      cases++
    }
  }
  document.getElementById('result').textContent = 'PASS: export header in both formats (' + cases + ' cases)'
} catch (error) {
  // Un error de render se reporta con su mensaje aunque haya caído fuera de
  // una espera (el árbol desmontado haría fallar otra comprobación).
  const render = renderError && renderError !== error ? ' (render error: ' + renderError.message + ')' : ''
  document.getElementById('result').textContent = 'FAIL: ' + error.message + render
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
          plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
            contents: mocks[args.path],
            loader: 'js',
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
    await new Promise((resolve) => setTimeout(resolve, 1000))
    const result = await call(
      'Runtime.evaluate',
      {
        expression:
          '(async () => { for (let i = 0; i < 200; i++) { const text = document.getElementById("result")?.textContent; if (text && text !== "RUNNING") return text; await new Promise(resolve => setTimeout(resolve, 50)); } return "FAIL: UI timeout: " + document.body.innerText; })()',
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
