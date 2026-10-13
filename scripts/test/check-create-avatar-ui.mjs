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
// abre y cierra la grilla con TODOS los looks del avatar (una lista que
// también lo nombra), el principal primero con «Principal», cada uno con su
// formato; los que no sirven para el video, con el motivo que da la regla
// (otro formato, no listos, sin ningún motor, orientación sin confirmar), se
// ven atenuados y pasan su video. Desde la entrega 2d tocar una ficha (clic,
// Enter o Espacio) NO la elige: abre el reproductor de la ruta Avatares con el
// look —su nombre y chips, su imagen, su video (que espera con un spinner
// mientras el listado de HeyGen no llega) y su acción—. Un look que sirve
// ofrece «Usar»: cambia `avatar.lookId`, cierra el reproductor y la grilla y
// deja el foco en el botón «Look» (el ya elegido no cambia nada). Uno que no
// sirve dice por qué, sin «Usar». Cerrar sin elegir (la X o Escape) no cambia
// nada y devuelve el foco a la ficha. La elegida lleva `aria-current` y dice
// «Elegido»; deshabilitada, ninguna ficha abre nada. La grilla es una `ul`
// con un `li` por look. El reproductor sigue a lo que se muestra: si cambia el
// avatar que se mira o se deshabilita el formulario con él abierto, se cierra
// (sin elegir nada) y no se reabre solo al volver; y un look que el listado de
// HeyGen no trae con video termina diciendo «sin video», no queda cargando. El
// pie de cada look que no sirve es una frase entera del catálogo y no la
// etiqueta de su ficha, y todo texto que el guard compara con el catálogo es
// una frase de verdad (una clave ausente se traduce como su ruta y la
// comparación pasaría en vacío). Un avatar sin look para el formato lo dice
// debajo de su botón «Look» (su grilla, sin nada que elegir y sin la ayuda del
// look, no pide nada a HeyGen hasta abrirse) y lleva a «Crear escenario» en ese
// formato, y ese enlace abre en la biblioteca el panel del avatar con el
// diálogo listo en el formato, una sola vez; el costo sale con la tarifa del
// motor del tipo del look; los controles van de 1 a 10 apariciones y de
// 5 a 60 segundos; muestra el saldo en una píldora que dice «Saldo» y el
// monto (en dólares, o tal cual si es otra moneda, o «no disponible») sin
// nombrar a HeyGen, y el aviso de moderación destacado (una nota con su título);
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
// dólares se redondean como la tarjeta. Desde la entrega 2e (§21.3), con un
// look elegido, el grupo «Motor» (un radiogroup propio, fuera de la grilla de
// looks) ofrece Avatar V, IV y III en ese orden, cada uno con su descripción y
// el costo de este video con su tarifa por minuto; el que el look no admite
// queda apagado y dice por qué; el marcado es el motor efectivo (el preferido
// si el look lo admite; si no, el de reemplazo, sin parchear nada), elegir uno
// manda solo `{ avatarEngine }` (también tocar el reemplazo marcado; el ya
// preferido no manda nada), cambiar de look no toca el motor, y las flechas,
// Inicio y Fin mueven el foco y la elección saltando los apagados (una sola
// parada de Tab) y frenan la tecla, salvo con Alt, Ctrl o Meta, que no mueven
// nada. El costo de cada opción sigue a las apariciones y los segundos y la
// tarjeta dice lo mismo que la marcada; la descripción y el costo de la
// marcada van en foreground al 80 % y una apagada atenúa su nombre y su
// descripción pero no su motivo (con el formulario deshabilitado se atenúa
// entera); una elección cuyo look perdió un motor deja de valer sin tocar el
// motor preferido. Con V o IV aparece «Movimiento más expresivo»,
// con su ayuda en un tooltip y la línea del movimiento automático; manda solo
// `{ avatarExpressive }`, con IV y un gemelo digital queda apagado y dice por
// qué, y con III no está. La tarjeta del costo nombra el motor efectivo, la
// nota de los tramos cobra con el motor del proyecto, un look solo-IV ya se
// puede usar y uno sin motores no. Y la pausa de escenas, con el store real de
// Crear y la pantalla de progreso de la biblioteca, cobra los tramos con el
// motor del proyecto: en vivo (el diálogo de cantidad y el paso de segundos)
// y rearmada desde el disco; sin motor, con el de Avatar III. Las tarifas de V
// con looks de foto salen de la tabla con la función (cambian en la 2e), nunca
// escritas acá. Desde la entrega 2f (§22): debajo de «Empieza con el avatar»,
// con la misma casilla, «3 veces en 2 minutos» (apagada por defecto, con el
// botón de ayuda y su tooltip fuera de la etiqueta; manda solo
// `{ avatarThreeInTwoMinutes }`; prendida y con menos de 3 apariciones dice
// que salen al menos 3, y con más del tope por aparición que las tres
// primeras duran hasta el tope; los avisos que se ven son la descripción de la
// casilla, `aria-describedby` en el orden en que se ven y sin ids de avisos
// que no están) y la tarjeta del costo, el total y el costo de cada motor
// cuentan lo que sale de verdad (3 × 10 s con una sola aparición; tres al tope
// + 2 × 60 s con cinco de 60 s). El tope es AVATAR_EARLY_MAX_SECONDS y se lee
// de la constante: lo fija el planificador y ya cambió (45, 40, 35 s), así que
// nada acá lo escribe como número. Y con Avatar V y un look de foto de un avatar
// propio sin gemelo digital, «Movimiento más expresivo» queda apagado con el
// motivo y sin la línea del movimiento automático (la elección que arma la
// biblioteca trae `motionReference`); con uno del stock, con un gemelo digital
// en su grupo, con un look de estudio, con IV o en un borrador sin el campo,
// no. Las teclas son de verdad (CDP, con la emulación de foco), así el foco
// del teclado queda «visible».
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
// Las teclas que el caso puede pedir. Enter y Espacio llevan su texto: sin él
// Chrome no activa el botón (ERRORES-CONOCIDOS: cdp-enter-sin-text-retorno-no-
// activa-el-boton). La tecla del Espacio se pide como ' ', su `key` en el DOM.
const KEYS = {
  Tab: { code: 'Tab', windowsVirtualKeyCode: 9 },
  Enter: { code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
  ' ': { code: 'Space', windowsVirtualKeyCode: 32, text: ' ' },
  Escape: { code: 'Escape', windowsVirtualKeyCode: 27 },
  // Las del grupo «Motor» (entrega 2e): flechas, Inicio y Fin.
  ArrowLeft: { code: 'ArrowLeft', windowsVirtualKeyCode: 37 },
  ArrowUp: { code: 'ArrowUp', windowsVirtualKeyCode: 38 },
  ArrowRight: { code: 'ArrowRight', windowsVirtualKeyCode: 39 },
  ArrowDown: { code: 'ArrowDown', windowsVirtualKeyCode: 40 },
  Home: { code: 'Home', windowsVirtualKeyCode: 36 },
  End: { code: 'End', windowsVirtualKeyCode: 35 },
}
const mocks = {
  // `refresh` es lo que el sondeo le pregunta a HeyGen por un avatar que
  // entrena o tiene un look en camino: la respuesta sale del fixture (si el
  // caso preparó `refreshed`, el sidecar «guarda» ese estado nuevo).
  // `listStockLooks` es el listado de HeyGen de los looks de un grupo, con sus
  // vistas previas remotas (`fixture.stockLooks` por `groupId`); un caso puede
  // dejarlo en espera con una promesa en `fixture.gates` (por `groupId`).
  '@/modules/avatars/api': [
    "import { avatarsApi as real } from './src/modules/avatars/api/index.ts'",
    'export const avatarsApi = { ...real, isNative: () => true, async list() { window.listCalls += 1; return structuredClone(window.fixture.avatars) }, async refresh(id) { window.refreshCalls += 1; if (window.fixture.refreshed?.[id]) window.fixture.avatars = window.fixture.avatars.map((item) => (item.id === id ? window.fixture.refreshed[id] : item)); return structuredClone(window.fixture.avatars.find((item) => item.id === id)) }, async balance() { window.balanceCalls += 1; return structuredClone(window.fixture.balance) }, async listStockLooks(payload) { window.stockLooksCalls.push(payload); await window.fixture.gates?.[payload.groupId]; return { looks: structuredClone(window.fixture.stockLooks?.[payload.groupId] ?? []), nextToken: null } }, async listStockGroups() { return { groups: [], nextToken: null } }, imageSource: (path) => window.diskImage(path) }',
  ].join('\n'),
  // useCostCheck solo le pregunta si corre en la app nativa. La pausa de
  // escenas (caso 17) corre el store real de Crear: el job simulado entrega
  // sus eventos por `window.emitPipelineEvent` y el estado de un proyecto en
  // disco sale de `window.projectStatuses`.
  '@/modules/videos/api': [
    "import { videosApi as real } from './src/modules/videos/api/index.ts'",
    'export const videosApi = { ...real, isNative: () => true, async projectStatus(projectId) { return window.projectStatuses[projectId] }, async listProjects() { return [] }, imageSource: (path) => "fixture-image://" + path, videoSource: (path) => "fixture-media://" + path, async startPipeline(payload, onEvent) { window.emitPipelineEvent = onEvent; return { jobId: "job-" + payload.projectId, stop() {} } }, async cancelJob() {}, async confirmScenes() {}, previewSceneCuts: () => new Promise(() => {}) }',
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
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import es from './public/locales/es.json'
import { avatarScenarioPath } from '@/modules/avatars/constants'
import { AvatarLibrary } from '@/modules/avatars/views/AvatarLibrary'
import { CheckboxRow } from '@/modules/common/components/CheckboxRow'
import { CreditsBadge } from '@/modules/common/components/CreditsBadge'
import { InsufficientCreditsAlert } from '@/modules/common/components/InsufficientCreditsAlert'
import { TooltipProvider } from '@/modules/common/ui/tooltip'
import { formatCompact } from '@/modules/common/utilities/formatCompact'
import { formatUsd } from '@/modules/common/utilities/formatUsd'
import { AVATAR_LOOK_FRAME_CLASSES, CREATE_FORM_INITIAL_VALUE } from '@/modules/videos/constants'
import { AvatarSpansNote } from '@/modules/videos/components/AvatarSpansNote'
import { CreateAvatarSection } from '@/modules/videos/components/CreateAvatarSection'
import { avatarCostEstimate, avatarRatePerMinute, avatarUsd } from '@/modules/videos/utilities/avatarCostEstimate'
import { queryClient } from '@/modules/common/queryClient'
import { useCostCheck } from '@/modules/videos/hooks/useCostCheck'
import { useCreateTask } from '@/modules/videos/hooks/useCreateTask'
import { useCreditsIssueLine } from '@/modules/videos/hooks/useCreditsIssueLine'
import { avatarRunOptions } from '@/modules/videos/utilities/avatarRunOptions'
import { LibraryProgress } from '@/modules/videos/views/LibraryProgress/LibraryProgress'
// Los límites salen de las constantes de la tarea 1 (valores abiertos con el
// dueño: si cambian, este guard no se toca).
import {
  AVATAR_DEFAULT_APPEARANCE_SECONDS,
  AVATAR_DEFAULT_APPEARANCES,
  AVATAR_EARLY_APPEARANCES,
  AVATAR_EARLY_MAX_SECONDS,
  AVATAR_MAX_APPEARANCE_SECONDS,
  AVATAR_MAX_APPEARANCES,
  AVATAR_MIN_APPEARANCE_SECONDS,
  AVATAR_MIN_APPEARANCES,
} from '@pipeline/types/avatar.ts'

let checks = 0
let renderError
// Los errores y advertencias de la consola (React avisa por ahí de un setState
// mal puesto durante el render, de una clave repetida...): los casos que ajustan
// estado durante el render afirman que no llegó ninguno.
window.consoleLog = []
for (const level of ['error', 'warn']) {
  const original = console[level].bind(console)
  console[level] = (...args) => { window.consoleLog.push(level + ': ' + args.map((arg) => String(arg)).join(' ').slice(0, 300)); original(...args) }
}
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
// La elección del formulario lleva los motores de su look (entrega 2e) y, desde
// la 2f, si Avatar V puede mover a su avatar con un prompt (motionReference,
// siempre la última clave): Ana es propia, de foto y sin gemelo digital, así
// que no; Teo es de stock, así que sí.
const ANA = { id: 'ana-1', name: 'Ana', lookId: 'look-ana', lookName: 'Ana oficina', lookType: 'photo_avatar', supportedEngines: ['avatar_iii', 'avatar_iv'], motionReference: false }
const ANA_KITCHEN = { ...ANA, lookId: 'look-ana-cocina', lookName: 'Ana cocina', supportedEngines: ['avatar_iii'] }
const ANA_VERTICAL = { ...ANA, lookId: 'look-ana-vertical', lookName: 'Ana vertical', supportedEngines: ['avatar_iii'] }
const TEO = { id: 'teo-2', name: 'Teo', lookId: 'look-teo', lookName: 'Teo estudio', lookType: 'digital_twin', supportedEngines: ['avatar_iii'], motionReference: true }
const USD = { available: true, remaining: 2.87, currency: 'usd' }
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)

let revision = 0
const reactRoot = createRoot(document.getElementById('root'), { onUncaughtError: (error) => { renderError = error } })
const freshClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
function Host({ initial, disabled }) {
  const [value, setValue] = React.useState(initial)
  const [off, setOff] = React.useState(disabled)
  window.value = value
  window.setDisabled = setOff
  return <CreateAvatarSection value={value} disabled={off} onChange={(patch) => { window.patches.push(patch); setValue((current) => ({ ...current, ...patch })) }} />
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
// región que controla y las fichas de la grilla. Desde la entrega 2d la grilla
// es una lista de botones que abren el reproductor del look (ya no un
// radiogroup): cada ficha se llama «Ver el look X» y la elegida lleva
// aria-current.
const looksButton = () => [...document.querySelectorAll('button[aria-expanded]')].find((button) => button.textContent === i18n.t('create.avatar.lookLabel')) ?? null
const looksRegion = () => document.getElementById(looksButton()?.getAttribute('aria-controls') ?? '')
const looksGroup = () => looksRegion()?.querySelector('ul') ?? null
const lookCards = () => [...(looksGroup()?.querySelectorAll('button') ?? [])]
const lookOpenAria = (name) => i18n.t('create.avatar.lookOpenAria', { name })
const lookCard = (name) => lookCards().find((card) => card.getAttribute('aria-label') === lookOpenAria(name))
// El nombre del look de una ficha: su nombre accesible sin el «Ver el look ».
const [lookAriaStart, lookAriaEnd] = lookOpenAria('\u0000').split('\u0000')
const lookNameOf = (card) => card.getAttribute('aria-label').slice(lookAriaStart.length, card.getAttribute('aria-label').length - lookAriaEnd.length)
const isChosen = (card) => card?.getAttribute('aria-current') === 'true'
// El reproductor de un look (un diálogo de Radix, en un portal) y sus partes.
const playerDialog = () => document.querySelector('[role=dialog]')
const playerTitle = () => playerDialog()?.querySelector('h2')?.textContent ?? null
// El escenario del reproductor: el grupo que nombra al look. Se busca por su
// nombre porque desde la entrega 2e los chips de los motores también son un
// grupo, y van antes.
const playerStage = (name) => playerDialog()?.querySelector('[role=group][aria-label="' + i18n.t('avatars.stock.previewAria', { name }) + '"]') ?? null
const playerVideo = () => playerDialog()?.querySelector('video') ?? null
const playerImages = () => [...(playerDialog()?.querySelectorAll('img') ?? [])].map((image) => image.getAttribute('src'))
const playerUse = () => [...(playerDialog()?.querySelectorAll('button') ?? [])].find((button) => button.textContent.trim() === i18n.t('avatars.reproductor.usar')) ?? null
const playerClose = () => playerDialog()?.querySelector('button[aria-label="' + i18n.t('avatars.reproductor.cerrar') + '"]') ?? null
// Todo lo que dice el reproductor (lo visible y lo oculto de sus chips) y, aparte,
// si dice una frase entera (un párrafo con ese texto exacto: el pie).
const playerText = () => playerDialog()?.textContent ?? ''
const playerSays = (sentence) => [...(playerDialog()?.querySelectorAll('p') ?? [])].some((paragraph) => paragraph.textContent === sentence)
// Una frase del catálogo: la clave existe, no sale como su ruta cruda y no deja
// variables sin resolver. Comparar un texto con i18n.t(clave) sin esto pasa en
// vacío si la clave no existe: i18next la traduce como su ruta y el componente y
// el guard reciben lo mismo (ERRORES-CONOCIDOS: test-que-compara-el-texto-con-
// i18n-t-de-la-misma-clave-pasa-en-vacio-si-la-clave-no-existe).
// Con «vars», la frase con sus variables resueltas.
function phrase(key, vars) {
  const sentence = i18n.t(key, vars)
  check(i18n.exists(key) && sentence !== key && !sentence.includes('{{'), 'la clave ' + key + ' es una frase del catálogo, no su ruta cruda ni una variable sin resolver: ' + sentence)
  return sentence
}
// La píldora del saldo (el contenedor de su botón de refrescar) y si nombra al
// proveedor en su texto o en sus etiquetas. El guard de textos de los catálogos
// no la ve: su etiqueta salía del código y no de una clave.
const balancePill = () => document.querySelector('button[aria-label="' + i18n.t('avatars.saldo.refrescar') + '"]')?.parentElement ?? null
const namesProvider = (element) => /hey[\s-]*gen/i.test(element?.outerHTML ?? '')
// ¿Reprodujo su video esta tarjeta o ficha?
const playedIn = (element) => window.playedVideos.some((video) => element?.contains(video))
// Teclas de verdad (CDP, desde Node, con la emulación de foco: solo una tecla
// de verdad deja el foco «visible»): el caso las pide y espera. «modifiers» es
// el de CDP (Alt = 1, Ctrl = 2, Meta = 4, Shift = 8).
let nextKey = 0
window.keyQueue = []
window.keysDone = new Set()
function pressKey(key, modifiers = 0) {
  const id = ++nextKey
  window.keyQueue.push({ id, key, modifiers })
  return waitFor(() => window.keysDone.has(id), 'la tecla ' + key)
}
// El último keydown que llegó a la ventana, ya pasado por React (su raíz
// escucha antes): si alguien le hizo preventDefault (una flecha que movió el
// motor no deja además desplazar la página).
window.addEventListener('keydown', (event) => { window.lastKeydown = { key: event.key, prevented: event.defaultPrevented } })
async function openLooks() {
  if (looksButton().getAttribute('aria-expanded') !== 'true') looksButton().click()
  return waitFor(() => (lookCards().length > 0 ? lookCards() : null), 'la grilla de looks se abre')
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
// El diálogo abierto que dice un título y un botón suyo por su texto: el panel de
// un avatar y «Crear escenario» están abiertos a la vez y otros botones de la
// página se llaman igual («Cancelar» del borrado de un avatar), así que un
// botón buscado solo por su texto puede ser el de otro.
const dialogSaying = (title) => [...document.querySelectorAll('[role=dialog]')].find((dialog) => dialog.textContent.includes(title))
const buttonIn = (root, label) => [...(root?.querySelectorAll('button') ?? [])].find((button) => button.textContent.trim() === label)
const setRange = (id, value) => {
  const input = document.getElementById(id)
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(value))
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
// El grupo «Motor» (entrega 2e): un radiogroup propio; cada opción se llama
// como su motor y su descripción (aria-describedby) es la del dueño y el
// costo, o el motivo si no se puede elegir. El interruptor «Movimiento más
// expresivo», su ayuda y la tarjeta del costo.
const engineGroup = () => document.querySelector('[role=radiogroup][aria-label="' + i18n.t('create.avatar.engineGroupAria') + '"]')
const engineRadios = () => [...(engineGroup()?.querySelectorAll('[role=radio]') ?? [])]
const engineRadio = (engine) => engineRadios().find((radio) => nameOf(radio) === i18n.t('avatars.engines.' + engine)) ?? null
const expressiveSwitch = () => document.getElementById('create-avatar-expressive')
const expressiveHelp = () => document.querySelector('button[aria-label="' + i18n.t('create.avatar.expressiveHelpAria') + '"]')
const costCard = () => [...document.querySelectorAll('[role=note]')].find((element) => element.getAttribute('aria-label') === i18n.t('create.avatar.costTitle')) ?? null
// Las casillas de la tarjeta (entrega 2f): se buscan por el texto exacto de su
// etiqueta; el botón de ayuda de «3 veces en 2 minutos»; y si un párrafo de la
// página dice exactamente una frase (los avisos de la casilla son párrafos).
const checkboxNamed = (label) => [...document.querySelectorAll('input[type=checkbox]')].find((input) => input.closest('label')?.textContent === label) ?? null
const startBox = () => checkboxNamed(i18n.t('create.avatar.startWithAvatar'))
const threeBox = () => checkboxNamed(i18n.t('create.avatar.threeInTwo'))
const threeHelp = () => document.querySelector('button[aria-label="' + i18n.t('create.avatar.threeInTwoHelpAria') + '"]')
const paragraphNamed = (sentence) => [...document.querySelectorAll('p')].find((paragraph) => paragraph.textContent === sentence) ?? null
const paragraphSays = (sentence) => paragraphNamed(sentence) !== null
const follows = (first, second) => Boolean(first && second && (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING))
const usdSays = (amount) => i18n.t('create.avatar.cost', { amount: formatUsd(amount, 'es') })
const perMinuteSays = (rate) => i18n.t('create.avatar.pricePerMinute', { price: formatUsd(rate, 'es') })
// Las partes de una opción del motor: su nombre (aria-labelledby) y su
// descripción y su costo o motivo (aria-describedby, en ese orden); y si algo
// entre un elemento y el grupo lo atenúa (una clase opacity-*). El guard corre
// sin el CSS de la app: el contraste se ata por las clases que lo deciden.
const engineNamePart = (radio) => document.getElementById(radio?.getAttribute('aria-labelledby') ?? '')
const engineDescribedParts = (radio) => (radio?.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean).map((id) => document.getElementById(id))
function dimmedWithin(element) {
  for (let node = element; node && node !== engineGroup(); node = node.parentElement) {
    if ([...node.classList].some((name) => name.startsWith('opacity-'))) return true
  }
  return false
}
try {
  // 0. Los textos que este guard compara con el catálogo son frases de verdad.
  const says = {
    use: phrase('avatars.reproductor.usarHint'),
    otherFormat: phrase('create.avatar.otherFormatHint'),
    loading: phrase('avatars.reproductor.cargando'),
    noVideo: phrase('avatars.reproductor.sinVideo'),
  }
  for (const key of ['avatars.reproductor.usar', 'avatars.reproductor.cerrar', 'avatars.saldo.etiqueta', 'avatars.saldo.refrescar', 'avatars.saldo.noDisponible', 'create.avatar.selectedLook']) phrase(key)

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
  const pill = balancePill()
  check(pill?.textContent.includes(i18n.t('avatars.saldo.etiqueta')) && pill.textContent.includes(formatUsd(2.87, 'es')) && !namesProvider(pill), 'la píldora del saldo dice «Saldo» y el monto, y no nombra a HeyGen ni en su texto ni en sus etiquetas: ' + pill?.textContent)
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
  check(looks.getAttribute('aria-label') === i18n.t('create.avatar.looksToggleAria', { name: 'Ana' }) && looks.getAttribute('aria-expanded') === 'false' && looksRegion()?.hidden === true && lookCards().length === 0, 'el botón «Look» nombra al avatar y arranca cerrado, con su grilla escondida')
  const anaLooks = await openLooks()
  check(looks.getAttribute('aria-expanded') === 'true' && looksRegion().hidden === false, 'el botón abre la grilla (aria-expanded y la región a la vista)')
  check(looksGroup().getAttribute('aria-label') === i18n.t('create.avatar.looksToggleAria', { name: 'Ana' }), 'la grilla dice de quién son los looks: ' + looksGroup().getAttribute('aria-label'))
  check(same(anaLooks.map(lookNameOf), ['Ana oficina', 'Ana vertical', 'Ana cocina']), 'la grilla trae todos los looks de Ana, el principal primero: ' + anaLooks.map(lookNameOf).join(', '))
  // Tocar una ficha no elige: abre un diálogo. Por eso son botones con su
  // nombre «Ver el look X» y la grilla ya no es un grupo de radios.
  check(anaLooks.every((card) => card.getAttribute('aria-haspopup') === 'dialog' && !card.hasAttribute('aria-checked') && card.getAttribute('aria-disabled') !== 'true') && !looksRegion().querySelector('[role=radio], [role=radiogroup]'), 'cada ficha es un botón que abre el reproductor (aria-haspopup), no un radio, y ninguna está deshabilitada: hasta la que no sirve se abre')
  // La lista que oye un lector de pantalla («lista de 3 elementos»): una ul
  // con un li por look y el botón de la ficha adentro de su li.
  check(looksGroup().tagName === 'UL' && looksGroup().children.length === anaLooks.length && [...looksGroup().children].every((item) => item.tagName === 'LI') && anaLooks.every((card) => card.parentElement?.tagName === 'LI' && card.parentElement.parentElement === looksGroup()), 'la grilla es una ul con un li por look y el botón de cada ficha adentro de su li')
  check(descriptionOf(lookCard('Ana oficina')).includes(formatAria('16:9')) && descriptionOf(lookCard('Ana vertical')).includes(formatAria('9:16')) && descriptionOf(lookCard('Ana cocina')).includes(formatAria('16:9')), 'cada ficha dice el formato de su look: ' + anaLooks.map(descriptionOf).join(' / '))
  check(isChosen(lookCard('Ana oficina')) && !isChosen(lookCard('Ana vertical')) && !isChosen(lookCard('Ana cocina')) && descriptionOf(lookCard('Ana oficina')).includes(i18n.t('create.avatar.mainLook')) && !descriptionOf(lookCard('Ana cocina')).includes(i18n.t('create.avatar.mainLook')), 'el principal va elegido por defecto (aria-current) y es el único que dice «Principal»')
  check(anaLooks.filter((card) => descriptionOf(card).includes(i18n.t('create.avatar.selectedLook'))).map(lookNameOf).join() === 'Ana oficina', 'la elegida, y solo ella, dice «Elegido»')
  const vertical = lookCard('Ana vertical')
  check(descriptionOf(vertical).includes(i18n.t('create.avatar.otherFormat', { format: '9:16' })), 'el look vertical no sirve en un video 16:9 y su ficha dice para qué videos es: ' + descriptionOf(vertical))
  check(descriptionOf(lookCard('Ana cocina')).includes(i18n.t('avatars.types.photo_avatar')) && !descriptionOf(lookCard('Ana cocina')).includes(i18n.t('create.avatar.otherFormat', { format: '16:9' })), 'la cocina sirve y su ficha dice su tipo')
  // Las vistas previas de la grilla: la de disco si la hay; si no, la del listado.
  const kitchenInGrid = await waitFor(() => (previewIn(lookCard('Ana cocina')).image ? previewIn(lookCard('Ana cocina')) : null), 'la vista previa de la cocina en la grilla')
  check(previewIn(lookCard('Ana oficina')).image?.getAttribute('src') === diskImage('/library/looks/look-ana.png') && kitchenInGrid.image.getAttribute('src') === remoteImage('look-ana-cocina'), 'la grilla usa la vista previa de disco y, sin ella, la del listado de HeyGen')
  // Una ficha que no sirve igual pasa su video con el mouse quieto encima
  // (recién entrado, todavía no).
  hover(vertical.parentElement, true)
  await delay(100)
  check(playsOf(remoteVideo('look-ana-vertical')) === 0, 'recién entrado el mouse en una ficha, su video todavía no pasa')
  await waitFor(() => playsOf(remoteVideo('look-ana-vertical')) === 1, 'la ficha del look vertical pasa su video con el mouse quieto encima')
  hover(vertical.parentElement, false)

  // 3b. Tocar una ficha abre el reproductor del look, no lo elige. Primero el
  // principal, que ya es el elegido y trae su imagen de disco.
  const patchesBeforePlayers = window.patches.length
  lookCard('Ana oficina').click()
  await waitFor(() => playerTitle() === 'Ana oficina', 'tocar la ficha del principal abre su reproductor')
  check(playerStage('Ana oficina') && playerVideo()?.getAttribute('src') === remoteVideo('look-ana') && playerImages().includes(diskImage('/library/looks/look-ana.png')), 'el reproductor es el del look tocado: su nombre, su video del listado de HeyGen y su imagen de disco')
  check(playerText().includes(i18n.t('avatars.types.photo_avatar')) && playerText().includes(formatAria('16:9')) && playerText().includes(i18n.t('avatars.engines.avatar_iii')), 'con los chips del look: tipo, formato y motor')
  check(playerUse() && playerSays(says.use), 'un look que sirve abre con «Usar» y dice para qué')
  playerClose().click()
  await waitFor(() => !playerDialog() && document.activeElement === lookCard('Ana oficina'), 'cerrar sin elegir devuelve el foco a la ficha que abrió el reproductor')
  // El vertical no sirve en un video 16:9: abre igual, con su look y su
  // motivo, sin «Usar».
  vertical.click()
  await waitFor(() => playerTitle() === 'Ana vertical', 'tocar la ficha del look vertical abre su reproductor')
  check(playerStage('Ana vertical') && playerVideo()?.getAttribute('src') === remoteVideo('look-ana-vertical') && playerImages().includes(diskImage('/library/looks/look-ana-vertical.png')), 'el reproductor del vertical trae su video y su imagen')
  check(playerText().includes(formatAria('9:16')), 'sus chips dicen que es 9:16')
  check(!playerUse() && playerSays(says.otherFormat), 'un look de otro formato no ofrece «Usar» y dice por qué')
  check(window.patches.length === patchesBeforePlayers && looks.getAttribute('aria-expanded') === 'true' && window.value.avatar.lookId === 'look-ana', 'tocar una ficha, sirva o no, no elige nada ni cierra la grilla')
  playerClose().click()
  await waitFor(() => !playerDialog() && document.activeElement === vertical, 'cerrar el reproductor del vertical devuelve el foco a su ficha')
  check(window.patches.length === patchesBeforePlayers && looks.getAttribute('aria-expanded') === 'true' && !isChosen(vertical) && isChosen(lookCard('Ana oficina')), 'cerrar sin elegir no cambia nada: la grilla sigue abierta y el elegido sigue siendo el principal')
  looks.click()
  await waitFor(() => looks.getAttribute('aria-expanded') === 'false', 'el botón cierra la grilla')
  check(looksRegion().hidden === true && lookCards().length === 0, 'cerrada, la grilla se esconde')

  // 3c. «Usar» elige la cocina: la pasa al formulario, cierra el reproductor
  // y la grilla y deja el foco en el botón; la tarjeta de arriba muestra la
  // cocina.
  await openLooks()
  lookCard('Ana cocina').click()
  await waitFor(() => playerTitle() === 'Ana cocina', 'tocar la ficha de la cocina abre su reproductor')
  await delay(100)
  check(window.patches.length === patchesBeforePlayers && window.value.avatar.lookId === 'look-ana', 'el clic no la elige todavía')
  // La cocina no tiene vista previa en disco: imagen y video del listado de HeyGen.
  check(playerVideo()?.getAttribute('src') === remoteVideo('look-ana-cocina') && playerImages().includes(remoteImage('look-ana-cocina')), 'un look sin vista previa en disco abre con la imagen y el video del listado de HeyGen')
  check(playerUse() && playerSays(says.use) && !playerSays(says.otherFormat), 'la cocina sirve: ofrece «Usar»')
  playerUse().click()
  await waitFor(() => same(window.patches.at(-1), { avatar: ANA_KITCHEN }), 'elegir el look de la cocina con «Usar»')
  await waitFor(() => !playerDialog() && looks.getAttribute('aria-expanded') === 'false' && looksRegion().hidden === true && document.activeElement === looks, '«Usar» cierra el reproductor y la grilla y deja el foco en el botón «Look»')
  check(window.value.avatar.lookId === 'look-ana-cocina', '«Usar» cambia avatar.lookId')
  check(nameOf(named(avatarRadios(), 'Ana')) === 'Ana Ana cocina ' + moreLooks(2), 'la tarjeta de Ana pasa a mostrar la cocina, con sus otros dos looks: ' + nameOf(named(avatarRadios(), 'Ana')))
  const kitchenPreview = await waitFor(() => { const preview = previewIn(named(avatarRadios(), 'Ana')); return preview.image?.getAttribute('src') === remoteImage('look-ana-cocina') && preview.video ? preview : null }, 'la vista previa remota de la cocina en la tarjeta')
  check(kitchenPreview.video.getAttribute('src') === remoteVideo('look-ana-cocina'), 'un look sin vista previa en disco muestra la imagen y el video del listado de HeyGen: ' + kitchenPreview.video.getAttribute('src'))
  const kitchenChecked = (await openLooks()).map(isChosen)
  check(same(kitchenChecked, [false, false, true]), 'en la grilla queda marcado el look elegido, no el principal: ' + JSON.stringify(kitchenChecked))
  // El look ya elegido abre igual con «Usar»; usarlo no cambia nada (sin
  // parche) y cierra todo, con el foco en el botón.
  const patchesBeforeChosen = window.patches.length
  lookCard('Ana cocina').click()
  await waitFor(() => playerTitle() === 'Ana cocina' && playerUse(), 'el look ya elegido también abre su reproductor, con «Usar»')
  playerUse().click()
  await waitFor(() => !playerDialog() && looks.getAttribute('aria-expanded') === 'false' && document.activeElement === looks, '«Usar» en el look ya elegido cierra el reproductor y la grilla y deja el foco en el botón')
  check(window.patches.length === patchesBeforeChosen, 'usar el look ya elegido no cambia nada (sin parche)')
  named(avatarRadios(), 'Ana').click()
  await delay(100)
  check(window.patches.length === patchesBeforeChosen && nameOf(named(avatarRadios(), 'Ana')) === 'Ana Ana cocina ' + moreLooks(2), 'volver a mirar al avatar elegido conserva el look que se eligió (sin parche nuevo)')

  // 3d. Lo que cambia afuera con el reproductor abierto. El reproductor tapa la
  // fila de avatares, pero un clic por código la alcanza: si el avatar que se
  // mira cambia, el reproductor se cierra sin elegir nada y no se reabre solo
  // cuando vuelve el avatar, aunque la grilla siga abierta.
  const patchesBeforeOutside = window.patches.length
  const consoleBeforeOutside = window.consoleLog.length
  await openLooks()
  lookCard('Ana oficina').click()
  await waitFor(() => playerTitle() === 'Ana oficina', 'abrir el reproductor del principal de Ana')
  named(avatarRadios(), 'Teo').click()
  await waitFor(() => !playerDialog() && same(lookCards().map(lookNameOf), ['Teo estudio']), 'al cambiar el avatar que se mira el reproductor se cierra y la grilla pasa a los looks de Teo')
  check(document.body.style.pointerEvents !== 'none', 'cerrado desde afuera, el documento no queda bloqueado')
  named(avatarRadios(), 'Ana').click()
  await waitFor(() => same(lookCards().map(lookNameOf), ['Ana oficina', 'Ana vertical', 'Ana cocina']), 'vuelven los looks de Ana en la grilla abierta')
  await delay(200)
  check(!playerDialog() && looksButton().getAttribute('aria-expanded') === 'true', 'al volver el avatar el reproductor no se reabre solo, y la grilla sigue abierta')
  check(window.patches.slice(patchesBeforeOutside).every((patch) => same(patch, { avatar: TEO }) || same(patch, { avatar: ANA })), 'nada de lo que cambió afuera eligió un look: solo los dos avatares que se miraron, con su look por defecto')
  check(window.consoleLog.length === consoleBeforeOutside, 'cerrar el reproductor ajustando el estado durante el render no deja errores ni advertencias en la consola: ' + JSON.stringify(window.consoleLog.slice(consoleBeforeOutside)))

  // 4. Otro avatar: su look por defecto y su tarifa. Con la grilla abierta,
  // pasa a mostrar los looks de Teo.
  await openLooks()
  named(avatarRadios(), 'Teo').click()
  await waitFor(() => same(window.patches.at(-1), { avatar: TEO }), 'elegir a Teo')
  check(text().includes(i18n.t('create.avatar.cost', { amount: formatUsd(0.3, 'es') })), 'un gemelo digital cobra 0,60 por minuto: ≈ 0,30 US$')
  check(isChecked(named(avatarRadios(), 'Teo')) && nameOf(named(avatarRadios(), 'Teo')) === 'Teo Teo estudio' && nameOf(named(avatarRadios(), 'Ana')) === 'Ana Ana oficina ' + moreLooks(2), 'Teo marcado con su look; Ana vuelve a mostrar su look por defecto')
  await waitFor(() => same(lookCards().map(lookNameOf), ['Teo estudio']) && isChosen(lookCard('Teo estudio')), 'la grilla abierta pasa a los looks de Teo, con el suyo elegido')
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
  check(looksButton()?.getAttribute('aria-expanded') === 'false' && looksButton().getAttribute('aria-label') === i18n.t('create.avatar.looksToggleAria', { name: 'Vic' }) && lookCards().length === 0, 'Vic tiene su botón «Look», con la grilla cerrada')
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
  check(same(vicLooks.map(lookNameOf), ['Vic']) && vicLooks.every((card) => !isChosen(card)) && descriptionOf(lookCard('Vic')).includes(i18n.t('create.avatar.otherFormat', { format: '9:16' })) && window.stockLooksCalls.filter((call) => call.groupId === 'group-vic-3').every((call) => call.ownership === 'private'), 'abierta, la grilla muestra el look de Vic atenuado con «Para videos 9:16» (propio: entre los privados)')
  // Su único look se abre igual, pero no hay nada que elegir: sin «Usar» y con el motivo.
  lookCard('Vic').click()
  await waitFor(() => playerTitle() === 'Vic', 'tocar el look de Vic abre su reproductor')
  check(!playerUse() && playerSays(says.otherFormat) && playerVideo()?.getAttribute('src') === remoteVideo('look-vic'), 'el reproductor del look de Vic no ofrece «Usar» y dice por qué')
  playerClose().click()
  await waitFor(() => !playerDialog() && document.activeElement === lookCard('Vic'), 'cerrar el reproductor de Vic devuelve el foco a su ficha')
  check(same(window.patches.at(-1), { avatar: null }), 'mirar el look de Vic no eligió nada')
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
  // En la grilla el teclado llega a todas las fichas, sirvan o no, y Enter o
  // Espacio abren su reproductor: el del look que no sirve dice por qué, sin
  // «Usar», y Escape lo cierra y devuelve el foco a la ficha; el del que sirve
  // ofrece «Usar», que con Enter lo elige, cierra el reproductor y la grilla y
  // deja el foco en el botón «Look».
  await openLooks()
  looksButton().focus()
  await pressKey('Tab')
  check(document.activeElement === lookCard('Ana oficina'), 'Tab entra a la grilla por el principal')
  await waitFor(() => playedIn(lookCard('Ana oficina')), 'el foco del teclado pasa el video de la ficha')
  await pressKey('Tab')
  const verticalByKeyboard = lookCard('Ana vertical')
  check(document.activeElement === verticalByKeyboard && descriptionOf(verticalByKeyboard).includes(i18n.t('create.avatar.otherFormat', { format: '9:16' })), 'el teclado llega a la ficha que no sirve, con su motivo')
  await waitFor(() => playedIn(verticalByKeyboard), 'la ficha que no sirve pasa su video con el foco del teclado')
  const patchesBeforeEnter = window.patches.length
  await pressKey('Enter')
  await waitFor(() => playerTitle() === 'Ana vertical', 'Enter sobre la ficha del vertical abre su reproductor')
  check(!playerUse() && playerSays(says.otherFormat) && playerVideo()?.getAttribute('src') === remoteVideo('look-ana-vertical'), 'Enter abre el reproductor del vertical, con su video, sin «Usar» y con el motivo')
  await pressKey('Escape')
  await waitFor(() => !playerDialog() && document.activeElement === verticalByKeyboard, 'Escape cierra el reproductor y el foco vuelve a la ficha')
  check(window.patches.length === patchesBeforeEnter && looksButton().getAttribute('aria-expanded') === 'true', 'Enter sobre una ficha que no sirve no la elige ni cierra la grilla')
  await pressKey('Tab')
  check(document.activeElement === lookCard('Ana cocina'), 'Tab sigue a la cocina')
  await pressKey(' ')
  await waitFor(() => playerTitle() === 'Ana cocina', 'Espacio sobre la ficha de la cocina abre su reproductor')
  check(playerUse() && playerVideo()?.getAttribute('src') === remoteVideo('look-ana-cocina') && window.patches.length === patchesBeforeEnter, 'Espacio abre el reproductor de la cocina, con su video y «Usar», sin elegirla')
  playerUse().focus()
  await pressKey('Enter')
  await waitFor(() => same(window.patches.at(-1), { avatar: ANA_KITCHEN }), 'Enter sobre «Usar» elige la cocina')
  await waitFor(() => !playerDialog() && looksButton().getAttribute('aria-expanded') === 'false' && document.activeElement === looksButton(), 'elegir con el teclado cierra el reproductor y la grilla y deja el foco en el botón «Look»')

  // 6c. El video todavía se busca: el reproductor espera con un spinner en vez
  // de decir «sin video», ya ofrece «Usar», y muestra el video cuando llega el
  // listado de HeyGen.
  let releaseAnaLooks
  const anaLooksGate = new Promise((done) => { releaseAnaLooks = done })
  mount({ avatars: [LIBRARY[0]], balance: USD, keys: ['heygen'], gates: { 'group-ana-1': anaLooksGate } }, { ...CREATE_FORM_INITIAL_VALUE, useAvatar: true, avatar: ANA })
  await waitFor(() => window.stockLooksCalls.some((call) => call.groupId === 'group-ana-1') && looksButton() && nameOf(named(avatarRadios(), 'Ana')) === 'Ana Ana oficina ' + moreLooks(2), 'Crear con el listado de Ana en espera')
  await openLooks()
  lookCard('Ana cocina').click()
  await waitFor(() => playerTitle() === 'Ana cocina', 'tocar la cocina abre su reproductor con el listado en espera')
  check(!playerVideo() && playerText().includes(says.loading) && !playerText().includes(says.noVideo), 'mientras se busca el video el reproductor espera con un spinner, no dice «sin video»')
  check(playerUse(), 'y ya ofrece «Usar»')
  releaseAnaLooks()
  await waitFor(() => playerVideo()?.getAttribute('src') === remoteVideo('look-ana-cocina'), 'llega el listado y el reproductor trae el video de la cocina')
  check(playerImages().includes(remoteImage('look-ana-cocina')) && !playerText().includes(says.loading), 'con su imagen del listado y sin el spinner')
  playerClose().click()
  await waitFor(() => !playerDialog(), 'cerrar el reproductor de la cocina')

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
  check(same(portraitLooks.map(lookNameOf), ['Ana oficina', 'Ana vertical', 'Ana cocina']) && portraitLooks.every((card) => !isChosen(card)) && !text().includes(i18n.t('create.avatar.selectedLook')), 'la grilla trae los tres looks y no marca ninguno: la elección no vale')
  check(descriptionOf(lookCard('Ana oficina')).includes(i18n.t('create.avatar.otherFormat', { format: '16:9' })) && !descriptionOf(lookCard('Ana vertical')).includes(i18n.t('create.avatar.otherFormat', { format: '9:16' })), 'en 9:16 los looks horizontales dicen «Para videos 16:9» y el vertical sirve')
  lookCard('Ana oficina').click()
  await waitFor(() => playerTitle() === 'Ana oficina', 'tocar un look horizontal en un video 9:16 abre su reproductor')
  check(!playerUse() && playerSays(says.otherFormat), 'el horizontal no ofrece «Usar» en un video 9:16')
  playerClose().click()
  await waitFor(() => !playerDialog(), 'cerrar el reproductor del horizontal')
  check(nameOf(named(avatarRadios(), 'Vic')) === 'Vic', 'en 9:16 Vic tiene look y su tarjeta lo muestra (se llama como él: el nombre no se repite): ' + nameOf(named(avatarRadios(), 'Vic')))
  lookCard('Ana vertical').click()
  await waitFor(() => playerTitle() === 'Ana vertical' && playerUse(), 'el vertical abre su reproductor, con «Usar»')
  playerUse().click()
  await waitFor(() => same(window.patches.at(-1), { avatar: ANA_VERTICAL }), 'elegir el look vertical con «Usar»')
  check(!text().includes(i18n.t('create.avatar.previousUnavailable')) && nameOf(named(avatarRadios(), 'Ana')) === 'Ana Ana vertical ' + moreLooks(2), 'el look vertical arregla la elección y la tarjeta lo muestra: ' + nameOf(named(avatarRadios(), 'Ana')))
  named(avatarRadios(), 'Teo').click()
  await waitFor(() => text().includes(i18n.t('create.avatar.noLookPortrait', { name: 'Teo' })), 'Teo no tiene look vertical')
  check(text().includes(i18n.t('create.avatar.stockNoLook')) && ![...document.querySelectorAll('a')].some((link) => link.getAttribute('href') === avatarScenarioPath('teo-2', '9:16')), 'un avatar de stock no admite escenarios nuevos: no hay enlace a «Crear escenario»')

  // 9. Un saldo en otra moneda se muestra tal cual (no bloquea: ver check-app-avatar-create).
  mount({ avatars: LIBRARY, balance: { available: true, remaining: 12, currency: 'credits' }, keys: ['heygen'] }, { ...CREATE_FORM_INITIAL_VALUE, useAvatar: true, avatar: ANA })
  await waitFor(() => text().includes(i18n.t('avatars.saldo.creditos', { amount: formatCompact(12) })), 'el saldo en créditos tal cual')
  check(!text().includes(formatUsd(12, 'es')), 'el saldo en créditos no se disfraza de dólares')
  check(balancePill()?.textContent.includes(i18n.t('avatars.saldo.creditos', { amount: formatCompact(12) })) && !namesProvider(balancePill()), 'la píldora en créditos tampoco nombra a HeyGen')
  // Un saldo que no se pudo leer: «Saldo · no disponible», sin el proveedor.
  mount({ avatars: LIBRARY, balance: { available: false }, keys: ['heygen'] }, { ...CREATE_FORM_INITIAL_VALUE, useAvatar: true, avatar: ANA })
  await waitFor(() => balancePill()?.textContent.includes(i18n.t('avatars.saldo.noDisponible')), 'la píldora con el saldo no disponible')
  check(balancePill().textContent.includes(i18n.t('avatars.saldo.etiqueta')) && !namesProvider(balancePill()), 'con el saldo sin leer la píldora dice «Saldo · no disponible» y no nombra a HeyGen: ' + balancePill().textContent)

  // 9b. De vuelta de «Crear escenario» con el look nuevo todavía en camino:
  // encendida, la tarjeta le pregunta a HeyGen cómo va (el sidecar guarda el
  // estado nuevo) y el look aparece para elegir sin salir de Crear.
  const coming = { ...look('look-ana-nuevo', 'Ana nueva', 'photo_avatar', 'landscape'), status: 'processing' }
  const anaWith = (extra) => ({ ...LIBRARY[0], looks: [...LIBRARY[0].looks, extra] })
  mount({ avatars: [anaWith(coming)], balance: USD, keys: ['heygen'], refreshed: { 'ana-1': anaWith({ ...coming, status: 'ready' }) } }, { ...CREATE_FORM_INITIAL_VALUE, useAvatar: true, avatar: ANA })
  await waitFor(() => window.refreshCalls > 0 && looksButton(), 'encendida, la tarjeta pregunta por el look en camino')
  await openLooks()
  await waitFor(() => lookCard('Ana nueva') && !descriptionOf(lookCard('Ana nueva')).includes(i18n.t('avatars.detalle.lookGenerando')), 'el look nuevo aparece listo para elegir al terminar')
  check(same(lookCards().map(lookNameOf), ['Ana oficina', 'Ana vertical', 'Ana cocina', 'Ana nueva']) && isChosen(lookCard('Ana oficina')) && nameOf(named(avatarRadios(), 'Ana')) === 'Ana Ana oficina ' + moreLooks(3), 'el look nuevo se suma a los de Ana y la elección no cambia: ' + lookCards().map(lookNameOf).join(', '))
  lookCard('Ana nueva').click()
  await waitFor(() => playerTitle() === 'Ana nueva', 'tocar el look nuevo abre su reproductor')
  check(playerUse(), 'el look que terminó de generarse ya ofrece «Usar»')
  // El listado ya llegó y no trae el video de este look (recién creado): el
  // escenario termina diciendo «sin video» y no queda cargando para siempre.
  await waitFor(() => playerSays(says.noVideo), 'el listado no trae el video del look nuevo: el reproductor termina diciendo «sin video»')
  check(!playerVideo() && !playerText().includes(says.loading), 'y no queda con el spinner')
  playerClose().click()
  await waitFor(() => !playerDialog(), 'cerrar el reproductor del look nuevo')

  // 9c. Por qué no se elige cada look, con la regla que decide
  // (lookUnfitReason): generándose, fallido, sin ningún motor, cuadrado, y sin
  // orientación en la biblioteca. Este último dice «Sin orientación
  // confirmada» aunque el listado traiga medidas (verticales, u horizontales
  // como el video: el chip dice «16:9» y aun así no se elige) o la orientación
  // (el chip la usa), o nada (sin chip). Desde la entrega 2e un look sirve con
  // cualquier motor que admita: el solo-IV ya no da motivo, su reproductor
  // ofrece «Usar» y, elegido, el grupo «Motor» marca IV.
  const extraLooks = [
    { ...look('look-ana-generando', 'Ana generando', 'photo_avatar', 'landscape'), status: 'processing' },
    { ...look('look-ana-fallida', 'Ana fallida', 'photo_avatar', 'landscape'), status: 'failed' },
    look('look-ana-iv', 'Ana IV', 'photo_avatar', 'landscape', ['avatar_iv']),
    look('look-ana-sin-motor', 'Ana sin motor', 'photo_avatar', 'landscape', []),
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
    // El listado de HeyGen no trae video de este look (pasa con muchos).
    if (item.lookId === 'look-ana-sin-datos') return { ...stockLook(item), previewVideoUrl: undefined }
    return stockLook(item)
  }
  mount({ avatars: [anaExtra], balance: USD, keys: ['heygen'], stockLooks: { 'group-ana-1': anaExtra.looks.map(measured) } }, { ...CREATE_FORM_INITIAL_VALUE, useAvatar: true, avatar: ANA })
  // El montaje es asíncrono: se espera a la Ana de este caso (doce looks), no
  // al botón que dejó abierto el caso anterior.
  await waitFor(() => window.listCalls > 0 && nameOf(named(avatarRadios(), 'Ana')) === 'Ana Ana oficina ' + moreLooks(11), 'Ana con looks que no sirven')
  await openLooks()
  await waitFor(() => descriptionOf(lookCard('Ana medida')).includes(formatAria('9:16')) && descriptionOf(lookCard('Ana medida ancha')).includes(formatAria('16:9')), 'el formato de un look sin orientación sale de las medidas del listado')
  const reasons = Object.fromEntries(extraLooks.map((item) => [item.name, descriptionOf(lookCard(item.name))]))
  const unknownOrientation = i18n.t('create.avatar.unknownOrientation')
  check(extraLooks.every((item) => lookCard(item.name) && !isChosen(lookCard(item.name))), 'ninguno de esos looks está elegido')
  check(reasons['Ana generando'].includes(i18n.t('avatars.detalle.lookGenerando')) && reasons['Ana fallida'].includes(i18n.t('avatars.detalle.lookFallido')) && reasons['Ana sin motor'].includes(i18n.t('avatars.tarjeta.noCompatible')), 'uno que se genera, uno que falló y uno sin ningún motor dicen por qué con los textos de la biblioteca: ' + JSON.stringify(reasons))
  check(reasons['Ana IV'].includes(i18n.t('avatars.types.photo_avatar')) && !reasons['Ana IV'].includes(i18n.t('avatars.tarjeta.noCompatible')) && !reasons['Ana IV'].includes(i18n.t('create.avatar.otherFormat', { format: '16:9' })), 'un look solo-IV ya sirve (entrega 2e): su ficha dice su tipo y ningún motivo: ' + reasons['Ana IV'])
  check(reasons['Ana cuadrada'].includes(formatAria('1:1')) && reasons['Ana cuadrada'].includes(i18n.t('create.avatar.otherFormat', { format: '1:1' })), 'uno cuadrado dice que es para videos 1:1')
  check(reasons['Ana medida'].includes(unknownOrientation) && reasons['Ana medida ancha'] === formatAria('16:9') + ' | ' + unknownOrientation && reasons['Ana listada'] === formatAria('9:16') + ' | ' + unknownOrientation && reasons['Ana sin datos'] === unknownOrientation, 'sin orientación en la biblioteca dice «Sin orientación confirmada», con medidas verticales, con medidas como las del video (chip «16:9»), con la orientación del listado (chip «9:16») o sin datos (sin chip), y nunca «No compatible con Vimo»: ' + JSON.stringify([reasons['Ana medida'], reasons['Ana medida ancha'], reasons['Ana listada'], reasons['Ana sin datos']]))
  // El reproductor de cada uno abre sin «Usar» y dice por qué con una frase
  // entera (el reproductor traduce la clave sin variables), que no es la
  // etiqueta de su ficha; sus chips dicen el mismo formato que la ficha, y su
  // video es el de su look: el que el listado no trae termina diciendo «sin
  // video». Las claves están escritas acá, aparte de las del código, y cada una
  // es una frase del catálogo (phrase): si una se renombra en los catálogos, el
  // pie mostraría la ruta cruda y la comparación con i18n.t seguiría igual.
  const formatsIn = (shown) => ['16:9', '9:16', '1:1', '4:5', '5:4'].filter((format) => shown.includes(formatAria(format)))
  const PLAYER_REASON_KEYS = {
    'Ana generando': 'avatars.reproductor.noListoHint',
    'Ana fallida': 'create.avatar.failedLookHint',
    'Ana sin motor': 'avatars.reproductor.noCompatibleHint',
    'Ana cuadrada': 'create.avatar.otherFormatHint',
    'Ana medida': 'create.avatar.unknownOrientationHint',
    'Ana medida ancha': 'create.avatar.unknownOrientationHint',
    'Ana listada': 'create.avatar.unknownOrientationHint',
    'Ana sin datos': 'create.avatar.unknownOrientationHint',
  }
  const cardLabels = ['avatars.detalle.lookGenerando', 'avatars.detalle.lookFallido', 'avatars.tarjeta.noCompatible', 'create.avatar.unknownOrientation'].map((key) => i18n.t(key))
  for (const [name, key] of Object.entries(PLAYER_REASON_KEYS)) {
    const reason = phrase(key)
    check(reason.endsWith('.') && !cardLabels.includes(reason), 'el pie de «' + name + '» es una frase entera y no la etiqueta de su ficha: ' + reason)
    const lookId = extraLooks.find((item) => item.name === name).lookId
    lookCard(name).click()
    await waitFor(() => playerTitle() === name, 'tocar «' + name + '» abre su reproductor')
    check(!playerUse() && playerSays(reason) && !playerText().includes('{{'), 'el reproductor de «' + name + '» no ofrece «Usar» y dice: ' + reason)
    check(same(formatsIn(playerText()), formatsIn(reasons[name])), 'los chips del reproductor de «' + name + '» dicen el mismo formato que su ficha: ' + JSON.stringify(formatsIn(playerText())))
    if (lookId === 'look-ana-sin-datos') {
      await waitFor(() => playerSays(says.noVideo), 'el listado no trae el video de «' + name + '»: el reproductor termina diciendo «sin video»')
      check(!playerVideo() && !playerText().includes(says.loading), 'y no queda cargando')
    } else {
      check(playerVideo()?.getAttribute('src') === remoteVideo(lookId), 'el reproductor de «' + name + '» trae el video de su look')
    }
    playerClose().click()
    await waitFor(() => !playerDialog() && document.activeElement === lookCard(name), 'cerrar el reproductor de «' + name + '» devuelve el foco a su ficha')
  }
  // El solo-IV abre con «Usar» y se elige: la elección lleva sus motores, el
  // parche es solo el avatar (el motor preferido sigue siendo III) y el grupo
  // «Motor» marca IV, el único que admite, con III y V apagados.
  const ANA_IV = { ...ANA, lookId: 'look-ana-iv', lookName: 'Ana IV', supportedEngines: ['avatar_iv'] }
  lookCard('Ana IV').click()
  await waitFor(() => playerTitle() === 'Ana IV', 'tocar el look solo-IV abre su reproductor')
  check(playerUse() && playerSays(says.use), 'un look solo-IV abre con «Usar» (entrega 2e)')
  playerUse().click()
  await waitFor(() => same(window.patches.at(-1), { avatar: ANA_IV }), 'elegir el look solo-IV con «Usar» parchea solo el avatar, con sus motores')
  await waitFor(() => isChecked(engineRadio('avatar_iv')), 'con el look solo-IV el grupo «Motor» marca IV')
  check(window.value.avatarEngine === 'avatar_iii' && engineRadio('avatar_iii').disabled && engineRadio('avatar_v').disabled && !engineRadio('avatar_iv').disabled, 'el motor preferido sigue siendo III; III y V quedan apagados y IV se puede elegir')

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
  buttonIn(dialogSaying(scenarioTitle), i18n.t('avatars.generar.cancelar')).click()
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
  check(engineRadios().length === 3 && engineRadios().every((radio) => radio.disabled) && isChecked(engineRadio('avatar_iii')), 'deshabilitada: el grupo «Motor» se ve con el suyo marcado y ninguna opción responde')
  // Y si se deshabilita con la grilla abierta, ninguna ficha abre el
  // reproductor (que cambiaría la elección con «Usar»).
  mount({ avatars: LIBRARY, balance: USD, keys: ['heygen'] }, { ...CREATE_FORM_INITIAL_VALUE, useAvatar: true, avatar: ANA })
  await waitFor(() => !toggle().disabled && looksButton() && !looksButton().disabled && nameOf(named(avatarRadios(), 'Ana')) === 'Ana Ana oficina ' + moreLooks(2), 'la tarjeta habilitada con su elección')
  const consoleBeforeDisabled = window.consoleLog.length
  await openLooks()
  // Con el reproductor abierto: deshabilitar el formulario lo cierra sin elegir
  // nada («Usar» ya no existe) y no se reabre solo al habilitarlo de nuevo.
  lookCard('Ana cocina').click()
  await waitFor(() => playerTitle() === 'Ana cocina' && playerUse(), 'abrir el reproductor de la cocina antes de deshabilitar')
  window.setDisabled(true)
  await waitFor(() => !playerDialog() && looksButton().disabled, 'deshabilitar el formulario con el reproductor abierto lo cierra')
  check(window.patches.length === 0 && document.body.style.pointerEvents !== 'none', 'sin elegir nada y sin dejar el documento bloqueado')
  window.setDisabled(false)
  await waitFor(() => !looksButton().disabled, 'el formulario se habilita de nuevo')
  await delay(200)
  check(!playerDialog() && window.consoleLog.length === consoleBeforeDisabled, 'al habilitarlo de nuevo el reproductor no se reabre solo, y nada de esto dejó errores ni advertencias en la consola: ' + JSON.stringify(window.consoleLog.slice(consoleBeforeDisabled)))
  // Con la grilla abierta y el formulario deshabilitado, ninguna ficha abre nada.
  window.setDisabled(true)
  await waitFor(() => looksButton().disabled, 'el formulario se deshabilita con la grilla abierta')
  check(lookCards().length === 3 && lookCards().every((card) => card.getAttribute('aria-disabled') === 'true'), 'las fichas de la grilla abierta quedan aria-disabled')
  lookCard('Ana cocina').click()
  await delay(150)
  check(!playerDialog() && window.patches.length === 0, 'deshabilitado, tocar una ficha no abre el reproductor ni elige nada')
  window.setDisabled(false)
  await waitFor(() => !looksButton().disabled && lookCard('Ana cocina').getAttribute('aria-disabled') === 'false', 'el formulario se vuelve a habilitar')
  lookCard('Ana cocina').click()
  await waitFor(() => playerTitle() === 'Ana cocina', 'habilitado de nuevo, la ficha abre el reproductor')
  playerClose().click()
  await waitFor(() => !playerDialog(), 'cerrar el reproductor de la cocina')

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

  // 16. El motor del avatar y «Movimiento más expresivo» (entrega 2e, §21.3).
  // Mia (propia) tiene un look de foto con los tres motores y otro solo-IV;
  // Leo (de stock) es un gemelo digital con los tres. La tarifa de V con un
  // look de foto se lee de la tabla con la función: cambia en la 2e.
  const ALL_ENGINES = ['avatar_iii', 'avatar_iv', 'avatar_v']
  const MIA = avatar('mia-6', 'Mia', 'own', 'look-mia', [look('look-mia', 'Mia estudio', 'photo_avatar', 'landscape', ALL_ENGINES), look('look-mia-iv', 'Mia IV', 'photo_avatar', 'landscape', ['avatar_iv'])])
  const LEO = avatar('leo-7', 'Leo', 'stock', 'look-leo', [look('look-leo', 'Leo gemelo', 'digital_twin', 'landscape', ALL_ENGINES)])
  const MIA_CHOICE = { id: 'mia-6', name: 'Mia', lookId: 'look-mia', lookName: 'Mia estudio', lookType: 'photo_avatar', supportedEngines: ALL_ENGINES, motionReference: false }
  const MIA_IV = { ...MIA_CHOICE, lookId: 'look-mia-iv', lookName: 'Mia IV', supportedEngines: ['avatar_iv'] }
  const LEO_CHOICE = { id: 'leo-7', name: 'Leo', lookId: 'look-leo', lookName: 'Leo gemelo', lookType: 'digital_twin', supportedEngines: ALL_ENGINES, motionReference: true }
  const engineFixture = { avatars: [MIA, LEO], balance: USD, keys: ['heygen'], stockLooks: { ...STOCK_LOOKS, [MIA.groupId]: MIA.looks.map(stockLook), [LEO.groupId]: LEO.looks.map(stockLook) } }
  const engineLabel = (engine) => phrase('avatars.engines.' + engine)
  const engineDescription = (engine) => phrase('create.avatar.engineDescription.' + engine)
  const unavailableSays = (engine) => phrase('create.avatar.engineUnavailable', { engine: engineLabel(engine) })
  // Lo que dice una opción después de su nombre: la descripción y el costo de
  // este video (por defecto 3 × 10 s) con su tarifa por minuto o, sin tarifa,
  // por qué no se elige (un look que no admite el motor lo dice igual:
  // unavailableSays).
  const optionSays = (engine, lookType, seconds = 30) => {
    const amount = avatarUsd(lookType, seconds, engine)
    if (amount === null) return engineDescription(engine) + ' | ' + unavailableSays(engine)
    return engineDescription(engine) + ' | ' + usdSays(amount) + ' ' + perMinuteSays(avatarRatePerMinute(lookType, engine))
  }
  for (const key of ['create.avatar.engineTitle', 'create.avatar.engineGroupAria', 'create.avatar.expressive', 'create.avatar.expressiveHelpAria', 'create.avatar.expressiveTooltip', 'create.avatar.motionAuto']) phrase(key)

  // 16a. Con un look de foto con los tres motores: el grupo, en el orden del
  // dueño, con la descripción y el costo de cada uno; Avatar III por defecto,
  // sin el interruptor.
  mount(engineFixture, { ...CREATE_FORM_INITIAL_VALUE, useAvatar: true, avatar: MIA_CHOICE })
  await waitFor(() => engineRadios().length === 3 && looksButton(), 'el grupo «Motor» con sus tres opciones')
  check([...document.querySelectorAll('p')].some((element) => element.textContent === phrase('create.avatar.engineTitle')), 'el grupo tiene su título a la vista')
  check(looksRegion() && !looksRegion().contains(engineGroup()) && !engineGroup().closest('[role=radiogroup][aria-label="' + i18n.t('create.avatar.chooseAvatar') + '"]'), 'el grupo «Motor» va fuera de la región de looks y de la fila de avatares')
  check(same(engineRadios().map(nameOf), ['avatar_v', 'avatar_iv', 'avatar_iii'].map(engineLabel)), 'las tres opciones en el orden del dueño (V, IV, III): ' + engineRadios().map(nameOf).join(', '))
  check(avatarUsd('photo_avatar', 30, 'avatar_iii') === 0.495 && avatarUsd('photo_avatar', 30, 'avatar_iv') === 1.155, 'un look de foto, 30 s: III ≈ 0,495 y IV ≈ 1,155')
  check(descriptionOf(engineRadio('avatar_iii')) === optionSays('avatar_iii', 'photo_avatar') && descriptionOf(engineRadio('avatar_iv')) === optionSays('avatar_iv', 'photo_avatar'), 'III y IV dicen su descripción y el costo de este video con su tarifa por minuto: ' + engineRadios().map(descriptionOf).join(' / '))
  check(avatarUsd('photo_avatar', 30, 'avatar_v') === 3.6 && !engineRadio('avatar_v').disabled && descriptionOf(engineRadio('avatar_v')) === optionSays('avatar_v', 'photo_avatar'), 'V con un look de foto: 7,20 US$/min desde la tabla de la 2e, ≈ 3,60 por 30 s, y se puede elegir: ' + descriptionOf(engineRadio('avatar_v')))
  check(isChecked(engineRadio('avatar_iii')) && !isChecked(engineRadio('avatar_iv')) && !isChecked(engineRadio('avatar_v')), 'por defecto, Avatar III')
  // Contraste (revisión de WP-V, hallazgo 5): sobre el fondo de la marcada el
  // gris de siempre no llega a 4,5:1 (3,95 en claro); su descripción y su costo
  // van en foreground al 80 % (7,95), los de las demás en el gris (4,72). Con
  // el formulario habilitado y las tres elegibles, nada se atenúa.
  check(engineDescribedParts(engineRadio('avatar_iii')).every((part) => part.classList.contains('text-foreground/80') && !part.classList.contains('text-muted-foreground')) && ['avatar_v', 'avatar_iv'].every((engine) => engineDescribedParts(engineRadio(engine)).every((part) => part.classList.contains('text-muted-foreground'))), 'la descripción y el costo de la marcada van en foreground al 80 %, los de las demás en el gris de siempre')
  check(engineRadios().every((radio) => !dimmedWithin(engineNamePart(radio)) && engineDescribedParts(radio).every((part) => !dimmedWithin(part))), 'con el formulario habilitado y las tres elegibles, ninguna opción se atenúa')
  check(same(engineRadios().map((radio) => radio.tabIndex), [-1, -1, 0]), 'una sola parada de Tab en el grupo: la marcada')
  check(!expressiveSwitch() && !expressiveHelp() && !text().includes(phrase('create.avatar.motionAuto')), 'con Avatar III no hay «Movimiento más expresivo» ni la línea del movimiento automático')
  check(costCard()?.textContent.includes(usdSays(0.495)) && costCard().textContent.includes(engineLabel('avatar_iii') + ' ' + perMinuteSays(0.99)) && !costCard().textContent.includes('Motor Avatar III'), 'la tarjeta del costo nombra el motor efectivo con su tarifa, no «Motor Avatar III»: ' + costCard()?.textContent)
  check(window.patches.length === 0, 'montar el grupo no parchea nada')

  // 16b. Elegir IV manda solo { avatarEngine }; con IV y un look de foto
  // aparece «Movimiento más expresivo», con su ayuda en un tooltip.
  engineRadio('avatar_iv').click()
  await waitFor(() => isChecked(engineRadio('avatar_iv')), 'elegir IV')
  check(same(window.patches, [{ avatarEngine: 'avatar_iv' }]), 'elegir IV manda solo { avatarEngine }: ' + JSON.stringify(window.patches))
  check(same(engineRadios().map((radio) => radio.tabIndex), [-1, 0, -1]), 'la parada de Tab sigue a la marcada')
  engineRadio('avatar_iv').click()
  await delay(100)
  check(window.patches.length === 1, 'elegir el que ya está marcado no parchea nada')
  check(costCard().textContent.includes(usdSays(1.155)) && costCard().textContent.includes(engineLabel('avatar_iv') + ' ' + perMinuteSays(2.31)), 'la tarjeta del costo pasa a IV: ' + costCard().textContent)
  await waitFor(() => expressiveSwitch(), 'con IV aparece «Movimiento más expresivo»')
  const expressiveLabel = [...document.querySelectorAll('label')].find((label) => label.htmlFor === 'create-avatar-expressive')
  check(expressiveLabel?.textContent === phrase('create.avatar.expressive') && expressiveSwitch().getAttribute('role') === 'switch' && expressiveSwitch().getAttribute('aria-checked') === 'false' && !expressiveSwitch().disabled, 'el interruptor con su etiqueta, apagado por defecto y habilitado')
  check(text().includes(phrase('create.avatar.motionAuto')) && !text().includes(phrase('create.avatar.expressiveUnavailable', { engine: engineLabel('avatar_iv') })), 'debajo, la línea del movimiento automático, sin motivo de apagado')
  check(expressiveHelp() && engineGroup().compareDocumentPosition(expressiveSwitch()) & Node.DOCUMENT_POSITION_FOLLOWING, 'el botón de ayuda existe y el interruptor va después del grupo «Motor»')
  // El teclado llega a la ayuda justo después del grupo (una sola parada) y
  // el foco abre el tooltip; tocar la ayuda no prende el interruptor. Antes,
  // a la vista: Radix cierra el tooltip con cualquier scroll de la página y
  // el foco desplaza hasta el botón si quedó fuera de la ventana (un falso
  // rojo que salía una de cada pocas corridas).
  expressiveSwitch().scrollIntoView({ block: 'center' })
  await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  await delay(100)
  engineRadio('avatar_iv').focus()
  await pressKey('Tab')
  check(document.activeElement === expressiveHelp(), 'Tab sale del grupo «Motor» al botón de ayuda')
  const tooltip = await waitFor(() => document.querySelector('[role=tooltip]'), 'el foco abre el tooltip de la ayuda')
  check(tooltip.textContent === phrase('create.avatar.expressiveTooltip'), 'el tooltip explica qué hace y que no suma costo: ' + tooltip.textContent)
  await pressKey('Escape')
  await waitFor(() => !document.querySelector('[role=tooltip]'), 'Escape cierra el tooltip')
  expressiveHelp().click()
  await delay(100)
  check(window.patches.length === 1 && expressiveSwitch().getAttribute('aria-checked') === 'false', 'tocar la ayuda no prende el interruptor')
  expressiveSwitch().click()
  await waitFor(() => expressiveSwitch().getAttribute('aria-checked') === 'true', 'prender «Movimiento más expresivo»')
  check(window.patches.length === 2 && same(window.patches.at(-1), { avatarExpressive: true }), 'el interruptor manda solo { avatarExpressive }: ' + JSON.stringify(window.patches))

  // 16c. Cambiar de look no toca el motor: con Leo (gemelo digital) sigue IV,
  // y con IV un gemelo no admite «más expresivo»: el interruptor se ve
  // apagado y dice por qué aunque el formulario lo tenga prendido, sin la
  // línea del movimiento automático.
  named(avatarRadios(), 'Leo').click()
  await waitFor(() => same(window.patches.at(-1), { avatar: LEO_CHOICE }), 'mirar a Leo elige su look')
  check(window.patches.length === 3 && window.value.avatarEngine === 'avatar_iv' && window.value.avatarExpressive === true, 'cambiar de look parchea solo el avatar: el motor y «más expresivo» siguen en el formulario')
  // Lo esperado se arma una vez, fuera de la espera (phrase cuenta un check
  // por llamada: adentro, el total dependería de cuántas vueltas dé).
  const twinIvSays = optionSays('avatar_iv', 'digital_twin')
  await waitFor(() => isChecked(engineRadio('avatar_iv')) && descriptionOf(engineRadio('avatar_iv')) === twinIvSays, 'con Leo sigue IV, a la tarifa del gemelo')
  check(avatarUsd('digital_twin', 30, 'avatar_v') === 3.6 && descriptionOf(engineRadio('avatar_v')) === optionSays('avatar_v', 'digital_twin') && descriptionOf(engineRadio('avatar_iii')) === optionSays('avatar_iii', 'digital_twin') && engineRadios().every((radio) => !radio.disabled), 'un gemelo digital, 30 s: V ≈ 3,60, IV ≈ 2,42 y III ≈ 0,30, los tres elegibles: ' + engineRadios().map(descriptionOf).join(' / '))
  const unavailableExpressive = phrase('create.avatar.expressiveUnavailable', { engine: engineLabel('avatar_iv') })
  check(expressiveSwitch()?.disabled && expressiveSwitch().getAttribute('aria-checked') === 'false' && text().includes(unavailableExpressive) && !text().includes(phrase('create.avatar.motionAuto')), 'con IV y un gemelo el interruptor se ve apagado y dice por qué, sin la línea del movimiento automático')
  check(descriptionOf(expressiveSwitch()) === unavailableExpressive, 'el interruptor apagado lleva el motivo como descripción')

  // 16d. Las flechas mueven el foco y la elección (V, IV, III, en ronda);
  // Inicio y Fin van a los extremos. Cada tecla, un parche.
  engineRadio('avatar_iv').focus()
  const keyMoves = [['ArrowLeft', 'avatar_v'], ['ArrowLeft', 'avatar_iii'], ['ArrowRight', 'avatar_v'], ['ArrowDown', 'avatar_iv'], ['ArrowUp', 'avatar_v'], ['End', 'avatar_iii'], ['Home', 'avatar_v']]
  for (const [key, engine] of keyMoves) {
    const before = window.patches.length
    await pressKey(key)
    await waitFor(() => isChecked(engineRadio(engine)) && document.activeElement === engineRadio(engine), key + ' lleva el foco y la elección a ' + engine)
    check(window.patches.length === before + 1 && same(window.patches.at(-1), { avatarEngine: engine }), key + ' manda solo { avatarEngine: ' + engine + ' }: ' + JSON.stringify(window.patches.slice(before)))
    // La tecla que movió el motor no sigue de largo: ↑/↓ no desplazan además
    // la página (revisión de WP-V, hallazgo 4a).
    check(window.lastKeydown?.key === key && window.lastKeydown.prevented === true, key + ' frena el resto de la tecla (preventDefault)')
  }
  // Con V el gemelo admite «más expresivo»: vuelve prendido, como lo dejó la
  // persona, con la línea del movimiento automático.
  check(expressiveSwitch() && !expressiveSwitch().disabled && expressiveSwitch().getAttribute('aria-checked') === 'true' && text().includes(phrase('create.avatar.motionAuto')) && !text().includes(unavailableExpressive), 'con V y un gemelo, «más expresivo» prendido y habilitado, con la línea del movimiento automático')
  check(costCard().textContent.includes(usdSays(3.6)) && costCard().textContent.includes(engineLabel('avatar_v') + ' ' + perMinuteSays(7.2)), 'la tarjeta del costo con V: ' + costCard().textContent)
  // Con Alt, Ctrl o Meta la flecha es de otro (el historial, el sistema): no
  // mueve el motor ni la frena (revisión de WP-V, hallazgo 2). Alt va como
  // tecla de verdad (CDP); Ctrl y Meta, como eventos del DOM, porque Cmd+←
  // es «atrás» en Chrome de macOS y una tecla de verdad podría sacar a la
  // página de su historia. El mismo evento sin modificador sí mueve: así la
  // vía del DOM llega de verdad al manejador.
  const beforeModified = window.patches.length
  await pressKey('ArrowRight', 1)
  await delay(50)
  check(window.lastKeydown?.key === 'ArrowRight' && window.lastKeydown.prevented === false && window.patches.length === beforeModified && isChecked(engineRadio('avatar_v')) && document.activeElement === engineRadio('avatar_v'), 'Alt+→ no mueve el motor ni frena el atajo')
  for (const modifier of ['ctrlKey', 'metaKey']) {
    const modified = new KeyboardEvent('keydown', { key: 'ArrowRight', [modifier]: true, bubbles: true, cancelable: true })
    engineRadio('avatar_v').dispatchEvent(modified)
    await delay(50)
    check(!modified.defaultPrevented && window.patches.length === beforeModified && isChecked(engineRadio('avatar_v')), modifier + ' + → no mueve el motor ni frena el atajo')
  }
  const plain = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
  engineRadio('avatar_v').dispatchEvent(plain)
  await waitFor(() => isChecked(engineRadio('avatar_iv')), 'el mismo evento sin modificador mueve a IV')
  check(plain.defaultPrevented && window.patches.length === beforeModified + 1 && same(window.patches.at(-1), { avatarEngine: 'avatar_iv' }), 'sin modificador, el evento del DOM mueve el motor y lo frena')
  await pressKey('End')
  await waitFor(() => isChecked(engineRadio('avatar_iii')) && !expressiveSwitch(), 'con III el interruptor se va')
  await pressKey('Tab')
  check(document.activeElement?.id === 'create-avatar-appearances', 'Tab sale del grupo al control siguiente: una sola parada (' + (document.activeElement?.id || document.activeElement?.tagName) + ')')

  // 16e. Un look sin el motor preferido marca el de reemplazo sin parchear;
  // los que no admite quedan apagados con su motivo y las flechas no tienen
  // adónde ir.
  mount(engineFixture, { ...CREATE_FORM_INITIAL_VALUE, useAvatar: true, avatar: MIA_IV })
  await waitFor(() => nameOf(named(avatarRadios(), 'Mia')) === 'Mia Mia IV ' + moreLooks(1) && engineRadios().length === 3 && isChecked(engineRadio('avatar_iv')), 'con el look solo-IV de Mia el grupo marca IV')
  await delay(100)
  check(window.patches.length === 0 && window.value.avatarEngine === 'avatar_iii', 'marcar el de reemplazo no parchea nada: el preferido sigue siendo III')
  check(engineRadio('avatar_iii').disabled && engineRadio('avatar_v').disabled && descriptionOf(engineRadio('avatar_iii')) === engineDescription('avatar_iii') + ' | ' + unavailableSays('avatar_iii') && descriptionOf(engineRadio('avatar_v')) === engineDescription('avatar_v') + ' | ' + unavailableSays('avatar_v'), 'los motores que el look no admite quedan apagados y dicen por qué')
  check(expressiveSwitch() && !expressiveSwitch().disabled && expressiveSwitch().getAttribute('aria-checked') === 'false', 'IV con un look de foto ofrece «más expresivo», apagado')
  // Una apagada atenúa su nombre y su descripción, pero no el motivo, que se
  // lee a pleno contraste (4,72:1 en claro, antes 2,31 con el botón al 60 %);
  // la elegible no se atenúa (revisión de WP-V, hallazgo 5).
  const [vDescription, vReason] = engineDescribedParts(engineRadio('avatar_v'))
  check(dimmedWithin(engineNamePart(engineRadio('avatar_v'))) && dimmedWithin(vDescription) && !dimmedWithin(vReason) && vReason.classList.contains('text-muted-foreground') && vReason.textContent === unavailableSays('avatar_v'), 'una opción apagada atenúa su nombre y su descripción, no su motivo')
  check(!dimmedWithin(engineNamePart(engineRadio('avatar_iv'))) && engineDescribedParts(engineRadio('avatar_iv')).every((part) => !dimmedWithin(part)), 'la elegible no se atenúa')
  engineRadio('avatar_iv').focus()
  await pressKey('ArrowRight')
  check(window.lastKeydown?.key === 'ArrowRight' && window.lastKeydown.prevented === false, 'sin adónde ir, la flecha no frena nada (la página sigue su camino)')
  await pressKey('ArrowLeft')
  await delay(100)
  check(window.patches.length === 0 && document.activeElement === engineRadio('avatar_iv'), 'con una sola opción elegible las flechas no mueven nada ni parchean')
  engineRadio('avatar_v').click()
  await delay(100)
  check(window.patches.length === 0, 'una opción apagada no se elige')

  // 16f. Prefiere V con un look que no lo admite (el de Ana: III y IV): marca
  // III sin parchear; con Leo, que lo admite, se marca V; y de III la flecha
  // da la vuelta saltando V, apagado.
  mount({ ...engineFixture, avatars: [LIBRARY[0], LEO] }, { ...CREATE_FORM_INITIAL_VALUE, useAvatar: true, avatar: ANA, avatarEngine: 'avatar_v' })
  await waitFor(() => named(avatarRadios(), 'Ana') && !named(avatarRadios(), 'Mia') && engineRadios().length === 3 && isChecked(engineRadio('avatar_iii')), 'prefiere V y el look de Ana no lo admite: marca III, el primero del orden de reemplazo')
  await delay(100)
  check(window.patches.length === 0 && window.value.avatarEngine === 'avatar_v' && engineRadio('avatar_v').disabled && descriptionOf(engineRadio('avatar_v')) === engineDescription('avatar_v') + ' | ' + unavailableSays('avatar_v'), 'sin parchear nada; V queda apagado con su motivo')
  check(costCard().textContent.includes(usdSays(0.495)) && costCard().textContent.includes(engineLabel('avatar_iii')), 'el costo sale con III, el motor con el que sale')
  named(avatarRadios(), 'Leo').click()
  await waitFor(() => same(window.patches.at(-1), { avatar: LEO_CHOICE }) && isChecked(engineRadio('avatar_v')), 'con Leo, que admite V, se marca el preferido')
  named(avatarRadios(), 'Ana').click()
  await waitFor(() => same(window.patches.at(-1), { avatar: ANA }) && isChecked(engineRadio('avatar_iii')), 'de vuelta en Ana, otra vez III')
  check(window.patches.length === 2 && window.value.avatarEngine === 'avatar_v', 'cambiar de look no parcheó el motor: ' + JSON.stringify(window.patches))
  engineRadio('avatar_iii').focus()
  await pressKey('ArrowRight')
  await waitFor(() => isChecked(engineRadio('avatar_iv')) && document.activeElement === engineRadio('avatar_iv'), 'de III, la flecha da la vuelta, salta V (apagado) y llega a IV')
  check(window.patches.length === 3 && same(window.patches.at(-1), { avatarEngine: 'avatar_iv' }), 'un solo parche: ' + JSON.stringify(window.patches))

  // 16f'. Tocar el reemplazo marcado lo vuelve la preferencia (revisión de
  // WP-V, hallazgo 4b; decisión del informe): prefiere V, el look de Ana admite
  // III y IV, se marca III y tocarlo manda { avatarEngine: 'avatar_iii' };
  // tocarlo otra vez, ya preferido, no manda nada; y con Leo, que admite V,
  // sigue III.
  mount({ ...engineFixture, avatars: [LIBRARY[0], LEO] }, { ...CREATE_FORM_INITIAL_VALUE, useAvatar: true, avatar: ANA, avatarEngine: 'avatar_v' })
  await waitFor(() => named(avatarRadios(), 'Ana') && engineRadios().length === 3 && isChecked(engineRadio('avatar_iii')), 'prefiere V: III marcado de reemplazo')
  engineRadio('avatar_iii').click()
  await waitFor(() => window.patches.length === 1, 'tocar el III marcado')
  check(same(window.patches, [{ avatarEngine: 'avatar_iii' }]) && window.value.avatarEngine === 'avatar_iii' && isChecked(engineRadio('avatar_iii')), 'tocar el reemplazo marcado lo vuelve la preferencia: { avatarEngine: avatar_iii }')
  engineRadio('avatar_iii').click()
  await delay(100)
  check(window.patches.length === 1, 'tocarlo otra vez, ya preferido, no manda nada')
  named(avatarRadios(), 'Leo').click()
  await waitFor(() => same(window.patches.at(-1), { avatar: LEO_CHOICE }) && isChecked(engineRadio('avatar_iii')), 'con Leo, que admite V, sigue III: la preferencia ya es III')

  // 16g. Deshabilitada (la demo): ni el motor ni el interruptor responden.
  mount(engineFixture, { ...CREATE_FORM_INITIAL_VALUE, useAvatar: true, avatar: MIA_CHOICE, avatarEngine: 'avatar_iv' }, true)
  // El montaje es asíncrono: se espera a la tarjeta de este caso (deshabilitada
  // y con Mia), no al grupo que dejó el caso anterior.
  await waitFor(() => toggle()?.disabled && named(avatarRadios(), 'Mia') && engineRadios().length === 3 && expressiveSwitch(), 'deshabilitada, con IV')
  check(engineRadios().every((radio) => radio.disabled) && expressiveSwitch().disabled && isChecked(engineRadio('avatar_iv')) && !text().includes(phrase('create.avatar.expressiveUnavailable', { engine: engineLabel('avatar_iv') })), 'deshabilitada: el motor y el interruptor no responden (sin el motivo de un look que no lo admite)')
  // Y se ve deshabilitada, como los demás controles (revisión de WP-V,
  // hallazgo 6): cada opción entera se atenúa.
  check(engineRadios().every((radio) => radio.classList.contains('opacity-60')), 'deshabilitada, cada opción se atenúa entera')
  engineRadio('avatar_iii').click()
  expressiveSwitch().click()
  await delay(100)
  check(window.patches.length === 0, 'deshabilitada no parchea nada')

  // 16i. El costo de cada opción sigue a las apariciones y los segundos, y la
  // tarjeta dice lo mismo que la opción marcada (revisión de WP-V, hallazgo
  // 3): 5 × 10 s y después 5 × 20 s de un look de foto, con IV.
  mount(engineFixture, { ...CREATE_FORM_INITIAL_VALUE, useAvatar: true, avatar: MIA_CHOICE, avatarEngine: 'avatar_iv' })
  await waitFor(() => !toggle()?.disabled && named(avatarRadios(), 'Mia') && engineRadios().length === 3 && isChecked(engineRadio('avatar_iv')), 'Mia con IV y el formulario habilitado')
  for (const [sliderId, sliderValue, seconds] of [['create-avatar-appearances', 5, 50], ['create-avatar-seconds', 20, 100]]) {
    const expected = Object.fromEntries(['avatar_v', 'avatar_iv', 'avatar_iii'].map((engine) => [engine, optionSays(engine, 'photo_avatar', seconds)]))
    const ivAmount = usdSays(avatarUsd('photo_avatar', seconds, 'avatar_iv'))
    const total = i18n.t('create.avatar.total', { count: 5, seconds })
    setRange(sliderId, sliderValue)
    await waitFor(() => engineRadios().every((radio) => descriptionOf(radio) === expected[radio.dataset.engine]), 'con ' + seconds + ' s cada opción dice el costo de ese video')
    check(descriptionOf(engineRadio('avatar_iv')).includes(ivAmount) && costCard().textContent.includes(ivAmount) && costCard().textContent.includes(total), 'con ' + seconds + ' s la tarjeta y la opción marcada dicen lo mismo: ' + ivAmount + ' / ' + costCard().textContent)
  }

  // 16j. Una elección cuyo look perdió un motor deja de valer (revisión de
  // WP-V, hallazgo 1): la biblioteca releída ya no admite V en el look de
  // Mia, así que el selector dice que la elección anterior no sirve (y el
  // envío se frena con la misma regla), sin tocar el motor preferido; volver a
  // elegir a Mia trae los motores de hoy y la preferencia sigue en V.
  const MIA_CUT = avatar('mia-6', 'Mia', 'own', 'look-mia', [look('look-mia', 'Mia estudio', 'photo_avatar', 'landscape', ['avatar_iii', 'avatar_iv']), look('look-mia-iv', 'Mia IV', 'photo_avatar', 'landscape', ['avatar_iv'])])
  const MIA_TODAY = { ...MIA_CHOICE, supportedEngines: ['avatar_iii', 'avatar_iv'] }
  const previousUnavailable = phrase('create.avatar.previousUnavailable')
  mount({ ...engineFixture, avatars: [MIA_CUT, LEO], stockLooks: { ...engineFixture.stockLooks, [MIA_CUT.groupId]: MIA_CUT.looks.map(stockLook) } }, { ...CREATE_FORM_INITIAL_VALUE, useAvatar: true, avatar: MIA_CHOICE, avatarEngine: 'avatar_v' })
  await waitFor(() => named(avatarRadios(), 'Mia') && text().includes(previousUnavailable), 'la elección que ofrecía V ya no vale y el selector lo dice')
  await delay(100)
  check(window.patches.length === 0 && window.value.avatarEngine === 'avatar_v', 'decirlo no parchea nada: el motor preferido sigue siendo V')
  named(avatarRadios(), 'Mia').click()
  await waitFor(() => same(window.patches.at(-1), { avatar: MIA_TODAY }) && !text().includes(previousUnavailable), 'volver a elegir a Mia trae los motores de hoy')
  await waitFor(() => isChecked(engineRadio('avatar_iii')), 'con los motores de hoy se marca III')
  check(window.patches.length === 1 && window.value.avatarEngine === 'avatar_v' && engineRadio('avatar_v').disabled, 'la preferencia sigue en V y, como el look ya no lo admite, sale III (el primero del orden de reemplazo)')

  // 16h. La nota de los tramos en la pausa cobra con el motor del proyecto;
  // sin él, con el de siempre (Avatar III).
  const threeSpans = [0, 20, 40].map((startSeconds) => ({ startSeconds, endSeconds: startSeconds + 10 }))
  reactRoot.render(<I18nextProvider key={++revision} i18n={i18n}><div id="spans-iv"><AvatarSpansNote spans={threeSpans} lookType="photo_avatar" engine="avatar_iv" /></div><div id="spans-default"><AvatarSpansNote spans={threeSpans} lookType="photo_avatar" /></div></I18nextProvider>)
  await waitFor(() => document.getElementById('spans-iv')?.textContent && document.getElementById('spans-default')?.textContent, 'las notas de los tramos')
  const spansCost = (amount) => phrase('create.confirmScenes.avatarCost', { amount: formatUsd(amount, 'es') })
  check(document.getElementById('spans-iv').textContent.includes(spansCost(1.155)) && document.getElementById('spans-default').textContent.includes(spansCost(0.495)), 'los tramos cobran con el motor del proyecto (IV: 1,16) y, sin él, con Avatar III (0,50): ' + document.getElementById('spans-iv').textContent + ' / ' + document.getElementById('spans-default').textContent)

  // 16k. «3 veces en 2 minutos» (entrega 2f, diseño §22.2): debajo de «Empieza
  // con el avatar», con la misma casilla y una ayuda con tooltip. Apagada por
  // defecto; manda solo { avatarThreeInTwoMinutes }; prendida avisa lo que
  // cambia (al menos 3 apariciones; las tres primeras hasta el tope), esos
  // avisos son la descripción de la casilla y el costo cuenta lo que sale de
  // verdad. Mia es un look de foto con los tres motores, con III por defecto:
  // 0,99 US$/min. El tope de las tres primeras sale de la constante
  // AVATAR_EARLY_MAX_SECONDS (era 45 s; el planificador lo bajó a 40 y
  // después a 35): nada de este caso lo escribe como número, y los totales se
  // arman a mano a partir de él.
  const earlyCap = AVATAR_EARLY_MAX_SECONDS
  const earlyAtCap = AVATAR_EARLY_APPEARANCES * earlyCap
  const fiveCapped = earlyAtCap + 2 * AVATAR_MAX_APPEARANCE_SECONDS
  const fiveUncapped = 5 * AVATAR_MAX_APPEARANCE_SECONDS
  const threeSays = {
    label: phrase('create.avatar.threeInTwo'),
    helpAria: phrase('create.avatar.threeInTwoHelpAria'),
    tooltip: phrase('create.avatar.threeInTwoTooltip'),
    minimum: phrase('create.avatar.threeInTwoMinimum'),
    capped: phrase('create.avatar.threeInTwoCapped', { seconds: earlyCap }),
    startLabel: phrase('create.avatar.startWithAvatar'),
  }
  // La línea del total tiene plural (total_one y total_other): se comprueba una
  // vez que existen y que la frase sale resuelta; después se arma sin contar
  // checks, porque se usa dentro de las esperas.
  const totalSays = (count, seconds) => i18n.t('create.avatar.total', { count, seconds })
  check(i18n.exists('create.avatar.total_one') && i18n.exists('create.avatar.total_other') && totalSays(5, fiveCapped).includes(String(fiveCapped)) && !totalSays(5, fiveCapped).includes('{{') && totalSays(1, 10) !== totalSays(5, 10), 'la línea del total existe en singular y plural y sale resuelta: ' + totalSays(5, fiveCapped))
  const threeCostSays = (seconds) => usdSays(avatarUsd('photo_avatar', seconds))
  check(AVATAR_EARLY_APPEARANCES === 3, 'son «3 veces»: AVATAR_EARLY_APPEARANCES vale 3')
  check(earlyCap > AVATAR_DEFAULT_APPEARANCE_SECONDS && earlyCap >= AVATAR_MIN_APPEARANCE_SECONDS && earlyCap + 1 <= AVATAR_MAX_APPEARANCE_SECONDS, 'el tope de las tres primeras (' + earlyCap + ' s) cabe en los controles: por encima de los segundos por defecto y con un valor más arriba que el control puede elegir')
  check(avatarUsd('photo_avatar', fiveCapped) !== avatarUsd('photo_avatar', fiveUncapped), 'con 5 apariciones de ' + AVATAR_MAX_APPEARANCE_SECONDS + ' s el tope cambia la cuenta (' + fiveCapped + ' s, no ' + fiveUncapped + ' s)')
  check(threeSays.capped.includes(String(earlyCap)), 'el aviso de las tres primeras dice el tope: ' + threeSays.capped)

  // 16k-a. La casilla: dónde está, cómo se ve y qué manda.
  mount(engineFixture, { ...CREATE_FORM_INITIAL_VALUE, useAvatar: true, avatar: MIA_CHOICE })
  await waitFor(() => named(avatarRadios(), 'Mia') && threeBox() && startBox() && costCard(), 'la tarjeta con las dos casillas')
  check(threeBox().checked === false && !threeBox().disabled && CREATE_FORM_INITIAL_VALUE.avatarThreeInTwoMinutes === false, 'la casilla está apagada y habilitada por defecto')
  check(follows(startBox(), threeBox()) && follows(threeBox(), costCard()), 'va debajo de «Empieza con el avatar» y antes del costo')
  check(threeBox().className === startBox().className && threeBox().closest('label').className === startBox().closest('label').className, 'con el mismo estilo que «Empieza con el avatar»: ' + threeBox().closest('label').className)
  check(window.patches.length === 0 && !paragraphSays(threeSays.minimum) && !paragraphSays(threeSays.capped), 'apagada no hay avisos y montarla no parchea nada')
  check(!threeBox().hasAttribute('aria-describedby') && !startBox().hasAttribute('aria-describedby'), 'sin avisos la casilla no apunta a ninguna descripción (ni la de «Empieza con el avatar», que no pasa ids)')
  check(costCard().textContent.includes(totalSays(3, 30)) && costCard().textContent.includes(threeCostSays(30)), 'apagada, la tarjeta cuenta lo elegido (3 × 10 s): ' + costCard().textContent)

  // La ayuda: un botón fuera de la etiqueta, en la fila de la casilla, que el
  // teclado alcanza justo después y cuyo foco abre el tooltip; tocarla no marca.
  const help = threeHelp()
  check(help && help.tagName === 'BUTTON' && help.type === 'button' && !help.closest('label') && help.parentElement === threeBox().closest('label').parentElement && follows(threeBox(), help), 'la ayuda es un botón fuera de la etiqueta, en la fila de la casilla y después de ella')
  threeBox().scrollIntoView({ block: 'center' })
  await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  await delay(100)
  threeBox().focus()
  await pressKey('Tab')
  check(document.activeElement === help, 'Tab sale de la casilla al botón de ayuda')
  const threeTooltip = await waitFor(() => document.querySelector('[role=tooltip]'), 'el foco abre el tooltip de la ayuda')
  check(threeTooltip.textContent === threeSays.tooltip, 'el tooltip explica qué hace: ' + threeTooltip.textContent)
  await pressKey('Escape')
  await waitFor(() => !document.querySelector('[role=tooltip]'), 'Escape cierra el tooltip')
  help.click()
  await delay(100)
  check(window.patches.length === 0 && threeBox().checked === false, 'tocar la ayuda no marca la casilla ni parchea nada')

  // Marcarla manda solo { avatarThreeInTwoMinutes: true }; con 3 apariciones de
  // 10 s no hay nada que avisar.
  threeBox().click()
  await waitFor(() => threeBox().checked, 'marcar «3 veces en 2 minutos»')
  check(window.patches.length === 1 && same(window.patches.at(-1), { avatarThreeInTwoMinutes: true }), 'marcarla manda solo { avatarThreeInTwoMinutes: true }: ' + JSON.stringify(window.patches))
  check(!paragraphSays(threeSays.minimum) && !paragraphSays(threeSays.capped) && !threeBox().hasAttribute('aria-describedby'), 'con 3 apariciones de 10 s no hay nada que avisar ni nada que describa a la casilla')

  // 16k-b. Con menos de 3 apariciones sale el aviso del mínimo, que describe a
  // la casilla, y la tarjeta cuenta las 3 que salen sin tocar el control de la
  // persona.
  setRange('create-avatar-appearances', 1)
  await waitFor(() => same(window.patches.at(-1), { avatarAppearances: 1 }), 'una aparición')
  await waitFor(() => paragraphSays(threeSays.minimum), 'con 1 aparición sale el aviso de que salen al menos 3')
  const minimumNote = paragraphNamed(threeSays.minimum)
  check(follows(threeBox(), minimumNote) && !paragraphSays(threeSays.capped), 'el aviso va debajo de la casilla, sin el del tope')
  check(minimumNote.id !== '' && threeBox().getAttribute('aria-describedby') === minimumNote.id && descriptionOf(threeBox()) === threeSays.minimum, 'el aviso del mínimo es la descripción de la casilla: ' + descriptionOf(threeBox()))
  check(document.getElementById('create-avatar-appearances').value === '1', 'el control sigue en lo que eligió la persona')
  check(costCard().textContent.includes(totalSays(3, 30)) && costCard().textContent.includes(threeCostSays(30)) && !costCard().textContent.includes(totalSays(1, 10)), 'la tarjeta cuenta las 3 apariciones que salen (30 s), no la que se eligió: ' + costCard().textContent)
  setRange('create-avatar-appearances', 2)
  await waitFor(() => same(window.patches.at(-1), { avatarAppearances: 2 }), 'dos apariciones')
  check(paragraphSays(threeSays.minimum) && descriptionOf(threeBox()) === threeSays.minimum && costCard().textContent.includes(totalSays(3, 30)), 'con 2 apariciones sigue el aviso, describe a la casilla y salen 3')
  setRange('create-avatar-appearances', AVATAR_EARLY_APPEARANCES)
  await waitFor(() => same(window.patches.at(-1), { avatarAppearances: AVATAR_EARLY_APPEARANCES }) && !paragraphSays(threeSays.minimum), 'con 3 apariciones el aviso se va')
  check(!threeBox().hasAttribute('aria-describedby'), 'y con él se va la descripción: la casilla no apunta a un id que ya no está')

  // 16k-c. Con más del tope por aparición, el aviso del tope; con el tope, no.
  setRange('create-avatar-seconds', earlyCap)
  await waitFor(() => same(window.patches.at(-1), { avatarSecondsPerAppearance: earlyCap }), earlyCap + ' segundos por aparición')
  check(!paragraphSays(threeSays.capped) && !threeBox().hasAttribute('aria-describedby') && costCard().textContent.includes(totalSays(3, earlyAtCap)), 'con ' + earlyCap + ' s no hay tope que avisar (3 × ' + earlyCap + ' s = ' + earlyAtCap + ' s)')
  setRange('create-avatar-seconds', earlyCap + 1)
  await waitFor(() => paragraphSays(threeSays.capped), 'con ' + (earlyCap + 1) + ' s por aparición sale el aviso del tope de las tres primeras')
  const cappedNote = paragraphNamed(threeSays.capped)
  check(follows(threeBox(), cappedNote) && !paragraphSays(threeSays.minimum) && costCard().textContent.includes(totalSays(3, earlyAtCap)), 'va debajo de la casilla y las tres primeras cuentan ' + earlyCap + ' s (' + earlyAtCap + ' s), no ' + (earlyCap + 1))
  check(cappedNote.id !== '' && threeBox().getAttribute('aria-describedby') === cappedNote.id && descriptionOf(threeBox()) === threeSays.capped, 'el aviso del tope es la descripción de la casilla: ' + descriptionOf(threeBox()))

  // 16k-d. 5 apariciones de 60 s: las tres primeras al tope y las otras dos a
  // 60 s; ni el mínimo ni lo elegido: lo que sale. La tarjeta y cada opción del
  // motor dicen la misma cifra, y el aviso del tope sigue.
  setRange('create-avatar-appearances', 5)
  await waitFor(() => same(window.patches.at(-1), { avatarAppearances: 5 }), 'cinco apariciones')
  setRange('create-avatar-seconds', AVATAR_MAX_APPEARANCE_SECONDS)
  await waitFor(() => same(window.patches.at(-1), { avatarSecondsPerAppearance: AVATAR_MAX_APPEARANCE_SECONDS }) && costCard().textContent.includes(totalSays(5, fiveCapped)), 'cinco apariciones de ' + AVATAR_MAX_APPEARANCE_SECONDS + ' s: ' + fiveCapped + ' s')
  check(costCard().textContent.includes(threeCostSays(fiveCapped)) && !costCard().textContent.includes(totalSays(5, fiveUncapped)), 'la tarjeta cobra ' + fiveCapped + ' s, no los ' + fiveUncapped + ' s de 5 × ' + AVATAR_MAX_APPEARANCE_SECONDS + ': ' + costCard().textContent)
  check(paragraphSays(threeSays.capped) && !paragraphSays(threeSays.minimum) && descriptionOf(threeBox()) === threeSays.capped, 'con 5 apariciones de ' + AVATAR_MAX_APPEARANCE_SECONDS + ' s sigue el aviso del tope y no el del mínimo')
  const expectedByEngine = Object.fromEntries(['avatar_v', 'avatar_iv', 'avatar_iii'].map((engine) => [engine, optionSays(engine, 'photo_avatar', fiveCapped)]))
  await waitFor(() => engineRadios().every((radio) => descriptionOf(radio) === expectedByEngine[radio.dataset.engine]), 'cada opción del motor dice el costo de los ' + fiveCapped + ' s')
  check(engineRadios().length === 3, 'las tres opciones del motor siguen la misma cuenta')

  // 1 aparición de 60 s: tres al tope. Salen los dos avisos y la casilla se
  // describe con los dos, en el orden en que se ven.
  setRange('create-avatar-appearances', 1)
  await waitFor(() => same(window.patches.at(-1), { avatarAppearances: 1 }) && costCard().textContent.includes(totalSays(3, earlyAtCap)), 'una aparición de ' + AVATAR_MAX_APPEARANCE_SECONDS + ' s: salen 3 y son ' + earlyAtCap + ' s')
  check(paragraphSays(threeSays.minimum) && paragraphSays(threeSays.capped) && costCard().textContent.includes(threeCostSays(earlyAtCap)), 'con 1 aparición de ' + AVATAR_MAX_APPEARANCE_SECONDS + ' s salen los dos avisos y el costo de ' + earlyAtCap + ' s')
  const bothIds = (threeBox().getAttribute('aria-describedby') ?? '').split(' ')
  check(bothIds.length === 2 && follows(document.getElementById(bothIds[0]), document.getElementById(bothIds[1])) && bothIds[0] === paragraphNamed(threeSays.minimum).id && bothIds[1] === paragraphNamed(threeSays.capped).id && descriptionOf(threeBox()) === threeSays.minimum + ' | ' + threeSays.capped, 'los dos avisos describen a la casilla, en el orden en que se ven: ' + descriptionOf(threeBox()))

  // 16k-e. Desmarcarla manda { avatarThreeInTwoMinutes: false }, apaga los dos
  // avisos y su descripción aunque el control siga en 1 × 60 s, y la tarjeta
  // vuelve a contar lo elegido (60 s en 1 aparición).
  threeBox().click()
  await waitFor(() => !threeBox().checked, 'desmarcar la casilla')
  check(same(window.patches.at(-1), { avatarThreeInTwoMinutes: false }), 'desmarcarla manda { avatarThreeInTwoMinutes: false }: ' + JSON.stringify(window.patches.at(-1)))
  check(!paragraphSays(threeSays.minimum) && !paragraphSays(threeSays.capped) && !threeBox().hasAttribute('aria-describedby') && costCard().textContent.includes(totalSays(1, AVATAR_MAX_APPEARANCE_SECONDS)) && costCard().textContent.includes(threeCostSays(AVATAR_MAX_APPEARANCE_SECONDS)), 'apagada otra vez no hay avisos ni descripción y la tarjeta cuenta lo elegido: ' + costCard().textContent)

  // 16k-f. Deshabilitada (la demo): se ve marcada, no responde y sigue diciendo
  // lo que cambia; con el avatar apagado la casilla no está.
  mount(engineFixture, { ...CREATE_FORM_INITIAL_VALUE, useAvatar: true, avatar: MIA_CHOICE, avatarAppearances: 1, avatarThreeInTwoMinutes: true }, true)
  await waitFor(() => toggle()?.disabled && named(avatarRadios(), 'Mia') && threeBox(), 'deshabilitada con la casilla marcada')
  check(threeBox().disabled && threeBox().checked && paragraphSays(threeSays.minimum) && descriptionOf(threeBox()) === threeSays.minimum, 'deshabilitada: la casilla se ve marcada y no responde, y sigue diciendo lo que cambia, también como su descripción')
  threeBox().click()
  await delay(100)
  check(window.patches.length === 0 && threeBox().checked, 'deshabilitada no parchea nada')
  mount(engineFixture, { ...CREATE_FORM_INITIAL_VALUE, useAvatar: false })
  await waitFor(() => toggle() && !toggle().disabled && window.listCalls > 0, 'la tarjeta con el avatar apagado')
  await delay(100)
  check(!threeBox() && !startBox() && !threeHelp(), 'con el avatar apagado no está ninguna de las casillas ni la ayuda')
  // Encendida pero sin un avatar elegido (el que se mira no tiene look para el
  // formato) las casillas siguen ahí, las dos juntas, como «Empieza con el
  // avatar» de siempre.
  mount(engineFixture, { ...CREATE_FORM_INITIAL_VALUE, useAvatar: true, avatar: null })
  await waitFor(() => startBox() && threeBox() && threeHelp(), 'sin un avatar elegido siguen las dos casillas y la ayuda')
  check(follows(startBox(), threeBox()) && engineRadios().length === 0, 'sin avatar elegido no hay grupo «Motor», pero la casilla va debajo de «Empieza con el avatar»')

  // 16k-g. CheckboxRow solo (los demás usos —personajes presentes, música
  // instrumental— no pasan ids): sin describedBy, o con uno vacío, no pone el
  // atributo; con ids los pasa tal cual al input y no a la etiqueta.
  reactRoot.render(<div id="checkbox-rows"><CheckboxRow label="Sin ids" checked={false} onChange={() => {}} /><CheckboxRow label="Ids vacíos" checked={false} describedBy="" onChange={() => {}} /><CheckboxRow label="Con ids" checked describedBy="uno dos" onChange={() => {}} /></div>)
  await waitFor(() => document.querySelectorAll('#checkbox-rows input').length === 3, 'tres casillas sueltas')
  const [plainBox, emptyBox, describedBox] = [...document.querySelectorAll('#checkbox-rows input')]
  check(!plainBox.hasAttribute('aria-describedby') && !emptyBox.hasAttribute('aria-describedby'), 'sin describedBy, o con uno vacío, la casilla no pone aria-describedby')
  check(describedBox.getAttribute('aria-describedby') === 'uno dos' && !describedBox.closest('label').hasAttribute('aria-describedby') && describedBox.closest('label').textContent === 'Con ids', 'con describedBy lo pasa tal cual al input, no a la etiqueta, y el nombre sigue siendo solo la etiqueta')

  // 16l. Avatar V sin gemelo digital (entrega 2f, R-2f-1). La elección que arma
  // la biblioteca trae motionReference: un avatar propio de foto sin ningún look
  // de gemelo digital no tiene con qué moverse con V (el proveedor rechaza el
  // prompt): «Movimiento más expresivo» queda apagado con el motivo, sin la línea
  // del movimiento automático, y la preferencia de la persona no se toca. Nia
  // (propia, de foto, con un gemelo digital en su grupo) y Dante (de stock) sí
  // tienen con qué; Zoe es propia con un look de estudio, que se referencia a
  // sí mismo.
  const NIA = avatar('nia-8', 'Nia', 'own', 'look-nia', [look('look-nia', 'Nia foto', 'photo_avatar', 'landscape', ALL_ENGINES), look('look-nia-gemelo', 'Nia gemelo', 'digital_twin', 'landscape', ALL_ENGINES)])
  const DANTE = avatar('dante-9', 'Dante', 'stock', 'look-dante', [look('look-dante', 'Dante foto', 'photo_avatar', 'landscape', ALL_ENGINES)])
  const ZOE = avatar('zoe-10', 'Zoe', 'own', 'look-zoe', [look('look-zoe', 'Zoe estudio', 'studio_avatar', 'landscape', ALL_ENGINES)])
  const NIA_CHOICE = { id: 'nia-8', name: 'Nia', lookId: 'look-nia', lookName: 'Nia foto', lookType: 'photo_avatar', supportedEngines: ALL_ENGINES, motionReference: true }
  const DANTE_CHOICE = { id: 'dante-9', name: 'Dante', lookId: 'look-dante', lookName: 'Dante foto', lookType: 'photo_avatar', supportedEngines: ALL_ENGINES, motionReference: true }
  const ZOE_CHOICE = { id: 'zoe-10', name: 'Zoe', lookId: 'look-zoe', lookName: 'Zoe estudio', lookType: 'studio_avatar', supportedEngines: ALL_ENGINES, motionReference: false }
  const referenceFixture = { avatars: [MIA, NIA, DANTE, ZOE], balance: USD, keys: ['heygen'] }
  const noReference = phrase('create.avatar.expressiveNoReference')
  const motionAutoLine = phrase('create.avatar.motionAuto')
  const unavailableForV = phrase('create.avatar.expressiveUnavailable', { engine: engineLabel('avatar_v') })
  check(noReference !== unavailableForV && !/hey[\s-]*gen/i.test(noReference), 'el motivo es su propia frase y no nombra al proveedor: ' + noReference)
  // El interruptor ofrecido y prendido (la línea del movimiento automático a la
  // vista), o apagado con el motivo de V sin gemelo (y sin esa línea).
  const expressiveOffered = () => expressiveSwitch() && !expressiveSwitch().disabled && expressiveSwitch().getAttribute('aria-checked') === 'true' && text().includes(motionAutoLine) && !paragraphSays(noReference)
  const expressiveBlocked = () => expressiveSwitch()?.disabled && expressiveSwitch().getAttribute('aria-checked') === 'false' && paragraphSays(noReference) && descriptionOf(expressiveSwitch()) === noReference && !text().includes(motionAutoLine) && !text().includes(unavailableForV)

  // 16l-a. Mia (propia, de foto, sin gemelo) con V y «más expresivo» prendido en
  // el formulario: apagado con el motivo; nada se parchea ni se pierde.
  mount(referenceFixture, { ...CREATE_FORM_INITIAL_VALUE, useAvatar: true, avatar: MIA_CHOICE, avatarEngine: 'avatar_v', avatarExpressive: true })
  await waitFor(() => named(avatarRadios(), 'Mia') && isChecked(engineRadio('avatar_v')) && expressiveSwitch(), 'Mia con V: el interruptor de «más expresivo»')
  check(expressiveBlocked(), 'Mia con V: «más expresivo» apagado y deshabilitado, con el motivo de que su avatar no tiene un gemelo digital como descripción y sin la línea del movimiento automático')
  check(follows(engineGroup(), expressiveSwitch()), 'el interruptor sigue yendo después del grupo «Motor»')
  expressiveSwitch().click()
  await delay(100)
  check(window.patches.length === 0 && window.value.avatarExpressive === true && window.value.avatarEngine === 'avatar_v', 'tocarlo no parchea nada y el formulario conserva lo que eligió la persona (V y «más expresivo» prendido)')

  // 16l-b. Con IV el mismo look sí se mueve: el interruptor vuelve prendido y
  // con la línea; con V, otra vez el motivo (se deriva al dibujar).
  engineRadio('avatar_iv').click()
  await waitFor(() => isChecked(engineRadio('avatar_iv')) && expressiveOffered(), 'con IV, el look de Mia admite «más expresivo»')
  engineRadio('avatar_v').click()
  await waitFor(() => isChecked(engineRadio('avatar_v')) && expressiveBlocked(), 'de vuelta en V, otra vez el motivo')
  check(same(window.patches, [{ avatarEngine: 'avatar_iv' }, { avatarEngine: 'avatar_v' }]), 'solo se parchearon los dos cambios de motor: ' + JSON.stringify(window.patches))

  // 16l-c. Elegir otro avatar desde la fila trae motionReference de la
  // biblioteca (selectedAvatarFrom): Nia y Dante la tienen, Zoe no la tiene
  // pero su look de estudio se mueve igual, y volver a Mia lo apaga de nuevo.
  const motionAfter = async (name, choice, expectation, description) => {
    named(avatarRadios(), name).click()
    await waitFor(() => same(window.patches.at(-1), { avatar: choice }), 'elegir a ' + name)
    await waitFor(() => expectation(), description)
  }
  await motionAfter('Nia', NIA_CHOICE, expressiveOffered, 'Nia (propia, de foto, con un gemelo digital en su grupo) con V: «más expresivo» disponible y prendido')
  await motionAfter('Dante', DANTE_CHOICE, expressiveOffered, 'Dante (de stock) con V: «más expresivo» disponible, sin aviso')
  await motionAfter('Zoe', ZOE_CHOICE, expressiveOffered, 'Zoe (propia, con un look de estudio y sin gemelo) con V: disponible, porque un look de video se referencia a sí mismo')
  await motionAfter('Mia', MIA_CHOICE, expressiveBlocked, 'volver a Mia con V: apagado con el motivo')
  check(window.value.avatarExpressive === true && window.value.avatarEngine === 'avatar_v', 'cambiar de avatar no tocó el motor ni «más expresivo»')

  // 16l-d. Un borrador de antes de la 2f no trae el campo: cuenta como que sí.
  const MIA_DRAFT = { ...MIA_CHOICE }
  delete MIA_DRAFT.motionReference
  mount(referenceFixture, { ...CREATE_FORM_INITIAL_VALUE, useAvatar: true, avatar: MIA_DRAFT, avatarEngine: 'avatar_v', avatarExpressive: true })
  await waitFor(() => named(avatarRadios(), 'Mia') && isChecked(engineRadio('avatar_v')) && expressiveSwitch(), 'Mia sin el campo, con V')
  await waitFor(() => expressiveOffered(), 'sin motionReference el interruptor se ofrece, prendido y sin aviso')

  // 17. La pausa de escenas cobra con el motor del proyecto (entrega 2e,
  // R-2e-12): el store real de Crear copia el motor de las opciones de corrida
  // (avatarRunOptions) a la tarea y a la pausa, y la pausa en vivo (el diálogo
  // de cantidad y el paso de segundos, dentro de la pantalla de progreso) y la
  // rearmada desde el disco (LibraryProgress, sin tarea viva) se lo pasan a la
  // nota de los tramos. Sin motor —una tarea guardada antes de la 2e—, la
  // tarifa de Avatar III. Tres tramos de 10 s de un look de foto: IV ≈ 1,16 y
  // III ≈ 0,50.
  const probe = {}
  function Probe() {
    const api = useCreateTask()
    probe.api = api
    probe.task = api.task
    return null
  }
  const emitPipeline = (event) => window.emitPipelineEvent(event)
  const pauseCost = (amount) => phrase('create.confirmScenes.avatarCost', { amount: formatUsd(amount, 'es') })
  const ivCost = pauseCost(avatarUsd('photo_avatar', 30, 'avatar_iv'))
  const iiiCost = pauseCost(avatarUsd('photo_avatar', 30))
  check(avatarUsd('photo_avatar', 30, 'avatar_iv') === 1.155 && avatarUsd('photo_avatar', 30) === 0.495 && ivCost !== iiiCost, 'tres tramos de 10 s de un look de foto: IV 1,155 y III 0,495')
  const projectAvatar = (engine) => ({ avatarId: 'ana-1', lookId: 'look-ana', lookName: 'Ana oficina', lookType: 'photo_avatar', engine, appearances: 3, secondsPerAppearance: 10, startWithAvatar: true, placement: 'auto' })
  // La pantalla de progreso de la biblioteca de un proyecto, con el store real.
  const showProgress = (projectId) => reactRoot.render(<QueryClientProvider key={++revision} client={freshClient()}><I18nextProvider i18n={i18n}><TooltipProvider><Probe /><MemoryRouter initialEntries={['/library/' + projectId + '/progress']}><Routes><Route path="/library/:projectId/progress" element={<LibraryProgress />} /></Routes></MemoryRouter></TooltipProvider></I18nextProvider></QueryClientProvider>)
  // El diálogo de cantidad es una capa propia (framer-motion, sin
  // role="dialog"): se lo reconoce por su título.
  const countTitle = phrase('create.confirmScenes.title')
  const countDialogSays = (cost) => [...document.querySelectorAll('h2')].some((heading) => heading.textContent === countTitle && heading.parentElement?.textContent.includes(cost))
  const countDialogOpen = () => [...document.querySelectorAll('h2')].some((heading) => heading.textContent === countTitle)
  // Un job que pausa en la confirmación de escenas con los tramos del avatar.
  const pauseJob = async (projectId, runOptions, extra = {}) => {
    await probe.api.startPipelineForProject(projectId, 'Pausa ' + projectId, runOptions)
    await waitFor(() => probe.task?.projectId === projectId && probe.task.status === 'generating', 'arranca el job de ' + projectId)
    emitPipeline({ type: 'awaiting-scene-confirmation', suggestedScenes: 18, audioDurationSeconds: 150, wordCount: 320, avatarSpans: threeSpans, ...extra })
    emitPipeline({ type: 'job-completed', result: { status: 'awaiting-confirmation' } })
    await waitFor(() => probe.task.status === 'awaitingConfirmation', 'la pausa de ' + projectId)
  }
  window.projectStatuses = {}
  reactRoot.render(<QueryClientProvider key={++revision} client={freshClient()}><I18nextProvider i18n={i18n}><Probe /></I18nextProvider></QueryClientProvider>)
  await waitFor(() => probe.api, 'el store de Crear monta')

  // 17a. En vivo, el diálogo de cantidad: un proyecto de IV con un look de foto.
  await pauseJob('p-iv', avatarRunOptions(projectAvatar('avatar_iv')))
  check(probe.task.avatarEngine === 'avatar_iv' && probe.task.confirmation.avatarEngine === 'avatar_iv' && probe.task.confirmation.avatarLookType === 'photo_avatar', 'el store copia el motor del proyecto a la tarea y a la pausa: ' + JSON.stringify({ task: probe.task.avatarEngine, pause: probe.task.confirmation.avatarEngine }))
  showProgress('p-iv')
  await waitFor(() => countDialogSays(ivCost), 'la pausa en vivo de un proyecto de IV cobra los tramos a la tarifa de IV')
  check(!text().includes(iiiCost), 'y no a la de Avatar III')

  // 17b. En vivo, el paso de segundos (el carril de un estilo propio).
  await pauseJob('p-iv-seconds', avatarRunOptions(projectAvatar('avatar_iv')), { secondsPerScene: 3 })
  showProgress('p-iv-seconds')
  const sliderAria = phrase('create.secondsStep.sliderAria')
  const secondsSlider = () => document.querySelector('input[type=range][aria-label="' + sliderAria + '"]')
  await waitFor(() => secondsSlider() && !countDialogOpen() && text().includes(ivCost), 'el paso de segundos de un proyecto de IV también cobra a la tarifa de IV')
  check(!text().includes(iiiCost), 'el paso de segundos va en la pantalla, sin el diálogo de cantidad, y no cobra a la tarifa de III')

  // 17c. Sin motor (una tarea guardada antes de la 2e, o unas opciones sin
  // él): la tarifa de Avatar III, como siempre.
  await pauseJob('p-old', { hasAvatar: true, avatarLookType: 'photo_avatar' })
  check(probe.task.avatarEngine === undefined && probe.task.confirmation.avatarEngine === undefined, 'sin motor en las opciones, ni la tarea ni la pausa inventan uno')
  showProgress('p-old')
  await waitFor(() => countDialogSays(iiiCost), 'la pausa sin motor cobra a la tarifa de Avatar III')
  check(!text().includes(ivCost), 'y no a la de IV')

  // 17d. Rearmada desde el disco (tras reiniciar, sin tarea viva): el motor
  // sale de project.json, como el tipo de look.
  const pausedOnDisk = (name, engine) => ({ metadata: { id: name, name, state: 'awaiting-confirmation', completedStages: ['voice', 'transcription'], audioDurationSeconds: 150, sceneCount: 18, wordCount: 320, options: { videoFormat: '16:9', imageProvider: 'fal', avatar: projectAvatar(engine) } }, scenes: [], avatarSpans: threeSpans, avatarDropped: 0 })
  window.projectStatuses = { 'd-iv': pausedOnDisk('Pausa IV en disco', 'avatar_iv'), 'd-iii': pausedOnDisk('Pausa III en disco', 'avatar_iii') }
  probe.api.discardTask()
  await waitFor(() => probe.task === null, 'sin tarea viva')
  showProgress('d-iv')
  await waitFor(() => text().includes('Pausa IV en disco') && countDialogSays(ivCost), 'la pausa rearmada del disco de un proyecto de IV cobra a la tarifa de IV')
  check(!text().includes(iiiCost), 'y no a la de Avatar III')
  showProgress('d-iii')
  await waitFor(() => text().includes('Pausa III en disco') && countDialogSays(iiiCost), 'la de un proyecto de Avatar III, a la de III')
  check(!text().includes(ivCost), 'sin restos de la tarifa de IV')

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
      for (const { id, key, modifiers = 0 } of keys) {
        const { text, ...codes } = KEYS[key]
        await send('Input.dispatchKeyEvent', {
          type: 'keyDown',
          key,
          modifiers,
          ...codes,
          ...(text ? { text, unmodifiedText: text } : {}),
        })
        await send('Input.dispatchKeyEvent', {
          type: 'keyUp',
          key,
          modifiers,
          ...codes,
        })
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
