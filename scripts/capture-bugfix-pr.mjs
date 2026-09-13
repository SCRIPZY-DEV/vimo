// Evidencia visual del PR: componentes reales, APIs/jobs ficticios, sin datos del usuario.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { withChrome } from './chrome-session.mjs'

const chrome =
  process.argv[2] ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const outputDirectory = resolve('docs/reports/2026-09-13-bugfix-pr')
const temporary = await mkdtemp(join(tmpdir(), 'vimo-pr-captures-'))
const mocks = {
  '@/modules/api-keys/hooks/useRequiredApiKeys':
    'export function useRequiredApiKeys() { return { missingRequirements: [], configuredProviders: new Set(["deepinfra", "fal", "evolink"]) } }',
  '@/modules/common/hooks/useImageCredits':
    'export function useImageCredits() { return { credits: null, isLoading: false, isRefreshing: false, refresh() {} } }',
  '@/modules/api-keys/api':
    'export const apiKeysApi = { validate: async () => ({ ok: true, code: null }), save: async () => {}, errorMessageKey: () => "apiKeys.errors.network", openProviderPage() {} }',
  '@/modules/characters/api':
    'export const charactersApi = { isNative: () => false, suggestProfile: async () => ({ name: "Ana", age: "30 años", role: "Exploradora", prompt: "A 30-year-old explorer with a blue coat, short dark hair and a round face, carrying a worn leather map case." }), errorMessageKey: () => "characters.errors.unknown" }',
  '@/modules/videos/api':
    'export const videosApi = { isNative: () => false, listCharacters: async () => ({ entries: [] }), imageSource: path => path, videoSource: path => path, errorMessageKey: () => "error" }',
  '@/modules/videos/hooks/useLibraryEditor':
    'export function useLibraryEditor() { return window.editorFixture }',
  '@/modules/videos/hooks/useProjectAudio':
    'export function useProjectAudio() { return { audioBusy: false } }',
  '@/modules/videos/hooks/useCreateTask':
    'export function useCreateTask() { return { task: null } }',
  '@/modules/videos/hooks/useStyleSampleGeneration':
    'export function useStyleSampleGeneration() { return window.samplesFixture }',
  '@/modules/videos/components/MusicDialog':
    'export function MusicDialog() { return null }',
  '@/modules/videos/components/AudioMixDialog':
    'export function AudioMixDialog() { return null }',
}
const entry = String.raw`
import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router'
import i18n from 'i18next'
import { I18nextProvider } from 'react-i18next'
import es from './public/locales/es.json'
import { TooltipProvider } from '@/modules/common/ui/tooltip'
import { ApiKeyCard } from '@/modules/api-keys/components/ApiKeyCard'
import { API_KEY_PROVIDERS } from '@/modules/api-keys/providers'
import { CharacterSection } from '@/modules/videos/components/CharacterSection'
import { CustomStyleModal } from '@/modules/videos/components/CustomStyleModal'
import { LibraryEditor } from '@/modules/videos/views/LibraryEditor/LibraryEditor'
import { defaultQualityFor } from '@/modules/videos/utilities/imageQuality'

await i18n.init({ lng: 'es', resources: { es: { translation: es } }, interpolation: { escapeValue: false } })
window.failure = null
const root = createRoot(document.getElementById('root'), { onUncaughtError: error => { window.failure = error.message } })
let revision = 0
const delay = () => new Promise(resolve => setTimeout(resolve, 50))
window.waitFor = async (get) => { for (let i = 0; i < 100; i++) { if (window.failure) throw Error(window.failure); if (get()) return; await delay() } throw Error('UI timeout') }
window.button = key => [...document.querySelectorAll('button')].find(node => node.textContent.trim().startsWith(i18n.t(key)))
window.changeInput = (selector, value) => { const input = document.querySelector(selector); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })) }
const script = 'Ana, una exploradora de 30 años, busca una ciudad perdida en las montañas. Lleva un abrigo azul y un mapa antiguo.'
window.show = async (kind) => {
  let component
  if (kind === 'api') component = <main style={{ maxWidth: 1020, margin: '80px auto', padding: 24 }}><h1 style={{ fontSize: 28, marginBottom: 24 }}>Claves API</h1><ApiKeyCard provider={API_KEY_PROVIDERS.find(provider => provider.id === 'deepinfra')} focused /></main>
  if (kind === 'character') component = <main style={{ maxWidth: 1000, margin: '60px auto' }}><CharacterSection value={{ styleSource: 'catalog', styleId: 'cartoon', characters: [], withdrawnCharacters: [], script, characterFrequency: 1 }} disabled={false} onChange={() => {}} /></main>
  if (kind.startsWith('samples')) {
    window.samplesFixture = { running: true, phase: kind === 'samples-prompts' ? 'prompts' : 'images', promptPercents: { 1: 38, 2: 38, 3: 38, 4: 38 }, samplePercents: { 1: 42, 2: 57, 3: 48, 4: 53 }, sampleImages: {}, completed: false, errorKey: null }
    component = <CustomStyleModal styleId="fixture" initial={{ name: 'Acuarela de aventura', systemPrompt: 'Hand-painted watercolor, soft outlines and warm daylight.', shots: ['wide', 'medium'], character: { mode: 'none' } }} samples={[]} saving={false} generateOnOpen={false} script={script} promptModel={null} onSave={async () => {}} onClose={() => {}} />
  }
  if (kind.startsWith('editor')) {
    const format = kind === 'editor-short' ? '9:16' : '16:9'
    const scene = { id: 1, text: 'Ana busca la ciudad perdida entre las montañas.', startSeconds: 0, endSeconds: 6, imagePath: window.sampleImage, charactersPresent: format === '9:16' ? [] : [0] }
    window.editorFixture = {
      detail: { metadata: { name: 'Aventura · ' + format, state: 'draft', options: { videoFormat: format, imageProvider: 'fal', characters: [{ name: 'Ana' }], customStyle: { systemPrompt: 'Hand-painted watercolor.' } } }, scenes: [scene], videoPath: null, script },
      workingScenes: [scene], selectedScene: scene, selectedSceneId: 1, imageChoice: { provider: 'fal', quality: defaultQualityFor('fal', format) },
      editorTask: { task: null, isProjectBusy: () => false, startRender() {}, startExport() {}, cancelActiveJob() {} },
      changeCharacters() {}, changeImageChoice() {}, regenerateSelected() {}, setSelectedSceneId() {},
    }
    component = <Routes><Route path="/editor/:projectId" element={<LibraryEditor />} /></Routes>
  }
  root.render(<QueryClientProvider key={++revision} client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><I18nextProvider i18n={i18n}><TooltipProvider><MemoryRouter initialEntries={['/editor/fixture']}>{component}</MemoryRouter></TooltipProvider></I18nextProvider></QueryClientProvider>)
  await delay()
}
window.ready = true
`

