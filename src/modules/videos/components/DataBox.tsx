interface DataBoxProps {
  label: string
  value: string
}

// Celda etiqueta + valor para grillas de datos compactas (la duración /
// palabras / escenas sugeridas del diálogo de confirmación). Port de DatoBox
// del origen.
export function DataBox({ label, value }: DataBoxProps) {
  return (
    <div className="text-center">
      <p className="font-display text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-base font-bold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  )
}
