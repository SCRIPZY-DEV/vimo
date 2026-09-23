import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Check,
  Square,
  ImageOff,
  Loader2,
  RefreshCw,
  Clapperboard,
} from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { Textarea } from '@/modules/common/ui/textarea'
import { cn } from '@/modules/common/utilities/cn'
import { formatTime } from '@/modules/common/utilities/formatTime'
import {
  LIBRARY_ERROR_MESSAGE_KEYS,
  MAX_USER_PROMPT_CHARS,
  UNKNOWN_CREATE_ERROR_KEY,
} from '@/modules/videos/constants'
import { useAnimationProgress } from '@/modules/videos/hooks/useAnimationProgress'
import { sceneImageSource } from '@/modules/videos/utilities/sceneImageSource'
import type { GalleryActionAvailability } from '@/modules/videos/types/galleryActions'
import type {
  SceneAnimationActivity,
  SceneAnimationFailure,
  SceneAnimationProgress,
} from '@/modules/videos/types/library'
import { sceneAnimationBlocks } from '@pipeline/animation/scene-blocks.ts'
import type { SceneDetail } from '@pipeline/types/video-project.ts'
import type { SceneImageStatus } from '@pipeline/types/scenes.ts'
import type { VideoFormat } from '@pipeline/types/video-format.ts'

interface EditorImageGalleryCardProps {
  scene: SceneDetail
  videoFormat: VideoFormat
  version?: number
  status?: SceneImageStatus
  imageError?: string
  animationActivity?: SceneAnimationActivity
  animationProgress?: SceneAnimationProgress
  animationError?: SceneAnimationFailure
  animationLabel: 'animate' | 'redo' | 'resume'
  imageAvailability: GalleryActionAvailability
  animationAvailability: GalleryActionAvailability
  selected: boolean
  selecting: boolean
  editing: boolean
  focusPrompt: boolean
  description: string
  submitting: boolean
  onSelect(): void
  onEdit(): void
  onCancelEdit(): void
  onDescriptionChange(description: string): void
  onRegenerate(): void
  onAnimate(): void
}