try {
  // Se usa el CSS real del build, no una reconstrucción de la interfaz.
  const html = await readFile(resolve('dist/index.html'), 'utf8')
  const cssPath = html.match(/href="(\/assets\/[^" ]+\.css)"/)[1]
  const bundle = await build({
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
        name: 'isolated-fixtures',
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
  await writeFile(join(temporary, 'app.js'), bundle.outputFiles[0].contents)
  await writeFile(
    join(temporary, 'index.html'),
    '<!doctype html><html lang="es"><meta charset="utf-8"><link rel="stylesheet" href="' +
      pathToFileURL(resolve('dist' + cssPath)).href +
      '"><div id="root"></div><script type="module" src="./app.js"></script></html>',
  )
  await mkdir(outputDirectory, { recursive: true })
  await withChrome(chrome, join(temporary, 'profile'), async (call) => {
    const { targetId } = await call('Target.createTarget', {
      url: pathToFileURL(join(temporary, 'index.html')).href,
    })
    const { sessionId } = await call('Target.attachToTarget', {
      targetId,
      flatten: true,
    })
    await call(
      'Emulation.setDeviceMetricsOverride',
      { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false },
      sessionId,
    )
    const evaluate = async (expression) => {
      const result = await call(
        'Runtime.evaluate',
        { expression, awaitPromise: true, returnByValue: true },
        sessionId,
      )
      assert.ok(
        !result.exceptionDetails,
        JSON.stringify(result.exceptionDetails),
      )
      return result.result.value
    }
    await evaluate(
      '(async () => { for (let i = 0; i < 100 && !window.ready; i++) await new Promise(resolve => setTimeout(resolve, 50)); if (!window.ready) throw Error("fixture not ready") })()',
    )
    await evaluate(
      'window.sampleImage = ' +
        JSON.stringify(
          pathToFileURL(resolve('public/style-references/cartoon_1.jpg')).href,
        ),
    )
    const capture = async (name) => {
      await evaluate(
        '(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode().catch(() => {}))); await new Promise(resolve => setTimeout(resolve, 400)); if (window.failure) throw Error(window.failure) })()',
      )
      const screenshot = await call(
        'Page.captureScreenshot',
        {
          format: 'png',
          captureBeyondViewport: false,
          ...(name.startsWith('api-')
            ? { clip: { x: 200, y: 80, width: 1040, height: 360, scale: 1 } }
            : {}),
        },
        sessionId,
      )
      await writeFile(
        join(outputDirectory, name + '.png'),
        Buffer.from(screenshot.data, 'base64'),
      )
      process.stdout.write(name + '.png\n')
    }
    await evaluate('window.show("api")')
    await evaluate('window.waitFor(() => document.querySelector("input"))')
    await evaluate(
      'window.changeInput("input", "fixture-only-not-a-real-api-key")',
    )
    await evaluate(
      'window.waitFor(() => window.button("apiKeys.guardar").disabled && !window.button("apiKeys.probar").disabled)',
    )
    await capture('api-unvalidated')
    await evaluate('window.button("apiKeys.probar").click()')
    await evaluate(
      'window.waitFor(() => !window.button("apiKeys.guardar").disabled)',
    )
    await capture('api-validated')

    await evaluate('window.show("character")')
    for (const key of [
      'create.characters.choose',
      'create.characters.filter.text',
      'create.characters.createNew',
    ]) {
      await evaluate(
        'window.waitFor(() => window.button(' + JSON.stringify(key) + '))',
      )
      await evaluate('window.button(' + JSON.stringify(key) + ').click()')
    }
    await evaluate(
      'window.waitFor(() => window.button("characters.experto.boton") && !window.button("characters.experto.boton").disabled)',
    )
    await capture('catalog-character-ready')
    await evaluate('window.button("characters.experto.boton").click()')
    await evaluate(
      'window.waitFor(() => document.getElementById("character-age")?.value === "30 años")',
    )
    await capture('catalog-character-complete')

    for (const kind of [
      'samples-prompts',
      'samples-images',
      'editor-short',
      'editor-long',
    ]) {
      await evaluate('window.show(' + JSON.stringify(kind) + ')')
      await capture(kind)
    }
  })
} finally {
  await rm(temporary, { recursive: true, force: true, maxRetries: 3 })
}
