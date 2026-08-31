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
  // marca. `priceUsd` agrega el precio por imagen al lado de la etiqueta y
  // `note` una línea descriptiva SOLO en el desplegable (el trigger queda en
  // etiqueta + precio).
  options: { id: T; label: string; priceUsd?: number; note?: string }[]
  disabled: boolean
  onChange: (value: T) => void
  className?: string
}

function PriceTag({ priceUsd }: { priceUsd: number }) {
  return (
    <span className="font-mono text-xs tabular-nums text-saffron">
      ${priceUsd.toFixed(4)}
    </span>
  )
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
        {/* El line-clamp-1 del trigger común (display -webkit-box) rompe el
            span flex de etiqueta + precio y trunca a mitad de palabra. */}
        <SelectTrigger className="[&>span]:line-clamp-none">
          <SelectValue>
            {selected && (
              <span className="flex items-center gap-2 whitespace-nowrap">
                {selected.label}
                {selected.priceUsd !== undefined && (
                  <PriceTag priceUsd={selected.priceUsd} />
                )}
              </span>
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
              <span className="flex w-full min-w-0 items-center justify-between gap-6">
                <span>{option.label}</span>
                {option.priceUsd !== undefined && (
                  <PriceTag priceUsd={option.priceUsd} />
                )}
              </span>
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
