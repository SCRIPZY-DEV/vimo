import { useRef, useState } from 'react'
import { formatClipTime } from '@/modules/videos/utilities/formatClipTime'
import { parseClipTime } from '@/modules/videos/utilities/parseClipTime'

interface ClipTimeFieldProps {
  // «In:» / «Out:».
  label: string
  // aria-label (y title) del botón y del campo de edición.
  editLabel: string
  seconds: number
  // Solo las fronteras compartidas con otra escena se pueden mover: el In
  // de la primera escena y el Out de la última son fijos.
  editable: boolean
  onCommit(seconds: number): void
}

// Tiempo de entrada o salida del clip en el panel de escena. Si es editable,
// el tiempo es un botón: al tocarlo aparece un campo con el mismo formato
// (mm:ss.cc; también «m:ss», «ss.c» o «ss»). Enter o salir del campo (clic
// en otro lado o en otra escena) aplican; Escape descarta. Un texto que no
// es un tiempo, o el mismo tiempo que ya tenía, no hace nada.
export function ClipTimeField({
  label,
  editLabel,
  seconds,
  editable,
  onCommit,
}: ClipTimeFieldProps) {
  // null = mostrando; string = el texto que se está tipeando.
  const [draft, setDraft] = useState<string | null>(null)
  // Enter cierra el campo, y el blur que sigue al desmontarlo volvería a
  // aplicar el mismo texto: cada sesión de edición se cierra una sola vez.
  const closedRef = useRef(false)
  const time = formatClipTime(seconds)

  const startEditing = () => {
    closedRef.current = false
    setDraft(time)
  }

  const closeEditing = (apply: boolean) => {
    if (closedRef.current || draft === null) return
    closedRef.current = true
    setDraft(null)
    if (!apply) return

    const parsed = parseClipTime(draft)
    if (parsed === null || formatClipTime(parsed) === time) return
    onCommit(parsed)
  }

  const value = () => {
    if (draft !== null)
      return (
        <input
          type="text"
          inputMode="decimal"
          autoFocus
          value={draft}
          aria-label={editLabel}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => closeEditing(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              closeEditing(true)
              return
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              closeEditing(false)
            }
          }}
          className="w-[11ch] rounded-md border border-input bg-background px-1 py-0.5 font-mono text-xs tabular-nums text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      )

    if (!editable)
      return (
        <span className="font-mono tabular-nums text-muted-foreground">
          {time}
        </span>
      )

    return (
      <button
        type="button"
        aria-label={editLabel}
        title={editLabel}
        onClick={startEditing}
        className="rounded font-mono tabular-nums text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {time}
      </button>
    )
  }

  return (
    <span className="flex items-center gap-1">
      <span className="font-display font-bold text-foreground">{label}</span>
      {value()}
    </span>
  )
}
