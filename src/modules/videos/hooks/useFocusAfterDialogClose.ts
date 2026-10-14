import { useEffect, useLayoutEffect, useRef } from 'react'

// Un diálogo modal de Radix que se abre por estado, sin `Trigger`, no devuelve
// el foco al cerrarse: su `onCloseAutoFocus` anula el retorno por defecto y
// solo enfoca el `Trigger`, así que el foco queda en `body` (ERRORES-
// CONOCIDOS: radix-dialogo-modal-que-cierra-y-desmonta-la-ficha-que-lo-abrio-
// pierde-el-foco-y-enfocar-desde-el-manejador-no-sirve). Si el componente del
// diálogo no deja pasar su propio `onCloseAutoFocus` (el aviso de «Cancelar»
// con apariciones cobradas), este hook lo resuelve desde afuera: al pasar
// `open` de true a false, el foco va a `target()` (a nada, si no hay destino).
//
// Tiene que ser un efecto pasivo y no el manejador del botón: con el diálogo
// todavía abierto, la trampa de foco de Radix devuelve el foco adentro. En el
// commit que lo cierra, la limpieza del efecto de la trampa (`trapped` pasa a
// false) corre antes que los efectos de montaje, entre ellos este. El destino
// se lee al cerrar, no al abrir: la región que lo abrió puede haberse ido. Sin
// scroll (`preventScroll`): devolver el foco no es traer algo a la vista.
export function useFocusAfterDialogClose(
  open: boolean,
  target: () => HTMLElement | null,
) {
  const targetRef = useRef(target)
  const wasOpenRef = useRef(false)

  useLayoutEffect(() => {
    targetRef.current = target
  })

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true
      return
    }

    if (!wasOpenRef.current) return

    wasOpenRef.current = false
    targetRef.current()?.focus({ preventScroll: true })
  }, [open])
}
