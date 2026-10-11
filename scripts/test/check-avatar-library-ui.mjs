// La biblioteca de avatares de las entregas 2b y 2c (design.md §12.2, §18 y
// §19; plan-e2b WP-C y plan-e2c WP-G) con sus componentes y hooks reales en
// Chrome headless, y HeyGen
// simulado: `avatarsApi` es el real con las lecturas y escrituras del sidecar
// y del store reemplazadas por un doble en memoria (grupos en dos páginas,
// looks por grupo, la clasificación por tipo, favoritos, altas y cambios de
// look principal), así ningún escenario habla con HeyGen, con el llavero ni
// con la red. `useHeyGenAccess` corre real, con la clave de HeyGen guardada en
// el doble de `apiKeysApi`. Los medios son archivos locales: un mp4 de 2 s con
// sonido generado con el ffmpeg del repo (el reproductor lo carga y lo
// reproduce de verdad) y rutas que no existen para las vistas previas que no
// hace falta decodificar. Las teclas y algunos clics son de verdad (CDP, desde
// Node): la página los pide por una cola y espera. Fija:
// - las categorías del stock público: Profesional, Estilo de vida y Comunidad
//   filtran por la clasificación de `avatar-stock-types`; mientras llega, la
//   grilla dice «Clasificando…» y no pide páginas; si falla o llega vacía, lo
//   dice y esas categorías muestran todo; una vacía se vuelve a pedir al
//   reabrir el stock («Clasificando…» mientras tanto) y, con grupos, filtra;
//   «Mis avatares» no tiene categorías ni corazones;
// - los favoritos: el corazón (etiqueta fija, estado en `aria-pressed`)
//   escribe la lista entera, de a una escritura y en orden; «Favoritos» los
//   muestra; nunca se escribe en lo guardado por cuenta propia: un id que el
//   listado no trae solo no se muestra (un listado que corta en la página 1
//   no escribe nada), por la sesión deja de buscarse solo y se muestra si una
//   lectura posterior lo trae; «Mis avatares» completo no cuenta como
//   recorrido del stock; mientras se lee lo guardado, el corazón está
//   deshabilitado (`aria-disabled`) y no cambia nada; si guardar falla, avisa
//   y relee el store (el corazón vuelve); si leer falla, avisa y el corazón
//   vuelve a leer antes de guardar; «Favoritos» vacío lo dice sin recorrer el
//   stock; y quitar uno con el teclado desde «Favoritos» deja el foco en el
//   corazón de la tarjeta vecina (la siguiente o la anterior) o en el chip,
//   nunca en la caja del diálogo (con el mouse no lo mueve);
// - la auto-carga: con un filtro que deja pocas tarjetas, la página siguiente
//   se pide sola con su token (sin tocar «Cargar más»), con «Buscando más…»
//   al pie; sin filtro, «Cargar más»; tras un error, no insiste;
// - el video al pasar el mouse: cruzar tarjetas sin detenerse no pide nada (ni
//   moverse encima); con el mouse quieto HOVER_FETCH_DELAY_MS o el foco del
//   teclado, un grupo sin video pide sus looks (con un velo mientras llegan) y
//   reproduce el del look de portada; salir con Tab de la tarjeta mientras
//   llegan deja el foco en el control siguiente (el velo se apaga sin salir
//   del DOM); uno con video de grupo no pide nada; en
//   la tarjeta de la biblioteca, cada imagen reproduce el de su look (solo la
//   que está bajo el mouse), el foco del teclado en el nombre el de la
//   principal y el foco que vuelve tras un clic no activa nada; quitar va en la
//   fila del nombre;
// - el reproductor de un look (LookPlayerDialog): se abre con un clic en la
//   ficha (el pie del segundo nivel ya no ofrece ningún botón para agregar),
//   muestra el nombre y el `<video>` con su `src`, sin `autoplay` y con
//   sonido; `play()` solo sale de un clic o de una tecla de la persona (nunca
//   de un efecto) y las vistas previas al pasar el mouse siguen mudas;
//   silenciar, la velocidad (1 → 1,5 → 2 → 0,5 → 1), la línea de tiempo, las
//   flechas ±5 s y Enter sobre el escenario; sin video (o con una URL vacía),
//   el aviso y ningún control; un video que no carga lo dice; si cambia el
//   video, el reproductor empieza de cero y el foco sigue en él; en el stock,
//   «Cargar a la biblioteca» agrega el avatar con ese look como principal y
//   abre su panel (mientras carga no se cierra y el foco no sale del
//   reproductor; si falla, sigue abierto y el foco vuelve al botón); con el
//   avatar ya en la biblioteca, «Abrir en tu biblioteca»; un look sin Avatar
//   III lo dice y no ofrece botón; Escape cierra solo el reproductor y el foco
//   vuelve a la ficha (con el mouse también, sin activarla); en el panel de un
//   avatar, el reproductor espera la lista de HeyGen (no dice «sin video») y,
//   al llegar, el foco sigue en el escenario; «Usar como principal» llama a
//   `setMainLook` y cierra el reproductor (si falla, sigue abierto y el foco
//   vuelve al botón), y el principal lo dice sin botón;
// - eliminar de HeyGen (entrega 2c): el tacho solo en «Mis avatares», arriba a
//   la izquierda («Agregado» pasa a la derecha), con dos pasos y la
//   explicación como descripción accesible (armado, su nombre es el texto que
//   se ve y lo describen el avatar y la explicación; lo confirma el árbol de
//   accesibilidad de Chrome, también en reposo y eliminando); salir de la tarjeta, sacarle el
//   foco o tocarla cancela (el foco nunca rebota a la caja del diálogo); el
//   segundo clic de un doble clic no confirma, ni Enter o Espacio sostenidos
//   (sus repeticiones automáticas; las dos cosas, también en «Quitar» de la
//   tarjeta y del panel de la biblioteca); con el borrado en vuelo el diálogo
//   no se cierra (Escape, clic afuera ni la X); confirmar pide
//   `deleteFromHeyGen` con el `groupId` y el nombre (solo para el log de
//   soporte), apaga la tarjeta («Eliminando…», `aria-busy`) y no deja agregar
//   ni arrancar otro borrado; al lograrlo,
//   avisa, la tarjeta sale, se releen los avatares de la cuenta y se marca
//   vieja la lista de la biblioteca, y el foco del teclado va al tacho vecino
//   (el siguiente o el anterior) o a la pestaña «Mis avatares» (con el mouse
//   no se mueve); si falla, avisa con el error y la tarjeta vuelve con el foco
//   en su tacho;
// - el formato de los looks: las fichas del segundo nivel del stock, las del
//   panel de un avatar (con las medidas del listado de HeyGen cuando la
//   biblioteca no guarda la orientación) y el reproductor dicen 16:9, 9:16,
//   1:1, 4:5 o 5:4 («Formato …» para el lector de pantalla) en lugar de
//   «Vertical»/«Horizontal»/«Cuadrado»; sin orientación ni medidas, sin chip;
// - `coverLookVideoUrl` (pura, en Node): portada coincidente, sin
//   coincidencia, sin videos y sin portada.
// Los simulacros parten del real (ERRORES-CONOCIDOS: simulacro-de-hook-en-un-
// guard-queda-viejo-en-silencio-cuando-el-hook-suma-un-miembro), la raíz
// guarda `onUncaughtError` para que un render roto falle con su mensaje, y
// Chrome corre con la emulación de foco (ERRORES-CONOCIDOS: cdp-sin-emulacion-
// de-foco-element-focus-no-dispara-los-eventos-focus).
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { coverLookVideoUrl } from '../../src/modules/avatars/utilities/coverLookVideo.ts'
import { executableSuffix, targetTriple } from '../target-triple.mjs'
import { withChrome } from './chrome-session.mjs'

const chrome =
  process.argv[2] ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const triple = targetTriple()
// El mismo binario que Rust inyecta en `binaryPaths.ffmpeg` (ADR-0026).
const ffmpeg = fileURLToPath(
  new URL(
    `../../src-tauri/binaries/ffmpeg-${triple}${executableSuffix(triple)}`,
    import.meta.url,
  ),
)

const mocks = {
  '@/modules/avatars/api': [
    "import { avatarsApi as real } from './src/modules/avatars/api/index.ts'",
    'export const avatarsApi = { ...real, isNative: () => true, list: () => window.api.list(), listStockGroups: (payload) => window.api.listStockGroups(payload), listStockLooks: (payload) => window.api.listStockLooks(payload), listStockTypes: (payload) => window.api.listStockTypes(payload), readStockFavorites: () => window.api.readStockFavorites(), writeStockFavorites: (ids) => window.api.writeStockFavorites(ids), addAvatar: (payload) => window.api.addAvatar(payload), setMainLook: (payload) => window.api.setMainLook(payload), refresh: (id) => window.api.refresh(id), balance: () => window.api.balance(), deleteFromHeyGen: (payload) => window.api.deleteFromHeyGen(payload), imageSource: (path) => "fixture-image:" + path }',
  ].join('\n'),
  '@/modules/api-keys/api': [
    "import { apiKeysApi as real } from './src/modules/api-keys/api/index.ts'",
    'export const apiKeysApi = { ...real, isNative: () => true, async getStatus() { return [{ providerId: "heygen", configured: true, source: "manual", maskedKey: "••••", savedAt: 0, lastValidatedAt: null }] } }',
  ].join('\n'),
}

