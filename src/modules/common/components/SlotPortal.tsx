import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface SlotPortalProps {
  // Id del hueco que el layout deja en su barra (EDITOR_BAR_SLOT_IDS).
  id: string
  children: ReactNode
}

// Pinta `children` dentro de un hueco del layout (ADR-0056). El hueco es DOM
// externo a este componente y recién existe después del primer commit, así
// que se busca en un efecto; sin hueco no se pinta nada y nada explota.
export function SlotPortal({ id, children }: SlotPortalProps) {
  const [target, setTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    // La regla no distingue este caso: el hueco es DOM externo que solo
    // existe después del commit, y leerlo durante el render daría null.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTarget(document.getElementById(id))
  }, [id])

  if (!target || target.id !== id) return null
  return createPortal(children, target)
}
