import type { ReactNode } from 'react'
import { cn } from '@/modules/common/utilities/cn'

interface SelectableCardProps {
  selected: boolean
  disabled: boolean
  onClick: () => void
  className?: string
  children: ReactNode
}

export function SelectableCard({
  selected,
  disabled,
  onClick,
  className,
  children,
}: SelectableCardProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'rounded-xl border-2 bg-card p-3 transition-colors',
        selected
          ? 'border-saffron bg-saffron/10'
          : 'border-border hover:border-saffron/40',
        disabled && 'pointer-events-none opacity-60',
        className,
      )}
    >
      {children}
    </button>
  )
}
