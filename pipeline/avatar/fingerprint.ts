import { createHash } from 'node:crypto'

import {
  AVATAR_VIDEO_TITLE_NAME_LIMIT,
  type AVATAR_EXPRESSIVE_LEVEL,
  type AvatarAttempt,
  type AvatarEngine,
} from '../types/avatar.ts'
import type { VideoFormat } from '../types/video-format.ts'

// Huellas del avatar de una escena (diseño §3.1 y §7.2, sin el fondo: desde la
// decisión del dueño del 2026-10-10 el clip lleva el fondo propio del look y
// Vimo no manda imagen). Cada una con su trabajo:
//  - la del CORTE de audio (narración + tramo en cuadros) nombra el WAV y lo
//    reusa entre corridas;
//  - la del PEDIDO (look, motor, formato, resolución, corte y versión de la
//    narración; desde la entrega 2e, al final y solo cuando van, el
//    movimiento, «más expresivo» y la toma) es `attempt.hash`; con el número
//    de reintento da la clave del intento, de la que salen la
//    `Idempotency-Key` (con el proyecto y la escena), la marca del `title` y
//    los nombres de los mp4;
//  - la del RENDER (look, motor, tramo y versión de la narración) es
//    `renderHash`: si ya no coincide con la escena, el clip está desactualizado.
// Se hashea un arreglo JSON, no un objeto: el orden queda fijo. Usa node:crypto:
// es solo del sidecar (la UI lee `stale` de la vista y nunca importa esto).

const IDEMPOTENCY_PREFIX = 'vimo-avatar-video-'
// Hex que van en la Idempotency-Key.
const IDEMPOTENCY_HEX_LENGTH = 32
// Hex de la clave del intento que van en la marca del `title` del render.
const TITLE_HEX_LENGTH = 8
// Entre el nombre del video y la marca, en el título del render.
const TITLE_NAME_SEPARATOR = ' · '
// Lo que en el nombre cuenta como un hueco: los espacios (también saltos de
// línea, tabulaciones y los de Unicode), los caracteres de control y las
// mitades sueltas de un par sustituto, que no se pueden escribir en un título.
const TITLE_NAME_GAPS = /[\s\p{Cc}\p{Cs}]+/gu
// Grafemas: lo que se ve como un solo carácter (una letra con su tilde, un
// emoji con su tono de piel o unido con ZWJ, una bandera).
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

export interface AvatarAudioCut {
  narrationSha256: string
  startFrame: number
  endFrame: number
}

export interface AvatarRequestIdentity {
  lookId: string
  engine: AvatarEngine
  aspectRatio: VideoFormat
  resolution: string
  audioCutHash: string
  narrationVersion: number
  // Entrega 2e (§21.2 y §21.4): lo que el pedido lleva además, solo cuando va.
  // El prompt de movimiento y «más expresivo» cambian el cuerpo del POST; la
  // toma, no: hace que regenerar una escena lista sea un pedido nuevo (otra
  // clave) en vez de cosechar gratis el clip que ya está cobrado.
  motionPrompt?: string
  expressiveness?: typeof AVATAR_EXPRESSIVE_LEVEL
  take?: number
}

