import { Skeleton } from '@/modules/common/ui/skeleton'
import { STOCK_GRID_CLASS } from '@/modules/avatars/constants'

interface StockGridSkeletonProps {
  count: number
}

// Mientras carga una grilla del stock (avatares o looks): las mismas fichas
// que van a llegar, con la misma grilla, en gris animado (imagen vertical, el
// nombre y una línea más corta). Presentacional.
export function StockGridSkeleton({ count }: StockGridSkeletonProps) {
  const slots = Array.from({ length: count }, (_, index) => `slot-${index}`)

  return (
    <ul aria-hidden className={STOCK_GRID_CLASS}>
      {slots.map((slot) => (
        <li key={slot} className="space-y-2.5">
          <Skeleton className="aspect-[4/5] w-full rounded-2xl bg-muted-foreground/10" />
          <Skeleton className="h-3.5 w-2/3 rounded-full bg-muted-foreground/10" />
          <Skeleton className="h-3 w-1/3 rounded-full bg-muted-foreground/10" />
        </li>
      ))}
    </ul>
  )
}
