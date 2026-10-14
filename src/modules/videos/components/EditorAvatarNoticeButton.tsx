import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { useFocusHandoffOnUnmount } from '@/modules/videos/hooks/useFocusHandoffOnUnmount'

interface EditorAvatarNoticeButtonProps {
  // Cuántas apariciones pide: las que cuenta el aviso.
  count: number
  disabled: boolean
  onOpen(opener: HTMLButtonElement): void
  // Adonde va el foco si estaba en el botón cuando desaparece.
  focusFallback(): HTMLElement | null
}

// «Regenerarlas (N)» del aviso de arriba del editor
// (EditorAvatarFallbackNotice): abre la confirmación de costo y saldo. Al
// terminar la tarea el foco vuelve acá con la cuenta de antes de releer el
// proyecto; si la relectura trae listas todas las que contaba, el aviso y el
// botón se van, y el foco pasa a `focusFallback` en vez de caer en `body` (M2
// de la revisión del WP-Q). Presentacional.
export function EditorAvatarNoticeButton({
  count,
  disabled,
  onOpen,
  focusFallback,
}: EditorAvatarNoticeButtonProps) {
  const { t } = useTranslation()
  const buttonRef = useRef<HTMLButtonElement>(null)
  useFocusHandoffOnUnmount(buttonRef, focusFallback)

  return (
    <Button
      ref={buttonRef}
      type="button"
      size="sm"
      variant="outline"
      disabled={disabled}
      onClick={(event) => onOpen(event.currentTarget)}
      className="rounded-lg border-coral/40 font-display font-bold"
    >
      <RefreshCw aria-hidden className="h-3.5 w-3.5" />
      {t('library.editor.avatar.regenerarAviso', { count })}
    </Button>
  )
}
