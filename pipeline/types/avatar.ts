// Contrato del avatar presentador (ADR-0057). Browser-safe: la UI importa
// estos tipos con `import type`, como characters.ts, y los valores (límites,
// tarifas y la regla del tramo de una escena) directamente; nada de acá ni de
// lo que importa puede traer Node. Las constantes son datos del dominio
// (precios y límites), no configuración.

import { slotFrames } from '../animation/timing.ts'
import type { VideoFormat } from './video-format.ts'

export const AVATAR_ENGINES = ['avatar_iv', 'avatar_iii', 'avatar_v'] as const
export type AvatarEngine = (typeof AVATAR_ENGINES)[number]

// El motor con el que arranca Crear (decisión del dueño del 2026-10-09: lo de
// hasta la 2e y lo más barato). Desde la entrega 2e un look sirve si admite al
// menos un motor con tarifa (avatarEngineAvailable), no solo este.
export const AVATAR_DEFAULT_ENGINE: AvatarEngine = 'avatar_iii'

// Desde la entrega 2e (pedido del dueño del 2026-10-12, diseño §21) la persona
// elige el motor en Crear. Orden en que se ofrecen (el del dueño: V, IV, III) y
// orden con el que se cae a otro cuando el look no admite el elegido (el más
// barato primero).
export const AVATAR_ENGINE_CHOICES: readonly AvatarEngine[] = [
  'avatar_v',
  'avatar_iv',
  'avatar_iii',
]
export const AVATAR_ENGINE_FALLBACK_ORDER: readonly AvatarEngine[] = [
  'avatar_iii',
  'avatar_iv',
  'avatar_v',
]

export const AVATAR_LOOK_TYPES = [
  'studio_avatar',
  'digital_twin',
  'photo_avatar',
] as const
export type AvatarLookType = (typeof AVATAR_LOOK_TYPES)[number]

export type AvatarOrientation = 'portrait' | 'landscape' | 'square'

// Género normalizado de un avatar. HeyGen lo manda como `male` / `female` en el
// stock público y como `Man` / `Woman` en los avatares propios (o no lo manda):
// `toAvatarGender` (providers/avatar/heygen.ts) lo lleva a estos dos valores y
// descarta el resto.
export const AVATAR_GENDERS = ['male', 'female'] as const
export type AvatarGender = (typeof AVATAR_GENDERS)[number]

// stock = avatar público de HeyGen; own = creado desde Vimo (foto) o propio de
// la cuenta de HeyGen del usuario.
export const AVATAR_OWNERSHIPS = ['stock', 'own'] as const
export type AvatarOwnership = (typeof AVATAR_OWNERSHIPS)[number]

// Estado de un avatar (o de uno de sus looks) en la biblioteca: los de stock
// nacen listos; uno creado desde foto, o un look generado con un prompt, queda
// «processing» hasta que HeyGen termina.
export const AVATAR_LIBRARY_STATUSES = [
  'ready',
  'processing',
  'failed',
] as const
export type AvatarLibraryStatus = (typeof AVATAR_LIBRARY_STATUSES)[number]

// Crear un avatar desde una foto (página de precios de HeyGen del 2026-09-16).
export const AVATAR_PHOTO_CREATION_USD = 1.32
export const AVATAR_NAME_LIMIT = 80

// Formatos con los que HeyGen genera un look desde un prompt
// (`PromptAvatarAspectRatio` de la OpenAPI v3): `auto` deja que lo elija, igual
// al de la imagen de referencia si la hay.
export const AVATAR_ASPECT_RATIOS = [
  'auto',
  '16:9',
  '9:16',
  '1:1',
  '4:5',
  '5:4',
] as const
export type AvatarAspectRatio = (typeof AVATAR_ASPECT_RATIOS)[number]

// Topes de un look generado desde un prompt (`maxLength` del prompt y
// `maxItems` de las imágenes de referencia en la OpenAPI v3).
export const AVATAR_PROMPT_LIMIT = 1000
export const AVATAR_REFERENCE_IMAGES_MAX = 3

