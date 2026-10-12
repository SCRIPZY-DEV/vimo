import { readFile, rm } from 'node:fs/promises'
import { basename } from 'node:path'

import { saveClipToFile } from '../animation/download.ts'
import { inspectAnimationFile } from '../animation/normalize-file.ts'
import { ANIMATION_FPS, frameBoundary } from '../animation/timing.ts'
import { isValidFile, type ProjectPaths } from '../project/paths.ts'
import {
  HEYGEN_VIDEO_RESOLUTION,
  type HeyGenClient,
  type HeyGenListedVideo,
  type HeyGenVideo,
  type HeyGenVideoStatus,
} from '../providers/avatar/heygen.ts'
import {
  HEYGEN_PROVIDER,
  HeyGenFailure,
  heygenVideoFailure,
} from '../providers/avatar/heygen-errors.ts'
import type { AvatarScenePhase } from '../runner/events.ts'
import { PipelineFailure, toPipelineFailure } from '../runner/failure.ts'
import {
  AVATAR_EXPRESSIVE_LEVEL,
  AVATAR_EXPRESSIVE_PROMPT_SUFFIX,
  AVATAR_POLL_INITIAL_MS,
  AVATAR_POLL_MAX_MS,
  AVATAR_RENDER_DEADLINE_MS,
  avatarMotionSupport,
  avatarSceneSpan,
  estimateAvatarUsd,
  type AvatarAttempt,
  type AvatarMotionSupport,
  type SceneAvatar,
} from '../types/avatar.ts'
import type { Scene } from '../types/scenes.ts'
import type { FrameSize, VideoFormat } from '../types/video-format.ts'
import {
  isInsufficientCreditsCode,
  isInsufficientCreditsFailure,
} from '../utils/insufficient-credits.ts'
import { sleep } from '../utils/sleep.ts'
import {
  avatarAudioFile,
  avatarClipFile,
  avatarClipFileName,
  avatarRawClipFile,
  sceneAvatarClipFile,
} from './clip-path.ts'
import {
  avatarAudioCutHash,
  avatarIdempotencyKey,
  avatarNamedVideoTitle,
  avatarRenderHash,
  avatarRequestHash,
  avatarRequestKey,
  avatarRetryIndex,
  avatarVideoTitle,
  endsWithAvatarVideoMarker,
} from './fingerprint.ts'
import {
  AVATAR_DURATION_TOLERANCE_SECONDS,
  cutAvatarAudio,
  normalizeAvatarClip,
  removeStaleTemporaries,
  type AvatarClipNormalization,
} from './normalization.ts'

// Carril de UNA escena de avatar (ADR-0057, diseño §7.2 con la decisión del
// dueño del 2026-10-10: el clip ES la escena, con el fondo propio del look, y
// Vimo solo manda el audio). Pago una sola vez, como el carril de Kie
// (ADR-0042), pero con recibos propios en `scene.avatar`:
//  1. la identidad del pedido sale de trabajo local (el tramo en cuadros y la
//     huella del corte de audio), sin hablar con HeyGen;
//  2. un recibo del pedido actual se cosecha: `succeeded` se baja, `pending`
//     se consulta, `creating`/`ambiguous` se busca en HeyGen (findOwnVideo:
//     una página por su título guardado si no es la marca sola, y después por
//     la marca; el título exacto primero y, sin él, uno que termine en la
//     marca y no esté `failed`) y, sin rastro, se repite con la MISMA
//     `Idempotency-Key` (HeyGen deduplica 24 h) y el mismo título;
//  3. solo sin recibo (y con `allowNewRequest`) se corta y se sube el audio, se
//     persiste `creating` (con el título que va a salir) ANTES del POST y
//     `pending` después;
//  4. espera creciente con plazo, descarga y normalización al cuadro del
//     render sin cambiar la velocidad: la narración manda (§7.3).
// Un «no» definitivo al POST (un 4xx que no es 409 ni 429, o el cliente que no
// lo manda) cierra el recibo `failed`: el próximo intento lleva la clave
// siguiente. Todo lo demás (409, 429, 5xx, red, un 200 raro) lo deja
// `ambiguous`, porque el original pudo haberse creado; también cualquier
// rechazo que llegue después de un `409 request_in_progress` del mismo pedido
// (HeyGen confirmó el original en vuelo), y, en la repetición de un recibo sin
// resolver, un 401, 402, 403, 408 o 425 o un rechazo por saldo, que pueden
// resolverse antes de mirar la clave.
// El bloqueo de un intento sin resolver es por huella: uno de un pedido VIEJO
// (otra narración, otro tramo, otro look) no frena al actual ni se vuelve a
// mandar; lo que el carril protege es no pagar dos veces el MISMO pedido.
// Un pedido que HeyGen rechazó para siempre (moderación, o un look o motor que
// no sirve) tampoco se repite solo: volvería a fallar igual. Lo pide de nuevo
// la persona desde el editor (`retryFinalRejection`), o cambia el look o la
// narración, que es otra huella.
// Una cancelación sale como tal (nunca como un fallo de HeyGen) y deja los
// recibos guardados.
// El título de cada render (entrega 2c, diseño §7.1) es `<nombre del video> ·
// <marca>` (fingerprint.ts) y queda guardado en el intento antes de salir.
// Cada POST del intento lleva el MISMO cuerpo: su título guardado o, en un
// recibo de antes de la 2c (que no lo tiene), la marca sola, como salió su POST
// original. La recuperación adopta, en este orden: el render con ese título
// EXACTO —buscado primero por el título guardado, una página, por si HeyGen
// filtra por igualdad o por prefijo, y después por la marca, en cualquiera de
// las páginas revisadas—; si no aparece, uno que termine en la marca (HeyGen
// pudo guardar distinto el nombre o el separador) y no esté `failed`, el más
// avanzado. Una copia hecha en HeyGen («Copia de <título>») también termina
// así: nunca le gana al exacto, y una `failed` no se elige (cerraría el
// intento y se pagaría otro render). Un renombre del video no cambia nada: se
// busca y se repite el título guardado.
// El movimiento (entrega 2e, diseño §21.2): un pedido nuevo lleva el de la
// escena que el motor y el look admiten (`avatarRequestMotion`): el prompt
// recortado y, con «más expresivo», `expressiveness: 'high'`. Los dos y la
// toma entran en la huella del pedido solo cuando van (los pedidos de Avatar
// III y los recibos de antes no cambian) y se guardan en el recibo, así cada
// repetición manda el mismo cuerpo. Si HeyGen rechaza el movimiento para ese
// look (`avatar_motion_unsupported`, un 400 que no se cobra), el intento se
// cierra, la escena queda `motionUnsupported` y el carril pide enseguida el
// pedido sin movimiento (otra huella, otra clave).
// Regenerar una escena lista (`forceNewRender`, entrega 2e, diseño §21.4): el
// carril no toma el atajo de «lista con el mismo pedido» y la escena conserva
// su clip de hoy hasta que el nuevo está listo; si el render nuevo falla (o la
// cuenta pausa), vuelve a su estado listo anterior con los recibos y los
// ajustes nuevos. Que sea un render NUEVO lo decide la toma de la escena, que
// la orquestación sube antes (render-scenes.ts): sin ella, un recibo
// `succeeded` del mismo pedido se cosecharía gratis.

