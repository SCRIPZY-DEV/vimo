import type { KeyboardEvent, MouseEvent } from 'react'

// Guardas del menú de eliminar un avatar (`AvatarDeleteMenu`, entregas 2c y
// 2d): cada paso —abrir las opciones, «Eliminar de la lista», «Eliminar
// permanentemente de HeyGen» y «Seguro»— pide un gesto deliberado propio.
// `ignoreHeldKey` también la usan las confirmaciones del avatar del editor
// (videos: «Generar» y «Cancelar» de la confirmación y «Cancelar» del avance).

// Para el `onKeyDown` de sus botones. Una tecla sostenida repite su keydown y,
// en un botón, cada Enter repetido es otro clic (con `detail` 0, como uno
// suelto): el primero abría las opciones o pedía «Seguro» y el siguiente
// confirmaba sin soltar la tecla. Las repeticiones no hacen nada; soltar y
// volver a apretar, sí. Espacio solo cliquea al soltar, pero sus repeticiones
// tampoco hacen nada.
export function ignoreHeldKey(event: KeyboardEvent) {
  if (event.repeat) event.preventDefault()
}

// Para los clics del menú y de las tarjetas que lo montan: el segundo clic de
// un doble clic (`detail` 2 o más) cae sobre lo que el primero acaba de
// cambiar («Seguro» es el mismo botón que «Eliminar permanentemente de
// HeyGen»; tras «Eliminar de la lista», la imagen de la tarjeta o la vecina
// que ocupó su lugar) y no tiene que confirmar, deshacer ni abrir nada. Un
// clic suelto llega con `detail` 1; Enter y Espacio, con 0.
export function isSecondClickOfDoubleClick(event: MouseEvent) {
  return event.detail > 1
}