// Previews de looks que se bajan a disco por avatar (principal + los de la tarjeta).
export const AVATAR_CARD_LOOK_PREVIEWS = 3

// HeyGen no publica el precio por look generado (2026-10-09): null = la UI no promete cifra.
export const AVATAR_LOOK_GENERATION_USD: number | null = null

// De dónde salió un look de la biblioteca: `vimo` = generado desde Vimo con un
// prompt; `heygen` = venía del grupo (el stock, la foto o la app de HeyGen).
export const AVATAR_LOOK_ORIGINS = ['heygen', 'vimo'] as const
export type AvatarLookOrigin = (typeof AVATAR_LOOK_ORIGINS)[number]

// Un look de HeyGen en nuestra forma. `lookId` es el `avatar_id` que se manda
// al pedir un video.
export interface HeyGenLook {
  lookId: string
  name: string
  lookType: AvatarLookType
  groupId?: string
  previewImageUrl?: string
  previewVideoUrl?: string
  gender?: AvatarGender
  supportedEngines: AvatarEngine[]
  preferredOrientation?: AvatarOrientation
  // Medidas de la imagen del look (`image_width`/`image_height` de HeyGen),
  // solo si son enteros positivos: el formato de la ficha cuando HeyGen no
  // informa la orientación (`lookFormatOf`, entrega 2c).
  imageWidth?: number
  imageHeight?: number
  // Solo en looks privados: cómo va el entrenamiento.
  status?: AvatarLibraryStatus
}

// Un avatar de HeyGen como grupo de looks (`GET /v3/avatars`). `looksCount` es
// cuántas variaciones tiene; los looks se piden aparte por `groupId`.
export interface HeyGenAvatarGroup {
  groupId: string
  name: string
  previewImageUrl?: string
  previewVideoUrl?: string
  gender?: AvatarGender
  looksCount: number
  // Solo en grupos privados: cómo va el entrenamiento (mismo mapeo que los looks).
  status?: AvatarLibraryStatus
}

// Un look dentro de un avatar de la biblioteca.
export interface AvatarLookSummary {
  lookId: string
  name: string
  lookType: AvatarLookType
  supportedEngines: AvatarEngine[]
  preferredOrientation?: AvatarOrientation
  status: AvatarLibraryStatus
  // vimo = generado desde Vimo con un prompt; heygen = venía del grupo.
  origin: AvatarLookOrigin
  // Ruta absoluta de la vista previa en disco; se deriva al listar, no se persiste.
  previewPath?: string
  createdAt: string
}

// Un avatar de la biblioteca = un grupo de HeyGen con sus looks. El look
// principal es `looks.find((look) => look.lookId === mainLookId)`.
export interface AvatarSummary {
  id: string
  name: string
  groupId: string
  ownership: AvatarOwnership
  gender?: AvatarGender
  // ready = hay un look principal listo; processing = entrena (foto) o ningún look listo
  // todavía; failed = la creación falló (errorCode).
  status: AvatarLibraryStatus
  errorCode?: string
  mainLookId: string | null
  looks: AvatarLookSummary[]
  // Vista previa del avatar: la del look principal, o la foto subida mientras entrena.
  previewPath?: string
  createdAt: string
  syncedAt?: string
}

// ─── Contratos de los subcomandos ───

export interface AvatarsListResult {
  entries: AvatarSummary[]
}

export interface AvatarStockGroupsPayload {
  ownership?: 'public' | 'private'
  token?: string
}

export interface AvatarStockGroupsResult {
  groups: HeyGenAvatarGroup[]
  nextToken: string | null
}

export interface AvatarStockLooksPayload {
  ownership?: 'public' | 'private'
  lookType?: AvatarLookType
  // Solo los looks de ese avatar (grupo); sin él, los de todo el listado.
  groupId?: string
  token?: string
}

export interface AvatarStockLooksResult {
  looks: HeyGenLook[]
  nextToken: string | null
}

