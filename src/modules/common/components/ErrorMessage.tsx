import type { ReactNode } from 'react'

interface ErrorMessageProps {
  children: ReactNode
}

// Caja de error en línea (texto ya traducido). El texto va con el token de
// texto de error, legible también en el tema oscuro (main.css).
export function ErrorMessage({ children }: ErrorMessageProps) {
  return (
    <p
      role="alert"
      className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 font-body text-sm text-destructive-text"
    >
      {children}
    </p>
  )
}