// Cada consulta de estado espera un 50 % más que la anterior, hasta el tope.
const POLL_GROWTH = 1.5
// Páginas de `GET /v3/videos?title=…` que se revisan al buscar un pedido sin
// respuesta (la marca es única por intento; HeyGen filtra por substring y
// también devuelve las copias).
const RECOVERY_PAGES = 3
// Entre los renders que solo terminan en la marca, cuál se adopta: el
// completado antes que el que está en curso, y ese antes que uno con un estado
// que Vimo no conoce. Uno `failed` no se adopta nunca por el sufijo.
const SUFFIX_RANK = { completed: 0, inProgress: 1, unknown: 2 } as const
// Un recibo sin resolver que perdió su audio se cierra con el código de un
// render fallido: para la persona es lo mismo, reintentar pide el render de
// nuevo.
const RECEIPT_WITHOUT_AUDIO_CODE = 'avatar_render_failed'
// El campo del pedido con el que HeyGen dice que rechazó el asset de audio.
const AUDIO_ASSET_PARAM = 'audio_asset_id'
// Status que pueden resolverse antes de mirar la Idempotency-Key (la clave de
// la cuenta, el saldo, y el «no se procesó» del transporte: 408 y 425): en una
// REPETICIÓN no dicen nada del envío original.
const REPEAT_INCONCLUSIVE_STATUSES: ReadonlySet<number> = new Set([
  401, 402, 403, 408, 425,
])
// Fallos de una consulta de estado que no cortan la espera: HeyGen caído un
// rato, un 429 o un cuerpo raro. El plazo sigue corriendo.
const TRANSIENT_POLL_CODES = new Set([
  'avatar_network',
  'avatar_rate_limited',
  'avatar_provider_error',
])
// Rechazos que repetir el MISMO pedido no arregla (ADR-0057; diseño §14): la
// misma narración con el mismo look vuelve a ser moderada, y un look o motor
// que HeyGen no acepta sigue sin servir. No se cobran, pero repetirlos solo
// deja a la persona en un bucle de «Reanudá».
const FINAL_REJECTION_CODES: ReadonlySet<string> = new Set([
  'avatar_moderation_rejected',
  'avatar_look_unsupported',
])
// Lo que describe el clip de una escena lista, además de `status`: lo que
// vuelve a su lugar si la regeneración falla (`forceNewRender`).
const READY_STATE_FIELDS = [
  'clipFile',
  'normalizedSeconds',
  'renderHash',
  'narrationVersion',
  'usdEstimated',
] as const
type ReadyStateField = (typeof READY_STATE_FIELDS)[number]

// Un intento cerrado por un rechazo que repetir no arregla.
export function isFinalRejection(attempt: AvatarAttempt): boolean {
  if (attempt.state !== 'failed' || !attempt.errorCode) return false

  return FINAL_REJECTION_CODES.has(attempt.errorCode)
}

// Un campo del estado listo, tal como estaba en `previous` (o sin él, si no
// estaba).
function copyReadyField<K extends ReadyStateField>(
  target: SceneAvatar,
  previous: SceneAvatar,
  field: K,
): void {
  if (previous[field] === undefined) {
    delete target[field]
    return
  }

  target[field] = previous[field]
}

// La escena que se regeneraba vuelve a su estado listo de antes (`previous`):
// su clip y lo que lo describe, sin el error. Conserva lo demás de `avatar`:
// los recibos, los ajustes del movimiento y la toma.
function withPreviousReadyState(
  avatar: SceneAvatar,
  previous: SceneAvatar,
): SceneAvatar {
  const restored: SceneAvatar = { ...avatar, status: 'ready' }
  delete restored.errorCode
  for (const field of READY_STATE_FIELDS)
    copyReadyField(restored, previous, field)

  return restored
}

// El movimiento de un pedido a HeyGen (entrega 2e, §21.2): lo que va en el
// cuerpo además del look, el audio y el motor. Vacío = el cuerpo de antes.
export interface AvatarRequestMotion {
  motionPrompt?: string
  expressiveness?: typeof AVATAR_EXPRESSIVE_LEVEL
}

// El movimiento que lleva un pedido NUEVO de la escena: `motionPrompt`
// recortado, si no queda vacío, solo si el motor y el look lo admiten
// (avatarMotionSupport); `expressiveness: 'high'` solo con «más expresivo» y si
// lo admiten (IV con un look de foto). Nada si HeyGen ya rechazó el movimiento
// con este look (`motionUnsupported`). Avatar III: nada, siempre.
// Con un motor que admite prompt pero no `expressiveness` (Avatar V), «más
// expresivo» sobre un prompt de la persona viaja dentro del prompt
// (R-2e-14): el suyo y, al final, AVATAR_EXPRESSIVE_PROMPT_SUFFIX; si la
// persona lo dejó vacío, la frase sola (ronda 1 de WP-U, m8). Ese es el que
// entra en la huella y queda en el recibo; el de la escena no cambia. El
// automático ya lo escribe Vimo con el tono (R-2e-10): no la lleva.
export function avatarRequestMotion(avatar: SceneAvatar): AvatarRequestMotion {
  if (avatar.motionUnsupported === true) return {}

  const support = avatarMotionSupport(avatar.engine, avatar.lookType)
  const prompt = requestMotionPrompt(avatar, support)
  const motion: AvatarRequestMotion = {}
  if (support.motionPrompt && prompt) motion.motionPrompt = prompt
  if (support.expressiveness && avatar.expressive === true)
    motion.expressiveness = AVATAR_EXPRESSIVE_LEVEL

  return motion
}

