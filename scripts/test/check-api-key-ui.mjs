// Tarjeta y hook reales; API simulada con respuestas controladas, sin llavero ni red.
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
const root = await mkdtemp(join(tmpdir(), 'vimo-api-key-ui-'))
const mocks = {
  '@/modules/api-keys/api':
    'export const apiKeysApi = { validate: (provider, key) => new Promise((resolve, reject) => window.validations.push({provider, key, resolve, reject})), save: async (provider, key) => { window.saves.push({provider, key}) }, remove: async provider => { window.removals.push(provider) }, errorMessageKey: () => "apiKeys.errors.network", openProviderPage() {} }',
}
const entry = String.raw`
import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from 'i18next'
import { I18nextProvider } from 'react-i18next'
import es from './public/locales/es.json'
import { ApiKeyCard } from '@/modules/api-keys/components/ApiKeyCard'
import { API_KEY_PROVIDERS } from '@/modules/api-keys/providers'
import { useApiKeyActions } from '@/modules/api-keys/hooks/useApiKeyActions'

window.validations = []
window.saves = []
window.removals = []
const check = (condition, message) => { if (!condition) throw new Error(message) }
const delay = () => new Promise(resolve => setTimeout(resolve, 30))
async function waitFor(get, message) {
  for (let index = 0; index < 100; index++) { const value = get(); if (value) return value; await delay() }
  throw new Error(message)
}
await i18n.init({ lng: 'es', resources: { es: { translation: es } }, interpolation: { escapeValue: false } })
const button = key => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === i18n.t(key))
const save = () => button('apiKeys.guardar')
const test = () => button('apiKeys.probar')
function change(value) {
  const input = document.querySelector('input')
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const root = createRoot(document.getElementById('root'))
let revision = 0
function render(component) {
  root.render(<QueryClientProvider key={++revision} client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}><I18nextProvider i18n={i18n}>{component}</I18nextProvider></QueryClientProvider>)
}
function Probe() {
  window.actions = useApiKeyActions('deepinfra')
  return null
}
let cases = 0
try {
  for (const provider of API_KEY_PROVIDERS) {
    render(<ApiKeyCard provider={provider} focused />)
    await waitFor(() => document.querySelector('input')?.value === '', 'editor vacío')
    check(save().disabled && test().disabled, 'vacío bloqueado: ' + provider.id)
    change('  fixture-key  ')
    await delay()
    check(save().disabled && !test().disabled, 'sin prueba bloqueado: ' + provider.id)
    const count = window.validations.length
    test().click()
    await waitFor(() => window.validations.length === count + 1, 'prueba enviada')
    check(save().disabled && test().disabled, 'prueba en vuelo bloqueada')
    const attempt = window.validations.at(-1)
    check(attempt.key === 'fixture-key' && attempt.provider === provider.id, 'valor normalizado y proveedor correcto')
    attempt.resolve({ ok: true, code: null })
    await waitFor(() => !save().disabled, 'prueba exitosa habilita')
    save().click()
    await waitFor(() => window.saves.some(item => item.provider === provider.id), 'clave guardada')
    check(window.saves.at(-1).key === 'fixture-key', 'guarda exactamente lo probado')
    await waitFor(() => !document.querySelector('input'), 'cierre exitoso')
    cases++
  }

  render(<ApiKeyCard provider={API_KEY_PROVIDERS[0]} focused />)
  await waitFor(() => document.querySelector('input'), 'editor para errores')
  change('key-a'); await delay(); test().click()
  await waitFor(() => test().disabled, 'validando A')
  change('key-b'); await delay()
  window.validations.at(-1).resolve({ ok: true, code: null })
  await waitFor(() => !test().disabled, 'fin respuesta vieja')
  check(save().disabled && !document.body.textContent.includes(i18n.t('apiKeys.validacionOk')), 'A no valida B ni muestra éxito obsoleto')
  cases++
  test().click(); await delay()
  window.validations.at(-1).resolve({ ok: false, code: 'invalid_key' })
  await waitFor(() => !test().disabled, 'rechazo recibido')
  check(save().disabled, 'rechazo bloquea')
  cases++
  test().click(); await delay()
  window.validations.at(-1).reject({ code: 'network' })
  await waitFor(() => !test().disabled, 'red fallida')
  check(save().disabled, 'error de red bloquea')
  cases++
  test().click(); await delay()
  window.validations.at(-1).resolve({ ok: true, code: null })
  await waitFor(() => !save().disabled, 'reintento exitoso')
  change('key-c'); await delay()
  check(save().disabled, 'editar invalida éxito anterior')
  change('key-b'); await delay()
  check(save().disabled, 'volver al valor anterior exige otra prueba')
  cases++
  test().click(); await delay()
  const cancelled = window.validations.at(-1)
  button('apiKeys.cancelar').click()
  await waitFor(() => !document.querySelector('input'), 'cancelar cierra')
  button('apiKeys.configurar').click()
  await waitFor(() => document.querySelector('input'), 'reabre')
  change('key-b'); await delay()
  cancelled.resolve({ ok: true, code: null })
  await waitFor(() => !test().disabled, 'prueba cancelada terminó')
  check(save().disabled, 'cancelar/reabrir no hereda éxito tardío')
  cases++

  render(<Probe />)
  await waitFor(() => window.actions, 'hook real')
  const savedBefore = window.saves.length
  window.actions.saveKey('unvalidated')
  await delay()
  check(window.saves.length === savedBefore, 'handler rechaza sin prueba incluso sin botón')
  window.actions.testKey('hook-key'); await delay()
  window.validations.at(-1).resolve({ ok: true, code: null })
  await waitFor(() => window.actions.canSaveKey('hook-key'), 'hook validado')
  window.actions.saveKey('different-key'); await delay()
  check(window.saves.length === savedBefore, 'handler rechaza otra clave')
  window.actions.testKey('hook-key'); await delay()
  check(!window.actions.canSaveKey('hook-key'), 're-probar revoca validación durante vuelo')
  window.validations.at(-1).resolve({ ok: false, code: 'invalid_key' })
  await waitFor(() => !window.actions.testing, 're-prueba rechazada')
  window.actions.saveKey('hook-key'); await delay()
  check(window.saves.length === savedBefore, 're-prueba fallida revoca éxito')
  cases++

  render(<ApiKeyCard provider={API_KEY_PROVIDERS[0]} status={{ configured: true, source: 'manual', maskedKey: 'fixture***' }} />)
  await waitFor(() => button('apiKeys.cambiar'), 'clave existente')
  button('apiKeys.cambiar').click()
  await waitFor(() => document.querySelector('input'), 'editar existente')
  change('replacement'); await delay()
  check(save().disabled, 'configurada no significa nueva clave validada')
  button('apiKeys.cancelar').click(); await delay()
  check(window.saves.length === savedBefore, 'cancelar no sustituye la clave anterior')
  cases++
  document.getElementById('result').textContent = 'PASS: API key validation UI (' + cases + ' cases)'
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
