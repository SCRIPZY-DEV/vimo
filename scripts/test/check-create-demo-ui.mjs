// Crear en la demo montado de verdad (spec demo v4 §2 y §8, «Guards de UI de
// Crear en demo»): la vista Create entera, con sus hooks reales, en Chrome
// headless, sin red ni Tauri, sin ninguna clave de API y con la plantilla de
// gemas encendida. Afirma el cableado que check-app-demo-form.mjs (las reglas
// puras) no ve: la tarjeta que la pestaña Catálogo usa sin una elegida sale de
// la lista del catálogo con su historia (con un id del pack que la lista no
// trae) y el primer cambio la deja en el formulario sin pisar lo escrito; el
// texto de la pestaña cuenta las tarjetas a la vista; el switch de avatar
// funciona y se ve encendido sin clave de HeyGen (withAvatarKey) y sin leer la
// biblioteca; encendido, pedir otra gema o la pestaña Catálogo vuelve a
// Jardinería, no toca la selección guardada de la otra pestaña y muestra el
// aviso hasta el siguiente cambio (formato, switch o volver a elegir
// Jardinería); una tarjeta del Catálogo guardada sin historia en el formato
// actual no se restaura; elegir la gema vieja del pack no la manda a migrar
// (la demo no llama al agente); y el envío sale con la historia elegida, sin
// options.avatar. Y lo que la spec §8 pide del resto del formulario: un solo
// modelo de IA (el de la casa, sin enlace a Ajustes) aunque todos estén
// bloqueados, sin apagar Mi estilo ni frenar, y el envío lleva ese modelo
// con todos bloqueados; los personajes según la
// historia (el modo es el de la historia y no el recordado en la app, ni en
// la galería, ni en la tarjeta por defecto, ni en «Ver»; el chip «Personaje
// del estilo», quieto, solo con un estilo con personaje fijo; en «Ver», sin
// «Mi personaje» ni «Sin personaje» y sin la pista que invita a elegir
// (ruling R32); la memoria de la app intacta); sin la
// casilla de subtítulos; sin consulta ni bloqueo por saldo (imagen y Kie en
// cero), ni etiquetas de saldo en el selector de imagen (ruling R31); y la
// animación: el switch funciona sin clave de Kie, sin aviso ni
// estimación, queda en «Próximamente» con una historia sin variante animada y
// viaja en el payload con el primer minuto.
// Sin red: Tauri y fetch van simulados y rechazan todo lo que no se fija acá;
// las APIs parten de las reales con solo sus lecturas reemplazadas, y un
// envoltorio de CreateForm expone lo que Create le pasa (valor, onChange y la
// selección de la otra pestaña).
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { withChrome } from './chrome-session.mjs'

const chrome =
  process.argv[2] ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const root = await mkdtemp(join(tmpdir(), 'vimo-create-demo-ui-'))