// El prompt que viaja: el de la escena, recortado (vacío, ninguno); con «más
// expresivo», un prompt de la persona y un motor que no acepta
// `expressiveness` (V), con AVATAR_EXPRESSIVE_PROMPT_SUFFIX al final, o la
// frase sola si el suyo está vacío (R-2e-14).
function requestMotionPrompt(
  avatar: SceneAvatar,
  support: AvatarMotionSupport,
): string {
  const prompt =
    typeof avatar.motionPrompt === 'string' ? avatar.motionPrompt.trim() : ''
  if (avatar.expressive !== true || support.expressiveness) return prompt
  if (avatar.motionSource !== 'user') return prompt
  if (!prompt) return AVATAR_EXPRESSIVE_PROMPT_SUFFIX

  return `${prompt} ${AVATAR_EXPRESSIVE_PROMPT_SUFFIX}`
}

// El movimiento que salió (y vuelve a salir) en el POST de un intento: el
// guardado en su recibo, aunque la escena haya cambiado después. Un recibo de
// antes de la 2e, o uno de Avatar III, no tiene ninguno: su cuerpo, el de
// siempre.
function sentMotion(attempt: AvatarAttempt): AvatarRequestMotion {
  const motion: AvatarRequestMotion = {}
  if (typeof attempt.motionPrompt === 'string' && attempt.motionPrompt)
    motion.motionPrompt = attempt.motionPrompt
  if (attempt.expressiveness === AVATAR_EXPRESSIVE_LEVEL)
    motion.expressiveness = AVATAR_EXPRESSIVE_LEVEL

  return motion
}

// HeyGen rechazó el movimiento de un intento que lo llevaba: el pedido sin
// movimiento es otro y puede salir. Uno que no llevaba movimiento y recibe el
// mismo código falla como cualquier rechazo (repetirlo no cambiaría nada).
function isMotionRejection(
  failure: PipelineFailure,
  attempt: AvatarAttempt,
): boolean {
  if (failure.code !== 'avatar_motion_unsupported') return false

  const motion = sentMotion(attempt)
  return Boolean(motion.motionPrompt || motion.expressiveness)
}

// Lo que la huella del pedido toma de la corrida y no de la escena.
export interface AvatarRequestRun {
  format: VideoFormat
  narrationSha256: string
  narrationVersion: number
}

// La huella del pedido de un avatar con su corte de audio ya calculado: look,
// motor, formato, resolución, corte y narración, más el movimiento que
// llevaría (avatarRequestMotion) y su toma.
function requestHashOf(
  avatar: SceneAvatar,
  audioCutHash: string,
  run: AvatarRequestRun,
): string {
  return avatarRequestHash({
    lookId: avatar.lookId,
    engine: avatar.engine,
    aspectRatio: run.format,
    resolution: HEYGEN_VIDEO_RESOLUTION,
    audioCutHash,
    narrationVersion: run.narrationVersion,
    ...avatarRequestMotion(avatar),
    take: avatar.take,
  })
}

// El corte de audio del tramo de una escena, en cuadros de 25 fps.
function audioCutHashOf(
  span: { startSeconds: number; endSeconds: number },
  narrationSha256: string,
): string {
  return avatarAudioCutHash({
    narrationSha256,
    startFrame: frameBoundary(span.startSeconds),
    endFrame: frameBoundary(span.endSeconds),
  })
}

// La huella del pedido ACTUAL de una escena de avatar —la misma con la que el
// carril busca sus recibos y pide uno nuevo—, o undefined si la escena no se
// puede pedir (sin tramo de un cuadro o sin look). Sirve para saber, antes de
// correr el carril, si ese pedido ya tiene un recibo (por ejemplo, uno
// `succeeded` antes de regenerar una escena lista).
export function avatarSceneRequestHash(
  scene: Scene,
  run: AvatarRequestRun,
): string | undefined {
  const span = avatarSceneSpan(scene)
  if (!span || !scene.avatar?.lookId) return undefined

  return requestHashOf(
    scene.avatar,
    audioCutHashOf(span, run.narrationSha256),
    run,
  )
}

export interface AvatarLaneEvents {
  onStarted(sceneId: number): void
  onProgress(
    sceneId: number,
    phase: AvatarScenePhase,
    elapsedSeconds: number,
  ): void
  // Avisos que no cortan la escena (un video de otra duración que el tramo):
  // la orquestación los emite como `log warn`.
  onWarn(sceneId: number, message: string): void
  // Un fallo de HeyGen que el carril absorbió y siguió (una consulta caída
  // dentro del plazo): va al log de diagnóstico.
  onRecoveredFailure(sceneId: number, failure: PipelineFailure): void
}

// Reloj del carril: los guards adelantan el tiempo sin dormir 30 minutos.
export interface AvatarLaneClock {
  now(): number
  sleep(ms: number, signal: AbortSignal): Promise<void>
}

export const SYSTEM_CLOCK: AvatarLaneClock = { now: () => Date.now(), sleep }

