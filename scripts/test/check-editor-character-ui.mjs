// Hook, query de detalle y panel reales; guardados simulados con respuesta controlada.
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
const root = await mkdtemp(join(tmpdir(), 'vimo-editor-ui-'))
const mocks = {
  '@/modules/api-keys/hooks/useRequiredApiKeys':
    'export function useRequiredApiKeys() { return { configuredProviders: new Set(["deepinfra", "fal"]) } }',
  '@/modules/videos/hooks/useLibraryEditorTask':
    'export function useLibraryEditorTask() { return { task: null, enqueueRegen(projectId, entries) { window.regens.push({ projectId, entries, stored: structuredClone(window.detail.scenes) }) }, setPendingImageProvider() {} } }',
  '@/modules/videos/api':
    'export const videosApi = { isNative: () => true, projectDetail: async () => structuredClone(window.detail), updateScenes: (projectId, changes) => new Promise((resolve, reject) => window.commits.push({ changes, reject, resolve: () => { for (const change of changes) Object.assign(window.detail.scenes.find(scene => scene.id === change.id), change); resolve({ applied: changes.length }) } })), errorMessageKey: () => "library.editor.regenFailed" }',
}
const entry = String.raw`
import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from 'i18next'
import { I18nextProvider } from 'react-i18next'
import es from './public/locales/es.json'
import { TooltipProvider } from '@/modules/common/ui/tooltip'
import { useLibraryEditor } from '@/modules/videos/hooks/useLibraryEditor'
import { EditorScenePanel } from '@/modules/videos/components/EditorScenePanel'

window.commits = []
window.regens = []
window.detail = { metadata: { options: { imageProvider: 'fal', imageQuality: 'low', characters: [{ name: 'Elena' }], customStyle: { systemPrompt: 'Watercolor' } } }, scenes: [{ id: 1, text: 'Elena repairs the antenna.', charactersPresent: [0], startSeconds: 0, endSeconds: 4 }, { id: 2, text: 'A greenhouse glows.', charactersPresent: [], startSeconds: 4, endSeconds: 8 }] }
const check = (condition, message) => { if (!condition) throw new Error(message) }
const delay = () => new Promise(resolve => setTimeout(resolve, 30))
async function waitFor(get, message) {
  for (let index = 0; index < 100; index++) { const value = get(); if (value) return value; await delay() }
  throw new Error(message)
}
await i18n.init({ lng: 'es', resources: { es: { translation: es } }, interpolation: { escapeValue: false } })
function Editor() {
  const editor = useLibraryEditor('fixture')
  window.editor = editor
  return <EditorScenePanel scene={editor.selectedScene} characters={editor.detail?.metadata.options.characters ?? []} imageChoice={editor.imageChoice} videoFormat="16:9" credits={null} creditsLoading={false} creditsRefreshing={false} onRefreshCredits={() => {}} busy={editor.savingChanges} regenerateLocked={false} userPromptDirty={editor.userPromptDirty} onUserPromptChange={editor.patchSelectedUserPrompt} onUserPromptBlur={editor.commitSelectedUserPrompt} canEditClipIn={false} canEditClipOut={false} onClipTimeChange={() => {}} onImageChoiceChange={editor.changeImageChoice} onCharactersChange={editor.changeCharacters} onRegenerate={editor.regenerateSelected} />
}
const root = createRoot(document.getElementById('root'))
root.render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}><I18nextProvider i18n={i18n}><TooltipProvider><Editor /></TooltipProvider></I18nextProvider></QueryClientProvider>)
const checkbox = () => document.querySelector('input[type=checkbox]')
const regenerate = () => [...document.querySelectorAll('button')].find(button => button.textContent.includes(i18n.t('library.editor.panel.regenerate')))
try {
  await waitFor(() => checkbox(), 'panel cargado')
  check(checkbox().checked, 'estado inicial presente')
  checkbox().click()
  await waitFor(() => window.commits.length === 1, 'guardado iniciado')
  check(!checkbox().checked && checkbox().disabled && regenerate().disabled, 'selección visible, controles bloqueados durante guardado')
  window.editor.regenerateSelected()
  await delay()
  check(window.regens.length === 0, 'handler tampoco encola antes de persistir')
  window.commits[0].resolve()
  await waitFor(() => !regenerate().disabled, 'guardado terminado')
  check(!checkbox().checked, 'refetch conserva desmarcado')
  regenerate().click()
  await waitFor(() => window.regens.length === 1, 'regeneración enviada')
  check(window.regens[0].stored[0].charactersPresent.length === 0, 'regenera con selección guardada sin personaje')
  check(window.regens[0].entries.length === 1 && window.regens[0].entries[0].id === 1, 'solo una escena')
  checkbox().click()
  await waitFor(() => window.commits.length === 2, 'marcado guardándose')
  window.commits[1].resolve()
  await waitFor(() => !regenerate().disabled, 'marcado guardado')
  check(checkbox().checked, 'refetch conserva marcado')
  regenerate().click()
  await waitFor(() => window.regens.length === 2, 'regeneración con personaje')
  check(window.regens[1].stored[0].charactersPresent[0] === 0, 'regenera con personaje seleccionado')
  checkbox().click()
  await waitFor(() => window.commits.length === 3, 'guardado para fallo')
  window.commits[2].reject(new Error('fixture disk failure'))
  await waitFor(() => !regenerate().disabled, 'fallo libera panel')
  await waitFor(() => checkbox().checked, 'fallo restaura selección realmente guardada')
  check(window.regens.length === 2, 'fallo no dispara generación')
  document.getElementById('result').textContent = 'PASS: editor selection UI (4 cases)'
} catch (error) {
  document.getElementById('result').textContent = 'FAIL: ' + error.message
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
