import { useRef, useState } from 'react'
import { useAvatarBalance } from '@/modules/avatars/hooks/useAvatarBalance'
import { useCostCheck } from '@/modules/videos/hooks/useCostCheck'
import { useLibraryEditorTask } from '@/modules/videos/hooks/useLibraryEditorTask'
import { avatarScenesCost } from '@/modules/videos/utilities/avatarRegeneration'
import type {
  AvatarRenderRequest,
  AvatarRenderRequestOptions,
} from '@/modules/videos/types/library'
import type { SceneDetail } from '@pipeline/types/video-project.ts'

interface UseAvatarRenderConfirmationOptions {
  projectId: string
  // Todas las escenas del proyecto: de ahí salen las que se confirman.
  scenes: SceneDetail[]
}

// La confirmación de pagar el avatar de unas escenas desde el editor (entrega
// 2d, spec §20): la del panel de la escena y la del aviso de las apariciones
// con la imagen fija, que es la misma. Cuántas, el costo de Crear
// (avatarScenesCost, al motor de cada escena desde la entrega 2e) y el saldo
// de avatares con el mismo pre-check (useCostCheck); al confirmar se relee la
// billetera (`verify`) y, si ya no alcanza, no se pide nada. Desde la entrega
// 2e el pedido lleva además lo que el panel le sume (las listas que se
// regeneran y el movimiento, §21.4): se guarda con la confirmación abierta y
// viaja tal cual al pagar. La tarea corre en el store del editor
// (useLibraryEditorTask.startAvatarRender).
export function useAvatarRenderConfirmation({
  projectId,
  scenes,
}: UseAvatarRenderConfirmationOptions) {
  const editorTask = useLibraryEditorTask(projectId)

  // El pedido a confirmar: con él, abierta la confirmación.
  const [request, setRequest] = useState<AvatarRenderRequest | null>(null)
  const [checking, setChecking] = useState(false)
  // Candado del doble clic en el mismo tick (el estado llega con el render).
  const checkingRef = useRef(false)

  const confirmingScenes = request
    ? scenes.filter((item) => request.sceneIds.includes(item.id))
    : []
  const cost = request ? avatarScenesCost(confirmingScenes) : null
  // Solo con la confirmación abierta se pide el saldo (cada lectura levanta
  // un proceso): sin la línea del avatar, useCostCheck no consulta nada.
  const check = useCostCheck({
    estimates: cost ? [cost] : [],
    voiceVendor: null,
  })
  const balance = useAvatarBalance({ enabled: request !== null })

  const requestConfirmation = (
    sceneIds: number[],
    options: AvatarRenderRequestOptions = {},
  ) => {
    if (sceneIds.length === 0) return

    setRequest({ ...options, sceneIds })
  }

  // Mientras se relee el saldo la confirmación no se cierra: si se cerrara,
  // la lectura en vuelo arrancaría igual un pago que la persona descartó.
  const dismissConfirmation = () => {
    if (checkingRef.current) return

    setRequest(null)
  }

  // Relee el saldo y, si alcanza, arranca la tarea y cierra. Si el saldo ya
  // no alcanza, la confirmación sigue abierta con el aviso y no se pidió
  // nada. Un clic mientras se relee no hace nada.
  const confirm = async () => {
    if (!request || checkingRef.current) return 'skipped'

    checkingRef.current = true
    setChecking(true)
    try {
      const fresh = await check.verify()
      if (fresh.blocking) return 'blocked'

      const { sceneIds, ...options } = request
      const started = editorTask.startAvatarRender(projectId, sceneIds, options)
      setRequest(null)
      return started ? 'started' : 'skipped'
    } finally {
      checkingRef.current = false
      setChecking(false)
    }
  }

  const confirmation = request
    ? {
        count: request.sceneIds.length,
        cost,
        balance: balance.status,
        insufficient: check.result.blocking,
        checking,
        retake: (request.regenerateSceneIds ?? []).length > 0,
      }
    : null

  return {
    confirmation,
    requestConfirmation,
    dismissConfirmation,
    confirm,
  }
}
