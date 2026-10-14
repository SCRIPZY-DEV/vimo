import { AVATAR_CHARGED_PHASES } from '@/modules/videos/constants'
import { isAvatarFallback } from '@/modules/videos/utilities/avatarFallback'
import type {
  AvatarSceneActivity,
  ChargedCancelWarning,
  CreateTask,
  SceneView,
} from '@/modules/videos/types/create'
import type { PipelineEventPayload } from '@pipeline/runner/events.ts'

// Los eventos de la fase `avatar` que cambian una escena (ADR-0057 §8).
export type AvatarSceneEvent = Extract<
  PipelineEventPayload,
  {
    type:
      | 'avatar-scene-started'
      | 'avatar-scene-progress'
      | 'avatar-scene-ready'
      | 'avatar-scene-failed'
  }
>

// Cómo va la fila de una aparición en la pantalla de progreso. `stale`: una
// desactualizada, que la fase no regenera sola (entrega 2d).
export type AvatarRowStatus =
  'queued' | 'generating' | 'ready' | 'failed' | 'stale'

// Segundos de un render: el último que informó el sidecar más lo que corrió
// el reloj desde que llegó, mientras genera; fijo al terminar.
export function avatarElapsedSeconds(
  activity: AvatarSceneActivity,
  now: number,
): number {
  if (activity.status !== 'generating') return activity.elapsedSeconds

  return (
    activity.elapsedSeconds + Math.max(0, (now - activity.receivedAt) / 1000)
  )
}

function withActivity(
  scenes: SceneView[],
  sceneId: number,
  activity: AvatarSceneActivity,
): SceneView[] {
  return scenes.map((scene) => {
    if (scene.id !== sceneId) return scene

    return { ...scene, avatarActivity: activity }
  })
}

// Aplica un evento de la fase `avatar` a las escenas de la pantalla de
// progreso. Pura: `now` es el reloj del webview al recibirlo.
export function scenesWithAvatarEvent(
  scenes: SceneView[],
  event: AvatarSceneEvent,
  now: number,
): SceneView[] {
  if (event.type === 'avatar-scene-started') {
    return withActivity(scenes, event.sceneId, {
      status: 'generating',
      phase: null,
      elapsedSeconds: 0,
      receivedAt: now,
    })
  }

  if (event.type === 'avatar-scene-progress') {
    return withActivity(scenes, event.sceneId, {
      status: 'generating',
      phase: event.phase,
      elapsedSeconds: event.elapsedSeconds,
      receivedAt: now,
    })
  }

  const current = scenes.find(
    (scene) => scene.id === event.sceneId,
  )?.avatarActivity
  const phase = current?.phase ?? null
  const elapsedSeconds = current ? avatarElapsedSeconds(current, now) : 0

  if (event.type === 'avatar-scene-failed') {
    return withActivity(scenes, event.sceneId, {
      status: 'failed',
      phase,
      elapsedSeconds,
      receivedAt: now,
      code: event.code,
    })
  }

  // Lista: la escena trae su vista nueva (el clip, el estado) y el tiempo
  // queda fijo en lo que tardó.
  const ready: AvatarSceneActivity = {
    status: 'ready',
    phase,
    elapsedSeconds,
    receivedAt: now,
  }

  return scenes.map((scene) => {
    if (scene.id !== event.sceneId) return scene

    return { ...scene, ...event.scene, avatarActivity: ready }
  })
}

// Las apariciones cobradas de la corrida con un evento más (entrega 2h, spec
// §24.3): entra la que llegó a una fase cobrada (AVATAR_CHARGED_PHASES:
// HeyGen ya aceptó su render) o quedó lista; sale la que falló, porque un
// render que HeyGen falló no se cobra y la tarjeta del fallo promete que lo
// que cuenta está pagado y se usa sin pagar de nuevo. Pura: la misma lista si
// el evento no la cambia.
export function chargedSceneIdsWithAvatarEvent(
  sceneIds: number[],
  event: AvatarSceneEvent,
): number[] {
  const listed = sceneIds.includes(event.sceneId)
  if (event.type === 'avatar-scene-failed') {
    if (!listed) return sceneIds

    return sceneIds.filter((sceneId) => sceneId !== event.sceneId)
  }

  const charged =
    event.type === 'avatar-scene-ready' ||
    (event.type === 'avatar-scene-progress' &&
      AVATAR_CHARGED_PHASES.has(event.phase))
  if (!charged || listed) return sceneIds

  return [...sceneIds, event.sceneId]
}

