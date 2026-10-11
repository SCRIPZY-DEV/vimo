import { useTranslation } from 'react-i18next'
import { UserRound } from 'lucide-react'

interface AvatarDroppedNoteProps {
  // Apariciones pedidas que no entraron en la narración.
  dropped: number
  // Ninguna entró: el video sale sin avatar (la fase se saltea).
  noneFit: boolean
}

// La nota de la pantalla de progreso cuando apariciones del avatar no
// entraron en la narración (spec §5: lo que no cabe se informa), debajo de las
// fases, pegada a la fila del avatar. Va también cuando no entró ninguna y la
// fase se saltea: ahí el panel del avatar nunca aparece. Presentacional.
export function AvatarDroppedNote({
  dropped,
  noneFit,
}: AvatarDroppedNoteProps) {
  const { t } = useTranslation()

  return (
    <p className="flex items-start gap-2 rounded-lg border border-coral/40 bg-coral/10 p-3 font-body text-sm text-foreground">
      <UserRound aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-coral" />
      <span>
        {noneFit
          ? t('create.progress.avatarNoneFit', { count: dropped })
          : t('create.progress.avatarDropped', { count: dropped })}
      </span>
    </p>
  )
}
