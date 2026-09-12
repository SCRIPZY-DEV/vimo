import { Tabs, TabsList, TabsTrigger } from '@/modules/common/ui/tabs'

export interface SegmentedTabsOption<TId extends string> {
  id: TId
  label: string
  // Aclaración corta al lado del título, en cuerpo chico («cara idéntica»).
  hint?: string
}

interface SegmentedTabsProps<TId extends string> {
  value: TId
  options: SegmentedTabsOption<TId>[]
  ariaLabel: string
  disabled?: boolean
  onChange: (value: TId) => void
}

// Control segmentado a lo ancho: la opción activa en saffron pleno con el
// texto oscuro, las otras apagadas sobre la pista gris (port de las
// sub-pestañas del modal de personajes del origen). Presentacional.
export function SegmentedTabs<TId extends string>({
  value,
  options,
  ariaLabel,
  disabled = false,
  onChange,
}: SegmentedTabsProps<TId>) {
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as TId)}>
      <TabsList
        aria-label={ariaLabel}
        className="flex h-auto w-full gap-1.5 rounded-lg bg-muted/40 p-1"
      >
        {options.map((option) => (
          <TabsTrigger
            key={option.id}
            value={option.id}
            disabled={disabled}
            className="flex-1 rounded-md px-3 py-2 font-display text-sm font-bold text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-saffron data-[state=active]:text-charcoal data-[state=active]:shadow-sm"
          >
            {option.label}
            {option.hint && (
              <>
                {' '}
                ·
                <span className="ml-1 font-body text-[11px] font-normal">
                  {option.hint}
                </span>
              </>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
