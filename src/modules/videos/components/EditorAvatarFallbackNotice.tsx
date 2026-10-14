import { useLayoutEffect, useRef } from 'react'
import { useHeyGenAccess } from '@/modules/avatars/hooks/useHeyGenAccess'
import { AvatarFallbackNote } from '@/modules/videos/components/AvatarFallbackNote'
import { EditorAvatarConfirmDialog } from '@/modules/videos/components/EditorAvatarConfirmDialog'
import { EditorAvatarNoticeButton } from '@/modules/videos/components/EditorAvatarNoticeButton'
import { useAvatarRenderConfirmation } from '@/modules/videos/hooks/useAvatarRenderConfirmation'
import { useConfirmationFocus } from '@/modules/videos/hooks/useConfirmationFocus'
import { useLibraryEditorTask } from '@/modules/videos/hooks/useLibraryEditorTask'
import { EDITOR_SCENE_PANEL_ID } from '@/modules/videos/constants'
import { editorFallbackSceneIds } from '@/modules/videos/utilities/avatarRegeneration'
import type { SceneDetail } from '@pipeline/types/video-project.ts'

interface EditorAvatarFallbackNoticeProps {
  projectId: string
  scenes: SceneDetail[]
  // Otra tarea del proyecto (o un guardado) en curso: el botón espera.
  busy: boolean
  // Proyecto demo: no se genera nada.
  locked: boolean
}

// Arriba del editor, el aviso de las apariciones del avatar que salen con la
// imagen fija del look (entrega 2d, I1 de la revisión de WP-P): Crear salta al
// editor sin exportar y, sin esto, el aviso no se veía. Cuenta las que dice la
// regla única, `isAvatarFallback(escena, 'project')` (una planeada, una
// fallida o una lista sin clip; una desactualizada no, y tiene su propio aviso
// en la pista y su «Regenerar» en el panel), con tramo, como las que el panel
// puede pedir (editorFallbackSceneIds). Lo dice con el texto del editor, sin
// el «podés regenerarlas desde el editor» que acá sería circular. Su botón,
// «Regenerarlas (N)», pide exactamente esas escenas y N es ese mismo número
// (re-revisión de WP-P, F2 y F3); no dice «Regenerar todos» para no
// confundirse con el del panel, que también pide las desactualizadas (M4 de
// la revisión del WP-Q). Usa la misma confirmación de costo y saldo del
// panel. Se cuenta como en el disco: mientras se generan, el aviso y su botón
// siguen a la vista, apagado como los demás. Sin la clave del avatar
// presentador, el aviso sin acción.
export function EditorAvatarFallbackNotice({
  projectId,
  scenes,
  busy,
  locked,
}: EditorAvatarFallbackNoticeProps) {
  const { canUseHeyGen } = useHeyGenAccess()
  const editorTask = useLibraryEditorTask(projectId)
  const avatarRender = useAvatarRenderConfirmation({ projectId, scenes })
  // El foco de la confirmación; al arrancar va al aviso, que sigue a la vista
  // mientras las apariciones se generan.
  const focus = useConfirmationFocus()
  const noticeRef = useRef<HTMLDivElement>(null)
  const panelElement = () => document.getElementById(EDITOR_SCENE_PANEL_ID)

  const fallbackIds = editorFallbackSceneIds(scenes)
  const count = fallbackIds.length
  const confirmation = avatarRender.confirmation

  // El foco que quedó en el aviso no cae en `body` (M2 de la revisión del
  // WP-Q): al terminar la tarea vuelve al botón que abrió la confirmación si
  // sigue montado (quedaron apariciones con la imagen fija) o al panel; si el
  // aviso se queda sin nada que contar con el foco encima mientras la tarea
  // corre (la relectura las trajo listas), al panel. De layout: corre antes de
  // que el navegador le saque el foco al aviso que se esconde. Si el foco ya
  // estaba en el botón cuando se va, lo pasa el botón
  // (EditorAvatarNoticeButton).
  const running = Boolean(editorTask.task?.avatarRender)
  const wasRunningRef = useRef(running)
  useLayoutEffect(() => {
    const finished = wasRunningRef.current && !running
    wasRunningRef.current = running
    if (!finished && count > 0) return

    if (!noticeRef.current?.contains(document.activeElement)) return

    const target = focus.mountedOpener() ?? panelElement()
    target?.focus()
  })

  const action =
    canUseHeyGen && count > 0 ? (
      <EditorAvatarNoticeButton
        count={count}
        disabled={busy || locked}
        onOpen={(opener) => {
          focus.rememberOpener(opener)
          avatarRender.requestConfirmation(fallbackIds)
        }}
        focusFallback={panelElement}
      />
    ) : undefined

  const confirm = async () => {
    focus.afterConfirm(await avatarRender.confirm())
  }

  return (
    <div ref={noticeRef} tabIndex={-1} className="outline-none empty:hidden">
      <AvatarFallbackNote
        count={count}
        messageKey="library.editor.avatar.fallbackNote"
        action={action}
      />

      <EditorAvatarConfirmDialog
        confirmation={confirmation}
        cancelRef={focus.cancelRef}
        onConfirm={() => void confirm()}
        onCancel={avatarRender.dismissConfirmation}
        onCloseAutoFocus={(event) =>
          focus.focusAfterClose(event, () => noticeRef.current)
        }
      />
    </div>
  )
}
