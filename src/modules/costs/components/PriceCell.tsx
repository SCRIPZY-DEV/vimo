import { cn } from '@/modules/common/utilities/cn'

/**
 * Celda monoespaciada que formatea precios USD con tooltip opcional.
 * Los decimales escalan con la magnitud: 7 para precios por carácter
 * (ej. $0.0000119, que redondeado a 4 sería $0.0000), 4 si < $0.01,
 * 3 si < $1 y 2 para el resto.
 */
export function PriceCell({
  usd,
  highlighted,
  tooltip,
  className,
}: {
  usd: number
  highlighted?: boolean
  tooltip?: string
  className?: string
}) {
  const formatted =
    usd === 0
      ? '$0.00'
      : usd < 0.0001
        ? `$${usd.toFixed(7)}`
        : usd < 0.01
          ? `$${usd.toFixed(4)}`
          : usd < 1
            ? `$${usd.toFixed(3)}`
            : `$${usd.toFixed(2)}`
  return (
    <span
      title={tooltip}
      className={cn(
        'font-mono text-sm tabular-nums',
        highlighted ? 'font-bold text-saffron' : 'text-foreground',
        className,
      )}
    >
      {formatted}
    </span>
  )
}
