import { useRef } from 'react'
import type { AvatarConfirmOutcome } from '@/modules/videos/types/library'

// El foco de una confirmación modal de Radix que se abre por estado, sin
// `Trigger` (la de pagar el avatar en el editor, entrega 2d): el modal le
// devuelve el foco SOLO a su `Trigger`, así que sin esto queda en `body` al
// cerrarse (ERRORES-CONOCIDOS: radix-dialogo-modal-que-cierra-y-desmonta-la-
// ficha-que-lo-abrio-pierde-el-foco-y-enfocar-desde-el-manejador-no-sirve).
// Cerrar sin confirmar vuelve al botón que la abrió; confirmar y arrancar va
// al destino que da quien la usa (ese botón queda deshabilitado mientras la
// tarea corre; nunca a un botón que una tecla sostenida pueda volver a
// apretar); un saldo que ya no alcanza deja el foco en «Cancelar», adentro
// del diálogo, porque confirmar se apaga con el foco encima. Un clic que no
// hizo nada no mueve el foco.
export function useConfirmationFocus() {
  const openerRef = useRef<HTMLButtonElement | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const startedRef = useRef(false)

  const rememberOpener = (opener: HTMLButtonElement) => {
    openerRef.current = opener
  }

  const afterConfirm = (outcome: AvatarConfirmOutcome) => {
    if (outcome === 'started') {
      startedRef.current = true
      return
    }

    if (outcome === 'blocked') cancelRef.current?.focus()
  }

  // El botón que abrió la confirmación, si sigue montado: adonde vuelve el
  // foco cuando la tarea termina (si no, al panel).
  const mountedOpener = () => {
    const opener = openerRef.current
    if (!opener?.isConnected) return null

    return opener
  }

  // Para el `onCloseAutoFocus` del diálogo; `afterStart` da el destino cuando
  // la tarea arrancó.
  const focusAfterClose = (
    event: Event,
    afterStart: () => HTMLElement | null,
  ) => {
    event.preventDefault()
    if (!startedRef.current) {
      openerRef.current?.focus()
      return
    }

    startedRef.current = false
    afterStart()?.focus()
  }

  return {
    cancelRef,
    rememberOpener,
    afterConfirm,
    focusAfterClose,
    mountedOpener,
  }
}