// Cuántas apariciones cobradas en esta corrida siguen generándose (entrega 2h,
// spec §24.4): cancelar ahora no devuelve lo que ya se mandó a generar.
export function chargedAvatarScenesInFlight(
  task: Pick<CreateTask, 'scenes' | 'avatarChargedSceneIds'>,
): number {
  return task.scenes.filter(
    (scene) =>
      task.avatarChargedSceneIds.includes(scene.id) &&
      scene.avatarActivity?.status === 'generating',
  ).length
}

// El aviso de «Cancelar» con apariciones cobradas, render a render (ruling de
// unificación del 2026-10-13, 19:59, el mismo del editor): se cierra solo si
// ya no hay un job vivo que cortar (la corrida terminó o quedó esperando el
// reintento automático); abierto, su cuenta sube si las cobradas y sin
// terminar pasan a ser más, y nunca baja (un número que baja mientras se lee,
// o un aviso que desaparece bajo el puntero, confunden). Pura: el mismo aviso
// si no cambia.
export function chargedWarningAfterRender(
  warning: ChargedCancelWarning | null,
  inFlight: number,
  runEnded: boolean,
): ChargedCancelWarning | null {
  if (warning === null) return null

  if (runEnded) return null

  if (inFlight <= warning.count) return warning

  return { ...warning, count: inFlight }
}

// El job terminó (éxito, fallo o pausa). Un render anunciado con
// `avatar-scene-started` puede quedar sin `ready` ni `failed` cuando la corrida
// se frena por saldo, clave o cancelación (la escena que dispara la pausa por
// saldo no emite `failed`): su fila no puede seguir girando con un reloj que
// ya no tiene de dónde avanzar. Vuelve a lo que dice el disco; las cerradas
// (`ready`, `failed`) conservan su actividad y su tiempo. Sin renders abiertos
// devuelve la misma lista.
export function scenesWithAvatarRunEnded(scenes: SceneView[]): SceneView[] {
  if (!scenes.some((scene) => scene.avatarActivity?.status === 'generating'))
    return scenes

  return scenes.map((scene) => {
    if (scene.avatarActivity?.status !== 'generating') return scene

    return { ...scene, avatarActivity: undefined }
  })
}

// La fila de una aparición: lo que pasó en esta corrida manda; sin eventos
// (proyecto reanudado), lo que dice el disco. «No se completó» es la regla
// única de la imagen fija (`isAvatarFallback` en el contexto `progress`), así
// la fila y el aviso del final nunca se contradicen. Una desactualizada, con o
// sin clip, tiene su propio estado (ronda 2 de WP-P): antes, la que perdió su
// clip decía «No se completó» con el motivo de la descarga, que promete reusar
// el video pagado, y el aviso no la contaba.
export function avatarRowStatus(
  scene: Pick<SceneView, 'avatar' | 'avatarActivity'>,
): AvatarRowStatus {
  if (scene.avatarActivity) return scene.avatarActivity.status

  if (scene.avatar?.stale) return 'stale'

  if (isAvatarFallback(scene, 'progress')) return 'failed'

  if (scene.avatar?.status === 'ready') return 'ready'

  return 'queued'
}

// ¿La corrida tiene fase de avatar? Por datos, como la animación: una fase
// saltada nunca entra en `completedStages` en disco, así que un proyecto sin
// avatar no puede mostrar la fila «Avatar» ni culparla.
export function taskHasAvatar(task: CreateTask): boolean {
  if (task.hasAvatar) return true

  if (task.activeStages.includes('avatar')) return true

  return task.scenes.some((scene) => scene.avatar !== undefined)
}