export interface AvatarLaneOptions {
  client: HeyGenClient
  paths: ProjectPaths
  projectId: string
  // El nombre del video (`name` de project.json): abre el título de cada
  // render nuevo (entrega 2c). Vacío, el título es la marca sola.
  videoName: string
  ffmpegPath: string
  // El formato del proyecto (viaja a HeyGen) y su cuadro de render.
  format: VideoFormat
  frame: FrameSize
  // Huella de narration.mp3, calculada una vez por corrida.
  narrationSha256: string
  narrationVersion: number
  // false = solo se cosecha lo ya pedido: sin recibo del pedido actual, el
  // carril devuelve `needs-request` sin cortar, subir ni pagar nada (la
  // orquestación mira el saldo antes de dejarlo pedir).
  allowNewRequest: boolean
  // true = la persona pidió esta escena (el comando del editor): se vuelve a
  // pedir aunque el último intento del MISMO pedido haya sido un rechazo que
  // repetir no arregla (`isFinalRejection`). Sin él (la fase), ese pedido no
  // se repite solo: la escena queda fallida con ese código y se avisa.
  retryFinalRejection?: boolean
  // true = la persona pidió regenerar esta escena lista (entrega 2e, §21.4):
  // no se toma el atajo de «lista con el mismo pedido», y una escena lista
  // conserva su clip hasta que el nuevo está listo; si el render nuevo falla
  // (o la cuenta pausa), vuelve a su estado listo anterior con los recibos y
  // los ajustes nuevos, y el resultado igual sale `failed` con su código. La
  // toma que hace que el pedido sea nuevo la sube quien llama.
  forceNewRender?: boolean
  signal: AbortSignal
  events: AvatarLaneEvents
  clock?: AvatarLaneClock
  // Persiste el avatar de la escena. Tiene que guardar aunque la persona
  // cancele: guarda recibos de pedidos que pueden estar pagos. `details` dice
  // qué cambió además de los recibos.
  onCheckpoint(
    avatar: SceneAvatar,
    details?: AvatarCheckpointDetails,
  ): Promise<void>
}

export interface AvatarCheckpointDetails {
  // El carril acaba de escribir el clip normalizado y la escena quedó lista
  // con él: el video que haya quedó atrás. Los recibos intermedios de una
  // escena que ya estaba lista (y se regenera) no lo traen.
  newClip?: boolean
}

export type AvatarLaneOutcome = 'ready' | 'failed' | 'needs-request'

export interface AvatarLaneResult {
  outcome: AvatarLaneOutcome
  avatar: SceneAvatar
  // Con `failed`: el código de la escena (también queda en `avatar.errorCode`).
  errorCode?: string
  // El fallo que lo causó, si vino de HeyGen o del plazo: para el log de
  // diagnóstico y el aviso de proveedor en problemas.
  failure?: PipelineFailure
}

function copyAttempts(attempts: AvatarAttempt[]): AvatarAttempt[] {
  return attempts.map((attempt) => ({ ...attempt }))
}

// El cliente rechazó el pedido antes de mandarlo: `createVideo` valida el
// look, el audio y la clave y, si no sirven, lanza `invalid_payload` sin
// proveedor ni status, porque HeyGen no llegó a ver nada.
function isLocalRejection(failure: PipelineFailure): boolean {
  return (
    failure.code === 'invalid_payload' &&
    failure.provider === undefined &&
    failure.httpStatus === undefined
  )
}

// HeyGen respondió que no de forma definitiva (un 4xx que no es 409 ni 429):
// no se creó ningún video. Un 409 (el original todavía en vuelo, o uno cuyo
// cuerpo no se pudo leer) y un 429 (HeyGen no guarda esa respuesta bajo la
// clave) no dicen nada de un envío anterior con la misma clave: el intento
// queda sin resolver y la próxima corrida lo busca por su marca o repite la
// MISMA clave, que es seguro y gratis. Vale también para el primer envío.
function isConfirmedRejection(failure: PipelineFailure): boolean {
  const status = failure.httpStatus
  if (status === undefined) return false
  if (status === 409 || status === 429) return false

  return status >= 400 && status < 500
}

// HeyGen rechazó el asset de audio del pedido (el `param` de su sobre).
function isAudioAssetRejection(failure: PipelineFailure): boolean {
  return failure instanceof HeyGenFailure && failure.param === AUDIO_ASSET_PARAM
}

// En la REPETICIÓN de un recibo sin resolver, un 401, 402, 403, 408 o 425 o un
// rechazo por saldo no dicen nada del original: la clave de la cuenta, el
// saldo y el transporte pueden resolverse antes de mirar la Idempotency-Key
// (el registro de claves es por cuenta), así que el original pudo haberse
// creado igual.
function isRepeatInconclusive(failure: PipelineFailure): boolean {
  if (isInsufficientCreditsCode(failure.code)) return true

  return (
    failure.httpStatus !== undefined &&
    REPEAT_INCONCLUSIVE_STATUSES.has(failure.httpStatus)
  )
}

// Un rechazo que deja abierto el envío original con la misma clave: HeyGen
// confirmó antes, en la misma cadena, que el original seguía en vuelo (un
// `409 request_in_progress`), o es una REPETICIÓN frenada por algo que se
// resuelve antes de mirar la clave (`isRepeatInconclusive`).
function leavesOriginalOpen(
  failure: PipelineFailure,
  repeat: boolean,
): boolean {
  if (failure instanceof HeyGenFailure && failure.sawRequestInProgress)
    return true

  return repeat && isRepeatInconclusive(failure)
}

// Cómo se manda un pedido: `repeat` cuando es la repetición, con la misma
// clave, de un recibo sin resolver que la búsqueda en HeyGen (por su título
// guardado y por su marca, findOwnVideo) no encontró.
interface PostOptions {
  repeat?: boolean
}

// Si el crudo que bajó de HeyGen es un video legible. Una normalización que
// falla con un crudo legible fue un problema local (el disco, el cuadro): el
// crudo pagado se conserva y la próxima corrida solo vuelve a normalizar.
async function isReadableVideo(
  ffmpegPath: string,
  path: string,
  signal: AbortSignal,
): Promise<boolean> {
  try {
    await inspectAnimationFile(ffmpegPath, path, signal)
    return true
  } catch (error) {
    if (signal.aborted) throw error

    return false
  }
}

// El título guardado de un intento: el que salió en su POST (entrega 2c). Un
// recibo de antes de la 2c no lo tiene, y uno que no es texto (un scenes.json
// editado) cuenta como sin título.
function storedTitle(attempt: AvatarAttempt): string | undefined {
  if (typeof attempt.title !== 'string' || !attempt.title) return undefined

  return attempt.title
}