const entry = String.raw`
import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router'
import es from './public/locales/es.json'
import { AvatarDetailDialog } from '@/modules/avatars/components/AvatarDetailDialog'
import { AvatarCard } from '@/modules/avatars/components/AvatarCard'
import { LookPlayerDialog } from '@/modules/avatars/components/LookPlayerDialog'
import { StockGroupCard } from '@/modules/avatars/components/StockGroupCard'
import { StockLooksDialog } from '@/modules/avatars/components/StockLooksDialog'
import { useToast } from '@/modules/common/hooks/useToast'

await i18n.init({ lng: 'es', resources: { es: { translation: es } }, interpolation: { escapeValue: false } })
const tr = (key, options) => i18n.t(key, options)

// ─── Infraestructura ───
let renderError
let checks = 0
const check = (condition, message) => { if (!condition) throw new Error(message); checks += 1 }
const delay = (ms = 30) => new Promise((done) => setTimeout(done, ms))
async function waitFor(get, message, tries = 150) {
  for (let index = 0; index < tries; index++) { if (renderError) throw renderError; const value = get(); if (value) return value; await delay() }
  throw new Error('timeout: ' + message)
}
// Una promesa que el escenario resuelve o rechaza a mano.
function gate() {
  let resolve, reject
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail })
  return { promise, resolve, reject }
}
// Teclas y clics de verdad (CDP, desde Node): el escenario los pide y espera.
let nextInput = 0
window.inputQueue = []
window.inputDone = new Set()
function input(request) {
  const id = ++nextInput
  window.inputQueue.push({ id, ...request })
  return waitFor(() => window.inputDone.has(id), 'entrada ' + request.type, 300)
}
const pressKey = (key) => input({ type: 'key', key })
// La tecla sostenida: el keyDown, dos repeticiones automáticas y el keyUp.
const holdKey = (key) => input({ type: 'keyHold', key })
// Un clic de verdad sobre un elemento (sin CSS, el elemento está en el flujo).
// Con clickCount 2 es el segundo clic de un doble clic (su detail es 2).
function clickOn(element, clickCount = 1) {
  element.scrollIntoView({ block: 'center' })
  const rect = element.getBoundingClientRect()
  return input({ type: 'click', x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, clickCount })
}
// Los medios: quién llamó a play() (y desde qué evento) y quién a pause().
const originalPlay = HTMLMediaElement.prototype.play
HTMLMediaElement.prototype.play = function () {
  window.playElements.push(this)
  window.playCalls.push({ src: this.getAttribute('src'), muted: this.muted, loop: this.loop, event: window.event ? window.event.type : null })
  return originalPlay.call(this)
}
const reactRoot = createRoot(document.getElementById('root'), { onUncaughtError: (error) => { renderError = error } })
let revision = 0
// Los avisos (toasts) del módulo: cada uno nuevo, una vez, en window.toastLog.
window.toastIds = new Set()
function ToastProbe() {
  const { toasts } = useToast()
  React.useEffect(() => {
    for (const item of toasts) {
      if (item.open === false || window.toastIds.has(item.id)) continue
      window.toastIds.add(item.id)
      window.toastLog.push(item.description)
    }
  }, [toasts])
  return null
}
// Monta con caché propia; con un cliente dado, reusa su caché (cerrar y
// reabrir el diálogo dentro de la misma sesión de la app).
function mount(element, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  window.playCalls = []
  window.playElements = []
  window.toastLog = []
  reactRoot.render(<QueryClientProvider key={++revision} client={client}><I18nextProvider i18n={i18n}><MemoryRouter><ToastProbe />{element}</MemoryRouter></I18nextProvider></QueryClientProvider>)
  return client
}
// Desmonta y espera a que el DOM quede limpio: render no es síncrono, y un
// escenario que arranca enseguida encontraría los nodos del anterior.
async function unmount() {
  reactRoot.render(<p />)
  await waitFor(() => dialogs().length === 0 && !document.querySelector('[data-group-id], [data-look-id], [data-avatar-id]'), 'desmontar')
}
const text = () => document.body.textContent
const dialogs = () => [...document.querySelectorAll('[role=dialog]')]
const topDialog = () => dialogs().at(-1)
const buttonNamed = (label, root = document) => [...root.querySelectorAll('button')].find((button) => button.textContent.trim() === label)
const byLabel = (label, root = document) => [...root.querySelectorAll('[aria-label]')].find((element) => element.getAttribute('aria-label') === label)
const playerVideo = () => topDialog()?.querySelector('video')
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)
// El mouse entra o sale de un elemento (React arma onMouseEnter/onMouseLeave
// con mouseover/mouseout).
const hoverIn = (element) => element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }))
const hoverOut = (element) => element.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }))
const videoSrc = (root) => root?.querySelector('video')?.getAttribute('src')
// El velo que late sobre la vista previa mientras se busca su video: a la vista
// solo mientras late (montado o no, el banco no carga CSS).
const veilShown = (root) => root?.querySelector('[class~="bg-white/25"]')?.classList.contains('animate-pulse') ?? false
// Las tarjetas del primer nivel del stock, en orden, por su id de grupo.
const visibleGroupIds = () => [...document.querySelectorAll('[data-group-id]')].map((button) => button.dataset.groupId)
const chip = (groupLabelKey, labelKey) => buttonNamed(tr(labelKey), document.querySelector('[role=group][aria-label="' + tr(groupLabelKey) + '"]') ?? document.createElement('div'))
const categoryChip = (id) => chip('avatars.stock.categoriaAria', 'avatars.stock.categoria.' + id)
const heartOf = (name) => byLabel(tr('avatars.stock.favoritoAria', { name }))

// ─── El doble de HeyGen ───
const media = (name) => new URL('./' + name, location.href).href
const group = (groupId, name, gender, extra = {}) => ({ groupId, name, gender, previewImageUrl: 'media/' + groupId + '.png', looksCount: 3, ...extra })
const look = (lookId, name, extra = {}) => ({ lookId, name, lookType: 'studio_avatar', groupId: 'g-dante', previewImageUrl: 'media/' + lookId + '.png', supportedEngines: ['avatar_iii'], preferredOrientation: 'landscape', ...extra })
const PAGE_1 = [group('g-dante', 'Dante', 'male'), group('g-brody', 'Brody', 'male', { previewVideoUrl: 'media/brody.mp4' }), group('g-ana', 'Ana', 'female', { previewVideoUrl: 'media/ana.mp4' }), group('g-luz', 'Luz', 'female', { previewVideoUrl: 'media/luz.mp4' })]
const PAGE_2 = [group('g-teo', 'Teo', 'male', { previewVideoUrl: 'media/teo.mp4' }), group('g-vic', 'Vic', 'female', { previewVideoUrl: 'media/vic.mp4' }), group('g-zoe', 'Zoe', 'female', { previewVideoUrl: 'media/zoe.mp4' })]
// Dante no trae video de grupo: su look de portada (misma imagen que el grupo)
// tiene el mp4 de verdad.
const DANTE_LOOKS = [look('l-dante-1', 'Dante cocina', { previewVideoUrl: 'media/l-dante-1.mp4' }), look('l-dante-cover', 'Dante oficina', { previewImageUrl: 'media/g-dante.png', previewVideoUrl: media('look.mp4') }), look('l-dante-iv', 'Dante sin motor', { supportedEngines: ['avatar_iv'], previewVideoUrl: media('look.mp4') }), look('l-dante-novideo', 'Dante sin video'), look('l-dante-broken', 'Dante video roto', { previewVideoUrl: media('missing.mp4') })]
const TYPES = { studioGroupIds: ['g-dante', 'g-luz', 'g-vic'], twinGroupIds: ['g-brody', 'g-teo'], fetchedAt: '2026-10-11T00:00:00Z', fromCache: true, truncated: false }

// Los avatares propios de la cuenta («Mis avatares», entrega 2c), con video de
// grupo: el foco del teclado en una tarjeta no pide sus looks.
const OWN = [group('g-mia', 'Mía', 'female', { previewVideoUrl: 'media/mia.mp4' }), group('g-leo', 'Leo', 'male', { previewVideoUrl: 'media/leo.mp4' }), group('g-sol', 'Sol', 'female', { previewVideoUrl: 'media/sol.mp4' })]

function fakeApi(overrides = {}) {
  const calls = { list: 0, groups: [], looks: [], types: 0, readFavorites: 0, writeFavorites: [], add: [], setMain: [], deleteHeyGen: [] }
  const api = {
    calls,
    avatars: [],
    favorites: [],
    privateGroups: structuredClone(OWN),
    looksByGroup: { 'g-dante': DANTE_LOOKS },
    async list() { calls.list += 1; return structuredClone(api.avatars) },
    async listStockGroups(payload) {
      calls.groups.push(payload)
      if (payload.ownership === 'private') return { groups: structuredClone(api.privateGroups), nextToken: null }
      if (payload.token === 'page-2') return { groups: structuredClone(PAGE_2), nextToken: null }
      return { groups: structuredClone(PAGE_1), nextToken: 'page-2' }
    },
    // Como HeyGen: el grupo borrado ya no sale en el listado de la cuenta.
    async deleteFromHeyGen(payload) {
      calls.deleteHeyGen.push(payload)
      api.privateGroups = api.privateGroups.filter((item) => item.groupId !== payload.groupId)
      return { groupId: payload.groupId, removedEntryIds: [] }
    },
    async listStockLooks(payload) {
      calls.looks.push(payload)
      return { looks: structuredClone(api.looksByGroup[payload.groupId] ?? []), nextToken: null }
    },
    async listStockTypes() { calls.types += 1; return structuredClone(TYPES) },
    async readStockFavorites() { calls.readFavorites += 1; return [...api.favorites] },
    async writeStockFavorites(ids) { calls.writeFavorites.push([...ids]); api.favorites = [...ids] },
    async addAvatar(payload) { calls.add.push(payload); return { id: 'lib-' + payload.groupId, groupId: payload.groupId } },
    async setMainLook(payload) { calls.setMain.push(payload); return { id: payload.id } },
    async refresh(id) { return structuredClone(api.avatars.find((item) => item.id === id)) },
    async balance() { return { available: true, remaining: 3, currency: 'usd' } },
    ...overrides,
  }
  window.api = api
  return api
}

// ─── Escenarios ───
const scenarios = []
const scenario = (name, run) => scenarios.push({ name, run })

async function openDanteLooks() {
  await waitFor(() => document.querySelector('[data-group-id="g-dante"]'), 'la tarjeta de Dante')
  document.querySelector('[data-group-id="g-dante"]').click()
  return waitFor(() => document.querySelector('[data-look-id="l-dante-cover"]'), 'los looks de Dante')
}

scenario('5a · reproductor del stock: abre, no arranca solo, suena con un clic y carga a la biblioteca', async () => {
  const api = fakeApi()
  const opened = []
  let closed = 0
  mount(<StockLooksDialog entries={[]} onOpenAvatar={(id) => opened.push(id)} onClose={() => { closed += 1 }} />)
  const card = await openDanteLooks()
  check(card.getAttribute('aria-label') === tr('avatars.stock.abrirLookAria', { name: 'Dante oficina' }), 'la ficha es un botón que nombra al look: ' + card.getAttribute('aria-label'))
  check(!card.hasAttribute('aria-pressed'), 'la ficha ya no se selecciona (sin aria-pressed)')
  // El pie del segundo nivel (el último hijo del nivel, debajo de la grilla
  // de looks): sin el avatar en la biblioteca, solo invita a abrir un look.
  const looksFooter = buttonNamed(tr('avatars.stock.volver')).parentElement.parentElement.lastElementChild
  check(looksFooter.querySelectorAll('button').length === 0, 'el pie ya no ofrece ningún botón para agregar: ' + looksFooter.outerHTML.slice(0, 160))
  check(looksFooter.textContent === tr('avatars.stock.elegirLook'), 'el pie invita a abrir un look: ' + looksFooter.textContent)
  card.click()
  await waitFor(() => dialogs().length === 2, 'el reproductor abre encima del stock')
  const player = topDialog()
  check(player.querySelector('h2')?.textContent === 'Dante oficina', 'el título es el nombre del look: ' + player.querySelector('h2')?.textContent)
  const video = playerVideo()
  check(video && video.getAttribute('src') === media('look.mp4'), 'el <video> lleva el video del look: ' + video?.getAttribute('src'))
  check(!video.autoplay && !video.hasAttribute('autoplay') && !video.loop, 'sin autoplay y sin loop')
  check(video.muted === false, 'el reproductor tiene sonido')
  check(video.getAttribute('preload') === 'metadata', 'preload=metadata')
  check(document.activeElement === byLabel(tr('avatars.stock.previewAria', { name: 'Dante oficina' }), player), 'al abrir, el foco va al escenario: ' + document.activeElement?.outerHTML.slice(0, 80))
  await waitFor(() => video.readyState >= 1, 'el video carga su duración')
  await delay(300)
  check(window.playCalls.every((call) => call.src !== media('look.mp4')), 'abrir no reproduce: ' + JSON.stringify(window.playCalls))
  check(player.textContent.includes('0:02'), 'la duración del video (0:02) en la barra')
  check(buttonNamed(tr('avatars.reproductor.cargar'), player), 'el botón dice «Cargar a la biblioteca»')
  byLabel(tr('common.player.play'), player).click()
  await waitFor(() => !video.paused, 'el botón grande reproduce')
  const playerCalls = window.playCalls.filter((call) => call.src === media('look.mp4'))
  check(playerCalls.length === 1 && playerCalls[0].event === 'click' && playerCalls[0].muted === false, 'play() con sonido y desde el clic: ' + JSON.stringify(playerCalls))
  await waitFor(() => byLabel(tr('common.player.pause'), player), 'la barra pasa a «Pausar»')
  check(document.activeElement === byLabel(tr('avatars.stock.previewAria', { name: 'Dante oficina' }), player), 'tras el botón grande, el foco queda en el escenario')
  await pressKey(' ')
  await waitFor(() => video.paused, 'Espacio en el escenario pausa')
  check(window.playCalls.every((call) => call.src !== media('look.mp4') || call.event === 'click' || call.event === 'keydown'), 'el reproductor nunca arranca fuera de un clic o una tecla: ' + JSON.stringify(window.playCalls))

  // Cargar: mientras trabaja no se cierra y el foco espera en el escenario.
  const pending = gate()
  api.addAvatar = (payload) => { api.calls.add.push(payload); return pending.promise }
  const load = buttonNamed(tr('avatars.reproductor.cargar'), player)
  load.focus()
  load.click()
  await waitFor(() => buttonNamed(tr('avatars.reproductor.cargando'), player)?.disabled, 'el botón pasa a «Cargando…» y se apaga')
  const payload = api.calls.add[0]
  check(payload.groupId === 'g-dante' && payload.ownership === 'stock' && payload.mainLookId === 'l-dante-cover', 'addAvatar con el grupo, el stock y el look como principal: ' + JSON.stringify(payload))
  check(byLabel(tr('avatars.reproductor.cerrar'), player).disabled, 'la X se apaga mientras carga')
  check(document.activeElement === byLabel(tr('avatars.stock.previewAria', { name: 'Dante oficina' }), player), 'el foco espera en el escenario mientras carga: ' + document.activeElement?.outerHTML.slice(0, 80))
  for (let index = 0; index < 4; index++) {
    await pressKey('Tab')
    check(player.contains(document.activeElement), 'con el botón y la X apagados, Tab no saca el foco del reproductor (vuelta ' + (index + 1) + '): ' + document.activeElement?.outerHTML.slice(0, 80))
  }
  await pressKey('Escape')
  await delay(150)
  check(dialogs().length === 2 && closed === 0, 'Escape no cierra nada mientras carga')
  pending.resolve({ id: 'lib-g-dante', groupId: 'g-dante' })
  await waitFor(() => opened.length === 1, 'al cargar, abre el avatar en la biblioteca')
  check(opened[0] === 'lib-g-dante', 'onOpenAvatar recibe la entrada nueva: ' + opened[0])
})

scenario('5b · reproductor del stock: si cargar falla sigue abierto y el foco vuelve al botón', async () => {
  const api = fakeApi()
  const opened = []
  mount(<StockLooksDialog entries={[]} onOpenAvatar={(id) => opened.push(id)} onClose={() => {}} />)
  ;(await openDanteLooks()).click()
  await waitFor(() => dialogs().length === 2, 'el reproductor abre')
  const player = topDialog()
  api.addAvatar = async (payload) => { api.calls.add.push(payload); throw new Error('sidecar caído') }
  const load = buttonNamed(tr('avatars.reproductor.cargar'), player)
  load.focus()
  load.click()
  await waitFor(() => api.calls.add.length === 1, 'pide el alta')
  await waitFor(() => !buttonNamed(tr('avatars.reproductor.cargar'), player)?.disabled, 'el botón vuelve')
  await delay(100)
  check(dialogs().length === 2 && opened.length === 0, 'el reproductor sigue abierto y no abre nada')
  check(document.activeElement === buttonNamed(tr('avatars.reproductor.cargar'), player), 'el foco vuelve a «Cargar a la biblioteca»: ' + document.activeElement?.outerHTML.slice(0, 80))
})

scenario('5c · reproductor del stock: con el avatar en la biblioteca, «Abrir en tu biblioteca»; sin Avatar III, el motivo y sin botón; Escape cierra solo el reproductor', async () => {
  fakeApi()
  const opened = []
  let closed = 0
  mount(<StockLooksDialog entries={[{ id: 'lib-dante', groupId: 'g-dante' }]} onOpenAvatar={(id) => opened.push(id)} onClose={() => { closed += 1 }} />)
  const card = await openDanteLooks()
  card.click()
  await waitFor(() => dialogs().length === 2, 'el reproductor abre')
  let player = topDialog()
  check(player.textContent.includes(tr('avatars.reproductor.yaEnBiblioteca')), 'dice que ya está en la biblioteca')
  check(!buttonNamed(tr('avatars.reproductor.cargar'), player), 'no ofrece cargarlo de nuevo')
  buttonNamed(tr('avatars.stock.abrirEnBiblioteca'), player).click()
  check(opened[0] === 'lib-dante', 'abre la entrada que ya estaba: ' + opened[0])

  // Escape: solo el reproductor; el foco vuelve a la ficha.
  await pressKey('Escape')
  await waitFor(() => dialogs().length === 1, 'Escape cierra el reproductor')
  check(closed === 0 && document.querySelector('[data-look-id="l-dante-cover"]'), 'el stock sigue abierto en los looks de Dante')
  await waitFor(() => document.activeElement === document.querySelector('[data-look-id="l-dante-cover"]'), 'el foco vuelve a la ficha que abrió el reproductor')

  // Con el mouse (un clic de verdad en la X) el foco también vuelve a la
  // ficha, pero no la activa: su video no arranca lejos del puntero.
  card.click()
  await waitFor(() => dialogs().length === 2, 'reabre el reproductor')
  const cardVideo = card.closest('article').querySelector('video')
  window.playElements = []
  await clickOn(byLabel(tr('avatars.reproductor.cerrar'), topDialog()))
  await input({ type: 'move', x: 0, y: 0 })
  await waitFor(() => dialogs().length === 1, 'la X cierra el reproductor')
  await waitFor(() => document.activeElement === card, 'el foco vuelve a la ficha también con el mouse')
  await delay(250)
  check(cardVideo && !window.playElements.includes(cardVideo), 'el foco que vuelve tras el mouse no activa la ficha')

  // Un look sin el motor de Vimo.
  await unmount()
  fakeApi()
  mount(<StockLooksDialog entries={[]} onOpenAvatar={() => {}} onClose={() => {}} />)
  await openDanteLooks()
  document.querySelector('[data-look-id="l-dante-iv"]').click()
  await waitFor(() => dialogs().length === 2, 'el reproductor del look sin motor')
  player = topDialog()
  check(player.textContent.includes(tr('avatars.reproductor.noCompatibleHint')), 'dice que no es compatible')
  check(player.textContent.includes(tr('avatars.tarjeta.noCompatible')), 'su chip «No compatible con Vimo»')
  const footerButtons = [...player.querySelectorAll('button')].filter((button) => [tr('avatars.reproductor.cargar'), tr('avatars.stock.abrirEnBiblioteca'), tr('avatars.detalle.usarPrincipal')].includes(button.textContent.trim()))
  check(footerButtons.length === 0, 'sin botón de acción')
})

const avatarLook = (lookId, name, extra = {}) => ({ lookId, name, lookType: 'photo_avatar', supportedEngines: ['avatar_iii'], preferredOrientation: 'landscape', status: 'ready', origin: 'heygen', previewPath: '/library/' + lookId + '.png', createdAt: '2026-10-09T00:00:00Z', ...extra })
const ANA = { id: 'ana-1', name: 'Ana', groupId: 'g-ana', ownership: 'stock', status: 'ready', mainLookId: 'la-main', looks: [avatarLook('la-main', 'Ana oficina'), avatarLook('la-cocina', 'Ana cocina'), avatarLook('la-iv', 'Ana sin motor', { supportedEngines: ['avatar_iv'] })], previewPath: '/library/ana.png', createdAt: '2026-10-09T00:00:00Z' }
const ANA_REMOTE = [look('la-main', 'Ana oficina', { groupId: 'g-ana', previewVideoUrl: media('look.mp4') }), look('la-cocina', 'Ana cocina', { groupId: 'g-ana', previewVideoUrl: media('look.mp4') }), look('la-iv', 'Ana sin motor', { groupId: 'g-ana', previewVideoUrl: media('look.mp4') })]


scenario('5d · reproductor: silenciar, velocidad, línea de tiempo, flechas y Enter sobre el escenario', async () => {
  fakeApi()
  mount(<StockLooksDialog entries={[]} onOpenAvatar={() => {}} onClose={() => {}} />)
  ;(await openDanteLooks()).click()
  await waitFor(() => dialogs().length === 2, 'el reproductor abre')
  const player = topDialog()
  const video = playerVideo()
  await waitFor(() => video.readyState >= 1 && video.duration > 1.9, 'el video carga su duración')
  const stage = byLabel(tr('avatars.stock.previewAria', { name: 'Dante oficina' }), player)

  // Silenciar y volver a activar el sonido.
  byLabel(tr('avatars.reproductor.silenciar'), player).click()
  await waitFor(() => video.muted && byLabel(tr('avatars.reproductor.activarSonido'), player), 'silencia y el botón pasa a «Activar el sonido»')
  byLabel(tr('avatars.reproductor.activarSonido'), player).click()
  await waitFor(() => !video.muted && byLabel(tr('avatars.reproductor.silenciar'), player), 'vuelve el sonido')

  // La velocidad recorre 1 → 1,5 → 2 → 0,5 → 1.
  const speed = (rate) => buttonNamed(tr('avatars.reproductor.velocidad', { rate }), player)
  check(speed('1'), 'arranca en «Velocidad: 1×»')
  for (const [label, rate] of [['1,5', 1.5], ['2', 2], ['0,5', 0.5], ['1', 1]]) {
    ;[...player.querySelectorAll('button')].find((button) => button.textContent.startsWith(tr('avatars.reproductor.velocidad', { rate: '' }).replace('×', ''))).click()
    await waitFor(() => speed(label) && video.playbackRate === rate, 'velocidad ' + label + ' (playbackRate ' + video.playbackRate + ')')
  }

  // La línea de tiempo lleva el video y el tiempo a la posición elegida.
  const timeline = byLabel(tr('common.player.position'), player)
  check(timeline.type === 'range' && timeline.max === String(video.duration) && timeline.step === '0.05', 'la línea de tiempo va de 0 a la duración, de a 0,05 s')
  setRange(timeline, 1)
  await waitFor(() => Math.abs(video.currentTime - 1) < 0.06, 'la línea de tiempo mueve el video (' + video.currentTime + ')')
  await waitFor(() => player.textContent.includes('0:01 / 0:02'), 'y el tiempo dice 0:01 / 0:02')

  // Con el foco en el escenario: flechas ±5 s (topan en los bordes) y Enter.
  stage.focus()
  await pressKey('ArrowRight')
  await waitFor(() => Math.abs(video.currentTime - video.duration) < 0.06, 'la flecha derecha salta adelante hasta el final (' + video.currentTime + ')')
  await pressKey('ArrowLeft')
  await waitFor(() => video.currentTime < 0.06, 'la izquierda salta atrás hasta el principio (' + video.currentTime + ')')
  window.playCalls = []
  await pressKey('Enter')
  await waitFor(() => !video.paused, 'Enter reproduce')
  check(window.playCalls.length === 1 && window.playCalls[0].event === 'keydown' && !window.playCalls[0].muted, 'desde la tecla y con sonido: ' + JSON.stringify(window.playCalls))
  await pressKey('Enter')
  await waitFor(() => video.paused, 'Enter otra vez pausa')
})

scenario('5e · reproductor: un look sin video lo dice y no ofrece controles; un video que no carga lo dice; una URL vacía no es un video', async () => {
  fakeApi()
  mount(<StockLooksDialog entries={[]} onOpenAvatar={() => {}} onClose={() => {}} />)
  await openDanteLooks()
  document.querySelector('[data-look-id="l-dante-novideo"]').click()
  await waitFor(() => dialogs().length === 2, 'el reproductor del look sin video')
  let player = topDialog()
  check(player.textContent.includes(tr('avatars.reproductor.sinVideo')) && !playerVideo(), 'dice que no tiene video y no hay <video>')
  check(!byLabel(tr('common.player.play'), player) && !byLabel(tr('common.player.position'), player), 'sin botón de reproducir ni línea de tiempo')
  check(byLabel(tr('avatars.stock.previewAria', { name: 'Dante sin video' }), player).tabIndex === -1, 'el escenario no queda en el orden del Tab')
  check(buttonNamed(tr('avatars.reproductor.cargar'), player), 'el look sirve: se puede cargar igual')
  await pressKey('Escape')
  await waitFor(() => dialogs().length === 1, 'cierra')

  document.querySelector('[data-look-id="l-dante-broken"]').click()
  await waitFor(() => dialogs().length === 2, 'el reproductor del video roto')
  player = topDialog()
  await waitFor(() => player.textContent.includes(tr('avatars.reproductor.errorVideo')), 'dice que el video no se pudo cargar')
  check(!byLabel(tr('common.player.play'), player) && !byLabel(tr('common.player.position'), player), 'y no deja un botón que no responde')
  await pressKey('Escape')
  await waitFor(() => dialogs().length === 1, 'cierra')

  await unmount()
  mount(<LookPlayerDialog look={DANTE_LOOKS[1]} videoUrl="" action={{ kind: 'main' }} onClose={() => {}} />)
  await waitFor(() => dialogs().length === 1, 'el reproductor con una URL vacía')
  check(topDialog().textContent.includes(tr('avatars.reproductor.sinVideo')) && !playerVideo() && !byLabel(tr('common.player.play'), topDialog()), 'una URL vacía es «sin video»: ni <video> ni controles')
})

// Un reproductor abierto cuyo video cambia (en el panel, la lista de HeyGen
// trae otra URL): el anfitrión la cambia desde el escenario.
function SwapVideoHost({ initialUrl }) {
  const [videoUrl, setVideoUrl] = React.useState(initialUrl)
  window.swapVideo = setVideoUrl
  return <LookPlayerDialog look={DANTE_LOOKS[1]} videoUrl={videoUrl} action={{ kind: 'main' }} onClose={() => {}} />
}

scenario('5f · reproductor: si cambia el video, empieza de cero (un video roto reemplazado por uno bueno ofrece sus controles) y el foco sigue en el escenario', async () => {
  fakeApi()
  mount(<SwapVideoHost initialUrl={media('missing.mp4')} />)
  await waitFor(() => topDialog()?.textContent.includes(tr('avatars.reproductor.errorVideo')), 'el video roto lo dice')
  const stageLabel = tr('avatars.stock.previewAria', { name: 'Dante oficina' })
  check(document.activeElement === byLabel(stageLabel, topDialog()), 'el foco está en el escenario')
  window.swapVideo(media('look.mp4'))
  await waitFor(() => playerVideo()?.getAttribute('src') === media('look.mp4') && byLabel(tr('common.player.play'), topDialog()), 'con el video nuevo, el botón de reproducir')
  check(!topDialog().textContent.includes(tr('avatars.reproductor.errorVideo')), 'sin el aviso del video anterior')
  await waitFor(() => playerVideo().readyState >= 1, 'el video nuevo carga')
  check(byLabel(tr('common.player.position'), topDialog()), 'y su línea de tiempo')
  await waitFor(() => document.activeElement === byLabel(stageLabel, topDialog()), 'el foco sigue en el escenario (el nuevo), no en la caja del diálogo: ' + document.activeElement?.outerHTML.slice(0, 80))
})
scenario('6b · panel del avatar: mientras la lista de HeyGen llega, el reproductor espera (no dice «sin video»); al llegar, el video, con el foco en el escenario', async () => {
  const api = fakeApi()
  api.avatars = [ANA]
  const remote = gate()
  api.listStockLooks = (payload) => { api.calls.looks.push(payload); return remote.promise.then(() => ({ looks: structuredClone(ANA_REMOTE), nextToken: null })) }
  mount(<AvatarDetailDialog avatar={ANA} onClose={() => {}} onRemove={() => {}} />)
  ;(await waitFor(() => document.querySelector('[data-look-id="la-cocina"]'), 'la ficha de la cocina')).click()
  await waitFor(() => dialogs().length === 2, 'el reproductor abre antes de que llegue la lista')
  const stageLabel = tr('avatars.stock.previewAria', { name: 'Ana cocina' })
  const waiting = [...topDialog().querySelectorAll('[role=status]')].find((element) => element.textContent === tr('avatars.reproductor.cargando'))
  check(waiting && !topDialog().textContent.includes(tr('avatars.reproductor.sinVideo')) && !playerVideo(), 'espera con un spinner y no afirma que no hay video')
  check(document.activeElement === byLabel(stageLabel, topDialog()), 'el foco está en el escenario')
  remote.resolve()
  await waitFor(() => playerVideo()?.getAttribute('src') === media('look.mp4'), 'al llegar la lista, el video del look')
  check(!topDialog().textContent.includes(tr('avatars.reproductor.sinVideo')), 'sin el aviso de «sin video»')
  await waitFor(() => document.activeElement === byLabel(stageLabel, topDialog()), 'el escenario nuevo tiene el foco, no la caja del diálogo: ' + document.activeElement?.outerHTML.slice(0, 80))
  check(byLabel(stageLabel, topDialog()).tabIndex === 0, 'y ya se maneja con el teclado')
})

scenario('6 · panel del avatar: un look abre el reproductor con «Usar como principal»; el principal lo dice', async () => {
  const api = fakeApi()
  api.avatars = [ANA]
  api.looksByGroup = { 'g-ana': ANA_REMOTE }
  const pending = gate()
  api.setMainLook = (payload) => { api.calls.setMain.push(payload); return pending.promise }
  mount(<AvatarDetailDialog avatar={ANA} onClose={() => {}} onRemove={() => {}} />)
  const card = await waitFor(() => document.querySelector('[data-look-id="la-cocina"]'), 'la ficha de la cocina')
  check(card.getAttribute('aria-label') === tr('avatars.stock.abrirLookAria', { name: 'Ana cocina' }), 'la ficha abre el reproductor')
  card.click()
  await waitFor(() => dialogs().length === 2, 'el reproductor abre encima del panel')
  let player = topDialog()
  await waitFor(() => playerVideo()?.getAttribute('src') === media('look.mp4'), 'el video del listado remoto')
  const makeMain = buttonNamed(tr('avatars.detalle.usarPrincipal'), player)
  check(makeMain && !makeMain.disabled, 'ofrece «Usar como principal»')
  makeMain.click()
  await waitFor(() => api.calls.setMain.length === 1, 'pide el cambio')
  check(api.calls.setMain[0].id === 'ana-1' && api.calls.setMain[0].lookId === 'la-cocina', 'setMainLook con el avatar y el look: ' + JSON.stringify(api.calls.setMain[0]))
  await waitFor(() => buttonNamed(tr('avatars.detalle.usarPrincipal'), player)?.disabled, 'el botón se apaga mientras cambia')
  check(!byLabel(tr('avatars.reproductor.cerrar'), player).disabled, 'cambiar el principal no traba la X (no carga nada)')
  pending.resolve({ ...ANA, mainLookId: 'la-cocina' })
  await waitFor(() => dialogs().length === 1, 'al lograrlo, el reproductor se cierra')

  document.querySelector('[data-look-id="la-main"]').click()
  await waitFor(() => dialogs().length === 2, 'el reproductor del principal')
  player = topDialog()
  check(player.textContent.includes(tr('avatars.reproductor.esPrincipal')), 'dice que es el principal')
  check(!buttonNamed(tr('avatars.detalle.usarPrincipal'), player), 'sin botón')
  await pressKey('Escape')
  await waitFor(() => dialogs().length === 1, 'Escape cierra solo el reproductor')

  document.querySelector('[data-look-id="la-iv"]').click()
  await waitFor(() => dialogs().length === 2, 'el reproductor del look sin motor')
  check(topDialog().textContent.includes(tr('avatars.reproductor.noCompatibleHint')) && !buttonNamed(tr('avatars.detalle.usarPrincipal'), topDialog()), 'sin motor: el motivo y sin botón')
})


scenario('6c · panel del avatar: si «Usar como principal» falla, el reproductor sigue abierto y el foco vuelve al botón', async () => {
  const api = fakeApi()
  api.avatars = [ANA]
  api.looksByGroup = { 'g-ana': ANA_REMOTE }
  api.setMainLook = async (payload) => { api.calls.setMain.push(payload); throw new Error('HeyGen no responde') }
  mount(<AvatarDetailDialog avatar={ANA} onClose={() => {}} onRemove={() => {}} />)
  ;(await waitFor(() => document.querySelector('[data-look-id="la-cocina"]'), 'la ficha de la cocina')).click()
  await waitFor(() => dialogs().length === 2, 'el reproductor abre')
  const player = topDialog()
  const makeMain = buttonNamed(tr('avatars.detalle.usarPrincipal'), player)
  makeMain.focus()
  makeMain.click()
  await waitFor(() => api.calls.setMain.length === 1, 'pide el cambio')
  await waitFor(() => !buttonNamed(tr('avatars.detalle.usarPrincipal'), player)?.disabled, 'el botón vuelve')
  await delay(100)
  check(dialogs().length === 2, 'el reproductor sigue abierto')
  check(document.activeElement === buttonNamed(tr('avatars.detalle.usarPrincipal'), player), 'el foco vuelve a «Usar como principal»: ' + document.activeElement?.outerHTML.slice(0, 80))
})
scenario('4 · tarjeta del stock: sin video de grupo pide sus looks al pasar el mouse y reproduce el del look de portada; con video de grupo no pide nada', async () => {
  const api = fakeApi()
  const pending = gate()
  api.listStockLooks = (payload) => { api.calls.looks.push(payload); return pending.promise.then(() => ({ looks: structuredClone(DANTE_LOOKS), nextToken: null })) }
  mount(<StockLooksDialog entries={[]} onOpenAvatar={() => {}} onClose={() => {}} />)
  const dante = (await waitFor(() => document.querySelector('[data-group-id="g-dante"]'), 'la tarjeta de Dante')).closest('article')
  await delay(100)
  check(api.calls.looks.length === 0 && !dante.querySelector('video'), 'sin video de grupo y sin mirarla: ni video ni pedido de looks')
  hoverIn(dante)
  await waitFor(() => api.calls.looks.length === 1, 'al pasar el mouse pide los looks de Dante')
  check(same(api.calls.looks[0], { ownership: 'public', groupId: 'g-dante' }), 'los looks de su grupo, del stock público: ' + JSON.stringify(api.calls.looks[0]))
  check(veilShown(dante), 'un velo late sobre la imagen mientras llega el video')
  pending.resolve()
  await waitFor(() => videoSrc(dante) === media('look.mp4'), 'el video del look de portada (misma imagen que el grupo), no el del primer look: ' + videoSrc(dante))
  await waitFor(() => !veilShown(dante), 'el velo se va al llegar')
  await waitFor(() => window.playCalls.some((call) => call.src === media('look.mp4')), 'el video de portada arranca')
  check(window.playCalls.every((call) => call.muted && call.loop), 'las vistas previas al pasar el mouse siguen mudas: ' + JSON.stringify(window.playCalls))
  hoverOut(dante)

  const brody = document.querySelector('[data-group-id="g-brody"]').closest('article')
  check(videoSrc(brody) === 'media/brody.mp4', 'con video de grupo, ese video')
  hoverIn(brody)
  await delay(200)
  check(api.calls.looks.every((call) => call.groupId !== 'g-brody'), 'con video de grupo no pide sus looks')
})

const ANA_CARD = { ...ANA, id: 'ana-card' }
const ANA_TILES = [look('la-main', 'Ana oficina', { groupId: 'g-ana', previewVideoUrl: 'media/la-main.mp4' }), look('la-cocina', 'Ana cocina', { groupId: 'g-ana', previewVideoUrl: 'media/la-cocina.mp4' }), look('la-iv', 'Ana sin motor', { groupId: 'g-ana', previewVideoUrl: 'media/la-iv.mp4' })]

// Cuatro grupos sin video de grupo (como los primeros del stock real): cada
// uno tendría que pedir sus looks para su video de portada.
const NO_VIDEO_PAGE = [group('g-hayes', 'Hayes', 'male'), group('g-lasse', 'Lasse', 'male'), group('g-julian', 'Julian', 'male'), group('g-fintan', 'Fintan', 'male')]
const mouseMove = (element) => element.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
// Mueve un range como lo haría la persona (React escucha el evento input).
function setRange(input, value) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(value))
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

scenario('4b · tarjeta del stock: cruzar tarjetas sin detenerse no pide nada; con el mouse quieto encima o el foco del teclado, sí', async () => {
  const api = fakeApi()
  api.listStockGroups = async (payload) => { api.calls.groups.push(payload); return { groups: structuredClone(NO_VIDEO_PAGE), nextToken: null } }
  api.looksByGroup = Object.fromEntries(NO_VIDEO_PAGE.map((item) => [item.groupId, [look('l-' + item.groupId, item.name, { groupId: item.groupId, previewImageUrl: item.previewImageUrl, previewVideoUrl: 'media/' + item.groupId + '.mp4' })]]))
  mount(<StockLooksDialog entries={[]} onOpenAvatar={() => {}} onClose={() => {}} />)
  await waitFor(() => visibleGroupIds().length === 4, 'las cuatro tarjetas')
  const card = (id) => document.querySelector('[data-group-id="' + id + '"]').closest('article')
  for (const item of NO_VIDEO_PAGE) {
    hoverIn(card(item.groupId))
    mouseMove(card(item.groupId))
    await delay(40)
    mouseMove(card(item.groupId))
    hoverOut(card(item.groupId))
  }
  await delay(450)
  check(api.calls.looks.length === 0, 'cruzar las cuatro sin detenerse no pide nada: ' + JSON.stringify(api.calls.looks))

  // Encima pero moviéndose: cada movimiento vuelve a contar la espera.
  hoverIn(card('g-lasse'))
  for (let index = 0; index < 6; index++) {
    await delay(100)
    mouseMove(card('g-lasse'))
  }
  check(api.calls.looks.length === 0, 'mientras el mouse se mueve encima, todavía nada')
  await waitFor(() => api.calls.looks.length === 1, 'quieto encima, pide los looks')
  check(api.calls.looks[0].groupId === 'g-lasse', 'los de la tarjeta donde se detuvo: ' + JSON.stringify(api.calls.looks))
  await waitFor(() => videoSrc(card('g-lasse')) === 'media/g-lasse.mp4', 'y reproduce su video de portada')
  hoverOut(card('g-lasse'))

  // El foco del teclado no espera: Tab desde la tarjeta de Lasse llega al
  // corazón de Julian, que pide sus looks sin que el mouse pase por ahí.
  buttonNamed(tr('avatars.stock.agregar'), card('g-lasse')).focus()
  await pressKey('Tab')
  await waitFor(() => card('g-julian').contains(document.activeElement), 'Tab llega a la tarjeta de Julian')
  await waitFor(() => api.calls.looks.some((call) => call.groupId === 'g-julian'), 'con el foco del teclado pide sus looks')
  check(api.calls.looks.length === 2, 'solo las dos tarjetas donde la persona se detuvo: ' + JSON.stringify(api.calls.looks))
})

scenario('4c · tarjeta del stock: salir con Tab de una tarjeta cuyos looks todavía llegan deja el foco en el control siguiente; el velo se apaga sin salir del DOM', async () => {
  const api = fakeApi()
  const pending = gate()
  api.listStockLooks = (payload) => { api.calls.looks.push(payload); return pending.promise.then(() => ({ looks: structuredClone(DANTE_LOOKS), nextToken: null })) }
  mount(<StockLooksDialog entries={[]} onOpenAvatar={() => {}} onClose={() => {}} />)
  const dante = (await waitFor(() => document.querySelector('[data-group-id="g-dante"]'), 'la tarjeta de Dante')).closest('article')
  const dialogBox = dialogs()[0]
  // Con el teclado, del corazón de Dante a su «Ver looks»: el foco visible
  // pide sus looks (Dante no trae video de grupo) y el velo late.
  heartOf('Dante').focus()
  await pressKey('Tab')
  await waitFor(() => document.activeElement === byLabel(tr('avatars.stock.verLooksAria', { name: 'Dante' })), 'Tab llega a «Ver looks» de Dante')
  await waitFor(() => api.calls.looks.length === 1 && veilShown(dante), 'pide sus looks y el velo late mientras llegan')
  await pressKey('Tab')
  check(document.activeElement === byLabel(tr('avatars.stock.agregarAria', { name: 'Dante' })), 'Tab llega a «Agregar» de Dante: ' + document.activeElement?.outerHTML.slice(0, 100))
  // Los looks siguen en camino: Tab sale de la tarjeta.
  await pressKey('Tab')
  await delay(100)
  check(document.activeElement === heartOf('Brody'), 'el foco llega al corazón de Brody, no a la caja del diálogo: ' + document.activeElement?.outerHTML.slice(0, 100))
  check(document.activeElement !== dialogBox, 'nunca en la caja del diálogo')
  check(dante.querySelector('[class~="bg-white/25"]') && !veilShown(dante), 'el velo se apagó y sigue montado')
  pending.resolve()
})

scenario('7 · tarjeta de la biblioteca: cada imagen reproduce el video de su look y el foco del teclado, el de la principal; quitar va en la fila del nombre', async () => {
  const api = fakeApi()
  api.looksByGroup = { 'g-ana': ANA_TILES }
  // El botón de afuera hace de la X del panel: un clic del mouse y después el
  // foco vuelve al nombre por código, como al cerrar el panel.
  mount(<><button type="button" id="outside">X</button><AvatarCard avatar={ANA_CARD} disabled={false} onOpen={() => {}} onDelete={() => {}} /></>)
  const card = await waitFor(() => document.querySelector('[data-avatar-id="ana-card"]')?.closest('article'), 'la tarjeta')
  const tiles = [...card.querySelectorAll('[data-look-id]')]
  check(same(tiles.map((tile) => tile.dataset.lookId), ['la-main', 'la-cocina', 'la-iv']), 'el mosaico: la principal y las dos miniaturas: ' + tiles.map((tile) => tile.dataset.lookId))
  await delay(100)
  check(api.calls.looks.length === 0, 'sin mirarla no pide nada a HeyGen')
  // Cruzarla sin detenerse tampoco.
  const mosaic = card.querySelector('[data-look-id="la-main"]')
  hoverIn(mosaic)
  await delay(80)
  hoverOut(mosaic)
  await delay(400)
  check(api.calls.looks.length === 0, 'cruzarla con el mouse sin detenerse no pide nada')
  const second = card.querySelector('[data-look-id="la-iv"]')
  hoverIn(second)
  await waitFor(() => api.calls.looks.length === 1, 'al pasar el mouse pide los looks del avatar')
  check(same(api.calls.looks[0], { ownership: 'public', groupId: 'g-ana' }), 'los looks de su grupo (un avatar de stock, del listado público): ' + JSON.stringify(api.calls.looks[0]))
  await waitFor(() => videoSrc(second) === 'media/la-iv.mp4', 'la segunda miniatura con el video de su look')
  await waitFor(() => window.playCalls.length > 0, 'arranca un video')
  await delay(150)
  check(window.playCalls.every((call) => call.src === 'media/la-iv.mp4' && call.muted), 'solo el video de la miniatura bajo el mouse, mudo: ' + JSON.stringify(window.playCalls))
  check(videoSrc(card.querySelector('[data-look-id="la-main"]')) === 'media/la-main.mp4' && videoSrc(card.querySelector('[data-look-id="la-cocina"]')) === 'media/la-cocina.mp4', 'cada imagen tiene el video de su look')
  hoverOut(second)

  const name = card.querySelector('[data-avatar-id="ana-card"]')
  const trash = byLabel(tr('avatars.tarjeta.eliminar'), card)
  check(trash && trash.closest('div.flex') === name.parentElement.closest('div.flex') && name.parentElement.contains(trash), 'quitar está en la fila del nombre')

  // El foco que vuelve al nombre tras un clic (el panel cerrado con el mouse)
  // no activa nada; el del teclado, la principal.
  await clickOn(document.getElementById('outside'))
  await waitFor(() => document.activeElement === document.getElementById('outside'), 'el clic enfoca el botón de afuera')
  window.playCalls = []
  name.focus()
  await delay(250)
  check(window.playCalls.length === 0, 'el foco por código tras el mouse no activa la principal: ' + JSON.stringify(window.playCalls))
  document.getElementById('outside').focus()
  await pressKey('Tab')
  await waitFor(() => document.activeElement === name, 'Tab llega al nombre')
  await waitFor(() => window.playCalls.some((call) => call.src === 'media/la-main.mp4'), 'con el foco del teclado en el nombre, la principal reproduce su video')
})

scenario('1 · categorías: estudio, estilo de vida y comunidad filtran por la clasificación; mientras llega, «Clasificando…»', async () => {
  const api = fakeApi()
  const types = gate()
  api.listStockTypes = () => { api.calls.types += 1; return types.promise }
  mount(<StockLooksDialog entries={[]} onOpenAvatar={() => {}} onClose={() => {}} />)
  await waitFor(() => visibleGroupIds().length === 4, 'la primera página')
  check(api.calls.types === 1, 'el stock público pide la clasificación al abrir')
  check(same(visibleGroupIds(), ['g-dante', 'g-brody', 'g-ana', 'g-luz']) && buttonNamed(tr('avatars.stock.cargarMas')), '«Todos»: la página tal cual y «Cargar más»')
  // Estilo de vida es «todo lo demás»: sin la clasificación no se sabe nada.
  categoryChip('estiloDeVida').click()
  await waitFor(() => text().includes(tr('avatars.stock.clasificando')), 'mientras clasifica, la grilla lo dice')
  check(visibleGroupIds().length === 0 && document.querySelector('[role=status] svg'), 'sin tarjetas, con el aviso y su spinner')
  check(!buttonNamed(tr('avatars.stock.cargarMas')), 'ni «Cargar más» mientras clasifica')
  await delay(200)
  check(api.calls.groups.length === 1, 'mientras clasifica no pide más páginas: ' + JSON.stringify(api.calls.groups))
  categoryChip('profesional').click()
  await delay(200)
  check(text().includes(tr('avatars.stock.clasificando')) && api.calls.groups.length === 1, 'Profesional también espera la clasificación')
  types.resolve(structuredClone(TYPES))
  await waitFor(() => same(visibleGroupIds(), ['g-dante', 'g-luz', 'g-vic']), 'Profesional: solo los de estudio, y busca el que falta en la página 2: ' + visibleGroupIds())
  categoryChip('estiloDeVida').click()
  await waitFor(() => same(visibleGroupIds(), ['g-ana', 'g-zoe']), 'Estilo de vida: los que no son de estudio ni gemelos: ' + visibleGroupIds())
  categoryChip('comunidad').click()
  await waitFor(() => same(visibleGroupIds(), ['g-brody', 'g-teo']), 'Comunidad: los gemelos: ' + visibleGroupIds())
  categoryChip('todos').click()
  await waitFor(() => visibleGroupIds().length === 7, '«Todos» vuelve a mostrar todo lo cargado')

  // Los propios de la cuenta no tienen categorías; al volver, «Todos».
  categoryChip('comunidad').click()
  await waitFor(() => visibleGroupIds().length === 2, 'Comunidad otra vez')
  buttonNamed(tr('avatars.stock.propios')).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  buttonNamed(tr('avatars.stock.propios')).click()
  await waitFor(() => !document.querySelector('[role=group][aria-label="' + tr('avatars.stock.categoriaAria') + '"]'), 'en «Mis avatares» no hay chips de categoría')
  check(!heartOf('Dante'), 'ni corazones')
})

scenario('1b · categorías: si la clasificación falla, lo dice y esas categorías muestran todo', async () => {
  const api = fakeApi()
  api.listStockTypes = async () => { api.calls.types += 1; throw new Error('sin HeyGen') }
  mount(<StockLooksDialog entries={[]} onOpenAvatar={() => {}} onClose={() => {}} />)
  await waitFor(() => visibleGroupIds().length === 4, 'la primera página')
  check(!text().includes(tr('avatars.stock.clasificacionNoDisponible')), 'en «Todos» no molesta con el error')
  categoryChip('profesional').click()
  await waitFor(() => text().includes(tr('avatars.stock.clasificacionNoDisponible')), 'Profesional dice que la clasificación no está')
  check(same(visibleGroupIds(), ['g-dante', 'g-brody', 'g-ana', 'g-luz']), 'y muestra la grilla completa: ' + visibleGroupIds())
  await delay(200)
  check(api.calls.groups.length === 1 && buttonNamed(tr('avatars.stock.cargarMas')), 'una categoría sin clasificación no cuenta como filtro: no pide páginas solas')
})


scenario('1c · clasificación vacía: la primera vez, no disponible y la grilla completa; al reabrir el stock se vuelve a pedir («Clasificando…») y, con grupos, las categorías filtran', async () => {
  const api = fakeApi()
  const empty = { ...TYPES, studioGroupIds: [], twinGroupIds: [] }
  let nextTypes = Promise.resolve(empty)
  api.listStockTypes = () => { api.calls.types += 1; return nextTypes.then((value) => structuredClone(value)) }
  const client = mount(<StockLooksDialog entries={[]} onOpenAvatar={() => {}} onClose={() => {}} />)
  await waitFor(() => visibleGroupIds().length === 4 && api.calls.types === 1, 'la primera página y la clasificación pedida')
  categoryChip('profesional').click()
  await waitFor(() => text().includes(tr('avatars.stock.clasificacionNoDisponible')), 'vacía: el aviso de no disponible')
  check(same(visibleGroupIds(), ['g-dante', 'g-brody', 'g-ana', 'g-luz']), 'y la grilla completa: ' + visibleGroupIds())
  await delay(200)
  check(api.calls.groups.length === 1, 'no cuenta como filtro: no pide páginas solas')

  // Cerrar y reabrir el stock en la misma sesión (misma caché de la app).
  await unmount()
  const retried = gate()
  nextTypes = retried.promise
  mount(<StockLooksDialog entries={[]} onOpenAvatar={() => {}} onClose={() => {}} />, client)
  await waitFor(() => visibleGroupIds().length > 0, 'reabre el stock')
  await waitFor(() => api.calls.types === 2, 'vuelve a pedir la clasificación vacía')
  categoryChip('profesional').click()
  await waitFor(() => text().includes(tr('avatars.stock.clasificando')), 'mientras se reintenta, «Clasificando…»')
  check(!text().includes(tr('avatars.stock.clasificacionNoDisponible')) && visibleGroupIds().length === 0, 'sin el aviso y sin la grilla mientras tanto')
  retried.resolve(TYPES)
  await waitFor(() => same(visibleGroupIds(), ['g-dante', 'g-luz', 'g-vic']), 'con grupos, Profesional filtra: ' + visibleGroupIds())
})
scenario('2 · favoritos: el corazón escribe la lista entera y «Favoritos» la muestra; un id que el listado no trae no rompe nada y sigue guardado', async () => {
  const api = fakeApi()
  api.favorites = ['g-ana', 'g-ghost']
  mount(<StockLooksDialog entries={[]} onOpenAvatar={() => {}} onClose={() => {}} />)
  await waitFor(() => visibleGroupIds().length === 4 && heartOf('Ana')?.getAttribute('aria-pressed') === 'true', 'Ana marcada desde lo guardado')
  check(heartOf('Ana').getAttribute('aria-label') === tr('avatars.stock.favoritoAria', { name: 'Ana' }), 'el corazón tiene una etiqueta fija; el estado lo dice aria-pressed')
  check(heartOf('Brody').getAttribute('aria-pressed') === 'false', 'el de Brody no está marcado')
  heartOf('Brody').click()
  await waitFor(() => api.calls.writeFavorites.length === 1, 'el corazón guarda')
  check(same(api.calls.writeFavorites[0], ['g-ana', 'g-ghost', 'g-brody']), 'guarda la lista entera, con el id que todavía no se sabe si existe: ' + JSON.stringify(api.calls.writeFavorites[0]))
  await waitFor(() => heartOf('Brody').getAttribute('aria-pressed') === 'true', 'Brody queda marcado')
  check(!buttonNamed(tr('avatars.stock.volver')), 'el corazón no abre los looks de la tarjeta')

  categoryChip('favoritos').click()
  await waitFor(() => same(visibleGroupIds(), ['g-brody', 'g-ana']), 'Favoritos: Brody y Ana (en el orden del listado): ' + visibleGroupIds())
  await waitFor(() => api.calls.groups.length === 2, 'busca el favorito que falta en la página siguiente')
  // Con el listado completo, el id que no vino solo no se muestra: nunca se
  // escribe en lo guardado por cuenta propia.
  await delay(250)
  check(api.calls.writeFavorites.length === 1 && same(api.favorites, ['g-ana', 'g-ghost', 'g-brody']), 'g-ghost sigue guardado: ' + JSON.stringify(api.calls.writeFavorites))
  check(api.calls.groups.length === 2 && same(visibleGroupIds(), ['g-brody', 'g-ana']), 'no deja la grilla pidiendo: ' + JSON.stringify(api.calls.groups))
  check(!text().includes(tr('avatars.stock.buscandoMas')) && !buttonNamed(tr('avatars.stock.cargarMas')), 'sin más páginas, ni «Buscando más» ni «Cargar más»')

  heartOf('Brody').click()
  await waitFor(() => api.calls.writeFavorites.length === 2, 'quitar también guarda')
  check(same(api.calls.writeFavorites[1], ['g-ana', 'g-ghost']), 'sin Brody y con el id que no vino: ' + JSON.stringify(api.calls.writeFavorites[1]))
  await waitFor(() => same(visibleGroupIds(), ['g-ana']), 'Brody sale de Favoritos')

  // Si guardar falla: avisa y, con la cola vacía, relee el store: el corazón
  // vuelve a lo que quedó guardado.
  categoryChip('todos').click()
  await waitFor(() => heartOf('Luz'), 'la tarjeta de Luz')
  const readsBefore = api.calls.readFavorites
  api.writeStockFavorites = async (ids) => { api.calls.writeFavorites.push([...ids]); throw new Error('disco lleno') }
  heartOf('Luz').click()
  await waitFor(() => api.calls.writeFavorites.length === 3, 'intenta guardar')
  await waitFor(() => window.toastLog.includes(tr('avatars.errors.unknown')), 'avisa que no se pudo guardar')
  await waitFor(() => heartOf('Luz').getAttribute('aria-pressed') === 'false', 'el corazón vuelve a lo guardado')
  check(api.calls.readFavorites > readsBefore, 'para eso relee el store')
  check(heartOf('Ana').getAttribute('aria-pressed') === 'true', 'los demás favoritos siguen')
})

scenario('2g · favoritos: un listado que corta en la página 1 no escribe nada; el favorito sigue guardado, la sesión no lo vuelve a buscar sola y se muestra si una lectura posterior lo trae', async () => {
  const api = fakeApi()
  api.favorites = ['g-ana', 'g-vic']
  let cutShort = true
  api.listStockGroups = async (payload) => {
    api.calls.groups.push(payload)
    if (payload.token === 'page-2') return { groups: structuredClone(PAGE_2), nextToken: null }
    // HeyGen corta: la página 1 llega con has_more falso (sin next_token).
    return { groups: structuredClone(PAGE_1), nextToken: cutShort ? null : 'page-2' }
  }
  const client = mount(<StockLooksDialog entries={[]} onOpenAvatar={() => {}} onClose={() => {}} />)
  await waitFor(() => heartOf('Ana')?.getAttribute('aria-pressed') === 'true', 'lo guardado')
  categoryChip('favoritos').click()
  await waitFor(() => same(visibleGroupIds(), ['g-ana']), 'Favoritos: solo Ana (Vic no vino)')
  await delay(300)
  check(api.calls.writeFavorites.length === 0 && same(api.favorites, ['g-ana', 'g-vic']), 'el listado cortado no escribe nada: Vic sigue guardado: ' + JSON.stringify(api.calls.writeFavorites))
  check(api.calls.groups.length === 1, 'y no hay más páginas que pedir')

  // Reabrir en la misma sesión, con el listado ya entero: «Favoritos» no
  // vuelve a recorrerlo solo por Vic; «Cargar más» lo trae y se muestra.
  await unmount()
  cutShort = false
  client.removeQueries({ queryKey: ['avatars', 'stockGroups'] })
  mount(<StockLooksDialog entries={[]} onOpenAvatar={() => {}} onClose={() => {}} />, client)
  await waitFor(() => heartOf('Ana')?.getAttribute('aria-pressed') === 'true', 'reabre con lo guardado')
  categoryChip('favoritos').click()
  await waitFor(() => same(visibleGroupIds(), ['g-ana']), 'Favoritos: Ana')
  await delay(300)
  check(api.calls.groups.length === 2, 'no recorre las páginas solo por un favorito que el listado completo no trajo en esta sesión: ' + JSON.stringify(api.calls.groups))
  buttonNamed(tr('avatars.stock.cargarMas')).click()
  await waitFor(() => same(visibleGroupIds(), ['g-ana', 'g-vic']), 'una lectura que lo trae lo muestra: ' + visibleGroupIds())
  check(heartOf('Vic').getAttribute('aria-pressed') === 'true' && api.calls.writeFavorites.length === 0, 'marcado, y sin ninguna escritura')
})

scenario('2h · favoritos: «Mis avatares» entero no cuenta como recorrido del stock: los favoritos que no trae se siguen buscando en el público', async () => {
  const api = fakeApi()
  api.favorites = ['g-ana', 'g-vic']
  const publicListing = api.listStockGroups
  api.listStockGroups = async (payload) => {
    if (payload.ownership !== 'private') return publicListing(payload)
    api.calls.groups.push(payload)
    return { groups: [group('g-own', 'Propio', 'female')], nextToken: null }
  }
  const switchTo = (key) => {
    buttonNamed(tr(key)).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    buttonNamed(tr(key)).click()
  }
  mount(<StockLooksDialog entries={[]} onOpenAvatar={() => {}} onClose={() => {}} />)
  await waitFor(() => heartOf('Ana')?.getAttribute('aria-pressed') === 'true', 'lo guardado')
  switchTo('avatars.stock.propios')
  await waitFor(() => same(visibleGroupIds(), ['g-own']), '«Mis avatares»: una sola página, sin los favoritos')
  switchTo('avatars.stock.publicos')
  await waitFor(() => visibleGroupIds().length === 4, 'de vuelta en el stock')
  categoryChip('favoritos').click()
  await waitFor(() => same(visibleGroupIds(), ['g-ana', 'g-vic']), 'Favoritos busca a Vic en la página 2: ' + visibleGroupIds())
  check(api.calls.groups.some((payload) => payload.token === 'page-2') && api.calls.writeFavorites.length === 0, 'la pide sola, sin escribir nada: ' + JSON.stringify(api.calls.groups))
})

scenario('2e · favoritos: dos corazones seguidos se guardan de a uno, en orden y con la lista entera', async () => {
  const api = fakeApi()
  const writes = []
  api.writeStockFavorites = (ids) => {
    api.calls.writeFavorites.push([...ids])
    const pending = gate()
    writes.push(pending)
    return pending.promise.then(() => { api.favorites = [...ids] })
  }
  mount(<StockLooksDialog entries={[]} onOpenAvatar={() => {}} onClose={() => {}} />)
  await waitFor(() => heartOf('Ana') && api.calls.readFavorites === 1, 'las tarjetas y lo guardado')
  await delay(100)
  heartOf('Ana').click()
  await waitFor(() => api.calls.writeFavorites.length === 1, 'la primera escritura')
  heartOf('Luz').click()
  await waitFor(() => heartOf('Luz').getAttribute('aria-pressed') === 'true', 'el segundo corazón cambia al instante')
  await delay(200)
  check(api.calls.writeFavorites.length === 1, 'la segunda escritura espera a la primera: ' + JSON.stringify(api.calls.writeFavorites))
  writes[0].resolve()
  await waitFor(() => api.calls.writeFavorites.length === 2, 'termina la primera y sale la segunda')
  check(same(api.calls.writeFavorites[1], ['g-ana', 'g-luz']), 'con la lista entera: ' + JSON.stringify(api.calls.writeFavorites[1]))
  writes[1].resolve()
  await waitFor(() => same(api.favorites, ['g-ana', 'g-luz']), 'guardadas las dos, en orden')
  await delay(150)
  check(heartOf('Ana').getAttribute('aria-pressed') === 'true' && heartOf('Luz').getAttribute('aria-pressed') === 'true', 'los dos corazones siguen marcados tras releer')
})

scenario('2f · favoritos: si lo guardado no se puede leer, avisa; el corazón vuelve a leer y, si esta vez se puede, cambia', async () => {
  const api = fakeApi()
  api.favorites = ['g-ana']
  let readFails = true
  api.readStockFavorites = async () => {
    api.calls.readFavorites += 1
    if (readFails) throw new Error('store ilegible')
    return [...api.favorites]
  }
  mount(<StockLooksDialog entries={[]} onOpenAvatar={() => {}} onClose={() => {}} />)
  await waitFor(() => window.toastLog.includes(tr('avatars.errors.unknown')), 'avisa que no pudo leer los favoritos')
  check(heartOf('Ana').getAttribute('aria-pressed') === 'false', 'sin lo leído, nada marcado')
  window.toastLog = []
  heartOf('Luz').click()
  await waitFor(() => api.calls.readFavorites === 2, 'el corazón vuelve a intentar leer')
  await waitFor(() => window.toastLog.includes(tr('avatars.errors.unknown')), 'y, si sigue sin poder, avisa otra vez')
  check(api.calls.writeFavorites.length === 0, 'no escribe sin haber leído')
  readFails = false
  heartOf('Luz').click()
  await waitFor(() => api.calls.writeFavorites.length === 1, 'esta vez lee y guarda')
  check(same(api.calls.writeFavorites[0], ['g-ana', 'g-luz']), 'sobre lo guardado: ' + JSON.stringify(api.calls.writeFavorites[0]))
  await waitFor(() => heartOf('Luz').getAttribute('aria-pressed') === 'true' && heartOf('Ana').getAttribute('aria-pressed') === 'true', 'los corazones muestran lo guardado')
})

scenario('2c · favoritos: antes de leer lo guardado, el corazón está deshabilitado y no escribe (no pisa la lista con un solo id)', async () => {
  const api = fakeApi()
  const saved = gate()
  api.readStockFavorites = () => { api.calls.readFavorites += 1; return saved.promise }
  mount(<StockLooksDialog entries={[]} onOpenAvatar={() => {}} onClose={() => {}} />)
  await waitFor(() => heartOf('Brody'), 'la tarjeta de Brody')
  check(heartOf('Brody').getAttribute('aria-disabled') === 'true', 'mientras se lee lo guardado, el corazón está deshabilitado (aria-disabled)')
  check(!heartOf('Brody').disabled, 'pero sigue enfocable')
  heartOf('Brody').click()
  await delay(200)
  check(api.calls.writeFavorites.length === 0, 'sin la lista leída no se escribe: ' + JSON.stringify(api.calls.writeFavorites))
  check(!buttonNamed(tr('avatars.stock.volver')), 'y el clic no abre la tarjeta')
  saved.resolve(['g-ana'])
  await waitFor(() => heartOf('Ana')?.getAttribute('aria-pressed') === 'true', 'llega lo guardado')
  check(heartOf('Brody').getAttribute('aria-disabled') !== 'true', 'con lo guardado leído, el corazón se habilita')
  heartOf('Brody').click()
  await waitFor(() => api.calls.writeFavorites.length === 1, 'ahora sí guarda')
  check(same(api.calls.writeFavorites[0], ['g-ana', 'g-brody']), 'sobre la lista guardada: ' + JSON.stringify(api.calls.writeFavorites[0]))

  // La tarjeta sola: con el corazón deshabilitado no llama a quien lo cambia.
  await unmount()
  let toggles = 0
  mount(<StockGroupCard group={PAGE_1[1]} ownership="public" added={false} adding={false} disabled={false} favorite={false} favoriteDisabled onToggleFavorite={() => { toggles += 1 }} onOpen={() => {}} onAdd={() => {}} />)
  await waitFor(() => heartOf('Brody'), 'la tarjeta sola')
  heartOf('Brody').click()
  await delay(50)
  check(toggles === 0, 'el corazón deshabilitado no cambia nada')
})

scenario('2d · favoritos con el teclado: quitar uno desde «Favoritos» deja el foco en el corazón de la vecina o en el chip; con el mouse no lo mueve', async () => {
  let api = fakeApi()
  api.favorites = ['g-brody', 'g-ana', 'g-luz']
  mount(<StockLooksDialog entries={[]} onOpenAvatar={() => {}} onClose={() => {}} />)
  await waitFor(() => heartOf('Ana')?.getAttribute('aria-pressed') === 'true', 'los favoritos guardados')
  categoryChip('favoritos').click()
  await waitFor(() => same(visibleGroupIds(), ['g-brody', 'g-ana', 'g-luz']), 'Favoritos: Brody, Ana y Luz: ' + visibleGroupIds())
  await delay(150)
  check(api.calls.groups.length === 1, 'todos los favoritos ya están cargados: no pide más páginas')
  const dialogBox = dialogs()[0]

  // Ana, en el medio: el foco pasa al corazón de la siguiente (Luz).
  heartOf('Ana').focus()
  await pressKey('Enter')
  await waitFor(() => same(visibleGroupIds(), ['g-brody', 'g-luz']), 'Ana sale de Favoritos')
  await delay(100)
  check(document.activeElement === heartOf('Luz'), 'el foco queda en el corazón de la siguiente, Luz: ' + document.activeElement?.outerHTML.slice(0, 100))
  // Luz, la última: el de la anterior (Brody).
  await pressKey('Enter')
  await waitFor(() => same(visibleGroupIds(), ['g-brody']), 'Luz sale de Favoritos')
  await delay(100)
  check(document.activeElement === heartOf('Brody'), 'el foco queda en el corazón de la anterior, Brody: ' + document.activeElement?.outerHTML.slice(0, 100))
  // Brody, la única: el chip «Favoritos».
  await pressKey('Enter')
  await waitFor(() => text().includes(tr('avatars.stock.vacioFavoritos')), 'sin favoritos, lo dice')
  await delay(100)
  check(document.activeElement === categoryChip('favoritos'), 'sin tarjetas, el foco va al chip «Favoritos»: ' + document.activeElement?.outerHTML.slice(0, 100))
  check(document.activeElement !== dialogBox && same(api.calls.writeFavorites.at(-1), []), 'nunca en la caja del diálogo, y guardó la lista vacía')

  // Con el mouse (un clic de verdad), el foco no salta a la tarjeta vecina.
  await unmount()
  api = fakeApi()
  api.favorites = ['g-brody', 'g-ana', 'g-luz']
  mount(<StockLooksDialog entries={[]} onOpenAvatar={() => {}} onClose={() => {}} />)
  await waitFor(() => heartOf('Ana')?.getAttribute('aria-pressed') === 'true', 'los favoritos guardados')
  categoryChip('favoritos').click()
  await waitFor(() => visibleGroupIds().length === 3, 'Favoritos')
  await clickOn(heartOf('Ana'))
  await input({ type: 'move', x: 0, y: 0 })
  await waitFor(() => same(visibleGroupIds(), ['g-brody', 'g-luz']), 'Ana sale de Favoritos')
  await delay(150)
  check(api.calls.writeFavorites.length === 1, 'el clic guardó')
  check(document.activeElement !== heartOf('Luz') && document.activeElement !== heartOf('Brody'), 'con el mouse el foco no salta a otra tarjeta: ' + document.activeElement?.outerHTML.slice(0, 100))
})

scenario('2b · favoritos vacíos: lo dice y no recorre el stock buscando', async () => {
  const api = fakeApi()
  mount(<StockLooksDialog entries={[]} onOpenAvatar={() => {}} onClose={() => {}} />)
  await waitFor(() => visibleGroupIds().length === 4, 'la primera página')
  categoryChip('favoritos').click()
  await waitFor(() => text().includes(tr('avatars.stock.vacioFavoritos')), 'sin favoritos, lo dice')
  await delay(250)
  check(api.calls.groups.length === 1, 'sin favoritos no pide más páginas: ' + JSON.stringify(api.calls.groups))
})

scenario('3 · auto-carga: un filtro con pocas tarjetas pide la página siguiente sola; sin filtro, «Cargar más»; tras un error, no insiste', async () => {
  const api = fakeApi()
  mount(<StockLooksDialog entries={[]} onOpenAvatar={() => {}} onClose={() => {}} />)
  await waitFor(() => visibleGroupIds().length === 4, 'la primera página')
  await delay(200)
  check(api.calls.groups.length === 1 && buttonNamed(tr('avatars.stock.cargarMas')), 'sin filtro no pide sola: queda «Cargar más»')
  const page2 = gate()
  const original = api.listStockGroups
  api.listStockGroups = (payload) => (payload.token ? (api.calls.groups.push(payload), page2.promise.then(() => ({ groups: structuredClone(PAGE_2), nextToken: null }))) : original(payload))
  chip('avatars.stock.generoAria', 'avatars.stock.genero.mujeres').click()
  await waitFor(() => api.calls.groups.length === 2, 'Mujeres deja 2 tarjetas: pide la página 2 sola')
  check(same(api.calls.groups[1], { ownership: 'public', token: 'page-2' }), 'con el token de la segunda página: ' + JSON.stringify(api.calls.groups[1]))
  await waitFor(() => text().includes(tr('avatars.stock.buscandoMas')), 'mientras busca, «Buscando más avatares…» al pie')
  check(!buttonNamed(tr('avatars.stock.cargarMas')), 'en vez de «Cargar más»')
  page2.resolve()
  await waitFor(() => same(visibleGroupIds(), ['g-ana', 'g-luz', 'g-vic', 'g-zoe']), 'las mujeres de las dos páginas: ' + visibleGroupIds())
  check(!text().includes(tr('avatars.stock.buscandoMas')), 'sin más páginas, se calla')

  // Una página que falla no se pide en bucle: queda el error y «Cargar más».
  await unmount()
  const failing = fakeApi()
  failing.listStockGroups = async (payload) => {
    failing.calls.groups.push(payload)
    if (payload.token) throw new Error('HeyGen no responde')
    return { groups: structuredClone(PAGE_1), nextToken: 'page-2' }
  }
  mount(<StockLooksDialog entries={[]} onOpenAvatar={() => {}} onClose={() => {}} />)
  await waitFor(() => visibleGroupIds().length === 4, 'la primera página')
  chip('avatars.stock.generoAria', 'avatars.stock.genero.mujeres').click()
  await waitFor(() => failing.calls.groups.length === 2, 'pide la página 2')
  await waitFor(() => buttonNamed(tr('avatars.stock.cargarMas')), 'tras el error vuelve «Cargar más»')
  await delay(400)
  check(failing.calls.groups.length === 2, 'no reintenta solo: ' + failing.calls.groups.length + ' pedidos')
  check(document.querySelectorAll('[role=alert]').length === 1, 'el error a la vista, junto a lo cargado')
})

// ─── Entrega 2c: eliminar de HeyGen desde «Mis avatares» y el formato de los looks ───
const cardOf = (groupId) => document.querySelector('[data-group-id="' + groupId + '"]')?.closest('article')
const trashFor = (groupId) => cardOf(groupId)?.querySelector('[data-heygen-delete]')
// Lo que describe al tacho (aria-describedby, en orden).
const describedBy = (groupId) => (trashFor(groupId)?.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean).map((id) => document.getElementById(id))
const describedTexts = (groupId) => describedBy(groupId).map((element) => element?.textContent ?? null)
// La explicación del borrado de una tarjeta: está entre lo que describe al tacho.
const deleteHintOf = (groupId) => describedBy(groupId).find((element) => element?.textContent === tr('avatars.stock.eliminarHint')) ?? null
// Armado: sin aria-label (su nombre es el texto que se ve, «¿Eliminar para
// siempre?») y descripto por el nombre del avatar y la explicación.
const isArmed = (groupId, name) => {
  const trash = trashFor(groupId)
  if (!trash || trash.hasAttribute('aria-label')) return false
  return trash.textContent === tr('avatars.stock.eliminarConfirmar') && !trash.querySelector('span').classList.contains('hidden') && same(describedTexts(groupId), [name, tr('avatars.stock.eliminarHint')])
}
const isIdle = (groupId, name) => trashFor(groupId)?.getAttribute('aria-label') === tr('avatars.stock.eliminarHeygenAria', { name })
// El nombre y la descripción que calcula Chrome para el tacho de una tarjeta
// (su árbol de accesibilidad, por CDP desde Node): lo que anuncia un lector de
// pantalla y lo que busca el control por voz.
async function accessibleTrash(groupId) {
  const id = ++nextInput
  window.inputQueue.push({ id, type: 'ax', selector: 'article:has([data-group-id="' + groupId + '"]) [data-heygen-delete]' })
  await waitFor(() => window.inputDone.has(id), 'accesibilidad del tacho de ' + groupId, 300)
  return window.axResults[id]
}
const ownTab = () => buttonNamed(tr('avatars.stock.propios'))
async function openOwnTab() {
  const tab = await waitFor(ownTab, 'la pestaña «Mis avatares»')
  tab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  tab.click()
  await waitFor(() => same(visibleGroupIds(), ['g-mia', 'g-leo', 'g-sol']), '«Mis avatares»: ' + visibleGroupIds())
}
const privateListings = (api) => api.calls.groups.filter((payload) => payload.ownership === 'private').length

scenario('8 · «Mis avatares»: el tacho solo ahí, en dos pasos con la explicación; salir de la tarjeta, sacarle el foco o tocarla cancela, y el segundo clic de un doble clic no confirma', async () => {
  const api = fakeApi()
  mount(<StockLooksDialog entries={[{ id: 'lib-sol', groupId: 'g-sol' }]} onOpenAvatar={() => {}} onClose={() => {}} />)
  await waitFor(() => visibleGroupIds().length === 4, 'el stock público')
  check(document.querySelectorAll('[data-heygen-delete]').length === 0, '«De stock» no tiene tacho')
  check(ownTab()?.textContent === 'Mis avatares', 'la pestaña se llama «Mis avatares»: ' + ownTab()?.textContent)
  await openOwnTab()
  const dialogBox = dialogs()[0]
  check(['g-mia', 'g-leo', 'g-sol'].every((id) => trashFor(id)), 'cada tarjeta de «Mis avatares» trae su tacho')
  check(!heartOf('Mía'), 'sin corazón')
  const trash = trashFor('g-mia')
  check(isIdle('g-mia', 'Mía') && trash.title === tr('avatars.stock.eliminarHeygen'), 'nombra al avatar y dice qué hace: ' + trash.getAttribute('aria-label'))
  check(trash.compareDocumentPosition(byLabel(tr('avatars.stock.verLooksAria', { name: 'Mía' }))) & Node.DOCUMENT_POSITION_FOLLOWING, 'el tacho va antes que «Ver looks» (arriba, en la imagen)')
  check(trash.className.includes('left-2.5') && trash.className.includes('top-2.5'), 'arriba a la izquierda')
  check(deleteHintOf('g-mia')?.textContent === tr('avatars.stock.eliminarHint') && deleteHintOf('g-mia').classList.contains('invisible'), 'la explicación es su descripción accesible, oculta en reposo')
  const idleAccessible = await accessibleTrash('g-mia')
  check(idleAccessible.name === tr('avatars.stock.eliminarHeygenAria', { name: 'Mía' }) && idleAccessible.description === tr('avatars.stock.eliminarHint'), 'para Chrome, en reposo se llama «Eliminar Mía de HeyGen» y la explicación lo describe: ' + JSON.stringify(idleAccessible))
  const solBadge = [...cardOf('g-sol').querySelectorAll('span')].find((span) => span.textContent === tr('avatars.stock.agregado'))
  check(solBadge?.className.includes('right-2.5'), 'con tacho, «Agregado» va arriba a la derecha')

  // Primer clic: pide la confirmación, sin borrar nada.
  await clickOn(trash)
  await waitFor(() => isArmed('g-mia', 'Mía'), 'el primer clic pide la confirmación')
  check(trash.textContent === tr('avatars.stock.eliminarConfirmar') && !trash.querySelector('span').classList.contains('hidden') && !trash.hasAttribute('title'), '«¿Eliminar para siempre?» a la vista: ' + trash.textContent)
  check(trash.className.includes('bg-destructive'), 'en rojo')
  // Su nombre es el texto que se ve (WCAG 2.5.3: el control por voz lo
  // encuentra por lo que dice); el avatar y la explicación lo describen.
  check(!trash.hasAttribute('aria-label') && same(describedTexts('g-mia'), ['Mía', tr('avatars.stock.eliminarHint')]), 'armado, sin aria-label y descripto por el nombre y la explicación: ' + JSON.stringify(describedTexts('g-mia')))
  const armedAccessible = await accessibleTrash('g-mia')
  check(armedAccessible.name === tr('avatars.stock.eliminarConfirmar') && armedAccessible.description?.startsWith('Mía') && armedAccessible.description.includes(tr('avatars.stock.eliminarHint')), 'para Chrome, armado se llama «¿Eliminar para siempre?» y lo describen Mía y la explicación: ' + JSON.stringify(armedAccessible))
  check(deleteHintOf('g-mia').classList.contains('visible') && !deleteHintOf('g-mia').classList.contains('invisible'), 'la explicación a la vista')
  check(api.calls.deleteHeyGen.length === 0, 'el primer clic no borra')
  // El segundo clic de un doble clic, en el mismo lugar, no confirma.
  await clickOn(trash, 2)
  await delay(150)
  check(api.calls.deleteHeyGen.length === 0 && isArmed('g-mia', 'Mía'), 'el doble clic no borra y la confirmación sigue')
  // Salir de la tarjeta la cancela.
  await input({ type: 'move', x: 0, y: 0 })
  await waitFor(() => isIdle('g-mia', 'Mía'), 'salir de la tarjeta cancela')
  check(deleteHintOf('g-mia').classList.contains('invisible') && trash.querySelector('span').classList.contains('hidden'), 'y la explicación y el texto se ocultan (siguen montados)')

  // Tocar otra parte de la tarjeta la cancela, sin abrir sus looks.
  await clickOn(trash)
  await waitFor(() => isArmed('g-mia', 'Mía'), 'pide la confirmación otra vez')
  await clickOn(cardOf('g-mia').querySelector('h3'))
  await waitFor(() => isIdle('g-mia', 'Mía'), 'tocar la tarjeta cancela')
  await delay(100)
  check(!buttonNamed(tr('avatars.stock.volver')) && api.calls.looks.length === 0, 'y no abre los looks')
  await input({ type: 'move', x: 0, y: 0 })

  // Con el teclado: Enter pide la confirmación y el foco sigue en el tacho;
  // Tab la cancela y el foco pasa al control siguiente, nunca a la caja del
  // diálogo (en el blur nada sale del DOM). El banco no carga CSS: el
  // siguiente es «Ver looks» de la misma tarjeta; en la app, con su barra
  // oculta mientras confirma, es el tacho de la tarjeta siguiente.
  trash.focus()
  await pressKey('Enter')
  await waitFor(() => isArmed('g-mia', 'Mía'), 'Enter pide la confirmación')
  check(document.activeElement === trash, 'el foco sigue en el tacho, que ahora confirma')
  check(cardOf('g-mia').querySelector('.invisible [data-group-id]'), 'mientras confirma, «Ver looks» queda oculto bajo la explicación')
  await pressKey('Tab')
  await waitFor(() => isIdle('g-mia', 'Mía'), 'Tab saca el foco y cancela')
  await delay(100)
  check(document.activeElement === byLabel(tr('avatars.stock.verLooksAria', { name: 'Mía' })), 'el foco llega al control siguiente, no a la caja del diálogo: ' + document.activeElement?.outerHTML.slice(0, 100))
  check(document.activeElement !== dialogBox && api.calls.deleteHeyGen.length === 0, 'nada se borró')
})

scenario('8b · «Mis avatares»: eliminar pide el borrado con el groupId y apaga la tarjeta; al lograrlo avisa, la saca y relee la cuenta y la biblioteca; el foco del teclado va al tacho vecino o a la pestaña; con el mouse no se mueve', async () => {
  const api = fakeApi()
  const pending = []
  const instant = api.deleteFromHeyGen
  api.deleteFromHeyGen = (payload) => {
    const done = gate()
    pending.push(done)
    return done.promise.then(() => instant(payload))
  }
  // La relectura de la cuenta tras un borrado espera a que el escenario la
  // suelte: la tarjeta tiene que salir antes, sin esperarla.
  const listing = api.listStockGroups
  let slowListing = null
  api.listStockGroups = (payload) => {
    if (!slowListing || payload.ownership !== 'private') return listing(payload)
    return slowListing.promise.then(() => listing(payload))
  }
  const client = mount(<StockLooksDialog entries={[]} onOpenAvatar={() => {}} onClose={() => {}} />)
  client.setQueryData(['avatars', 'list'], [])
  await openOwnTab()
  const dialogBox = dialogs()[0]
  const listingsBefore = privateListings(api)

  // Leo, en el medio, con el teclado: Enter pide la confirmación, Enter
  // elimina.
  trashFor('g-leo').focus()
  await pressKey('Enter')
  await waitFor(() => isArmed('g-leo', 'Leo'), 'pide la confirmación')
  await pressKey('Enter')
  await waitFor(() => pending.length === 1, 'pide el borrado')
  await waitFor(() => trashFor('g-leo').textContent === tr('avatars.stock.eliminando'), '«Eliminando…» mientras tanto')
  check(api.calls.deleteHeyGen.length === 0, 'un solo pedido, en vuelo')
  const card = cardOf('g-leo')
  check(card.getAttribute('aria-busy') === 'true' && card.className.includes('opacity-50') && card.className.includes('pointer-events-none'), 'la tarjeta apagada')
  check(trashFor('g-leo').getAttribute('aria-disabled') === 'true' && !trashFor('g-leo').hasAttribute('aria-label'), 'el tacho no hace nada más y se nombra «Eliminando…»')
  const deletingAccessible = await accessibleTrash('g-leo')
  check(deletingAccessible.name === tr('avatars.stock.eliminando') && deletingAccessible.description === 'Leo', 'para Chrome, se llama «Eliminando…» y lo describe Leo: ' + JSON.stringify(deletingAccessible))
  check(document.activeElement === trashFor('g-leo'), 'el foco espera en el tacho (aria-disabled, sigue enfocable)')
  check([...document.querySelectorAll('button')].filter((button) => button.textContent.trim() === tr('avatars.stock.agregar')).every((button) => button.disabled), 'mientras borra no se agrega nada')
  trashFor('g-mia').click()
  await delay(100)
  check(isIdle('g-mia', 'Mía') && trashFor('g-mia').getAttribute('aria-disabled') === 'true' && pending.length === 1, 'otro tacho no arranca otro borrado')
  slowListing = gate()
  pending[0].resolve()
  await waitFor(() => same(visibleGroupIds(), ['g-mia', 'g-sol']), 'Leo sale de la grilla sin esperar la relectura: ' + visibleGroupIds())
  check(same(api.calls.deleteHeyGen, [{ groupId: 'g-leo', name: 'Leo' }]), 'el pedido lleva el groupId y, para el log de soporte, el nombre: ' + JSON.stringify(api.calls.deleteHeyGen))
  await waitFor(() => window.toastLog.includes(tr('avatars.toasts.eliminadoHeygen', { name: 'Leo' })), 'el aviso: ' + JSON.stringify(window.toastLog))
  await delay(100)
  check(document.activeElement === trashFor('g-sol'), 'el foco pasa al tacho de la siguiente, Sol: ' + document.activeElement?.outerHTML.slice(0, 100))
  check(client.getQueryState(['avatars', 'list'])?.isInvalidated, 'marca vieja la lista de la biblioteca')
  check(privateListings(api) === listingsBefore, 'la relectura de la cuenta sigue en vuelo')
  slowListing.resolve()
  slowListing = null
  await waitFor(() => privateListings(api) > listingsBefore, 'relee los avatares de la cuenta')
  await delay(100)
  check(same(visibleGroupIds(), ['g-mia', 'g-sol']), 'la relectura coincide: Leo no vuelve')

  // Sol, la última: el foco va al tacho de la anterior, Mía.
  check(document.activeElement === trashFor('g-sol'), 'el foco sigue en el tacho de Sol')
  await pressKey('Enter')
  await pressKey('Enter')
  await waitFor(() => pending.length === 2, 'pide borrar a Sol')
  pending[1].resolve()
  await waitFor(() => same(visibleGroupIds(), ['g-mia']), 'Sol sale de la grilla')
  await delay(100)
  check(document.activeElement === trashFor('g-mia'), 'el foco queda en el tacho de la anterior, Mía: ' + document.activeElement?.outerHTML.slice(0, 100))

  // Mía, la única: el foco va a la pestaña «Mis avatares».
  await pressKey('Enter')
  await pressKey('Enter')
  await waitFor(() => pending.length === 3, 'pide borrar a Mía')
  pending[2].resolve()
  await waitFor(() => visibleGroupIds().length === 0 && text().includes(tr('avatars.stock.vacio')), 'sin avatares, lo dice')
  await delay(100)
  check(document.activeElement === ownTab() && ownTab().getAttribute('aria-selected') === 'true', 'el foco va a la pestaña «Mis avatares»: ' + document.activeElement?.outerHTML.slice(0, 100))
  check(document.activeElement !== dialogBox, 'nunca en la caja del diálogo')
  check(same(api.calls.deleteHeyGen.map((payload) => payload.groupId), ['g-leo', 'g-sol', 'g-mia']), 'tres borrados, de a uno')

  // Con el mouse (clics de verdad), el foco no salta a la tarjeta vecina.
  await unmount()
  const mouseApi = fakeApi()
  mount(<StockLooksDialog entries={[]} onOpenAvatar={() => {}} onClose={() => {}} />)
  await openOwnTab()
  await clickOn(trashFor('g-mia'))
  await waitFor(() => isArmed('g-mia', 'Mía'), 'el clic pide la confirmación')
  await clickOn(trashFor('g-mia'))
  await waitFor(() => same(visibleGroupIds(), ['g-leo', 'g-sol']), 'el segundo clic la elimina')
  await delay(150)
  check(same(mouseApi.calls.deleteHeyGen, [{ groupId: 'g-mia', name: 'Mía' }]), 'con su groupId y su nombre: ' + JSON.stringify(mouseApi.calls.deleteHeyGen))
  check(document.activeElement !== trashFor('g-leo') && document.activeElement !== ownTab(), 'con el mouse el foco no salta: ' + document.activeElement?.outerHTML.slice(0, 100))
})

scenario('8c · «Mis avatares»: si eliminar falla, avisa con el error y la tarjeta vuelve, con el foco en su tacho; sin red el pedido sale igual y no se repite al volver', async () => {
  const api = fakeApi()
  const answer = gate()
  api.deleteFromHeyGen = (payload) => {
    api.calls.deleteHeyGen.push(payload)
    return answer.promise.then(() => { throw Object.assign(new Error('HeyGen rechazó la clave'), { code: 'avatar_invalid_key' }) })
  }
  mount(<StockLooksDialog entries={[]} onOpenAvatar={() => {}} onClose={() => {}} />)
  await openOwnTab()
  const listingsBefore = privateListings(api)
  // Un webview sin red avisa offline: el borrado va al sidecar igual (que
  // responde por su cuenta), no queda en pausa para salir solo al volver la
  // red (ERRORES-CONOCIDOS: tanstack-mutacion-pausada-por-networkmode-online).
  window.dispatchEvent(new Event('offline'))
  try {
    trashFor('g-mia').focus()
    await pressKey('Enter')
    await pressKey('Enter')
    await waitFor(() => api.calls.deleteHeyGen.length === 1, 'sin red, el pedido sale igual')
    await waitFor(() => trashFor('g-mia')?.textContent === tr('avatars.stock.eliminando'), 'eliminando')
    answer.resolve()
    await waitFor(() => window.toastLog.includes(tr('avatars.errors.invalidKey')), 'avisa con el error: ' + JSON.stringify(window.toastLog))
    await waitFor(() => isIdle('g-mia', 'Mía'), 'el tacho vuelve a reposo')
    check(same(visibleGroupIds(), ['g-mia', 'g-leo', 'g-sol']), 'la tarjeta sigue en la grilla')
    const card = cardOf('g-mia')
    check(card.getAttribute('aria-busy') === 'false' && !card.className.includes('opacity-50') && trashFor('g-mia').getAttribute('aria-disabled') === 'false', 'y vuelve a la normalidad')
    check(document.activeElement === trashFor('g-mia'), 'el foco sigue en su tacho: ' + document.activeElement?.outerHTML.slice(0, 100))
    check(!window.toastLog.includes(tr('avatars.toasts.eliminadoHeygen', { name: 'Mía' })), 'sin el aviso de éxito')
  } finally {
    window.dispatchEvent(new Event('online'))
  }
  await delay(150)
  check(api.calls.deleteHeyGen.length === 1, 'al volver la red no se repite: ' + api.calls.deleteHeyGen.length)
  check(privateListings(api) === listingsBefore, 'sin borrado, no relee la cuenta')
})

scenario('8d · «Mis avatares»: una tecla sostenida no confirma: Enter o Espacio sostenidos solo arman; soltar y volver a apretar elimina', async () => {
  const api = fakeApi()
  mount(<StockLooksDialog entries={[]} onOpenAvatar={() => {}} onClose={() => {}} />)
  await openOwnTab()
  // Enter sostenido: el primer keyDown arma; sus repeticiones automáticas no
  // confirman (en un botón, cada Enter repetido sería otro clic).
  trashFor('g-mia').focus()
  await holdKey('Enter')
  await delay(300)
  check(api.calls.deleteHeyGen.length === 0 && isArmed('g-mia', 'Mía'), 'Enter sostenido solo arma: ' + JSON.stringify(api.calls.deleteHeyGen))
  await pressKey('Enter')
  await waitFor(() => api.calls.deleteHeyGen.length === 1, 'soltar y volver a apretar Enter elimina')
  check(api.calls.deleteHeyGen[0].groupId === 'g-mia', 'a Mía: ' + JSON.stringify(api.calls.deleteHeyGen))
  await waitFor(() => same(visibleGroupIds(), ['g-leo', 'g-sol']), 'Mía sale de la grilla')

  // Espacio sostenido: también solo arma.
  trashFor('g-leo').focus()
  await holdKey(' ')
  await delay(300)
  check(api.calls.deleteHeyGen.length === 1 && isArmed('g-leo', 'Leo'), 'Espacio sostenido solo arma: ' + JSON.stringify(api.calls.deleteHeyGen))
  await pressKey(' ')
  await waitFor(() => api.calls.deleteHeyGen.length === 2, 'soltar y volver a apretar Espacio elimina')
  check(api.calls.deleteHeyGen[1].groupId === 'g-leo', 'a Leo: ' + JSON.stringify(api.calls.deleteHeyGen))
})

scenario('8e · «Mis avatares»: mientras se agrega un avatar, ningún tacho arma ni borra; al terminar el alta, vuelven', async () => {
  const api = fakeApi()
  const added = gate()
  api.addAvatar = (payload) => {
    api.calls.add.push(payload)
    return added.promise.then(() => ({ id: 'lib-' + payload.groupId, groupId: payload.groupId }))
  }
  mount(<StockLooksDialog entries={[]} onOpenAvatar={() => {}} onClose={() => {}} />)
  await openOwnTab()
  byLabel(tr('avatars.stock.agregarAria', { name: 'Mía' })).click()
  await waitFor(() => api.calls.add.length === 1, 'pide agregar a Mía')
  // Con el alta en vuelo, ni el tacho de Mía (la misma tarjeta) ni el de Leo
  // arman o borran, aunque se los apriete dos veces.
  for (const [groupId, name] of [['g-mia', 'Mía'], ['g-leo', 'Leo']]) {
    check(trashFor(groupId).getAttribute('aria-disabled') === 'true', 'el tacho de ' + name + ' está apagado mientras se agrega')
    trashFor(groupId).focus()
    await pressKey('Enter')
    await pressKey('Enter')
    await delay(100)
    check(isIdle(groupId, name) && api.calls.deleteHeyGen.length === 0, 'Enter dos veces en el tacho de ' + name + ' no arma ni borra: ' + JSON.stringify(api.calls.deleteHeyGen))
  }
  check(same(visibleGroupIds(), ['g-mia', 'g-leo', 'g-sol']), 'las tarjetas siguen igual')
  added.resolve()
  await waitFor(() => trashFor('g-leo').getAttribute('aria-disabled') === 'false', 'al terminar el alta, el tacho vuelve')
  trashFor('g-leo').focus()
  await pressKey('Enter')
  await waitFor(() => isArmed('g-leo', 'Leo'), 'y arma otra vez')
  check(api.calls.deleteHeyGen.length === 0, 'sin borrar nada')
})

scenario('7b · tarjeta de la biblioteca: una tecla sostenida no confirma «Quitar»: solo arma; soltar y volver a apretar quita', async () => {
  fakeApi()
  const removed = []
  mount(<AvatarCard avatar={ANA_CARD} disabled={false} onOpen={() => {}} onDelete={(avatar) => removed.push(avatar.id)} />)
  const card = await waitFor(() => document.querySelector('[data-avatar-id="ana-card"]')?.closest('article'), 'la tarjeta')
  byLabel(tr('avatars.tarjeta.eliminar'), card).focus()
  await holdKey('Enter')
  await delay(200)
  check(removed.length === 0 && buttonNamed(tr('avatars.tarjeta.confirmar'), card), 'Enter sostenido solo arma («Seguro» a la vista, sin quitar): ' + JSON.stringify(removed))
  check(document.activeElement === buttonNamed(tr('avatars.tarjeta.confirmar'), card), 'el foco está en «Seguro»: ' + document.activeElement?.outerHTML.slice(0, 100))
  await pressKey('Enter')
  await waitFor(() => removed.length === 1, 'soltar y volver a apretar Enter quita')
  check(same(removed, ['ana-card']), 'una sola vez, a Ana: ' + JSON.stringify(removed))
})

scenario('6d · panel del avatar: una tecla sostenida no confirma «Quitar avatar»: solo arma; soltar y volver a apretar quita', async () => {
  const api = fakeApi()
  api.avatars = [ANA]
  api.looksByGroup = { 'g-ana': ANA_REMOTE }
  let removes = 0
  mount(<AvatarDetailDialog avatar={ANA} onClose={() => {}} onRemove={() => { removes += 1 }} />)
  const remove = await waitFor(() => buttonNamed(tr('avatars.tarjeta.eliminar'), topDialog()), '«Quitar avatar» en el panel')
  remove.focus()
  await holdKey('Enter')
  await delay(200)
  check(removes === 0 && buttonNamed(tr('avatars.tarjeta.confirmar'), topDialog()), 'Enter sostenido solo arma («Seguro» a la vista, sin quitar): ' + removes)
  check(document.activeElement === buttonNamed(tr('avatars.tarjeta.confirmar'), topDialog()), 'el foco está en «Seguro»: ' + document.activeElement?.outerHTML.slice(0, 100))
  await pressKey('Enter')
  await waitFor(() => removes === 1, 'soltar y volver a apretar Enter quita')
  await delay(100)
  check(removes === 1, 'una sola vez: ' + removes)
})

scenario('7c · tarjeta de la biblioteca: el segundo clic de un doble clic no confirma «Quitar»; un clic suelto después, sí', async () => {
  fakeApi()
  const removed = []
  mount(<AvatarCard avatar={ANA_CARD} disabled={false} onOpen={() => {}} onDelete={(avatar) => removed.push(avatar.id)} />)
  const card = await waitFor(() => document.querySelector('[data-avatar-id="ana-card"]')?.closest('article'), 'la tarjeta')
  await clickOn(byLabel(tr('avatars.tarjeta.eliminar'), card))
  const sure = await waitFor(() => buttonNamed(tr('avatars.tarjeta.confirmar'), card), 'el primer clic arma «Seguro»')
  await clickOn(sure, 2)
  await delay(150)
  check(removed.length === 0 && buttonNamed(tr('avatars.tarjeta.confirmar'), card), 'el segundo clic de un doble clic no quita: ' + JSON.stringify(removed))
  await clickOn(buttonNamed(tr('avatars.tarjeta.confirmar'), card))
  await waitFor(() => removed.length === 1, 'un clic suelto después quita')
  check(same(removed, ['ana-card']), 'una sola vez, a Ana: ' + JSON.stringify(removed))
})

scenario('6e · panel del avatar: el segundo clic de un doble clic no confirma «Quitar avatar»; un clic suelto después, sí', async () => {
  const api = fakeApi()
  api.avatars = [ANA]
  api.looksByGroup = { 'g-ana': ANA_REMOTE }
  let removes = 0
  mount(<AvatarDetailDialog avatar={ANA} onClose={() => {}} onRemove={() => { removes += 1 }} />)
  const remove = await waitFor(() => buttonNamed(tr('avatars.tarjeta.eliminar'), topDialog()), '«Quitar avatar» en el panel')
  await clickOn(remove)
  const sure = await waitFor(() => buttonNamed(tr('avatars.tarjeta.confirmar'), topDialog()), 'el primer clic arma «Seguro»')
  await clickOn(sure, 2)
  await delay(150)
  check(removes === 0 && buttonNamed(tr('avatars.tarjeta.confirmar'), topDialog()), 'el segundo clic de un doble clic no quita: ' + removes)
  await clickOn(buttonNamed(tr('avatars.tarjeta.confirmar'), topDialog()))
  await waitFor(() => removes === 1, 'un clic suelto después quita')
  await delay(100)
  check(removes === 1, 'una sola vez: ' + removes)
})

scenario('8f · «Mis avatares»: con un borrado en HeyGen en vuelo el diálogo no se cierra (Escape, clic afuera, la X); al terminar, sí', async () => {
  const api = fakeApi()
  const answer = gate()
  const instant = api.deleteFromHeyGen
  api.deleteFromHeyGen = (payload) => answer.promise.then(() => instant(payload))
  let closes = 0
  mount(<StockLooksDialog entries={[]} onOpenAvatar={() => {}} onClose={() => { closes += 1 }} />)
  await openOwnTab()
  trashFor('g-mia').focus()
  await pressKey('Enter')
  await pressKey('Enter')
  await waitFor(() => trashFor('g-mia')?.textContent === tr('avatars.stock.eliminando'), 'eliminando a Mía')
  await pressKey('Escape')
  await delay(100)
  check(closes === 0, 'Escape no cierra mientras borra: ' + closes)
  await input({ type: 'click', x: 3, y: 3 })
  await delay(100)
  check(closes === 0, 'un clic afuera tampoco: ' + closes)
  buttonNamed(tr('common.cerrar'), dialogs()[0]).click()
  await delay(100)
  check(closes === 0 && dialogs().length === 1, 'ni la X: ' + closes)
  answer.resolve()
  await waitFor(() => same(visibleGroupIds(), ['g-leo', 'g-sol']), 'Mía sale de la grilla')
  await pressKey('Escape')
  await waitFor(() => closes === 1, 'al terminar el borrado, Escape cierra')
})

// El chip de formato de una ficha o del reproductor: su etiqueta para el lector
// de pantalla y el texto que se ve (fuera del lector), o null si no tiene.
function formatChip(root) {
  const prefix = tr('avatars.formato.aria', { format: '' })
  const label = [...root.querySelectorAll('span.sr-only')].find((span) => span.textContent.startsWith(prefix))
  if (!label) return null
  const shown = label.nextElementSibling
  return { label: label.textContent, shown: shown?.textContent, hidden: shown?.getAttribute('aria-hidden') }
}
const lookCardOf = (lookId) => document.querySelector('[data-look-id="' + lookId + '"]')?.closest('article')
const formatIs = (root, format) => same(formatChip(root), { label: tr('avatars.formato.aria', { format }), shown: format, hidden: 'true' })
// En literal (lo que decían las fichas antes de la 2c): las claves
// avatars.stock.orientacion.* quedaron sin uso y se borran, y leídas con tr()
// el chequeo pasaría siempre.
const ORIENTATION_WORDS = ['Vertical', 'Horizontal', 'Cuadrado']

scenario('9 · formato de los looks: las fichas del stock y del panel y el reproductor dicen 16:9, 9:16, 1:1, 4:5 o 5:4 en lugar de la orientación; sin datos, sin chip', async () => {
  const api = fakeApi()
  api.looksByGroup = { 'g-dante': [
    look('f-wide', 'Look ancho'),
    // La orientación de HeyGen manda sobre las medidas.
    look('f-tall', 'Look alto', { preferredOrientation: 'portrait', imageWidth: 1920, imageHeight: 1080 }),
    look('f-even', 'Look parejo', { preferredOrientation: 'square' }),
    look('f-45', 'Look cuatro por cinco', { preferredOrientation: undefined, imageWidth: 1080, imageHeight: 1350 }),
    look('f-54', 'Look cinco por cuatro', { preferredOrientation: undefined, imageWidth: 1350, imageHeight: 1080 }),
    look('f-none', 'Look sin datos', { preferredOrientation: undefined }),
  ] }
  mount(<StockLooksDialog entries={[]} onOpenAvatar={() => {}} onClose={() => {}} />)
  ;(await waitFor(() => document.querySelector('[data-group-id="g-dante"]'), 'la tarjeta de Dante')).click()
  await waitFor(() => lookCardOf('f-none'), 'los looks de Dante')
  const expected = { 'f-wide': '16:9', 'f-tall': '9:16', 'f-even': '1:1', 'f-45': '4:5', 'f-54': '5:4' }
  for (const [lookId, format] of Object.entries(expected))
    check(formatIs(lookCardOf(lookId), format), lookId + ' dice ' + format + ': ' + JSON.stringify(formatChip(lookCardOf(lookId))))
  check(formatChip(lookCardOf('f-none')) === null, 'sin orientación ni medidas, sin chip')
  const looksText = Object.keys(expected).map((lookId) => lookCardOf(lookId).textContent).join(' ')
  check(!ORIENTATION_WORDS.some((word) => looksText.includes(word)), 'ya no dice Vertical, Horizontal ni Cuadrado: ' + looksText)

  // El reproductor del look lo hereda.
  lookCardOf('f-45').querySelector('[data-look-id]').click()
  await waitFor(() => dialogs().length === 2, 'el reproductor del look 4:5')
  check(formatIs(topDialog(), '4:5'), 'el reproductor dice 4:5: ' + JSON.stringify(formatChip(topDialog())))
  await pressKey('Escape')
  await waitFor(() => dialogs().length === 1, 'cierra el reproductor')

  // El panel de un avatar: la biblioteca guarda solo la orientación; las
  // medidas salen del listado de HeyGen cuando las trae.
  await unmount()
  const panelApi = fakeApi()
  const PIA = { id: 'pia-1', name: 'Pía', groupId: 'g-pia', ownership: 'own', status: 'ready', mainLookId: 'p-wide', looks: [avatarLook('p-wide', 'Pía oficina'), avatarLook('p-45', 'Pía retrato', { preferredOrientation: undefined }), avatarLook('p-none', 'Pía sin datos', { preferredOrientation: undefined })], previewPath: '/library/pia.png', createdAt: '2026-10-09T00:00:00Z' }
  const remote = gate()
  panelApi.listStockLooks = (payload) => {
    panelApi.calls.looks.push(payload)
    return remote.promise.then(() => ({ looks: [look('p-wide', 'Pía oficina', { groupId: 'g-pia' }), look('p-45', 'Pía retrato', { groupId: 'g-pia', preferredOrientation: undefined, imageWidth: 1080, imageHeight: 1350 }), look('p-none', 'Pía sin datos', { groupId: 'g-pia', preferredOrientation: undefined })], nextToken: null }))
  }
  mount(<AvatarDetailDialog avatar={PIA} onClose={() => {}} onRemove={() => {}} />)
  await waitFor(() => lookCardOf('p-none'), 'los looks de Pía')
  check(formatIs(lookCardOf('p-wide'), '16:9'), 'la orientación guardada ya da el formato')
  check(formatChip(lookCardOf('p-45')) === null, 'sin orientación, espera las medidas de HeyGen')
  remote.resolve()
  await waitFor(() => formatIs(lookCardOf('p-45'), '4:5'), 'con las medidas del listado, 4:5: ' + JSON.stringify(formatChip(lookCardOf('p-45'))))
  check(formatChip(lookCardOf('p-none')) === null, 'sin datos en ningún lado, sin chip')
  lookCardOf('p-45').querySelector('[data-look-id]').click()
  await waitFor(() => dialogs().length === 2, 'el reproductor del look del panel')
  check(formatIs(topDialog(), '4:5'), 'el reproductor del panel también: ' + JSON.stringify(formatChip(topDialog())))
})

// ─── Corrida ───
window.results = []
// Un clic de verdad en la página antes de empezar: el sonido del reproductor
// exige que el documento haya tenido una activación del usuario.
await input({ type: 'click', x: 2, y: 2 })
// En el orden del plan (los nombres empiezan por su número).
scenarios.sort((left, right) => left.name.localeCompare(right.name))
for (const { name, run } of scenarios) {
  const before = checks
  try {
    renderError = undefined
    await run()
    window.results.push({ name, ok: true, checks: checks - before })
  } catch (error) {
    window.results.push({ name, ok: false, error: error.message + (renderError && renderError !== error ? ' (render: ' + renderError.message + ')' : '') })
  }
  await unmount().catch(() => null)
}
window.done = true
`