// `avatar-stock-types` (entrega 2b, diseño §18): qué grupos públicos de HeyGen
// son avatares de estudio y cuáles gemelos digitales; los demás son de foto.
// HeyGen no expone categorías en el listado de grupos, así que Vimo barre los
// looks públicos por tipo (gratis) y lo guarda 24 h en
// `<projectsRoot>/avatars/STOCK_TYPES_CACHE_FILE`.
export interface AvatarStockTypesPayload {
  // true = ignorar la caché y volver a barrer HeyGen.
  refresh?: boolean
}

// `avatar-heygen-delete` (entrega 2c, pedido del dueño del 2026-10-11): borra
// de verdad un avatar PROPIO de la cuenta de HeyGen (`DELETE
// /v3/avatars/{group_id}`, con todos sus looks; HeyGen no deja borrar grupos
// públicos ni de la comunidad) y, si estaba en la biblioteca, también su
// entrada local. No se puede deshacer.
export interface AvatarHeygenDeletePayload {
  groupId: string
  // Nombre del avatar, solo para la fila del log de soporte
  // (`diagnostics/subject.rs` lee `name`), como en `avatar-add`: el sidecar no
  // lo usa.
  name?: string
}

export interface AvatarHeygenDeleteResult {
  groupId: string
  // Ids de las entradas de la biblioteca que se quitaron por ser de ese grupo.
  removedEntryIds: string[]
}

export interface AvatarStockTypesResult {
  // Ids de grupo, ordenados y sin repetir.
  studioGroupIds: string[]
  twinGroupIds: string[]
  // Cuándo se barrió HeyGen (ISO 8601) y si la respuesta salió de la caché.
  fetchedAt: string
  fromCache: boolean
  // Alguna barrida llegó al tope de páginas con más por leer: la lista es parcial.
  truncated: boolean
}

export const STOCK_TYPES_CACHE_FILE = '.stock-types.json'
export const STOCK_TYPES_CACHE_TTL_MS = 24 * 60 * 60_000
// Tope de páginas por barrida (50 looks por página). Medido el 2026-10-11:
// estudio 26 páginas, gemelos 17.
export const STOCK_TYPES_MAX_PAGES = 80

export interface AvatarAddPayload {
  groupId: string
  // stock → HeyGen ownership public; own → private.
  ownership: AvatarOwnership
  // Si falta (o no sirve): el primer look listo que admite algún motor con
  // tarifa (isUsableLook, entrega 2e).
  mainLookId?: string
  // Del listado de grupos: `GET /v3/avatars/{id}` de un grupo público no trae gender.
  gender?: AvatarGender
  // Nombre del avatar en el listado, solo para la fila del log de soporte
  // (`diagnostics/subject.rs` lee `name`): el sidecar no lo usa, el nombre que
  // guarda es el que da HeyGen al leer el grupo.
  name?: string
}

export interface AvatarAddResult {
  entry: AvatarSummary
}

export interface AvatarCreatePhotoPayload {
  name: string
  // Ruta absoluta de la foto elegida con el dialog nativo (JPEG o PNG, hasta
  // MAX_PHOTO_BYTES; HeyGen no acepta WEBP); el sidecar la valida, la copia y
  // la sube.
  photoPath: string
}

export interface AvatarCreatePhotoResult {
  entry: AvatarSummary
}

export interface AvatarRefreshPayload {
  id: string
}

export interface AvatarRefreshResult {
  entry: AvatarSummary
}

export interface AvatarSetMainLookPayload {
  id: string
  lookId: string
}

export interface AvatarSetMainLookResult {
  entry: AvatarSummary
}

export interface AvatarGenerateLookPayload {
  id: string
  // 1..AVATAR_PROMPT_LIMIT caracteres tras quitar los espacios de las puntas.
  prompt: string
  aspectRatio: AvatarAspectRatio
  // Rutas absolutas de hasta AVATAR_REFERENCE_IMAGES_MAX fotos (JPEG/PNG ≤ MAX_PHOTO_BYTES).
  referenceImagePaths?: string[]
  // Nombre del look; si falta: `<avatar.name> · <n>`.
  name?: string
}

export interface AvatarGenerateLookResult {
  entry: AvatarSummary
  lookId: string
}

