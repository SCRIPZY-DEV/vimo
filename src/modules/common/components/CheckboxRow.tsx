interface CheckboxRowProps {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}

// Casilla con etiqueta clickeable. Reutilizada por el editor de video
// (personajes presentes, música instrumental).
export function CheckboxRow({
  label,
  checked,
  disabled = false,
  onChange,
}: CheckboxRowProps) {
  return (
    <label className="flex items-center gap-2 font-body text-sm text-foreground">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-saffron"
      />
      {label}
    </label>
  )
}
