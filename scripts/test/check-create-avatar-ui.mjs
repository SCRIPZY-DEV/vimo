// La tarjeta «Avatar presentador» de Crear (ADR-0057, spec §6.2 y §9, con el
// cambio de dirección del dueño del 2026-10-10: el look ES el escenario) con
// sus hooks reales en Chrome headless: sin clave de HeyGen avisa y deja el
// interruptor apagado; al encender elige sola el primer avatar que sirve con
// su look principal; el look se elige en un desplegable (entrega 2b) que
// muestra el principal por defecto y ofrece solo los looks con la orientación
// del formato, cada uno con su tipo y el principal con su nota; al lado, la
// vista previa del elegido: la de disco si la hay y, si no, la imagen y el
// video del listado de HeyGen (un avatar propio se pide entre los privados,
// uno de stock entre los públicos, y uno sin look para el formato no se pide),
// con el video mudo que pasa solo con el mouse encima; deja elegir otro look
// u otro avatar; un avatar sin look para el formato lo dice y lleva a «Crear
// escenario» en ese formato, y ese enlace abre en la biblioteca el panel del
// avatar con el diálogo listo en el formato, una sola vez; el costo sale con
// la tarifa de Avatar III del tipo del look; los controles van de 1 a 10
// apariciones y de 7 a 60 segundos; muestra el saldo de HeyGen (en dólares, o
// tal cual si es otra moneda) y el aviso de moderación destacado (una nota con
// su título); sin avatares lleva a crearlos; una elección horizontal no vale
// en un video 9:16 (el desplegable queda vacío y la vista previa sin foto);
// un avatar de stock sin look no ofrece «Crear escenario»;
// deshabilitada (la demo) nada responde; y una clave de HeyGen rechazada se
// lee «Sin configurar». Encendida, la tarjeta sigue lo que entrena o genera un
// look (el escenario pedido con «Crear escenario» aparece al terminar, sin
// salir de Crear); apagada no sondea, y la lista no se relee en cada foco de
// la ventana. Al consumirse, el enlace de la biblioteca sale de la URL. Con los
// hooks de saldo reales: el pre-check de Crear (useCostCheck: verify relee la
// billetera, una en créditos no bloquea, sin clave no se pide, y sin la línea
// del avatar tampoco) y la fila del aviso de un rechazo por saldo. Y el aviso
// de saldo: un techo dice «hasta» y los dólares se redondean como la tarjeta.
// Los simulacros parten del real (ERRORES-CONOCIDOS: simulacro-de-hook-en-un-
// guard-queda-viejo-en-silencio-cuando-el-hook-suma-un-miembro): `avatarsApi`,
// `apiKeysApi` y `videosApi` son los reales con solo las lecturas del sidecar
// reemplazadas (el cliente de Supabase que arrastra `videosApi`, que exige
// variables de entorno al cargarse, se reemplaza por una sesión vacía), y la
// raíz guarda `onUncaughtError` para que un render roto falle con su mensaje.
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
const root = await mkdtemp(join(tmpdir(), 'vimo-create-avatar-ui-'))
const mocks = {
  // `refresh` es lo que el sondeo le pregunta a HeyGen por un avatar que
  // entrena o tiene un look en camino: la respuesta sale del fixture (si el
  // caso preparó `refreshed`, el sidecar «guarda» ese estado nuevo).
  // `listStockLooks` es el listado de HeyGen de los looks de un grupo, con sus
  // vistas previas remotas (`fixture.stockLooks` por `groupId`).
  '@/modules/avatars/api': [
    "import { avatarsApi as real } from './src/modules/avatars/api/index.ts'",
    'export const avatarsApi = { ...real, isNative: () => true, async list() { window.listCalls += 1; return structuredClone(window.fixture.avatars) }, async refresh(id) { window.refreshCalls += 1; if (window.fixture.refreshed?.[id]) window.fixture.avatars = window.fixture.avatars.map((item) => (item.id === id ? window.fixture.refreshed[id] : item)); return structuredClone(window.fixture.avatars.find((item) => item.id === id)) }, async balance() { window.balanceCalls += 1; return structuredClone(window.fixture.balance) }, async listStockLooks(payload) { window.stockLooksCalls.push(payload); return { looks: structuredClone(window.fixture.stockLooks?.[payload.groupId] ?? []), nextToken: null } }, async listStockGroups() { return { groups: [], nextToken: null } }, imageSource: (path) => window.diskImage(path) }',
  ].join('\n'),
  // useCostCheck solo le pregunta si corre en la app nativa.
  '@/modules/videos/api': [
    "import { videosApi as real } from './src/modules/videos/api/index.ts'",
    'export const videosApi = { ...real, isNative: () => true }',
  ].join('\n'),
  '@/modules/common/supabase/client':
    'export const supabase = { auth: { getSession: async () => ({ data: { session: null } }) } }',
  '@/modules/api-keys/api': [
    "import { apiKeysApi as real } from './src/modules/api-keys/api/index.ts'",
    'export const apiKeysApi = { ...real, isNative: () => true, async getStatus() { return window.fixture.keys.map((providerId) => ({ providerId, configured: true, source: "manual", maskedKey: "••••", savedAt: 0, lastValidatedAt: null })) } }',
  ].join('\n'),
}
const entry = String.raw`
import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, useLocation } from 'react-router'
import es from './public/locales/es.json'
import { avatarScenarioPath } from '@/modules/avatars/constants'
import { AvatarLibrary } from '@/modules/avatars/views/AvatarLibrary'
import { CreditsBadge } from '@/modules/common/components/CreditsBadge'
import { InsufficientCreditsAlert } from '@/modules/common/components/InsufficientCreditsAlert'
import { TooltipProvider } from '@/modules/common/ui/tooltip'
import { formatCompact } from '@/modules/common/utilities/formatCompact'
import { formatUsd } from '@/modules/common/utilities/formatUsd'
import { CREATE_FORM_INITIAL_VALUE } from '@/modules/videos/constants'
import { CreateAvatarSection } from '@/modules/videos/components/CreateAvatarSection'
import { avatarCostEstimate, avatarUsd } from '@/modules/videos/utilities/avatarCostEstimate'
import { queryClient } from '@/modules/common/queryClient'
import { useCostCheck } from '@/modules/videos/hooks/useCostCheck'
import { useCreditsIssueLine } from '@/modules/videos/hooks/useCreditsIssueLine'
// Los límites salen de las constantes de la tarea 1 (valores abiertos con el
// dueño: si cambian, este guard no se toca).
import {
  AVATAR_DEFAULT_APPEARANCE_SECONDS,
  AVATAR_DEFAULT_APPEARANCES,
  AVATAR_MAX_APPEARANCE_SECONDS,
  AVATAR_MAX_APPEARANCES,
  AVATAR_MIN_APPEARANCE_SECONDS,
  AVATAR_MIN_APPEARANCES,
} from '@pipeline/types/avatar.ts'

let checks = 0
let renderError
const check = (condition, message) => { if (!condition) throw new Error(message); checks += 1 }
const delay = (ms = 30) => new Promise((done) => setTimeout(done, ms))
async function waitFor(get, message) {
  for (let index = 0; index < 100; index++) { if (renderError) throw renderError; const value = get(); if (value) return value; await delay() }
  throw new Error(message)
}
await i18n.init({ lng: 'es', resources: { es: { translation: es } }, interpolation: { escapeValue: false } })

// Los videos de las vistas previas no se bajan ni suenan acá: play y pause
// solo se anotan (con la URL del video) para ver qué los dispara.
window.plays = []
window.pauses = []
HTMLMediaElement.prototype.play = function () { window.plays.push(this.getAttribute('src')); return Promise.resolve() }
HTMLMediaElement.prototype.pause = function () { window.pauses.push(this.getAttribute('src')) }

const look = (lookId, name, lookType, preferredOrientation, supportedEngines = ['avatar_iii'], previewPath = '/library/looks/' + lookId + '.png') => ({ lookId, name, lookType, supportedEngines, preferredOrientation, status: 'ready', origin: 'heygen', ...(previewPath ? { previewPath } : {}), createdAt: '2026-10-09T00:00:00Z' })
const avatar = (id, name, ownership, mainLookId, looks, status = 'ready') => ({ id, name, groupId: 'group-' + id, ownership, status, mainLookId, looks, previewPath: '/library/' + id + '.jpg', createdAt: '2026-10-09T00:00:00Z' })
// Ana (propia: oficina y cocina horizontales, una vertical), Teo (de stock,
// gemelo digital horizontal), Vic (propio, solo vertical) y Luz (entrenando).
// La cocina no tiene vista previa en disco: la biblioteca baja solo las de su
// tarjeta (AVATAR_CARD_LOOK_PREVIEWS).
const LIBRARY = [
  avatar('ana-1', 'Ana', 'own', 'look-ana', [look('look-ana', 'Ana oficina', 'photo_avatar', 'landscape', ['avatar_iii', 'avatar_iv']), look('look-ana-vertical', 'Ana vertical', 'photo_avatar', 'portrait'), look('look-ana-cocina', 'Ana cocina', 'photo_avatar', 'landscape', ['avatar_iii'], null)]),
  avatar('teo-2', 'Teo', 'stock', 'look-teo', [look('look-teo', 'Teo estudio', 'digital_twin', 'landscape')]),
  avatar('vic-3', 'Vic', 'own', 'look-vic', [look('look-vic', 'Vic', 'studio_avatar', 'portrait')]),
  avatar('luz-4', 'Luz', 'own', null, [], 'processing'),
]
// Las imágenes cargan sin red (SVG en línea, distinto por ruta o por look):
// las de disco salen de avatarsApi.imageSource (el simulacro llama a
// window.diskImage) y el listado de HeyGen de cada grupo trae su imagen y
// un video que nunca se baja (play está simulado).
const svgImage = (title) => 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9"><title>' + title + '</title></svg>')
const diskImage = (path) => svgImage('disk:' + path)
window.diskImage = diskImage
const remoteImage = (lookId) => svgImage('heygen:' + lookId)
const remoteVideo = (lookId) => 'https://cdn.heygen.test/looks/' + lookId + '.mp4'
const stockLook = (item) => ({ lookId: item.lookId, name: item.name, lookType: item.lookType, supportedEngines: item.supportedEngines, preferredOrientation: item.preferredOrientation, previewImageUrl: remoteImage(item.lookId), previewVideoUrl: remoteVideo(item.lookId) })
const STOCK_LOOKS = Object.fromEntries(LIBRARY.map((item) => [item.groupId, item.looks.map(stockLook)]))
const ANA = { id: 'ana-1', name: 'Ana', lookId: 'look-ana', lookName: 'Ana oficina', lookType: 'photo_avatar' }
const ANA_KITCHEN = { ...ANA, lookId: 'look-ana-cocina', lookName: 'Ana cocina' }
const TEO = { id: 'teo-2', name: 'Teo', lookId: 'look-teo', lookName: 'Teo estudio', lookType: 'digital_twin' }
const USD = { available: true, remaining: 2.87, currency: 'usd' }
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)

let revision = 0
const reactRoot = createRoot(document.getElementById('root'), { onUncaughtError: (error) => { renderError = error } })
const freshClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
function Host({ initial, disabled }) {
  const [value, setValue] = React.useState(initial)
  window.value = value
  return <CreateAvatarSection value={value} disabled={disabled} onChange={(patch) => { window.patches.push(patch); setValue((current) => ({ ...current, ...patch })) }} />
}
// Cada caso arranca con caché, parches y biblioteca propios. El
// TooltipProvider es el de App.tsx: la ayuda del desplegable del look lo usa.
window.stockLooksCalls = []
function mount(fixture, initial = CREATE_FORM_INITIAL_VALUE, disabled = false) {
  window.fixture = { stockLooks: STOCK_LOOKS, ...fixture }
  window.patches = []
  window.listCalls = 0
  window.refreshCalls = 0
  window.balanceCalls = 0
  window.stockLooksCalls = []
  reactRoot.render(<QueryClientProvider key={++revision} client={freshClient()}><I18nextProvider i18n={i18n}><TooltipProvider><MemoryRouter><Host initial={initial} disabled={disabled} /></MemoryRouter></TooltipProvider></I18nextProvider></QueryClientProvider>)
}
// La URL del router en memoria (el enlace de la biblioteca vive en ella).
function LocationProbe() {
  window.search = useLocation().search
  return null
}
// Los hooks del pre-check de saldo, con el cliente único de la app (el mismo con el
// que verify() comparte la caché del saldo de HeyGen).
function CostHost({ estimates }) {
  const check = useCostCheck({ estimates, voiceVendor: null })
  window.check = check
  return <output id="cost-lines">{JSON.stringify(check.result.lines)}</output>
}
function IssueHost({ context, estimated }) {
  const issue = useCreditsIssueLine({ context, estimated })
  window.issue = issue
  return <output id="issue-line">{JSON.stringify(issue.line)}</output>
}
function mountWithAppClient(fixture, element) {
  window.fixture = fixture
  window.balanceCalls = 0
  window.check = undefined
  window.issue = undefined
  queryClient.clear()
  reactRoot.render(<QueryClientProvider key={++revision} client={queryClient}><I18nextProvider i18n={i18n}>{element}</I18nextProvider></QueryClientProvider>)
}
const toggle = () => document.getElementById('create-avatar')
const radiosIn = (labelKey) => [...(document.querySelector('[role=radiogroup][aria-label="' + i18n.t(labelKey) + '"]')?.querySelectorAll('[role=radio]') ?? [])]
const avatarRadios = () => radiosIn('create.avatar.chooseAvatar')
const named = (radios, name) => radios.find((radio) => radio.textContent.startsWith(name))
const isChecked = (radio) => radio?.getAttribute('aria-checked') === 'true'
// El desplegable «Look» (LabeledSelect): su disparador va en la misma columna
// que su etiqueta. Cerrado muestra el nombre del elegido; abierto, cada opción
// lleva el nombre y la nota (tipo y, la principal, su nota) en su ItemText.
const lookTrigger = () => [...document.querySelectorAll('label')].find((label) => label.textContent === i18n.t('create.avatar.lookLabel'))?.parentElement?.parentElement?.querySelector('[role=combobox]') ?? null
async function openLookOptions() {
  lookTrigger().click()
  const options = await waitFor(() => { const found = [...document.querySelectorAll('[role=option]')]; return found.length > 0 ? found : null }, 'la lista de looks se abre')
  return options.map((option) => {
    const [label, note] = [...document.getElementById(option.getAttribute('aria-labelledby')).children].map((child) => child.textContent)
    return { option, label, note, checked: option.getAttribute('data-state') === 'checked' }
  })
}
async function closeLookOptions() {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await waitFor(() => document.querySelectorAll('[role=option]').length === 0, 'la lista de looks se cierra')
}
async function chooseLookNamed(name) {
  const choice = (await openLookOptions()).find((option) => option.label === name)
  choice.option.click()
  await waitFor(() => document.querySelectorAll('[role=option]').length === 0, 'elegir un look cierra la lista')
}
// La vista previa de un look (o del avatar, sin look elegido) por su texto
// alternativo: la imagen, el dibujo de respaldo y el video de su caja.
function previewOf(name) {
  const alt = i18n.t('avatars.stock.previewAria', { name })
  const image = [...document.querySelectorAll('img')].find((element) => element.alt === alt) ?? null
  const doodle = [...document.querySelectorAll('[role=img]')].find((element) => element.getAttribute('aria-label') === alt) ?? null
  const box = (image ?? doodle)?.parentElement ?? null
  return { image, doodle, box, video: box?.querySelector('video') ?? null }
}
// El mouse entra o sale de un elemento (React arma enter/leave con
// mouseover/mouseout y el elemento de donde viene).
const hover = (element, inside) => element.dispatchEvent(new MouseEvent(inside ? 'mouseover' : 'mouseout', { bubbles: true, relatedTarget: document.body }))
// El cuerpo entero: los diálogos de la biblioteca van en un portal.
const text = () => document.body.textContent
const buttonNamed = (label) => [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === label)
const setRange = (id, value) => {
  const input = document.getElementById(id)
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(value))
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
try {
  // 1. Sin clave de HeyGen.
  mount({ avatars: LIBRARY, balance: USD, keys: [] })
  await waitFor(() => toggle() && text().includes(i18n.t('create.avatar.noKey')), 'aviso sin clave')
  check(toggle().disabled && toggle().getAttribute('aria-checked') === 'false', 'sin clave el interruptor queda apagado')
  check(document.querySelector('a[href="/api-keys?focus=heygen"]'), 'el aviso lleva a la clave de HeyGen en Claves API')
  check(window.listCalls === 0, 'sin clave no se lee la biblioteca')

  // 2. Con clave: al encender elige sola el primer avatar que sirve, con su principal.
  mount({ avatars: LIBRARY, balance: USD, keys: ['heygen'] })
  await waitFor(() => !toggle().disabled && window.listCalls > 0, 'clave leída y biblioteca pedida')
  await delay()
  // Apagada, la tarjeta lee la lista una vez (para elegir sola al encender):
  // ni le pregunta a HeyGen por Luz, que entrena, ni la relee al volver a la
  // ventana (la lectura vale un rato: CREATE_AVATAR_LIBRARY_STALE_TIME_MS).
  window.dispatchEvent(new Event('visibilitychange'))
  await delay(200)
  check(window.listCalls === 1 && window.refreshCalls === 0, 'apagada: una sola lectura de la biblioteca, sin sondeo ni relectura al volver a la ventana (' + window.listCalls + ' lecturas, ' + window.refreshCalls + ' sondeos)')
  toggle().click()
  await waitFor(() => window.patches.length === 1, 'encender el avatar')
  check(window.patches[0].useAvatar === true && same(window.patches[0].avatar, ANA), 'al encender se elige solo el primer avatar que sirve, con su look principal: ' + JSON.stringify(window.patches[0]))
  await waitFor(() => avatarRadios().length === 4 && lookTrigger(), 'una ficha por avatar y el desplegable del look')
  check(isChecked(named(avatarRadios(), 'Ana')) && named(avatarRadios(), 'Ana').textContent.includes(i18n.t('create.avatar.lookCount', { count: 2 })), 'Ana marcada, con sus dos looks horizontales')
  check(lookTrigger().textContent === 'Ana oficina', 'el desplegable muestra el look principal por defecto: ' + lookTrigger().textContent)
  check(document.querySelector('button[aria-label="' + i18n.t('create.avatar.lookHelp') + '"]'), 'el desplegable lleva la ayuda del look')
  const anaOptions = await openLookOptions()
  check(same(anaOptions.map((option) => option.label), ['Ana oficina', 'Ana cocina']) && anaOptions[0].checked && !anaOptions[1].checked, 'solo los looks horizontales, el principal primero y marcado: ' + anaOptions.map((option) => option.label).join(', '))
  check(anaOptions[0].note === i18n.t('avatars.types.photo_avatar') + ' · ' + i18n.t('create.avatar.lookMainNote') && anaOptions[1].note === i18n.t('avatars.types.photo_avatar'), 'cada look con su tipo, y el principal con la nota de la biblioteca: ' + anaOptions.map((option) => option.note).join(' | '))
  await closeLookOptions()
  check(!named(avatarRadios(), 'Vic').disabled && named(avatarRadios(), 'Vic').textContent.includes(i18n.t('create.avatar.noLookShort')), 'Vic solo tiene un look vertical: se puede mirar, sin look para 16:9')
  check(named(avatarRadios(), 'Luz').disabled && named(avatarRadios(), 'Luz').textContent.includes(i18n.t('create.avatar.training')), 'Luz entrena: no se puede elegir')
  check(text().includes(i18n.t('create.avatar.cost', { amount: formatUsd(0.495, 'es') })), '3 × 10 s de un avatar de foto: ≈ 0,50 US$')
  check(text().includes(i18n.t('create.avatar.lookHint')), 'el look sale tal cual, sin imágenes')
  const moderation = [...document.querySelectorAll('[role=note]')].find((element) => element.getAttribute('aria-label') === i18n.t('create.avatar.moderationTitle'))
  check(moderation?.textContent.includes(i18n.t('create.avatar.moderationTitle')) && moderation.textContent.includes(i18n.t('create.avatar.moderationHint')) && moderation.querySelector('svg')?.getAttribute('aria-hidden') === 'true', 'el aviso de moderación es una nota destacada con su título, el texto de siempre y el escudo decorativo')
  // La vista previa del principal es la de disco; su video, el del listado
  // de HeyGen, que para un avatar propio se pide entre los privados.
  const officePreview = await waitFor(() => { const preview = previewOf('Ana oficina'); return preview.image && preview.video ? preview : null }, 'la vista previa del principal con su video')
  check(officePreview.image.getAttribute('src') === diskImage('/library/looks/look-ana.png') && officePreview.video.getAttribute('src') === remoteVideo('look-ana'), 'la imagen de disco y el video remoto del principal: ' + officePreview.image.getAttribute('src').slice(0, 40) + ' · ' + officePreview.video.getAttribute('src'))
  check(window.stockLooksCalls.some((call) => call.groupId === 'group-ana-1' && call.ownership === 'private'), 'un avatar propio se lista entre los privados de la cuenta: ' + JSON.stringify(window.stockLooksCalls))
  await waitFor(() => text().includes(formatUsd(2.87, 'es')), 'el saldo de HeyGen en dólares')
  check(await waitFor(() => window.refreshCalls > 0, 'encendida, la tarjeta sigue a Luz, que entrena'), 'encendida, la tarjeta le pregunta a HeyGen por lo que entrena')

  // 3. Otro look del mismo avatar, desde el desplegable.
  await chooseLookNamed('Ana cocina')
  await waitFor(() => same(window.patches.at(-1), { avatar: ANA_KITCHEN }), 'elegir el look de la cocina')
  check(window.value.avatar.lookId === 'look-ana-cocina' && lookTrigger().textContent === 'Ana cocina', 'elegir otra opción cambia avatar.lookId en el formulario y el desplegable la muestra')
  const kitchenChecked = (await openLookOptions()).map((option) => option.checked)
  await closeLookOptions()
  check(same(kitchenChecked, [false, true]), 'en la lista queda marcado el look elegido, no el principal')
  // La cocina no tiene vista previa en disco: imagen y video del listado de
  // HeyGen. El video va mudo y pasa solo con el mouse sobre la vista previa.
  const kitchenPreview = await waitFor(() => { const preview = previewOf('Ana cocina'); return preview.image && preview.video ? preview : null }, 'la vista previa remota de la cocina')
  check(kitchenPreview.image.getAttribute('src') === remoteImage('look-ana-cocina') && kitchenPreview.video.getAttribute('src') === remoteVideo('look-ana-cocina'), 'un look sin vista previa en disco muestra la imagen y el video del listado de HeyGen: ' + kitchenPreview.image.getAttribute('src').slice(0, 40) + ' · ' + kitchenPreview.video.getAttribute('src'))
  check(kitchenPreview.video.muted && kitchenPreview.video.getAttribute('preload') === 'none' && !window.plays.includes(remoteVideo('look-ana-cocina')), 'el video de la vista previa va mudo y no se baja ni pasa sin el mouse encima')
  hover(kitchenPreview.box.parentElement, true)
  await waitFor(() => window.plays.includes(remoteVideo('look-ana-cocina')), 'con el mouse encima pasa el video del look')
  const pausesBefore = window.pauses.length
  hover(kitchenPreview.box.parentElement, false)
  await waitFor(() => window.pauses.length > pausesBefore && window.pauses.at(-1) === remoteVideo('look-ana-cocina'), 'al salir el mouse el video se pausa')
  const patchesBefore = window.patches.length
  named(avatarRadios(), 'Ana').click()
  await delay(100)
  check(window.patches.length === patchesBefore && lookTrigger().textContent === 'Ana cocina', 'volver a mirar al avatar elegido conserva el look que se eligió (sin parche nuevo)')

  // 4. Otro avatar: su look por defecto y su tarifa.
  named(avatarRadios(), 'Teo').click()
  await waitFor(() => same(window.patches.at(-1), { avatar: TEO }), 'elegir a Teo')
  check(text().includes(i18n.t('create.avatar.cost', { amount: formatUsd(0.3, 'es') })), 'un gemelo digital cobra 0,60 por minuto: ≈ 0,30 US$')
  await waitFor(() => lookTrigger()?.textContent === 'Teo estudio' && window.stockLooksCalls.some((call) => call.groupId === 'group-teo-2'), 'el look de Teo y sus vistas previas de HeyGen')
  check(window.stockLooksCalls.filter((call) => call.groupId === 'group-teo-2').every((call) => call.ownership === 'public'), 'un avatar de stock se lista entre los públicos: ' + JSON.stringify(window.stockLooksCalls))

  // 5. Un avatar sin look para el formato lo dice y lleva a «Crear escenario».
  named(avatarRadios(), 'Vic').click()
  await waitFor(() => same(window.patches.at(-1), { avatar: null }), 'mirar a Vic deja el formulario sin elección')
  check(isChecked(named(avatarRadios(), 'Vic')) && lookTrigger() === null && text().includes(i18n.t('create.avatar.noLookLandscape', { name: 'Vic' })), 'Vic marcado, sin desplegable de looks y con el motivo')
  await delay(200)
  check(!window.stockLooksCalls.some((call) => call.groupId === 'group-vic-3'), 'un avatar sin look para el formato no pide vistas previas a HeyGen')
  const scenarioLink = [...document.querySelectorAll('a')].find((link) => link.getAttribute('href') === avatarScenarioPath('vic-3', '16:9'))
  check(scenarioLink?.textContent === i18n.t('create.avatar.createScenario'), 'lleva a «Crear escenario» de Vic en 16:9')
  check(text().includes(i18n.t('create.avatar.costPending')), 'sin look no hay costo que mostrar')

  // 6. Volver a Teo y mover los controles.
  named(avatarRadios(), 'Teo').click()
  await waitFor(() => same(window.patches.at(-1), { avatar: TEO }), 'volver a Teo')
  const appearances = document.getElementById('create-avatar-appearances')
  const seconds = document.getElementById('create-avatar-seconds')
  check(appearances.min === String(AVATAR_MIN_APPEARANCES) && appearances.max === String(AVATAR_MAX_APPEARANCES) && appearances.value === String(AVATAR_DEFAULT_APPEARANCES) && seconds.min === String(AVATAR_MIN_APPEARANCE_SECONDS) && seconds.max === String(AVATAR_MAX_APPEARANCE_SECONDS) && seconds.value === String(AVATAR_DEFAULT_APPEARANCE_SECONDS), 'apariciones y segundos con los límites y los valores por defecto de la tarea 1')
  setRange('create-avatar-appearances', 5)
  await waitFor(() => same(window.patches.at(-1), { avatarAppearances: 5 }), 'cinco apariciones')
  const fiveSeconds = 5 * AVATAR_DEFAULT_APPEARANCE_SECONDS
  check(text().includes(i18n.t('create.avatar.total', { count: 5, seconds: fiveSeconds })) && text().includes(i18n.t('create.avatar.cost', { amount: formatUsd(avatarUsd('digital_twin', fiveSeconds), 'es') })), 'cinco apariciones de gemelo con la tarifa de Avatar III')
  setRange('create-avatar-seconds', AVATAR_MAX_APPEARANCE_SECONDS)
  await waitFor(() => same(window.patches.at(-1), { avatarSecondsPerAppearance: AVATAR_MAX_APPEARANCE_SECONDS }), 'el máximo de segundos por aparición')
  const start = [...document.querySelectorAll('input[type=checkbox]')].find((input) => input.closest('label')?.textContent.includes(i18n.t('create.avatar.startWithAvatar')))
  check(start?.checked === true, 'empieza con el avatar por defecto')
  start.click()
  await waitFor(() => same(window.patches.at(-1), { avatarStartsVideo: false }), 'desmarcar «Empieza con el avatar»')
  toggle().click()
  await waitFor(() => same(window.patches.at(-1), { useAvatar: false }), 'apagar el avatar')
  check(window.value.avatar?.id === 'teo-2' && avatarRadios().length === 0, 'apagado: la tarjeta se esconde y la elección se conserva')

  // 7. Biblioteca vacía.
  mount({ avatars: [], balance: USD, keys: ['heygen'] })
  await waitFor(() => !toggle().disabled && window.listCalls > 0, 'biblioteca vacía pedida')
  await delay()
  toggle().click()
  await waitFor(() => window.patches.length === 1, 'encender sin avatares')
  check(window.patches[0].avatar === null, 'sin avatares no hay elección')
  await waitFor(() => text().includes(i18n.t('create.avatar.emptyLibrary')), 'aviso de biblioteca vacía')
  check([...document.querySelectorAll('a[href="/avatars"]')].some((link) => link.textContent === i18n.t('create.avatar.createAvatar')), 'lleva a crear un avatar')

  // 8. Video 9:16 con una elección horizontal: no vale y se explica.
  mount({ avatars: LIBRARY, balance: USD, keys: ['heygen'] }, { ...CREATE_FORM_INITIAL_VALUE, videoFormat: '9:16', useAvatar: true, avatar: ANA })
  await waitFor(() => avatarRadios().length === 4 && lookTrigger(), 'el desplegable con los looks verticales de Ana')
  const portraitOptions = await openLookOptions()
  await closeLookOptions()
  check(same(portraitOptions.map((option) => option.label), ['Ana vertical']) && !portraitOptions[0].checked && lookTrigger().textContent === '' && text().includes(i18n.t('create.avatar.previousUnavailable')), 'el look horizontal elegido no se marca en 9:16 (el desplegable queda vacío) y se dice por qué')
  check(previewOf('Ana').doodle && !previewOf('Ana').image, 'sin look elegido, la vista previa es el dibujo con el nombre del avatar (no sugiere una elección que no hay)')
  check(named(avatarRadios(), 'Vic').textContent.includes(i18n.t('create.avatar.lookCount', { count: 1 })), 'en 9:16 Vic sí tiene look')
  named(avatarRadios(), 'Teo').click()
  await waitFor(() => text().includes(i18n.t('create.avatar.noLookPortrait', { name: 'Teo' })), 'Teo no tiene look vertical')
  check(text().includes(i18n.t('create.avatar.stockNoLook')) && ![...document.querySelectorAll('a')].some((link) => link.getAttribute('href') === avatarScenarioPath('teo-2', '9:16')), 'un avatar de stock no admite escenarios nuevos: no hay enlace a «Crear escenario»')

  // 9. Un saldo en otra moneda se muestra tal cual (no bloquea: ver check-app-avatar-create).
  mount({ avatars: LIBRARY, balance: { available: true, remaining: 12, currency: 'credits' }, keys: ['heygen'] }, { ...CREATE_FORM_INITIAL_VALUE, useAvatar: true, avatar: ANA })
  await waitFor(() => text().includes(i18n.t('avatars.saldo.creditos', { amount: formatCompact(12) })), 'el saldo en créditos tal cual')
  check(!text().includes(formatUsd(12, 'es')), 'el saldo en créditos no se disfraza de dólares')

  // 9b. De vuelta de «Crear escenario» con el look nuevo todavía en camino:
  // encendida, la tarjeta le pregunta a HeyGen cómo va (el sidecar guarda el
  // estado nuevo) y el look aparece para elegir sin salir de Crear.
  const coming = { ...look('look-ana-nuevo', 'Ana nueva', 'photo_avatar', 'landscape'), status: 'processing' }
  const anaWith = (extra) => ({ ...LIBRARY[0], looks: [...LIBRARY[0].looks, extra] })
  mount({ avatars: [anaWith(coming)], balance: USD, keys: ['heygen'], refreshed: { 'ana-1': anaWith({ ...coming, status: 'ready' }) } }, { ...CREATE_FORM_INITIAL_VALUE, useAvatar: true, avatar: ANA })
  await waitFor(() => window.refreshCalls > 0 && named(avatarRadios(), 'Ana')?.textContent.includes(i18n.t('create.avatar.lookCount', { count: 3 })), 'el look nuevo aparece al terminar')
  const withNewLook = await openLookOptions()
  await closeLookOptions()
  check(same(withNewLook.map((option) => option.label), ['Ana oficina', 'Ana cocina', 'Ana nueva']) && withNewLook[0].checked && lookTrigger().textContent === 'Ana oficina', 'el look nuevo se suma a los de Ana y la elección no cambia: ' + withNewLook.map((option) => option.label).join(', '))

  // 10. El enlace de «Crear escenario» abre la biblioteca en el panel de Vic
  // con el diálogo listo en el formato, una sola vez. Sin avatares
  // entrenando: el sondeo de la biblioteca no entra en juego.
  window.fixture = { avatars: LIBRARY.filter((item) => item.status === 'ready'), balance: USD, keys: ['heygen'] }
  window.listCalls = 0
  reactRoot.render(<QueryClientProvider key={++revision} client={freshClient()}><I18nextProvider i18n={i18n}><MemoryRouter initialEntries={[avatarScenarioPath('vic-3', '9:16')]}><LocationProbe /><AvatarLibrary /></MemoryRouter></I18nextProvider></QueryClientProvider>)
  const scenarioTitle = i18n.t('avatars.generar.titulo', { name: 'Vic' })
  await waitFor(() => text().includes(scenarioTitle), 'el diálogo «Crear escenario» de Vic abre solo')
  const ratio = [...document.querySelectorAll('button[aria-pressed]')].find((button) => button.textContent.includes(i18n.t('avatars.generar.ratios.r9x16')))
  check(ratio?.getAttribute('aria-pressed') === 'true', 'el formato del video ya viene elegido')
  buttonNamed(i18n.t('avatars.generar.cancelar')).click()
  await waitFor(() => !text().includes(scenarioTitle), 'cancelar cierra el diálogo')
  check(window.search.includes('scenario='), 'mientras el panel sigue abierto, el enlace sigue en la URL')
  ;[...document.querySelectorAll('[aria-label]')].find((element) => element.getAttribute('aria-label') === i18n.t('avatars.detalle.cerrar')).click()
  await waitFor(() => !text().includes(i18n.t('avatars.detalle.looks')), 'cerrar el panel')
  check(await waitFor(() => window.search === '', 'el enlace consumido sale de la URL (sigue: ' + window.search + ')'), 'consumido el enlace, la URL queda sin él: volver con el historial no lo reabre')
  document.querySelector('[data-avatar-id="vic-3"]').click()
  await waitFor(() => text().includes(i18n.t('avatars.detalle.looks')), 'reabrir el panel de Vic')
  await delay(300)
  check(!text().includes(scenarioTitle), 'reabrir el panel no vuelve a abrir el diálogo: el enlace vale una vez')

  // 11. Una clave de HeyGen rechazada se lee «Sin configurar» (NOT_CONFIGURED_CREDITS_CODES).
  reactRoot.render(<I18nextProvider key={++revision} i18n={i18n}><CreditsBadge provider="HeyGen" status={{ available: false, errorCode: 'avatar_invalid_key' }} loading={false} active={false} formatBalance={(remaining) => String(remaining)} /></I18nextProvider>)
  await waitFor(() => text().includes(i18n.t('create.credits.notConfigured')), 'clave de HeyGen rechazada')
  check(!text().includes(i18n.t('create.credits.error')), 'una clave de HeyGen rechazada no se lee como error')

  // 12. Deshabilitada (la demo, o el formulario entero): nada responde.
  mount({ avatars: LIBRARY, balance: USD, keys: ['heygen'] }, { ...CREATE_FORM_INITIAL_VALUE, useAvatar: true, avatar: ANA }, true)
  await waitFor(() => avatarRadios().length === 4 && lookTrigger()?.textContent === 'Ana oficina', 'la tarjeta deshabilitada con su elección')
  const startRow = [...document.querySelectorAll('input[type=checkbox]')].find((input) => input.closest('label')?.textContent.includes(i18n.t('create.avatar.startWithAvatar')))
  check(toggle().disabled && avatarRadios().every((radio) => radio.disabled) && lookTrigger().disabled, 'deshabilitada: ni el interruptor, ni las fichas, ni el desplegable del look responden')
  check(document.getElementById('create-avatar-appearances').disabled && document.getElementById('create-avatar-seconds').disabled && startRow?.disabled === true, 'deshabilitada: tampoco las apariciones, los segundos ni la casilla')

  // 13. El pre-check de saldo con los hooks reales: la línea de HeyGen se compara en
  // dólares con la billetera, verify() relee antes de arrancar, y sin clave no se
  // pide el saldo ni se bloquea.
  const estimate = avatarCostEstimate('photo_avatar', 30)
  mountWithAppClient({ avatars: [], balance: { available: true, remaining: 0.2, currency: 'usd' }, keys: ['heygen'] }, <CostHost estimates={[estimate]} />)
  await waitFor(() => window.check?.result.lines[0]?.available === 0.2, 'el saldo de HeyGen entra al pre-check')
  const line = window.check.result.lines[0]
  check(window.check.result.blocking && line.providerId === 'heygen' && line.providerLabel === 'HeyGen' && line.unit === 'usd' && line.estimated === 0.495 && line.sufficient === false, 'con 0,20 US$ y un costo de 0,495 el pre-check bloquea: ' + JSON.stringify(line))
  window.fixture.balance = { available: true, remaining: 5, currency: 'usd' }
  const fresh = await window.check.verify()
  check(!fresh.blocking && fresh.lines[0].available === 5 && fresh.lines[0].sufficient === true && window.balanceCalls >= 2, 'verify() relee la billetera justo antes de arrancar y ya alcanza: ' + JSON.stringify(fresh))
  mountWithAppClient({ avatars: [], balance: { available: true, remaining: 12, currency: 'credits' }, keys: ['heygen'] }, <CostHost estimates={[estimate]} />)
  await waitFor(() => window.balanceCalls > 0, 'se lee la billetera en créditos')
  await delay(100)
  check(!window.check.result.blocking && window.check.result.lines[0].sufficient === null, 'una billetera en créditos no se compara con dólares: no bloquea')
  mountWithAppClient({ avatars: [], balance: USD, keys: [] }, <CostHost estimates={[estimate]} />)
  await waitFor(() => window.check, 'pre-check sin clave')
  await delay(200)
  check(window.balanceCalls === 0 && !window.check.result.blocking && window.check.result.unreadable && window.check.result.lines[0].available === null, 'sin clave de HeyGen no se pide el saldo ni se bloquea')
  // Con clave pero sin la línea del avatar (quien no lo usa): la billetera de
  // HeyGen no se pide; cada lectura es un proceso del sidecar.
  mountWithAppClient({ avatars: [], balance: USD, keys: ['heygen'] }, <CostHost estimates={[{ domain: 'voice', providerId: 'dubvoice', unit: 'credits', estimated: 10 }]} />)
  await waitFor(() => window.check, 'pre-check sin avatar')
  await delay(200)
  check(window.balanceCalls === 0, 'sin la línea del avatar no se lee la billetera de HeyGen, aunque haya clave')

  // 14. El aviso de un rechazo por saldo (avatar_insufficient_credits): la cuenta que
  // rechazó es la de HeyGen y otro dominio no pide su saldo.
  mountWithAppClient({ avatars: [], balance: USD, keys: ['heygen'] }, <IssueHost context={{ domain: 'avatar', imageProvider: null, voiceVendor: null, videoProvider: null }} estimated={0.495} />)
  await waitFor(() => window.issue?.line.available === 2.87, 'el saldo de la cuenta que rechazó')
  check(same(window.issue.line, { providerId: 'heygen', providerLabel: 'HeyGen', unit: 'usd', estimated: 0.495, available: 2.87, sufficient: true }), 'la fila del aviso es la de HeyGen en dólares: ' + JSON.stringify(window.issue.line))
  mountWithAppClient({ avatars: [], balance: USD, keys: ['heygen'] }, <IssueHost context={{ domain: 'llm', imageProvider: null, voiceVendor: null, videoProvider: null }} />)
  await waitFor(() => window.issue, 'aviso de otro dominio')
  await delay(200)
  check(window.balanceCalls === 0, 'un rechazo de otra cuenta no consulta el saldo de HeyGen')

  // 15. El aviso de saldo: lo que falta por reanudar es un techo («hasta»), los dólares
  // llevan el redondeo de Intl (los mismos 0,50 de la tarjeta, no el 0,49 de toFixed) y
  // una cifra exacta sigue diciendo «necesitás».
  const shortfall = { providerId: 'heygen', providerLabel: 'HeyGen', unit: 'usd', estimated: 0.495, available: 0.2, sufficient: false }
  const usd = (amount) => i18n.t('common.credits.unitUsd', { amount })
  reactRoot.render(<I18nextProvider key={++revision} i18n={i18n}><InsufficientCreditsAlert lines={[{ ...shortfall, upperBound: true }]} blocking onReload={() => {}} /></I18nextProvider>)
  await waitFor(() => text().includes(i18n.t('common.credits.neededUpTo', { amount: usd('0,50') })), 'la fila de un techo dice «hasta»')
  check(text().includes(i18n.t('common.credits.available', { amount: usd('0,20') })) && !text().includes(i18n.t('common.credits.needed', { amount: usd('0,50') })), 'el techo no se lee como un costo exacto y el saldo lleva sus dos decimales')
  reactRoot.render(<I18nextProvider key={++revision} i18n={i18n}><InsufficientCreditsAlert lines={[shortfall]} blocking onReload={() => {}} /></I18nextProvider>)
  await waitFor(() => text().includes(i18n.t('common.credits.needed', { amount: usd('0,50') })), 'la fila exacta dice «necesitás»')
  check(!text().includes(i18n.t('common.credits.neededUpTo', { amount: usd('0,50') })), 'una cifra exacta no dice «hasta»')

  document.getElementById('result').textContent = 'PASS: create avatar section (' + checks + ' checks)'
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
