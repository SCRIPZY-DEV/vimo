// Componentes y hooks React reales; solo APIs y disponibilidad de claves simuladas.
// Usa Chrome headless instalado, sin depender de Playwright ni gastar créditos.
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
const root = await mkdtemp(join(tmpdir(), 'vimo-character-ui-'))
const mocks = {
  '@/modules/api-keys/hooks/useRequiredApiKeys':
    'export function useRequiredApiKeys() { return { missingRequirements: [], configuredProviders: ["deepinfra", "fal"] } }',
  '@/modules/common/hooks/useImageCredits':
    'export function useImageCredits() { return { credits: null, isLoading: false, isRefreshing: false, refresh() {} } }',
  '@/modules/characters/api':
    'export const charactersApi = { isNative: () => false, errorMessageKey: () => "characters.errors.unknown", suggestProfile: async payload => { window.requests.push({ kind: "catalog", payload }); return { name: "Ana", age: "30", role: "Explorer", prompt: "A recognizable explorer with a blue coat and a round face, matching the script." } }, designWithStyle: async payload => { window.requests.push({ kind: "style", payload }); return { name: "Ana", prompt: "A recognizable explorer designed from the supplied style and script." } } }',
  '@/modules/videos/api':
    'export const videosApi = { listCharacters: async () => ({ entries: [] }), imageSource: path => path, errorMessageKey: () => "error" }',
}
const entry = String.raw`
import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import i18n from 'i18next'
import { I18nextProvider } from 'react-i18next'
import es from './public/locales/es.json'
import { CharacterSection } from '@/modules/videos/components/CharacterSection'
import { CharacterModal } from '@/modules/characters/components/CharacterModal'

window.requests = []
const check = (condition, message) => { if (!condition) throw new Error(message) }
const delay = () => new Promise(resolve => setTimeout(resolve, 50))
const button = key => [...document.querySelectorAll('button')].find(node => node.textContent.trim().startsWith(i18n.t(key)))
async function waitFor(get, message) {
  for (let index = 0; index < 80; index++) { const value = get(); if (value) return value; await delay() }
  throw new Error(message)
}
const script = 'Ana is an explorer searching for a lost city in the mountains with her team.'
await i18n.init({ lng: 'es', resources: { es: { translation: es } }, interpolation: { escapeValue: false } })
const root = createRoot(document.getElementById('root'))
let revision = 0
function render(component) {
  root.render(<QueryClientProvider key={++revision} client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><I18nextProvider i18n={i18n}><MemoryRouter>{component}</MemoryRouter></I18nextProvider></QueryClientProvider>)
}
try {
  render(<CharacterSection value={{ styleSource: 'catalog', styleId: 'normal', characters: [], withdrawnCharacters: [], script, characterFrequency: 1 }} disabled={false} onChange={() => {}} />)
  const choose = await waitFor(() => [...document.querySelectorAll('button')].find(node => node.textContent.includes(i18n.t('create.characters.choose'))), 'selector de personaje')
  choose.click()
  const noPhoto = await waitFor(() => button('create.characters.filter.text'), 'pestaña sin foto')
  noPhoto.click()
  const create = await waitFor(() => button('create.characters.createNew'), 'tarjeta crear personaje')
  create.click()
  const suggest = await waitFor(() => button('characters.experto.boton'), 'botón IA Catálogo')
  check(!suggest.disabled, 'Catálogo con guion debe habilitar IA con campos vacíos')
  suggest.click()
  await waitFor(() => window.requests.length === 1, 'payload IA')
  check(window.requests[0].kind === 'catalog', 'Catálogo usa el experto existente')
  check(window.requests[0].payload.script === script, 'guion atraviesa Section → Picker → Modal → API')
  await waitFor(() => document.getElementById('character-name')?.value === 'Ana', 'nombre autocompletado')
  check(document.getElementById('character-description').value.includes('explorer'), 'identidad autocompletada')
  render(<CharacterModal character={null} initialSource="text" onClose={() => {}} />)
  await delay()
  check(button('characters.experto.boton')?.disabled, 'Biblioteca sin guion exige campos')
  render(<CharacterModal character={null} styleContext={{ styleId: 'fixture', gem: 'hand-drawn style', script }} onClose={() => {}} />)
  const style = await waitFor(() => button('characters.experto.withStyle'), 'botón Mi estilo')
  check(!style.disabled, 'Mi estilo sigue habilitado')
  style.click()
  await waitFor(() => window.requests.length === 2, 'payload Mi estilo')
  check(window.requests[1].kind === 'style' && window.requests[1].payload.script === script, 'Mi estilo conserva su carril')
  document.getElementById('result').textContent = 'PASS: catalog script, empty library, custom style (3/3)'
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
