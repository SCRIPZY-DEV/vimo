import { useTranslation } from 'react-i18next'
import { Clapperboard, Link2, Loader2 } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { NO_SEEK_PROPS } from '@/modules/videos/constants'
import { useAnimationProgress } from '@/modules/videos/hooks/useAnimationProgress'
import { sceneImageSource } from '@/modules/videos/utilities/sceneImageSource'
import { formatSlotSeconds } from '@/modules/videos/utilities/formatSlotSeconds'
import type {
  SceneAnimationActivity,
  SceneAnimationProgress,
} from '@/modules/videos/types/library'
import type { SceneDetail } from '@pipeline/types/video-project.ts'
import type { EditorSceneImageStatus } from '@/modules/videos/types/library'

interface TimelineSceneItemProps {
  scene: SceneDetail
  selected: boolean
  // Estado transitorio del store (cola/regen); undefined = el del disco.
  transientStatus: EditorSceneImageStatus | undefined
  // Último fallo de regeneración (clave i18n): velo rojo persistente + title.
  errorKey: string | undefined
  // Animación en curso (ADR-0047), su avance y el último fallo (clave i18n).
  animationActivity: SceneAnimationActivity | undefined
  animationProgress: SceneAnimationProgress | undefined
  animationErrorKey: string | undefined
  // El clip de la escena seleccionada la absorbería: se anticipa con un
  // borde punteado celeste antes de pagar (ADR-0041).
  planned: boolean
  version: number | undefined
  onSelect(): void
}

// Bloque de una escena en la pista de video. El padre lo posiciona en
// absoluto según la duración de la escena. Una escena animada (la que
// encabeza el clip o una absorbida por él) lleva borde celeste SIEMPRE, con
// selección o sin ella. El hover y la selección usan un borde blanco; el
// icono de animación conserva la diferencia con las escenas estáticas.
export function TimelineSceneItem({
  scene,
  selected,
  transientStatus,
  errorKey,
  animationActivity,
  animationProgress,
  animationErrorKey,
  planned,
  version,
  onSelect,
}: TimelineSceneItemProps) {
  const { t, i18n } = useTranslation()

  const preparing = transientStatus === 'preparing'
  const regenerating = transientStatus === 'generating'
  const awaitingSync = transientStatus === 'awaiting_sync'
  const queued = transientStatus === 'pending' || awaitingSync
  const imageStatus = transientStatus ?? scene.imageStatus
  const animating = animationActivity === 'generating'
  const percent = useAnimationProgress(
    animating ? animationProgress : undefined,
  )
  // Un ready recién importado gana al detail todavía sin refetchear.
  const failed = imageStatus === 'error' || errorKey !== undefined
  const animationFailed =
    animationActivity === 'error' || animationErrorKey !== undefined
  // Regenerando gana sobre el error: el velo rojo espera a que termine.
  const showErrorVeil =
    (failed || animationFailed) &&
    !preparing &&
    !regenerating &&
    !queued &&
    !animating
  const leadsClip = scene.animation?.status === 'ready'
  const absorbed = scene.absorbedBy !== undefined
  const animated = leadsClip || absorbed
  // El borde celeste también mientras el clip se está haciendo.
  const clipBorder = animated || animating
  const title = errorKey
    ? t('library.editor.panel.lastError', { reason: t(errorKey) })
    : animationErrorKey
      ? t('library.editor.panel.animation.lastError', {
          reason: t(animationErrorKey),
        })
      : leadsClip
        ? t('library.editor.panel.animation.ready', {
            count: scene.animation?.sceneIds.length ?? 1,
            ids: scene.animation?.sceneIds.join(', ') ?? '',
            seconds: formatSlotSeconds(
              scene.animation?.slotSeconds ?? 0,
              i18n.resolvedLanguage ?? 'es',
            ),
          })
        : absorbed
          ? t('library.editor.panel.animation.absorbed', {
              id: scene.absorbedBy,
            })
          : undefined

  const borderClass = () => {
    if (selected)
      return 'border-white shadow-[0_0_0_1px_rgb(15_23_42/0.22)] brightness-110'
    if (clipBorder)
      return 'border-sky/70 hover:border-white hover:brightness-110'
    return 'border-border/60 hover:border-white'
  }

  return (
    <button
      type="button"
      {...NO_SEEK_PROPS}
      title={title}
      onClick={onSelect}
      className={cn(
        'absolute inset-x-0 bottom-1 top-1 overflow-hidden rounded-md border-[3px] outline-none transition-[border-color,box-shadow,filter] duration-150 focus-visible:border-white focus-visible:ring-2 focus-visible:ring-blue-500',
        borderClass(),
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
            imageStatus === 'pending' && 'opacity-50 blur-[1px]',
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

      {animated && (
        <span
          aria-hidden
          className="absolute right-1 top-0.5 flex h-4 w-4 items-center justify-center rounded bg-sky text-white"
        >
          {leadsClip ? (
            <Clapperboard className="h-2.5 w-2.5" />
          ) : (
            <Link2 className="h-2.5 w-2.5" />
          )}
        </span>
      )}

      {planned && !animated && !animating && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[4px] border-2 border-dashed border-sky/80 bg-sky/10"
        />
      )}

      {showErrorVeil && (
        <span aria-hidden className="absolute inset-0 bg-destructive/40" />
      )}
      {queued && !animating && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-[10px] font-semibold text-white">
          {t(awaitingSync ? 'extension.awaitingSync' : 'extension.queued')}
        </span>
      )}
      {preparing && (
        <span className="absolute inset-0 flex items-center justify-center gap-1 bg-black/60 text-[10px] font-semibold text-white">
          <Loader2 aria-hidden className="h-3 w-3 animate-spin" />
          {t('library.editor.preparingImage')}
        </span>
      )}
      {regenerating && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/70">
          <Loader2 className="h-5 w-5 animate-spin text-saffron" />
        </span>
      )}
      {animating && !regenerating && (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-black/70">
          <Loader2 className="h-5 w-5 animate-spin text-sky" />
          {percent !== undefined && (
            <span className="font-display text-[10px] font-bold tabular-nums text-white">
              {t('library.editor.timeline.animatingPercent', { percent })}
            </span>
          )}
        </span>
      )}
    </button>
  )
}
