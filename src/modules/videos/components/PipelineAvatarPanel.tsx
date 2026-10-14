import { useTranslation } from 'react-i18next'
import { UserRound } from 'lucide-react'
import { PipelineAvatarRow } from '@/modules/videos/components/PipelineAvatarRow'
import { AVATAR_PROGRESS_TICK_MS } from '@/modules/videos/constants'
import { useNow } from '@/modules/videos/hooks/useNow'
import { avatarRowStatus } from '@/modules/videos/utilities/avatarTaskEvents'
import type { SceneView } from '@/modules/videos/types/create'

interface PipelineAvatarPanelProps {
  scenes: SceneView[]
  // Apariciones que no entraron en la narración (`avatar-planned`).
  dropped: number
  // La fase corre ahora: el reloj de cada render avanza solo.
  active: boolean
}

// El panel de la fase `avatar` en la pantalla de progreso (spec §8): una fila
// por aparición, «Avatar 2/3», con la fase del render y su tiempo, que corre
// entre una consulta a HeyGen y la siguiente para que nada parezca colgado.
// Presentacional, con su propio tick (como ElapsedTimer).
export function PipelineAvatarPanel({
  scenes,
  dropped,
  active,
}: PipelineAvatarPanelProps) {
  const { t } = useTranslation()
  const now = useNow(active, AVATAR_PROGRESS_TICK_MS)
  const avatarScenes = scenes.filter((scene) => scene.avatar !== undefined)
  const readyCount = avatarScenes.filter(
    (scene) => avatarRowStatus(scene) === 'ready',
  ).length

  return (
    <section className="space-y-3 rounded-2xl border-2 border-amethyst/40 bg-amethyst/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <UserRound className="h-5 w-5 text-amethyst" />
          {t('create.stages.avatar')}
        </h2>
        <span
          role="status"
          className="font-display text-sm font-bold tabular-nums text-amethyst"
        >
          {t('create.progress.avatarCount', {
            ready: readyCount,
            total: avatarScenes.length,
          })}
        </span>
      </div>
      {active && (
        <p className="font-body text-xs text-muted-foreground">
          {t('create.progress.avatarHint')}
        </p>
      )}
      {dropped > 0 && (
        <p className="font-body text-xs text-coral-text">
          {t('create.progress.avatarDropped', { count: dropped })}
        </p>
      )}
      <ul className="space-y-2">
        {avatarScenes.map((scene, index) => (
          <PipelineAvatarRow
            key={scene.id}
            scene={scene}
            index={index + 1}
            total={avatarScenes.length}
            now={now}
          />
        ))}
      </ul>
    </section>
  )
}