// Saldo de HeyGen para la vista Avatares. Mismo molde que ProviderCreditsStatus
// (pipeline/types/video-project.ts) sin `unlimited`, que HeyGen no tiene. Lo
// muestra la píldora `AvatarBalanceBadge` del módulo de avatares, que formatea
// por moneda (`usd` en dólares; otra, como créditos).
export interface AvatarBalanceResult {
  available: boolean
  remaining?: number
  // `usd` en la billetera verificada (2026-10-09); la OpenAPI admite también
  // `credits`, que no es una moneda.
  currency?: string
  // Con available false, por qué: missing_api_key, avatar_invalid_key,
  // avatar_balance_unavailable (cuenta sin billetera legible)…
  errorCode?: string
}

export interface AvatarDeletePayload {
  id: string
}

// ─── El avatar dentro del video (entrega 2, diseño §3) ───

// Límites de Crear y del planificador (§3.4). El mínimo por aparición es
// decisión del dueño: 7 s el 2026-10-07; 5 s desde la entrega 2d (pregunta 4,
// 2026-10-11: «5 o 10 segundos, máximo 1 minuto»). El máximo, el hueco y la
// cantidad no cambian.
export const AVATAR_MIN_APPEARANCE_SECONDS = 5
export const AVATAR_MAX_APPEARANCE_SECONDS = 60
export const AVATAR_DEFAULT_APPEARANCE_SECONDS = 10
export const AVATAR_MIN_APPEARANCES = 1
export const AVATAR_MAX_APPEARANCES = 10
export const AVATAR_DEFAULT_APPEARANCES = 3
// Mínimo de imágenes entre dos apariciones.
export const AVATAR_MIN_GAP_SECONDS = 10
// Silencio máximo que una aparición carga después de la última palabra de una
// frase (entrega 2b, decisión del dueño del 2026-10-11, diseño §5): una frase
// que es una palabra y un silencio largo no se vuelve un avatar mudo que HeyGen
// cobra. Por encima, la frase cierra la aparición en `lastWordEndSeconds` más
// este tope, al cuadro.
export const AVATAR_MAX_PAUSE_SECONDS = 2
// Frases de la narración (pipeline/narration/sentences.ts): una pausa así
// cierra una frase sin puntuación, y una frase más larga que el máximo se
// parte en su pausa interna más larga.
export const SENTENCE_PAUSE_SECONDS = 0.35
export const MAX_SENTENCE_SECONDS = 15
// Renders de HeyGen a la vez (su tope es 10).
export const AVATAR_RENDER_CONCURRENCY = 3
// Espera creciente al consultar el estado de un render.
export const AVATAR_POLL_INITIAL_MS = 5000
export const AVATAR_POLL_MAX_MS = 20_000
// HeyGen dice 1–5 min; su centro de ayuda, hasta 10 por minuto de video.
export const AVATAR_RENDER_DEADLINE_MS = 30 * 60_000
// Grafemas (lo que se ve como un carácter) del nombre del video que entran en
// el título de cada render de HeyGen (entrega 2c, decisión del dueño del
// 2026-10-11, diseño §7.1): el título es `<nombre> · <marca>` y la marca, que
// recupera un pedido sin respuesta, va siempre entera (avatarNamedVideoTitle,
// pipeline/avatar/fingerprint.ts).
export const AVATAR_VIDEO_TITLE_NAME_LIMIT = 80
// Desfase a partir del cual el visor reajusta un clip de avatar: los labios no
// toleran los 0,3 s que se le permiten a un clip animado.
export const AVATAR_PREVIEW_RESYNC_SECONDS = 0.12
// La orientación del look que va con cada formato del proyecto: horizontal en
// 16:9 y vertical en 9:16. Crear ofrece el look con esto y create-video-project
// lo valida (`lookOrientationFit`, pipeline/avatar/look-orientation.ts); un
// formato nuevo en VideoFormat obliga a decidir el suyo acá.
export const AVATAR_LOOK_ORIENTATION_BY_FORMAT: Readonly<
  Record<VideoFormat, AvatarOrientation>
> = {
  '16:9': 'landscape',
  '9:16': 'portrait',
}

const SECONDS_PER_MINUTE = 60

