import { Loader2 } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'

interface ViewSpinnerProps {
  className?: string
}

// Spinner centrado para el estado de carga de una vista o sección.
export function ViewSpinner({ className }: ViewSpinnerProps) {
  return (
    <p className={cn('py-16 text-center', className)}>
      <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
    </p>
  )
}
