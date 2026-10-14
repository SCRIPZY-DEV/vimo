import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { UserRound } from 'lucide-react'

interface AvatarFallbackNoteProps {
  // Cuántas apariciones salen con la imagen fija del look. La cuenta la regla
  // única, `avatarFallbackCount` (utilities/avatarFallback.ts), en el
  // contexto de quien monta el aviso: `progress` o `project`.
  count: number
  // El texto, con plural por `count`. Por defecto el que termina en «Podés
  // regenerarlas desde el editor»; el editor pasa el suyo, sin esa frase, que
  // ahí sería circular (re-revisión de WP-P, F2).
  messageKey?: string
  // Una acción al lado del texto, opcional: el editor pone «Regenerarlas (N)».
  action?: ReactNode
}

// El aviso de las apariciones con la imagen fija del look (entrega 2d,
// pregunta 6 del dueño): cuántas no se generaron y que se regeneran desde el
// editor. Lo montan la pantalla de progreso al terminar, el reproductor de la
// biblioteca y el editor, con su acción. Sin ninguna no dice nada (tampoco la
// acción). Presentacional.
export function AvatarFallbackNote({
  count,
  messageKey = 'create.progress.avatarFallback',
  action,
}: AvatarFallbackNoteProps) {
  const { t } = useTranslation()
  if (count === 0) return null

  return (
    <div className="flex items-start gap-2 rounded-lg border border-coral/40 bg-coral/10 p-3">
      <UserRound
        aria-hidden
        className="mt-0.5 h-4 w-4 shrink-0 text-coral-text"
      />
      <p className="min-w-0 flex-1 font-body text-sm text-foreground">
        {t(messageKey, { count })}
      </p>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