// USD por minuto de video (página de precios de HeyGen del 2026-09-16). null =
// ese motor no aplica a ese tipo de look y no se ofrece. Es la única fuente
// del estimador: si HeyGen cambia precios, se cambia acá.
// Avatar V (entrega 2e, R-2e-2): el proveedor solo publica V con gemelo
// digital; con looks de foto o de estudio se estima a esa tarifa como techo
// hasta medir el cobro real en la QA.
export const AVATAR_USD_PER_MINUTE: Readonly<
  Record<AvatarEngine, Readonly<Record<AvatarLookType, number | null>>>
> = {
  avatar_iii: { digital_twin: 0.6, studio_avatar: 0.99, photo_avatar: 0.99 },
  avatar_iv: { digital_twin: 4.83, studio_avatar: 4.83, photo_avatar: 2.31 },
  avatar_v: { digital_twin: 7.2, studio_avatar: 7.2, photo_avatar: 7.2 },
}

export function avatarUsdPerMinute(
  engine: AvatarEngine,
  lookType: AvatarLookType,
): number | null {
  // Un motor o un tipo de look fuera de la tabla (un dato viejo o raro) no
  // tiene tarifa: null, nunca undefined (revisión de WP-Y, entrega 2e).
  return AVATAR_USD_PER_MINUTE[engine]?.[lookType] ?? null
}

// Estimación local de `seconds` de avatar (HeyGen no devuelve el cobro):
// segundos / 60 × tarifa. null si el motor no aplica a ese tipo de look; 0 si
// no hay nada que renderizar.
export function estimateAvatarUsd(
  seconds: number,
  engine: AvatarEngine,
  lookType: AvatarLookType,
): number | null {
  const rate = avatarUsdPerMinute(engine, lookType)
  if (rate === null) return null
  if (!Number.isFinite(seconds) || seconds <= 0) return 0

  return (seconds / SECONDS_PER_MINUTE) * rate
}

// ¿El look admite este motor y Vimo tiene tarifa para su tipo? (entrega 2e)
export function avatarEngineAvailable(
  engine: AvatarEngine,
  look: Pick<AvatarLookSummary, 'supportedEngines' | 'lookType'>,
): boolean {
  if (!look.supportedEngines.includes(engine)) return false

  return avatarUsdPerMinute(engine, look.lookType) !== null
}

// El motor con el que sale un look: el preferido si el look lo admite; si no,
// el primero que admite en AVATAR_ENGINE_FALLBACK_ORDER; null si ninguno.
export function avatarEngineFor(
  preferred: AvatarEngine,
  look: Pick<AvatarLookSummary, 'supportedEngines' | 'lookType'>,
): AvatarEngine | null {
  if (avatarEngineAvailable(preferred, look)) return preferred

  const fallback = AVATAR_ENGINE_FALLBACK_ORDER.find((engine) =>
    avatarEngineAvailable(engine, look),
  )
  return fallback ?? null
}

// ─── Movimiento (entrega 2e, diseño §21.1 y §21.2) ───

// Qué acepta el proveedor con cada motor y tipo de look (OpenAPI v3 leída el
// 2026-10-12): `motion_prompt` con looks de foto en IV y V, y con looks de video
// (gemelo digital, estudio) solo en V; `expressiveness` solo con looks de foto
// en IV. Avatar III no acepta ninguno de los dos.
export interface AvatarMotionSupport {
  motionPrompt: boolean
  expressiveness: boolean
}

export function avatarMotionSupport(
  engine: AvatarEngine,
  lookType: AvatarLookType,
): AvatarMotionSupport {
  if (engine === 'avatar_iii')
    return { motionPrompt: false, expressiveness: false }

  if (engine === 'avatar_v')
    return { motionPrompt: true, expressiveness: false }

  const photo = lookType === 'photo_avatar'
  return { motionPrompt: photo, expressiveness: photo }
}

// ¿El interruptor «Movimiento más expresivo» hace algo con este motor y este
// look? Con V cambia el prompt de movimiento; con IV y un look de foto, además,
// manda `expressiveness`.
export function avatarExpressiveAvailable(
  engine: AvatarEngine,
  lookType: AvatarLookType,
): boolean {
  const support = avatarMotionSupport(engine, lookType)
  return support.motionPrompt || support.expressiveness
}

