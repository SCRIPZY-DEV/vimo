import { isAvatarFallback } from '@/modules/videos/utilities/avatarFallback'
import type {
  AvatarSceneActivity,
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

  if (task.stage === 'avatar') return true

  return task.scenes.some((scene) => scene.avatar !== undefined)
}
