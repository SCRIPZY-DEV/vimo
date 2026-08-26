interface SliderRowProps {
  id: string
  label: string
  min: number
  max: number
  step: number
  value: number
  disabled: boolean
  onChange: (value: number) => void
  // Cómo mostrar el valor a la derecha; por defecto, el número crudo.
  formatValue?: (value: number) => string
}

// Fila de ajuste numérico (etiqueta + range + valor) reutilizada por los
// paneles de ajustes de voz y la mezcla de audio del editor.
export function SliderRow({
  id,
  label,
  min,
  max,
  step,
  value,
  disabled,
  onChange,
  formatValue = String,
}: SliderRowProps) {
  return (
    <div className="flex items-center gap-3">
      <label
        htmlFor={id}
        className="w-28 shrink-0 font-body text-sm text-muted-foreground"
      >
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 min-w-0 flex-1 cursor-pointer accent-saffron"
      />
      <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
        {formatValue(value)}
      </span>
    </div>
  )
}
