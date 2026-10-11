import type { KeyboardEvent, MouseEvent } from 'react'

// Guardas de los borrados en dos pasos del módulo (eliminar de HeyGen, quitar
// de la biblioteca): el primer gesto arma la confirmación y solo un segundo
// gesto deliberado la confirma.

// Para el `onKeyDown` de sus botones. Una tecla sostenida repite su keydown y,
// en un botón, cada Enter repetido es otro clic (con `detail` 0, como uno
// suelto): el primero armaba la confirmación y el siguiente la confirmaba sin
// soltar la tecla. Las repeticiones no hacen nada; soltar y volver a apretar,
// sí. Espacio solo cliquea al soltar, pero sus repeticiones tampoco hacen nada.
export function ignoreHeldKey(event: KeyboardEvent) {
  if (event.repeat) event.preventDefault()
}

// Para el clic que confirma: el segundo clic de un doble clic (`detail` 2 o
// más) cae sobre el botón que el primero acaba de armar y no tiene que
// confirmar. Un clic suelto llega con `detail` 1; Enter y Espacio, con 0.
export function isSecondClickOfDoubleClick(event: MouseEvent): boolean {
  return event.detail > 1
}