// Cada lectura nueva del guard se reemplaza en el módulo real (el simulacro
// parte de él), así un miembro nuevo del api no queda viejo en silencio.
const mocks = {
  '@/modules/common/supabase/client':
    'export const supabase = { auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, functions: { invoke: async () => ({ data: null, error: new Error("guard: sin red") }) } }',
  '@/modules/avatars/api': [
    "import { avatarsApi as real } from './src/modules/avatars/api/index.ts'",
    'export const avatarsApi = { ...real, isNative: () => true, async list() { window.avatarListCalls += 1; return [] }, async balance() { return { available: true, remaining: 5, currency: "usd" } }, imageSource: (path) => "fixture://" + path }',
  ].join('\n'),
  // Ninguna clave: la demo no depende de HeyGen ni de ningún proveedor.
  '@/modules/api-keys/api': [
    "import { apiKeysApi as real } from './src/modules/api-keys/api/index.ts'",
    'export const apiKeysApi = { ...real, isNative: () => true, async getStatus() { return [] } }',
  ].join('\n'),
  '@/modules/settings/api': [
    "import { settingsApi as real } from './src/modules/settings/api/index.ts'",
    'export const settingsApi = { ...real, async getDefaultSceneCount() { return 0 }, async getSceneDurationDefaults() { return { secondsPerScene: 5, confirmScenes: true } }, async getPromptModelDefaults() { return { modelId: "modelo-rapido", compact: false } }, async getVoiceVendor() { return null } }',
  ].join('\n'),
  // El catálogo de modelos de prompts (el de la casa y dos más; en Ajustes la
  // persona eligió otro) y los saldos de imagen y de Kie en cero: con la
  // estimación de siempre, la demo frenaría por saldo. Cada lectura de saldo
  // se cuenta.
  '@/modules/common/api': [
    "import { commonApi as real } from './src/modules/common/api/index.ts'",
    'export const commonApi = { ...real, isNative: () => true, async listPromptModels() { return structuredClone(window.fixture.promptModels) }, async getImageCredits() { window.imageCreditReads += 1; return { fal: { available: true, remaining: 0 }, evolink: { available: true, remaining: 0 } } }, async getVideoCredits() { window.videoCreditReads += 1; return { kie: { available: true, remaining: 0 }, poyo: { available: true, remaining: 0 } } } }',
  ].join('\n'),
  // La lista del catálogo y la de Mi estilo, el agente que migra gemas (cuenta
  // y falla) y la creación del proyecto (guarda el pedido y frena).
  '@/modules/videos/api': [
    "import { videosApi as real } from './src/modules/videos/api/index.ts'",
    'export const videosApi = { ...real, isNative: () => true, async listCatalogStyles() { return structuredClone(window.fixture.catalog) }, async listCustomStyles() { return structuredClone(window.fixture.customStyles) }, async rebuildGem() { window.rebuildCalls += 1; throw new Error("guard: sin agente") }, async createProject(payload) { window.lastPayload = payload; const error = new Error("guard: sin proyecto"); error.code = "guard_stop"; throw error }, imageSource: (path) => "fixture://" + path }',
  ].join('\n'),
  // Lo que Create le pasa al formulario: el valor, onChange y la selección de
  // la otra pestaña.
  '@/modules/videos/components/CreateForm': [
    "import React from 'react'",
    "import { CreateForm as Real } from './src/modules/videos/components/CreateForm.tsx'",
    'export function CreateForm(props) { window.formProps = props; return React.createElement(Real, props) }',
  ].join('\n'),
}
const entry = String.raw`
import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import i18n from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router'
import es from './public/locales/es.json'
import { commonQueryKeys } from '@/modules/common/constants'
import { queryClient } from '@/modules/common/queryClient'
import { TooltipProvider } from '@/modules/common/ui/tooltip'
import { blockPromptModel, isPromptModelBlocked } from '@/modules/common/utilities/promptModelBlocks'
import { Create } from '@/modules/videos/views/Create'
import { CATALOG_CHARACTER_STORAGE_KEY, VideosRoutes } from '@/modules/videos/constants'
import { openCatalogStyleViewer } from '@/modules/videos/hooks/useCatalogStyleViewer'

let checks = 0
let renderError
const check = (condition, message) => { if (!condition) throw new Error(message); checks += 1 }
const delay = (ms = 30) => new Promise((done) => setTimeout(done, ms))
async function waitFor(get, message) {
  for (let index = 0; index < 200; index++) { if (renderError) throw renderError; const value = get(); if (value) return value; await delay() }
  throw new Error(message)
}
await i18n.init({ lng: 'es', resources: { es: { translation: es } }, interpolation: { escapeValue: false } })

// Todo texto que se compara con el catálogo es una frase de verdad: una clave
// ausente se traduce como su ruta y la comparación pasaría en vacío.
function phrase(key, vars) {
  const sentence = i18n.t(key, vars)
  check(i18n.exists(key, vars) && sentence !== key && !sentence.includes('{{'), 'la clave ' + key + ' es una frase del catálogo: ' + sentence)
  return sentence
}

// El pack: 2d-mono sin Short y con el personaje del estilo, Jardinería con
// avatar solo en 16:9, y la historia Short de cosmos sin su variante animada.
const story = (id, format, extra = {}) => ({ id, suggestedName: 'Historia ' + id + ' ' + format, script: 'Guion de ' + id + ' en ' + format, sceneCount: 20, audioDurationSeconds: 60, audioFile: '/pack/' + (format === '9:16' ? 'short/' : '') + id + '/audio.mp3', character: 'none', animated: true, ...extra })
const AVATAR = { name: 'Jardineria', engine: 'avatar_iv', appearances: 5, secondsPerAppearance: 5, previewFile: '/pack/gemas/jardineria/avatar.jpg', options: { avatarId: 'jardineria-a', lookId: 'look-j', lookName: 'Jardineria', lookType: 'photo_avatar', engine: 'avatar_iv', appearances: 5, secondsPerAppearance: 5, startWithAvatar: true, placement: 'auto' } }
const DEMO = {
  version: 'v4',
  voice: { provider: 'ai33', voiceId: 'v1', name: 'Abel' },
  gems: [{ id: 'storytelling', styleId: 'demo-storytelling', name: 'STORYTELLING2' }, { id: 'jardineria', styleId: 'demo-jardineria', name: 'JARDINERIA' }],
  stories: {
    '16:9': { styles: [story('normal', '16:9'), story('2d-mono', '16:9', { character: 'generic' }), story('cosmos', '16:9')], gems: [story('storytelling', '16:9', { character: 'generic' }), story('jardineria', '16:9', { avatar: AVATAR })] },
    '9:16': { styles: [story('cosmos', '9:16', { animated: false }), story('normal', '9:16')], gems: [story('storytelling', '9:16', { character: 'generic' })] },
  },
}
// Cada estilo admite los tres modos, como los del catálogo; 2D Mono trae su
// personaje escrito (la sección «character»).
const gem = (id, sections = {}) => ({ id, name: { es: 'Estilo ' + id, en: 'Style ' + id, pt: 'Estilo ' + id }, tags: [], sections: { visualStyle: 'Visual ' + id, ...sections }, templateVersion: 1, allowedModes: ['generic', 'own', 'none'], sampleMode: 'none', colorFilter: 'none', sampleCount: 0 })
const promptModel = (id, label) => ({ id, label, author: 'Autor de ' + label, speed: 'fast', tokensField: 'max_tokens', outputTokensMargin: 0, inCatalog: true, inUi: true })
// Lo que la persona dejó en la app: «Mi personaje» recordado para cosmos y
// 2D Mono. La demo no lo lee ni lo pisa.
const REMEMBERED = { cosmos: { mode: 'own' }, '2d-mono': { mode: 'own' } }
window.fixture = {
  // La lista del catálogo no trae normal (el primero del pack: se ocultó) y
  // trae uno que el pack no tiene (nuevo).
  catalog: { version: 1, entries: [gem('nuevo'), gem('cosmos'), gem('2d-mono', { character: 'Un mono gris dibujado a mano alzada' })] },
  promptModels: { models: [promptModel('modelo-casa', 'Modelo de la casa'), promptModel('modelo-rapido', 'Modelo rápido'), promptModel('modelo-caro', 'Modelo caro')], defaultId: 'modelo-casa', batchSize: 10 },
  // Storytelling es una gema vieja (texto, sin secciones), como la del pack;
  // st-mio es un estilo propio que la demo no muestra.
  customStyles: { entries: [
    { id: 'st-mio', name: 'Mi estilo propio', shots: [], createdAt: '2026-10-01T00:00:00Z', samples: [], sections: { visualStyle: 'Propio' }, templateVersion: 1, colorFilter: 'none', character: { mode: 'none' } },
    { id: 'demo-storytelling', name: 'STORYTELLING2', systemPrompt: 'Narra como un cuentacuentos de radio.', shots: [], createdAt: '2026-10-01T00:00:00Z', samples: [], character: { mode: 'generic' } },
    { id: 'demo-jardineria', name: 'JARDINERIA', shots: [], createdAt: '2026-10-01T00:00:00Z', samples: [], sections: { visualStyle: 'Huerta' }, templateVersion: 1, colorFilter: 'none', character: { mode: 'none' } },
  ] },
}
window.avatarListCalls = 0
window.rebuildCalls = 0
window.imageCreditReads = 0
window.videoCreditReads = 0

// La plantilla de gemas encendida (la migración automática existe) y el
// catálogo nuevo apagado (la demo lo enciende igual).
queryClient.setQueryData(commonQueryKeys.access, { features: { gemTemplate: true } })
// La memoria de modos de la app y todos los modelos de prompts bloqueados
// (ADR-0028), antes de montar Crear.
localStorage.setItem(CATALOG_CHARACTER_STORAGE_KEY, JSON.stringify(REMEMBERED))
for (const model of window.fixture.promptModels.models) blockPromptModel(model.id, 'error')

function Probe() { window.navigate = useNavigate(); return null }
const reactRoot = createRoot(document.getElementById('root'), { onUncaughtError: (error) => { renderError = error } })
reactRoot.render(<QueryClientProvider client={queryClient}><I18nextProvider i18n={i18n}><TooltipProvider><MemoryRouter initialEntries={['/fuera']}><Probe /><Routes><Route path={VideosRoutes.create} element={<Create />} /><Route path="*" element={<p id="away">fuera de Crear</p>} /></Routes></MemoryRouter></TooltipProvider></I18nextProvider></QueryClientProvider>)

const form = () => window.formProps?.value
const pageText = () => document.body.textContent
// Una tarjeta de galería (role=button) por el nombre de su pie.
const cardNamed = (name) => [...document.querySelectorAll('[role=button]')].find((card) => [...card.querySelectorAll('p')].some((paragraph) => paragraph.textContent.trim() === name)) ?? null
const tabNamed = (label) => [...document.querySelectorAll('[role=tab]')].find((tab) => tab.textContent.includes(label)) ?? null
const buttonWith = (label) => [...document.querySelectorAll('button')].find((button) => button.textContent.includes(label)) ?? null
const avatarSwitch = () => document.getElementById('create-avatar')
const animationSwitch = () => document.getElementById('create-animate-scenes')
const noticeShown = () => [...document.querySelectorAll('[role=alert]')].some((alert) => alert.textContent.includes(USE_THIS_STYLE))
const styleCharacterChip = () => document.querySelector('[data-style-character-chip]')
// Lo que falta para generar, tal como lo dice la alerta (vacío: nada).
const blockersText = () => document.getElementById('create-blockers')?.textContent ?? ''
async function click(element, message) {
  check(element, message)
  element.click()
  await delay(60)
}

const USE_THIS_STYLE = phrase('create.avatar.demoUseThisStyle')
const SHORT = phrase('create.format.shortTitle')
const LONG = phrase('create.format.longTitle')
const CATALOG_TAB = phrase('create.styleSource.catalog')
const CUSTOM_TAB = phrase('create.styleSource.custom')

try {
  await waitFor(() => window.navigate, 'router listo')
  window.navigate(VideosRoutes.create, { state: { demo: DEMO } })
  await waitFor(() => form(), 'Crear montado')

  // 1. La pestaña Catálogo sin tarjeta usa la primera de la galería: normal
  // (el primero del pack) no está en la lista, así que es cosmos, con su
  // historia, aunque el formulario arrancó con la de normal.
  await waitFor(() => form().customStyle?.catalogStyleId === 'cosmos', 'la tarjeta por defecto: la primera de la galería (cosmos), no ' + form().customStyle?.catalogStyleId)
  check(form().styleSource === 'catalog' && form().videoFormat === '16:9', 'arranca en Catálogo y 16:9')
  check(form().name === 'Historia cosmos 16:9' && form().narrationFilePath === '/pack/cosmos/audio.mp3', 'la historia es la de la tarjeta por defecto: ' + form().name)
  check(cardNamed('Estilo cosmos') && cardNamed('Estilo 2d-mono') && !cardNamed('Estilo normal') && !cardNamed('Estilo nuevo'), 'la galería muestra solo los del pack que la lista trae')
  check(pageText().includes(phrase('create.styleSource.catalogHintDemo', { count: 2 })), 'el texto de la pestaña cuenta las 2 tarjetas a la vista')
  check(phrase('create.styleSource.catalogHintDemo', { count: 0 }) === phrase('create.styleSource.catalogHintDemo_zero'), 'sin tarjetas a la vista (la lista carga) el texto no dice una cifra')
  check(!pageText().includes(phrase('create.scenes.countLabel')) && !pageText().includes(phrase('create.scenes.confirmLabel')), 'sin cantidad de escenas ni «Confirmar escenas» (el carril viejo no existe en la demo)')

  // 1b. Un solo modelo de IA, el de la casa, sin enlace a Ajustes, aunque
  // todos estén bloqueados: el bloqueo (ADR-0028) no aplica en la demo, Mi
  // estilo sigue a mano y nada frena. La tarjeta por defecto toma el modo de
  // personaje de su historia (cosmos: sin personaje), no el recordado en la
  // app («Mi personaje»): ni sección de personajes ni un personaje que pedir.
  // Sin la casilla de subtítulos, y el saldo de imagen en cero no frena.
  check(localStorage.getItem(CATALOG_CHARACTER_STORAGE_KEY) === JSON.stringify(REMEMBERED), 'la memoria de modos de la app quedó sembrada')
  await waitFor(() => pageText().includes('Modelo de la casa'), 'la tarjeta del modelo de la casa')
  check(!pageText().includes('Modelo rápido') && !pageText().includes('Modelo caro'), 'un solo modelo de IA: el de la casa, ni el de Ajustes ni los demás')
  check(!pageText().includes(phrase('create.promptModel.settingsLink')) && !pageText().includes(phrase('create.promptModel.allBlocked')), 'sin enlace a Ajustes ni el aviso de los modelos bloqueados')
  check(!tabNamed(CUSTOM_TAB).disabled && !pageText().includes(phrase('create.styleSource.customBlockedHint')), 'con todos los modelos bloqueados, Mi estilo sigue a mano')
  check(form().customStyle.character?.mode === 'none', 'la tarjeta por defecto con el modo de su historia, no el recordado: ' + JSON.stringify(form().customStyle.character))
  check(!styleCharacterChip() && !pageText().includes(phrase('create.characters.label')) && !pageText().includes(phrase('create.characters.labelOfStyle')) && !pageText().includes(phrase('create.characters.choose')), 'una historia sin personaje no muestra la sección de personajes')
  check(!pageText().includes(phrase('create.subtitles.label')), 'sin la casilla de subtítulos')
  check(blockersText() === '', 'no falta ningún paso (ni personaje, ni modelos, ni saldo): ' + blockersText())
  check(!pageText().includes('evolink.ai') && !pageText().includes('fal.ai') && !document.querySelector('[aria-label="' + phrase('create.credits.refresh') + '"]'), 'el selector de imagen no muestra etiquetas de saldo (ruling R31)')

  // 2. El primer cambio deja la tarjeta derivada en el formulario: lo escrito
  // no lo pisa la historia.
  window.formProps.onChange({ name: 'Mi video de cosmos' })
  await waitFor(() => form().name === 'Mi video de cosmos', 'el nombre escrito con la tarjeta derivada se queda: ' + form().name)
  check(form().customStyle?.catalogStyleId === 'cosmos' && form().script === 'Guion de cosmos en 16:9', 'la tarjeta y el guion siguen siendo los de cosmos')

  // 2b. La animación funciona sin clave de Kie, sin su aviso ni la
  // estimación de créditos; y la demo no consulta ni frena por saldo (imagen
  // y Kie en cero: con la estimación de siempre, frenaría): ni el pre-check
  // ni el selector de imagen leen un saldo (ruling R31).
  check(animationSwitch() && !animationSwitch().disabled && animationSwitch().getAttribute('aria-checked') === 'false', 'el switch de animación se puede tocar en la demo')
  await click(animationSwitch(), 'el switch de animación')
  await waitFor(() => form().animateScenes === true && animationSwitch().getAttribute('aria-checked') === 'true', 'la animación encendida')
  check(pageText().includes(phrase('create.animation.hint')) && !pageText().includes(phrase('create.validation.animationKeyRequired')) && !pageText().includes(phrase('create.animation.estimateTitle')), 'encendida: su explicación, sin el aviso de la clave de Kie ni la estimación de créditos')
  await delay(300)
  check(!pageText().includes(phrase('common.credits.title')) && blockersText() === '', 'con saldo en cero, ni «Saldo insuficiente» ni un paso que falte: ' + blockersText())
  check(window.imageCreditReads === 0 && window.videoCreditReads === 0, 'la demo no consulta ningún saldo, ni de imagen ni de Kie: ' + JSON.stringify({ image: window.imageCreditReads, video: window.videoCreditReads }))

  // 3. «Ver» sin «Pasar a mi estilo» y sin elegir el modo de personaje: con
  // cosmos (historia sin personaje), nada de personaje; con 2D Mono (historia
  // con el personaje del estilo), solo «Personaje del estilo», quieto. «Usar
  // en este video» lo elige con el modo de su historia y no toca la memoria
  // de la app.
  openCatalogStyleViewer({ catalogStyleId: 'cosmos' })
  const cosmosDialog = await waitFor(() => document.querySelector('[role=dialog]'), 'el modal de «Ver» de cosmos')
  check(!cosmosDialog.textContent.includes(phrase('create.catalog.characterTitle')) && !cosmosDialog.querySelector('[role=switch]'), '«Ver» de una historia sin personaje no muestra el bloque de personaje')
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await waitFor(() => !document.querySelector('[role=dialog]'), 'el modal se cierra')
  openCatalogStyleViewer({ catalogStyleId: '2d-mono' })
  const dialog = await waitFor(() => document.querySelector('[role=dialog]'), 'el modal de «Ver»')
  check(!dialog.textContent.includes(phrase('create.catalog.copyToCustom')), '«Ver» no ofrece «Pasar a mi estilo» en la demo')
  check(dialog.textContent.includes(phrase('create.styleCharacter.fromStyle.title')) && !dialog.textContent.includes(phrase('create.styleCharacter.own.title')) && !dialog.textContent.includes(phrase('create.styleCharacter.none.title')), '«Ver» de 2D Mono: «Personaje del estilo», sin «Mi personaje» ni «Sin personaje»')
  const modeSwitches = [...dialog.querySelectorAll('[role=switch]')]
  check(modeSwitches.length === 1 && modeSwitches.every((toggle) => toggle.disabled), 'en «Ver» el modo no se cambia: una sola fila, quieta (' + modeSwitches.length + ' switches)')
  check(dialog.textContent.includes(phrase('create.catalog.characterTitle')) && !dialog.textContent.includes(phrase('create.catalog.characterHint')), 'en «Ver» no hay pista que invite a elegir el personaje (ruling R32)')
  await click(buttonWith(phrase('create.catalog.useButton')), '«Usar en este video»')
  await waitFor(() => form().customStyle?.catalogStyleId === '2d-mono' && !document.querySelector('[role=dialog]'), '«Usar en este video» elige 2D Mono y cierra «Ver»')
  check(form().customStyle.character?.mode === 'generic', '2D Mono con el modo de su historia (el personaje del estilo), no el recordado: ' + JSON.stringify(form().customStyle.character))
  check(localStorage.getItem(CATALOG_CHARACTER_STORAGE_KEY) === JSON.stringify(REMEMBERED), 'la demo no toca el modo recordado en la app: ' + localStorage.getItem(CATALOG_CHARACTER_STORAGE_KEY))

  // 4. Elegir en la galería también toma el modo de la historia: cosmos, sin
  // personaje ni sección; 2D Mono, el chip «Personaje del estilo», que es un
  // cartel (el modo no se cambia). Después, una tarjeta guardada sin historia
  // en el formato actual no vuelve: 2D Mono en 16:9, Mi estilo, Short y otra
  // vez Catálogo.
  await click(cardNamed('Estilo cosmos'), 'la tarjeta de cosmos')
  await waitFor(() => form().customStyle?.catalogStyleId === 'cosmos', 'cosmos elegido')
  check(form().customStyle.character?.mode === 'none' && !styleCharacterChip(), 'cosmos con el modo de su historia, sin sección de personajes: ' + JSON.stringify(form().customStyle.character))
  await click(cardNamed('Estilo 2d-mono'), 'la tarjeta de 2D Mono')
  await waitFor(() => form().customStyle?.catalogStyleId === '2d-mono', '2D Mono elegido')
  check(form().customStyle.character?.mode === 'generic', '2D Mono elegido en la galería con el modo de su historia: ' + JSON.stringify(form().customStyle.character))
  const chip = await waitFor(() => styleCharacterChip(), 'el chip del personaje del estilo')
  check(chip.dataset.styleCharacterChip === 'style-decides' && chip.tagName === 'DIV' && chip.textContent.includes(phrase('create.styleCharacter.fromStyle.title')) && !pageText().includes(phrase('create.characters.wantYours')), 'el chip «Personaje del estilo» es un cartel: el modo no se cambia')
  check(blockersText() === '', 'con la historia de 2D Mono no falta ningún paso: ' + blockersText())
  await click(tabNamed(CUSTOM_TAB), 'la pestaña Mi estilo')
  await waitFor(() => form().styleSource === 'custom', 'en Mi estilo')
  check(window.formProps.otherTabStyle?.catalogStyleId === '2d-mono', 'la pestaña Catálogo guarda 2D Mono')
  check(cardNamed('STORYTELLING2') && cardNamed('JARDINERIA') && !cardNamed('Mi estilo propio'), 'Mi estilo muestra solo las gemas del pack')
  check(!pageText().includes(phrase('create.customStyles.createCard')), 'sin «Crear estilo» en la demo')
  await click(buttonWith(SHORT), 'el formato Short')
  await waitFor(() => form().videoFormat === '9:16', 'Short elegido')
  check(!cardNamed('JARDINERIA'), 'en Short no está Jardinería')
  await click(tabNamed(CATALOG_TAB), 'la pestaña Catálogo')
  await waitFor(() => form().styleSource === 'catalog' && form().customStyle?.catalogStyleId === 'cosmos', '2D Mono (sin Short) no se restaura: queda la primera de la galería, cosmos; quedó ' + form().customStyle?.catalogStyleId)
  check(form().narrationFilePath === '/pack/short/cosmos/audio.mp3', 'con la historia Short de cosmos')
  check(!buttonWith(SHORT).disabled, 'Short sigue elegible')
  check(pageText().includes(phrase('create.styleSource.catalogHintDemo', { count: 1 })), 'en Short la pestaña cuenta la única tarjeta a la vista')
  // La historia Short de cosmos no trae su variante animada: el switch queda
  // en «Próximamente» y lo que se valida y se envía va sin animación, sin
  // perder la elección.
  check(animationSwitch().disabled && animationSwitch().getAttribute('aria-checked') === 'false' && animationSwitch().closest('section').textContent.includes(phrase('common.proximamente')), 'sin historia animada, el switch de animación en «Próximamente»')
  check(form().animateScenes === false, 'sin historia animada, el formulario que se valida y se envía va sin animación')
  await click(buttonWith(LONG), 'el formato largo')
  await waitFor(() => form().videoFormat === '16:9', 'de vuelta en 16:9')
  check(form().animateScenes === true && !animationSwitch().disabled && animationSwitch().getAttribute('aria-checked') === 'true', 'con una historia animada la animación vuelve encendida')

  // 5. La gema vieja del pack no se manda a migrar: la demo no llama al
  // agente aunque la plantilla esté encendida.
  await click(tabNamed(CUSTOM_TAB), 'la pestaña Mi estilo')
  await waitFor(() => form().styleSource === 'custom', 'en Mi estilo')
  await click(cardNamed('STORYTELLING2'), 'la tarjeta de Storytelling')
  await waitFor(() => form().customStyle?.styleId === 'demo-storytelling', 'Storytelling elegida')
  await delay(400)
  check(window.rebuildCalls === 0, 'elegir la gema vieja del pack no llama al agente (' + window.rebuildCalls + ')')
  check(!pageText().includes(phrase('create.gemTemplate.adaptingTitle')) && !pageText().includes(phrase('create.gemTemplate.migrationFailedNamed', { name: 'STORYTELLING2' })), 'ni muestra una migración ni su aviso')
  check(!styleCharacterChip() && !pageText().includes(phrase('create.characters.label')), 'la gema vieja del pack (genérica, sin su personaje escrito) no muestra la sección de personajes')
  await click(tabNamed(CATALOG_TAB), 'la pestaña Catálogo')
  await waitFor(() => form().styleSource === 'catalog', 'en Catálogo, con Storytelling guardada para Mi estilo')
  check(window.formProps.otherTabStyle?.styleId === 'demo-storytelling', 'la pestaña Mi estilo guarda Storytelling')

  // 6. El switch de avatar sin clave de HeyGen: se enciende y se ve encendido
  // (withAvatarKey no lo apaga en la demo), lleva a Mi estilo con Jardinería
  // en 16:9 y no lee la biblioteca de avatares.
  check(avatarSwitch() && !avatarSwitch().disabled && avatarSwitch().getAttribute('aria-checked') === 'false', 'el switch se puede tocar sin clave de HeyGen')
  await click(avatarSwitch(), 'el switch de avatar')
  await waitFor(() => form().useAvatar === true, 'el avatar llega encendido al formulario que se valida y se envía')
  await waitFor(() => avatarSwitch().getAttribute('aria-checked') === 'true', 'el switch se ve encendido')
  check(form().styleSource === 'custom' && form().customStyle?.styleId === 'demo-jardineria' && form().videoFormat === '16:9', 'encendido: Mi estilo con Jardinería en 16:9')
  check(pageText().includes(phrase('create.avatar.demoAppearances', { count: 5, seconds: 5 })) && !pageText().includes(phrase('create.avatar.noKey')), 'la tarjeta del pack (5 × 5 s), sin aviso de clave')
  check(window.avatarListCalls === 0, 'la demo no lee la biblioteca de avatares (' + window.avatarListCalls + ')')
  check(window.formProps.otherTabStyle?.styleId === 'demo-storytelling', 'encender no toca lo guardado de la otra pestaña')
  check(!styleCharacterChip(), 'Jardinería (historia sin personaje) no muestra la sección de personajes')

  // 7. Encendido, pedir otra gema o la pestaña Catálogo vuelve a Jardinería,
  // no toca lo guardado y avisa; el aviso se va con el siguiente cambio.
  check(!noticeShown(), 'sin aviso antes de pedir otro estilo')
  const stored = window.formProps.otherTabStyle
  await click(cardNamed('STORYTELLING2'), 'la tarjeta de Storytelling')
  await waitFor(() => noticeShown(), 'el aviso al pedir otra gema con el switch encendido')
  check(form().customStyle?.styleId === 'demo-jardineria', 'sigue Jardinería')
  await click(tabNamed(CATALOG_TAB), 'la pestaña Catálogo')
  check(form().styleSource === 'custom' && form().customStyle?.styleId === 'demo-jardineria' && noticeShown(), 'pedir Catálogo no cambia de pestaña y sigue el aviso')
  check(window.formProps.otherTabStyle === stored, 'la redirección no toca la selección guardada de la otra pestaña')
  check(buttonWith(SHORT).disabled, 'con el switch encendido, Short queda en «Próximamente»')
  await click(buttonWith(LONG), 'el formato largo (el mismo)')
  await waitFor(() => !noticeShown(), 'el aviso se va con el siguiente cambio de formato')
  await click(cardNamed('STORYTELLING2'), 'la tarjeta de Storytelling otra vez')
  await waitFor(() => noticeShown(), 'el aviso vuelve con otro pedido')
  // Volver a elegir Jardinería con el switch encendido es justo lo pedido:
  // no hay redirección y el aviso se va.
  await click(cardNamed('JARDINERIA'), 'la tarjeta de Jardinería con el switch encendido')
  await waitFor(() => !noticeShown(), 'elegir Jardinería con el switch encendido borra el aviso')
  check(form().customStyle?.styleId === 'demo-jardineria' && form().useAvatar === true, 'sigue Jardinería con el switch encendido')
  await click(cardNamed('STORYTELLING2'), 'la tarjeta de Storytelling una vez más')
  await waitFor(() => noticeShown(), 'el aviso vuelve')

  // 8. Apagarlo con Jardinería vuelve a Catálogo con la primera tarjeta y su
  // historia; el aviso se va.
  await click(avatarSwitch(), 'el switch de avatar')
  await waitFor(() => form().useAvatar === false, 'apagado')
  check(!noticeShown(), 'el aviso se va al tocar el switch')
  await waitFor(() => form().styleSource === 'catalog' && form().customStyle?.catalogStyleId === 'cosmos', 'apagarlo con Jardinería vuelve a Catálogo con la primera tarjeta')
  check(form().name === 'Historia cosmos 16:9', 'con su historia')

  // 9. Con el switch apagado, elegir Jardinería lo enciende, y el envío sale
  // con su historia y sin options.avatar ni bloqueos del avatar; con la
  // animación del primer minuto, sin subtítulos y con el modelo de la casa
  // (la tarjeta que se vio) aunque todos los modelos sigan bloqueados, y
  // aunque el saldo de imagen y de Kie esté en cero (ni se lo lee al enviar).
  check(window.fixture.promptModels.models.every((model) => isPromptModelBlocked(model.id)), 'los modelos siguen bloqueados al enviar')
  await click(tabNamed(CUSTOM_TAB), 'la pestaña Mi estilo')
  await waitFor(() => form().styleSource === 'custom', 'en Mi estilo')
  await click(cardNamed('JARDINERIA'), 'la tarjeta de Jardinería')
  await waitFor(() => form().useAvatar === true && form().customStyle?.styleId === 'demo-jardineria', 'elegir Jardinería enciende el switch')
  window.lastPayload = null
  await click(buttonWith(phrase('create.form.submit')), 'el botón de generar')
  await waitFor(() => window.lastPayload, 'el envío llega a crear el proyecto: ' + blockersText())
  const options = window.lastPayload.options
  check(options.demo === true && options.customStyle?.styleId === 'demo-jardineria' && options.videoFormat === '16:9' && options.avatar === undefined, 'el envío: demo, Jardinería, 16:9 y sin options.avatar: ' + JSON.stringify({ demo: options.demo, style: options.customStyle?.styleId, format: options.videoFormat, avatar: options.avatar }))
  check(options.animationMinutes === 1 && options.animateWholeVideo === false, 'la animación encendida viaja con el primer minuto: ' + JSON.stringify({ minutes: options.animationMinutes, whole: options.animateWholeVideo }))
  check(options.subtitles === false && options.promptModel === 'modelo-casa', 'sin subtítulos y con el modelo de la casa, el de la tarjeta, con todos los modelos bloqueados: ' + JSON.stringify({ subtitles: options.subtitles, model: options.promptModel }))
  check(window.imageCreditReads === 0 && window.videoCreditReads === 0, 'ni al enviar se lee un saldo: ' + JSON.stringify({ image: window.imageCreditReads, video: window.videoCreditReads }))

  document.getElementById('result').textContent = 'PASS: create demo (' + checks + ' checks)'
} catch (error) {
  const reason = renderError && renderError !== error ? ' (render error: ' + renderError.message + ')' : ''
  document.getElementById('result').textContent = 'FAIL: ' + error.message + reason
}
`

