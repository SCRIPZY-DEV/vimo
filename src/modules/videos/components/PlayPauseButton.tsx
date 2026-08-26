import { useTranslation } from 'react-i18next'
import { Pause, Play } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'

interface PlayPauseButtonProps {
  playing: boolean
  onClick(): void
  className?: string
  iconClassName?: string
}

// Botón play/pause compartido por los reproductores del módulo. El aspecto
// lo decide cada player vía className; acá solo viven el ícono y el aria.
export function PlayPauseButton({
  playing,
  onClick,
  className,
  iconClassName = 'h-4 w-4',
}: PlayPauseButtonProps) {
  const { t } = useTranslation()

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={
        playing ? t('library.player.pause') : t('library.player.play')
      }
      className={cn('inline-flex items-center justify-center', className)}
    >
      {playing ? (
        <Pause className={iconClassName} />
      ) : (
        <Play className={cn(iconClassName, 'ml-0.5')} />
      )}
    </button>
  )
}
