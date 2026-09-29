import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Clapperboard, Loader2, RefreshCw, Undo2 } from 'lucide-react'
import { apiKeysApi } from '@/modules/api-keys/api'
import { apiKeysFocusPath } from '@/modules/api-keys/constants'
import { providerLabel } from '@/modules/api-keys/utilities/providerLabel'
import { CreditsBadge } from '@/modules/common/components/CreditsBadge'
import { InsufficientCreditsAlert } from '@/modules/common/components/InsufficientCreditsAlert'
import { Button } from '@/modules/common/ui/button'
import { cn } from '@/modules/common/utilities/cn'
import { compareCostLines } from '@/modules/common/utilities/compareCostLines'
import { formatCompact } from '@/modules/common/utilities/formatCompact'
import {
  LIBRARY_ERROR_MESSAGE_KEYS,
  UNKNOWN_CREATE_ERROR_KEY,
} from '@/modules/videos/constants'
import { useAnimationProgress } from '@/modules/videos/hooks/useAnimationProgress'
import { animationCostEstimate } from '@/modules/videos/utilities/animationCostEstimate'
import { AnimationCreditEstimate } from '@/modules/videos/components/AnimationCreditEstimate'
import { AnimationClipSummary } from '@/modules/videos/components/AnimationClipSummary'
import { AnimationPairingNotice } from '@/modules/videos/components/AnimationPairingNotice'
import { sceneAnimationBlocks } from '@pipeline/animation/scene-blocks.ts'
import type { SceneAnimationControls } from '@/modules/videos/types/library'
import { MIN_REQUESTED_ANIMATION_SECONDS } from '@pipeline/types/video-provider.ts'
import type { SceneDetail } from '@pipeline/types/video-project.ts'

interface SceneAnimationSectionProps {
  scene: SceneDetail
  controls: SceneAnimationControls
  busy: boolean
  locked: boolean
}

