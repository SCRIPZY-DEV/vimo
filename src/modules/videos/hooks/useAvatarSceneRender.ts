import { useState } from 'react'
import { useHeyGenAccess } from '@/modules/avatars/hooks/useHeyGenAccess'
import { useAvatarRenderConfirmation } from '@/modules/videos/hooks/useAvatarRenderConfirmation'
import { useLibraryEditorTask } from '@/modules/videos/hooks/useLibraryEditorTask'
import {
  avatarMotionInput,
  avatarSceneAction,
  avatarScenesCost,
  avatarSceneState,
  avatarScenesToRender,
  sameAvatarMotion,
  storedAvatarMotion,
} from '@/modules/videos/utilities/avatarRegeneration'
import { avatarExpressiveAvailable } from '@pipeline/types/avatar.ts'
import type {
  AvatarMotionDraft,
  AvatarMotionEdit,
} from '@/modules/videos/types/library'
import type { SceneDetail } from '@pipeline/types/video-project.ts'

interface UseAvatarSceneRenderOptions {
  projectId: string
  // La escena de avatar elegida en el editor y todas las del proyecto.
  scene: SceneDetail
  scenes: SceneDetail[]
}

// «Generar» / «Regenerar» / «Regenerar todos» el avatar desde el panel de la
// escena (entrega 2d, spec §11.1, §11.4 y §20): qué ofrece la escena elegida,
// en qué estado está (el mismo que dibuja su bloque), qué escenas pide
// «Regenerar todos» y la confirmación con el costo y el saldo ANTES de pagar
// (useAvatarRenderConfirmation). Desde la entrega 2e (§21.4): «Regenerar» en
// una lista (`retake`, que viaja como `regenerateSceneIds`) y, con V o IV si
// el look admite movimiento, el borrador de la sección «Movimiento». El
// borrador arranca con lo guardado en la escena y vive mientras lo guardado
// no cambie: si la escena se genera o se relee con otros ajustes, el panel
// vuelve a mostrar lo guardado (el componente que lo usa lleva la `key` de la
// escena, así no pasa de una a otra). Viaja solo si la persona cambió algo
// (avatarMotionInput), con la acción de la escena o con «Regenerar todos» si
// la incluye.
export function useAvatarSceneRender({
  projectId,
  scene,
  scenes,
}: UseAvatarSceneRenderOptions) {
  const editorTask = useLibraryEditorTask(projectId)
  const { canUseHeyGen, missingKey } = useHeyGenAccess()
  const confirmation = useAvatarRenderConfirmation({ projectId, scenes })
  const [motionEdit, setMotionEdit] = useState<AvatarMotionEdit | null>(null)

  const rendering = editorTask.task?.sceneAvatarRendering ?? {}
  const action = avatarSceneAction(scene, rendering)
  const avatar = scene.avatar

  // La sección «Movimiento» (§21.4): solo donde hay algo que pedir y si el
  // motor y el look aceptan movimiento (V, o IV con un look de foto).
  const motionShown =
    action !== null &&
    avatar !== undefined &&
    avatarExpressiveAvailable(avatar.engine, avatar.lookType)
  const storedMotion = storedAvatarMotion(avatar)
  const motionDraft =
    motionEdit && sameAvatarMotion(motionEdit.base, storedMotion)
      ? motionEdit.draft
      : storedMotion
  const motionInput =
    motionShown && avatar
      ? avatarMotionInput(scene.id, avatar, motionDraft)
      : null

  const changeMotion = (patch: Partial<AvatarMotionDraft>) => {
    setMotionEdit({ base: storedMotion, draft: { ...motionDraft, ...patch } })
  }

  // Abre la confirmación con lo que viaja además de las escenas: la lista que
  // se vuelve a generar y el movimiento editado de la escena elegida, solo si
  // la escena va en el pedido.
  const requestConfirmation = (sceneIds: number[]) => {
    if (!sceneIds.includes(scene.id)) {
      confirmation.requestConfirmation(sceneIds)
      return
    }

    confirmation.requestConfirmation(sceneIds, {
      regenerateSceneIds: action === 'retake' ? [scene.id] : [],
      motion: motionInput ? [motionInput] : [],
    })
  }

  const cancelRender = () => editorTask.cancelActiveJob(projectId)

  return {
    canUseHeyGen,
    missingKey,
    // La escena elegida dentro de la tarea en curso (en cola o generándose).
    rendering: rendering[scene.id],
    // El estado del bloque de la escena: el panel dice lo mismo que la pista.
    state: avatarSceneState(scene, rendering),
    action,
    sceneCost: action ? avatarScenesCost([scene]) : null,
    pendingScenes: avatarScenesToRender(scenes, rendering),
    ...confirmation,
    requestConfirmation,
    // null = la escena no tiene la sección «Movimiento».
    motion: motionShown ? { value: motionDraft, onChange: changeMotion } : null,
    cancelRender,
  }
}
