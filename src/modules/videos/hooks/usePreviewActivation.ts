import { useState } from 'react'
import type { FocusEvent } from 'react'
import { useHoverIntent } from '@/modules/avatars/hooks/useHoverIntent'

// Cuándo una tarjeta de Crear con la vista previa de un look «se activa»
// (pasa su video) y cuándo la persona mostró intención de mirarla (para pedir
// el listado de HeyGen): con el mouse quieto encima (`useHoverIntent`: entrar
// o moverse vuelve a contar HOVER_FETCH_DELAY_MS, salir cancela) o con el
// foco visible del teclado, que cuenta al instante. Cruzar la tarjeta camino
// a otra no la activa ni pide nada. La intención no vuelve a apagarse (es la
// de `useHoverIntent`): la segunda vez que el mouse entra, el video arranca
// al entrar, como en la biblioteca.
//
// `containerProps` va en un contenedor de la tarjeta y no en su botón: React
// no le entrega `onMouseEnter`/`onMouseMove` a un `<button disabled>` (y no
// todos los motores le dan los eventos del mouse), así que un botón
// deshabilitado deja pasar el mouse (`disabled:pointer-events-none`) y lo
// escucha el contenedor. `buttonProps` va en el botón.
export function usePreviewActivation() {
  const [hovered, setHovered] = useState(false)
  // El foco que vuelve por código tras un clic no es visible y no activa.
  const [keyboardFocused, setKeyboardFocused] = useState(false)
  const hoverIntent = useHoverIntent()

  return {
    active: (hovered && hoverIntent.hoveredOnce) || keyboardFocused,
    hoveredOnce: hoverIntent.hoveredOnce,
    containerProps: {
      onMouseEnter: () => {
        setHovered(true)
        hoverIntent.pointerMoved()
      },
      onMouseMove: hoverIntent.pointerMoved,
      onMouseLeave: () => {
        setHovered(false)
        hoverIntent.pointerLeft()
      },
    },
    buttonProps: {
      onFocus: (event: FocusEvent<HTMLElement>) => {
        if (!event.currentTarget.matches(':focus-visible')) return

        setKeyboardFocused(true)
        hoverIntent.focusedWithKeyboard()
      },
      onBlur: () => setKeyboardFocused(false),
    },
  }
}