// El nivel que manda «más expresivo» (IV con un look de foto). Apagado no se
// manda nada y el proveedor usa `low`.
export const AVATAR_EXPRESSIVE_LEVEL = 'high'

// «Más expresivo» con Avatar V sobre un prompt que escribió la persona
// (R-2e-14): V no acepta `expressiveness`, así que el pedido lleva su prompt
// con esta frase al final, separada por un espacio (el prompt de la escena
// queda como lo escribió). El automático no la lleva: Vimo ya lo escribe
// expresivo (R-2e-10).
export const AVATAR_EXPRESSIVE_PROMPT_SUFFIX =
  'More energy and clearer gestures.'

// Tope del prompt de movimiento que se puede escribir en el editor y que el
// sidecar acepta; el que escribe Vimo apunta a AVATAR_MOTION_PROMPT_TARGET
// (la guía del proveedor pide hasta dos cláusulas cortas).
export const AVATAR_MOTION_PROMPT_LIMIT = 300
export const AVATAR_MOTION_PROMPT_TARGET = 160
// El proveedor repite (o deja quieto) el movimiento propio pasado este largo:
// una aparición más larga lleva un porte sostenido, sin un gesto puntual.
export const AVATAR_MOTION_LOOP_SECONDS = 10

// Dónde va el avatar al crear el video: `auto` = Vimo elige los momentos
// (entrega 2); `manual` = sin apariciones al crear, se agregan desde el
// editor (entrega 3).
export const AVATAR_PLACEMENTS = ['auto', 'manual'] as const
export type AvatarPlacement = (typeof AVATAR_PLACEMENTS)[number]

// `options.avatar` del proyecto (§3.4), validado en create-video-project.
// `avatarId` es el id del avatar en la biblioteca (`avatars/<id>/`, §16): con
// él se valida el look y se copia su vista previa sin recorrer la biblioteca.
// `engine` es el motor que eligió la persona en Crear (entrega 2e, §21.3): uno
// de AVATAR_ENGINES que el look admite con tarifa (avatarEngineAvailable).
export interface ProjectAvatarOptions {
  avatarId: string
  lookId: string
  lookName: string
  lookType: AvatarLookType
  engine: AvatarEngine
  // AVATAR_MIN_APPEARANCES..AVATAR_MAX_APPEARANCES
  appearances: number
  // AVATAR_MIN_APPEARANCE_SECONDS..AVATAR_MAX_APPEARANCE_SECONDS
  secondsPerAppearance: number
  // La primera aparición abre el video.
  startWithAvatar: boolean
  placement: AvatarPlacement
  // «Movimiento más expresivo» (entrega 2e, §21.3): viaja solo en true y solo
  // si el motor y el look lo admiten (avatarExpressiveAvailable).
  expressive?: boolean
}

// Solo tres estados persistidos y ninguno transitorio (misma lección que
// SceneAnimationStatus): un job que muere no deja un «generando» en disco.
export type SceneAvatarStatus = 'planned' | 'ready' | 'failed'

