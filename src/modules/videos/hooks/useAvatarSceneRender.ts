import { useHeyGenAccess } from '@/modules/avatars/hooks/useHeyGenAccess'
import { useAvatarRenderConfirmation } from '@/modules/videos/hooks/useAvatarRenderConfirmation'
import { useLibraryEditorTask } from '@/modules/videos/hooks/useLibraryEditorTask'
import {
  avatarSceneAction,
  avatarScenesCost,
  avatarSceneState,
  avatarScenesToRender,
} from '@/modules/videos/utilities/avatarRegeneration'
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
// (useAvatarRenderConfirmation).
export function useAvatarSceneRender({
  projectId,
  scene,
  scenes,
}: UseAvatarSceneRenderOptions) {
  const editorTask = useLibraryEditorTask(projectId)
  const { canUseHeyGen, missingKey } = useHeyGenAccess()
  const confirmation = useAvatarRenderConfirmation({ projectId, scenes })

  const rendering = editorTask.task?.sceneAvatarRendering ?? {}
  const action = avatarSceneAction(scene, rendering)

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
    cancelRender,
  }
}