const keyCodes = {
  ' ': { code: 'Space', text: ' ', windowsVirtualKeyCode: 32 },
  Enter: { code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 },
  Escape: { code: 'Escape', windowsVirtualKeyCode: 27 },
  Tab: { code: 'Tab', windowsVirtualKeyCode: 9 },
  ArrowLeft: { code: 'ArrowLeft', windowsVirtualKeyCode: 37 },
  ArrowRight: { code: 'ArrowRight', windowsVirtualKeyCode: 39 },
}

async function runPage(call, root) {
  const { targetId } = await call('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await call('Target.attachToTarget', {
    targetId,
    flatten: true,
  })
  const send = (method, params = {}) => call(method, params, sessionId)
  await send('Page.enable')
  await send('Runtime.enable')
  // Sin esto, `focus()` no dispara los eventos de foco en Chrome headless
  // (ERRORES-CONOCIDOS: cdp-sin-emulacion-de-foco-element-focus-no-dispara-
  // los-eventos-focus).
  await send('Emulation.setFocusEmulationEnabled', { enabled: true })
  await send('Page.navigate', {
    url: pathToFileURL(join(root, 'index.html')).href,
  })
  const evaluate = async (expression) =>
    (await send('Runtime.evaluate', { expression, returnByValue: true })).result
      ?.value
  for (let attempt = 0; attempt < 2400; attempt++) {
    await new Promise((done) => setTimeout(done, 25))
    const requests = await evaluate(
      'JSON.stringify(window.inputQueue ? window.inputQueue.splice(0) : [])',
    )
    for (const request of JSON.parse(requests ?? '[]')) {
      if (request.type === 'click') {
        for (const type of ['mousePressed', 'mouseReleased'])
          await send('Input.dispatchMouseEvent', {
            type,
            x: request.x,
            y: request.y,
            button: 'left',
            clickCount: request.clickCount ?? 1,
          })
      }
      if (request.type === 'move') {
        await send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: request.x,
          y: request.y,
        })
      }
      // El nombre y la descripción accesibles de un elemento, como los calcula
      // Chrome (su árbol de accesibilidad), para la página.
      if (request.type === 'ax') {
        const { result } = await send('Runtime.evaluate', {
          expression: `document.querySelector(${JSON.stringify(request.selector)})`,
        })
        const accessible = result?.objectId
          ? (
              await send('Accessibility.getPartialAXTree', {
                objectId: result.objectId,
                fetchRelatives: false,
              })
            ).nodes[0]
          : undefined
        const value = {
          name: accessible?.name?.value ?? null,
          description: accessible?.description?.value ?? null,
        }
        await evaluate(
          `(window.axResults = window.axResults || {})[${request.id}] = ${JSON.stringify(value)}`,
        )
      }
      if (request.type === 'key' || request.type === 'keyHold') {
        const key = keyCodes[request.key]
        const { text, ...rest } = key
        const down = {
          type: 'keyDown',
          key: request.key,
          ...rest,
          ...(text ? { text, unmodifiedText: text } : {}),
        }
        await send('Input.dispatchKeyEvent', down)
        // Una tecla sostenida: la repetición automática del sistema manda más
        // keyDown con `autoRepeat` (`event.repeat` en la página) antes de soltar.
        if (request.type === 'keyHold')
          for (let repeat = 0; repeat < 2; repeat++)
            await send('Input.dispatchKeyEvent', { ...down, autoRepeat: true })
        await send('Input.dispatchKeyEvent', {
          type: 'keyUp',
          key: request.key,
          ...rest,
        })
      }
      await evaluate(`window.inputDone.add(${request.id})`)
    }
    if (await evaluate('window.done === true'))
      return JSON.parse(await evaluate('JSON.stringify(window.results)'))
  }
  throw new Error(
    'la página no terminó: ' + (await evaluate('document.body.innerText')),
  )
}