// Recibo de un pedido a HeyGen (pago una sola vez, como AnimationAttempt):
// `creating` se persiste ANTES del POST, `pending` con el `videoId` después y
// `ambiguous` si el POST no respondió (la próxima corrida busca su render por
// la marca del `title`).
// Sin fondo propio: el clip trae el del look (dirección del dueño del
// 2026-10-10), así que no hay asset ni huella de fondo.
export interface AvatarAttempt {
  // Huella del pedido: look + motor + formato + resolución + hash del audio
  // cortado + versión de la narración. El número de intentos fallidos o
  // rechazados del mismo pedido NO entra acá: va en la clave del intento
  // (avatarRequestKey(hash, retryIndex), pipeline/avatar/fingerprint.ts), de la
  // que salen la Idempotency-Key, la marca del `title` y los mp4; así un fallo
  // o un rechazo no se repite 24 h con la misma clave y los intentos de un
  // mismo pedido comparten `hash`.
  hash: string
  state: 'creating' | 'pending' | 'succeeded' | 'failed' | 'ambiguous'
  engine: AvatarEngine
  lookId: string
  audioAssetId?: string
  // El `title` exacto que salió en el POST de este intento (entrega 2c): el
  // nombre del video y la marca. Se guarda ANTES del POST y cada repetición
  // manda este mismo, aunque el video cambie de nombre. Un recibo de antes de
  // la 2c no lo tiene: su POST llevaba la marca sola y su repetición también.
  // La recuperación busca primero el render con este título exacto (o con la
  // marca sola, si falta), también pidiéndolo por este título, y solo sin él
  // uno que termine en la marca (findOwnVideo, pipeline/avatar/lane.ts).
  title?: string
  videoId?: string
  videoUrl?: string
  // El `failure_code` de HeyGen, tal cual.
  failureCode?: string
  // Nuestro avatar_* (diseño §14).
  errorCode?: string
  createdAt: string
  // El movimiento que salió en el cuerpo de este intento (entrega 2e, §21.2):
  // una repetición manda el mismo. Ausentes: el pedido no los llevaba.
  motionPrompt?: string
  expressiveness?: typeof AVATAR_EXPRESSIVE_LEVEL
}

// La escena de avatar (ADR-0057): la escena ES el tramo del avatar y su clip
// ES la escena, con el fondo propio del look (dirección del dueño del
// 2026-10-10). Su texto son las frases que dice; Vimo no le genera prompt ni
// imagen: su vista previa fija es la del look (`avatar/look.<ext>`) y su clip
// vive en `avatar/` (pipeline/avatar/clip-path.ts).
export interface SceneAvatar {
  lookId: string
  lookName: string
  lookType: AvatarLookType
  engine: AvatarEngine
  origin: 'auto' | 'manual'
  status: SceneAvatarStatus
  // Nombre local validado del clip normalizado (nunca una ruta del webview).
  clipFile?: string
  normalizedSeconds?: number
  // Contra qué narración y qué tramo se renderizó: si cambian, el clip queda
  // desactualizado (derivado al leer, nunca persistido, §3.3).
  renderHash?: string
  narrationVersion?: number
  // Recibos de HeyGen. Se escriben solo bajo `withAnimationCheckpointLease`,
  // releyendo scenes.json justo antes (el molde es `persist` de
  // pipeline/animation/generate.ts); lo que reescribe scenes.json entero desde
  // una copia (los cortes, el reemplazo de narración) corre bajo el lease
  // exclusivo del proyecto, que excluye a los generadores. Nunca entran en
  // `animations[]`, `animationPending[]` ni `animationHistory[]` (§7.4).
  attempts?: AvatarAttempt[]
  // Estimación local: segundos × tarifa (estimateAvatarUsd).
  usdEstimated?: number
  errorCode?: string
  // ─── Movimiento (entrega 2e, §21.2 y §21.4) ───
  // «Movimiento más expresivo» (Crear o el editor). Solo se guarda en true.
  expressive?: boolean
  // El prompt de movimiento que viaja en el pedido (V y IV, si el motor y el
  // look lo admiten). Vacío o ausente: el movimiento propio del motor.
  motionPrompt?: string
  // Quién escribió `motionPrompt`: Vimo (`auto`, se reescribe si cambia el
  // texto de la escena) o la persona en el editor (`user`, nunca se toca solo).
  motionSource?: 'auto' | 'user'
  // El último que escribió Vimo, para «Usar el automático».
  autoMotionPrompt?: string
  // Huella (avatarMotionTextHash) del tono y el texto de la escena con los que
  // se escribió `autoMotionPrompt` (R-2e-10): `expressive` o `calm` según «más
  // expresivo», un salto de línea y el texto. Si cambia el texto o se prende o
  // apaga «más expresivo», Vimo lo reescribe (si la persona no escribió el
  // suyo): con V es lo que hace que el interruptor cambie el pedido.
  autoMotionTextHash?: string
  // El proveedor rechazó el movimiento con este look: los pedidos siguientes
  // van sin `motion_prompt` ni `expressiveness`.
  motionUnsupported?: boolean
  // Toma: sube cuando la persona regenera una escena cuyo pedido ya tiene un
  // clip cobrado, para que el carril pida uno nuevo. Entra en la huella del
  // pedido solo si es mayor que 0.
  take?: number
}