export interface AvatarRenderIdentity {
  lookId: string
  engine: AvatarEngine
  startFrame: number
  endFrame: number
  narrationVersion: number
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

export function avatarAudioCutHash(cut: AvatarAudioCut): string {
  return sha256(
    JSON.stringify([cut.narrationSha256, cut.startFrame, cut.endFrame]),
  )
}

export function avatarRequestHash(identity: AvatarRequestIdentity): string {
  return sha256(
    JSON.stringify([
      identity.lookId,
      identity.engine,
      identity.aspectRatio,
      identity.resolution,
      identity.audioCutHash,
      identity.narrationVersion,
      ...requestExtras(identity),
    ]),
  )
}

// Lo que la entrega 2e suma al final de la huella del pedido, en este orden y
// cada uno solo cuando va: `['motion', <prompt>]`, `['expressiveness',
// 'high']` y `['take', <n>]` con n > 0. Sin ninguno, la huella es la de antes
// de la 2e: los pedidos de Avatar III y los recibos guardados no cambian. Una
// toma que no es un entero positivo (un scenes.json editado) cuenta como la
// toma 0: a lo sumo cosecha el clip que ya está pagado, nunca paga otro.
function requestExtras(identity: AvatarRequestIdentity): unknown[] {
  const extras: unknown[] = []
  if (identity.motionPrompt) extras.push(['motion', identity.motionPrompt])
  if (identity.expressiveness)
    extras.push(['expressiveness', identity.expressiveness])

  const take = identity.take
  if (take !== undefined && Number.isSafeInteger(take) && take > 0)
    extras.push(['take', take])

  return extras
}

// `startFrame`/`endFrame` = Math.round(segundos × 25) del tramo de la escena;
// `narrationVersion` = la del proyecto (ausente = 0).
export function avatarRenderHash(identity: AvatarRenderIdentity): string {
  return sha256(
    JSON.stringify([
      identity.lookId,
      identity.engine,
      identity.startFrame,
      identity.endFrame,
      identity.narrationVersion,
    ]),
  )
}

// Cuántos intentos del MISMO pedido terminaron `failed` (un render fallido o un
// pedido rechazado) antes del intento `index`. Ninguno se cobra, pero con la
// clave vieja HeyGen devolvería 24 h la misma respuesta: el reintento lleva la
// clave siguiente, y una clave rechazada no se vuelve a mandar.
export function avatarRetryIndex(
  attempts: AvatarAttempt[],
  index: number,
): number {
  const hash = attempts[index]?.hash
  return attempts
    .slice(0, index)
    .filter((attempt) => attempt.hash === hash && attempt.state === 'failed')
    .length
}

export function avatarRequestKey(hash: string, retryIndex: number): string {
  return sha256(`${hash}:${retryIndex}`)
}

// La Idempotency-Key del intento: su clave más el proyecto y la escena. Sin
// ellos, dos proyectos con la misma narración, el mismo tramo y el mismo look
// compartirían la clave 24 h con otro `title` y otro asset. 32 hex: dentro del
// patrón `[A-Za-z0-9_:.-]{1,255}` que HeyGen admite.
export function avatarIdempotencyKey(
  projectId: string,
  sceneId: number,
  requestKey: string,
): string {
  const scoped = sha256(JSON.stringify([projectId, sceneId, requestKey]))
  return IDEMPOTENCY_PREFIX + scoped.slice(0, IDEMPOTENCY_HEX_LENGTH)
}

// La MARCA del render de un intento: proyecto, escena y 8 hex de su clave.
// Desde la entrega 2c va al final del título que se manda
// (avatarNamedVideoTitle) y sigue siendo lo que se busca en HeyGen para
// recuperar un pedido sin respuesta; antes de la 2c era el título entero.
export function avatarVideoTitle(
  projectId: string,
  sceneId: number,
  requestKey: string,
): string {
  return `vimo:${projectId}:scene-${sceneId}:${requestKey.slice(0, TITLE_HEX_LENGTH)}`
}

// El nombre del video como entra en el título: en NFC, sin espacios de más
// (cada hueco de TITLE_NAME_GAPS cuenta como un espacio) y cortado en
// AVATAR_VIDEO_TITLE_NAME_LIMIT grafemas, así ni un emoji compuesto ni una
// bandera quedan partidos. Un nombre llano no le manda a HeyGen lo que podría
// rechazar (un NUL) o guardar a medias.
function videoTitleName(videoName: string): string {
  const clean = videoName.normalize('NFC').replace(TITLE_NAME_GAPS, ' ').trim()
  return Array.from(GRAPHEMES.segment(clean), ({ segment }) => segment)
    .slice(0, AVATAR_VIDEO_TITLE_NAME_LIMIT)
    .join('')
    .trimEnd()
}

// El título que sale en el POST (entrega 2c, decisión del dueño del
// 2026-10-11, diseño §7.1): `<nombre del video> · <marca>`; sin nombre, la
// marca sola. La marca va siempre entera y al final.
export function avatarNamedVideoTitle(
  videoName: string,
  marker: string,
): string {
  // project.json se lee sin validar (readProjectMetadata): un nombre que no es
  // texto cuenta como sin nombre y no frena el render.
  const name = typeof videoName === 'string' ? videoTitleName(videoName) : ''
  if (!name) return marker

  return `${name}${TITLE_NAME_SEPARATOR}${marker}`
}

// Si `title` termina en la marca (entrega 2c, rondas 1 a 3): un render de este
// pedido con lo que sea delante —el nombre o el separador que HeyGen haya
// guardado distinto—, porque la marca es ASCII, va al final y ninguna otra
// marca de Vimo puede terminar en ella (lleva `vimo:` y dos puntos, que un id
// de proyecto no tiene). Una copia hecha en HeyGen («Copia de <título>»)
// también termina así: la recuperación prefiere el título exacto y, entre los
// que solo terminan en la marca, nunca elige uno `failed`
// (pipeline/avatar/lane.ts). La marca en otro lugar (`<marca> (copia)`,
// `<marca> · <nombre>`) no cuenta.
export function endsWithAvatarVideoMarker(
  title: string,
  marker: string,
): boolean {
  return title.endsWith(marker)
}
