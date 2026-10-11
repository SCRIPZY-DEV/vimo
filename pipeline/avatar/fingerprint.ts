import { createHash } from 'node:crypto'

import type { AvatarAttempt, AvatarEngine } from '../types/avatar.ts'
import type { VideoFormat } from '../types/video-format.ts'

// Huellas del avatar de una escena (diseño §3.1 y §7.2, sin el fondo: desde la
// decisión del dueño del 2026-10-10 el clip lleva el fondo propio del look y
// Vimo no manda imagen). Cada una con su trabajo:
//  - la del CORTE de audio (narración + tramo en cuadros) nombra el WAV y lo
//    reusa entre corridas;
//  - la del PEDIDO (look, motor, formato, resolución, corte y versión de la
//    narración) es `attempt.hash`; con el número de reintento da la clave del
//    intento, de la que salen la `Idempotency-Key` (con el proyecto y la
//    escena), el `title` y los nombres de los mp4;
//  - la del RENDER (look, motor, tramo y versión de la narración) es
//    `renderHash`: si ya no coincide con la escena, el clip está desactualizado.
// Se hashea un arreglo JSON, no un objeto: el orden queda fijo. Usa node:crypto:
// es solo del sidecar (la UI lee `stale` de la vista y nunca importa esto).

const IDEMPOTENCY_PREFIX = 'vimo-avatar-video-'
// Hex que van en la Idempotency-Key.
const IDEMPOTENCY_HEX_LENGTH = 32
// Hex de la clave del intento que van en el `title` del render.
const TITLE_HEX_LENGTH = 8

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
    ]),
  )
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

export function avatarVideoTitle(
  projectId: string,
  sceneId: number,
  requestKey: string,
): string {
  return `vimo:${projectId}:scene-${sceneId}:${requestKey.slice(0, TITLE_HEX_LENGTH)}`
}
