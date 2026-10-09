import type { ReactNode } from 'react'

export type ErrorBoundaryProps = {
  children: ReactNode
  /** Cambiar este valor resetea el error (se usa con la ruta actual). */
  resetKey?: string
  /**
   * Salida extra en el fallback, junto a «Probar de nuevo» (p. ej. volver a
   * la biblioteca cuando la pantalla no tiene menú lateral).
   */
  action?: ReactNode
}

export type ErrorBoundaryState = {
  error: Error | null
}

export type ErrorFallbackProps = {
  error: Error
  action?: ReactNode
  onRetry: () => void
}