function suffixRank(status: HeyGenVideoStatus | undefined): number {
  if (status === 'completed') return SUFFIX_RANK.completed
  if (status === 'processing' || status === 'pending')
    return SUFFIX_RANK.inProgress

  return SUFFIX_RANK.unknown
}

// Un render que solo se reconoce por el final del título: termina en la marca
// y no está `failed`.
function isSuffixCandidate(video: HeyGenListedVideo, marker: string): boolean {
  if (video.status === 'failed' || video.title === undefined) return false

  return endsWithAvatarVideoMarker(video.title, marker)
}

// El render de un intento (rondas 1 a 3 de la 2c); `listVideos` trae una
// página. Gana el render con el título EXACTO que salió en el POST
// (`sentTitle`), con cualquier estado: es el nuestro. Se busca primero por ese
// título, una página, si no es la marca sola: la OpenAPI dice que el filtro
// `title` es por substring, pero si HeyGen filtrara por igualdad o por prefijo
// la búsqueda por la marca no lo devolvería. Después, por la marca, siguiendo
// el cursor: el exacto, si aparece en alguna página; si no, el candidato por
// sufijo más avanzado (isSuffixCandidate, SUFFIX_RANK; entre iguales, el
// primero del listado).
async function findOwnVideo(
  client: HeyGenClient,
  marker: string,
  sentTitle: string,
): Promise<HeyGenListedVideo | undefined> {
  if (sentTitle !== marker) {
    const byTitle = await client.listVideos({ title: sentTitle })
    const exact = byTitle.videos.find((video) => video.title === sentTitle)
    if (exact) return exact
  }

  let best: HeyGenListedVideo | undefined
  let token: string | undefined
  for (let page = 0; page < RECOVERY_PAGES; page++) {
    const result = await client.listVideos(
      token ? { title: marker, token } : { title: marker },
    )
    const exact = result.videos.find((video) => video.title === sentTitle)
    if (exact) return exact

    for (const video of result.videos) {
      if (!isSuffixCandidate(video, marker)) continue
      if (best && suffixRank(video.status) >= suffixRank(best.status)) continue

      best = video
    }
    if (!result.nextToken) return best

    token = result.nextToken
  }

  return best
}

