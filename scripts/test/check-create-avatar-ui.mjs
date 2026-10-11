// La tarjeta «Avatar presentador» de Crear (ADR-0057, spec §6.2 y §9, con el
// cambio de dirección del dueño del 2026-10-10: el look ES el escenario) con
// sus hooks reales en Chrome headless: sin clave de HeyGen avisa y deja el
// interruptor apagado; al encender elige sola el primer avatar que sirve con
// su look principal. Desde la entrega 2c, la fila «Avatar» tiene tarjetas con
// la forma del video (horizontales en 16:9, verticales en 9:16) que muestran
// el look de cada avatar para este video —el elegido en el elegido, el de por
// defecto en los demás— con su nombre, el del avatar (si el look no se llama
// igual) y «+N looks» con los demás looks; uno sin look para el formato
// muestra su cara y el motivo. Al montar Crear se pide, como mucho, el
// listado de HeyGen del avatar elegido (uno propio entre los privados, uno de
// stock entre los públicos): las demás tarjetas muestran su look si está en
// disco y, si no, la cara, hasta que la persona se detiene encima o les llega
// el foco del teclado. El video, mudo, pasa solo con el mouse quieto encima
// (cruzar una tarjeta sin detenerse no pide su listado ni pasa nada; la
// segunda pasada arranca al entrar) o con el foco visible del teclado, que
// cuenta al instante. El botón «Look» (`aria-expanded`, nombra al avatar)
// abre y cierra la grilla con TODOS los looks del avatar (la grilla también
// lo nombra), el principal primero con «Principal», cada uno con su formato;
// los que no se eligen, con el motivo que da la regla (otro formato, no
// listos, sin Avatar III, orientación sin confirmar), se ven atenuados,
// pasan su video y siguen enfocables (`aria-disabled`): el teclado llega a
// ellos y Enter no los elige. Elegir uno (con el mouse o con Enter) lo pasa
// al formulario, cierra la grilla y deja el foco en el botón; tocar el
// elegido solo cierra. Un avatar sin look para el formato lo dice debajo de
// su botón «Look» (su grilla, sin nada que elegir y sin la ayuda del look, no
// pide nada a HeyGen hasta abrirse) y lleva a «Crear escenario» en ese
// formato, y ese enlace abre en la biblioteca el panel del avatar con el
// diálogo listo en el formato, una sola vez; el costo sale con la tarifa de
// Avatar III del tipo del look; los controles van de 1 a 10 apariciones y de
// 7 a 60 segundos; muestra el saldo de HeyGen (en dólares, o tal cual si es
// otra moneda) y el aviso de moderación destacado (una nota con su título);
// sin avatares lleva a crearlos; una elección horizontal no vale en un video
// 9:16 (la tarjeta muestra la cara, la grilla no marca nada y elegir el
// vertical la arregla); un avatar de stock sin look no ofrece «Crear
// escenario»; deshabilitada (la demo) nada responde; y una clave de HeyGen
// rechazada se lee «Sin configurar». Encendida, la tarjeta sigue lo que
// entrena o genera un look (el escenario pedido con «Crear escenario» aparece
// al terminar, sin salir de Crear); apagada no sondea, y la lista no se
// relee en cada foco de la ventana. Al consumirse, el enlace de la biblioteca
// sale de la URL. Con los hooks de saldo reales: el pre-check de Crear
// (useCostCheck: verify relee la billetera, una en créditos no bloquea, sin
// clave no se pide, y sin la línea del avatar tampoco) y la fila del aviso de
// un rechazo por saldo. Y el aviso de saldo: un techo dice «hasta» y los
// dólares se redondean como la tarjeta. Las teclas son de verdad (CDP, con la
// emulación de foco), así el foco del teclado queda «visible».
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
// Las teclas que el caso puede pedir. Enter lleva su texto: sin él Chrome no
// activa el botón (ERRORES-CONOCIDOS: cdp-enter-sin-text-retorno-no-activa-el-
// boton).
const KEYS = {
  Tab: { code: 'Tab', windowsVirtualKeyCode: 9 },
  Enter: { code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
}
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
import { AVATAR_LOOK_FRAME_CLASSES, CREATE_FORM_INITIAL_VALUE } from '@/modules/videos/constants'
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
// solo se anotan (con la URL del video, y el elemento que reprodujo) para ver
// qué los dispara.
window.plays = []
window.playedVideos = []
window.pauses = []
HTMLMediaElement.prototype.play = function () { window.plays.push(this.getAttribute('src')); window.playedVideos.push(this); return Promise.resolve() }
HTMLMediaElement.prototype.pause = function () { window.pauses.push(this.getAttribute('src')) }

const look = (lookId, name, lookType, preferredOrientation, supportedEngines = ['avatar_iii'], previewPath = '/library/looks/' + lookId + '.png') => ({ lookId, name, lookType, supportedEngines, preferredOrientation, status: 'ready', origin: 'heygen', ...(previewPath ? { previewPath } : {}), createdAt: '2026-10-09T00:00:00Z' })
const avatar = (id, name, ownership, mainLookId, looks, status = 'ready') => ({ id, name, groupId: 'group-' + id, ownership, status, mainLookId, looks, previewPath: '/library/' + id + '.jpg', createdAt: '2026-10-09T00:00:00Z' })
// Ana (propia: oficina y cocina horizontales, una vertical), Teo (de stock,
// gemelo digital horizontal), Vic (propio, solo vertical) y Luz (entrenando).
// La cocina no tiene vista previa en disco: la biblioteca baja solo las de su
// tarjeta (AVATAR_CARD_LOOK_PREVIEWS). En la lista de Ana la vertical va antes
// que el principal: la grilla igual tiene que poner el principal primero
// (con el principal ya primero, esa prueba pasaría sin reordenar nada).
const LIBRARY = [
  avatar('ana-1', 'Ana', 'own', 'look-ana', [look('look-ana-vertical', 'Ana vertical', 'photo_avatar', 'portrait'), look('look-ana', 'Ana oficina', 'photo_avatar', 'landscape', ['avatar_iii', 'avatar_iv']), look('look-ana-cocina', 'Ana cocina', 'photo_avatar', 'landscape', ['avatar_iii'], null)]),
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
const ANA_VERTICAL = { ...ANA, lookId: 'look-ana-vertical', lookName: 'Ana vertical' }
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
// TooltipProvider es el de App.tsx.
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
const radiosIn = (root, label) => [...(root?.querySelector('[role=radiogroup][aria-label="' + label + '"]')?.querySelectorAll('[role=radio]') ?? [])]
const avatarRadios = () => radiosIn(document, i18n.t('create.avatar.chooseAvatar'))
// El nombre accesible de una tarjeta o ficha (los textos que nombra su
// aria-labelledby, en ese orden) y su descripción (aria-describedby).
const idsText = (element, attribute, glue) => (element?.getAttribute(attribute) ?? '').split(' ').filter(Boolean).map((id) => document.getElementById(id)?.textContent ?? '?').join(glue)
const nameOf = (element) => idsText(element, 'aria-labelledby', ' ')
const descriptionOf = (element) => idsText(element, 'aria-describedby', ' | ')
// La tarjeta de un avatar: su nombre accesible empieza por el del avatar.
const named = (radios, name) => radios.find((radio) => nameOf(radio) === name || nameOf(radio).startsWith(name + ' '))
const isChecked = (radio) => radio?.getAttribute('aria-checked') === 'true'
const moreLooks = (count) => i18n.t('create.avatar.moreLooks', { count })
// El botón «Look» (su texto visible; nombra al avatar en su etiqueta), la
// región que controla y las fichas de la grilla, por su nombre accesible.
const looksButton = () => [...document.querySelectorAll('button[aria-expanded]')].find((button) => button.textContent === i18n.t('create.avatar.lookLabel')) ?? null
const looksRegion = () => document.getElementById(looksButton()?.getAttribute('aria-controls') ?? '')
const looksGroup = () => looksRegion()?.querySelector('[role=radiogroup]') ?? null
const lookRadios = () => [...(looksGroup()?.querySelectorAll('[role=radio]') ?? [])]
const lookCard = (name) => lookRadios().find((radio) => nameOf(radio) === name)
// Una ficha que no se elige: aria-disabled, sigue enfocable (no disabled).
const isBlocked = (radio) => radio?.getAttribute('aria-disabled') === 'true' && !radio.disabled
// ¿Reprodujo su video esta tarjeta o ficha?
const playedIn = (element) => window.playedVideos.some((video) => element?.contains(video))
// Teclas de verdad (CDP, desde Node, con la emulación de foco: solo una tecla
// de verdad deja el foco «visible»): el caso las pide y espera.
let nextKey = 0
window.keyQueue = []
window.keysDone = new Set()
function pressKey(key) {
  const id = ++nextKey
  window.keyQueue.push({ id, key })
  return waitFor(() => window.keysDone.has(id), 'la tecla ' + key)
}
async function openLooks() {
  if (looksButton().getAttribute('aria-expanded') !== 'true') looksButton().click()
  return waitFor(() => (lookRadios().length > 0 ? lookRadios() : null), 'la grilla de looks se abre')
}
// La vista previa de una tarjeta o ficha: su imagen (o el dibujo de
// respaldo), la caja con su forma y el video de esa caja.
function previewIn(radio) {
  const image = radio?.querySelector('img') ?? null
  const doodle = radio?.querySelector('[role=img]') ?? null
  const box = (image ?? doodle)?.parentElement ?? null
  return { image, doodle, box, video: box?.querySelector('video') ?? null }
}
const formatAria = (format) => i18n.t('avatars.formato.aria', { format })
const playsOf = (src) => window.plays.filter((played) => played === src).length
// El mouse entra o sale de un elemento (React arma enter/leave con
// mouseover/mouseout y el elemento de donde viene). Se escucha en el
// contenedor de cada tarjeta o ficha (el padre del radio).
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
  await waitFor(() => avatarRadios().length === 4 && looksButton(), 'una tarjeta por avatar y el botón «Look»')
  // Las tarjetas tienen la forma del video: en 16:9, horizontales.
  check(avatarRadios().every((radio) => previewIn(radio).box?.classList.contains(AVATAR_LOOK_FRAME_CLASSES['16:9'])), 'en 16:9 las tarjetas de la fila son horizontales (' + AVATAR_LOOK_FRAME_CLASSES['16:9'] + ')')
  // La elegida muestra su look (el principal, por defecto) y los demás looks
  // de Ana (tiene tres: «+2 looks»); Teo, su único look, sin «+N».
  const ana = named(avatarRadios(), 'Ana')
  check(isChecked(ana) && nameOf(ana) === 'Ana Ana oficina ' + moreLooks(2), 'Ana marcada, con el nombre de su look principal y «+2 looks»: ' + nameOf(ana))
  check(!isChecked(named(avatarRadios(), 'Teo')) && nameOf(named(avatarRadios(), 'Teo')) === 'Teo Teo estudio', 'Teo muestra su look por defecto, sin «+N looks» (tiene uno solo): ' + nameOf(named(avatarRadios(), 'Teo')))
  const vic = named(avatarRadios(), 'Vic')
  check(!vic.disabled && nameOf(vic) === 'Vic ' + i18n.t('create.avatar.noLookShort') && previewIn(vic).image?.getAttribute('src') === diskImage('/library/vic-3.jpg'), 'Vic solo tiene un look vertical: se puede mirar, con su cara y sin look para 16:9: ' + nameOf(vic))
  check(named(avatarRadios(), 'Luz').disabled && nameOf(named(avatarRadios(), 'Luz')) === 'Luz ' + i18n.t('create.avatar.training'), 'Luz entrena: no se puede elegir')
  check(text().includes(i18n.t('create.avatar.cost', { amount: formatUsd(0.495, 'es') })), '3 × 10 s de un avatar de foto: ≈ 0,50 US$')
  check(text().includes(i18n.t('create.avatar.lookHint')), 'el look sale tal cual, sin imágenes')
  const moderation = [...document.querySelectorAll('[role=note]')].find((element) => element.getAttribute('aria-label') === i18n.t('create.avatar.moderationTitle'))
  check(moderation?.textContent.includes(i18n.t('create.avatar.moderationTitle')) && moderation.textContent.includes(i18n.t('create.avatar.moderationHint')) && moderation.querySelector('svg')?.getAttribute('aria-hidden') === 'true', 'el aviso de moderación es una nota destacada con su título, el texto de siempre y el escudo decorativo')
  // La imagen del principal es la de disco; su video, el del listado de
  // HeyGen, que la tarjeta del avatar que se mira pide de entrada (un avatar
  // propio, entre los privados).
  const officePreview = await waitFor(() => { const preview = previewIn(named(avatarRadios(), 'Ana')); return preview.image && preview.video ? preview : null }, 'la vista previa del principal con su video')
  check(officePreview.image.getAttribute('src') === diskImage('/library/looks/look-ana.png') && officePreview.video.getAttribute('src') === remoteVideo('look-ana'), 'la imagen de disco y el video remoto del principal: ' + officePreview.image.getAttribute('src').slice(0, 40) + ' · ' + officePreview.video.getAttribute('src'))
  check(window.stockLooksCalls.some((call) => call.groupId === 'group-ana-1' && call.ownership === 'private'), 'un avatar propio se lista entre los privados de la cuenta: ' + JSON.stringify(window.stockLooksCalls))
  await waitFor(() => text().includes(formatUsd(2.87, 'es')), 'el saldo de HeyGen en dólares')
  check(await waitFor(() => window.refreshCalls > 0, 'encendida, la tarjeta sigue a Luz, que entrena'), 'encendida, la tarjeta le pregunta a HeyGen por lo que entrena')
  // El video, mudo, pasa solo con el mouse quieto encima (HOVER_FETCH_DELAY_MS):
  // recién entrado todavía no, y al salir se pausa.
  const officeVideo = remoteVideo('look-ana')
  check(officePreview.video.muted && officePreview.video.getAttribute('preload') === 'none' && playsOf(officeVideo) === 0, 'el video de la tarjeta va mudo y no se baja ni pasa sin el mouse encima')
  hover(named(avatarRadios(), 'Ana').parentElement, true)
  await delay(100)
  check(playsOf(officeVideo) === 0, 'recién entrado el mouse, el video todavía no pasa: espera que se quede quieto')
  await waitFor(() => playsOf(officeVideo) === 1, 'con el mouse quieto encima pasa el video del look')
  const pausesBefore = window.pauses.length
  hover(named(avatarRadios(), 'Ana').parentElement, false)
  await waitFor(() => window.pauses.length > pausesBefore && window.pauses.at(-1) === officeVideo, 'al salir el mouse el video se pausa')
  // La segunda vez que el mouse entra en una tarjeta en la que ya se detuvo,
  // el video arranca al entrar: la intención de useHoverIntent no se apaga
  // (como en la biblioteca).
  hover(named(avatarRadios(), 'Ana').parentElement, true)
  await delay(100)
  check(playsOf(officeVideo) === 2, 'la segunda pasada por una tarjeta ya mirada arranca el video al entrar, sin volver a esperar')
  hover(named(avatarRadios(), 'Ana').parentElement, false)
  // Cruzar la tarjeta de Teo sin detenerse no pide su listado (un proceso del
  // sidecar y una llamada a HeyGen) ni pasa nada; quedarse encima, sí.
  const teoVideo = remoteVideo('look-teo')
  hover(named(avatarRadios(), 'Teo').parentElement, true)
  await delay(80)
  hover(named(avatarRadios(), 'Teo').parentElement, false)
  await delay(400)
  check(!window.stockLooksCalls.some((call) => call.groupId === 'group-teo-2') && playsOf(teoVideo) === 0, 'cruzar la tarjeta de Teo sin detenerse no pide su listado ni pasa su video: ' + JSON.stringify(window.stockLooksCalls))
  hover(named(avatarRadios(), 'Teo').parentElement, true)
  await waitFor(() => playsOf(teoVideo) === 1, 'con el mouse quieto sobre Teo se pide su listado y pasa su video')
  check(window.stockLooksCalls.filter((call) => call.groupId === 'group-teo-2').length === 1 && window.stockLooksCalls.filter((call) => call.groupId === 'group-teo-2').every((call) => call.ownership === 'public'), 'un pedido del listado de Teo, entre los públicos (es de stock): ' + JSON.stringify(window.stockLooksCalls))
  hover(named(avatarRadios(), 'Teo').parentElement, false)

  // 3. El botón «Look»: abre y cierra la grilla con TODOS los looks de Ana.
  const looks = looksButton()
  check(looks.getAttribute('aria-label') === i18n.t('create.avatar.looksToggleAria', { name: 'Ana' }) && looks.getAttribute('aria-expanded') === 'false' && looksRegion()?.hidden === true && lookRadios().length === 0, 'el botón «Look» nombra al avatar y arranca cerrado, con su grilla escondida')
  const anaLooks = await openLooks()
  check(looks.getAttribute('aria-expanded') === 'true' && looksRegion().hidden === false, 'el botón abre la grilla (aria-expanded y la región a la vista)')
  check(looksGroup().getAttribute('aria-label') === i18n.t('create.avatar.looksToggleAria', { name: 'Ana' }), 'la grilla dice de quién son los looks: ' + looksGroup().getAttribute('aria-label'))
  check(same(anaLooks.map(nameOf), ['Ana oficina', 'Ana vertical', 'Ana cocina']), 'la grilla trae todos los looks de Ana, el principal primero: ' + anaLooks.map(nameOf).join(', '))
  check(descriptionOf(lookCard('Ana oficina')).includes(formatAria('16:9')) && descriptionOf(lookCard('Ana vertical')).includes(formatAria('9:16')) && descriptionOf(lookCard('Ana cocina')).includes(formatAria('16:9')), 'cada ficha dice el formato de su look: ' + anaLooks.map(descriptionOf).join(' / '))
  check(isChecked(lookCard('Ana oficina')) && !isChecked(lookCard('Ana cocina')) && descriptionOf(lookCard('Ana oficina')).includes(i18n.t('create.avatar.mainLook')) && !descriptionOf(lookCard('Ana cocina')).includes(i18n.t('create.avatar.mainLook')), 'el principal va elegido por defecto y es el único que dice «Principal»')
  const vertical = lookCard('Ana vertical')
  check(isBlocked(vertical) && !isChecked(vertical) && descriptionOf(vertical).includes(i18n.t('create.avatar.otherFormat', { format: '9:16' })), 'el look vertical se ve pero no se elige en un video 16:9 (aria-disabled, sigue enfocable), y dice para qué videos es: ' + descriptionOf(vertical))
  check(!isBlocked(lookCard('Ana cocina')) && descriptionOf(lookCard('Ana cocina')).includes(i18n.t('avatars.types.photo_avatar')), 'la cocina se puede elegir y dice su tipo')
  // Las vistas previas de la grilla: la de disco si la hay; si no, la del listado.
  const kitchenInGrid = await waitFor(() => (previewIn(lookCard('Ana cocina')).image ? previewIn(lookCard('Ana cocina')) : null), 'la vista previa de la cocina en la grilla')
  check(previewIn(lookCard('Ana oficina')).image?.getAttribute('src') === diskImage('/library/looks/look-ana.png') && kitchenInGrid.image.getAttribute('src') === remoteImage('look-ana-cocina'), 'la grilla usa la vista previa de disco y, sin ella, la del listado de HeyGen')
  // Una ficha que no se elige igual pasa su video con el mouse quieto encima
  // (recién entrado, todavía no), y tocarla no hace nada.
  hover(vertical.parentElement, true)
  await delay(100)
  check(playsOf(remoteVideo('look-ana-vertical')) === 0, 'recién entrado el mouse en una ficha, su video todavía no pasa')
  await waitFor(() => playsOf(remoteVideo('look-ana-vertical')) === 1, 'la ficha del look vertical pasa su video con el mouse quieto encima')
  hover(vertical.parentElement, false)
  const patchesBeforeVertical = window.patches.length
  vertical.click()
  await delay(100)
  check(window.patches.length === patchesBeforeVertical && looks.getAttribute('aria-expanded') === 'true', 'tocar el look de otro formato no lo elige ni cierra la grilla')
  looks.click()
  await waitFor(() => looks.getAttribute('aria-expanded') === 'false', 'el botón cierra la grilla')
  check(looksRegion().hidden === true && lookRadios().length === 0, 'cerrada, la grilla se esconde')

  // Elegir la cocina: la pasa al formulario, cierra la grilla y deja el foco
  // en el botón; la tarjeta de arriba muestra la cocina.
  await openLooks()
  lookCard('Ana cocina').click()
  await waitFor(() => same(window.patches.at(-1), { avatar: ANA_KITCHEN }), 'elegir el look de la cocina')
  check(window.value.avatar.lookId === 'look-ana-cocina' && looks.getAttribute('aria-expanded') === 'false' && looksRegion().hidden === true && document.activeElement === looks, 'elegir un look cambia avatar.lookId, cierra la grilla y deja el foco en el botón «Look»')
  check(nameOf(named(avatarRadios(), 'Ana')) === 'Ana Ana cocina ' + moreLooks(2), 'la tarjeta de Ana pasa a mostrar la cocina, con sus otros dos looks: ' + nameOf(named(avatarRadios(), 'Ana')))
  // La cocina no tiene vista previa en disco: imagen y video del listado de HeyGen.
  const kitchenPreview = await waitFor(() => { const preview = previewIn(named(avatarRadios(), 'Ana')); return preview.image?.getAttribute('src') === remoteImage('look-ana-cocina') && preview.video ? preview : null }, 'la vista previa remota de la cocina en la tarjeta')
  check(kitchenPreview.video.getAttribute('src') === remoteVideo('look-ana-cocina'), 'un look sin vista previa en disco muestra la imagen y el video del listado de HeyGen: ' + kitchenPreview.video.getAttribute('src'))
  const kitchenChecked = (await openLooks()).map(isChecked)
  check(same(kitchenChecked, [false, false, true]), 'en la grilla queda marcado el look elegido, no el principal: ' + JSON.stringify(kitchenChecked))
  // Tocar el look ya elegido solo cierra (sin parche) y deja el foco en el botón.
  const patchesBeforeChosen = window.patches.length
  lookCard('Ana cocina').click()
  await waitFor(() => looks.getAttribute('aria-expanded') === 'false', 'tocar el elegido cierra la grilla')
  check(window.patches.length === patchesBeforeChosen && document.activeElement === looks, 'tocar el look ya elegido cierra la grilla sin cambiar nada y deja el foco en el botón')
  named(avatarRadios(), 'Ana').click()
  await delay(100)
  check(window.patches.length === patchesBeforeChosen && nameOf(named(avatarRadios(), 'Ana')) === 'Ana Ana cocina ' + moreLooks(2), 'volver a mirar al avatar elegido conserva el look que se eligió (sin parche nuevo)')

  // 4. Otro avatar: su look por defecto y su tarifa. Con la grilla abierta,
  // pasa a mostrar los looks de Teo.
  await openLooks()
  named(avatarRadios(), 'Teo').click()
  await waitFor(() => same(window.patches.at(-1), { avatar: TEO }), 'elegir a Teo')
  check(text().includes(i18n.t('create.avatar.cost', { amount: formatUsd(0.3, 'es') })), 'un gemelo digital cobra 0,60 por minuto: ≈ 0,30 US$')
  check(isChecked(named(avatarRadios(), 'Teo')) && nameOf(named(avatarRadios(), 'Teo')) === 'Teo Teo estudio' && nameOf(named(avatarRadios(), 'Ana')) === 'Ana Ana oficina ' + moreLooks(2), 'Teo marcado con su look; Ana vuelve a mostrar su look por defecto')
  await waitFor(() => same(lookRadios().map(nameOf), ['Teo estudio']) && isChecked(lookCard('Teo estudio')), 'la grilla abierta pasa a los looks de Teo, con el suyo elegido')
  check(looksButton().getAttribute('aria-label') === i18n.t('create.avatar.looksToggleAria', { name: 'Teo' }), 'el botón «Look» nombra a Teo')
  check(window.stockLooksCalls.filter((call) => call.groupId === 'group-teo-2').every((call) => call.ownership === 'public'), 'un avatar de stock se lista entre los públicos: ' + JSON.stringify(window.stockLooksCalls))
  looksButton().click()
  await waitFor(() => looksButton().getAttribute('aria-expanded') === 'false', 'cerrar la grilla de Teo')

  // 5. Un avatar sin look para el formato lo dice y lleva a «Crear escenario»;
  // su botón «Look» abre la grilla con todos sus looks, sin poder elegirlos, y
  // no pide nada a HeyGen hasta abrirla.
  named(avatarRadios(), 'Vic').click()
  await waitFor(() => same(window.patches.at(-1), { avatar: null }), 'mirar a Vic deja el formulario sin elección')
  check(isChecked(named(avatarRadios(), 'Vic')) && text().includes(i18n.t('create.avatar.noLookLandscape', { name: 'Vic' })), 'Vic marcado y con el motivo')
  check(looksButton()?.getAttribute('aria-expanded') === 'false' && looksButton().getAttribute('aria-label') === i18n.t('create.avatar.looksToggleAria', { name: 'Vic' }) && lookRadios().length === 0, 'Vic tiene su botón «Look», con la grilla cerrada')
  check(!text().includes(i18n.t('create.avatar.lookHint')), 'sin nada que elegir no va la ayuda del look')
  const noLookNotice = [...document.querySelectorAll('p')].find((element) => element.textContent === i18n.t('create.avatar.noLookLandscape', { name: 'Vic' }))
  check(noLookNotice && looksButton().compareDocumentPosition(noLookNotice) & Node.DOCUMENT_POSITION_FOLLOWING, 'el aviso con «Crear escenario» va debajo del botón «Look»')
  await delay(200)
  check(!window.stockLooksCalls.some((call) => call.groupId === 'group-vic-3'), 'un avatar sin look para el formato no pide vistas previas a HeyGen mientras su grilla está cerrada')
  const scenarioLink = [...document.querySelectorAll('a')].find((link) => link.getAttribute('href') === avatarScenarioPath('vic-3', '16:9'))
  check(scenarioLink?.textContent === i18n.t('create.avatar.createScenario'), 'lleva a «Crear escenario» de Vic en 16:9')
  check(text().includes(i18n.t('create.avatar.costPending')), 'sin look no hay costo que mostrar')
  const vicLooks = await openLooks()
  await waitFor(() => window.stockLooksCalls.some((call) => call.groupId === 'group-vic-3'), 'abierta la grilla, se pide el listado de Vic')
  check(same(vicLooks.map(nameOf), ['Vic']) && vicLooks.every((radio) => isBlocked(radio) && !isChecked(radio)) && descriptionOf(lookCard('Vic')).includes(i18n.t('create.avatar.otherFormat', { format: '9:16' })) && window.stockLooksCalls.filter((call) => call.groupId === 'group-vic-3').every((call) => call.ownership === 'private'), 'abierta, la grilla muestra el look de Vic atenuado con «Para videos 9:16» (propio: entre los privados)')
  looksButton().click()
  await waitFor(() => looksButton().getAttribute('aria-expanded') === 'false', 'cerrar la grilla de Vic')

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

  // 6b. Al montar Crear se pide, como mucho, el listado del avatar elegido.
  // Sol (de stock) tiene el principal vertical y un look horizontal sin vista
  // previa en disco: en 16:9 su tarjeta muestra la cara hasta que la persona
  // se detiene encima, y recién ahí pide su listado y muestra su look. Teo,
  // con su look en disco, lo muestra de entrada sin pedir nada.
  const SOL = avatar('sol-5', 'Sol', 'stock', 'look-sol', [look('look-sol', 'Sol retrato', 'studio_avatar', 'portrait'), look('look-sol-terraza', 'Sol terraza', 'studio_avatar', 'landscape', ['avatar_iii'], null)])
  mount({ avatars: [LIBRARY[0], LIBRARY[1], SOL], balance: USD, keys: ['heygen'], stockLooks: { ...STOCK_LOOKS, [SOL.groupId]: SOL.looks.map(stockLook) } }, { ...CREATE_FORM_INITIAL_VALUE, useAvatar: true, avatar: ANA })
  await waitFor(() => window.listCalls > 0 && avatarRadios().length === 3 && named(avatarRadios(), 'Sol'), 'Crear con Ana elegida, Teo y Sol')
  await delay(400)
  check(window.stockLooksCalls.length === 1 && window.stockLooksCalls[0].groupId === 'group-ana-1', 'al montar solo se pide el listado del avatar elegido: ' + JSON.stringify(window.stockLooksCalls))
  const sol = named(avatarRadios(), 'Sol')
  check(nameOf(sol) === 'Sol ' + i18n.t('create.avatar.lookCount', { count: 1 }) && previewIn(sol).image?.getAttribute('src') === diskImage('/library/sol-5.jpg'), 'sin intención, Sol muestra su cara de disco (su look horizontal no está en disco): ' + nameOf(sol))
  check(nameOf(named(avatarRadios(), 'Teo')) === 'Teo Teo estudio', 'Teo muestra su look de entrada: su vista previa está en disco y no hace falta pedir nada')
  hover(sol.parentElement, true)
  await waitFor(() => window.stockLooksCalls.some((call) => call.groupId === 'group-sol-5') && nameOf(named(avatarRadios(), 'Sol')) === 'Sol Sol terraza ' + moreLooks(1), 'con el mouse quieto encima, Sol pide su listado y muestra su look')
  await waitFor(() => previewIn(named(avatarRadios(), 'Sol')).image?.getAttribute('src') === remoteImage('look-sol-terraza'), 'la vista previa de Sol terraza sale del listado')
  check(window.stockLooksCalls.filter((call) => call.groupId === 'group-sol-5').every((call) => call.ownership === 'public') && window.value.avatar.id === 'ana-1', 'el listado de Sol, de stock, entre los públicos; detenerse encima no lo elige')
  hover(named(avatarRadios(), 'Sol').parentElement, false)
  // El teclado: el foco visible cuenta al instante, como el mouse quieto. Con
  // Tab desde «Administrar avatares», la tarjeta de Ana (la elegida) pasa su
  // video, y la de Teo además pide su listado (es la intención de mirarla).
  ;[...document.querySelectorAll('a')].find((link) => link.textContent === i18n.t('create.avatar.manageLibrary')).focus()
  await pressKey('Tab')
  check(document.activeElement === named(avatarRadios(), 'Ana'), 'Tab lleva el foco a la tarjeta de Ana')
  await waitFor(() => playedIn(named(avatarRadios(), 'Ana')), 'con el foco del teclado, la tarjeta de Ana pasa su video sin esperar')
  check(!window.stockLooksCalls.some((call) => call.groupId === 'group-teo-2'), 'Teo todavía no pidió su listado')
  await pressKey('Tab')
  check(document.activeElement === named(avatarRadios(), 'Teo'), 'Tab sigue a la tarjeta de Teo')
  await waitFor(() => window.stockLooksCalls.some((call) => call.groupId === 'group-teo-2') && playedIn(named(avatarRadios(), 'Teo')), 'con el foco del teclado, Teo pide su listado y pasa su video')
  // En la grilla el teclado llega a todas las fichas: a la que no se elige
  // (pasa su video, se oye su motivo y Enter no la elige) y a la que sí
  // (Enter la elige, cierra la grilla y deja el foco en el botón).
  await openLooks()
  looksButton().focus()
  await pressKey('Tab')
  check(document.activeElement === lookCard('Ana oficina'), 'Tab entra a la grilla por el principal')
  await waitFor(() => playedIn(lookCard('Ana oficina')), 'el foco del teclado pasa el video de la ficha')
  await pressKey('Tab')
  const verticalByKeyboard = lookCard('Ana vertical')
  check(document.activeElement === verticalByKeyboard && isBlocked(verticalByKeyboard) && descriptionOf(verticalByKeyboard).includes(i18n.t('create.avatar.otherFormat', { format: '9:16' })), 'el teclado llega a la ficha que no se elige, con su motivo')
  await waitFor(() => playedIn(verticalByKeyboard), 'la ficha que no se elige pasa su video con el foco del teclado')
  const patchesBeforeEnter = window.patches.length
  await pressKey('Enter')
  await delay(100)
  check(window.patches.length === patchesBeforeEnter && looksButton().getAttribute('aria-expanded') === 'true', 'Enter sobre una ficha que no se elige no la elige ni cierra la grilla')
  await pressKey('Tab')
  check(document.activeElement === lookCard('Ana cocina'), 'Tab sigue a la cocina')
  await pressKey('Enter')
  await waitFor(() => same(window.patches.at(-1), { avatar: ANA_KITCHEN }), 'Enter elige la cocina')
  check(looksButton().getAttribute('aria-expanded') === 'false' && document.activeElement === looksButton(), 'elegir con el teclado cierra la grilla y deja el foco en el botón «Look»')

  // 7. Biblioteca vacía.
  mount({ avatars: [], balance: USD, keys: ['heygen'] })
  await waitFor(() => !toggle().disabled && window.listCalls > 0, 'biblioteca vacía pedida')
  await delay()
  toggle().click()
  await waitFor(() => window.patches.length === 1, 'encender sin avatares')
  check(window.patches[0].avatar === null, 'sin avatares no hay elección')
  await waitFor(() => text().includes(i18n.t('create.avatar.emptyLibrary')), 'aviso de biblioteca vacía')
  check([...document.querySelectorAll('a[href="/avatars"]')].some((link) => link.textContent === i18n.t('create.avatar.createAvatar')), 'lleva a crear un avatar')

  // 8. Video 9:16: tarjetas verticales; una elección horizontal no vale y se
  // explica (la tarjeta muestra la cara de Ana y la grilla no marca nada), y
  // elegir el look vertical la arregla.
  mount({ avatars: LIBRARY, balance: USD, keys: ['heygen'] }, { ...CREATE_FORM_INITIAL_VALUE, videoFormat: '9:16', useAvatar: true, avatar: ANA })
  await waitFor(() => avatarRadios().length === 4 && looksButton(), 'la fila en 9:16 y el botón «Look» de Ana')
  check(AVATAR_LOOK_FRAME_CLASSES['9:16'] !== AVATAR_LOOK_FRAME_CLASSES['16:9'] && avatarRadios().every((radio) => previewIn(radio).box?.classList.contains(AVATAR_LOOK_FRAME_CLASSES['9:16'])), 'en 9:16 las tarjetas de la fila son verticales (' + AVATAR_LOOK_FRAME_CLASSES['9:16'] + ')')
  const anaPortrait = named(avatarRadios(), 'Ana')
  check(isChecked(anaPortrait) && nameOf(anaPortrait) === 'Ana ' + i18n.t('create.avatar.lookCount', { count: 1 }) && previewIn(anaPortrait).image?.getAttribute('src') === diskImage('/library/ana-1.jpg') && text().includes(i18n.t('create.avatar.previousUnavailable')), 'la elección horizontal no vale en 9:16: la tarjeta de Ana muestra su cara (no sugiere un look que no hay) y se dice por qué: ' + nameOf(anaPortrait))
  const portraitLooks = await openLooks()
  check(same(portraitLooks.map(nameOf), ['Ana oficina', 'Ana vertical', 'Ana cocina']) && portraitLooks.every((radio) => !isChecked(radio)), 'la grilla trae los tres looks y no marca ninguno: la elección no vale')
  check(isBlocked(lookCard('Ana oficina')) && descriptionOf(lookCard('Ana oficina')).includes(i18n.t('create.avatar.otherFormat', { format: '16:9' })) && !isBlocked(lookCard('Ana vertical')), 'en 9:16 los looks horizontales dicen «Para videos 16:9» y el vertical se elige')
  check(nameOf(named(avatarRadios(), 'Vic')) === 'Vic', 'en 9:16 Vic tiene look y su tarjeta lo muestra (se llama como él: el nombre no se repite): ' + nameOf(named(avatarRadios(), 'Vic')))
  lookCard('Ana vertical').click()
  await waitFor(() => same(window.patches.at(-1), { avatar: ANA_VERTICAL }), 'elegir el look vertical')
  check(!text().includes(i18n.t('create.avatar.previousUnavailable')) && nameOf(named(avatarRadios(), 'Ana')) === 'Ana Ana vertical ' + moreLooks(2), 'el look vertical arregla la elección y la tarjeta lo muestra: ' + nameOf(named(avatarRadios(), 'Ana')))
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
  await waitFor(() => window.refreshCalls > 0 && looksButton(), 'encendida, la tarjeta pregunta por el look en camino')
  await openLooks()
  await waitFor(() => lookCard('Ana nueva') && !isBlocked(lookCard('Ana nueva')), 'el look nuevo aparece listo para elegir al terminar')
  check(same(lookRadios().map(nameOf), ['Ana oficina', 'Ana vertical', 'Ana cocina', 'Ana nueva']) && isChecked(lookCard('Ana oficina')) && nameOf(named(avatarRadios(), 'Ana')) === 'Ana Ana oficina ' + moreLooks(3), 'el look nuevo se suma a los de Ana y la elección no cambia: ' + lookRadios().map(nameOf).join(', '))

  // 9c. Por qué no se elige cada look, con la regla que decide
  // (lookUnfitReason): generándose, fallido, sin Avatar III, cuadrado, y sin
  // orientación en la biblioteca. Este último dice «Sin orientación
  // confirmada» aunque el listado traiga medidas (verticales, u horizontales
  // como el video: el chip dice «16:9» y aun así no se elige) o la orientación
  // (el chip la usa), o nada (sin chip).
  const extraLooks = [
    { ...look('look-ana-generando', 'Ana generando', 'photo_avatar', 'landscape'), status: 'processing' },
    { ...look('look-ana-fallida', 'Ana fallida', 'photo_avatar', 'landscape'), status: 'failed' },
    look('look-ana-iv', 'Ana IV', 'photo_avatar', 'landscape', ['avatar_iv']),
    look('look-ana-cuadrada', 'Ana cuadrada', 'photo_avatar', 'square'),
    look('look-ana-medida', 'Ana medida', 'photo_avatar', undefined),
    look('look-ana-medida-ancha', 'Ana medida ancha', 'photo_avatar', undefined),
    look('look-ana-listada', 'Ana listada', 'photo_avatar', undefined),
    look('look-ana-sin-datos', 'Ana sin datos', 'photo_avatar', undefined),
  ]
  const anaExtra = { ...LIBRARY[0], looks: [...LIBRARY[0].looks, ...extraLooks] }
  const SIZES = { 'look-ana-medida': [1080, 1920], 'look-ana-medida-ancha': [1920, 1080] }
  const measured = (item) => {
    if (item.lookId === 'look-ana-listada') return { ...stockLook(item), preferredOrientation: 'portrait' }
    if (SIZES[item.lookId]) return { ...stockLook(item), imageWidth: SIZES[item.lookId][0], imageHeight: SIZES[item.lookId][1] }
    return stockLook(item)
  }
  mount({ avatars: [anaExtra], balance: USD, keys: ['heygen'], stockLooks: { 'group-ana-1': anaExtra.looks.map(measured) } }, { ...CREATE_FORM_INITIAL_VALUE, useAvatar: true, avatar: ANA })
  // El montaje es asíncrono: se espera a la Ana de este caso (once looks), no
  // al botón que dejó abierto el caso anterior.
  await waitFor(() => window.listCalls > 0 && nameOf(named(avatarRadios(), 'Ana')) === 'Ana Ana oficina ' + moreLooks(10), 'Ana con looks que no sirven')
  await openLooks()
  await waitFor(() => descriptionOf(lookCard('Ana medida')).includes(formatAria('9:16')) && descriptionOf(lookCard('Ana medida ancha')).includes(formatAria('16:9')), 'el formato de un look sin orientación sale de las medidas del listado')
  const reasons = Object.fromEntries(extraLooks.map((item) => [item.name, descriptionOf(lookCard(item.name))]))
  const unknownOrientation = i18n.t('create.avatar.unknownOrientation')
  check(extraLooks.every((item) => isBlocked(lookCard(item.name)) && !isChecked(lookCard(item.name))), 'ninguno de esos looks se puede elegir')
  check(reasons['Ana generando'].includes(i18n.t('avatars.detalle.lookGenerando')) && reasons['Ana fallida'].includes(i18n.t('avatars.detalle.lookFallido')) && reasons['Ana IV'].includes(i18n.t('avatars.tarjeta.noCompatible')), 'uno que se genera, uno que falló y uno sin Avatar III dicen por qué con los textos de la biblioteca: ' + JSON.stringify(reasons))
  check(reasons['Ana cuadrada'].includes(formatAria('1:1')) && reasons['Ana cuadrada'].includes(i18n.t('create.avatar.otherFormat', { format: '1:1' })), 'uno cuadrado dice que es para videos 1:1')
  check(reasons['Ana medida'].includes(unknownOrientation) && reasons['Ana medida ancha'] === formatAria('16:9') + ' | ' + unknownOrientation && reasons['Ana listada'] === formatAria('9:16') + ' | ' + unknownOrientation && reasons['Ana sin datos'] === unknownOrientation, 'sin orientación en la biblioteca dice «Sin orientación confirmada», con medidas verticales, con medidas como las del video (chip «16:9»), con la orientación del listado (chip «9:16») o sin datos (sin chip), y nunca «No compatible con Vimo»: ' + JSON.stringify([reasons['Ana medida'], reasons['Ana medida ancha'], reasons['Ana listada'], reasons['Ana sin datos']]))

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
  await waitFor(() => avatarRadios().length === 4 && looksButton() && nameOf(named(avatarRadios(), 'Ana')) === 'Ana Ana oficina ' + moreLooks(2), 'la tarjeta deshabilitada con su elección')
  const startRow = [...document.querySelectorAll('input[type=checkbox]')].find((input) => input.closest('label')?.textContent.includes(i18n.t('create.avatar.startWithAvatar')))
  check(toggle().disabled && avatarRadios().every((radio) => radio.disabled) && looksButton().disabled, 'deshabilitada: ni el interruptor, ni las tarjetas, ni el botón «Look» responden')
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
      url: 'about:blank',
    })
    const { sessionId } = await call('Target.attachToTarget', {
      targetId,
      flatten: true,
    })
    const send = (method, params = {}) => call(method, params, sessionId)
    await send('Page.enable')
    await send('Runtime.enable')
    // Antes de navegar: sin esto, el foco por código no dispara los eventos
    // de foco en Chrome headless y el camino del teclado no se puede probar
    // (ERRORES-CONOCIDOS: cdp-sin-emulacion-de-foco-element-focus-no-dispara-
    // los-eventos-focus).
    await send('Emulation.setFocusEmulationEnabled', { enabled: true })
    await send('Page.navigate', {
      url: pathToFileURL(join(root, 'index.html')).href,
    })
    const evaluate = async (expression) =>
      (await send('Runtime.evaluate', { expression, returnByValue: true }))
        .result?.value
    // Atiende las teclas que pide el caso hasta que la página termina.
    let status = null
    for (let attempt = 0; attempt < 2400 && !status; attempt++) {
      await new Promise((done) => setTimeout(done, 25))
      const keys = JSON.parse(
        (await evaluate(
          'JSON.stringify(window.keyQueue ? window.keyQueue.splice(0) : [])',
        )) ?? '[]',
      )
      for (const { id, key } of keys) {
        const { text, ...codes } = KEYS[key]
        await send('Input.dispatchKeyEvent', {
          type: 'keyDown',
          key,
          ...codes,
          ...(text ? { text, unmodifiedText: text } : {}),
        })
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key, ...codes })
        await evaluate('window.keysDone.add(' + id + ')')
      }
      const result = await evaluate(
        'document.getElementById("result")?.textContent',
      )
      if (result && result !== 'RUNNING') status = result
    }
    status ??=
      'FAIL: UI timeout: ' + (await evaluate('document.body.innerText'))
    assert.ok(status.startsWith('PASS:'), status)
    process.stdout.write(status + '\n')
  })
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 3 })
}
