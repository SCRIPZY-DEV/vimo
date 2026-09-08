import { Label } from '@/modules/common/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/modules/common/ui/select'
import { cn } from '@/modules/common/utilities/cn'

interface LabeledSelectProps<T extends string> {
  label: string
  // Radix admite sin selección; en el form llega así cuando el campo es
  // opcional en el contrato del pipeline.
  value: T | undefined
  // Ya traducidas: el Select no sabe si la etiqueta sale del catálogo o es una
  // marca. `note` agrega una línea descriptiva SOLO en el desplegable (el
  // trigger queda solo en la etiqueta).
  options: { id: T; label: string; note?: string }[]
  disabled: boolean
  onChange: (value: T) => void
  className?: string
}

export function LabeledSelect<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
  className,
}: LabeledSelectProps<T>) {
  const selected = options.find((option) => option.id === value)

  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="font-display">{label}</Label>
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(selectedId) => onChange(selectedId as T)}
      >
        {/* La etiqueta ocupa el ancho libre para truncarse con puntos
            suspensivos en una ventana angosta (el line-clamp-1 del trigger
            común cortaba a mitad de palabra). El `text-left` es necesario: el
            trigger es un <button>, que centra su texto por defecto. */}
        <SelectTrigger className="[&>span]:line-clamp-none [&>span]:min-w-0 [&>span]:flex-1">
          <SelectValue>
            {selected && (
              <span className="block truncate text-left">{selected.label}</span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem
              key={option.id}
              value={option.id}
              textValue={option.label}
            >
              <span className="block">{option.label}</span>
              {option.note && (
                <span className="mt-0.5 block font-body text-xs font-normal text-muted-foreground">
                  {option.note}
                </span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
