import { useTranslation } from 'react-i18next'
import { AlertTriangle, Check, Loader2 } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { formatTime } from '@/modules/common/utilities/formatTime'
import { SceneThumbnail } from '@/modules/videos/components/SceneThumbnail'
import { AVATAR_RENDER_PHASE_KEYS } from '@/modules/videos/constants'
import {
  avatarElapsedSeconds,
  avatarRowStatus,
} from '@/modules/videos/utilities/avatarTaskEvents'
import { errorKeyOf } from '@/modules/videos/utilities/errorKeyOf'
import { formatSecondsShort } from '@/modules/videos/utilities/formatElapsed'
import type { SceneView } from '@/modules/videos/types/create'

interface PipelineAvatarRowProps {
  scene: SceneView
  index: number
  total: number
  now: number
}

// Una aparición del avatar en la pantalla de progreso: su imagen fija (la
// vista previa del look, que el sidecar le pone a la escena), «Avatar n/m»,
// el tramo, en qué va el render y cuánto lleva. Presentacional.
export function PipelineAvatarRow({
  scene,
  index,
  total,
  now,
}: PipelineAvatarRowProps) {
  const { t } = useTranslation()
  const status = avatarRowStatus(scene)
  const activity = scene.avatarActivity
  const elapsed = activity
    ? Math.floor(avatarElapsedSeconds(activity, now))
    : null

  const statusText = () => {
    if (status === 'generating')
      return t(AVATAR_RENDER_PHASE_KEYS[activity?.phase ?? 'audio'])

    if (status === 'ready') return t('create.progress.avatarReady')

    if (status === 'failed') {
      return t('create.progress.avatarFailed', {
        reason: t(errorKeyOf(activity?.code ?? scene.avatar?.errorCode)),
      })
    }

    return t('create.progress.avatarQueued')
  }

  return (
    <li className="flex items-center gap-3 rounded-xl border border-amethyst/30 bg-card p-2">
      <div className="h-12 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
        <SceneThumbnail scene={scene} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display text-sm font-bold text-foreground">
          {t('create.progress.avatarItem', { index, total })}
        </p>
        <p className="font-mono text-xs text-muted-foreground">
          {formatTime(scene.startSeconds ?? 0)} –{' '}
          {formatTime(scene.endSeconds ?? 0)}
        </p>
      </div>
      <div className="min-w-0 max-w-[55%] text-right">
        <p
          className={cn(
            'flex items-center justify-end gap-1.5 font-body text-xs',
            status === 'failed' ? 'text-coral-text' : 'text-foreground',
          )}
        >
          {status === 'generating' && (
            <Loader2
              aria-hidden
              className="h-3.5 w-3.5 animate-spin text-amethyst"
            />
          )}
          {status === 'ready' && (
            <Check aria-hidden className="h-3.5 w-3.5 text-amethyst" />
          )}
          {status === 'failed' && (
            <AlertTriangle aria-hidden className="h-3.5 w-3.5" />
          )}
          <span className="line-clamp-2">{statusText()}</span>
        </p>
        {elapsed !== null && (
          <time
            dateTime={`PT${elapsed}S`}
            className="font-mono text-xs tabular-nums text-muted-foreground"
          >
            {formatSecondsShort(elapsed)}
          </time>
        )}
      </div>
    </li>
  )
}
