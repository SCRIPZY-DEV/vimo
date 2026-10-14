import { useCallback, useRef, useState } from 'react'

// El estado del menú de eliminar un avatar (`AvatarDeleteMenu`, entrega 2d):
// si está abierto, si ya pide la confirmación de HeyGen y sus dos extremos (el
// botón y el panel de opciones), para cerrarlo sin perder el foco. Lo crea
// quien monta el menú —la tarjeta de la biblioteca, el panel del avatar o la
// tarjeta de «Mis avatares»—, que también lo cierra cuando la persona sale de
// la tarjeta o la toca.
export function useAvatarDeleteMenu() {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Cierra y, si el foco estaba en una opción, antes lo devuelve al botón: la
  // opción se oculta, y un foco que queda en un elemento oculto queda en el
  // aire (dentro de un diálogo de Radix, en su caja). Sin desplazar la grilla,
  // como todo foco del menú. En el blur no mueve nada: el foco ya está yendo a
  // otro lado. Estable: lo usa el efecto que escucha Escape.
  const close = useCallback(() => {
    if (panelRef.current?.contains(document.activeElement))
      triggerRef.current?.focus({ preventScroll: true })
    setOpen(false)
    setConfirming(false)
  }, [])

  const toggle = () => {
    if (open) {
      close()
      return
    }

    setOpen(true)
  }

  // «Eliminar permanentemente de HeyGen» pasa a pedir «Seguro».
  const askConfirmation = () => setConfirming(true)

  return {
    open,
    confirming,
    triggerRef,
    panelRef,
    toggle,
    close,
    askConfirmation,
  }
}

export type AvatarDeleteMenuState = ReturnType<typeof useAvatarDeleteMenu>
