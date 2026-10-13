import { useLayoutEffect, useRef } from 'react'
import { AVATAR_CARD_FIRST_CONTROL_SELECTORS } from '@/modules/videos/constants'

// El foco de la tarjeta de una aparición del avatar en la vista ampliada al
// desplegarse y al plegarse (entrega 2g, §23.4), con las referencias que
// necesita: la tarjeta, el contenedor de las acciones, «Ajustar avatar» (plegada)
// y «Cerrar» (desplegada). Al desplegar va al primer control de las acciones
// (la región del avance si la escena se está generando, o el «−» de la
// duración, o el primer botón, campo o interruptor; a «Cerrar» si no hay
// ninguno) y la tarjeta entra entera en la vista. Al plegar con «Cerrar», a
// «Ajustar avatar» (`markClosedByPerson`): si otra tarjeta la pliega al
// desplegarse, no le roba el foco. Es un efecto de layout: corre antes de que
// el navegador le saque el foco al botón que se va (ERRORES-CONOCIDOS: foco-
// que-cae-en-body-al-desmontarse-el-nodo-enfocado-y-la-limpieza-de-
// useeffect-llega-tarde) y antes de que el FocusScope de Radix, al ver un nodo
// quitado con el foco en `body`, se lo lleve a la caja del diálogo.
export function useAvatarCardFocus(expanded: boolean) {
  const cardRef = useRef<HTMLElement>(null)
  const actionsRef = useRef<HTMLDivElement>(null)
  const expandRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const wasExpandedRef = useRef(expanded)
  // «Cerrar» lo pidió la persona: el foco vuelve a «Ajustar avatar».
  const closedByPersonRef = useRef(false)

  useLayoutEffect(() => {
    const wasExpanded = wasExpandedRef.current
    wasExpandedRef.current = expanded

    if (expanded && !wasExpanded) {
      // El primer control de las acciones (no «Cerrar», que va antes en el
      // orden del documento).
      const actions = actionsRef.current
      const first =
        actions?.querySelector<HTMLElement>('[role="region"]') ??
        firstControlOf(actions) ??
        closeRef.current
      first?.focus({ preventScroll: true })
      cardRef.current?.scrollIntoView({ block: 'nearest' })
      return
    }

    if (!expanded && wasExpanded && closedByPersonRef.current) {
      closedByPersonRef.current = false
      expandRef.current?.focus({ preventScroll: true })
    }
  })

  return {
    cardRef,
    actionsRef,
    expandRef,
    closeRef,
    markClosedByPerson() {
      closedByPersonRef.current = true
    },
  }
}

// El primer control de las acciones que ya tienen los selectores de
// AVATAR_CARD_FIRST_CONTROL_SELECTORS, probados en orden.
function firstControlOf(actions: HTMLElement | null): HTMLElement | null {
  if (!actions) return null

  for (const selector of AVATAR_CARD_FIRST_CONTROL_SELECTORS) {
    const control = actions.querySelector<HTMLElement>(selector)
    if (control) return control
  }

  return null
}
