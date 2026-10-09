import { useTranslation } from 'react-i18next'
import { motion, useReducedMotion } from 'framer-motion'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import type { AvatarLibraryStatus } from '@pipeline/types/avatar.ts'

interface AvatarTrainingStatusProps {
  status: AvatarLibraryStatus
  className?: string
}

// Cómo va el entrenamiento de un avatar: mientras entrena, el aviso, una barra
// indeterminada y que se puede seguir usando Vimo; si falló, el motivo. Un
// avatar listo no muestra nada. Ningún texto nombra al proveedor: es Vimo el
// que entrena (pedido del dueño, 2026-10-09). Presentacional.
export function AvatarTrainingStatus({
  status,
  className,
}: AvatarTrainingStatusProps) {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()

  if (status === 'ready') return null

  if (status === 'failed') {
    return (
      <p
        role="status"
        className={cn(
          'flex items-start gap-1.5 font-body text-xs leading-snug text-destructive',
          className,
        )}
      >
        <AlertCircle aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
        {t('avatars.status.failed')}
      </p>
    )
  }

  return (
    <div role="status" className={cn('space-y-1.5', className)}>
      <p className="font-display text-xs font-semibold text-foreground">
        {t('avatars.status.processing')}
      </p>
      {/* Con «reducir movimiento» la barra late en su lugar en vez de
          recorrer la pista. */}
      <div
        aria-hidden
        className="relative h-1 overflow-hidden rounded-full bg-saffron/15"
      >
        {reduceMotion ? (
          <div className="absolute inset-0 animate-pulse rounded-full bg-saffron/60" />
        ) : (
          <motion.div
            className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-gradient-to-r from-saffron/0 via-saffron to-saffron/0"
            initial={{ x: '-100%' }}
            animate={{ x: '250%' }}
            transition={{ duration: 1.6, ease: 'easeInOut', repeat: Infinity }}
          />
        )}
      </div>
      <p className="font-body text-[11px] leading-snug text-muted-foreground">
        {t('avatars.status.processingHint')}
      </p>
    </div>
  )
}
