import { useRef, useState } from 'react'

// El reproductor abierto desde una grilla de fichas de looks (el segundo
// nivel del stock y el panel de un avatar): qué look está abierto y adónde
// vuelve el foco al cerrarlo, su ficha, que se busca por `data-look-id` en la
// grilla (`gridRef`) al abrir.
export function useOpenLook<TGrid extends HTMLElement>() {
  const [openLookId, setOpenLookId] = useState<string | null>(null)
  const gridRef = useRef<TGrid>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  const open = (lookId: string) => {
    returnFocusRef.current =
      gridRef.current?.querySelector<HTMLElement>(
        `[data-look-id="${CSS.escape(lookId)}"]`,
      ) ?? null
    setOpenLookId(lookId)
  }

  const close = () => setOpenLookId(null)

  // Cierra solo si sigue abierto ese look: una respuesta tardía no cierra el
  // reproductor de otro.
  const closeIfOpen = (lookId: string) =>
    setOpenLookId((current) => (current === lookId ? null : current))

  return { openLookId, gridRef, returnFocusRef, open, close, closeIfOpen }
}
