import { useTranslation } from 'react-i18next'
import { Coins } from 'lucide-react'
import { formatUsd } from '@/modules/common/utilities/formatUsd'

interface LookPriceBadgeProps {
  // Lo que cuesta «Crear escenario», en dólares.
  amount: number
  // Para que quien la muestra se describa con ella (la ficha «Crear
  // escenario»).
  id?: string
}

// El precio de «Crear escenario» como insignia: la misma de «Crear desde
// foto», una moneda y el monto con el formato del idioma activo (entrega 2g,
// §23.5). La usan el diálogo, junto a lo que se descuenta, y la ficha de los
// looks, debajo de su título. Presentacional.
export function LookPriceBadge({ amount, id }: LookPriceBadgeProps) {
  const { i18n } = useTranslation()

  return (
    <span
      id={id}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border-2 border-saffron/50 bg-saffron/15 px-3 py-1 font-display text-sm font-extrabold tabular-nums text-foreground"
    >
      <Coins aria-hidden className="h-4 w-4" />
      {formatUsd(amount, i18n.resolvedLanguage ?? 'es')}
    </span>
  )
}
