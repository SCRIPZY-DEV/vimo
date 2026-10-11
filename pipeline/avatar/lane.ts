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
} from '../providers/avatar/heygen.ts'
import {
  HEYGEN_PROVIDER,
  HeyGenFailure,
  heygenVideoFailure,
} from '../providers/avatar/heygen-errors.ts'
import type { AvatarScenePhase } from '../runner/events.ts'
import { PipelineFailure, toPipelineFailure } from '../runner/failure.ts'
import {
  AVATAR_POLL_INITIAL_MS,
  AVATAR_POLL_MAX_MS,
  AVATAR_RENDER_DEADLINE_MS,
  avatarSceneSpan,
  estimateAvatarUsd,
  type AvatarAttempt,
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
  avatarRenderHash,
  avatarRequestHash,
  avatarRequestKey,
  avatarRetryIndex,
  avatarVideoTitle,
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
//     se consulta, `creating`/`ambiguous` se busca por su `title` y, sin
//     rastro, se repite con la MISMA `Idempotency-Key` (HeyGen deduplica 24 h);
//  3. solo sin recibo (y con `allowNewRequest`) se corta y se sube el audio, se
//     persiste `creating` ANTES del POST y `pending` después;
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

// Cada consulta de estado espera un 50 % más que la anterior, hasta el tope.
const POLL_GROWTH = 1.5
// Páginas de `GET /v3/videos?title=…` que se revisan al buscar un pedido sin
// respuesta (el título es único por intento; HeyGen filtra por substring).
const RECOVERY_PAGES = 3
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

// Un intento cerrado por un rechazo que repetir no arregla.
export function isFinalRejection(attempt: AvatarAttempt): boolean {
  if (attempt.state !== 'failed' || !attempt.errorCode) return false

  return FINAL_REJECTION_CODES.has(attempt.errorCode)
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
// queda sin resolver y la próxima corrida lo busca por título o repite la
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
// clave, de un recibo sin resolver que no apareció por título.
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

// El render de un intento por su título EXACTO (una copia con el título
// adentro no es nuestra). `listVideos` trae una página: se sigue el cursor.
async function findVideoByTitle(
  client: HeyGenClient,
  title: string,
): Promise<HeyGenListedVideo | undefined> {
  let token: string | undefined
  for (let page = 0; page < RECOVERY_PAGES; page++) {
    const result = await client.listVideos(token ? { title, token } : { title })
    const match = result.videos.find((video) => video.title === title)
    if (match) return match
    if (!result.nextToken) return undefined

    token = result.nextToken
  }

  return undefined
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
  const failed = async (
    code: string,
    failure?: PipelineFailure,
  ): Promise<AvatarLaneResult> => {
    avatar = { ...avatar, status: 'failed', errorCode: code }
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
  const audioCutHash = avatarAudioCutHash({
    narrationSha256: options.narrationSha256,
    startFrame,
    endFrame,
  })
  const requestHash = avatarRequestHash({
    lookId: avatar.lookId,
    engine: avatar.engine,
    aspectRatio: options.format,
    resolution: HEYGEN_VIDEO_RESOLUTION,
    audioCutHash,
    narrationVersion: options.narrationVersion,
  })
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
  // El código con que HeyGen rechazó para siempre el último intento del pedido
  // actual, si ese fue su final.
  const finalRejectionCode = (): string | undefined => {
    const last = attempts.findLast((attempt) => attempt.hash === requestHash)
    if (!last || !isFinalRejection(last)) return undefined

    return last.errorCode
  }

  // 2. Ya está listo con este mismo tramo, look, motor y narración: nada que
  //    pagar ni bajar.
  const currentClip = sceneAvatarClipFile(paths, avatar)
  if (
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

  // Manda (o repite, con la MISMA clave) el pedido del intento `index`.
  // Devuelve el resultado si la escena terminó; undefined si sigue.
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
        title: avatarVideoTitle(options.projectId, sceneId, key),
        idempotencyKey: avatarIdempotencyKey(options.projectId, sceneId, key),
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
        // haberse creado. Bloquea otro POST hasta resolverse por título o con
        // la MISMA clave.
        attempts[index] = { ...attempts[index], state: 'ambiguous' }
        return failed(failure.code, failure)
      }

      // Un «no» definitivo, de HeyGen o del cliente que no lo mandó: no se creó
      // ningún video. En la repetición de un recibo sin resolver, un 4xx que no
      // es de la clave, del saldo ni del transporte también lo cierra: con la
      // deduplicación estándar, HeyGen habría devuelto la respuesta del
      // original (un supuesto a confirmar con HeyGen real, ADR-0057).
      closeRejectedAttempt(index, failure)
      await checkpoint()
      // Por el código y no con isInsufficientCreditsFailure: ese predicado de
      // tipo dejaría `failure` como `never` después del guard. Con saldo, la
      // escena queda como estaba y el recibo `failed` deja pedir con la clave
      // siguiente al recargar.
      if (isInsufficientCreditsCode(failure.code)) throw failure

      return failed(failure.code, failure)
    }

    // Si esta escritura falla, el error sube y en disco queda el recibo sin
    // resolver (`creating` o `ambiguous`): la próxima corrida lo busca por
    // título o repite la MISMA clave.
    attempts[index] = { ...attempts[index], state: 'pending', videoId }
    await checkpoint()
    return undefined
  }

  // Un intento `creating`/`ambiguous` del pedido actual: se busca su render
  // por título; si HeyGen no lo tiene, se repite el MISMO pedido con la MISMA
  // clave (si había llegado, HeyGen devuelve el mismo video y no cobra).
  const resolve = async (
    index: number,
  ): Promise<AvatarLaneResult | undefined> => {
    const title = avatarVideoTitle(options.projectId, sceneId, keyOf(index))
    let found: HeyGenListedVideo | undefined
    try {
      found = await findVideoByTitle(client, title)
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
          // status 404): la próxima corrida lo busca por título y, sin rastro,
          // repite el pedido con la misma clave. Nunca se paga otro de entrada.
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
    attempts.push({
      hash: requestHash,
      state: 'creating',
      engine: avatar.engine,
      lookId: avatar.lookId,
      audioAssetId,
      createdAt: new Date(clock.now()).toISOString(),
    })
    if (usdEstimated !== null) avatar = { ...avatar, usdEstimated }
    // Si esta escritura falla, sale sin mandar nada: sin intención no hay POST.
    await checkpoint()
    const result = await post(attempts.length - 1)
    if (result) return result
  }
}
