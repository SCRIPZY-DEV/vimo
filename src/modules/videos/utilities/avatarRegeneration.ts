import { avatarBlockState } from '@/modules/videos/utilities/avatarClips'
import { isAvatarFallback } from '@/modules/videos/utilities/avatarFallback'
import { avatarSpansCostEstimate } from '@/modules/videos/utilities/avatarCostEstimate'
import { avatarSceneSpan } from '@pipeline/types/avatar.ts'
import type { CostEstimateLine } from '@/modules/common/types/credits'
import type {
  AvatarSceneAction,
  SceneAvatarRendering,
} from '@/modules/videos/types/library'
import type { TimelineAvatarState } from '@/modules/videos/utilities/avatarClips'
import type { AvatarLookType, AvatarSceneSpan } from '@pipeline/types/avatar.ts'
import type { SceneDetail } from '@pipeline/types/video-project.ts'

// El estado que dibuja el bloque de la escena (spec §3.3, avatarBlockState):
// el mismo en el panel, así los dos dicen lo mismo (una lista desactualizada
// sin su clip es «desactualizado» en los dos, nunca fallida). null si la
// escena no es de avatar.
export function avatarSceneState(
  scene: SceneDetail,
  rendering: Record<number, SceneAvatarRendering>,
): TimelineAvatarState | null {
  if (!scene.avatar) return null

  return avatarBlockState(scene.avatar, rendering[scene.id] !== undefined)
}

// Qué ofrece el panel para una escena de avatar (spec §11.1, con los estados
// de §3.3 que dibuja el bloque): «Generar» si está planeada; «Regenerar» si
// falló, quedó desactualizada o está lista sin su clip (que el bloque ya
// muestra como fallida). Una lista y al día, o una que se está generando, no
// ofrece nada; tampoco una escena sin tramo (sin bloque en la pista: el carril
// no la puede pedir) ni una que no es de avatar.
export function avatarSceneAction(
  scene: SceneDetail,
  rendering: Record<number, SceneAvatarRendering>,
): AvatarSceneAction | null {
  if (!avatarSceneSpan(scene)) return null

  const state = avatarSceneState(scene, rendering)
  if (state === 'planned') return 'generate'

  if (state === 'failed' || state === 'stale') return 'regenerate'

  return null
}

// Las escenas que pide «Regenerar todos» (§11.4 y §20): todas las de avatar
// sin un clip válido o desactualizadas, en el orden del video.
export function avatarScenesToRender(
  scenes: SceneDetail[],
  rendering: Record<number, SceneAvatarRendering>,
): SceneDetail[] {
  return scenes.filter((scene) => avatarSceneAction(scene, rendering) !== null)
}

// Las apariciones que cuenta y regenera el aviso de arriba del editor: las que
// salen con la imagen fija del look (la regla única de WP-P en el contexto del
// proyecto) y que el panel puede pedir, con un tramo de al menos un cuadro (M6
// de la revisión del WP-Q). Así el número, el pedido y el costo hablan de las
// mismas: una sin tramo no tiene bloque, el carril no la pide y no suma costo.
export function editorFallbackSceneIds(scenes: SceneDetail[]): number[] {
  return scenes
    .filter(
      (scene) =>
        avatarSceneSpan(scene) !== undefined &&
        isAvatarFallback(scene, 'project'),
    )
    .map((scene) => scene.id)
}

// Lo que cobra HeyGen por esas escenas: el mismo cálculo que la confirmación
// de Crear (avatarSpansCostEstimate: la duración REAL del tramo, contada en
// cuadros como la cuenta la fase, × la tarifa de Avatar III del tipo de look).
// Un video tiene un solo look, así que hay un solo tipo; si algún día una
// escena cambia de look, cada tipo se cuenta con su tarifa y se suman. null si
// no hay nada que cobrar o el motor no tiene tarifa para ese look.
export function avatarScenesCost(
  scenes: SceneDetail[],
): CostEstimateLine | null {
  const spansByLookType = new Map<AvatarLookType, AvatarSceneSpan[]>()
  for (const scene of scenes) {
    const span = avatarSceneSpan(scene)
    if (!scene.avatar || !span) continue

    const lookType = scene.avatar.lookType
    spansByLookType.set(lookType, [
      ...(spansByLookType.get(lookType) ?? []),
      span,
    ])
  }

  const lines = [...spansByLookType].flatMap(([lookType, spans]) => {
    const line = avatarSpansCostEstimate(lookType, spans)
    return line ? [line] : []
  })
  if (lines.length === 0) return null

  const [first, ...rest] = lines
  return rest.reduce(
    (total, line) => ({
      ...total,
      estimated: total.estimated + line.estimated,
    }),
    first,
  )
}
