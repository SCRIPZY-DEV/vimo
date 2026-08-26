import { useTranslation } from 'react-i18next'
import { Volume2, VolumeX } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'

interface MuteButtonProps {
  muted: boolean
  onClick(): void
  className?: string
  iconClassName?: string
}

// Botón de silencio compartido por los reproductores del módulo.
export function MuteButton({
  muted,
  onClick,
  className,
  iconClassName = 'h-4 w-4',
}: MuteButtonProps) {
  const { t } = useTranslation()

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={muted ? t('library.player.unmute') : t('library.player.mute')}
      className={cn('inline-flex items-center justify-center', className)}
    >
      {muted ? (
        <VolumeX className={iconClassName} />
      ) : (
        <Volume2 className={iconClassName} />
      )}
    </button>
  )
}
