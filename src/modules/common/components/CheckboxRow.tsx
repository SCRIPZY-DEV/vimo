interface CheckboxRowProps {
  label: string
  checked: boolean
  disabled?: boolean
  // Los ids (separados por espacios) de lo que describe a la casilla y vive
  // fuera de su etiqueta: avisos o ayudas. Va tal cual a `aria-describedby`
  // del `input`; sin ids (ausente o vacío), el atributo no se pone.
  describedBy?: string
  onChange: (checked: boolean) => void
}

// Casilla con etiqueta clickeable. Reutilizada por el editor de video
// (personajes presentes, música instrumental) y por las casillas de la tarjeta
// del avatar en Crear.
export function CheckboxRow({
  label,
  checked,
  disabled = false,
  describedBy,
  onChange,
}: CheckboxRowProps) {
  return (
    <label className="flex items-center gap-2 font-body text-sm text-foreground">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-describedby={describedBy || undefined}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-saffron"
      />
      {label}
    </label>
  )
}
