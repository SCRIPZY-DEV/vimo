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
import { formatCompact } from '@/modules/common/utilities/formatCompact'
import { formatUsd } from '@/modules/common/utilities/formatUsd'

window.validations = []
window.saves = []
window.removals = []
const check = (condition, message) => { if (!condition) throw new Error(message) }
const delay = () => new Promise(resolve => setTimeout(resolve, 30))
// Respuestas con la forma exacta de ValidationResult (contrato de Rust): credits siempre presente.
const accepted = (credits = null) => ({ ok: true, code: null, credits })
const rejected = code => ({ ok: false, code, credits: null })
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
// Un error de render desmonta toda la raíz y los botones desaparecen; se guarda para decir la causa real.
const root = createRoot(document.getElementById('root'), { onUncaughtError: error => { window.renderError = error } })
let revision = 0
function render(component) {
  root.render(<QueryClientProvider key={++revision} client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}><I18nextProvider i18n={i18n}>{component}</I18nextProvider></QueryClientProvider>)
}
function Probe() {
  window.actions = useApiKeyActions('deepinfra')
  return null
}
// Texto del aviso de la prueba: el <span> que acompaña al ícono de éxito o de error de la tarjeta.
const feedback = () => [...document.querySelectorAll('span')].find(node => node.previousElementSibling?.localName === 'svg')?.textContent
// Aviso exacto de un saldo en dólares: con el monto de formatUsd y, aparte, con el literal de es
// (Intl separa el monto y «US$» con un espacio duro) para que el guard no se compare solo con formatUsd.
function checkDollars(message, amount, literal, label) {
  check(typeof message === 'string', label + ': la tarjeta no muestra aviso')
  check(message === i18n.t('apiKeys.validacionOkSaldoUsd', { amount: formatUsd(amount, 'es') }), label + ': ' + message)
  check(message.replace(/\s/g, ' ') === i18n.t('apiKeys.validacionOkSaldoUsd', { amount: literal }), label + ' (monto «' + literal + '»): ' + message)
  check(!/ cr\.?$/.test(message), label + ' (sin la unidad de créditos): ' + message)
}
// Prueba la conexión en una tarjeta nueva con la respuesta indicada, lee el aviso y cierra el editor:
// los casos comparten el DOM y el siguiente espera un editor recién montado. «failure» es el mensaje
// si la tarjeta no llega a habilitar Guardar (se cayó o nunca aplicó la respuesta).
async function probeWith(provider, response, failure) {
  render(<ApiKeyCard provider={provider} focused />)
  await waitFor(() => document.querySelector('input')?.value === '', 'editor de ' + provider.id)
  change('fixture-key'); await delay()
  const count = window.validations.length
  test().click()
  await waitFor(() => window.validations.length === count + 1, 'prueba enviada: ' + provider.id)
  window.validations.at(-1).resolve(response)
  await waitFor(() => save() && !save().disabled, failure)
  const message = feedback()
  button('apiKeys.cancelar').click()
  await waitFor(() => !document.querySelector('input'), 'cierre tras la prueba de ' + provider.id)
  return message
}
let cases = 0
let dollarProviders = 0
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
    // Un proveedor en dólares (HeyGen) manda su saldo prepago; los demás no mandan saldo (credits: null).
    // Se decide por balanceUnit y no por el id: así un cambio de id no deja la aserción hueca.
    const inDollars = provider.balanceUnit === 'usd'
    attempt.resolve(accepted(inDollars ? 3.68 : null))
    await waitFor(() => !save().disabled, 'prueba exitosa habilita')
    if (inDollars) {
      checkDollars(feedback(), 3.68, '3,68 US$', 'saldo en dólares de ' + provider.id)
      dollarProviders++
    }
    save().click()
    await waitFor(() => window.saves.some(item => item.provider === provider.id), 'clave guardada')
    check(window.saves.at(-1).key === 'fixture-key', 'guarda exactamente lo probado')
    await waitFor(() => !document.querySelector('input'), 'cierre exitoso')
    cases++
  }

  // Si ningún proveedor está en dólares la aserción de arriba nunca corrió: eso también es un fallo.
  check(dollarProviders > 0, 'se probó al menos un proveedor en dólares')

  // Contrato roto a propósito: sin credits (undefined) la tarjeta no puede caerse
  // ni mostrar un saldo; antes tumbaba todo el árbol en formatCompact(undefined).
  check(await probeWith(API_KEY_PROVIDERS[0], { ok: true, code: null }, 'una respuesta sin credits no rompe la tarjeta') === i18n.t('apiKeys.validacionOk'), 'sin credits muestra Conectado sin saldo')
  cases++

  // Kie.ai da su saldo en créditos: no pasa por el formato de dólares.
  const kie = API_KEY_PROVIDERS.find(provider => provider.id === 'kie')
  check(await probeWith(kie, accepted(120), 'Kie.ai con saldo habilita') === i18n.t('apiKeys.validacionOkSaldo', { amount: '120' }), 'Kie.ai muestra su saldo en créditos')
  cases++

  // Un saldo en cero es un saldo, y es cuando más importa verlo: no cae al «Conectado» pelado.
  check(await probeWith(kie, accepted(0), 'Kie.ai con saldo cero habilita') === i18n.t('apiKeys.validacionOkSaldo', { amount: formatCompact(0) }), 'Kie.ai muestra su saldo cero en créditos')
  cases++
  checkDollars(await probeWith(API_KEY_PROVIDERS.find(provider => provider.balanceUnit === 'usd'), accepted(0), 'el proveedor en dólares con saldo cero habilita'), 0, '0,00 US$', 'saldo cero en dólares')
  cases++

  render(<ApiKeyCard provider={API_KEY_PROVIDERS[0]} focused />)
  await waitFor(() => document.querySelector('input'), 'editor para errores')
  change('key-a'); await delay(); test().click()
  await waitFor(() => test().disabled, 'validando A')
  change('key-b'); await delay()
  window.validations.at(-1).resolve(accepted())
  await waitFor(() => !test().disabled, 'fin respuesta vieja')
  check(save().disabled && !document.body.textContent.includes(i18n.t('apiKeys.validacionOk')), 'A no valida B ni muestra éxito obsoleto')
  cases++
  test().click(); await delay()
  window.validations.at(-1).resolve(rejected('invalid_key'))
  await waitFor(() => !test().disabled, 'rechazo recibido')
  check(save().disabled, 'rechazo bloquea')
  cases++
  test().click(); await delay()
  window.validations.at(-1).reject({ code: 'network' })
  await waitFor(() => !test().disabled, 'red fallida')
  check(save().disabled, 'error de red bloquea')
  cases++
  test().click(); await delay()
  window.validations.at(-1).resolve(accepted())
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
  cancelled.resolve(accepted())
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
  window.validations.at(-1).resolve(accepted())
  await waitFor(() => window.actions.canSaveKey('hook-key'), 'hook validado')
  window.actions.saveKey('different-key'); await delay()
  check(window.saves.length === savedBefore, 'handler rechaza otra clave')
  window.actions.testKey('hook-key'); await delay()
  check(!window.actions.canSaveKey('hook-key'), 're-probar revoca validación durante vuelo')
  window.validations.at(-1).resolve(rejected('invalid_key'))
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
  document.getElementById('result').textContent = 'FAIL: ' + error.message + (window.renderError ? ' (render error: ' + window.renderError.message + ')' : '')
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
