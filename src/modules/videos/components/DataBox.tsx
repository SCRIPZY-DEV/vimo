interface DataBoxProps {
  label: string
  value: string
}

// Celda etiqueta + valor para grillas de datos compactas (p. ej. la
// duración / palabras / escenas sugeridas del diálogo de confirmación).
export function DataBox({ label, value }: DataBoxProps) {
  return (
    <div className="text-center">
      <p className="font-body text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="font-display text-sm font-bold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  )
}