export function SceneAnimationSection({
  scene,
  controls,
  busy,
  locked,
}: SceneAnimationSectionProps) {
  const { t } = useTranslation()
  const {
    provider,
    configuredProviders,
    credits,
    creditsLoading,
    creditsRefreshing,
    onRefreshCredits,
    activity,
    progress,
    error,
    plan,
    onAnimate,
  } = controls
  const animations = sceneAnimationBlocks(scene)
  const pendingAnimations = [
    ...animations.filter(
      (animation) => animation.status !== 'ready' || !animation.clipPath,
    ),
    ...(scene.animationPending ?? []),
  ]
  const canRecoverLocally =
    plan?.canRecoverLocally ??
    pendingAnimations.some((animation) => animation.canRecoverLocally)
  const anyConfigured = configuredProviders.has('kie') || canRecoverLocally
  const readyClips =
    plan?.readyClips ??
    animations.filter(
      (animation) => animation.status === 'ready' && animation.clipPath,
    )
  const leadsClip = readyClips.length > 0
  const absorbed = scene.absorbedBy !== undefined
  const animating = activity === 'generating'
  const percent = useAnimationProgress(animating ? progress : undefined)
  const failedAnimation = (scene.animationPending ?? animations).find(
    (animation) => animation.status === 'error',
  )
  const persistedErrorKey = failedAnimation
    ? (LIBRARY_ERROR_MESSAGE_KEYS[failedAnimation.errorCode ?? ''] ??
      UNKNOWN_CREATE_ERROR_KEY)
    : undefined
  const lastErrorKey = error?.key ?? persistedErrorKey
  const canResumeTask =
    plan?.canResumeTask ??
    pendingAnimations.some((animation) => animation.canResumeTask)
  const requestedSeconds =
    plan?.requestedSeconds ??
    (canResumeTask
      ? 0
      : (plan?.unit?.requestedSeconds ?? MIN_REQUESTED_ANIMATION_SECONDS))
  const estimate = animationCostEstimate('kie', requestedSeconds)
  const creditsCheck = compareCostLines(
    [estimate],
    { image: null, voice: null, video: credits },
    providerLabel,
  )
  const planRejected = plan !== undefined && plan.unit === undefined
  const rejectionKey = plan?.rejection
    ? (LIBRARY_ERROR_MESSAGE_KEYS[`animation_${plan.rejection.reason}`] ??
      UNKNOWN_CREATE_ERROR_KEY)
    : undefined

  const buttonLabel = () => {
    if (animating && progress?.phase === 'retrying')
      return t('library.editor.panel.animation.retrying', {
        attempt: progress.attempt,
        maxAttempts: progress.maxAttempts,
      })
    if (animating && progress?.phase === 'queued')
      return t('library.editor.panel.animation.queued')
    if (animating && progress?.phase === 'rate-limited')
      return t('library.editor.panel.animation.waitingQuota')
    if (animating && percent !== undefined)
      return t('library.editor.panel.animation.animatingPercent', { percent })
    if (animating) return t('library.editor.panel.animation.animating')
    if (canResumeTask) return t('common.resume')
    if (leadsClip || absorbed) return t('library.editor.panel.animation.redo')
    return t('library.editor.panel.animation.animate')
  }

  const buttonContents = (
    <>
      {animating ? (
        <Loader2 aria-hidden className="mr-1.5 h-4 w-4 animate-spin" />
      ) : (
        <Clapperboard aria-hidden className="mr-1.5 h-4 w-4" />
      )}
      <span className="min-w-0 truncate">{buttonLabel()}</span>
    </>
  )

  return (
    <div className="space-y-3 rounded-xl border-2 border-sky/40 bg-sky/5 p-3">
      <div className="flex items-center gap-1.5 font-display text-sm font-semibold">
        <Clapperboard aria-hidden className="h-4 w-4 text-sky" />
        {t('library.editor.panel.animation.title')}
      </div>
      <AnimationCreditEstimate
        requestedSeconds={requestedSeconds}
        slotSeconds={plan?.slotSeconds ?? plan?.unit?.slotSeconds}
      />
      {readyClips.map((animation) => (
        <AnimationClipSummary
          key={animation.id ?? 'legacy'}
          animation={animation}
        />
      ))}
      {absorbed && (
        <p className="font-body text-xs text-muted-foreground">
          {t('library.editor.panel.animation.absorbed', {
            id: scene.absorbedBy,
          })}
        </p>
      )}
      {lastErrorKey && !animating && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 font-body text-xs text-destructive">
          {t('library.editor.panel.animation.lastError', {
            reason: t(lastErrorKey),
          })}
        </p>
      )}
      {animating && percent !== undefined && (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={t('library.editor.panel.animation.animating')}
          className="h-1.5 w-full overflow-hidden rounded-full bg-sky/20"
        >
          <div
            className="h-full rounded-full bg-sky transition-[width] duration-700 ease-linear"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
      <AnimationPairingNotice
        units={plan?.unit ? [plan.unit] : []}
        selectedSceneIds={[scene.id]}
      />
      {rejectionKey && (
        <p className="font-body text-xs text-coral">{t(rejectionKey)}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <CreditsBadge
          provider={providerLabel(provider)}
          status={credits?.[provider] ?? null}
          loading={creditsLoading}
          active
          formatBalance={(remaining) =>
            t('create.credits.balance', {
              amount: formatCompact(remaining),
            })
          }
        />
        <button
          type="button"
          onClick={onRefreshCredits}
          disabled={creditsLoading || creditsRefreshing}
          aria-label={t('create.credits.refresh')}
          title={t('create.credits.refresh')}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted transition-colors hover:bg-saffron/20 hover:text-saffron disabled:opacity-40"
        >
          <RefreshCw
            className={cn(
              'h-3.5 w-3.5',
              (creditsLoading || creditsRefreshing) && 'animate-spin',
            )}
          />
        </button>
      </div>
      {anyConfigured ? (
        <>
          {canResumeTask && (
            <p className="font-body text-xs text-muted-foreground">
              {t('library.editor.panel.animation.resumePaidHint')}
            </p>
          )}
          {creditsCheck.blocking && (
            <InsufficientCreditsAlert
              lines={creditsCheck.lines}
              blocking={!canResumeTask}
              onReload={(providerId) =>
                void apiKeysApi.openBillingPage(providerId)
              }
              onRefresh={onRefreshCredits}
              refreshing={creditsLoading || creditsRefreshing}
            />
          )}
          <Button
            type="button"
            onClick={onAnimate}
            disabled={
              (controls.busy ?? busy) ||
              animating ||
              locked ||
              (!canResumeTask && (creditsCheck.blocking || planRejected))
            }
            className="w-full min-w-0 rounded-xl bg-sky font-display font-bold text-white hover:bg-sky/90"
          >
            {buttonContents}
          </Button>
        </>
      ) : (
        <div className="space-y-2">
          <p className="font-body text-xs text-muted-foreground">
            {t('library.editor.panel.animation.noKey')}
          </p>
          <Button type="button" asChild size="sm" variant="outline">
            <Link to={apiKeysFocusPath(['kie'])}>
              {t('library.editor.panel.animation.configure')}
            </Link>
          </Button>
        </div>
      )}
      {controls.undo && (
        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            onClick={controls.undo.onUndo}
            disabled={
              controls.undo.disabled ||
              controls.undo.pending ||
              busy ||
              animating ||
              locked
            }
            className="w-full min-w-0 rounded-xl border-sky/40 font-display font-bold text-sky hover:bg-sky/10"
          >
            {controls.undo.pending ? (
              <Loader2 aria-hidden className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Undo2 aria-hidden className="mr-1.5 h-4 w-4" />
            )}
            {t(
              controls.undo.pending
                ? 'library.editor.panel.animation.undoing'
                : 'library.editor.panel.animation.undo',
            )}
          </Button>
          {controls.undo.reason && (
            <p className="font-body text-xs leading-relaxed text-muted-foreground">
              {t(controls.undo.reason)}
            </p>
          )}
          {controls.undo.sceneCount > 1 && (
            <p className="font-body text-xs leading-relaxed text-muted-foreground">
              {t('library.editor.panel.animation.undoGroupHint', {
                sceneCount: controls.undo.sceneCount,
              })}
            </p>
          )}
        </div>
      )}
      {locked && (
        <p className="font-body text-[11px] text-muted-foreground">
          {t('library.editor.demoLocked')}
        </p>
      )}
    </div>
  )
}
