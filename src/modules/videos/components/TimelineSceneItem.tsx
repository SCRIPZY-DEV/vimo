import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { NO_SEEK_PROPS } from '@/modules/videos/constants'
import { sceneImageSource } from '@/modules/videos/utilities/sceneImageSource'
import type { SceneDetail } from '@pipeline/types/video-project.ts'
import type { SceneImageStatus } from '@pipeline/types/scenes.ts'

interface TimelineSceneItemProps {
  scene: SceneDetail
  selected: boolean
  // Estado transitorio del store (cola/regen); undefined = el del disco.
  transientStatus: SceneImageStatus | undefined
  // Último fallo de regeneración (clave i18n): velo rojo persistente + title.
  errorKey: string | undefined
  version: number | undefined
  onSelect(): void
}

// Bloque de una escena en la pista de video. El padre lo posiciona en
// absoluto según la duración de la escena.
export function TimelineSceneItem({
  scene,
  selected,
  transientStatus,
  errorKey,
  version,
  onSelect,
}: TimelineSceneItemProps) {
  const { t } = useTranslation()

  const regenerating = transientStatus === 'generating'
  const failed =
    transientStatus === 'error' ||
    errorKey !== undefined ||
    scene.imageStatus === 'error'
  // Regenerando gana sobre el error: el velo rojo espera a que termine.
  const showErrorVeil = failed && !regenerating
  const title = errorKey
    ? t('library.editor.panel.lastError', { reason: t(errorKey) })
    : undefined

  return (
    <button
      type="button"
      {...NO_SEEK_PROPS}
      title={title}
      onClick={onSelect}
      className={cn(
        'absolute inset-x-0 bottom-1 top-1 overflow-hidden rounded-md border-2 transition-shadow',
        selected
          ? 'border-saffron shadow-[0_0_0_2px_hsl(var(--saffron)/0.3)]'
          : 'border-border/60 hover:border-saffron/40',
      )}
    >
      {scene.imagePath ? (
        <img
          src={sceneImageSource(scene, version)}
          alt=""
          loading="lazy"
          draggable={false}
          className={cn(
            'h-full w-full object-cover',
            scene.imageStatus === 'pending' && 'opacity-50 blur-[1px]',
          )}
        />
      ) : (
        <span className="block h-full w-full bg-gradient-to-br from-muted to-muted/60" />
      )}

      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 to-transparent"
      />

      <span className="absolute left-1 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded bg-charcoal/80 px-1 font-display text-[10px] font-bold tabular-nums text-white">
        {scene.id}
      </span>

      {showErrorVeil && (
        <span aria-hidden className="absolute inset-0 bg-destructive/40" />
      )}
      {regenerating && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/70">
          <Loader2 className="h-5 w-5 animate-spin text-saffron" />
        </span>
      )}
    </button>
  )
}
