import { useEffect, useRef } from 'react'

// Si la última interacción fue con el teclado (y no con el mouse, el trackpad
// o el dedo), para mover el foco por código solo cuando la persona navega con
// el teclado: con el mouse, un foco movido deja «activa» la tarjeta que lo
// recibe (velo y video) aunque el puntero esté en otro lado. Escucha en
// `window` y en captura: la tecla o el clic quedan anotados antes de que corra
// el manejador que mueve el foco (Radix escucha Escape en `document`). Hasta
// la primera interacción cuenta como mouse: no se mueve un foco que no se sabe
// pedido con el teclado.
export function useLastInputWasKeyboard() {
  const keyboardRef = useRef(false)

  useEffect(() => {
    const markKeyboard = () => {
      keyboardRef.current = true
    }
    const markPointer = () => {
      keyboardRef.current = false
    }
    window.addEventListener('keydown', markKeyboard, true)
    window.addEventListener('pointerdown', markPointer, true)

    return () => {
      window.removeEventListener('keydown', markKeyboard, true)
      window.removeEventListener('pointerdown', markPointer, true)
    }
  }, [])

  return () => keyboardRef.current
}
