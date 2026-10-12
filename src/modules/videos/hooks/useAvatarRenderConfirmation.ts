import { useRef, useState } from 'react'
import { useAvatarBalance } from '@/modules/avatars/hooks/useAvatarBalance'
import { useCostCheck } from '@/modules/videos/hooks/useCostCheck'
import { useLibraryEditorTask } from '@/modules/videos/hooks/useLibraryEditorTask'
import { avatarScenesCost } from '@/modules/videos/utilities/avatarRegeneration'
import type { SceneDetail } from '@pipeline/types/video-project.ts'

interface UseAvatarRenderConfirmationOptions {
  projectId: string
  // Todas las escenas del proyecto: de ahí salen las que se confirman.
  scenes: SceneDetail[]
}

// La confirmación de pagar el avatar de unas escenas desde el editor (entrega
// 2d, spec §20): la del panel de la escena y la del aviso de las apariciones
// con la imagen fija, que es la misma. Cuántas, el costo de Crear
// (avatarScenesCost) y el saldo de avatares con el mismo pre-check
// (useCostCheck); al confirmar se relee la billetera (`verify`) y, si ya no
// alcanza, no se pide nada. La tarea corre en el store del editor
// (useLibraryEditorTask.startAvatarRender).
export function useAvatarRenderConfirmation({
  projectId,
  scenes,
}: UseAvatarRenderConfirmationOptions) {
  const editorTask = useLibraryEditorTask(projectId)

  // Las escenas a confirmar: con ellas abierta la confirmación.
  const [confirmingIds, setConfirmingIds] = useState<number[] | null>(null)
  const [checking, setChecking] = useState(false)
  // Candado del doble clic en el mismo tick (el estado llega con el render).
  const checkingRef = useRef(false)

  const confirmingScenes = confirmingIds
    ? scenes.filter((item) => confirmingIds.includes(item.id))
    : []
  const cost = confirmingIds ? avatarScenesCost(confirmingScenes) : null
  // Solo con la confirmación abierta se pide el saldo (cada lectura levanta
  // un proceso): sin la línea del avatar, useCostCheck no consulta nada.
  const check = useCostCheck({
    estimates: cost ? [cost] : [],
    voiceVendor: null,
  })
  const balance = useAvatarBalance({ enabled: confirmingIds !== null })

  const requestConfirmation = (sceneIds: number[]) => {
    if (sceneIds.length === 0) return

    setConfirmingIds(sceneIds)
  }

  // Mientras se relee el saldo la confirmación no se cierra: si se cerrara,
  // la lectura en vuelo arrancaría igual un pago que la persona descartó.
  const dismissConfirmation = () => {
    if (checkingRef.current) return

    setConfirmingIds(null)
  }

  // Relee el saldo y, si alcanza, arranca la tarea y cierra. Si el saldo ya
  // no alcanza, la confirmación sigue abierta con el aviso y no se pidió
  // nada. Un clic mientras se relee no hace nada.
  const confirm = async () => {
    if (!confirmingIds || checkingRef.current) return 'skipped'

    checkingRef.current = true
    setChecking(true)
    try {
      const fresh = await check.verify()
      if (fresh.blocking) return 'blocked'

      const started = editorTask.startAvatarRender(projectId, confirmingIds)
      setConfirmingIds(null)
      return started ? 'started' : 'skipped'
    } finally {
      checkingRef.current = false
      setChecking(false)
    }
  }

  const confirmation = confirmingIds
    ? {
        count: confirmingIds.length,
        cost,
        balance: balance.status,
        insufficient: check.result.blocking,
        checking,
      }
    : null

  return {
    confirmation,
    requestConfirmation,
    dismissConfirmation,
    confirm,
  }
}
