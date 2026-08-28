import type { ReactNode } from 'react'

interface ErrorMessageProps {
  children: ReactNode
}

// Caja de error en línea (texto ya traducido).
export function ErrorMessage({ children }: ErrorMessageProps) {
  return (
    <p
      role="alert"
      className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 font-body text-sm text-destructive"
    >
      {children}
    </p>
  )
}
