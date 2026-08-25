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
  // marca.
  options: { id: T; label: string }[]
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
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="font-display">{label}</Label>
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(selected) => onChange(selected as T)}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
