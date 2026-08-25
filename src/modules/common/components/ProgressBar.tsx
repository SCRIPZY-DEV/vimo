import { cn } from '@/modules/common/utilities/cn'

interface ProgressBarProps {
  percent: number
  // Piso del relleno: con un mínimo > 0 se ve un hilo de color al arrancar.
  minPercent?: number
  className?: string
}

export function ProgressBar({
  percent,
  minPercent = 0,
  className,
}: ProgressBarProps) {
  const width = Math.min(100, Math.max(minPercent, percent))

  return (
    <div className={cn('h-2 overflow-hidden rounded-full bg-muted', className)}>
      <div
        className="h-full rounded-full bg-saffron transition-all"
        style={{ width: `${width}%` }}
      />
    </div>
  )
}
