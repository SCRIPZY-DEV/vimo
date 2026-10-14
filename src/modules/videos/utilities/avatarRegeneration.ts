import { MOTION_PROMPT_LINE_BREAKS } from '@/modules/videos/constants'
import { avatarBlockState } from '@/modules/videos/utilities/avatarClips'
import { isAvatarFallback } from '@/modules/videos/utilities/avatarFallback'
import { avatarSpansCostEstimate } from '@/modules/videos/utilities/avatarCostEstimate'
import { avatarMotionSupport, avatarSceneSpan } from '@pipeline/types/avatar.ts'
import type { CostEstimateLine } from '@/modules/common/types/credits'
import type {
  AvatarMotionDraft,
  AvatarRenderRequest,
  AvatarSceneAction,
  SceneAvatarRendering,
} from '@/modules/videos/types/library'
import type { TimelineAvatarState } from '@/modules/videos/utilities/avatarClips'
import type {
  AvatarEngine,
  AvatarLookType,
  AvatarRenderScenesPayload,
  AvatarSceneDurationInput,
  AvatarSceneMotionInput,
  AvatarSceneSpan,
  SceneAvatarView,
} from '@pipeline/types/avatar.ts'
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
// muestra como fallida); y, desde la entrega 2e (§21.4), «Regenerar» también
// en una lista y al día (`retake`, un render nuevo pagado). Una que se está
// generando no ofrece nada; tampoco una escena sin tramo (sin bloque en la
// pista: el carril no la puede pedir) ni una que no es de avatar.
export function avatarSceneAction(
  scene: SceneDetail,
  rendering: Record<number, SceneAvatarRendering>,
): AvatarSceneAction | null {
  if (!avatarSceneSpan(scene)) return null

  const state = avatarSceneState(scene, rendering)
  if (state === 'planned') return 'generate'

  if (state === 'failed' || state === 'stale') return 'regenerate'

  if (state === 'ready') return 'retake'

  return null
}

