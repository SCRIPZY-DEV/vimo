import { avatarSceneSpan } from '@pipeline/types/avatar.ts'
import type {
  AvatarSceneSpan,
  SceneAvatarView,
} from '@pipeline/types/avatar.ts'
import type { SceneDetail } from '@pipeline/types/video-project.ts'

// Lo que muestra el bloque de una escena de avatar (spec §3.3). Solo
// «generando» sale de memoria (un render en curso); el resto, de la vista que
// arma el sidecar.
export type TimelineAvatarState =
  'planned' | 'generating' | 'ready' | 'failed' | 'stale'

// Un clip de avatar que el visor reproduce, con la misma forma que
// `ReadyAnimationClip` (spec §10.2). Una escena de avatar es UNA escena: el
// clip cubre exactamente su tramo.
export interface ReadyAvatarClip {
  id: string
  lead: SceneDetail
  scenes: SceneDetail[]
  avatar: SceneAvatarView
  clipPath: string
  startSeconds: number
  endSeconds: number
}

// Estado visible de una escena de avatar (§3.3): un `ready` sin archivo se
// muestra como fallido, como los clips de Kie, y uno desactualizado (`stale`,
// que el sidecar deriva al leer contra la narración y el tramo vigentes) no
// se reproduce: el render lo deja estático con la vista previa del look
// (§10.1). Desactualizado manda sobre fallido (ruling del 2026-10-11, entrega
// 2d): una lista desactualizada que además perdió su clip llega del sidecar
// como fallida por la descarga (`avatar_download_failed`, «ya está pago»),
// pero regenerarla paga un render nuevo; `stale` solo viene en escenas que
// estuvieron listas, así que una fallida de verdad sigue fallida.
export function avatarBlockState(
  avatar: SceneAvatarView,
  rendering: boolean,
): TimelineAvatarState {
  if (rendering) return 'generating'
  if (avatar.stale) return 'stale'
  if (avatar.status === 'failed') return 'failed'
  if (avatar.status === 'planned') return 'planned'
  if (!avatar.clipPath) return 'failed'

  return 'ready'
}

// Los tramos de las escenas de avatar, en cualquier estado: lo que ningún
// clip de Kie puede pisar en la pista ni en el visor (spec §7.4 y §10.1). Una
// escena de avatar sin tramo (sin tiempos, o sin un cuadro entero) no tiene
// bloque ni clip, como una escena normal de largo cero: la regla es la del
// carril y la cobertura de Kie (`avatarSceneSpan`, pipeline/types/avatar.ts),
// así nunca se dibuja como lista ni se monta un `<video>` de hueco 0.
export function avatarSpansOf(scenes: SceneDetail[]): AvatarSceneSpan[] {
  return scenes.map(avatarSceneSpan).filter((span) => span !== undefined)
}

// Las escenas de avatar listas y al día, en orden de tiempo: lo único del
// avatar que el visor reproduce como video (`clipAt`, `EditorVisualFrame`).
export function readyAvatarClips(scenes: SceneDetail[]): ReadyAvatarClip[] {
  const clips: ReadyAvatarClip[] = []
  for (const scene of scenes) {
    const avatar = scene.avatar
    if (!avatar?.clipPath || avatarBlockState(avatar, false) !== 'ready')
      continue

    const span = avatarSceneSpan(scene)
    if (!span) continue

    clips.push({
      id: `avatar-${scene.id}`,
      lead: scene,
      scenes: [scene],
      avatar,
      clipPath: avatar.clipPath,
      startSeconds: span.startSeconds,
      endSeconds: span.endSeconds,
    })
  }
  return clips.sort((left, right) => left.startSeconds - right.startSeconds)
}
