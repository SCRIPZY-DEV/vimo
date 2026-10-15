import { useEffect, useRef, useState } from 'react'

// El visor cambia de tamaño en el mismo árbol. Llevarlo a un segundo player
// o cambiar su portal desmontaría los medios y perdería reloj y reproducción.
export function useExpandedPreview() {
  const [expanded, setExpanded] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!expanded) return
    const container = containerRef.current
    if (!container) return
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    toggleRef.current?.focus()
    const focusable = () =>
      Array.from(
        container.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), [tabindex="0"]',
        ),
      ).filter((element) => element.getClientRects().length > 0)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setExpanded(false)
      } else if (event.key === 'Tab') {
        const elements = focusable()
        const first = elements[0]
        const last = elements.at(-1)
        if (!first || !last) return
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            !container.contains(document.activeElement))
        ) {
          event.preventDefault()
          last.focus()
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            !container.contains(document.activeElement))
        ) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    // Captura antes de los atajos del editor: Escape cierra el visor sin
    // deseleccionar una escena detrás del modal.
    document.addEventListener('keydown', onKeyDown, true)
    const onFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !container.contains(event.target))
        toggleRef.current?.focus()
    }
    document.addEventListener('focusin', onFocus)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('focusin', onFocus)
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [expanded])

  return {
    expanded,
    containerRef,
    toggleRef,
    toggle: () => setExpanded((current) => !current),
    close: () => setExpanded(false),
  }
}
