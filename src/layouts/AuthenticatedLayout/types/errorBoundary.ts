import type { ReactNode } from 'react'

export type ErrorBoundaryProps = {
  children: ReactNode
  /** Cambiar este valor resetea el error (se usa con la ruta actual). */
  resetKey?: string
}

export type ErrorBoundaryState = {
  error: Error | null
}

export type ErrorFallbackProps = {
  error: Error
  onRetry: () => void
}
