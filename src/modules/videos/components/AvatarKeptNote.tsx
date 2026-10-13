import { useTranslation } from 'react-i18next'
import { UserRound } from 'lucide-react'

interface AvatarKeptNoteProps {
  // Las apariciones del avatar cobradas en la corrida que se cortó
  // (`avatarChargedSceneIds` de la tarea).
  count: number
}

// La línea de una generación cortada con apariciones del avatar ya cobradas
// (entrega 2h, spec §24.2): están pagadas, quedan guardadas y reintentar las
// usa sin pagar de nuevo. Sin ninguna no dice nada. La monta la tarjeta del
// fallo y, debajo de la de saldo agotado, la pantalla de progreso.
// Presentacional.
export function AvatarKeptNote({ count }: AvatarKeptNoteProps) {
  const { t } = useTranslation()
  if (count === 0) return null

  return (
    <p className="flex items-start gap-2 rounded-lg border border-amethyst/40 bg-amethyst/10 p-3 font-body text-sm text-foreground">
      <UserRound
        aria-hidden
        className="mt-0.5 h-4 w-4 shrink-0 text-amethyst"
      />
      <span className="min-w-0 flex-1">
        {t('create.progress.error.avatarKept', { count })}
      </span>
    </p>
  )
}