// Las escenas que pide «Regenerar todos» (§11.4 y §20): todas las de avatar
// sin un clip válido o desactualizadas, en el orden del video. No cuenta las
// listas y al día (entrega 2e: esas se vuelven a generar de a una).
export function avatarScenesToRender(
  scenes: SceneDetail[],
  rendering: Record<number, SceneAvatarRendering>,
): SceneDetail[] {
  return scenes.filter((scene) => {
    const action = avatarSceneAction(scene, rendering)
    return action === 'generate' || action === 'regenerate'
  })
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
// cuadros como la cuenta la fase, × la tarifa del motor de la escena para su
// tipo de look; hasta la entrega 2e se cobraba todo a Avatar III). Las escenas
// se agrupan por motor y tipo de look, cada grupo con su tarifa, y se suman.
// Las escenas con una duración nueva (entrega 2g, §23.3) cuestan lo de esos
// segundos desde su inicio, no lo del tramo que tienen hoy: es el render del
// trozo nuevo. null si no hay nada que cobrar o el motor no tiene tarifa para
// ese look.
export function avatarScenesCost(
  scenes: SceneDetail[],
  durations: readonly AvatarSceneDurationInput[] = [],
): CostEstimateLine | null {
  const secondsByScene = new Map(
    durations.map((duration) => [duration.sceneId, duration.seconds]),
  )
  const spansByEngine = new Map<
    AvatarEngine,
    Map<AvatarLookType, AvatarSceneSpan[]>
  >()
  for (const scene of scenes) {
    const span = avatarSceneSpan(scene)
    if (!scene.avatar || !span) continue

    const { engine, lookType } = scene.avatar
    const seconds = secondsByScene.get(scene.id)
    const costedSpan =
      seconds === undefined
        ? span
        : {
            startSeconds: span.startSeconds,
            endSeconds: span.startSeconds + seconds,
          }
    const spansByLookType =
      spansByEngine.get(engine) ?? new Map<AvatarLookType, AvatarSceneSpan[]>()
    spansByLookType.set(lookType, [
      ...(spansByLookType.get(lookType) ?? []),
      costedSpan,
    ])
    spansByEngine.set(engine, spansByLookType)
  }

  const lines = [...spansByEngine].flatMap(([engine, spansByLookType]) => {
    return [...spansByLookType].flatMap(([lookType, spans]) => {
      const line = avatarSpansCostEstimate(lookType, spans, engine)
      return line ? [line] : []
    })
  })
  if (lines.length === 0) return null

  const [first, ...rest] = lines
  return rest.reduce((total, line) => {
    return { ...total, estimated: total.estimated + line.estimated }
  }, first)
}

// El pedido de `avatar-render-scenes` desde el editor: las escenas sin repetir
// y en orden; y, desde la entrega 2e (§21.4), las listas que se regeneran y el
// movimiento, solo de esas escenas, sin repetir, y cada campo solo si no queda
// vacío. Desde la entrega 2g (§23.3) también la duración nueva de las escenas
// que la cambiaron (`durations`, en orden de escena). Así una escena de Avatar
// III planeada sigue pidiendo exactamente `{ projectId, sceneIds }`, como antes
// de la 2e.
export function avatarRenderPayload(
  projectId: string,
  request: AvatarRenderRequest,
): AvatarRenderScenesPayload {
  const sceneIds = sortedUnique(request.sceneIds)
  const payload: AvatarRenderScenesPayload = { projectId, sceneIds }

  const regenerateSceneIds = sortedUnique(
    request.regenerateSceneIds ?? [],
  ).filter((sceneId) => sceneIds.includes(sceneId))
  if (regenerateSceneIds.length > 0)
    payload.regenerateSceneIds = regenerateSceneIds

  const motionByScene = new Map(
    (request.motion ?? [])
      .filter((entry) => sceneIds.includes(entry.sceneId))
      .map((entry) => [entry.sceneId, entry]),
  )
  if (motionByScene.size > 0) {
    payload.motion = [...motionByScene.values()].sort(
      (left, right) => left.sceneId - right.sceneId,
    )
  }

  const durationByScene = new Map(
    (request.durations ?? [])
      .filter((entry) => sceneIds.includes(entry.sceneId))
      .map((entry) => [entry.sceneId, entry]),
  )
  if (durationByScene.size > 0) {
    payload.durations = [...durationByScene.values()].sort(
      (left, right) => left.sceneId - right.sceneId,
    )
  }

  return payload
}

function sortedUnique(ids: readonly number[]): number[] {
  return [...new Set(ids)].sort((left, right) => left - right)
}

// El movimiento guardado en la escena tal como lo edita el panel (entrega 2e,
// §21.4): sin prompt, vacío; «más expresivo» solo se guarda en true.
export function storedAvatarMotion(
  avatar: SceneAvatarView | undefined,
): AvatarMotionDraft {
  return {
    motionPrompt: avatar?.motionPrompt ?? '',
    expressive: avatar?.expressive === true,
  }
}

export function sameAvatarMotion(
  left: AvatarMotionDraft,
  right: AvatarMotionDraft,
): boolean {
  return (
    left.motionPrompt === right.motionPrompt &&
    left.expressive === right.expressive
  )
}

// Los ajustes de movimiento que viajan con el pedido de una escena (§21.4):
// solo si la persona cambió algo (lo guardado ya está en la escena), con el
// prompt recortado. «Más expresivo» solo, sin tocar el prompt, también viaja,
// con el prompt guardado. Si el proveedor ya rechazó el movimiento
// (`motionUnsupported`): un prompt nuevo viaja como siempre (el sidecar borra
// la marca y vuelve a probar: el rechazo puede no ser del look, ronda 2); sin
// cambiar el prompt, solo «más expresivo», con el prompt guardado, y solo si
// el motor y el look lo admiten (`expressiveness`: IV con un look de foto).
// Una escena de V no tiene el interruptor desde la entrega 2g (§23.1), y la que
// guardó `expressive: true` en la 2e o la 2f lo conserva (R-2g-20): sin cambios
// no viaja nada y, con el prompt editado, viaja con la marca como estaba. Así
// ningún pedido del editor cambia la huella de un render ya pedido o pagado de
// esa escena, y el carril lo cosecha en vez de cobrar otro.
// null = no viaja nada.
export function avatarMotionInput(
  sceneId: number,
  avatar: SceneAvatarView,
  draft: AvatarMotionDraft,
): AvatarSceneMotionInput | null {
  const stored = storedAvatarMotion(avatar)
  const motionPrompt = draft.motionPrompt.trim()
  const promptChanged = motionPrompt !== stored.motionPrompt.trim()
  const expressiveChanged = draft.expressive !== stored.expressive
  if (avatar.motionUnsupported && !promptChanged) {
    if (!expressiveChanged) return null

    if (!avatarMotionSupport(avatar.engine, avatar.lookType).expressiveness)
      return null

    return {
      sceneId,
      motionPrompt: stored.motionPrompt,
      expressive: draft.expressive,
    }
  }

  if (!promptChanged && !expressiveChanged) return null

  return { sceneId, motionPrompt, expressive: draft.expressive }
}

// El prompt de movimiento es de una sola línea (ronda 1 de WP-X): los saltos
// que llegan pegados se vuelven espacios. Enter no los agrega (lo frena el
// campo, EditorAvatarMotion).
export function singleLineMotionPrompt(value: string): string {
  return value.replace(MOTION_PROMPT_LINE_BREAKS, ' ')
}