// Antes del bundle: sin red, sin Tauri y con los errores de carga a la vista.
const stubs = [
  '<script>',
  'window.addEventListener("error", (event) => { const out = document.getElementById("result"); if (out) out.textContent = "FAIL: load " + event.message })',
  'window.fetch = () => Promise.reject(new Error("guard: sin red"))',
  'window.isTauri = true',
  'window.__TAURI_INTERNALS__ = { invoke: () => Promise.reject(new Error("guard: sin tauri")), convertFileSrc: (path) => "fixture://" + path, transformCallback: () => 0, unregisterCallback: () => {}, metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } } }',
  'window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} }',
  '</script>',
].join('\n')

try {
  const output = await build({
    stdin: { contents: entry, resolveDir: resolve('.'), loader: 'jsx' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    tsconfig: 'tsconfig.app.json',
    define: {
      'process.env.NODE_ENV': '"development"',
      __APP_VERSION__: '"0.0.0-guard"',
    },
    loader: {
      '.png': 'dataurl',
      '.svg': 'dataurl',
      '.jpg': 'dataurl',
      '.webp': 'dataurl',
      '.mp3': 'dataurl',
      '.woff2': 'dataurl',
    },
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
    '<!doctype html><meta charset="utf-8">' +
      stubs +
      '<div id="root"></div><pre id="result">RUNNING</pre><script type="module" src="./app.js"></script>',
  )
  await withChrome(chrome, join(root, 'profile'), async (call) => {
    const { targetId } = await call('Target.createTarget', {
      url: pathToFileURL(join(root, 'index.html')).href,
    })
    const { sessionId } = await call('Target.attachToTarget', {
      targetId,
      flatten: true,
    })
    // Pedidos cortos: cada llamada de CDP tiene su propio plazo (20 s) y la
    // corrida entera tarda más.
    let status = 'RUNNING'
    for (let attempt = 0; attempt < 240 && status === 'RUNNING'; attempt++) {
      await new Promise((done) => setTimeout(done, 250))
      const result = await call(
        'Runtime.evaluate',
        {
          expression: 'document.getElementById("result")?.textContent',
          returnByValue: true,
        },
        sessionId,
      )
      status = result.result?.value ?? 'RUNNING'
    }
    assert.ok(status.startsWith('PASS:'), status)
    process.stdout.write(status + '\n')
  })
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 3 })
}