test('coverLookVideoUrl: el video del look cuya imagen es la portada del grupo', () => {
  const cover = 'https://cdn.example/dante.jpg'
  const looks = [
    {
      lookId: 'a',
      name: 'A',
      lookType: 'photo_avatar',
      supportedEngines: [],
      previewImageUrl: 'https://cdn.example/a.jpg',
      previewVideoUrl: 'https://cdn.example/a.mp4',
    },
    {
      lookId: 'b',
      name: 'B',
      lookType: 'photo_avatar',
      supportedEngines: [],
      previewImageUrl: cover,
    },
    {
      lookId: 'c',
      name: 'C',
      lookType: 'photo_avatar',
      supportedEngines: [],
      previewImageUrl: cover,
      previewVideoUrl: 'https://cdn.example/c.mp4',
    },
  ]
  assert.equal(
    coverLookVideoUrl({ previewImageUrl: cover }, looks),
    'https://cdn.example/c.mp4',
    'el de portada con video, aunque otro look con video venga antes',
  )
  assert.equal(
    coverLookVideoUrl(
      { previewImageUrl: 'https://cdn.example/otra.jpg' },
      looks,
    ),
    'https://cdn.example/a.mp4',
    'sin coincidencia, el primero con video',
  )
  assert.equal(
    coverLookVideoUrl({ previewImageUrl: cover }, looks.slice(1, 2)),
    undefined,
    'la portada coincide pero no tiene video, y ninguno tiene: nada',
  )
  assert.equal(
    coverLookVideoUrl({ previewImageUrl: cover }, []),
    undefined,
    'sin looks: nada',
  )
  const noImage = [
    {
      lookId: 'd',
      name: 'D',
      lookType: 'photo_avatar',
      supportedEngines: [],
      previewVideoUrl: 'https://cdn.example/d.mp4',
    },
    looks[0],
  ]
  assert.equal(
    coverLookVideoUrl({}, noImage),
    'https://cdn.example/d.mp4',
    'un grupo sin portada no se empareja con un look sin imagen: el primero con video',
  )
})

test('la biblioteca de avatares en Chrome', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'vimo-avatar-library-ui-'))
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
      '<!doctype html><meta charset="utf-8"><div id="root"></div><script type="module" src="./app.js"></script>',
    )
    // 2 s con sonido: el reproductor lo carga y lo reproduce de verdad.
    execFileSync(ffmpeg, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=320x180:rate=25:duration=2',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=2',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      '-movflags',
      '+faststart',
      '-y',
      join(root, 'look.mp4'),
    ])
    const results = await withChrome(chrome, join(root, 'profile'), (call) =>
      runPage(call, root),
    )
    assert.ok(results.length > 0, 'sin escenarios')
    for (const result of results) {
      await t.test(result.name, () => {
        assert.ok(result.ok, result.error)
        assert.ok(result.checks > 0, 'el escenario no comprobó nada')
      })
    }
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 3 })
  }
})
