// Los bloques de la pista de escenas con la tarjeta compartida (ADR-0057,
// spec §10.3): el avatar en morado con su busto, el clip animado en celeste
// con su claqueta, esquinas rounded-lg, borde blanco al elegirlo, la
// miniatura del avatar (la vista previa del look, que el sidecar le pone como
// imagen fija: el look ES el escenario), sus estados (listo, desactualizado,
// planeado, fallido con el motivo, generando con el avance simulado —y, en
// cola, sin porcentaje hasta que su render arranca, entrega 2d—) y sus
// fronteras bloqueadas, cada bloque con su `timelineBlockKey` (la `key` de
// React se lee de la fibra del contenedor). Y el panel de la escena (ruling
// D4): sobre una escena de avatar no ofrece «Regenerar imagen» ni la
// descripción (spec §6.2) y la explica con `avatarSceneHint` (entrega 2d; sus
// botones de generar el avatar los prueba check-editor-avatar-regenerate-ui.mjs).
// Y la galería «Vista ampliada de imágenes»: desde la entrega 2f (§22.4) lista
// también las escenas de avatar, en el orden del video, sin dejarlas elegir
// para las acciones de imágenes (su tarjeta la prueba
// check-editor-avatar-gallery-ui.mjs).
// Monta el EditorTimeline real en Chrome headless; solo `videosApi` se simula
// (el real importa el cliente de Supabase, que exige variables de entorno al
// cargarse) con lo único que la pista le pide: las URLs de las imágenes. La
// raíz guarda `onUncaughtError` para que un render roto falle con su mensaje.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { withChrome } from './chrome-session.mjs'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'

const chrome =
  process.argv[2] ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const root = await mkdtemp(join(tmpdir(), 'vimo-timeline-avatar-ui-'))
