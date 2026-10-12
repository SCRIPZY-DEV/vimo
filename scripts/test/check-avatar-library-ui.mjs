// La biblioteca de avatares de las entregas 2b, 2c y 2d (design.md §12.2, §18,
// §19 y §20; plan-e2b WP-C, plan-e2c WP-G y plan-e2d WP-N) con sus componentes
// y hooks reales en Chrome headless, y HeyGen
// simulado: `avatarsApi` es el real con las lecturas y escrituras del sidecar
// y del store reemplazadas por un doble en memoria (grupos en dos páginas,
// looks por grupo, la clasificación por tipo, favoritos, altas y cambios de
// look principal), así ningún escenario habla con HeyGen, con el llavero ni
// con la red. `useHeyGenAccess` corre real, con la clave de HeyGen guardada en
// el doble de `apiKeysApi`. Los medios son archivos locales: un mp4 de 2 s con
// sonido generado con el ffmpeg del repo (el reproductor lo carga y lo
// reproduce de verdad) y rutas que no existen para las vistas previas que no
// hace falta decodificar. Las teclas y algunos clics son de verdad (CDP, desde
// Node): la página los pide por una cola y espera. Los escenarios corren sin
// CSS, salvo el 11, el 11b, el 11c y el 12, que cargan el de la app (Tailwind,
// compilado al armar el banco y sin la fuente remota) y fijan el tamaño de la
// ventana. Fija:
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
//   principal y el foco que vuelve tras un clic no activa nada; el botón de
//   eliminar va en la fila del nombre;
// - el reproductor de un look (LookPlayerDialog): se abre con un clic en la
//   ficha (el pie del segundo nivel ya no ofrece ningún botón para agregar),
//   muestra el nombre y el `<video>` con su `src` y arranca solo (entrega 2d),
//   en el stock y en el panel, también cuando el video llega después: con
//   sonido o, si el navegador lo rechaza (la política de reproducción
//   automática, simulada con un `NotAllowedError`), silenciado y con «Activar
//   el sonido»; otro rechazo (un video que no carga, un `AbortError`) no lo
//   silencia y, si tampoco arranca silenciado, queda en pausa con el sonido y
//   el botón grande; las vistas previas al pasar el mouse siguen mudas;
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
// - eliminar con dos opciones (entrega 2d, `AvatarDeleteMenu`, el mismo en la
//   tarjeta y el panel de la biblioteca y en «Mis avatares»): el botón de
//   eliminar despliega ahí mismo, con el foco en la primera opción (con el
//   teclado o con el mouse: en WebKit un clic no enfoca el botón), «Eliminar de
//   la lista», que elimina sin otro paso, y, en un avatar propio, «Eliminar
//   permanentemente de HeyGen», que se vuelve «Seguro» (el mismo botón, en su
//   lugar, con el foco, descripto por la advertencia) con «Cancelar» antes, en
//   el de la lista (Mayús+Tab lo alcanza); con el CSS de la app, en la ventana
//   de arranque y en la mínima, «Seguro» queda dentro del lugar de HeyGen y no
//   toca el de la lista en las tres variantes, y ni un clic de corrección donde
//   estaba la lista ni un doble clic sobre HeyGen (termine en «Seguro», en
//   «Cancelar» o entre los dos) eliminan; en la tarjeta de la biblioteca, a
//   450, 228 y 164 px, el velo cubre la imagen entera y las opciones quedan
//   centradas en él, antes y después de pedir «Seguro», con la advertencia
//   dentro del velo (escenario 11c; WebKit, la app de Tauri, lo cortaba si la
//   capa no llevaba ancho explícito, algo que Chrome no deja ver); con la
//   tarjeta cortada en un contenedor con scroll (escenario 11b, en «Mis
//   avatares» y en la biblioteca), abrir trae a la vista la opción enfocada,
//   también con Tab
//   hasta la primera tarjeta de una fila y Enter, mientras que armar y cerrar
//   no desplazan el contenedor y un clic de corrección donde estaba la lista no
//   elimina; con el menú abierto, Escape lo cierra a él y no al diálogo del
//   stock ni al panel, abierto con el teclado o con el mouse; un avatar de
//   stock solo tiene la lista y, en «Mis avatares» (el único lugar del stock
//   con el botón, arriba a la izquierda; «Agregado» pasa a la derecha), la
//   lista solo si el avatar está en la biblioteca; los nombres y descripciones
//   los confirma el árbol de accesibilidad de Chrome; salir de la tarjeta,
//   sacarle el foco, tocarla (sin abrir los looks), Escape (sin cerrar el
//   diálogo de atrás), «Cancelar» o tocar el velo lo cierran sin eliminar, con
//   el foco de vuelta en el botón y nunca en la caja del diálogo; ni el segundo
//   clic de un doble clic ni Enter o Espacio sostenidos confirman (ni
//   despliegan y repliegan); en «Mis avatares», «Seguro» pide
//   `deleteFromHeyGen` con el `groupId` y el nombre (solo para el log de
//   soporte), apaga la tarjeta («Eliminando…» en el botón, con el foco,
//   `aria-busy`) y no deja agregar ni arrancar otro borrado, con el diálogo sin
//   cerrarse (Escape, clic afuera ni la X); al lograrlo, avisa, la tarjeta
//   sale, se releen los avatares de la cuenta y se marca vieja la lista de la
//   biblioteca, y el foco del teclado va al botón vecino (el siguiente o el
//   anterior) o a la pestaña «Mis avatares» (con el mouse no se mueve); si
//   falla, avisa con el error y la tarjeta vuelve con el foco en su botón;
//   «Eliminar de la lista» ahí saca la entrada de la biblioteca y la tarjeta se
//   queda; en el panel, mientras elimina de HeyGen, el panel no se cierra y Tab
//   no sale; y la biblioteca entera (escenarios 10 y 10b): HeyGen desde la
//   tarjeta y desde el panel, la tarjeta que sale antes de la relectura, el
//   foco del teclado en la tarjeta vecina también tras «Eliminar de la lista»
//   desde la tarjeta (o, con la biblioteca vacía, en «Agregar de stock»), el
//   aviso «{{name}} salió de tu lista.» y un borrado de HeyGen a la vez (con
//   uno en vuelo, el botón de las demás tarjetas y del panel está apagado y no
//   despliega); con el CSS de la app (escenario 12), el segundo clic de un
//   doble clic sobre «Eliminar de la lista» no abre el panel de la tarjeta
//   vecina ni los looks en «Mis avatares»; la grilla de la biblioteca termina
//   su entrada antes de cada clic de verdad, así ningún escenario depende del
//   orden; y cada texto del menú (las nueve `avatars.eliminar.*`) se compara
//   solo si su clave existe en el catálogo (`deleteText`): un renombre no pasa
//   en vacío;
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
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
// El CLI de Tailwind del repo, para compilar el CSS de la app.
const tailwindCli = fileURLToPath(
  new URL('../../node_modules/tailwindcss/lib/cli.js', import.meta.url),
)
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
    'export const avatarsApi = { ...real, isNative: () => true, list: () => window.api.list(), listStockGroups: (payload) => window.api.listStockGroups(payload), listStockLooks: (payload) => window.api.listStockLooks(payload), listStockTypes: (payload) => window.api.listStockTypes(payload), readStockFavorites: () => window.api.readStockFavorites(), writeStockFavorites: (ids) => window.api.writeStockFavorites(ids), addAvatar: (payload) => window.api.addAvatar(payload), setMainLook: (payload) => window.api.setMainLook(payload), refresh: (id) => window.api.refresh(id), balance: () => window.api.balance(), deleteFromHeyGen: (payload) => window.api.deleteFromHeyGen(payload), remove: (id) => window.api.remove(id), imageSource: (path) => "fixture-image:" + path }',
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
import { useAvatars } from '@/modules/avatars/hooks/useAvatars'
import { AvatarLibrary } from '@/modules/avatars/views/AvatarLibrary'
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
// La política de reproducción automática, simulada: con window.playBlock =
// { name, muted } un play() con sonido se rechaza con el error que daría el
// navegador («NotAllowedError»: hace falta un gesto de la persona;
// «AbortError»: el pedido se cortó) y, con muted, también el silenciado del
// reproductor (el único video con preload="metadata"; las vistas previas al
// pasar el mouse van mudas y no se tocan); con until, el rechazo espera a esa
// promesa (el escenario la suelta cuando quiere que llegue).
const originalPlay = HTMLMediaElement.prototype.play
window.playBlock = null
HTMLMediaElement.prototype.play = function () {
  const inPlayer = this.getAttribute('preload') === 'metadata'
  window.playElements.push(this)
  window.playCalls.push({ src: this.getAttribute('src'), muted: this.muted, loop: this.loop, event: window.event ? window.event.type : null, player: inPlayer })
  const block = window.playBlock
  if (!block || !inPlayer || (this.muted && !block.muted)) return originalPlay.call(this)

  const error = new DOMException('rechazo simulado', block.name)
  if (!block.until) return Promise.reject(error)
  return block.until.then(() => Promise.reject(error))
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
  const calls = { list: 0, groups: [], looks: [], types: 0, readFavorites: 0, writeFavorites: [], add: [], setMain: [], deleteHeyGen: [], remove: [] }
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
    // Como HeyGen: el grupo borrado ya no sale en el listado de la cuenta; y
    // como el sidecar: quita de la biblioteca sus entradas y dice cuáles.
    async deleteFromHeyGen(payload) {
      calls.deleteHeyGen.push(payload)
      api.privateGroups = api.privateGroups.filter((item) => item.groupId !== payload.groupId)
      const removedEntryIds = api.avatars.filter((item) => item.groupId === payload.groupId).map((item) => item.id)
      api.avatars = api.avatars.filter((item) => item.groupId !== payload.groupId)
      return { groupId: payload.groupId, removedEntryIds }
    },
    // Quitar de la biblioteca: la entrada sale de la lista que lee la vista.
    async remove(id) {
      calls.remove.push(id)
      api.avatars = api.avatars.filter((item) => item.id !== id)
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

scenario('5a · reproductor del stock: abre y arranca solo, con sonido; Espacio pausa, el botón grande reproduce y carga a la biblioteca', async () => {
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
  check(!video.hasAttribute('autoplay') && !video.loop, 'sin el atributo autoplay (lo arranca el reproductor) y sin loop')
  check(video.getAttribute('preload') === 'metadata', 'preload=metadata')
  const stage = byLabel(tr('avatars.stock.previewAria', { name: 'Dante oficina' }), player)
  check(document.activeElement === stage, 'al abrir, el foco va al escenario: ' + document.activeElement?.outerHTML.slice(0, 80))
  // Arranca solo, con sonido: un solo play(), sin silenciar.
  await waitFor(() => !video.paused, 'al abrirse, el video arranca solo')
  const autoCalls = window.playCalls.filter((call) => call.src === media('look.mp4'))
  check(autoCalls.length === 1 && autoCalls[0].muted === false && !video.muted, 'un play() con sonido: ' + JSON.stringify(autoCalls))
  await waitFor(() => byLabel(tr('common.player.pause'), player), 'la barra dice «Pausar»')
  check(!byLabel(tr('common.player.play'), player) && byLabel(tr('avatars.reproductor.silenciar'), player), 'sin el botón grande y con el sonido activo («Silenciar»)')
  check(document.activeElement === stage, 'el foco sigue en el escenario: ' + document.activeElement?.outerHTML.slice(0, 80))
  await waitFor(() => player.textContent.includes('0:02'), 'la duración del video (0:02) en la barra')
  check(buttonNamed(tr('avatars.reproductor.cargar'), player), 'el botón dice «Cargar a la biblioteca»')
  // Lo demás sigue igual: Espacio en el escenario pausa y el botón grande
  // reproduce, con sonido y desde el clic.
  await pressKey(' ')
  await waitFor(() => video.paused, 'Espacio en el escenario pausa')
  window.playCalls = []
  byLabel(tr('common.player.play'), player).click()
  await waitFor(() => !video.paused, 'el botón grande reproduce')
  check(window.playCalls.length === 1 && window.playCalls[0].event === 'click' && window.playCalls[0].muted === false, 'play() con sonido y desde el clic: ' + JSON.stringify(window.playCalls))
  await waitFor(() => byLabel(tr('common.player.pause'), player), 'la barra pasa a «Pausar»')
  check(document.activeElement === stage, 'tras el botón grande, el foco queda en el escenario')

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
  // El banco no carga CSS: el video ocupa su lugar cuando llegan sus medidas,
  // y el botón grande y el spinner de carga entran y salen mientras anda (y al
  // terminar sus 2 s), y lo de abajo se corre. Con el video cargado y en pausa,
  // la X queda quieta para el clic de verdad.
  await waitFor(() => playerVideo()?.readyState >= 1 && !playerVideo().paused, 'el video arranca')
  byLabel(tr('common.player.pause'), topDialog()).click()
  await waitFor(() => playerVideo().paused && byLabel(tr('common.player.play'), topDialog()), 'en pausa')
  await delay(100)
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
  // Arranca solo: se pausa para medir la línea de tiempo con el video quieto.
  await waitFor(() => !video.paused, 'arranca solo')
  byLabel(tr('common.player.pause'), player).click()
  await waitFor(() => video.paused, 'la barra lo pausa')

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
  await delay(100)
  check(!playerVideo().muted, 'el arranque que falla porque el video no carga no lo silencia (no es la política de reproducción)')
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

scenario('5f · reproductor: si cambia el video, empieza de cero (un video roto reemplazado por uno bueno ofrece sus controles y arranca solo) y el foco sigue en el escenario', async () => {
  fakeApi()
  mount(<SwapVideoHost initialUrl={media('missing.mp4')} />)
  await waitFor(() => topDialog()?.textContent.includes(tr('avatars.reproductor.errorVideo')), 'el video roto lo dice')
  const stageLabel = tr('avatars.stock.previewAria', { name: 'Dante oficina' })
  check(document.activeElement === byLabel(stageLabel, topDialog()), 'el foco está en el escenario')
  window.swapVideo(media('look.mp4'))
  await waitFor(() => playerVideo()?.getAttribute('src') === media('look.mp4') && byLabel(tr('common.player.position'), topDialog()), 'con el video nuevo, sus controles')
  check(!topDialog().textContent.includes(tr('avatars.reproductor.errorVideo')), 'sin el aviso del video anterior')
  await waitFor(() => playerVideo().readyState >= 1, 'el video nuevo carga')
  await waitFor(() => !playerVideo().paused && !playerVideo().muted, 'y arranca solo, con sonido')
  await waitFor(() => document.activeElement === byLabel(stageLabel, topDialog()), 'el foco sigue en el escenario (el nuevo), no en la caja del diálogo: ' + document.activeElement?.outerHTML.slice(0, 80))
})
// Abre el reproductor de la portada de Dante con la política simulada y espera
// a que el reproductor termine de intentar arrancar.
async function openCoverPlayer(block) {
  window.playBlock = block
  mount(<StockLooksDialog entries={[]} onOpenAvatar={() => {}} onClose={() => {}} />)
  ;(await openDanteLooks()).click()
  await waitFor(() => dialogs().length === 2 && playerVideo(), 'el reproductor abre')
  await delay(300)
  return { player: topDialog(), video: playerVideo(), calls: () => window.playCalls.filter((call) => call.src === media('look.mp4')) }
}

scenario('5g · reproductor: si el navegador no deja arrancar con sonido, arranca silenciado con «Activar el sonido»; otro rechazo no lo silencia; si tampoco arranca silenciado, queda en pausa con el sonido y el botón grande; un rechazo que llega con el reproductor cerrado no toca el video', async () => {
  fakeApi()
  try {
    // La política lo rechaza con sonido: arranca silenciado.
    let { player, video, calls } = await openCoverPlayer({ name: 'NotAllowedError', muted: false })
    await waitFor(() => !video.paused, 'arranca igual, silenciado')
    check(calls().length === 2 && calls()[0].muted === false && calls()[1].muted === true, 'primero con sonido y, rechazado, silenciado: ' + JSON.stringify(calls()))
    check(video.muted && byLabel(tr('avatars.reproductor.activarSonido'), player), 'silenciado, con el botón de sonido en «Activar el sonido»')
    check(!byLabel(tr('common.player.play'), player), 'sin el botón grande: está andando')
    // Activar el sonido a mano: suena y sigue andando.
    window.playBlock = null
    byLabel(tr('avatars.reproductor.activarSonido'), player).click()
    await waitFor(() => !video.muted && byLabel(tr('avatars.reproductor.silenciar'), player), 'vuelve el sonido')
    check(!video.paused, 'y sigue andando')

    // Otro rechazo (el pedido se cortó) no es la política: no lo silencia ni
    // lo reintenta; queda en pausa con sonido y el botón grande.
    await unmount()
    fakeApi()
    ;({ player, video, calls } = await openCoverPlayer({ name: 'AbortError', muted: false }))
    check(calls().length === 1 && !video.muted && video.paused, 'un solo intento, sin silenciar: ' + JSON.stringify(calls()))
    check(byLabel(tr('common.player.play'), player) && byLabel(tr('avatars.reproductor.silenciar'), player), 'en pausa, con el botón grande y el sonido activo')

    // Ni silenciado: queda en pausa con el sonido de vuelta, y el botón grande
    // reproduce con sonido.
    await unmount()
    fakeApi()
    ;({ player, video, calls } = await openCoverPlayer({ name: 'NotAllowedError', muted: true }))
    check(calls().length === 2 && calls()[1].muted === true, 'intentó con sonido y silenciado: ' + JSON.stringify(calls()))
    await waitFor(() => !video.muted && byLabel(tr('avatars.reproductor.silenciar'), player), 'el sonido vuelve')
    check(video.paused && byLabel(tr('common.player.play'), player), 'en pausa, con el botón grande')
    window.playBlock = null
    window.playCalls = []
    byLabel(tr('common.player.play'), player).click()
    await waitFor(() => !video.paused, 'el botón grande reproduce')
    check(window.playCalls.length === 1 && window.playCalls[0].muted === false && window.playCalls[0].event === 'click', 'con sonido y desde el clic: ' + JSON.stringify(window.playCalls))

    // El rechazo llega tarde, con el reproductor ya cerrado: no silencia ni
    // vuelve a intentar sobre un video que salió del documento (lo haría andar
    // igual).
    await unmount()
    fakeApi()
    const late = gate()
    window.playBlock = { name: 'NotAllowedError', muted: false, until: late.promise }
    mount(<StockLooksDialog entries={[]} onOpenAvatar={() => {}} onClose={() => {}} />)
    ;(await openDanteLooks()).click()
    await waitFor(() => dialogs().length === 2 && playerVideo(), 'el reproductor abre')
    const closedVideo = playerVideo()
    await pressKey('Escape')
    await waitFor(() => dialogs().length === 1, 'se cierra antes de que el navegador responda')
    late.resolve()
    await delay(300)
    const playerCalls = window.playCalls.filter((call) => call.player)
    check(playerCalls.length === 1 && !closedVideo.muted && closedVideo.paused, 'el rechazo tardío no silencia ni vuelve a intentar: ' + JSON.stringify(playerCalls))
  } finally {
    window.playBlock = null
  }
})

scenario('6b · panel del avatar: mientras la lista de HeyGen llega, el reproductor espera (no dice «sin video»); al llegar, el video arranca solo, con el foco en el escenario', async () => {
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
  check(window.playCalls.every((call) => call.src !== media('look.mp4')), 'sin video no reproduce nada: ' + JSON.stringify(window.playCalls))
  remote.resolve()
  await waitFor(() => playerVideo()?.getAttribute('src') === media('look.mp4'), 'al llegar la lista, el video del look')
  check(!topDialog().textContent.includes(tr('avatars.reproductor.sinVideo')), 'sin el aviso de «sin video»')
  // Arranca solo aunque llegue después, sin un gesto de por medio (en el
  // banco, la página ya tuvo un clic: Chrome lo deja sonar).
  await waitFor(() => !playerVideo().paused, 'el video que llega después arranca solo')
  const lateCalls = window.playCalls.filter((call) => call.src === media('look.mp4'))
  check(lateCalls.length === 1 && lateCalls[0].muted === false && lateCalls[0].event === null, 'un play() con sonido, fuera de un evento: ' + JSON.stringify(lateCalls))
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
  await waitFor(() => !playerVideo().paused && !playerVideo().muted, 'en el panel también arranca solo, con sonido')
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

scenario('7 · tarjeta de la biblioteca: cada imagen reproduce el video de su look y el foco del teclado, el de la principal; eliminar va en la fila del nombre', async () => {
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
  const trash = byLabel(deleteText('avatars.eliminar.botonAria', { name: 'Ana' }), card)
  check(trash && trash.closest('div.flex') === name.parentElement.closest('div.flex') && name.parentElement.contains(trash), 'el botón de eliminar está en la fila del nombre')

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

// ─── Entrega 2d: el menú de eliminar (tarjeta y panel de la biblioteca, «Mis avatares») ───
// Las claves de sus opciones.
const LIST = 'avatars.eliminar.deLista'
const HEYGEN = 'avatars.eliminar.deHeygen'
const SURE = 'avatars.eliminar.seguro'
const CANCEL = 'avatars.eliminar.cancelar'
// El texto de una clave del menú (las nueve «avatars.eliminar.*»), comprobado:
// la clave existe en el catálogo, no sale como su ruta cruda y no deja
// variables sin resolver. Comparar con tr(clave) a secas pasa en vacío si la
// clave se renombra en los tres catálogos: i18next la traduce como su ruta, y
// el menú y el guard reciben lo mismo (ERRORES-CONOCIDOS: test-que-compara-el-
// texto-con-i18n-t-de-la-misma-clave-pasa-en-vacio-si-la-clave-no-existe; M2
// de la revisión final de la 2d).
function deleteText(key, options) {
  const sentence = tr(key, options)
  check(i18n.exists(key) && sentence !== key && !sentence.includes('{{'), 'la clave ' + key + ' es una frase del catálogo, no su ruta cruda ni una variable sin resolver: ' + sentence)
  return sentence
}
const cardOf = (groupId) => document.querySelector('[data-group-id="' + groupId + '"]')?.closest('article')
// El botón de eliminar de una tarjeta de «Mis avatares», o el de una raíz.
const trashIn = (root) => root?.querySelector('[data-avatar-delete]') ?? null
const trashFor = (groupId) => trashIn(cardOf(groupId))
// Sus opciones: el grupo que nombra su «aria-controls».
const optionsOf = (trigger) => (trigger ? document.getElementById(trigger.getAttribute('aria-controls')) : null)
// A la vista: ni «hidden» ni «inert» en él o en un ancestro (el banco no carga
// CSS; el menú marca así lo que no se ve, también en la app).
const onScreen = (element) => Boolean(element) && !element.closest('[hidden], [inert]')
const optionButtons = (trigger) => [...(optionsOf(trigger)?.querySelectorAll('button') ?? [])]
const shownOptions = (trigger) => optionButtons(trigger).filter(onScreen).map((button) => button.textContent.trim())
const optionOf = (trigger, key) => optionButtons(trigger).find((button) => onScreen(button) && button.textContent.trim() === deleteText(key)) ?? null
const warningOf = (trigger) => [...(optionsOf(trigger)?.querySelectorAll('p') ?? [])].find((paragraph) => paragraph.textContent === deleteText('avatars.eliminar.confirmarHeygen')) ?? null
// Cerrado: el ícono nombra al avatar, contraído y sin opciones a la vista.
const isClosed = (trigger, name) => trigger?.getAttribute('aria-label') === deleteText('avatars.eliminar.botonAria', { name }) && trigger.getAttribute('aria-expanded') === 'false' && !onScreen(optionsOf(trigger))
// Abierto, con estas opciones a la vista y en este orden.
const isOpenWith = (trigger, keys) => trigger?.getAttribute('aria-expanded') === 'true' && onScreen(optionsOf(trigger)) && same(shownOptions(trigger), keys.map((key) => deleteText(key)))
// Pide «Seguro»: la advertencia a la vista y describiendo a «Seguro», con
// «Cancelar» antes (en el lugar de «Eliminar de la lista»).
const isConfirming = (trigger) => isOpenWith(trigger, [CANCEL, SURE]) && onScreen(warningOf(trigger)) && optionOf(trigger, SURE)?.getAttribute('aria-describedby') === warningOf(trigger).id
// Los lugares de la confirmación (C1 de la revisión): «Seguro» es el mismo
// botón que era «Eliminar permanentemente de HeyGen» (no se mueve) y
// «Cancelar» va antes, en el lugar de «Eliminar de la lista», que se oculta.
// Es estructural: no depende del CSS (la geometría la mide el escenario 11).
const keepsSlots = (trigger, heygenButton) => {
  const cancel = optionOf(trigger, CANCEL)
  const list = optionButtons(trigger).find((button) => button.textContent.trim() === deleteText(LIST))
  return isConfirming(trigger) && optionOf(trigger, SURE) === heygenButton && Boolean(cancel.compareDocumentPosition(heygenButton) & Node.DOCUMENT_POSITION_FOLLOWING) && (!list || (!onScreen(list) && Boolean(cancel.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING)))
}
// Un doble clic de verdad: dos clics en el MISMO punto (el centro que tenía
// el elemento al primer clic), el segundo con detail 2, aunque entre los dos
// cambie lo que hay debajo.
async function doubleClickAt(element) {
  element.scrollIntoView({ block: 'center' })
  const rect = element.getBoundingClientRect()
  const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  await input({ type: 'click', ...point, clickCount: 1 })
  await input({ type: 'click', ...point, clickCount: 2 })
}
// Eliminando: su nombre es el texto que se ve («Eliminando…») y no hace nada.
const isDeleting = (trigger) => {
  const label = trigger?.querySelector('span')
  return Boolean(trigger) && !trigger.hasAttribute('aria-label') && trigger.getAttribute('aria-disabled') === 'true' && onScreen(label) && label.textContent === deleteText('avatars.eliminar.eliminando')
}
// El nombre y la descripción que calcula Chrome para un elemento (su árbol de
// accesibilidad, por CDP desde Node): lo que anuncia un lector de pantalla y
// lo que busca el control por voz. Se marca un momento para encontrarlo.
async function accessible(element) {
  const id = ++nextInput
  element.setAttribute('data-ax-probe', String(id))
  window.inputQueue.push({ id, type: 'ax', selector: '[data-ax-probe="' + id + '"]' })
  await waitFor(() => window.inputDone.has(id), 'accesibilidad de ' + element.tagName, 300)
  element.removeAttribute('data-ax-probe')
  return window.axResults[id]
}
// Cuántas veces cambia «aria-expanded» de un botón: una tecla sostenida que lo
// abriera y cerrara con cada repetición lo cambiaría de más.
function watchExpanded(trigger) {
  const changes = []
  const record = (records) => { for (const item of records) changes.push(item.oldValue) }
  const observer = new MutationObserver(record)
  observer.observe(trigger, { attributes: true, attributeFilter: ['aria-expanded'], attributeOldValue: true })
  return { changes, stop: () => { record(observer.takeRecords()); observer.disconnect() } }
}
const ownTab = () => buttonNamed(tr('avatars.stock.propios'))
async function openOwnTab() {
  const tab = await waitFor(ownTab, 'la pestaña «Mis avatares»')
  tab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  tab.click()
  await waitFor(() => same(visibleGroupIds(), ['g-mia', 'g-leo', 'g-sol']), '«Mis avatares»: ' + visibleGroupIds())
}
const privateListings = (api) => api.calls.groups.filter((payload) => payload.ownership === 'private').length
// Con el teclado, desde el botón de eliminar de una tarjeta de «Mis avatares»:
// despliega (el foco pasa a la primera opción), va a «Eliminar
// permanentemente de HeyGen», pide «Seguro» y lo confirma.
async function deleteWithKeyboard(groupId) {
  const trigger = trashFor(groupId)
  trigger.focus()
  await pressKey('Enter')
  await waitFor(() => optionOf(trigger, HEYGEN), 'despliega el menú de ' + groupId)
  if (optionOf(trigger, LIST)) await pressKey('Tab')
  check(document.activeElement === optionOf(trigger, HEYGEN), 'Tab llega a «Eliminar permanentemente de HeyGen» de ' + groupId + ': ' + document.activeElement?.outerHTML.slice(0, 100))
  await pressKey('Enter')
  await waitFor(() => isConfirming(trigger), 'pide «Seguro» para ' + groupId)
  await pressKey('Enter')
}
const hasAddedBadge = (groupId) => [...(cardOf(groupId)?.querySelectorAll('span') ?? [])].some((span) => span.textContent === tr('avatars.stock.agregado'))

// Un avatar propio de la biblioteca: su menú ofrece también HeyGen.
const PIA_OWN = { ...ANA, id: 'pia-own', name: 'Pía', groupId: 'g-pia', ownership: 'own' }

// La tarjeta de la biblioteca como la monta la biblioteca: anota en
// window.cardEvents lo que pide (abrir el panel, quitar de la lista, eliminar
// de HeyGen) y deja el borrado en HeyGen en vuelo hasta que el escenario lo
// termina sin lograrlo (window.finishHeyGenDelete). Con botones antes y
// después, para el Tab. Sin «withHeyGen», como la monta la biblioteca de hoy.
function LibraryCardHost({ avatar, withHeyGen = true }) {
  const [deleting, setDeleting] = React.useState(false)
  window.finishHeyGenDelete = () => setDeleting(false)
  const deleteFromHeyGen = (item) => {
    window.cardEvents.push('heygen:' + item.id)
    setDeleting(true)
  }
  return (
    <>
      <button type="button" id="before">antes</button>
      <AvatarCard avatar={avatar} disabled={false} deleting={deleting} onOpen={(item) => window.cardEvents.push('open:' + item.id)} onDelete={(item) => window.cardEvents.push('list:' + item.id)} onDeleteFromHeyGen={withHeyGen ? deleteFromHeyGen : undefined} />
      <button type="button" id="after">después</button>
    </>
  )
}

// El panel como lo monta la biblioteca: anota en window.panelEvents y deja el
// borrado en HeyGen en vuelo hasta window.finishHeyGenDelete.
function PanelHost({ avatar }) {
  const [deleting, setDeleting] = React.useState(false)
  window.finishHeyGenDelete = () => setDeleting(false)
  const deleteFromHeyGen = () => {
    window.panelEvents.push('heygen')
    setDeleting(true)
  }
  return <AvatarDetailDialog avatar={avatar} deleting={deleting} onClose={() => window.panelEvents.push('close')} onRemove={() => window.panelEvents.push('list')} onDeleteFromHeyGen={deleteFromHeyGen} />
}

// El stock como lo monta la biblioteca: «entries» sale de la lista de la
// biblioteca (el doble), así «Eliminar de la lista» la cambia de verdad.
function LibraryStockHost() {
  const { entries } = useAvatars()
  return <StockLooksDialog entries={entries} onOpenAvatar={() => {}} onClose={() => {}} />
}

const libraryCard = (id) => waitFor(() => document.querySelector('[data-avatar-id="' + id + '"]')?.closest('article'), 'la tarjeta ' + id)
// La grilla de la biblioteca entra con una animación (motion.ul: opacidad e
// y: 12): un clic de verdad durante la entrada cae corrido, en otra tarjeta.
// Antes de los clics se espera a que termine, así el escenario no depende de
// lo que corrió antes (M1 de la revisión).
async function libraryGridSettled() {
  await waitFor(() => {
    const grid = document.querySelector('[data-avatar-id]')?.closest('ul')
    if (!grid) return false

    const { transform, opacity } = getComputedStyle(grid)
    return (transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)') && opacity === '1'
  }, 'la grilla de la biblioteca terminó de entrar')
}

scenario('7b · tarjeta de la biblioteca: el botón de eliminar despliega ahí mismo «Eliminar de la lista», que elimina sin otro paso, y, en un avatar propio, «Eliminar permanentemente de HeyGen», que pide «Seguro» antes de eliminar; un avatar de stock solo tiene la lista', async () => {
  fakeApi()
  window.cardEvents = []
  mount(<LibraryCardHost avatar={PIA_OWN} />)
  const card = await libraryCard('pia-own')
  const trigger = trashIn(card)
  check(isClosed(trigger, 'Pía'), 'cerrado: el ícono «Eliminar Pía», contraído y sin opciones: ' + trigger?.outerHTML.slice(0, 160))
  check(card.querySelector('[data-avatar-id]').parentElement.contains(trigger), 'el botón va en la fila del nombre')
  check(card.contains(optionsOf(trigger)), 'las opciones están en la misma tarjeta')
  const idle = await accessible(trigger)
  check(idle.name === deleteText('avatars.eliminar.botonAria', { name: 'Pía' }), 'para Chrome se llama «Eliminar Pía»: ' + JSON.stringify(idle))

  // El primer clic despliega las dos opciones, con el foco en la primera (como
  // en WebKit, donde el clic no enfoca el botón), y no elimina nada.
  await clickOn(trigger)
  await waitFor(() => isOpenWith(trigger, [LIST, HEYGEN]), 'el clic despliega las dos opciones: ' + JSON.stringify(shownOptions(trigger)))
  check(document.activeElement === optionOf(trigger, LIST), 'el primer gesto enfoca la primera opción, «Eliminar de la lista»: ' + document.activeElement?.outerHTML.slice(0, 100))
  const options = await accessible(optionsOf(trigger))
  check(options.name === deleteText('avatars.eliminar.opcionesAria', { name: 'Pía' }), 'el grupo de opciones se llama «Cómo eliminar Pía»: ' + JSON.stringify(options))
  check(optionOf(trigger, HEYGEN).className.includes('bg-destructive'), '«Eliminar permanentemente de HeyGen» va en rojo')
  check(window.cardEvents.length === 0, 'desplegar no elimina nada: ' + JSON.stringify(window.cardEvents))

  // «Eliminar de la lista»: sin otro paso.
  await clickOn(optionOf(trigger, LIST))
  await waitFor(() => window.cardEvents.length === 1, '«Eliminar de la lista» quita')
  check(same(window.cardEvents, ['list:pia-own']), 'una vez, sin pedir nada más: ' + JSON.stringify(window.cardEvents))
  await waitFor(() => isClosed(trigger, 'Pía'), 'y el menú se cierra')
  check(document.activeElement === trigger, 'con el foco de vuelta en el botón: ' + document.activeElement?.outerHTML.slice(0, 100))

  // HeyGen: el primer clic pide «Seguro» y le pasa el foco (la opción que lo
  // tenía se oculta); recién «Seguro» elimina.
  await clickOn(trigger)
  await waitFor(() => isOpenWith(trigger, [LIST, HEYGEN]), 'despliega otra vez')
  const heygenButton = optionOf(trigger, HEYGEN)
  await clickOn(heygenButton)
  await waitFor(() => isConfirming(trigger), '«Eliminar permanentemente de HeyGen» pide «Seguro», con la advertencia y «Cancelar»')
  check(keepsSlots(trigger, heygenButton), '«Seguro» es el mismo botón de HeyGen y «Cancelar» toma el lugar de la lista: ' + JSON.stringify(shownOptions(trigger)))
  check(document.activeElement === optionOf(trigger, SURE), 'el foco pasa a «Seguro» (no queda en la opción oculta): ' + document.activeElement?.outerHTML.slice(0, 100))
  check(warningOf(trigger).textContent === deleteText('avatars.eliminar.confirmarHeygen'), 'la advertencia dice que se elimina también de HeyGen')
  const sure = await accessible(optionOf(trigger, SURE))
  check(sure.name === deleteText(SURE) && sure.description === deleteText('avatars.eliminar.confirmarHeygen'), 'para Chrome, «Seguro» y lo describe la advertencia: ' + JSON.stringify(sure))
  check(same(window.cardEvents, ['list:pia-own']), 'pedir «Seguro» no elimina: ' + JSON.stringify(window.cardEvents))
  await clickOn(optionOf(trigger, SURE))
  await waitFor(() => window.cardEvents.length === 2, '«Seguro» elimina de HeyGen')
  check(same(window.cardEvents, ['list:pia-own', 'heygen:pia-own']), 'una vez: ' + JSON.stringify(window.cardEvents))
  await waitFor(() => isDeleting(trigger), 'mientras elimina, el botón dice «Eliminando…»')
  const deleting = await accessible(trigger)
  check(deleting.name === deleteText('avatars.eliminar.eliminando') && deleting.description === 'Pía', 'para Chrome, «Eliminando…», descripto por Pía: ' + JSON.stringify(deleting))
  // En la fila del nombre el botón no crece (una pastilla ancha dejaba el
  // nombre en cero): el texto es para el lector de pantalla y la tarjeta se
  // apaga, como en «Mis avatares».
  check(trigger.querySelector('span').classList.contains('sr-only') && trigger.className.includes('w-8'), 'el botón sigue del tamaño del ícono: ' + trigger.className)
  check(card.getAttribute('aria-busy') === 'true' && card.className.includes('opacity-50'), 'la tarjeta se apaga mientras elimina')
  await clickOn(trigger)
  await delay(100)
  check(trigger.getAttribute('aria-expanded') === 'false' && window.cardEvents.length === 2, 'mientras elimina, el botón no hace nada')
  // Un error devuelve la tarjeta: el botón vuelve a reposo.
  window.finishHeyGenDelete()
  await waitFor(() => isClosed(trigger, 'Pía'), 'si falla, el botón vuelve a reposo')
  check(card.getAttribute('aria-busy') === 'false' && !card.className.includes('opacity-50'), 'y la tarjeta vuelve')

  // Un avatar de stock solo se quita de la lista; uno propio sin el borrado
  // en HeyGen de quien lo monta, tampoco lo ofrece.
  await unmount()
  window.cardEvents = []
  mount(<><LibraryCardHost avatar={ANA_CARD} /><LibraryCardHost avatar={{ ...PIA_OWN, id: 'pia-2' }} withHeyGen={false} /></>)
  for (const [id, name] of [['ana-card', 'Ana'], ['pia-2', 'Pía']]) {
    const other = trashIn(await libraryCard(id))
    await clickOn(other)
    await waitFor(() => isOpenWith(other, [LIST]), name + ': solo «Eliminar de la lista»: ' + JSON.stringify(shownOptions(other)))
    check(!onScreen(warningOf(other)) && window.cardEvents.length === 0, 'sin la advertencia de HeyGen y sin eliminar nada')
    await input({ type: 'move', x: 0, y: 0 })
    await waitFor(() => isClosed(other, name), 'cierra el de ' + name)
  }
})

scenario('7c · tarjeta de la biblioteca: salir de la tarjeta, sacarle el foco, Escape, «Cancelar» o tocar el velo cierran el menú sin eliminar; abrir el panel desde el nombre lo cierra', async () => {
  fakeApi()
  window.cardEvents = []
  mount(<LibraryCardHost avatar={PIA_OWN} />)
  const card = await libraryCard('pia-own')
  const trigger = trashIn(card)
  const opened = () => isOpenWith(trigger, [LIST, HEYGEN])

  // Salir de la tarjeta.
  await clickOn(trigger)
  await waitFor(opened, 'el clic despliega')
  await input({ type: 'move', x: 0, y: 0 })
  await waitFor(() => isClosed(trigger, 'Pía'), 'salir de la tarjeta lo cierra')

  // Con el teclado: Enter despliega con el foco en la primera opción; Tab
  // recorre las opciones sin cerrarlo; salir con Tab lo cierra, con el foco
  // en lo siguiente.
  trigger.focus()
  await pressKey('Enter')
  await waitFor(opened, 'Enter despliega')
  check(document.activeElement === optionOf(trigger, LIST), 'el primer gesto enfoca la primera opción, «Eliminar de la lista»: ' + document.activeElement?.outerHTML.slice(0, 100))
  await pressKey('Tab')
  check(document.activeElement === optionOf(trigger, HEYGEN) && opened(), 'Tab llega a «Eliminar permanentemente de HeyGen», sin cerrar el menú')
  await pressKey('Tab')
  await waitFor(() => isClosed(trigger, 'Pía'), 'salir con Tab lo cierra')
  check(document.activeElement === document.getElementById('after'), 'con el foco en lo siguiente: ' + document.activeElement?.outerHTML.slice(0, 100))

  // Escape, con el foco en una opción: lo cierra y el foco vuelve al botón.
  trigger.focus()
  await pressKey('Enter')
  await waitFor(opened, 'despliega otra vez')
  await pressKey('Escape')
  await waitFor(() => isClosed(trigger, 'Pía'), 'Escape lo cierra')
  check(document.activeElement === trigger, 'y el foco vuelve al botón: ' + document.activeElement?.outerHTML.slice(0, 100))

  // «Cancelar»: «Seguro» es el mismo botón que «Eliminar permanentemente…»
  // (el foco no se mueve al pedirlo) y «Cancelar» va antes: Mayús+Tab.
  await pressKey('Enter')
  await waitFor(opened, 'despliega otra vez')
  await pressKey('Tab')
  await pressKey('Enter')
  await waitFor(() => isConfirming(trigger), 'pide «Seguro»')
  check(document.activeElement === optionOf(trigger, SURE), 'el foco sigue en el mismo botón, ahora «Seguro»: ' + document.activeElement?.outerHTML.slice(0, 100))
  await pressKey('Shift+Tab')
  check(document.activeElement === optionOf(trigger, CANCEL), 'Mayús+Tab llega a «Cancelar»: ' + document.activeElement?.outerHTML.slice(0, 100))
  await pressKey('Enter')
  await waitFor(() => isClosed(trigger, 'Pía'), '«Cancelar» lo cierra')
  check(document.activeElement === trigger, 'con el foco en el botón: ' + document.activeElement?.outerHTML.slice(0, 100))

  // Tocar el velo (fuera de las opciones): el mousedown no mueve el foco y
  // el clic lo cierra.
  await clickOn(trigger)
  await waitFor(opened, 'despliega otra vez')
  const veil = optionsOf(trigger)
  const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
  veil.dispatchEvent(press)
  check(press.defaultPrevented, 'el mousedown sobre el velo no mueve el foco')
  veil.click()
  await waitFor(() => isClosed(trigger, 'Pía'), 'tocar el velo lo cierra')
  check(document.activeElement === trigger, 'con el foco de vuelta en el botón: ' + document.activeElement?.outerHTML.slice(0, 100))

  // El nombre abre el panel y cierra el menú (en WebKit el clic no le saca el
  // foco al botón: el menú quedaría abierto detrás).
  await clickOn(trigger)
  await waitFor(opened, 'despliega otra vez')
  card.querySelector('[data-avatar-id="pia-own"]').click()
  await waitFor(() => isClosed(trigger, 'Pía'), 'abrir el panel desde el nombre cierra el menú')
  check(same(window.cardEvents, ['open:pia-own']), 'abre el panel y ninguna vía eliminó nada: ' + JSON.stringify(window.cardEvents))
})

scenario('7d · tarjeta de la biblioteca: ni una tecla sostenida ni el segundo clic de un doble clic confirman: Enter sostenido despliega una vez y en «Eliminar permanentemente…» solo pide «Seguro»; soltar y volver a apretar, o un clic suelto, elimina', async () => {
  fakeApi()
  window.cardEvents = []
  mount(<LibraryCardHost avatar={PIA_OWN} />)
  const trigger = trashIn(await libraryCard('pia-own'))

  // Enter sostenido en el botón: despliega una sola vez y el foco pasa a la
  // primera opción, «Eliminar de la lista»; las repeticiones caen ahí y no la
  // eliminan (ni repliegan el menú).
  const expanded = watchExpanded(trigger)
  trigger.focus()
  await holdKey('Enter')
  await delay(200)
  expanded.stop()
  check(expanded.changes.length === 1 && isOpenWith(trigger, [LIST, HEYGEN]), 'Enter sostenido despliega una sola vez: ' + JSON.stringify(expanded.changes))
  check(document.activeElement === optionOf(trigger, LIST) && window.cardEvents.length === 0, 'el foco pasa a «Eliminar de la lista» y sus repeticiones no la eliminan: ' + JSON.stringify(window.cardEvents))
  // Con el menú abierto y el foco de vuelta en el botón (Mayús+Tab), Enter
  // sostenido lo cierra una sola vez: sus repeticiones no lo vuelven a abrir.
  trigger.focus()
  check(isOpenWith(trigger, [LIST, HEYGEN]), 'el foco en el botón no cierra el menú')
  const closing = watchExpanded(trigger)
  await holdKey('Enter')
  await delay(200)
  closing.stop()
  check(closing.changes.length === 1 && isClosed(trigger, 'Pía') && document.activeElement === trigger, 'Enter sostenido en el botón lo cierra una sola vez: ' + JSON.stringify(closing.changes))
  await pressKey('Enter')
  await waitFor(() => isOpenWith(trigger, [LIST, HEYGEN]) && document.activeElement === optionOf(trigger, LIST), 'soltar y volver a apretar lo abre, con el foco en la primera opción')

  // Enter sostenido en «Eliminar permanentemente de HeyGen»: solo pide
  // «Seguro» (es el mismo botón: sus repeticiones no confirman).
  await pressKey('Tab')
  check(document.activeElement === optionOf(trigger, HEYGEN), 'Tab llega a «Eliminar permanentemente de HeyGen»')
  await holdKey('Enter')
  await delay(200)
  check(isConfirming(trigger) && window.cardEvents.length === 0, 'Enter sostenido solo pide «Seguro»: ' + JSON.stringify(window.cardEvents))
  await pressKey('Enter')
  await waitFor(() => window.cardEvents.length === 1, 'soltar y volver a apretar Enter elimina')
  check(same(window.cardEvents, ['heygen:pia-own']), 'una vez: ' + JSON.stringify(window.cardEvents))
  check(document.activeElement === trigger && isDeleting(trigger), 'el foco espera en el botón, que dice «Eliminando…»: ' + document.activeElement?.outerHTML.slice(0, 100))
  window.finishHeyGenDelete()
  await waitFor(() => isClosed(trigger, 'Pía'), 'si falla, vuelve a reposo')
  check(document.activeElement === trigger, 'con el foco en el botón')

  // El segundo clic de un doble clic: en el botón no cierra lo que el primero
  // abrió; en «Eliminar permanentemente…», ya «Seguro», no elimina.
  await clickOn(trigger)
  await waitFor(() => isOpenWith(trigger, [LIST, HEYGEN]), 'el primer clic despliega')
  await clickOn(trigger, 2)
  await delay(150)
  check(isOpenWith(trigger, [LIST, HEYGEN]), 'el segundo clic del doble clic no lo cierra')
  await clickOn(optionOf(trigger, HEYGEN))
  await waitFor(() => isConfirming(trigger), 'pide «Seguro»')
  await clickOn(optionOf(trigger, SURE), 2)
  await delay(150)
  check(isConfirming(trigger) && window.cardEvents.length === 1, 'el segundo clic del doble clic no elimina: ' + JSON.stringify(window.cardEvents))
  await clickOn(optionOf(trigger, SURE))
  await waitFor(() => window.cardEvents.length === 2, 'un clic suelto después, sí')
  check(same(window.cardEvents, ['heygen:pia-own', 'heygen:pia-own']), 'una vez más: ' + JSON.stringify(window.cardEvents))
  window.finishHeyGenDelete()
  await waitFor(() => isClosed(trigger, 'Pía'), 'vuelve a reposo')

  // Un doble clic de verdad sobre «Eliminar permanentemente…» (M2 de la
  // revisión): el primero pide «Seguro» y el segundo, en el mismo punto, no
  // elimina ni cierra la confirmación, caiga donde caiga.
  await clickOn(trigger)
  await waitFor(() => isOpenWith(trigger, [LIST, HEYGEN]), 'despliega otra vez')
  await doubleClickAt(optionOf(trigger, HEYGEN))
  await delay(150)
  check(isConfirming(trigger) && window.cardEvents.length === 2, 'el doble clic sobre HeyGen deja «Seguro» a la vista, sin eliminar: ' + JSON.stringify(window.cardEvents))
})

scenario('6d · panel del avatar: el botón de eliminar despliega las dos opciones en un avatar propio y solo la lista en uno de stock; Escape cierra el menú y no el panel; ni una tecla sostenida ni un doble clic confirman; mientras elimina de HeyGen, el panel no se cierra y el foco no sale', async () => {
  const api = fakeApi()
  api.looksByGroup = { 'g-pia': ANA_REMOTE }
  window.panelEvents = []
  mount(<PanelHost avatar={PIA_OWN} />)
  const trigger = await waitFor(() => trashIn(topDialog()), 'el botón de eliminar del panel')
  const opened = () => isOpenWith(trigger, [LIST, HEYGEN])
  check(isClosed(trigger, 'Pía') && onScreen(trigger.querySelector('span')) && trigger.querySelector('span').textContent === deleteText('avatars.eliminar.boton'), 'cerrado, con su texto «Eliminar» a la vista')

  // Enter sostenido: despliega una vez y el foco pasa a la primera opción, que
  // ignora las repeticiones.
  const expanded = watchExpanded(trigger)
  trigger.focus()
  await holdKey('Enter')
  await delay(200)
  expanded.stop()
  check(expanded.changes.length === 1 && opened(), 'Enter sostenido despliega una sola vez: ' + JSON.stringify(expanded.changes))
  check(topDialog().contains(optionsOf(trigger)), 'las opciones están en el panel')
  check(document.activeElement === optionOf(trigger, LIST) && window.panelEvents.length === 0, 'el primer gesto enfoca «Eliminar de la lista» y las repeticiones no la eliminan: ' + JSON.stringify(window.panelEvents))

  // Escape con el menú abierto: lo cierra, el panel sigue y el foco vuelve al
  // botón.
  await pressKey('Escape')
  await waitFor(() => isClosed(trigger, 'Pía'), 'Escape cierra el menú')
  await delay(100)
  check(dialogs().length === 1 && window.panelEvents.length === 0, 'y no el panel: ' + JSON.stringify(window.panelEvents))
  check(document.activeElement === trigger, 'el foco vuelve al botón: ' + document.activeElement?.outerHTML.slice(0, 100))
  // Abierto con el mouse (en WebKit el clic no enfoca el botón): el foco pasa
  // igual a la primera opción y Escape cierra el menú, no el panel.
  await clickOn(trigger)
  await waitFor(opened, 'el clic despliega')
  check(document.activeElement === optionOf(trigger, LIST), 'con el mouse, el foco también pasa a la primera opción: ' + document.activeElement?.outerHTML.slice(0, 100))
  await pressKey('Escape')
  await waitFor(() => isClosed(trigger, 'Pía'), 'Escape cierra el menú abierto con el mouse')
  await delay(100)
  check(dialogs().length === 1 && window.panelEvents.length === 0 && document.activeElement === trigger, 'el panel sigue abierto y el foco vuelve al botón: ' + JSON.stringify(window.panelEvents))

  // «Eliminar de la lista»: sin otro paso (lo hace la biblioteca).
  await pressKey('Enter')
  await waitFor(opened, 'despliega otra vez')
  check(document.activeElement === optionOf(trigger, LIST), 'el foco en «Eliminar de la lista»')
  await pressKey('Enter')
  await waitFor(() => window.panelEvents.length === 1, 'quita de la lista')
  check(same(window.panelEvents, ['list']), 'una vez: ' + JSON.stringify(window.panelEvents))
  check(isClosed(trigger, 'Pía') && document.activeElement === trigger, 'el menú se cierra con el foco en el botón: ' + document.activeElement?.outerHTML.slice(0, 100))

  // Un doble clic de verdad sobre «Eliminar permanentemente…»: pide «Seguro»
  // y el segundo clic no elimina ni cierra la confirmación.
  await pressKey('Enter')
  await waitFor(opened, 'despliega otra vez')
  await doubleClickAt(optionOf(trigger, HEYGEN))
  await delay(150)
  check(isConfirming(trigger) && same(window.panelEvents, ['list']), 'el doble clic sobre HeyGen deja «Seguro» a la vista, sin eliminar: ' + JSON.stringify(window.panelEvents))
  await pressKey('Escape')
  await waitFor(() => isClosed(trigger, 'Pía'), 'Escape lo cierra')

  // HeyGen con Enter sostenido: solo pide «Seguro», en el lugar de siempre.
  await pressKey('Enter')
  await waitFor(opened, 'despliega otra vez')
  await pressKey('Tab')
  const heygenButton = optionOf(trigger, HEYGEN)
  check(document.activeElement === heygenButton, 'Tab llega a «Eliminar permanentemente de HeyGen»')
  await holdKey('Enter')
  await delay(200)
  check(isConfirming(trigger) && same(window.panelEvents, ['list']), 'Enter sostenido solo pide «Seguro»: ' + JSON.stringify(window.panelEvents))
  check(keepsSlots(trigger, heygenButton), '«Seguro» es el mismo botón de HeyGen y «Cancelar» toma el lugar de la lista: ' + JSON.stringify(shownOptions(trigger)))
  // El segundo clic de un doble clic sobre «Seguro» no elimina; uno suelto, sí.
  await clickOn(optionOf(trigger, SURE), 2)
  await delay(150)
  check(isConfirming(trigger) && same(window.panelEvents, ['list']), 'el segundo clic del doble clic no elimina: ' + JSON.stringify(window.panelEvents))
  await clickOn(optionOf(trigger, SURE))
  await waitFor(() => window.panelEvents.length === 2, '«Seguro» elimina de HeyGen')
  check(same(window.panelEvents, ['list', 'heygen']), 'una vez: ' + JSON.stringify(window.panelEvents))
  await waitFor(() => isDeleting(trigger), '«Eliminando…»')
  check(document.activeElement === trigger, 'el foco espera en el botón: ' + document.activeElement?.outerHTML.slice(0, 100))

  // En vuelo: Escape no cierra el panel, la X está apagada y Tab no sale.
  await pressKey('Escape')
  await delay(100)
  check(dialogs().length === 1 && !window.panelEvents.includes('close'), 'Escape no cierra el panel mientras elimina: ' + JSON.stringify(window.panelEvents))
  check(byLabel(tr('avatars.detalle.cerrar'), topDialog()).disabled, 'la X está apagada')
  for (let index = 0; index < 3; index++) {
    await pressKey('Tab')
    check(topDialog().contains(document.activeElement), 'Tab no sale del panel mientras elimina (vuelta ' + (index + 1) + '): ' + document.activeElement?.outerHTML.slice(0, 80))
  }
  window.finishHeyGenDelete()
  await waitFor(() => isClosed(trigger, 'Pía'), 'si falla, el botón vuelve a reposo')
  check(!byLabel(tr('avatars.detalle.cerrar'), topDialog()).disabled, 'y la X vuelve')
  trigger.focus()
  await pressKey('Escape')
  await waitFor(() => window.panelEvents.includes('close'), 'al terminar, Escape cierra el panel')

  // Un avatar de stock: solo «Eliminar de la lista».
  await unmount()
  fakeApi()
  window.panelEvents = []
  mount(<PanelHost avatar={ANA} />)
  const stockTrigger = await waitFor(() => trashIn(topDialog()), 'el panel de Ana')
  await clickOn(stockTrigger)
  await waitFor(() => isOpenWith(stockTrigger, [LIST]), 'un avatar de stock solo se quita de la lista: ' + JSON.stringify(shownOptions(stockTrigger)))
})

scenario('10 · biblioteca entera: «Eliminar de la lista» y «Eliminar permanentemente de HeyGen» desde la tarjeta y el panel, con su aviso, «Eliminando…» y el foco del teclado en la tarjeta vecina (o, con la biblioteca vacía, en «Agregar de stock»)', async () => {
  const api = fakeApi()
  const LEA = { ...ANA, id: 'lea-own', name: 'Lea', groupId: 'g-lea', ownership: 'own' }
  const TEO = { ...ANA, id: 'teo-1', name: 'Teo', groupId: 'g-teo' }
  api.avatars = [structuredClone(TEO), structuredClone(PIA_OWN), structuredClone(ANA), structuredClone(LEA)]
  api.looksByGroup = { 'g-teo': ANA_REMOTE, 'g-pia': ANA_REMOTE, 'g-ana': ANA_REMOTE, 'g-lea': ANA_REMOTE }
  const pending = []
  const instant = api.deleteFromHeyGen
  api.deleteFromHeyGen = (payload) => {
    const done = gate()
    pending.push({ done, payload })
    return done.promise.then(() => instant(payload))
  }
  // La relectura de la biblioteca tras un borrado espera a que el escenario
  // la suelte: la tarjeta tiene que salir antes, sin esperarla.
  const readList = api.list
  let slowList = null
  api.list = () => (slowList ? slowList.promise.then(() => readList()) : readList())
  mount(<AvatarLibrary />)
  const cardFor = (id) => document.querySelector('[data-avatar-id="' + id + '"]')?.closest('article')
  await waitFor(() => cardFor('lea-own'), 'las cuatro tarjetas')
  await libraryGridSettled()
  check(same([...document.querySelectorAll('[data-avatar-id]')].map((button) => button.dataset.avatarId), ['teo-1', 'pia-own', 'ana-1', 'lea-own']), 'en orden')

  // Ana (de stock): solo «Eliminar de la lista».
  const anaTrigger = trashIn(cardFor('ana-1'))
  await clickOn(anaTrigger)
  await waitFor(() => isOpenWith(anaTrigger, [LIST]), 'Ana: solo la lista')
  await input({ type: 'move', x: 0, y: 0 })
  await waitFor(() => isClosed(anaTrigger, 'Ana'), 'cierra')

  // Pía (propia), desde la tarjeta y con el teclado: HeyGen, «Seguro».
  const piaTrigger = trashIn(cardFor('pia-own'))
  piaTrigger.focus()
  await pressKey('Enter')
  await waitFor(() => isOpenWith(piaTrigger, [LIST, HEYGEN]), 'Pía: las dos opciones')
  await pressKey('Tab')
  await pressKey('Enter')
  await waitFor(() => isConfirming(piaTrigger), 'pide «Seguro»')
  await pressKey('Enter')
  await waitFor(() => pending.length === 1, 'pide el borrado')
  check(same(pending[0].payload, { groupId: 'g-pia', name: 'Pía' }), 'con el groupId y el nombre: ' + JSON.stringify(pending[0].payload))
  await waitFor(() => isDeleting(trashIn(cardFor('pia-own'))), '«Eliminando…» en la tarjeta')
  slowList = gate()
  const readsBefore = api.calls.list
  pending[0].done.resolve()
  await waitFor(() => !cardFor('pia-own'), 'la tarjeta sale sin esperar la relectura')
  check(api.calls.list === readsBefore, 'la relectura de la biblioteca sigue en vuelo: ' + api.calls.list)
  slowList.resolve()
  slowList = null
  await waitFor(() => api.calls.list > readsBefore, 'relee la biblioteca')
  await waitFor(() => window.toastLog.includes(tr('avatars.toasts.eliminadoHeygen', { name: 'Pía' })), 'el aviso: ' + JSON.stringify(window.toastLog))
  await delay(100)
  check(document.activeElement === document.querySelector('[data-avatar-id="ana-1"]'), 'el foco pasa al nombre de la tarjeta vecina, Ana: ' + document.activeElement?.outerHTML.slice(0, 100))

  // Lea (propia, la última), desde su panel: al lograrlo el panel se cierra
  // y el foco va a la anterior, Ana.
  document.querySelector('[data-avatar-id="lea-own"]').click()
  const leaTrigger = await waitFor(() => trashIn(topDialog()), 'el panel de Lea')
  leaTrigger.focus()
  await pressKey('Enter')
  await waitFor(() => isOpenWith(leaTrigger, [LIST, HEYGEN]), 'Lea: las dos opciones')
  await pressKey('Tab')
  await pressKey('Enter')
  await waitFor(() => isConfirming(leaTrigger), 'pide «Seguro»')
  await pressKey('Enter')
  await waitFor(() => pending.length === 2, 'pide el borrado de Lea')
  await waitFor(() => isDeleting(trashIn(topDialog())), '«Eliminando…» en el panel')
  await pressKey('Escape')
  await delay(100)
  check(dialogs().length === 1, 'el panel no se cierra mientras elimina')
  pending[1].done.resolve()
  await waitFor(() => dialogs().length === 0 && !cardFor('lea-own'), 'el panel se cierra y la tarjeta sale')
  await delay(100)
  check(document.activeElement === document.querySelector('[data-avatar-id="ana-1"]'), 'el foco va a la tarjeta anterior, Ana: ' + document.activeElement?.outerHTML.slice(0, 100))

  // «Eliminar de la lista» desde la tarjeta, con el teclado: el aviso nombra
  // al avatar y el foco pasa a la vecina (Ana es la última: la anterior,
  // Teo), nunca a <body> (I1 de la revisión).
  window.toastLog = []
  anaTrigger.focus()
  await pressKey('Enter')
  await waitFor(() => document.activeElement === optionOf(anaTrigger, LIST), 'el foco en «Eliminar de la lista»')
  await pressKey('Enter')
  await waitFor(() => api.calls.remove.length === 1, 'quita a Ana de la lista')
  check(same(api.calls.remove, ['ana-1']), 'su entrada: ' + JSON.stringify(api.calls.remove))
  await waitFor(() => window.toastLog.includes(tr('avatars.toasts.eliminadoLista', { name: 'Ana' })), 'el aviso «Ana salió de tu lista.»: ' + JSON.stringify(window.toastLog))
  await waitFor(() => !cardFor('ana-1'), 'la tarjeta sale')
  await delay(100)
  check(document.activeElement === document.querySelector('[data-avatar-id="teo-1"]'), 'el foco pasa al nombre de la vecina, Teo: ' + document.activeElement?.outerHTML.slice(0, 100))

  // La última tarjeta: con la biblioteca vacía, el foco va a «Agregar de
  // stock».
  const teoTrigger = trashIn(cardFor('teo-1'))
  teoTrigger.focus()
  await pressKey('Enter')
  await waitFor(() => document.activeElement === optionOf(teoTrigger, LIST), 'el foco en «Eliminar de la lista» de Teo')
  await pressKey('Enter')
  await waitFor(() => api.calls.remove.length === 2 && !cardFor('teo-1'), 'quita a Teo y la tarjeta sale')
  await delay(100)
  check(document.activeElement === buttonNamed(tr('avatars.agregarStock')), 'con la biblioteca vacía, el foco va a «Agregar de stock»: ' + document.activeElement?.outerHTML.slice(0, 100))
})

scenario('10b · biblioteca entera: un borrado de HeyGen a la vez, como en «Mis avatares»: con uno en vuelo, el botón de eliminar de otra tarjeta y del panel está apagado (sigue enfocable) y no despliega ni con Enter ni con un clic; al terminar, vuelve y elimina', async () => {
  const api = fakeApi()
  const LEA = { ...ANA, id: 'lea-own', name: 'Lea', groupId: 'g-lea', ownership: 'own' }
  api.avatars = [structuredClone(PIA_OWN), structuredClone(LEA)]
  api.looksByGroup = { 'g-pia': ANA_REMOTE, 'g-lea': ANA_REMOTE }
  const pending = []
  const instant = api.deleteFromHeyGen
  api.deleteFromHeyGen = (payload) => {
    const done = gate()
    pending.push({ done, payload })
    return done.promise.then(() => instant(payload))
  }
  mount(<AvatarLibrary />)
  const cardFor = (id) => document.querySelector('[data-avatar-id="' + id + '"]')?.closest('article')
  await waitFor(() => cardFor('lea-own'), 'las dos tarjetas')
  await libraryGridSettled()

  // Pía, con el mouse: HeyGen y «Seguro»; queda en vuelo.
  const piaTrigger = trashIn(cardFor('pia-own'))
  await clickOn(piaTrigger)
  await waitFor(() => isOpenWith(piaTrigger, [LIST, HEYGEN]), 'Pía: las dos opciones')
  await clickOn(optionOf(piaTrigger, HEYGEN))
  await waitFor(() => isConfirming(piaTrigger), 'pide «Seguro»')
  await clickOn(optionOf(piaTrigger, SURE))
  await waitFor(() => pending.length === 1, 'pide el borrado de Pía')
  await waitFor(() => isDeleting(trashIn(cardFor('pia-own'))), '«Eliminando…» en Pía')

  // El botón de Lea, apagado: no despliega con Enter ni con un clic.
  const leaTrigger = trashIn(cardFor('lea-own'))
  check(leaTrigger.getAttribute('aria-disabled') === 'true', 'con Pía en vuelo, el botón de Lea está apagado: ' + leaTrigger.outerHTML.slice(0, 160))
  leaTrigger.focus()
  check(document.activeElement === leaTrigger, 'y sigue enfocable')
  await pressKey('Enter')
  await delay(150)
  check(isClosed(leaTrigger, 'Lea'), 'Enter no despliega')
  await clickOn(leaTrigger)
  await delay(150)
  check(isClosed(leaTrigger, 'Lea') && pending.length === 1, 'un clic tampoco, y no sale otro pedido')

  // Su panel, igual.
  document.querySelector('[data-avatar-id="lea-own"]').click()
  const leaPanelTrigger = await waitFor(() => trashIn(topDialog()), 'el panel de Lea')
  check(leaPanelTrigger.getAttribute('aria-disabled') === 'true', 'en su panel, el botón también está apagado')
  leaPanelTrigger.focus()
  await pressKey('Enter')
  await delay(150)
  check(isClosed(leaPanelTrigger, 'Lea') && pending.length === 1, 'Enter no despliega y no sale otro pedido')
  await pressKey('Escape')
  await waitFor(() => dialogs().length === 0, 'Escape cierra el panel')

  // Al terminar el de Pía, el de Lea vuelve y elimina: de a uno, en orden.
  pending[0].done.resolve()
  await waitFor(() => !cardFor('pia-own'), 'Pía sale')
  await waitFor(() => trashIn(cardFor('lea-own'))?.getAttribute('aria-disabled') === 'false', 'el botón de Lea vuelve')
  const leaAgain = trashIn(cardFor('lea-own'))
  await clickOn(leaAgain)
  await waitFor(() => isOpenWith(leaAgain, [LIST, HEYGEN]), 'ahora despliega')
  await clickOn(optionOf(leaAgain, HEYGEN))
  await waitFor(() => isConfirming(leaAgain), 'pide «Seguro»')
  await clickOn(optionOf(leaAgain, SURE))
  await waitFor(() => pending.length === 2, 'sale el pedido de Lea')
  check(same(pending.map((item) => item.payload.groupId), ['g-pia', 'g-lea']), 'de a uno, en orden: ' + JSON.stringify(pending.map((item) => item.payload)))
  pending[1].done.resolve()
  await waitFor(() => !cardFor('lea-own'), 'Lea sale')
})

scenario('8 · «Mis avatares»: el botón de eliminar solo ahí; despliega «Eliminar de la lista» si el avatar está en la biblioteca y siempre «Eliminar permanentemente de HeyGen», que pide «Seguro»; salir de la tarjeta, tocarla, Escape, «Cancelar» o sacarle el foco lo cierran (el diálogo sigue y el foco nunca rebota a su caja) y el segundo clic de un doble clic no confirma', async () => {
  const api = fakeApi()
  let closes = 0
  mount(<StockLooksDialog entries={[{ id: 'lib-sol', groupId: 'g-sol' }]} onOpenAvatar={() => {}} onClose={() => { closes += 1 }} />)
  await waitFor(() => visibleGroupIds().length === 4, 'el stock público')
  check(document.querySelectorAll('[data-avatar-delete]').length === 0, '«De stock» no tiene botón de eliminar')
  check(ownTab()?.textContent === 'Mis avatares', 'la pestaña se llama «Mis avatares»: ' + ownTab()?.textContent)
  await openOwnTab()
  const dialogBox = dialogs()[0]
  check(['g-mia', 'g-leo', 'g-sol'].every((id) => trashFor(id)), 'cada tarjeta de «Mis avatares» trae su botón de eliminar')
  check(!heartOf('Mía'), 'sin corazón')
  const trash = trashFor('g-mia')
  check(isClosed(trash, 'Mía'), 'cerrado: «Eliminar Mía», contraído: ' + trash.outerHTML.slice(0, 160))
  check(trash.className.includes('left-2.5') && trash.className.includes('top-2.5'), 'arriba a la izquierda')
  check(trash.compareDocumentPosition(byLabel(tr('avatars.stock.verLooksAria', { name: 'Mía' }))) & Node.DOCUMENT_POSITION_FOLLOWING, 'antes que «Ver looks» (arriba, en la imagen)')
  const idle = await accessible(trash)
  check(idle.name === deleteText('avatars.eliminar.botonAria', { name: 'Mía' }), 'para Chrome, «Eliminar Mía»: ' + JSON.stringify(idle))
  const solBadge = [...cardOf('g-sol').querySelectorAll('span')].find((span) => span.textContent === tr('avatars.stock.agregado'))
  check(solBadge?.className.includes('right-2.5'), 'con el botón de eliminar, «Agregado» va arriba a la derecha')

  // Sol está en la biblioteca: las dos opciones, sobre su imagen; Mía no:
  // solo HeyGen.
  const sol = trashFor('g-sol')
  await clickOn(sol)
  await waitFor(() => isOpenWith(sol, [LIST, HEYGEN]), 'Sol (en la biblioteca): las dos opciones: ' + JSON.stringify(shownOptions(sol)))
  check(document.activeElement === optionOf(sol, LIST), 'el primer gesto (un clic) enfoca la primera opción: ' + document.activeElement?.outerHTML.slice(0, 100))
  check(solBadge.className.includes('opacity-0') && cardOf('g-sol').querySelector('.invisible [data-group-id]'), 'con el menú abierto, «Agregado», «Ver looks» y «Agregar» se ocultan')
  check(api.calls.deleteHeyGen.length === 0 && api.calls.looks.length === 0, 'desplegar no elimina ni abre los looks')
  await input({ type: 'move', x: 0, y: 0 })
  await waitFor(() => isClosed(sol, 'Sol'), 'salir de la tarjeta lo cierra')
  check(document.activeElement === sol, 'con el foco de vuelta en su botón: ' + document.activeElement?.outerHTML.slice(0, 100))
  await clickOn(trash)
  await waitFor(() => isOpenWith(trash, [HEYGEN]), 'Mía (fuera de la biblioteca): solo «Eliminar permanentemente de HeyGen»: ' + JSON.stringify(shownOptions(trash)))
  // El segundo clic de un doble clic sobre el botón no lo cierra.
  await clickOn(trash, 2)
  await delay(150)
  check(isOpenWith(trash, [HEYGEN]), 'el segundo clic del doble clic no lo cierra')
  // Abierto con el mouse (en WebKit el clic no enfoca el botón): el foco pasa
  // igual a la primera opción y Escape cierra el menú, no el diálogo.
  check(document.activeElement === optionOf(trash, HEYGEN), 'el foco está en la primera opción: ' + document.activeElement?.outerHTML.slice(0, 100))
  await pressKey('Escape')
  await waitFor(() => isClosed(trash, 'Mía'), 'Escape cierra el menú abierto con el mouse')
  await delay(100)
  check(closes === 0 && dialogs().length === 1 && document.activeElement === trash, 'el diálogo sigue abierto y el foco vuelve al botón: ' + closes)
  await clickOn(trash)
  await waitFor(() => isOpenWith(trash, [HEYGEN]), 'despliega otra vez')
  // «Eliminar permanentemente…» pide «Seguro» en su mismo lugar; el segundo
  // clic de un doble clic no elimina.
  const miaHeygen = optionOf(trash, HEYGEN)
  await clickOn(miaHeygen)
  await waitFor(() => isConfirming(trash), 'pide «Seguro», con la advertencia y «Cancelar»')
  check(keepsSlots(trash, miaHeygen), '«Seguro» es el mismo botón de HeyGen y «Cancelar» va antes: ' + JSON.stringify(shownOptions(trash)))
  const sure = await accessible(optionOf(trash, SURE))
  check(sure.name === deleteText(SURE) && sure.description === deleteText('avatars.eliminar.confirmarHeygen'), 'para Chrome, «Seguro» y lo describe la advertencia: ' + JSON.stringify(sure))
  await clickOn(optionOf(trash, SURE), 2)
  await delay(150)
  check(isConfirming(trash) && api.calls.deleteHeyGen.length === 0, 'el segundo clic del doble clic no elimina')
  // Tocar otra parte de la tarjeta lo cierra, sin abrir sus looks. Se toca la
  // imagen, que en el banco (sin CSS) está arriba del menú: al cerrarse, las
  // opciones dejan de ocupar lugar y lo de abajo (el nombre) sube entre el
  // mousedown y el mouseup, y el clic caería en la grilla y no en la tarjeta.
  await clickOn(cardOf('g-mia').firstElementChild.firstElementChild)
  await waitFor(() => isClosed(trash, 'Mía'), 'tocar la tarjeta lo cierra')
  await delay(100)
  check(!buttonNamed(tr('avatars.stock.volver')) && api.calls.looks.length === 0, 'y no abre los looks')
  await input({ type: 'move', x: 0, y: 0 })

  // Con el teclado: Enter despliega con el foco en la primera opción; Escape
  // lo cierra sin cerrar el diálogo.
  trash.focus()
  await pressKey('Enter')
  await waitFor(() => isOpenWith(trash, [HEYGEN]), 'Enter despliega')
  check(document.activeElement === optionOf(trash, HEYGEN), 'el primer gesto enfoca la primera opción, «Eliminar permanentemente de HeyGen»: ' + document.activeElement?.outerHTML.slice(0, 100))
  await pressKey('Escape')
  await waitFor(() => isClosed(trash, 'Mía'), 'Escape lo cierra')
  await delay(100)
  check(document.activeElement === trash && closes === 0 && dialogs().length === 1, 'el foco vuelve al botón y el diálogo sigue abierto: ' + closes)
  // «Cancelar».
  await pressKey('Enter')
  await waitFor(() => isOpenWith(trash, [HEYGEN]), 'despliega otra vez')
  await pressKey('Enter')
  await waitFor(() => isConfirming(trash), 'pide «Seguro»')
  check(document.activeElement === optionOf(trash, SURE), 'el foco sigue en el mismo botón, ahora «Seguro»')
  await pressKey('Shift+Tab')
  check(document.activeElement === optionOf(trash, CANCEL), 'Mayús+Tab llega a «Cancelar»')
  await pressKey('Enter')
  await waitFor(() => isClosed(trash, 'Mía'), '«Cancelar» lo cierra')
  check(document.activeElement === trash, 'con el foco en el botón')
  // Salir con Tab lo cierra y el foco pasa al control siguiente, nunca a la
  // caja del diálogo (en el blur nada sale del DOM). El banco no carga CSS:
  // el siguiente es «Ver looks» de la misma tarjeta; en la app, con su barra
  // oculta mientras el menú está abierto, es el botón de la tarjeta siguiente.
  await pressKey('Enter')
  await waitFor(() => isOpenWith(trash, [HEYGEN]), 'despliega otra vez')
  await pressKey('Tab')
  await waitFor(() => isClosed(trash, 'Mía'), 'salir con Tab lo cierra')
  await delay(100)
  check(document.activeElement === byLabel(tr('avatars.stock.verLooksAria', { name: 'Mía' })), 'el foco llega al control siguiente, no a la caja del diálogo: ' + document.activeElement?.outerHTML.slice(0, 100))
  check(document.activeElement !== dialogBox && api.calls.deleteHeyGen.length === 0, 'nada se eliminó')
})

scenario('8b · «Mis avatares»: «Seguro» pide el borrado con el groupId y el nombre y apaga la tarjeta («Eliminando…» en el botón, con el foco); al lograrlo avisa, la saca y relee la cuenta y la biblioteca; el foco del teclado va al botón vecino o a la pestaña; con el mouse no se mueve', async () => {
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

  // Leo, en el medio, con el teclado.
  await deleteWithKeyboard('g-leo')
  await waitFor(() => pending.length === 1, 'pide el borrado')
  await waitFor(() => isDeleting(trashFor('g-leo')), '«Eliminando…» en el botón mientras tanto')
  check(api.calls.deleteHeyGen.length === 0, 'un solo pedido, en vuelo')
  const card = cardOf('g-leo')
  check(card.getAttribute('aria-busy') === 'true' && card.className.includes('opacity-50') && card.className.includes('pointer-events-none'), 'la tarjeta apagada')
  const deletingAccessible = await accessible(trashFor('g-leo'))
  check(deletingAccessible.name === deleteText('avatars.eliminar.eliminando') && deletingAccessible.description === 'Leo', 'para Chrome, se llama «Eliminando…» y lo describe Leo: ' + JSON.stringify(deletingAccessible))
  check(document.activeElement === trashFor('g-leo'), 'el foco espera en el botón (aria-disabled, sigue enfocable): ' + document.activeElement?.outerHTML.slice(0, 100))
  check([...document.querySelectorAll('button')].filter((button) => button.textContent.trim() === tr('avatars.stock.agregar')).every((button) => button.disabled), 'mientras borra no se agrega nada')
  trashFor('g-mia').click()
  await delay(100)
  check(isClosed(trashFor('g-mia'), 'Mía') && trashFor('g-mia').getAttribute('aria-disabled') === 'true' && pending.length === 1, 'otro botón no despliega ni arranca otro borrado')
  slowListing = gate()
  pending[0].resolve()
  await waitFor(() => same(visibleGroupIds(), ['g-mia', 'g-sol']), 'Leo sale de la grilla sin esperar la relectura: ' + visibleGroupIds())
  check(same(api.calls.deleteHeyGen, [{ groupId: 'g-leo', name: 'Leo' }]), 'el pedido lleva el groupId y, para el log de soporte, el nombre: ' + JSON.stringify(api.calls.deleteHeyGen))
  await waitFor(() => window.toastLog.includes(tr('avatars.toasts.eliminadoHeygen', { name: 'Leo' })), 'el aviso: ' + JSON.stringify(window.toastLog))
  await delay(100)
  check(document.activeElement === trashFor('g-sol'), 'el foco pasa al botón de la siguiente, Sol: ' + document.activeElement?.outerHTML.slice(0, 100))
  check(client.getQueryState(['avatars', 'list'])?.isInvalidated, 'marca vieja la lista de la biblioteca')
  check(privateListings(api) === listingsBefore, 'la relectura de la cuenta sigue en vuelo')
  slowListing.resolve()
  slowListing = null
  await waitFor(() => privateListings(api) > listingsBefore, 'relee los avatares de la cuenta')
  await delay(100)
  check(same(visibleGroupIds(), ['g-mia', 'g-sol']), 'la relectura coincide: Leo no vuelve')

  // Sol, la última: el foco va al botón de la anterior, Mía.
  await deleteWithKeyboard('g-sol')
  await waitFor(() => pending.length === 2, 'pide borrar a Sol')
  pending[1].resolve()
  await waitFor(() => same(visibleGroupIds(), ['g-mia']), 'Sol sale de la grilla')
  await delay(100)
  check(document.activeElement === trashFor('g-mia'), 'el foco queda en el botón de la anterior, Mía: ' + document.activeElement?.outerHTML.slice(0, 100))

  // Mía, la única: el foco va a la pestaña «Mis avatares».
  await deleteWithKeyboard('g-mia')
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
  const mia = trashFor('g-mia')
  await clickOn(mia)
  await waitFor(() => isOpenWith(mia, [HEYGEN]), 'el clic despliega')
  await clickOn(optionOf(mia, HEYGEN))
  await waitFor(() => isConfirming(mia), 'pide «Seguro»')
  await clickOn(optionOf(mia, SURE))
  await waitFor(() => same(visibleGroupIds(), ['g-leo', 'g-sol']), '«Seguro» la elimina')
  await delay(150)
  check(same(mouseApi.calls.deleteHeyGen, [{ groupId: 'g-mia', name: 'Mía' }]), 'con su groupId y su nombre: ' + JSON.stringify(mouseApi.calls.deleteHeyGen))
  check(document.activeElement !== trashFor('g-leo') && document.activeElement !== ownTab(), 'con el mouse el foco no salta: ' + document.activeElement?.outerHTML.slice(0, 100))
})

scenario('8c · «Mis avatares»: si eliminar falla, avisa con el error y la tarjeta vuelve, con el foco en su botón; sin red el pedido sale igual y no se repite al volver', async () => {
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
    await deleteWithKeyboard('g-mia')
    await waitFor(() => api.calls.deleteHeyGen.length === 1, 'sin red, el pedido sale igual')
    await waitFor(() => isDeleting(trashFor('g-mia')), 'eliminando')
    answer.resolve()
    await waitFor(() => window.toastLog.includes(tr('avatars.errors.invalidKey')), 'avisa con el error: ' + JSON.stringify(window.toastLog))
    await waitFor(() => isClosed(trashFor('g-mia'), 'Mía'), 'el botón vuelve a reposo')
    check(same(visibleGroupIds(), ['g-mia', 'g-leo', 'g-sol']), 'la tarjeta sigue en la grilla')
    const card = cardOf('g-mia')
    check(card.getAttribute('aria-busy') === 'false' && !card.className.includes('opacity-50') && trashFor('g-mia').getAttribute('aria-disabled') === 'false', 'y vuelve a la normalidad')
    check(document.activeElement === trashFor('g-mia'), 'el foco sigue en su botón: ' + document.activeElement?.outerHTML.slice(0, 100))
    check(!window.toastLog.includes(tr('avatars.toasts.eliminadoHeygen', { name: 'Mía' })), 'sin el aviso de éxito')
  } finally {
    window.dispatchEvent(new Event('online'))
  }
  await delay(150)
  check(api.calls.deleteHeyGen.length === 1, 'al volver la red no se repite: ' + api.calls.deleteHeyGen.length)
  check(privateListings(api) === listingsBefore, 'sin borrado, no relee la cuenta')
})

scenario('8d · «Mis avatares»: una tecla sostenida no confirma: Enter o Espacio sostenidos en el botón solo despliegan y en «Eliminar permanentemente…» solo piden «Seguro»; soltar y volver a apretar elimina', async () => {
  const api = fakeApi()
  mount(<StockLooksDialog entries={[]} onOpenAvatar={() => {}} onClose={() => {}} />)
  await openOwnTab()
  // Enter sostenido: el primer keyDown despliega y el foco pasa a la primera
  // opción («Eliminar permanentemente…»: Mía no está en la biblioteca); sus
  // repeticiones caen ahí y no piden «Seguro» (en un botón, cada Enter
  // repetido sería otro clic).
  const mia = trashFor('g-mia')
  const expanded = watchExpanded(mia)
  mia.focus()
  await holdKey('Enter')
  await delay(300)
  expanded.stop()
  check(expanded.changes.length === 1 && isOpenWith(mia, [HEYGEN]) && api.calls.deleteHeyGen.length === 0, 'Enter sostenido solo despliega: ' + JSON.stringify(expanded.changes))
  check(document.activeElement === optionOf(mia, HEYGEN), 'con el foco en la primera opción, que no pidió «Seguro»: ' + document.activeElement?.outerHTML.slice(0, 100))
  await holdKey('Enter')
  await delay(300)
  check(isConfirming(mia) && api.calls.deleteHeyGen.length === 0, 'Enter sostenido en «Eliminar permanentemente…» solo pide «Seguro»: ' + JSON.stringify(api.calls.deleteHeyGen))
  await pressKey('Enter')
  await waitFor(() => api.calls.deleteHeyGen.length === 1, 'soltar y volver a apretar Enter elimina')
  check(api.calls.deleteHeyGen[0].groupId === 'g-mia', 'a Mía: ' + JSON.stringify(api.calls.deleteHeyGen))
  await waitFor(() => same(visibleGroupIds(), ['g-leo', 'g-sol']), 'Mía sale de la grilla')

  // Espacio sostenido: también solo despliega y solo pide «Seguro».
  const leo = trashFor('g-leo')
  leo.focus()
  await holdKey(' ')
  await delay(300)
  check(isOpenWith(leo, [HEYGEN]) && api.calls.deleteHeyGen.length === 1, 'Espacio sostenido solo despliega')
  check(document.activeElement === optionOf(leo, HEYGEN), 'con el foco en la primera opción: ' + document.activeElement?.outerHTML.slice(0, 100))
  await holdKey(' ')
  await delay(300)
  check(isConfirming(leo) && api.calls.deleteHeyGen.length === 1, 'Espacio sostenido en «Eliminar permanentemente…» solo pide «Seguro»: ' + JSON.stringify(api.calls.deleteHeyGen))
  await pressKey(' ')
  await waitFor(() => api.calls.deleteHeyGen.length === 2, 'soltar y volver a apretar Espacio elimina')
  check(api.calls.deleteHeyGen[1].groupId === 'g-leo', 'a Leo: ' + JSON.stringify(api.calls.deleteHeyGen))
})

scenario('8e · «Mis avatares»: mientras se agrega un avatar, ningún botón de eliminar despliega ni borra; al terminar el alta, vuelven', async () => {
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
  // Con el alta en vuelo, ni el botón de Mía (la misma tarjeta) ni el de Leo
  // despliegan o borran, aunque se los apriete dos veces.
  for (const [groupId, name] of [['g-mia', 'Mía'], ['g-leo', 'Leo']]) {
    check(trashFor(groupId).getAttribute('aria-disabled') === 'true', 'el botón de ' + name + ' está apagado mientras se agrega')
    trashFor(groupId).focus()
    await pressKey('Enter')
    await pressKey('Enter')
    await delay(100)
    check(isClosed(trashFor(groupId), name) && api.calls.deleteHeyGen.length === 0, 'Enter dos veces en el botón de ' + name + ' no despliega ni borra: ' + JSON.stringify(api.calls.deleteHeyGen))
  }
  check(same(visibleGroupIds(), ['g-mia', 'g-leo', 'g-sol']), 'las tarjetas siguen igual')
  added.resolve()
  await waitFor(() => trashFor('g-leo').getAttribute('aria-disabled') === 'false', 'al terminar el alta, el botón vuelve')
  trashFor('g-leo').focus()
  await pressKey('Enter')
  await waitFor(() => isOpenWith(trashFor('g-leo'), [HEYGEN]), 'y despliega otra vez')
  check(api.calls.deleteHeyGen.length === 0, 'sin borrar nada')
})

scenario('8f · «Mis avatares»: con un borrado en HeyGen en vuelo el diálogo no se cierra (Escape, clic afuera, la X); al terminar, sí', async () => {
  const api = fakeApi()
  const answer = gate()
  const instant = api.deleteFromHeyGen
  api.deleteFromHeyGen = (payload) => answer.promise.then(() => instant(payload))
  let closes = 0
  mount(<StockLooksDialog entries={[]} onOpenAvatar={() => {}} onClose={() => { closes += 1 }} />)
  await openOwnTab()
  await deleteWithKeyboard('g-mia')
  await waitFor(() => isDeleting(trashFor('g-mia')), 'eliminando a Mía')
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

scenario('8g · «Mis avatares»: «Eliminar de la lista» saca de la biblioteca la entrada del avatar sin otro paso ni tocar HeyGen; la tarjeta se queda (sin «Agregado»), con el foco en su botón, y desde ahí solo queda HeyGen', async () => {
  const api = fakeApi()
  api.avatars = [{ id: 'lib-sol', groupId: 'g-sol', name: 'Sol' }]
  mount(<LibraryStockHost />)
  await openOwnTab()
  await waitFor(() => hasAddedBadge('g-sol'), 'Sol está en la biblioteca')
  const sol = trashFor('g-sol')
  sol.focus()
  await pressKey('Enter')
  await waitFor(() => isOpenWith(sol, [LIST, HEYGEN]), 'despliega las dos opciones')
  check(document.activeElement === optionOf(sol, LIST), 'el foco pasa a «Eliminar de la lista», la primera opción')
  await pressKey('Enter')
  await waitFor(() => api.calls.remove.length === 1, 'quita la entrada de la biblioteca')
  check(same(api.calls.remove, ['lib-sol']) && api.calls.deleteHeyGen.length === 0, 'la entrada de Sol, sin tocar HeyGen: ' + JSON.stringify(api.calls.remove))
  await waitFor(() => !hasAddedBadge('g-sol'), '«Agregado» se va')
  check(same(visibleGroupIds(), ['g-mia', 'g-leo', 'g-sol']), 'la tarjeta sigue: el avatar sigue en HeyGen')
  check(isClosed(sol, 'Sol') && document.activeElement === sol, 'el menú se cierra con el foco en su botón: ' + document.activeElement?.outerHTML.slice(0, 100))
  await pressKey('Enter')
  await waitFor(() => isOpenWith(sol, [HEYGEN]), 'fuera de la biblioteca, solo queda HeyGen: ' + JSON.stringify(shownOptions(sol)))
})

// ─── Con el CSS real: la geometría de la confirmación y el doble clic ───
// Los demás escenarios corren sin CSS; el 11, el 11b, el 11c y el 12 cargan el
// de la app (Tailwind, compilado al armar el banco; sin red, con la fuente de
// respaldo) y miden en la ventana de arranque de la app (1280 × 800), en la
// mínima (1024 × 640, tauri.conf.json) o, el 11b, con la tarjeta cortada en
// un contenedor con scroll.
const APP_WINDOWS = [{ width: 1280, height: 800 }, { width: 1024, height: 640 }]
// El ancho de una tarjeta de la biblioteca en esa ventana: la barra lateral
// (w-64) y la página (max-w-5xl, px-8) le dejan a la grilla 960 px a 1280 y
// 704 px a 1024, en cuatro columnas (lg) con gap-4.
const LIBRARY_CARD_WIDTH = { 1280: 228, 1024: 164 }
const rectOf = (element) => {
  const { left, top, right, bottom } = element.getBoundingClientRect()
  return { left, top, right, bottom }
}
const centerOf = (rect) => ({ x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 })
// Se tocan: comparten aunque sea un borde.
const touches = (one, other) => one.left <= other.right && other.left <= one.right && one.top <= other.bottom && other.top <= one.bottom
const within = (inner, outer) => inner.left >= outer.left - 0.5 && inner.right <= outer.right + 0.5 && inner.top >= outer.top - 0.5 && inner.bottom <= outer.bottom + 0.5
// Un clic de verdad en un punto, sin desplazar nada (clickOn centra el
// elemento y movería lo que ya se midió).
const clickAt = (point, clickCount = 1) => input({ type: 'click', x: point.x, y: point.y, clickCount })
// En ese punto está ese elemento (o algo suyo): a la vista y sin nada encima.
const hitsAt = (element, point) => element.contains(document.elementFromPoint(point.x, point.y))
// Las animaciones y transiciones finitas en curso (la entrada de un diálogo,
// el velo que aparece, el zoom de la imagen): medir en medio mide otra cosa.
const settle = () => Promise.all(document.getAnimations().filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => null)))
async function loadAppCss() {
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = './app.css'
  const loaded = new Promise((done, fail) => {
    link.onload = done
    link.onerror = () => fail(new Error('no carga app.css'))
  })
  document.head.append(link)
  await loaded
  return link
}

// Un menú con las dos opciones, a la vista sin desplazar nada: despliega,
// mide los lugares, pide «Seguro» con un clic de verdad y comprueba que
// «Seguro» quedó dentro del lugar de «Eliminar permanentemente…», sin tocar
// el de «Eliminar de la lista», y que «Cancelar» tomó el de la lista; un clic
// de corrección donde estaba la lista no elimina. Después, un doble clic de
// verdad sobre la opción de HeyGen en cada franja de ella que, con «Seguro» a
// la vista, cae en otro lado («Seguro», «Cancelar» o entre los dos): ni
// elimina ni cierra la confirmación. Devuelve las franjas que probó.
async function checkConfirmSlots(trigger, label, deletions) {
  const open = async () => {
    await clickAt(centerOf(rectOf(trigger)))
    await waitFor(() => isOpenWith(trigger, [LIST, HEYGEN]), label + ': despliega las dos opciones: ' + JSON.stringify(shownOptions(trigger)))
    await settle()
  }
  const closeMenu = async () => {
    await pressKey('Escape')
    await waitFor(() => trigger.getAttribute('aria-expanded') === 'false', label + ': Escape lo cierra')
    await settle()
  }

  await open()
  const listButton = optionOf(trigger, LIST)
  const heygenButton = optionOf(trigger, HEYGEN)
  const list = rectOf(listButton)
  const heygen = rectOf(heygenButton)
  check(hitsAt(listButton, centerOf(list)) && hitsAt(heygenButton, centerOf(heygen)), label + ': las dos opciones, a la vista: ' + JSON.stringify({ list, heygen }))
  check([listButton, heygenButton].every((button) => button.scrollWidth <= button.clientWidth), label + ': los textos entran en sus botones')
  await clickAt(centerOf(heygen))
  await waitFor(() => isConfirming(trigger), label + ': pide «Seguro»')
  await settle()
  const sureButton = optionOf(trigger, SURE)
  const sure = rectOf(sureButton)
  const cancel = rectOf(optionOf(trigger, CANCEL))
  const rects = JSON.stringify({ list, heygen, sure, cancel })
  check(sureButton === heygenButton && within(sure, heygen), label + ': «Seguro» queda dentro del lugar de «Eliminar permanentemente…»: ' + rects)
  check(!touches(sure, list), label + ': «Seguro» no toca el lugar de «Eliminar de la lista»: ' + rects)
  check(touches(cancel, list), label + ': «Cancelar» toma el lugar de la lista: ' + rects)
  check(!hitsAt(sureButton, centerOf(list)), label + ': donde estaba la lista no está «Seguro»')
  await clickAt(centerOf(list))
  await delay(150)
  check(deletions() === 0, label + ': un clic de corrección donde estaba la lista no elimina')
  if (trigger.getAttribute('aria-expanded') === 'true') await closeMenu()

  const bands = [
    ['«Seguro»', Math.max(sure.top, heygen.top), Math.min(sure.bottom, heygen.bottom)],
    ['«Cancelar»', Math.max(cancel.top, heygen.top), Math.min(cancel.bottom, heygen.bottom)],
    ['entre «Cancelar» y «Seguro»', Math.max(cancel.bottom, heygen.top), Math.min(sure.top, heygen.bottom)],
  ].filter(([, top, bottom]) => bottom - top >= 4)
  for (const [where, top, bottom] of bands) {
    await open()
    // El mismo punto de la opción, aunque algo se haya desplazado al abrir.
    const shift = rectOf(optionOf(trigger, HEYGEN)).top - heygen.top
    const point = { x: centerOf(heygen).x, y: (top + bottom) / 2 + shift }
    await clickAt(point, 1)
    await clickAt(point, 2)
    await delay(150)
    check(isConfirming(trigger) && deletions() === 0, label + ': un doble clic sobre HeyGen que termina en ' + where + ' deja «Seguro» a la vista, sin eliminar')
    await closeMenu()
  }
  return bands.map(([where]) => where)
}

scenario('11 · con el CSS de la app, en la ventana de arranque y en la mínima: al pedir «Seguro», «Seguro» queda en el lugar de «Eliminar permanentemente de HeyGen» y «Cancelar» en el de la lista, en la tarjeta y el panel de la biblioteca y en «Mis avatares»; ni un clic de corrección donde estaba la lista ni un doble clic sobre HeyGen eliminan', async () => {
  const link = await loadAppCss()
  const covered = new Set()
  try {
    for (const appWindow of APP_WINDOWS) {
      const size = appWindow.width + '×' + appWindow.height
      await input({ type: 'viewport', ...appWindow })

      // La tarjeta de la biblioteca.
      fakeApi()
      window.cardEvents = []
      mount(<div style={{ width: LIBRARY_CARD_WIDTH[appWindow.width] }}><LibraryCardHost avatar={PIA_OWN} /></div>)
      const card = await libraryCard('pia-own')
      await settle()
      for (const band of await checkConfirmSlots(trashIn(card), 'tarjeta de la biblioteca a ' + size, () => window.cardEvents.filter((event) => event.startsWith('heygen:')).length)) covered.add(band)
      check(!window.cardEvents.some((event) => event.startsWith('list:')), 'la tarjeta a ' + size + ': nada salió de la lista: ' + JSON.stringify(window.cardEvents))
      await unmount()

      // El panel del avatar.
      window.panelEvents = []
      mount(<PanelHost avatar={PIA_OWN} />)
      const panelTrigger = await waitFor(() => trashIn(topDialog()), 'el panel de Pía')
      await settle()
      for (const band of await checkConfirmSlots(panelTrigger, 'panel a ' + size, () => window.panelEvents.filter((event) => event === 'heygen').length)) covered.add(band)
      check(!window.panelEvents.includes('list'), 'el panel a ' + size + ': nada salió de la lista: ' + JSON.stringify(window.panelEvents))
      await unmount()

      // «Mis avatares»: Sol está en la biblioteca, con las dos opciones.
      const api = fakeApi()
      mount(<StockLooksDialog entries={[{ id: 'lib-sol', groupId: 'g-sol' }]} onOpenAvatar={() => {}} onClose={() => {}} />)
      await openOwnTab()
      cardOf('g-sol').scrollIntoView({ block: 'center' })
      await settle()
      for (const band of await checkConfirmSlots(trashFor('g-sol'), '«Mis avatares» a ' + size, () => api.calls.deleteHeyGen.length)) covered.add(band)
      check(api.calls.remove.length === 0 && api.calls.looks.length === 0, '«Mis avatares» a ' + size + ': nada salió de la lista ni se abrieron los looks: ' + JSON.stringify(api.calls.remove))
      await unmount()
    }
    // Sobre la imagen, «Eliminar permanentemente…» ocupa dos líneas o más y
    // «Seguro» una: algún doble clic tuvo que terminar fuera de «Seguro».
    check(covered.has('«Seguro»') && covered.size > 1, 'los dobles clics terminaron en «Seguro» y fuera de él: ' + JSON.stringify([...covered]))
  } finally {
    link.remove()
    await input({ type: 'clearViewport' })
  }
})

// El ancho de la tarjeta de la biblioteca en el escenario del velo: 450 px es
// una tarjeta más ancha que el contenido del velo, que es donde WebKit lo
// cortaba (la persona la ve así en una ventana grande); 228 y 164 px son las
// de la ventana de arranque y la mínima.
const VEIL_CARD_WIDTHS = [450, 228, 164]
// Dos cajas coinciden en sus cuatro bordes (medio píxel de margen).
const sameBox = (one, other) => ['left', 'top', 'right', 'bottom'].every((side) => Math.abs(one[side] - other[side]) <= 0.5)
// Lo que ocupan las opciones a la vista, de la primera a la última.
const optionsBox = (trigger) => {
  const boxes = optionButtons(trigger).filter(onScreen).map(rectOf)
  return { left: Math.min(...boxes.map((box) => box.left)), top: Math.min(...boxes.map((box) => box.top)), right: Math.max(...boxes.map((box) => box.right)), bottom: Math.max(...boxes.map((box) => box.bottom)) }
}
// Lo que ocupa el texto de un elemento (no su caja, que la grilla puede
// estirar): el borde de abajo de su última línea.
const textBox = (element) => {
  const range = document.createRange()
  range.selectNodeContents(element)
  return rectOf(range)
}
// El centro de una caja es el de la otra (un píxel de margen en vertical: las
// opciones son de alto entero y el velo tiene medios píxeles).
const isCenteredIn = (inner, outer) => Math.abs(centerOf(inner).x - centerOf(outer).x) <= 0.5 && Math.abs(centerOf(inner).y - centerOf(outer).y) <= 1

scenario('11c · con el CSS de la app, a 450, 228 y 164 px de ancho: el velo de eliminar de la tarjeta de la biblioteca cubre la imagen entera y sus opciones quedan centradas, antes y después de pedir «Seguro» (con la advertencia dentro del velo y «Seguro» en el lugar de HeyGen)', async () => {
  const link = await loadAppCss()
  try {
    await input({ type: 'viewport', width: 1280, height: 800 })
    for (const width of VEIL_CARD_WIDTHS) {
      const label = 'la tarjeta de ' + width + ' px'
      fakeApi()
      window.cardEvents = []
      mount(<div style={{ width }}><LibraryCardHost avatar={PIA_OWN} /></div>)
      const card = await libraryCard('pia-own')
      await settle()
      const trigger = trashIn(card)
      // La imagen de la tarjeta: su único botón oculto al lector de pantalla.
      const image = card.querySelector('button[aria-hidden]')
      const veil = optionsOf(trigger)

      await clickAt(centerOf(rectOf(trigger)))
      await waitFor(() => isOpenWith(trigger, [LIST, HEYGEN]), label + ': despliega las dos opciones: ' + JSON.stringify(shownOptions(trigger)))
      await settle()
      const imageBox = rectOf(image)
      check(sameBox(rectOf(veil), imageBox), label + ': el velo cubre la imagen entera: ' + JSON.stringify({ veil: rectOf(veil), image: imageBox }))
      // Chrome estira bien una capa absoluta con inset-x-0 y aspect-ratio sin
      // ancho; WebKit (la app de Tauri) le resta el relleno horizontal y la deja
      // corta (medido en un WKWebView de macOS: 422 × 527,5 sobre una imagen de
      // 446 × 557,5). Chrome no deja ver el error, así que se ata la causa: el
      // velo lleva ancho explícito.
      check(veil.classList.contains('w-full'), label + ': el velo lleva ancho explícito (w-full), para que WebKit no le reste el relleno: ' + veil.className)
      check(isCenteredIn(optionsBox(trigger), rectOf(veil)), label + ': las dos opciones quedan centradas en el velo: ' + JSON.stringify({ options: optionsBox(trigger), veil: rectOf(veil) }))
      const list = rectOf(optionOf(trigger, LIST))
      const heygen = rectOf(optionOf(trigger, HEYGEN))

      await clickAt(centerOf(heygen))
      await waitFor(() => isConfirming(trigger), label + ': pide «Seguro»')
      await settle()
      const veilBox = rectOf(veil)
      const warning = rectOf(warningOf(trigger))
      const cancel = rectOf(optionOf(trigger, CANCEL))
      const sure = rectOf(optionOf(trigger, SURE))
      check(sameBox(veilBox, imageBox), label + ': pedir «Seguro» no cambia el velo: ' + JSON.stringify({ veil: veilBox, image: imageBox }))
      check(isCenteredIn(optionsBox(trigger), veilBox), label + ': «Cancelar» y «Seguro» quedan centrados en el velo: ' + JSON.stringify({ options: optionsBox(trigger), veil: veilBox }))
      // La advertencia crece hacia arriba: entera dentro del velo (sin cortarse
      // por arriba), su caja termina donde empieza la de «Cancelar» y su texto
      // queda pegado a ella (a lo sumo el aire de su relleno de abajo, 8 px, y el
      // hueco de su última línea).
      const warningText = textBox(warningOf(trigger))
      check(within(warning, veilBox) && Math.abs(cancel.top - warning.bottom) <= 1, label + ': la advertencia queda dentro del velo, arriba de «Cancelar»: ' + JSON.stringify({ warning, cancel, veil: veilBox }))
      check(cancel.top - warningText.bottom >= 0 && cancel.top - warningText.bottom <= 12, label + ': el texto de la advertencia queda pegado a «Cancelar», no arriba del velo: ' + JSON.stringify({ warningText, cancel }))
      check(within(sure, heygen) && !touches(sure, list) && touches(cancel, list), label + ': «Seguro» queda en el lugar de HeyGen y «Cancelar» en el de la lista: ' + JSON.stringify({ list, heygen, cancel, sure }))
      check(window.cardEvents.length === 0, label + ': nada se eliminó: ' + JSON.stringify(window.cardEvents))

      await pressKey('Escape')
      await waitFor(() => trigger.getAttribute('aria-expanded') === 'false', label + ': Escape lo cierra')
      await settle()
      await unmount()
    }
  } finally {
    link.remove()
    await input({ type: 'clearViewport' })
  }
})

// Desplaza un contenedor con scroll hasta dejar «visible» px del borde de
// arriba de un elemento a la vista, al pie del contenedor (o de la ventana).
async function showTopEdgeAtBottom(scroller, element, visible, bottom) {
  scroller.scrollTop += element.getBoundingClientRect().top - (bottom - visible)
  await delay(80)
  await settle()
}

// Con la opción de HeyGen apenas a la vista al pie de un contenedor con
// scroll, la arma con un clic de verdad en su franja visible: el contenedor
// no se mueve y un clic de corrección en el cuarto de abajo del lugar de la
// lista no elimina (cae en «Cancelar», que cierra sin mover el contenedor
// aunque el botón del menú esté fuera de la vista). Si el foco de la
// confirmación desplazara el contenedor, el navegador traería la opción
// entera calculando con su alto de dos o tres líneas, y «Seguro», de una y
// apoyado al pie, caería sobre la lista.
async function armAtTheEdge(trigger, scroller, bottom, label, deletions) {
  const scrollTop = scroller.scrollTop
  const list = rectOf(optionOf(trigger, LIST))
  const heygenButton = optionOf(trigger, HEYGEN)
  const heygen = rectOf(heygenButton)
  const strip = { x: centerOf(heygen).x, y: (heygen.top + Math.min(heygen.bottom, bottom)) / 2 }
  check(heygen.top < bottom && heygen.bottom > bottom && hitsAt(heygenButton, strip), label + ': HeyGen, a medias a la vista: ' + JSON.stringify({ heygen, bottom }))
  await clickAt(strip)
  await waitFor(() => isConfirming(trigger), label + ': pide «Seguro»')
  await settle()
  check(scroller.scrollTop === scrollTop, label + ': armar no desplaza el contenedor: ' + scrollTop + ' → ' + scroller.scrollTop)
  check(!touches(rectOf(optionOf(trigger, SURE)), list), label + ': «Seguro» no toca el lugar de la lista')
  await clickAt({ x: centerOf(list).x, y: list.top + (list.bottom - list.top) * 0.75 })
  await delay(200)
  check(deletions() === 0, label + ': el clic de corrección en el cuarto de abajo de la lista no elimina')
  await waitFor(() => trigger.getAttribute('aria-expanded') === 'false', label + ': el clic de corrección cae en «Cancelar» y cierra')
  await settle()
  check(scroller.scrollTop === scrollTop, label + ': al cerrar, el foco vuelve al botón sin desplazar el contenedor: ' + scrollTop + ' → ' + scroller.scrollTop)
}

// Entero a la vista: dentro del contenedor con scroll y de la ventana.
const fullyInside = (element, scroller) => {
  const rect = element.getBoundingClientRect()
  const box = scroller.getBoundingClientRect()
  return rect.top >= Math.max(box.top, 0) - 0.5 && rect.bottom <= Math.min(box.bottom, window.innerHeight) + 0.5
}

scenario('11b · con el CSS de la app, con la tarjeta cortada en un contenedor con scroll: abrir trae a la vista la opción enfocada (también con Tab hasta la primera tarjeta de una fila y Enter), armar «Seguro» y cerrar no desplazan y un clic de corrección donde estaba la lista no elimina, en «Mis avatares» y en la biblioteca', async () => {
  const link = await loadAppCss()
  try {
    // «Mis avatares» con ocho grupos: Mía y Sol quedan en la segunda fila.
    const mountOwn = async (entries) => {
      const api = fakeApi()
      const extra = ['a', 'b', 'c', 'd', 'e'].map((id) => group('g-x' + id, 'X' + id, 'female', { previewVideoUrl: 'media/x' + id + '.mp4' }))
      api.privateGroups = [...extra.slice(0, 4), ...structuredClone(OWN), extra[4]]
      mount(<StockLooksDialog entries={entries} onOpenAvatar={() => {}} onClose={() => {}} />)
      const tab = await waitFor(ownTab, 'la pestaña «Mis avatares»')
      tab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      tab.click()
      await waitFor(() => visibleGroupIds().length === 8 && trashFor('g-sol'), '«Mis avatares» con ocho grupos')
      await settle()
      return api
    }
    const gridOf = (groupId) => cardOf(groupId).closest('.overflow-y-auto')

    // Con el teclado: Tab hasta Mía, la primera de la segunda fila, y Enter.
    // El Tab deja su botón cerca del pie de la grilla, con las opciones
    // debajo: abrir las trae a la vista. En las dos ventanas, con Mía en la
    // biblioteca (la lista primero) y fuera de ella (solo HeyGen).
    for (const appWindow of APP_WINDOWS) {
      for (const inLibrary of [true, false]) {
        const label = '«Mis avatares» a ' + appWindow.width + '×' + appWindow.height + (inLibrary ? ', en la biblioteca' : ', fuera de la biblioteca')
        await input({ type: 'viewport', ...appWindow })
        await input({ type: 'move', x: 0, y: 0 })
        await mountOwn(inLibrary ? [{ id: 'lib-mia', groupId: 'g-mia' }] : [])
        const trigger = trashFor('g-mia')
        trashFor('g-xa').focus()
        for (let presses = 0; document.activeElement !== trigger && presses < 30; presses += 1) await pressKey('Tab')
        check(document.activeElement === trigger, label + ': Tab llega al botón de Mía')
        await settle()
        await pressKey('Enter')
        await waitFor(() => isOpenWith(trigger, inLibrary ? [LIST, HEYGEN] : [HEYGEN]), label + ': Enter despliega')
        await settle()
        const focused = optionOf(trigger, inLibrary ? LIST : HEYGEN)
        check(document.activeElement === focused && fullyInside(focused, gridOf('g-mia')), label + ': la opción enfocada queda entera a la vista: ' + JSON.stringify({ option: rectOf(focused), grid: rectOf(gridOf('g-mia')) }))
        await unmount()
      }
    }

    // Armar con HeyGen a 8 px del pie, a 1024 × 640: se abre con el teclado
    // (con el puntero lejos: salir de la tarjeta la cerraría) y después se
    // desplaza la grilla hasta dejar HeyGen a medias; armar no la mueve.
    await input({ type: 'viewport', width: 1024, height: 640 })
    const api = await mountOwn([{ id: 'lib-sol', groupId: 'g-sol' }])
    const trigger = trashFor('g-sol')
    const grid = gridOf('g-sol')
    const gridBottom = () => grid.getBoundingClientRect().bottom
    trigger.focus()
    await pressKey('Enter')
    await waitFor(() => isOpenWith(trigger, [LIST, HEYGEN]), '«Mis avatares»: Enter despliega')
    await settle()
    await showTopEdgeAtBottom(grid, optionOf(trigger, HEYGEN), 8, gridBottom())
    check(isOpenWith(trigger, [LIST, HEYGEN]), '«Mis avatares»: el menú sigue abierto después de desplazar')
    await armAtTheEdge(trigger, grid, gridBottom(), '«Mis avatares»', () => api.calls.deleteHeyGen.length)
    await waitFor(() => isClosed(trigger, 'Sol'), '«Mis avatares»: cierra')

    // Abrir con un clic, con la lista a 8 px del pie: abrir trae las opciones
    // a la vista (la enfocada y la de HeyGen), antes de elegir nada.
    const closedOption = (key) => optionButtons(trigger).find((button) => button.textContent.trim() === deleteText(key))
    await showTopEdgeAtBottom(grid, closedOption(LIST), 8, gridBottom())
    await clickAt(centerOf(rectOf(trigger)))
    await waitFor(() => isOpenWith(trigger, [LIST, HEYGEN]), '«Mis avatares»: despliega con la lista a medias')
    await settle()
    check(document.activeElement === optionOf(trigger, LIST) && fullyInside(optionOf(trigger, LIST), grid) && fullyInside(optionOf(trigger, HEYGEN), grid), '«Mis avatares»: abrir con un clic deja enteras a la vista la opción enfocada y la de HeyGen: ' + JSON.stringify({ list: rectOf(optionOf(trigger, LIST)), heygen: rectOf(optionOf(trigger, HEYGEN)), grid: rectOf(grid) }))
    await pressKey('Escape')
    await waitFor(() => isClosed(trigger, 'Sol'), '«Mis avatares»: Escape cierra')
    await unmount()

    // La biblioteca a 1280 × 640, dentro de un contenedor con scroll como el
    // main de la app, con cuatro filas: Pía es la primera de la segunda, y
    // abajo hay lugar para desplazar su fila hasta arriba. Ahí el botón va
    // debajo de la imagen y las opciones la cubren.
    await input({ type: 'viewport', width: 1280, height: 640 })
    await input({ type: 'move', x: 0, y: 0 })
    const libraryApi = fakeApi()
    const others = 'abcdefghijklmn'.split('').map((id) => ({ ...ANA, id: 'x-' + id, name: 'X' + id, groupId: 'g-x' + id }))
    libraryApi.avatars = [...others.slice(0, 4), PIA_OWN, ANA, ...others.slice(4)].map((item) => structuredClone(item))
    mount(<div id="library-scroller" style={{ height: '100vh', overflowY: 'auto' }}><AvatarLibrary /></div>)
    const cardFor = (id) => document.querySelector('[data-avatar-id="' + id + '"]')?.closest('article')
    await waitFor(() => cardFor('ana-1'), 'las tarjetas de la biblioteca')
    await libraryGridSettled()
    await settle()
    const page = document.getElementById('library-scroller')
    const piaTrigger = trashIn(cardFor('pia-own'))

    // Con el teclado: con la fila de Pía pegada arriba (su imagen, y con ella
    // las opciones, fuera de la vista), Mayús+Tab desde el nombre de Ana llega
    // al botón de Pía sin desplazar, y Enter trae la opción enfocada a la vista.
    page.scrollTop += piaTrigger.getBoundingClientRect().top - 8
    await delay(80)
    await settle()
    document.querySelector('[data-avatar-id="ana-1"]').focus({ preventScroll: true })
    await pressKey('Shift+Tab')
    check(document.activeElement === piaTrigger && optionOf(piaTrigger, LIST) === null, 'biblioteca: Mayús+Tab llega al botón de Pía, con el menú cerrado')
    check(!fullyInside(optionButtons(piaTrigger).find((button) => button.textContent.trim() === deleteText(LIST)), page), 'biblioteca: antes de abrir, la lista está fuera de la vista')
    await pressKey('Enter')
    await waitFor(() => isOpenWith(piaTrigger, [LIST, HEYGEN]), 'biblioteca: Enter despliega')
    await settle()
    check(document.activeElement === optionOf(piaTrigger, LIST) && fullyInside(optionOf(piaTrigger, LIST), page), 'biblioteca: la opción enfocada queda entera a la vista: ' + JSON.stringify({ option: rectOf(optionOf(piaTrigger, LIST)), page: rectOf(page) }))

    // Armar con HeyGen a 8 px del pie: con el menú abierto, la página se
    // desplaza hasta dejar HeyGen a medias (el botón queda abajo, fuera de la
    // vista); armar no la mueve y, al cerrar con «Cancelar», el foco vuelve
    // al botón sin desplazarla.
    await showTopEdgeAtBottom(page, optionOf(piaTrigger, HEYGEN), 8, window.innerHeight)
    check(isOpenWith(piaTrigger, [LIST, HEYGEN]), 'biblioteca: el menú sigue abierto después de desplazar')
    await armAtTheEdge(piaTrigger, page, window.innerHeight, 'biblioteca', () => libraryApi.calls.deleteHeyGen.length)
    await unmount()
  } finally {
    link.remove()
    await input({ type: 'clearViewport' })
  }
})

scenario('12 · con el CSS de la app: el segundo clic de un doble clic sobre «Eliminar de la lista» no abre lo que queda debajo, ni el panel de la tarjeta vecina en la biblioteca ni los looks en «Mis avatares»', async () => {
  const link = await loadAppCss()
  try {
    await input({ type: 'viewport', width: 1280, height: 800 })

    // La biblioteca: al salir Pía de la lista, Ana ocupa su lugar debajo del
    // puntero; el segundo clic cae en su imagen.
    const api = fakeApi()
    api.avatars = [structuredClone(PIA_OWN), structuredClone(ANA)]
    api.looksByGroup = { 'g-pia': ANA_REMOTE, 'g-ana': ANA_REMOTE }
    mount(<AvatarLibrary />)
    const cardFor = (id) => document.querySelector('[data-avatar-id="' + id + '"]')?.closest('article')
    await waitFor(() => cardFor('ana-1'), 'las dos tarjetas')
    await libraryGridSettled()
    await settle()
    const piaTrigger = trashIn(cardFor('pia-own'))
    await clickAt(centerOf(rectOf(piaTrigger)))
    await waitFor(() => isOpenWith(piaTrigger, [LIST, HEYGEN]), 'Pía: las dos opciones')
    await settle()
    const point = centerOf(rectOf(optionOf(piaTrigger, LIST)))
    await clickAt(point, 1)
    await waitFor(() => !cardFor('pia-own'), 'Pía sale de la lista')
    await settle()
    check(hitsAt(cardFor('ana-1'), point) && !document.elementFromPoint(point.x, point.y).closest('[data-avatar-id]'), 'debajo del puntero queda la imagen de Ana')
    check(document.activeElement !== document.querySelector('[data-avatar-id="ana-1"]'), 'con el mouse, el foco no pasa a la vecina')
    await clickAt(point, 2)
    await delay(200)
    check(dialogs().length === 0, 'el segundo clic no abre el panel de Ana')
    await unmount()

    // «Mis avatares»: al quitar a Sol de la lista, el menú se cierra y queda
    // su imagen debajo del puntero.
    const stockApi = fakeApi()
    stockApi.avatars = [{ id: 'lib-sol', groupId: 'g-sol', name: 'Sol' }]
    mount(<LibraryStockHost />)
    await openOwnTab()
    await waitFor(() => hasAddedBadge('g-sol'), 'Sol está en la biblioteca')
    cardOf('g-sol').scrollIntoView({ block: 'center' })
    await settle()
    const sol = trashFor('g-sol')
    await clickAt(centerOf(rectOf(sol)))
    await waitFor(() => isOpenWith(sol, [LIST, HEYGEN]), 'Sol: las dos opciones')
    await settle()
    const solPoint = centerOf(rectOf(optionOf(sol, LIST)))
    await clickAt(solPoint, 1)
    await waitFor(() => stockApi.calls.remove.length === 1 && isClosed(sol, 'Sol'), 'quita a Sol de la lista y cierra el menú')
    await settle()
    check(hitsAt(cardOf('g-sol'), solPoint) && !document.elementFromPoint(solPoint.x, solPoint.y).closest('button'), 'debajo del puntero queda la imagen de Sol')
    await clickAt(solPoint, 2)
    await delay(200)
    check(!buttonNamed(tr('avatars.stock.volver')) && stockApi.calls.looks.length === 0, 'el segundo clic no abre los looks de Sol')
    await unmount()
  } finally {
    link.remove()
    await input({ type: 'clearViewport' })
  }
})

// ─── Entrega 2c: el formato de los looks ───
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
  // Mayús (modificador 8 de CDP) + Tab: el foco va hacia atrás.
  'Shift+Tab': {
    name: 'Tab',
    code: 'Tab',
    windowsVirtualKeyCode: 9,
    modifiers: 8,
  },
  ArrowLeft: { code: 'ArrowLeft', windowsVirtualKeyCode: 37 },
  ArrowRight: { code: 'ArrowRight', windowsVirtualKeyCode: 39 },
}

// Cuánto espera runPage a que la página termine sus escenarios. Es un tiempo y
// no un número de vueltas: el banco ya pasa del minuto (los escenarios con el
// CSS de la app son los más lentos) y una máquina lenta, o un escenario más, no
// tiene que hacerlo fallar sin que nada esté roto; una página colgada igual
// termina en cuatro minutos.
const PAGE_TIMEOUT_MS = 240_000

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
  const deadline = Date.now() + PAGE_TIMEOUT_MS
  while (Date.now() < deadline) {
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
      // El tamaño de la ventana, solo para el escenario que carga el CSS de
      // la app (los demás corren con el de siempre).
      if (request.type === 'viewport') {
        await send('Emulation.setDeviceMetricsOverride', {
          width: request.width,
          height: request.height,
          deviceScaleFactor: 1,
          mobile: false,
        })
      }
      if (request.type === 'clearViewport')
        await send('Emulation.clearDeviceMetricsOverride')
      if (request.type === 'key' || request.type === 'keyHold') {
        const definition = keyCodes[request.key]
        const { text, name = request.key, ...rest } = definition
        const down = {
          type: 'keyDown',
          key: name,
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
          key: name,
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
    // El CSS real de la app (Tailwind), sin la fuente remota (sin red): lo
    // carga solo el escenario que mide la geometría del menú.
    execFileSync(
      process.execPath,
      [
        tailwindCli,
        '-c',
        'tailwind.config.ts',
        '-i',
        'src/assets/css/main.css',
        '-o',
        join(root, 'app.css'),
      ],
      { stdio: 'ignore' },
    )
    const appCss = await readFile(join(root, 'app.css'), 'utf8')
    await writeFile(
      join(root, 'app.css'),
      appCss.replace(/@import url\([^)]*\);/g, ''),
    )
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
