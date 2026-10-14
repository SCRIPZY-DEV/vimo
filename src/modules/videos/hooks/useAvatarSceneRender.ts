import { useState } from 'react'
import { useHeyGenAccess } from '@/modules/avatars/hooks/useHeyGenAccess'
import { clamp } from '@/modules/common/utilities/clamp'
import { useAvatarRenderConfirmation } from '@/modules/videos/hooks/useAvatarRenderConfirmation'
import { useAvatarSceneTrim } from '@/modules/videos/hooks/useAvatarSceneTrim'
import { useLibraryEditorTask } from '@/modules/videos/hooks/useLibraryEditorTask'
import {
  avatarDurationAction,
  avatarDurationContext,
} from '@/modules/videos/utilities/avatarDuration'
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
  AvatarDurationContext,
  AvatarDurationControl,
  AvatarDurationEdit,
} from '@/modules/videos/types/avatarDuration'
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
//
// Desde la entrega 2g (§23.3) la escena también elige su duración
// (`duration`): un borrador de segundos enteros dentro de los límites del
// lugar (avatarDurationContext), que arranca en la duración de hoy
// redondeada y, como el del movimiento, vale mientras la duración real de la
// escena no cambie. Qué hace la acción principal con él (`durationAction`):
// la misma duración, las acciones de siempre; una más corta con el clip listo
// y al día y sin cambios en el movimiento, recortar el clip (`trim`, gratis y
// sin confirmación); y todo lo demás, un render nuevo que lleva `durations`
// en el pedido (también con «Regenerar todos» si incluye la escena). Con una
// duración nueva el render es del trozo nuevo de la narración, no «la misma
// parte»: el pedido no lleva `regenerateSceneIds` (la confirmación dice
// «Generar», no «Regenerar», y pedir la misma duración otra vez cosecha el
// render ya pago en vez de cobrar una toma nueva). Una escena de V que traía
// «más expresivo» guardado lo conserva (R-2g-20): no tiene el interruptor, así
// que el borrador sigue con la marca y solo viaja si cambia el prompt
// (avatarMotionInput).
//
// Un render del editor no se puede cancelar: con solo confirmar «Regenerar»
// HeyGen ya cobra, así que el avance no ofrece «Cancelar» (se quitó junto con
// el aviso de apariciones cobradas de la entrega 2h, §24.4).
export function useAvatarSceneRender({
  projectId,
  scene,
  scenes,
}: UseAvatarSceneRenderOptions) {
  const editorTask = useLibraryEditorTask(projectId)
  const { canUseHeyGen, missingKey } = useHeyGenAccess()
  const confirmation = useAvatarRenderConfirmation({ projectId, scenes })
  const { trim, trimming } = useAvatarSceneTrim(projectId)
  const [motionEdit, setMotionEdit] = useState<AvatarMotionEdit | null>(null)
  const [durationEdit, setDurationEdit] = useState<AvatarDurationEdit | null>(
    null,
  )

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
  // Lo que la persona cambió del movimiento: lo que viaja con un render nuevo
  // y lo que, de estar cambiado, impide recortar (un recorte no paga nada y no
  // lleva el movimiento).
  const motionInput =
    motionShown && avatar
      ? avatarMotionInput(scene.id, avatar, motionDraft)
      : null
  const motionChanged = motionInput !== null

  const changeMotion = (patch: Partial<AvatarMotionDraft>) => {
    setMotionEdit({ base: storedMotion, draft: { ...motionDraft, ...patch } })
  }

  // La duración (§23.3): solo donde hay una acción que ofrecer.
  const durationContext =
    action !== null ? avatarDurationContext(scenes, scene.id) : null
  const duration = durationContext
    ? durationControl(durationContext, durationEdit, scene, setDurationEdit)
    : null
  const durationAction = duration
    ? avatarDurationAction({
        seconds: duration.seconds,
        initialSeconds: duration.initialSeconds,
        ready: action === 'retake',
        motionChanged,
      })
    : 'keep'
  const durationInput =
    duration && durationAction === 'render'
      ? { sceneId: scene.id, seconds: duration.seconds }
      : null

  // Abre la confirmación con lo que viaja además de las escenas: la lista que
  // se vuelve a generar, el movimiento editado y la duración nueva de la
  // escena elegida, solo si la escena va en el pedido. Con una duración nueva
  // no viaja `regenerateSceneIds` (ver arriba).
  const requestConfirmation = (sceneIds: number[]) => {
    if (!sceneIds.includes(scene.id)) {
      confirmation.requestConfirmation(sceneIds)
      return
    }

    confirmation.requestConfirmation(sceneIds, {
      regenerateSceneIds:
        action === 'retake' && !durationInput ? [scene.id] : [],
      motion: motionInput ? [motionInput] : [],
      durations: durationInput ? [durationInput] : [],
    })
  }

  // «Recortar a N s»: gratis y sin confirmación.
  const runTrim = () => {
    if (!duration) return

    trim(scene.id, duration.seconds)
  }

  return {
    canUseHeyGen,
    missingKey,
    // La escena elegida dentro de la tarea en curso (en cola o generándose).
    rendering: rendering[scene.id],
    // El estado del bloque de la escena: el panel dice lo mismo que la pista.
    state: avatarSceneState(scene, rendering),
    action,
    // Lo que cuesta la acción de la escena, con la duración elegida; gratis si
    // se recorta.
    sceneCost:
      action && durationAction !== 'trim'
        ? avatarScenesCost([scene], durationInput ? [durationInput] : [])
        : null,
    pendingScenes: avatarScenesToRender(scenes, rendering),
    ...confirmation,
    requestConfirmation,
    // null = la escena no tiene la sección «Movimiento».
    motion: motionShown ? { value: motionDraft, onChange: changeMotion } : null,
    // null = la escena no ofrece nada que pedir.
    duration,
    durationAction,
    runTrim,
    trimming,
  }
}

// El selector «Duración» de la escena: el valor elegido (acotado a los
// límites; si la duración real de la escena cambió desde que se eligió, el
// borrador no vale y arranca de nuevo) y cómo cambiarlo.
function durationControl(
  context: AvatarDurationContext,
  edit: AvatarDurationEdit | null,
  scene: SceneDetail,
  setEdit: (edit: AvatarDurationEdit) => void,
): AvatarDurationControl {
  const { limits, initialSeconds, lock } = context
  const chosen =
    edit && edit.currentSeconds === limits.currentSeconds
      ? edit.seconds
      : initialSeconds
  const seconds = clamp(chosen, limits.minSeconds, limits.maxSeconds)

  return {
    limits,
    seconds,
    initialSeconds,
    lock,
    // Aproximado: la aparición termina en la pausa más cercana a este punto.
    endSeconds: (scene.startSeconds ?? 0) + seconds,
    onChange: (next) => {
      setEdit({
        currentSeconds: limits.currentSeconds,
        seconds: clamp(next, limits.minSeconds, limits.maxSeconds),
      })
    },
  }
}