// El color del avatar es una variable CSS (`--tone`) que nada valida en el
// build: se mira acá que el token exista en los dos lugares que lo definen.
const tokenChecks = [
  [
    /--amethyst:\s*\d/.test(await readFile('src/assets/css/main.css', 'utf8')),
    'main.css define --amethyst',
  ],
  [
    (await readFile('tailwind.config.ts', 'utf8')).includes(
      "amethyst: 'hsl(var(--amethyst))'",
    ),
    'tailwind.config.ts expone la clase amethyst',
  ],
]
const mocks = {
  // Lo que piden la pista y el panel de la escena (el panel, como en
  // check-editor-character-ui.mjs): las URLs de las imágenes y los dos
  // helpers que lee al pintarse.
  '@/modules/videos/api':
    'export const videosApi = { isNative: () => true, errorMessageKey: () => "library.editor.regenFailed", imageSource: (path, version) => "fixture-image://" + path + "?v=" + version, videoSource: (path, version) => "fixture-media://" + path + "?v=" + version }',
}
const entry = String.raw`
import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router'
import es from './public/locales/es.json'
import { TooltipProvider } from '@/modules/common/ui/tooltip'
import { DEFAULT_TIMELINE_LAYOUT } from '@/modules/videos/constants'
import { EditorImageGallery } from '@/modules/videos/components/EditorImageGallery'
import { EditorScenePanel } from '@/modules/videos/components/EditorScenePanel'
import { EditorTimeline } from '@/modules/videos/components/EditorTimeline'
import { avatarRenderPercent } from '@/modules/videos/utilities/avatarRenderPercent'
import { errorKeyOf } from '@/modules/videos/utilities/errorKeyOf'
import { formatSlotSeconds } from '@/modules/videos/utilities/formatSlotSeconds'
import { missingImageSceneIds } from '@/modules/videos/utilities/missingImageSceneIds'
import { sceneImageEditable } from '@/modules/videos/utilities/sceneImageEditable'
import { sceneTimingLocked } from '@/modules/videos/utilities/sceneTimingLocked'
import { timelineBlockKey, timelineBlocks } from '@/modules/videos/utilities/timelineBlocks'

let checks = 0
let renderError
const check = (condition, message) => { if (!condition) throw new Error(message); checks += 1 }
const delay = () => new Promise((done) => setTimeout(done, 30))
async function waitFor(get, message) {
  for (let index = 0; index < 100; index++) { if (renderError) throw renderError; const value = get(); if (value) return value; await delay() }
  throw new Error(message)
}
await i18n.init({ lng: 'es', resources: { es: { translation: es } }, interpolation: { escapeValue: false } })

// La vista de una escena de avatar tal como la arma el sidecar (tarea 1, §3.3).
const view = (overrides = {}) => ({ lookId: 'look-ana', lookName: 'Ana oficina', lookType: 'photo_avatar', engine: 'avatar_iii', origin: 'auto', status: 'ready', clipPath: '/p/avatar/scene.mp4', clipMtimeMs: 1, normalizedSeconds: 10, ...overrides })
const scene = (id, startSeconds, endSeconds, extra = {}) => ({ id, text: 'Escena ' + id, imageStatus: 'ok', imagePath: '/p/scenes/scene_' + id + '.jpg', startSeconds, endSeconds, ...extra })
// Una escena de avatar trae como imagen fija la vista previa del look copiada
// al proyecto (no hay imagen generada); sin la copia, no trae imagen.
const LOOK = '/p/avatar/look.png'
const scenes = [
  scene(1, 0, 4),
  scene(2, 4, 14, { imagePath: LOOK, avatar: view() }),
  scene(3, 14, 18),
  scene(4, 18, 28, { imagePath: LOOK, avatar: view({ stale: true }) }),
  scene(5, 28, 38, { imagePath: undefined, imageStatus: 'pending', avatar: view({ status: 'planned', clipPath: undefined }) }),
  scene(6, 38, 48, { imagePath: LOOK, avatar: view({ status: 'failed', clipPath: undefined, errorCode: 'avatar_moderation_rejected' }) }),
  scene(7, 48, 51, { animation: { id: 'clip-7', provider: 'kie', status: 'ready', sceneIds: [7, 8], slotSeconds: 6, clipPath: '/p/clips/clip-7.mp4', clipMtimeMs: 1 } }),
  scene(8, 51, 54),
  scene(9, 54, 64, { imagePath: LOOK, avatar: view({ status: 'planned', clipPath: undefined }) }),
  scene(10, 64, 68),
  scene(11, 68, 72),
]
// El render del avatar de la escena 9 lleva un minuto (desde la entrega 2d lo
// llena la tarea del editor, check-editor-avatar-regenerate-ui.mjs; acá entra
// directo por la prop, y el caso de la cola la cambia).
const startedAt = Date.now() - 60_000
const noop = () => {}
window.selected = []
function Host() {
  const [selectedSceneId, setSelectedSceneId] = React.useState(2)
  const [avatarRendering, setAvatarRendering] = React.useState({ 9: { startedAt } })
  window.setAvatarRendering = setAvatarRendering
  return <EditorTimeline scenes={scenes} timingBusy={false} durationSeconds={72} playheadSeconds={0} selectedSceneId={selectedSceneId} sceneStatus={{}} sceneErrors={{}} sceneVersions={{}} sceneAnimationStatus={{}} sceneAnimationProgress={{}} sceneAnimationErrors={{}} plannedSceneIds={[]} narrationSrc={null} musicSrc={null} sceneAvatarRendering={avatarRendering} layout={DEFAULT_TIMELINE_LAYOUT} onReorderTracks={noop} onToggleMuted={noop} onToggleLocked={noop} zoomIndex={3} onZoomChange={noop} onSelectScene={(id) => { window.selected.push(id); setSelectedSceneId(id) }} onSeek={noop} onScrub={noop} onScrubStart={noop} onScrubEnd={noop} onBoundaryDrag={noop} onBoundaryCommit={noop} onOpenAudio={noop} onOpenMusic={noop} />
}
const reactRoot = createRoot(document.getElementById('root'), { onUncaughtError: (error) => { renderError = error } })
reactRoot.render(<I18nextProvider i18n={i18n}><TooltipProvider><Host /></TooltipProvider></I18nextProvider>)
const cards = () => [...document.querySelectorAll('button')].filter((button) => button.style.getPropertyValue('--tone'))
const toneOf = (card) => card.style.getPropertyValue('--tone').trim()
const cardTitled = (title) => cards().find((card) => card.title === title)
// La key de React no sale al DOM: se lee de la fibra del contenedor de cada bloque.
const reactKeyOf = (element) => { const name = Object.keys(element).find((key) => key.startsWith('__reactFiber$')); return name ? element[name].key : null }
const seconds = formatSlotSeconds(10, 'es')
try {
  await waitFor(() => cards().length === 6, 'seis tarjetas tipadas (cinco avatares y un clip)')
  const avatars = cards().filter((card) => toneOf(card) === 'var(--amethyst)')
  const clips = cards().filter((card) => toneOf(card) === 'var(--sky)')
  check(avatars.length === 5 && clips.length === 1, 'morado en los cinco avatares y celeste en el clip')
  for (const [ok, message] of window.tokenChecks) check(ok, message)
  check(avatars.every((card) => card.querySelector('svg.lucide-user-round')) && clips[0].querySelector('svg.lucide-clapperboard'), 'ficha del tipo: busto en el avatar y claqueta en el clip')
  check(cards().every((card) => card.className.includes('rounded-lg')), 'esquinas rounded-lg en las dos tarjetas')
  check(clips[0].textContent.includes('7 · 8'), 'el clip sigue mostrando las escenas que fusiona')
  const blockKeys = [...document.querySelectorAll('div.absolute.top-0.h-full > button')].map((card) => reactKeyOf(card.parentElement))
  check(blockKeys.length > 0 && blockKeys.every((key) => key !== null), 'no se pudo leer la key desde la fibra (__reactFiber$): cambió el nombre interno de React o el selector de los bloques')
  const expectedKeys = timelineBlocks(scenes, {}, { 9: { startedAt } }).map(timelineBlockKey)
  check(blockKeys.join() === expectedKeys.join() && blockKeys.includes('avatar-2') && new Set(blockKeys).size === blockKeys.length, 'cada bloque lleva su timelineBlockKey (el avatar, la suya) y ninguna se repite: ' + blockKeys.join(', '))
  const ready = cardTitled(i18n.t('library.editor.timeline.avatarTitle', { name: 'Ana oficina', seconds }))
  check(ready && ready.className.includes('border-white'), 'el avatar elegido lleva borde blanco')
  check(ready.textContent.includes(i18n.t('library.editor.timeline.avatarDuration', { seconds })), 'la duración del avatar')
  const sources = [...ready.querySelectorAll('img')].map((image) => image.getAttribute('src'))
  check(sources.length === 1 && sources[0] === 'fixture-image://' + LOOK + '?v=0', 'la miniatura es la vista previa del look, sola: ' + sources.join(', '))
  const stale = cardTitled(i18n.t('library.editor.timeline.avatarStaleHint'))
  check(stale && stale.textContent.includes(i18n.t('library.editor.timeline.avatarStale')) && !stale.className.includes('border-white'), 'desactualizado con su etiqueta')
  const planned = cardTitled(i18n.t('library.editor.timeline.avatarPlanned'))
  check(planned && planned.querySelectorAll('img').length === 0, 'planeado y sin la copia del look: el gradiente')
  // El texto de cada código lo da CREATE_ERROR_MESSAGE_KEYS (spec §14), que
  // LIBRARY_ERROR_MESSAGE_KEYS hereda; acá se mira que el bloque muestre el
  // motivo que da el mapa, y que el mapa caiga en el genérico si no lo conoce.
  check(errorKeyOf(undefined) === 'create.errors.unknown' && errorKeyOf('codigo_inexistente') === 'create.errors.unknown' && errorKeyOf('avatar_scene_without_image') === 'library.errors.avatarSceneWithoutImage' && errorKeyOf('avatar_moderation_rejected') === 'avatars.errors.moderationRejected', 'errorKeyOf mapea los códigos del avatar y cae en el genérico')
  const failed = cardTitled(i18n.t('library.editor.timeline.avatarFailed', { reason: i18n.t(errorKeyOf('avatar_moderation_rejected')) }))
  check(failed && [...failed.querySelectorAll('span')].some((span) => span.className.includes('bg-destructive/40')), 'fallido con el motivo de HeyGen y el velo rojo')
  const rendering = cardTitled(i18n.t('library.editor.timeline.avatarRendering'))
  check(rendering && /\d+%/.test(rendering.textContent), 'generando con su porcentaje')
  // El reloj corre solo (un tick por segundo): a 0,75 puntos por segundo el
  // entero cambia en menos de 1,4 s.
  const percentBefore = rendering.textContent.match(/\d+%/)[0]
  check(await waitFor(() => cardTitled(rendering.title)?.textContent.match(/\d+%/)?.[0] !== percentBefore, 'el porcentaje del render avanza solo (sigue en ' + percentBefore + ')'), 'el porcentaje del render avanza solo')
  // En cola (HeyGen renderiza de a diez, AVATAR_RENDER_CONCURRENCY): el mismo
  // «Generando el avatar…», sin porcentaje, aunque su reloj venga de hace un
  // minuto; al arrancar, el porcentaje vuelve (entrega 2d).
  window.setAvatarRendering({ 9: { startedAt, queued: true } })
  check(await waitFor(() => { const card = cardTitled(i18n.t('library.editor.timeline.avatarRendering')); return card && !/\d+%/.test(card.textContent) }, 'en cola, el bloque no muestra porcentaje'), 'en cola: «Generando el avatar…» sin porcentaje')
  window.setAvatarRendering({ 9: { startedAt } })
  check(await waitFor(() => /\d+%/.test(cardTitled(i18n.t('library.editor.timeline.avatarRendering'))?.textContent ?? ''), 'al arrancar, el porcentaje vuelve'), 'al arrancar su render, el porcentaje vuelve')
  check(document.querySelectorAll('[role=separator]').length === 1, 'una sola frontera arrastrable (entre las escenas 10 y 11): ' + document.querySelectorAll('[role=separator]').length)
  failed.click()
  await waitFor(() => window.selected.at(-1) === 6 && cardTitled(failed.title)?.className.includes('border-white'), 'clic en el avatar: selecciona su escena')
  check(sceneTimingLocked(scenes, [1, 2]) && sceneTimingLocked(scenes, [9, 10]) && !sceneTimingLocked(scenes, [10, 11]), 'las fronteras de un avatar quedan bloqueadas y las otras no')
  check(avatarRenderPercent(startedAt, startedAt + 60_000) === 45 && avatarRenderPercent(startedAt, startedAt + 120_000) === 90 && avatarRenderPercent(startedAt, startedAt + 3_600_000) === 99, 'el avance simulado: 45 % al minuto, 90 % a los 2 min, nunca 100')

  // Ruling D4 (spec §6.2): el panel de una escena de avatar no tiene imagen
  // que regenerar ni describir; el de una escena de imagen sí (control). La
  // animación de la escena no es lo que se prueba: el mismo stub que
  // check-editor-character-ui.mjs (sin clave de Kie, el aviso con su enlace).
  check(!sceneImageEditable(scenes[1]) && sceneImageEditable(scenes[0]), 'sceneImageEditable: no en la escena de avatar, sí en la de imagen')
  const panelAnimation = { busy: false, provider: 'kie', configuredProviders: new Set(), credits: null, creditsLoading: false, creditsRefreshing: false, onRefreshCredits() {}, activity: undefined, progress: undefined, error: undefined, plan: undefined, onAnimate() {} }
  const panelHost = document.createElement('div')
  document.body.append(panelHost)
  const panelRoot = createRoot(panelHost, { onUncaughtError: (error) => { renderError = error } })
  const showPanel = (panelScene) => panelRoot.render(<QueryClientProvider client={new QueryClient()}><I18nextProvider i18n={i18n}><MemoryRouter><TooltipProvider><EditorScenePanel scene={panelScene} projectId="fixture" scenes={scenes} characters={[]} imageChoice={{ provider: 'fal', quality: 'low' }} videoFormat="16:9" credits={null} creditsLoading={false} creditsRefreshing={false} onRefreshCredits={noop} busy={false} regenerateLocked={false} userPromptPending={false} errorKey={undefined} onUserPromptChange={noop} onUserPromptBlur={noop} canEditClipIn={false} canEditClipOut={false} onClipTimeChange={noop} onImageChoiceChange={noop} onCharactersChange={noop} onRegenerate={noop} animation={panelAnimation} /></TooltipProvider></MemoryRouter></I18nextProvider></QueryClientProvider>)
  const panelRegenerate = () => [...panelHost.querySelectorAll('button')].find((button) => button.textContent.includes(i18n.t('library.editor.panel.regenerate')))
  showPanel(scenes[1])
  await waitFor(() => panelHost.textContent.includes(i18n.t('library.editor.panel.avatarSceneHint')), 'el panel de la escena de avatar la explica (avatarSceneHint, entrega 2d)')
  // La nota es la clave vigente del catálogo: comparar con i18n.t de una clave
  // que no existe (la vieja avatarScene, cuando se borre) pasa en vacío.
  check(i18n.exists('library.editor.panel.avatarSceneHint'), 'la nota del avatar es la clave vigente del catálogo (avatarSceneHint)')
  check(!panelHost.querySelector('#scene-user-prompt') && !panelRegenerate(), 'sobre un avatar no hay descripción ni «Regenerar imagen»')
  // Sus tiempos se leen (la fila In/Out, sin el campo para tipearlos: sus
  // fronteras no se mueven) y Kie no la anima: sin la sección de animación.
  const editLabels = [i18n.t('library.editor.panel.clipInEdit'), i18n.t('library.editor.panel.clipOutEdit')]
  const animationTitle = i18n.t('library.editor.panel.animation.title')
  check(panelHost.textContent.includes(i18n.t('library.editor.panel.clipIn')) && panelHost.textContent.includes(i18n.t('library.editor.panel.clipOut')) && ![...panelHost.querySelectorAll('[aria-label]')].some((element) => editLabels.includes(element.getAttribute('aria-label'))), 'la escena de avatar muestra su In/Out de solo lectura')
  check(!panelHost.textContent.includes(animationTitle), 'sobre un avatar no hay sección de animación')
  showPanel(scenes[0])
  await waitFor(() => panelHost.querySelector('#scene-user-prompt'), 'el panel de una escena de imagen sigue con su descripción')
  check(panelRegenerate() && !panelHost.textContent.includes(i18n.t('library.editor.panel.avatarSceneHint')), 'y con «Regenerar imagen», sin la nota del avatar')
  check(panelHost.textContent.includes(animationTitle) && panelHost.textContent.includes(i18n.t('library.editor.panel.clipIn')), 'y con su animación y su In/Out, como siempre')

  // El aviso de imágenes faltantes no manda a regenerar una escena de avatar
  // (la 5 del proyecto, planeada y sin la copia del look).
  check(missingImageSceneIds(scenes).length === 0 && JSON.stringify(missingImageSceneIds([{ id: 1 }, { id: 2, avatar: view() }, { id: 3, imagePath: LOOK }])) === '[1]', 'las imágenes faltantes no cuentan las escenas de avatar')

  // La galería (entrega 2f, §22.4, cambiado a propósito: hasta la 2e no
  // listaba las escenas de avatar): en el orden del video, una tarjeta por
  // escena. Las de imagen, con su botón para elegirlas; las de avatar, con su
  // propia tarjeta («Escena N: aparición del avatar») y SIN botón para
  // elegirlas, ni al navegar ni con «Seleccionar»: no entran en la selección
  // de imágenes ni en sus acciones en lote. La descripción cuenta todas. Sus
  // acciones las prueba check-editor-avatar-gallery-ui.mjs.
  const galleryHost = document.createElement('div')
  document.body.append(galleryHost)
  const galleryRoot = createRoot(galleryHost, { onUncaughtError: (error) => { renderError = error } })
  const galleryQueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  galleryRoot.render(<QueryClientProvider client={galleryQueryClient}><I18nextProvider i18n={i18n}><MemoryRouter><TooltipProvider><EditorImageGallery projectId="fixture" scenes={scenes} videoFormat="16:9" durationSeconds={72} locked={false} busy={false} imageProvider="fal" onRegenerateImages={async () => true} onUndoAnimation={async () => true} undoingSceneId={null} /></TooltipProvider></MemoryRouter></I18nextProvider></QueryClientProvider>)
  const galleryTrigger = await waitFor(() => galleryHost.querySelector('input[aria-haspopup="dialog"]'), 'el interruptor de la galería')
  galleryTrigger.click()
  const imageScenes = scenes.filter((item) => !item.avatar).map((item) => item.id)
  const avatarScenes = scenes.filter((item) => item.avatar).map((item) => item.id)
  const galleryDialog = () => document.querySelector('[role="dialog"]')
  const galleryCards = () => [...(galleryDialog()?.querySelectorAll('[data-gallery-scene]') ?? [])]
  const cardId = (card) => Number(card.getAttribute('data-gallery-scene'))
  const avatarCardName = (id) => i18n.t('library.editor.imageGallery.avatarCardAria', { index: id })
  await waitFor(() => galleryCards().length === scenes.length, 'la galería abierta con una tarjeta por escena: ' + galleryCards().length)
  check(JSON.stringify(galleryCards().map(cardId)) === JSON.stringify(scenes.map((item) => item.id)), 'todas las escenas, las de avatar también, en el orden del video: ' + galleryCards().map(cardId).join(', '))
  check(i18n.exists('library.editor.imageGallery.avatarCardAria') && !avatarCardName(2).includes('{{') && avatarCardName(2) !== 'library.editor.imageGallery.avatarCardAria', 'el nombre de la tarjeta del avatar es una frase del catálogo: ' + avatarCardName(2))
  const avatarCards = galleryCards().filter((card) => card.getAttribute('aria-label') === avatarCardName(cardId(card)))
  check(JSON.stringify(avatarCards.map(cardId)) === JSON.stringify(avatarScenes), 'cada escena de avatar con su tarjeta nombrada «' + avatarCardName(2) + '»: ' + avatarCards.map(cardId).join(', '))
  const pickers = () => [...galleryDialog().querySelectorAll('[data-gallery-scene] button[aria-pressed]')]
  const pickerLabels = (key) => imageScenes.map((id) => i18n.t(key, { id }))
  check(JSON.stringify(pickers().map((button) => button.getAttribute('aria-label'))) === JSON.stringify(pickerLabels('library.editor.imageGallery.select')), 'solo las de imagen se eligen: ' + pickers().map((button) => button.getAttribute('aria-label')).join(', '))
  check(avatarCards.every((card) => !card.querySelector('button[aria-pressed]')), 'ninguna tarjeta de avatar tiene botón para elegirla')
  // Con escenas de avatar, la descripción con el avatar; sin ninguna, la de
  // antes de la 2f (ronda 3 de WP-C: las dos son frases distintas del
  // catálogo, y las dos cuentan todas las tarjetas).
  const describe = (key, count) => {
    const sentence = i18n.t(key, { count })
    check(i18n.exists(key, { count }) && sentence !== key && !sentence.includes('{{'), 'la clave ' + key + ' es una frase del catálogo: ' + sentence)
    return sentence
  }
  const withAvatar = describe('library.editor.imageGallery.descriptionWithAvatar', scenes.length)
  const plain = describe('library.editor.imageGallery.description', imageScenes.length)
  check(withAvatar !== describe('library.editor.imageGallery.description', scenes.length), 'la descripción con el avatar no es la de siempre')
  check(galleryDialog().textContent.includes(withAvatar), 'con escenas de avatar, la descripción con el avatar cuenta todas las tarjetas (' + scenes.length + '): ' + withAvatar)
  const selectMultiple = [...galleryDialog().querySelectorAll('button')].find((button) => button.textContent.trim() === i18n.t('library.editor.imageGallery.selectMultiple'))
  selectMultiple.click()
  await waitFor(() => JSON.stringify(pickers().map((button) => button.getAttribute('aria-label'))) === JSON.stringify(pickerLabels('library.editor.imageGallery.toggleScene')), 'con «Seleccionar», solo las de imagen se pueden marcar: ' + pickers().map((button) => button.getAttribute('aria-label')).join(', '))
  for (const picker of pickers()) picker.click()
  await waitFor(() => galleryDialog().textContent.includes(i18n.t('library.editor.imageGallery.selectedCount', { count: imageScenes.length })), 'marcar todo lo que se puede marcar elige las ' + imageScenes.length + ' de imagen y ninguna de avatar')
  check(galleryCards().filter((card) => avatarScenes.includes(cardId(card))).every((card) => !card.querySelector('button[aria-pressed]')), 'y las tarjetas de avatar siguen sin botón para elegirlas')
  // El mismo proyecto sin escenas de avatar: la descripción de antes de la 2f.
  galleryRoot.render(<QueryClientProvider client={galleryQueryClient}><I18nextProvider i18n={i18n}><MemoryRouter><TooltipProvider><EditorImageGallery projectId="fixture" scenes={scenes.filter((item) => !item.avatar)} videoFormat="16:9" durationSeconds={72} locked={false} busy={false} imageProvider="fal" onRegenerateImages={async () => true} onUndoAnimation={async () => true} undoingSceneId={null} /></TooltipProvider></MemoryRouter></I18nextProvider></QueryClientProvider>)
  await waitFor(() => galleryCards().length === imageScenes.length && galleryDialog().textContent.includes(plain), 'sin escenas de avatar, la descripción de siempre (' + imageScenes.length + '): ' + galleryDialog()?.querySelector('p')?.textContent)
  check(!galleryDialog().textContent.includes(describe('library.editor.imageGallery.descriptionWithAvatar', imageScenes.length)), 'sin avatar no promete regenerar el avatar')
  document.getElementById('result').textContent = 'PASS: avatar timeline blocks (' + checks + ' checks)'
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
    '<!doctype html><meta charset="utf-8"><div id="root"></div><pre id="result">RUNNING</pre><script>window.tokenChecks = ' +
      JSON.stringify(tokenChecks) +
      '</script><script type="module" src="./app.js"></script>',
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