export async function renderAvatarScene(
  scene: Scene,
  options: AvatarLaneOptions,
): Promise<AvatarLaneResult> {
  if (!scene.avatar)
    throw new PipelineFailure(
      'invalid_payload',
      `scene ${scene.id} is not an avatar scene`,
    )

  const { client, paths, signal, events } = options
  const clock = options.clock ?? SYSTEM_CLOCK
  const sceneId = scene.id
  const startedAt = clock.now()
  events.onStarted(sceneId)

  const attempts = copyAttempts(scene.avatar.attempts ?? [])
  let avatar: SceneAvatar = { ...scene.avatar, attempts }
  // La escena lista que se regenera (forceNewRender): su estado de hoy, que
  // sigue en disco hasta que el clip nuevo esté listo y vuelve si falla.
  const previous =
    options.forceNewRender && scene.avatar.status === 'ready'
      ? scene.avatar
      : undefined
  const snapshot = (): SceneAvatar => ({
    ...avatar,
    attempts: copyAttempts(attempts),
  })
  const checkpoint = (details?: AvatarCheckpointDetails) =>
    options.onCheckpoint(snapshot(), details)
  const progress = (phase: AvatarScenePhase) =>
    events.onProgress(
      sceneId,
      phase,
      Math.max(0, Math.round((clock.now() - startedAt) / 1000)),
    )
  // La escena no quedó lista con un clip nuevo: falla con su código o, si se
  // regeneraba una lista, vuelve a su clip de antes (el código sale igual en
  // el resultado).
  const failed = async (
    code: string,
    failure?: PipelineFailure,
  ): Promise<AvatarLaneResult> => {
    avatar = previous
      ? withPreviousReadyState(avatar, previous)
      : { ...avatar, status: 'failed', errorCode: code }
    await checkpoint()
    return {
      outcome: 'failed',
      avatar: snapshot(),
      errorCode: code,
      ...(failure ? { failure } : {}),
    }
  }

  // 1. La identidad del pedido: el tramo en cuadros y la huella del corte. Un
  //    tramo de largo cero (la regla única de `avatarSceneSpan`) o un avatar
  //    sin look no se pueden pedir (el cliente rechazaría el look vacío sin
  //    llegar a HeyGen).
  const span = avatarSceneSpan(scene)
  if (!span || !avatar.lookId) return failed('invalid_payload')

  // Lo que un job matado dejó a medio cortar o normalizar para esta escena
  // (sus archivos son `scene_<id>.<hash8>.*`, clip-path.ts): la escena está
  // tomada, así que nadie más los está escribiendo.
  await removeStaleTemporaries(paths.avatarDirectory, `scene_${sceneId}.`)

  const startFrame = frameBoundary(span.startSeconds)
  const endFrame = frameBoundary(span.endSeconds)
  const startSeconds = startFrame / ANIMATION_FPS
  const endSeconds = endFrame / ANIMATION_FPS
  const audioCutHash = audioCutHashOf(span, options.narrationSha256)
  // La huella del pedido actual (con el movimiento y la toma de la escena,
  // entrega 2e). Cambia una sola vez, si HeyGen rechaza el movimiento: la
  // escena queda `motionUnsupported` y el pedido actual pasa a ser el que va
  // sin él (`post`).
  let requestHash = requestHashOf(avatar, audioCutHash, options)
  // El movimiento no entra en la huella del render: editarlo no deja el clip
  // desactualizado (regenerar es decisión de la persona).
  const renderHash = avatarRenderHash({
    lookId: avatar.lookId,
    engine: avatar.engine,
    startFrame,
    endFrame,
    narrationVersion: options.narrationVersion,
  })
  // Los segundos salen de los cuadros, no de restar segundos: 8,04 − 1,04 da
  // 6,999…9 en coma flotante y el estimado dejaría de coincidir con el de la
  // fase (slotDurationSeconds, que también cuenta cuadros).
  const usdEstimated = estimateAvatarUsd(
    (endFrame - startFrame) / ANIMATION_FPS,
    avatar.engine,
    avatar.lookType,
  )
  const latest = (states: AvatarAttempt['state'][]) =>
    attempts.findLastIndex(
      (attempt) =>
        attempt.hash === requestHash && states.includes(attempt.state),
    )
  const keyOf = (index: number) =>
    avatarRequestKey(attempts[index].hash, avatarRetryIndex(attempts, index))
  // La marca del intento `index` (sale de su clave) y el título que llevaría
  // un POST suyo con el nombre del video de hoy.
  const markerOf = (index: number) =>
    avatarVideoTitle(options.projectId, sceneId, keyOf(index))
  const namedTitleOf = (index: number) =>
    avatarNamedVideoTitle(options.videoName, markerOf(index))
  // El título que salió (y sale) en cada POST del intento `index`, el mismo
  // cuerpo siempre: el guardado, aunque el video haya cambiado de nombre, o,
  // en un recibo de antes de la 2c (que no lo tiene), la marca sola, como salió
  // su POST original.
  const sentTitleOf = (index: number) =>
    storedTitle(attempts[index]) ?? markerOf(index)
  // El código con que HeyGen rechazó para siempre el último intento del pedido
  // actual, si ese fue su final.
  const finalRejectionCode = (): string | undefined => {
    const last = attempts.findLast((attempt) => attempt.hash === requestHash)
    if (!last || !isFinalRejection(last)) return undefined

    return last.errorCode
  }

  // 2. Ya está listo con este mismo tramo, look, motor y narración: nada que
  //    pagar ni bajar. Salvo que la persona haya pedido regenerarlo.
  const currentClip = sceneAvatarClipFile(paths, avatar)
  if (
    !options.forceNewRender &&
    avatar.status === 'ready' &&
    avatar.renderHash === renderHash &&
    currentClip &&
    (await isValidFile(currentClip))
  )
    return { outcome: 'ready', avatar: snapshot() }

  const completedNow = new Set<string>()
  // Un id de asset no vence: un intento anterior del mismo pedido presta su audio.
  const reusableAudioAssetId = () =>
    attempts.find(
      (attempt) => attempt.hash === requestHash && attempt.audioAssetId,
    )?.audioAssetId
  const uploadAudio = async (): Promise<string> => {
    progress('audio')
    // `avatarAudioFile` (clip-path.ts) arma el nombre con los 8 primeros hex
    // de la huella completa; el WAV de un corte ya hecho se reusa.
    const audioPath = avatarAudioFile(paths, sceneId, audioCutHash)
    if (!(await isValidFile(audioPath)))
      await cutAvatarAudio(options.ffmpegPath, paths.narrationFile, audioPath, {
        startSeconds,
        endSeconds,
        signal,
      })
    progress('upload')
    return client.uploadAsset(
      await readFile(audioPath),
      basename(audioPath),
      'audio/wav',
    )
  }

  // Cierra como rechazado el intento `index`: queda `failed` con su código y el
  // próximo intento del pedido nace con la clave siguiente. Si HeyGen rechazó
  // el asset de audio, ese asset sale de los recibos del MISMO pedido: así
  // reusableAudioAssetId no lo vuelve a prestar y el reintento sube el audio.
  // Un recibo de otro pedido con el mismo asset no se toca.
  const closeRejectedAttempt = (index: number, failure: PipelineFailure) => {
    const { hash } = attempts[index]
    const rejectedAsset = isAudioAssetRejection(failure)
      ? attempts[index].audioAssetId
      : undefined
    attempts[index] = {
      ...attempts[index],
      state: 'failed',
      errorCode: failure.code,
    }
    if (!rejectedAsset) return

    for (const [position, attempt] of attempts.entries()) {
      if (attempt.hash !== hash || attempt.audioAssetId !== rejectedAsset)
        continue

      const withoutAsset = { ...attempt }
      delete withoutAsset.audioAssetId
      attempts[position] = withoutAsset
    }
  }

  // Manda (o repite, con la MISMA clave y el MISMO título) el pedido del
  // intento `index`. Devuelve el resultado si la escena terminó; undefined si
  // sigue.
  const post = async (
    index: number,
    { repeat = false }: PostOptions = {},
  ): Promise<AvatarLaneResult | undefined> => {
    const attempt = attempts[index]
    const audioAssetId = attempt.audioAssetId
    if (!audioAssetId) {
      // Un recibo sin su audio (un scenes.json editado o roto) no se puede
      // repetir tal cual y un pedido sin audio no sale: se cierra como
      // fallido. Eso libera la escena; reintentar sube el audio y pide con la
      // clave siguiente.
      attempts[index] = {
        ...attempt,
        state: 'failed',
        errorCode: RECEIPT_WITHOUT_AUDIO_CODE,
      }
      return failed(RECEIPT_WITHOUT_AUDIO_CODE)
    }

    // El mismo cuerpo que el POST original: nada se guarda antes y ni la
    // clave, ni el título, ni el movimiento (el del recibo) cambian.
    const title = sentTitleOf(index)
    const key = keyOf(index)
    progress('render')
    // El `try` cubre solo el pedido: un error al guardar el recibo después no
    // es una respuesta de HeyGen y no se clasifica como tal.
    let videoId: string
    try {
      videoId = await client.createVideo({
        lookId: attempt.lookId,
        engine: attempt.engine,
        audioAssetId,
        aspectRatio: options.format,
        title,
        idempotencyKey: avatarIdempotencyKey(options.projectId, sceneId, key),
        ...sentMotion(attempt),
      })
    } catch (error) {
      if (signal.aborted) {
        // Cancelado con el pedido en vuelo: pudo haber llegado.
        attempts[index] = { ...attempts[index], state: 'ambiguous' }
        await checkpoint()
        throw error
      }

      const failure = toPipelineFailure(error)
      if (leavesOriginalOpen(failure, repeat)) {
        // El original pudo haberse creado igual: HeyGen lo tenía en vuelo, o
        // la clave de la cuenta, el saldo o el transporte frenaron la
        // REPETICIÓN antes de mirar la Idempotency-Key. El recibo sigue sin
        // resolver; con el saldo, igual se pausa.
        attempts[index] = { ...attempts[index], state: 'ambiguous' }
        if (!isInsufficientCreditsCode(failure.code))
          return failed(failure.code, failure)

        await checkpoint()
        throw failure
      }
      if (!isLocalRejection(failure) && !isConfirmedRejection(failure)) {
        // Sin un «no» definitivo (red, 5xx, un 200 raro, un 409, un 429): pudo
        // haberse creado. Bloquea otro POST hasta resolverse por su marca o
        // con la MISMA clave.
        attempts[index] = { ...attempts[index], state: 'ambiguous' }
        return failed(failure.code, failure)
      }

      // Un «no» definitivo, de HeyGen o del cliente que no lo mandó: no se creó
      // ningún video. En la repetición de un recibo sin resolver, un 4xx que no
      // es de la clave, del saldo ni del transporte también lo cierra: con la
      // deduplicación estándar, HeyGen habría devuelto la respuesta del
      // original (un supuesto a confirmar con HeyGen real, ADR-0057).
      closeRejectedAttempt(index, failure)
      if (isMotionRejection(failure, attempt)) {
        // HeyGen no admite el movimiento con este look (entrega 2e, §21.2) y
        // no lo cobró: la escena queda sin movimiento y el pedido actual pasa
        // a ser el que va sin él (otra huella, otra clave), que el bucle pide
        // enseguida. El fallo absorbido va al log de diagnóstico, sin el
        // prompt (heygenFailure no copia el texto de HeyGen).
        avatar = { ...avatar, motionUnsupported: true }
        requestHash = requestHashOf(avatar, audioCutHash, options)
        await checkpoint()
        events.onRecoveredFailure(sceneId, failure)
        return undefined
      }

      await checkpoint()
      // Por el código y no con isInsufficientCreditsFailure: ese predicado de
      // tipo dejaría `failure` como `never` después del guard. Con saldo, la
      // escena queda como estaba y el recibo `failed` deja pedir con la clave
      // siguiente al recargar.
      if (isInsufficientCreditsCode(failure.code)) throw failure

      return failed(failure.code, failure)
    }

    // Si esta escritura falla, el error sube y en disco queda el recibo sin
    // resolver (`creating` o `ambiguous`): la próxima corrida lo busca por su
    // marca o repite la MISMA clave.
    attempts[index] = { ...attempts[index], state: 'pending', videoId }
    await checkpoint()
    return undefined
  }

  // Un intento `creating`/`ambiguous` del pedido actual: se busca su render
  // (findOwnVideo: una página por su título guardado si no es la marca sola,
  // y después por la marca; el exacto primero y, sin él, uno que termine en la
  // marca y no esté `failed`); si HeyGen no lo tiene, se repite el MISMO
  // pedido con la MISMA clave (si había llegado, HeyGen devuelve el mismo
  // video y no cobra). Si cualquiera de esas consultas falla, la escena falla
  // sin POST y el intento sigue sin resolver: la corrida siguiente vuelve a
  // buscar. Seguir por la marca sin la respuesta de la consulta por el título
  // podría terminar en otro POST.
  const resolve = async (
    index: number,
  ): Promise<AvatarLaneResult | undefined> => {
    let found: HeyGenListedVideo | undefined
    try {
      found = await findOwnVideo(client, markerOf(index), sentTitleOf(index))
    } catch (error) {
      if (signal.aborted) throw error

      const failure = toPipelineFailure(error)
      return failed(failure.code, failure)
    }
    if (!found) return post(index, { repeat: true })

    attempts[index] = {
      ...attempts[index],
      state: 'pending',
      videoId: found.videoId,
    }
    await checkpoint()
    return undefined
  }

  const waitForRender = async (
    index: number,
  ): Promise<AvatarLaneResult | undefined> => {
    const videoId = attempts[index].videoId
    if (!videoId) {
      // Un `pending` sin id no se puede consultar: se resuelve como uno sin respuesta.
      attempts[index] = { ...attempts[index], state: 'ambiguous' }
      await checkpoint()
      return undefined
    }

    const deadline = clock.now() + AVATAR_RENDER_DEADLINE_MS
    let delay = AVATAR_POLL_INITIAL_MS
    for (;;) {
      progress('render')
      let video: HeyGenVideo | undefined
      try {
        video = await client.getVideo(videoId)
      } catch (error) {
        if (signal.aborted) throw error

        const failure = toPipelineFailure(error)
        if (failure.httpStatus === 404) {
          // HeyGen no reconoce el video (sale avatar_invalid_request con
          // status 404): la próxima corrida lo busca por su marca y, sin
          // rastro, repite el pedido con la misma clave. Nunca se paga otro de
          // entrada.
          attempts[index] = { ...attempts[index], state: 'ambiguous' }
          return failed('avatar_render_failed', failure)
        }
        if (!TRANSIENT_POLL_CODES.has(failure.code))
          return failed(failure.code, failure)

        events.onRecoveredFailure(sceneId, failure)
      }
      if (video?.status === 'failed') {
        const failure = heygenVideoFailure(
          video.failureCode,
          video.failureMessage,
        )
        attempts[index] = {
          ...attempts[index],
          state: 'failed',
          errorCode: failure.code,
          ...(video.failureCode ? { failureCode: video.failureCode } : {}),
        }
        const result = await failed(failure.code, failure)
        // Un render que falló por saldo pausa como cualquier otro rechazo por
        // saldo; reanudar pide otro render con otra clave.
        if (isInsufficientCreditsCode(failure.code)) throw failure

        return result
      }
      if (video?.status === 'completed' && video.videoUrl) {
        attempts[index] = {
          ...attempts[index],
          state: 'succeeded',
          videoUrl: video.videoUrl,
        }
        completedNow.add(videoId)
        await checkpoint()
        return undefined
      }
      if (clock.now() >= deadline)
        // El recibo queda `pending`: la próxima corrida lo cosecha sin pagar.
        return failed(
          'avatar_timeout',
          new PipelineFailure(
            'avatar_timeout',
            `HeyGen did not finish video ${videoId} before the deadline`,
            { provider: HEYGEN_PROVIDER },
          ),
        )

      await clock.sleep(delay, signal)
      signal.throwIfAborted()
      delay = Math.min(Math.round(delay * POLL_GROWTH), AVATAR_POLL_MAX_MS)
    }
  }

  const finish = async (index: number): Promise<AvatarLaneResult> => {
    // Crudo y normalizado llevan la clave del intento que los produjo.
    const requestKey = keyOf(index)
    const rawPath = avatarRawClipFile(paths, sceneId, requestKey)
    progress('download')
    if (!(await isValidFile(rawPath))) {
      const videoId = attempts[index].videoId
      // La URL prefirmada vence: un recibo de otra corrida pide una fresca
      // (gratis). El `try` cubre solo la consulta: un error al guardar la URL
      // sube, no se toma por una consulta caída.
      if (videoId && !completedNow.has(videoId)) {
        let fresh: HeyGenVideo | undefined
        try {
          fresh = await client.getVideo(videoId)
        } catch (error) {
          // Sin una URL fresca se prueba con la guardada.
          if (signal.aborted) throw error
        }
        if (fresh?.videoUrl) {
          attempts[index] = { ...attempts[index], videoUrl: fresh.videoUrl }
          await checkpoint()
        }
      }
      try {
        await saveClipToFile(attempts[index].videoUrl ?? '', rawPath, signal)
      } catch (error) {
        if (signal.aborted) throw error

        return failed('avatar_download_failed', toPipelineFailure(error))
      }
    }

    progress('normalize')
    let normalized: AvatarClipNormalization
    try {
      normalized = await normalizeAvatarClip(
        options.ffmpegPath,
        rawPath,
        avatarClipFile(paths, sceneId, requestKey),
        { startSeconds, endSeconds, frame: options.frame, signal },
      )
    } catch (error) {
      if (signal.aborted) throw error

      const failure = toPipelineFailure(error)
      if (failure.code === 'ffmpeg_missing')
        return failed(failure.code, failure)

      // Un crudo que no es un video legible se vuelve a bajar en la próxima
      // corrida (el render ya está pago y su URL se vuelve a pedir). Uno legible
      // se conserva: el fallo fue local y basta con volver a normalizar.
      if (!(await isReadableVideo(options.ffmpegPath, rawPath, signal)))
        await rm(rawPath, { force: true })

      return failed('avatar_download_failed', failure)
    }
    if (
      Math.abs(normalized.sourceSeconds - normalized.normalizedSeconds) >
      AVATAR_DURATION_TOLERANCE_SECONDS
    )
      events.onWarn(
        sceneId,
        `HeyGen returned ${normalized.sourceSeconds.toFixed(3)} s of video for a ${normalized.normalizedSeconds.toFixed(3)} s span: trimmed or padded to the span, never retimed`,
      )

    avatar = {
      ...avatar,
      status: 'ready',
      clipFile: avatarClipFileName(sceneId, requestKey),
      normalizedSeconds: normalized.normalizedSeconds,
      renderHash,
      narrationVersion: options.narrationVersion,
      ...(usdEstimated === null ? {} : { usdEstimated }),
    }
    // El error de una corrida anterior no sigue en una escena lista: la vista
    // lo copiaría tal cual (toSceneAvatarView).
    delete avatar.errorCode
    await checkpoint({ newClip: true })
    return { outcome: 'ready', avatar: snapshot() }
  }

  // 3. Cosecha antes que pago: el recibo más reciente del pedido actual manda.
  for (;;) {
    signal.throwIfAborted()
    const succeeded = latest(['succeeded'])
    if (succeeded >= 0) return finish(succeeded)

    const pending = latest(['pending'])
    if (pending >= 0) {
      const result = await waitForRender(pending)
      if (result) return result
      continue
    }

    const unresolved = latest(['creating', 'ambiguous'])
    if (unresolved >= 0) {
      const result = await resolve(unresolved)
      if (result) return result
      continue
    }

    // Sin recibo vivo: si el último intento de este pedido fue un rechazo que
    // repetir no arregla, la fase no lo vuelve a pedir (ni corta, ni sube, ni
    // mira el saldo). La escena queda fallida con ese código.
    const rejection = finalRejectionCode()
    if (rejection && !options.retryFinalRejection) {
      events.onWarn(
        sceneId,
        `HeyGen rejected this request for good (${rejection}): not requested again until the person asks for it from the editor or the look or the narration changes`,
      )
      return failed(rejection)
    }

    if (!options.allowNewRequest)
      return { outcome: 'needs-request', avatar: snapshot() }

    // 4. Sin recibo: corte y subida del audio e intención persistida ANTES del POST.
    let audioAssetId = reusableAudioAssetId()
    if (!audioAssetId) {
      try {
        audioAssetId = await uploadAudio()
      } catch (error) {
        if (signal.aborted) throw error
        if (isInsufficientCreditsFailure(error)) throw error

        const failure = toPipelineFailure(error)
        return failed(failure.code, failure)
      }
    }
    // El movimiento que lleva el POST queda en el recibo (sale del mismo
    // avatar que `requestHash`): cada repetición manda ese, aunque la escena
    // cambie después. Sin movimiento, el recibo de antes de la 2e.
    attempts.push({
      hash: requestHash,
      state: 'creating',
      engine: avatar.engine,
      lookId: avatar.lookId,
      audioAssetId,
      createdAt: new Date(clock.now()).toISOString(),
      ...avatarRequestMotion(avatar),
    })
    // El título va en la intención, con el nombre del video de hoy: el POST
    // lleva este mismo. Se arma con el intento ya anotado porque su marca
    // sale de la clave, que cuenta los intentos fallidos anteriores.
    const intent = attempts.length - 1
    attempts[intent] = { ...attempts[intent], title: namedTitleOf(intent) }
    // Una lista que se regenera conserva el estimado de su clip de hoy: el del
    // nuevo llega con él (finish).
    if (usdEstimated !== null && !previous) avatar = { ...avatar, usdEstimated }
    // Si esta escritura falla, sale sin mandar nada: sin intención no hay POST.
    await checkpoint()
    const result = await post(intent)
    if (result) return result
  }
}
