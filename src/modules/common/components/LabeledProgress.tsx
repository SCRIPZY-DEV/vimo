import type { ReactNode } from 'react'
import { ProgressBar } from '@/modules/common/components/ProgressBar'
import { cn } from '@/modules/common/utilities/cn'

interface LabeledProgressProps {
  label: ReactNode
  percent: number
  className?: string
}

export function LabeledProgress({
  label,
  percent,
  className,
}: LabeledProgressProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between font-body text-sm text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">{Math.round(percent)}%</span>
      </div>
      <ProgressBar percent={percent} />
    </div>
  )
}