export function EditorImageGalleryCard({
  scene,
  videoFormat,
  version,
  status,
  imageError,
  animationActivity,
  animationProgress,
  animationError,
  animationLabel,
  imageAvailability,
  animationAvailability,
  selected,
  selecting,
  editing,
  focusPrompt,
  description,
  submitting,
  onSelect,
  onEdit,
  onCancelEdit,
  onDescriptionChange,
  onRegenerate,
  onAnimate,
}: EditorImageGalleryCardProps) {
  const { t } = useTranslation()
  const source = sceneImageSource(scene, version)
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const unavailable = !source || source === failedSource
  const imageStatus = status ?? scene.imageStatus
  const generating = imageStatus === 'generating'
  const failed = !generating && (imageStatus === 'error' || Boolean(imageError))
  const animating = animationActivity === 'generating'
  const percent = useAnimationProgress(
    animating ? animationProgress : undefined,
  )
  const pendingFailure = (
    scene.animationPending ?? sceneAnimationBlocks(scene)
  ).find((animation) => animation.status === 'error')
  const animationErrorKey =
    animationError?.key ??
    (pendingFailure
      ? (LIBRARY_ERROR_MESSAGE_KEYS[pendingFailure.errorCode ?? ''] ??
        UNKNOWN_CREATE_ERROR_KEY)
      : undefined)
  const promptId = `gallery-description-${scene.id}`
  const promptHintId = `${promptId}-hint`
  const reasons = [
    imageAvailability.reason,
    !editing ? animationAvailability.reason : undefined,
  ]
    .filter((reason): reason is string => Boolean(reason))
    .filter((reason, index, values) => values.indexOf(reason) === index)

  function regenerateButtonLabel() {
    if (description.trim())
      return t('library.editor.panel.regenerateWithPrompt')
    if (scene.userPromptPending)
      return t('library.editor.imageGallery.regeneratePending')

    return t('library.editor.panel.regenerate')
  }

  function animationStatusLabel() {
    if (animationProgress?.phase === 'queued')
      return t('library.editor.panel.animation.queued')
    if (animationProgress?.phase === 'rate-limited')
      return t('library.editor.panel.animation.waitingQuota')
    return t('library.editor.panel.animation.animatingPercent', {
      percent: percent ?? 0,
    })
  }

  function animationButtonLabel() {
    if (animationLabel === 'resume') return t('common.resume')
    if (animationLabel === 'redo')
      return t('library.editor.panel.animation.redo')
    return t('library.editor.imageGallery.animate')
  }

  return (
    <article
      data-gallery-scene={scene.id}
      className={cn(
        'flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border-2 bg-card transition-colors',
        selected ? 'border-saffron shadow-sm' : 'border-border',
        animating && !selected && 'border-sky/50',
      )}
    >
      <button
        type="button"
        aria-label={t(
          selecting
            ? 'library.editor.imageGallery.toggleScene'
            : 'library.editor.imageGallery.select',
          { id: scene.id },
        )}
        aria-pressed={selected}
        disabled={submitting}
        onClick={onSelect}
        className={cn(
          'relative flex w-full shrink-0 items-center justify-center bg-muted/40 outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-saffron',
          videoFormat === '9:16' ? 'aspect-[9/16]' : 'aspect-video',
        )}
      >
        {unavailable ? (
          <span className="flex flex-col items-center gap-2 p-6 font-body text-sm text-muted-foreground">
            <ImageOff aria-hidden className="h-8 w-8" />
            {t('library.editor.imageGallery.missing')}
          </span>
        ) : (
          <img
            src={source}
            alt={t('create.progress.cell.alt', { id: scene.id })}
            loading="lazy"
            decoding="async"
            onError={() => setFailedSource(source)}
            className="h-full w-full object-contain"
          />
        )}
        {(selected || selecting) && (
          <span
            className={cn(
              'absolute right-3 top-3 rounded-full p-1.5',
              selected
                ? 'bg-saffron text-midnight'
                : 'bg-background/90 text-muted-foreground',
            )}
          >
            {selected ? (
              <Check aria-hidden className="h-4 w-4" />
            ) : (
              <Square aria-hidden className="h-4 w-4" />
            )}
          </span>
        )}
      </button>
      <div className="flex-1 space-y-3 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-sm font-bold">
            {t('library.editor.panel.sceneTitle', { id: scene.id })}
          </h3>
          {scene.startSeconds !== undefined &&
            scene.endSeconds !== undefined && (
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {formatTime(scene.startSeconds)} –{' '}
                {formatTime(scene.endSeconds)}
              </span>
            )}
        </div>
        <p
          className="line-clamp-2 min-h-[3.25em] font-body text-xs leading-relaxed text-muted-foreground"
          title={scene.text}
        >
          {scene.text}
        </p>
        {(generating || failed) && (
          <p
            role="status"
            className={cn(
              'flex items-center gap-1.5 font-body text-xs',
              failed ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {generating && (
              <Loader2
                aria-hidden
                className="h-3.5 w-3.5 shrink-0 animate-spin"
              />
            )}
            {t(
              generating
                ? 'library.editor.imageGallery.generating'
                : (imageError ?? 'library.editor.imageGallery.failed'),
            )}
          </p>
        )}
        {animating && (
          <div className="space-y-2 rounded-lg bg-sky/10 p-2 text-sky">
            <p
              role="status"
              className="flex items-center gap-1.5 font-display text-xs font-semibold"
            >
              <Loader2
                aria-hidden
                className="h-3.5 w-3.5 shrink-0 animate-spin"
              />
              {animationStatusLabel()}
            </p>
            {percent !== undefined && (
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                aria-label={t('library.editor.panel.animation.animating')}
                className="h-1.5 overflow-hidden rounded-full bg-sky/20"
              >
                <div
                  className="h-full rounded-full bg-sky transition-[width] duration-700 ease-linear"
                  style={{ width: `${percent}%` }}
                />
              </div>
            )}
          </div>
        )}
        {!animating && animationErrorKey && (
          <p role="status" className="font-body text-xs text-destructive">
            {t('library.editor.panel.animation.lastError', {
              reason: t(animationErrorKey),
            })}
          </p>
        )}
        {!animating && !animationErrorKey && animationLabel === 'redo' && (
          <p className="flex items-center gap-1.5 font-body text-xs text-sky">
            <Clapperboard aria-hidden className="h-3.5 w-3.5" />
            {t('library.editor.imageGallery.animated')}
          </p>
        )}
        {selected && (
          <div className="space-y-2">
            {editing && (
              <div className="space-y-2" data-gallery-description>
                <label
                  htmlFor={promptId}
                  className="font-body text-xs font-semibold"
                >
                  {t('library.editor.imageGallery.optionalDescription')}
                </label>
                <Textarea
                  id={promptId}
                  value={description}
                  onChange={(event) => onDescriptionChange(event.target.value)}
                  placeholder={t(
                    'library.editor.imageGallery.descriptionPlaceholder',
                  )}
                  maxLength={MAX_USER_PROMPT_CHARS}
                  autoFocus={focusPrompt}
                  disabled={submitting}
                  aria-describedby={promptHintId}
                  className="min-h-28 resize-y px-2.5 py-2 font-body text-xs"
                />
                <p
                  id={promptHintId}
                  className="font-body text-[11px] leading-relaxed text-muted-foreground"
                >
                  {t(
                    scene.userPromptPending
                      ? 'library.editor.imageGallery.pendingDescriptionHint'
                      : 'library.editor.imageGallery.descriptionHint',
                  )}
                </p>
                <p className="text-right font-mono text-[10px] text-muted-foreground">
                  {t('library.editor.panel.promptChars', {
                    used: description.length,
                    max: MAX_USER_PROMPT_CHARS,
                  })}
                </p>
              </div>
            )}
            {!selecting && (
              <>
                <Button
                  type="button"
                  onClick={editing ? onRegenerate : onEdit}
                  disabled={submitting || imageAvailability.disabled}
                  title={
                    imageAvailability.reason
                      ? t(imageAvailability.reason)
                      : undefined
                  }
                  className="btn-squish h-auto min-h-10 w-full whitespace-normal rounded-xl bg-saffron px-2 font-display text-xs font-bold text-midnight hover:bg-saffron/90"
                >
                  <RefreshCw aria-hidden className="mr-1.5 h-4 w-4 shrink-0" />
                  {regenerateButtonLabel()}
                </Button>
                {editing && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={submitting}
                    onClick={onCancelEdit}
                    className="h-auto w-full whitespace-normal rounded-xl font-body text-xs"
                  >
                    {t('library.editor.imageGallery.closeDescription')}
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={onAnimate}
                  disabled={
                    submitting || editing || animationAvailability.disabled
                  }
                  title={
                    animationAvailability.reason
                      ? t(animationAvailability.reason)
                      : undefined
                  }
                  className="btn-squish h-auto min-h-10 w-full whitespace-normal rounded-xl bg-sky px-2 font-display text-xs font-bold text-white hover:bg-sky/90"
                >
                  <Clapperboard
                    aria-hidden
                    className="mr-1.5 h-4 w-4 shrink-0"
                  />
                  {animationButtonLabel()}
                </Button>
                {editing && (
                  <p className="font-body text-[11px] leading-relaxed text-muted-foreground">
                    {t('library.editor.imageGallery.imagesFirst')}
                  </p>
                )}
                {!generating &&
                  !animating &&
                  reasons.map((reason) => (
                    <p
                      key={reason}
                      className="font-body text-xs leading-relaxed text-muted-foreground"
                    >
                      {t(reason)}
                    </p>
                  ))}
              </>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
