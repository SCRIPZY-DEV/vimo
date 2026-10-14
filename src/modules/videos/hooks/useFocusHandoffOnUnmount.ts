import { useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'

// Si el foco está adentro de `region` cuando el componente se desmonta, lo
// pasa a `fallback()` antes de que el nodo salga del documento: sin esto cae
// en `body` (el avance del avatar en el panel, que desaparece al terminar o
// cancelar la tarea; M2 de la revisión del WP-Q). La limpieza de un efecto de
// layout corre antes de que React saque los nodos del componente; la de uno
// pasivo, después, cuando el foco ya se perdió.
export function useFocusHandoffOnUnmount(
  regionRef: RefObject<HTMLElement | null>,
  fallback: () => HTMLElement | null,
) {
  // El destino vigente al desmontar, no el del primer render.
  const fallbackRef = useRef(fallback)
  useLayoutEffect(() => {
    fallbackRef.current = fallback
  })

  useLayoutEffect(() => {
    const region = regionRef.current
    const target = fallbackRef

    return () => {
      if (!region?.contains(document.activeElement)) return

      target.current()?.focus()
    }
  }, [regionRef])
}