// Lo que el corte siembra en una escena de avatar antes de generar nada.
export type SceneAvatarSeed = Pick<
  SceneAvatar,
  'lookId' | 'lookName' | 'lookType' | 'engine' | 'origin' | 'expressive'
>

// Vista de la escena de avatar para la UI (viaja en el status, el detalle y
// los eventos del proyecto): sin recibos, sin el nombre local del clip y sin
// la huella; con la ruta absoluta del clip si existe y su mtime como
// cache-buster, como SceneAnimationView. `stale` se deriva al leer
// (toSceneAvatarView) y nunca se persiste; desde la entrega 2d va en toda
// escena lista desactualizada, también en la que perdió su clip y se muestra
// `failed` (la fase no la paga sola: el costo de reanudar la deja afuera).
// La toma y la huella del automático tampoco viajan (entrega 2e): son del
// sidecar, como los recibos.
export interface SceneAvatarView extends Omit<
  SceneAvatar,
  'attempts' | 'clipFile' | 'renderHash' | 'take' | 'autoMotionTextHash'
> {
  clipPath?: string
  clipMtimeMs?: number
  stale?: boolean
}

// El tramo de una escena de avatar, en sus segundos tal cual.
export interface AvatarSceneSpan {
  startSeconds: number
  endSeconds: number
}

// Lo mínimo que se lee de una escena para saber su tramo: sirve igual para
// `Scene` (sidecar) y para `SceneDetail` (UI).
export interface AvatarSpanScene {
  avatar?: unknown
  startSeconds?: number
  endSeconds?: number
}

// El tramo de una escena de avatar, o undefined si la escena no es de avatar o
// su tramo no llega a un cuadro del reloj de 25 fps del render (sin tiempos,
// invertido, o con los dos bordes en el mismo cuadro). Es la ÚNICA regla de
// «avatar de largo cero» (ADR-0057): el carril no le pide a HeyGen un tramo
// así, el planificador de Kie no lo cuenta como cubierto, y la pista y el visor
// no le dibujan bloque ni le montan clip.
export function avatarSceneSpan(
  scene: AvatarSpanScene,
): AvatarSceneSpan | undefined {
  const { avatar, startSeconds, endSeconds } = scene
  if (!avatar) return undefined

  if (startSeconds === undefined || endSeconds === undefined) return undefined

  if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds))
    return undefined

  if (slotFrames(startSeconds, endSeconds) < 1) return undefined

  return { startSeconds, endSeconds }
}

// Payload del subcomando `avatar-render-scenes` (editor; base de la entrega 3).
export interface AvatarRenderScenesPayload {
  projectId: string
  // Escenas de avatar a generar o regenerar. Una escena lista con el mismo
  // pedido no se vuelve a pagar; una desactualizada pide un render nuevo, y una
  // cuyo último pedido HeyGen rechazó para siempre se vuelve a pedir.
  sceneIds: number[]
  // Entrega 2e (§21.4): escenas listas que la persona pidió regenerar, un
  // render nuevo pagado aunque nada cambie. Subconjunto de `sceneIds`; va solo
  // si no está vacío.
  regenerateSceneIds?: number[]
  // Ajustes de movimiento de escenas de V o IV que se guardan en la escena
  // antes de pedir. Va solo si no está vacío.
  motion?: AvatarSceneMotionInput[]
}

// Los ajustes de movimiento de una escena desde el editor (entrega 2e, §21.4).
export interface AvatarSceneMotionInput {
  sceneId: number
  // Como lo dejó la persona; el sidecar lo recorta. Vacío: sin movimiento
  // propio (el del motor).
  motionPrompt: string
  expressive: boolean
}

export interface AvatarRenderScenesResult {
  rendered: number[]
  failed: number[]
}
