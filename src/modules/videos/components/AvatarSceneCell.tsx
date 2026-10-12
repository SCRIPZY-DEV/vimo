import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { AlertTriangle, Check, History, Loader2, UserRound } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { SceneCellOverlay } from '@/modules/videos/components/SceneCellOverlay'
import {
  AVATAR_CARD_STATUS_KEYS,
  AVATAR_PROGRESS_TICK_MS,
} from '@/modules/videos/constants'
import { useNow } from '@/modules/videos/hooks/useNow'
import { avatarActivityPercent } from '@/modules/videos/utilities/avatarActivityPercent'
import { avatarRowStatus } from '@/modules/videos/utilities/avatarTaskEvents'
import { aspectClass } from '@/modules/videos/utilities/videoFormat'
import type { VideoFormat } from '@pipeline/types/video-format.ts'
import type { SceneView } from '@/modules/videos/types/create'

interface AvatarSceneCellProps {
  scene: SceneView
  videoFormat: VideoFormat
}

// Una aparición del avatar en la grilla «Imágenes» (entrega 2e, diseño §21.5).
// Llega del sidecar con la foto del look como imagen, así que sin tarjeta
// propia se vería como una imagen más: acá es una tarjeta morada con el ícono
// del avatar, del mismo tamaño y con el mismo número y tramo que una imagen
// (SceneCellOverlay), y su estado, sin imagen y sin «Ampliar». Presentacional,
// con su propio tick (como PipelineAvatarPanel): cada tarjeta corre su reloj
// solo mientras su aparición se genera, así la grilla entera (con sus imágenes
// y el visor «Ampliar») no se repinta cada segundo.
export function AvatarSceneCell({ scene, videoFormat }: AvatarSceneCellProps) {
  const { t } = useTranslation()
  const status = avatarRowStatus(scene)
  const now = useNow(status === 'generating', AVATAR_PROGRESS_TICK_MS)
  const percent = avatarActivityPercent(scene.avatarActivity, now)
  const statusLabel = t(AVATAR_CARD_STATUS_KEYS[status])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      role="group"
      aria-label={t('create.progress.avatarCardAria', {
        index: scene.id,
        status: statusLabel,
      })}
      className={cn(
        'relative overflow-hidden rounded-xl border-2 border-amethyst/60 bg-amethyst/10',
        aspectClass(videoFormat),
      )}
    >
      {/* `pb-6`: el bloque centrado sube un poco para no pisar la franja de
          tiempos de abajo en las tarjetas 16:9, como en una imagen. */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-2 pb-6">
        <div className="flex items-center gap-1.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amethyst/15 text-amethyst">
            <UserRound aria-hidden className="h-4 w-4" />
          </span>
          <span className="font-display text-xs font-bold text-foreground">
            {t('create.progress.avatarCardLabel')}
          </span>
        </div>

        <p
          className={cn(
            'flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-center font-body text-[11px] leading-4',
            status === 'failed' ? 'text-coral-text' : 'text-foreground',
          )}
        >
          {status === 'generating' && (
            <Loader2
              aria-hidden
              className="h-3.5 w-3.5 shrink-0 animate-spin text-amethyst"
            />
          )}
          {status === 'ready' && (
            <Check aria-hidden className="h-3.5 w-3.5 shrink-0 text-amethyst" />
          )}
          {status === 'failed' && (
            <AlertTriangle aria-hidden className="h-3.5 w-3.5 shrink-0" />
          )}
          {status === 'stale' && (
            <History
              aria-hidden
              className="h-3.5 w-3.5 shrink-0 text-saffron"
            />
          )}
          <span>{statusLabel}</span>
          {percent !== null && (
            <span
              role="img"
              aria-label={t('create.progress.avatarPercentAria', { percent })}
              className="font-mono tabular-nums"
            >
              {t('create.progress.avatarPercent', { percent })}
            </span>
          )}
        </p>
      </div>

      <SceneCellOverlay scene={scene} />
    </motion.div>
  )
}
