import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Clapperboard } from 'lucide-react'
import { apiKeysFocusPath } from '@/modules/api-keys/constants'
import { apiKeysApi } from '@/modules/api-keys/api'
import { useRequiredApiKeys } from '@/modules/api-keys/hooks/useRequiredApiKeys'
import { InsufficientCreditsAlert } from '@/modules/common/components/InsufficientCreditsAlert'
import { Button } from '@/modules/common/ui/button'
import { AnimationMinutesField } from '@/modules/videos/components/AnimationMinutesField'
import { AnimationDialog } from '@/modules/videos/components/AnimationDialog'
import {
  ANIMATION_MINUTES_DEFAULT,
  SECONDS_PER_MINUTE,
} from '@/modules/videos/constants'
import { useCostCheck } from '@/modules/videos/hooks/useCostCheck'
import { useLibraryEditorTask } from '@/modules/videos/hooks/useLibraryEditorTask'
import { animationCostEstimate } from '@/modules/videos/utilities/animationCostEstimate'
import { AnimationCreditEstimate } from '@/modules/videos/components/AnimationCreditEstimate'
import { animationRangePlan } from '@/modules/videos/utilities/animationRangePlan'
import { clampAnimationMinutes } from '@/modules/videos/utilities/animationMinutesLimit'
import { formatSlotSeconds } from '@/modules/videos/utilities/formatSlotSeconds'
import type { VideoFormat } from '@pipeline/types/video-format.ts'
import type { SceneDetail } from '@pipeline/types/video-project.ts'

interface EditorAnimationRangeProps {
  projectId: string
  scenes: SceneDetail[]
  durationSeconds?: number
  videoFormat?: VideoFormat
  busy: boolean
  locked: boolean
  embedded?: boolean
}

export function EditorAnimationRange({
  projectId,
  scenes,
  durationSeconds,
  videoFormat,
  busy,
  locked,
  embedded = false,
}: EditorAnimationRangeProps) {
  const { t, i18n } = useTranslation()
  const { configuredProviders } = useRequiredApiKeys()
  const editorTask = useLibraryEditorTask(projectId)
  const [chosenMinutes, setMinutes] = useState(ANIMATION_MINUTES_DEFAULT)
  const [wholeVideo, setWholeVideo] = useState(false)
  const animateWholeVideo = videoFormat === '9:16' && wholeVideo
  const [checking, setChecking] = useState(false)
  const videoSeconds =
    durationSeconds ??
    scenes.reduce((end, scene) => Math.max(end, scene.endSeconds ?? 0), 0)
  const minutes = clampAnimationMinutes(chosenMinutes, videoSeconds)
  const plan = animationRangePlan(scenes, minutes, {
    durationSeconds: videoSeconds,
    videoFormat,
    wholeVideo: animateWholeVideo,
  })
  const requestedSeconds = plan.requestedSeconds
  const canResumeTask = plan.canResumeTask
  const credits = useCostCheck({
    estimates:
      requestedSeconds > 0
        ? [animationCostEstimate('kie', requestedSeconds)]
        : [],
    voiceVendor: null,
  })
  const sceneIds = plan.sceneIds
  const missingImages = sceneIds.some(
    (id) => !scenes.find((scene) => scene.id === id)?.imagePath,
  )
  const rejected = plan.rejected.length > 0
  const configured = configuredProviders.has('kie') || plan.canRecoverLocally
  const disabled = busy || locked || checking || videoSeconds <= 0
  const unavailable =
    disabled ||
    !configured ||
    (!canResumeTask &&
      (requestedSeconds === 0 ||
        rejected ||
        missingImages ||
        credits.result.blocking))

  const animate = async () => {
    if (unavailable) return
    setChecking(true)
    try {
      if (!canResumeTask) {
        const check = await credits.verify()
        if (check.blocking) return
      }
      void editorTask.startAnimation(
        projectId,
        sceneIds,
        'kie',
        false,
        animateWholeVideo ? undefined : minutes,
        true,
      )
    } finally {
      setChecking(false)
    }
  }
  const buttonLabel = () => {
    if (canResumeTask) return t('common.resume')
    if (
      requestedSeconds === 0 &&
      (plan.staticTailSceneId !== undefined || plan.staticTailPending)
    )
      return t('library.editor.animationRange.staticTailOnly')
    if (requestedSeconds === 0 && !rejected)
      return t('library.editor.animationRange.complete')
    if (animateWholeVideo) return t('create.animation.allVideo')
    if (videoSeconds < SECONDS_PER_MINUTE)
      return t('library.editor.animationRange.animateShort', {
        seconds: formatSlotSeconds(videoSeconds, i18n.resolvedLanguage ?? 'es'),
      })
    return t('library.editor.animationRange.animate', { minutes })
  }

  const content = (
    <>
      <AnimationMinutesField
        id="editor-animation-minutes"
        minutes={minutes}
        durationSeconds={videoSeconds}
        allowWholeVideo={videoFormat === '9:16'}
        wholeVideo={animateWholeVideo}
        onWholeVideoChange={setWholeVideo}
        disabled={disabled}
        onChange={setMinutes}
      />
      <AnimationCreditEstimate
        requestedSeconds={requestedSeconds}
        slotSeconds={plan.units.reduce(
          (sum, unit) => sum + unit.slotSeconds,
          0,
        )}
        clipCount={plan.newClipCount}
      />
      {(plan.staticTailSceneId !== undefined || plan.staticTailPending) && (
        <p className="font-body text-xs leading-relaxed text-muted-foreground">
          {t(
            plan.staticTailPending
              ? 'library.editor.panel.animation.staticTailPendingHint'
              : 'library.editor.panel.animation.staticTailHint',
          )}
        </p>
      )}
      {configured ||
      (requestedSeconds === 0 &&
        (plan.staticTailSceneId !== undefined || plan.staticTailPending)) ? (
        <>
          {canResumeTask && (
            <p className="font-body text-xs text-muted-foreground">
              {t('library.editor.panel.animation.resumePaidHint')}
            </p>
          )}
          {rejected && (
            <p className="font-body text-xs text-coral-text">
              {t('library.editor.animationRange.invalidScenes')}
            </p>
          )}
          {missingImages && (
            <p className="font-body text-xs text-coral-text">
              {t('create.errors.animationImageMissing')}
            </p>
          )}
          {credits.result.blocking && (
            <InsufficientCreditsAlert
              lines={credits.result.lines}
              blocking={!canResumeTask}
              onReload={(providerId) =>
                void apiKeysApi.openBillingPage(providerId)
              }
              onRefresh={credits.refresh}
              refreshing={credits.refreshing}
            />
          )}
          <Button
            type="button"
            disabled={unavailable}
            onClick={() => void animate()}
            className="w-full bg-sky font-display text-white hover:bg-sky/90"
          >
            {buttonLabel()}
          </Button>
        </>
      ) : (
        <Button type="button" asChild size="sm" variant="outline">
          <Link to={apiKeysFocusPath(['kie'])}>
            {t('library.editor.panel.animation.configure')}
          </Link>
        </Button>
      )}
    </>
  )

  if (embedded) return <div className="space-y-4">{content}</div>

  return (
    <AnimationDialog
      title={t('library.editor.animationRange.title')}
      trigger={
        <Button
          type="button"
          variant="outline"
          className="shrink-0 justify-start rounded-xl border-2 border-sky/40 bg-sky/5 px-4 py-3 font-display font-bold"
        >
          <Clapperboard aria-hidden className="mr-2 h-4 w-4 text-sky" />
          {t('library.editor.animationRange.title')}
        </Button>
      }
    >
      {content}
    </AnimationDialog>
  )
}
