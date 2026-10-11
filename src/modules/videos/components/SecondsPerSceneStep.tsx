import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PlayCircle } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { clamp } from '@/modules/common/utilities/clamp'
import { useSceneDurationDefaults } from '@/modules/settings/hooks/useSceneDurationDefaults'
import {
  SCENE_CUT_PREVIEW_DEBOUNCE_MS,
  SECONDS_PER_MINUTE,
  SECONDS_PER_SCENE_DEFAULT,
  SECONDS_PER_SCENE_MAX,
  SECONDS_PER_SCENE_MIN,
  SECONDS_PER_SCENE_SHORTCUTS,
  SUPPORT_NOTE_CLASS,
} from '@/modules/videos/constants'
import { AvatarSpansNote } from '@/modules/videos/components/AvatarSpansNote'
import { useSceneCutPreview } from '@/modules/videos/hooks/useSceneCutPreview'
import { secondsStepSceneEstimate } from '@/modules/videos/utilities/secondsStepSceneEstimate'
import { ANIMATION_PREFIX_SCENE_SECONDS } from '@pipeline/types/video-provider.ts'
import type {
  SceneConfirmationView,
  SceneCutChoice,
} from '@/modules/videos/types/create'

interface SecondsPerSceneStepProps {
  projectId: string
  confirmation: SceneConfirmationView
  onConfirm: (choice: SceneCutChoice) => void
}

// La pausa del carril de segundos de un estilo propio (port de
// PasoSegundosPorEscena del origen): va inline arriba de todo, porque el
// pipeline está detenido esperándolo — es LO que hay que hacer ahora. El
// número de escenas se mueve al instante con una estimación local («≈») y
// lo reemplaza el corte real del sidecar apenas contesta, con la misma
// implementación que después corta: así la vista previa no puede mentir.
// El valor elegido pasa a ser la preferencia de Ajustes (PR #37 de dev), con
// la que arrancan los próximos videos.
export function SecondsPerSceneStep({
  projectId,
  confirmation,
  onConfirm,
}: SecondsPerSceneStepProps) {
  const { t } = useTranslation()
  const { sceneDuration, rememberSecondsPerScene } = useSceneDurationDefaults()
  const [seconds, setSeconds] = useState(
    clamp(
      Math.round(
        confirmation.secondsPerScene ??
          sceneDuration?.secondsPerScene ??
          SECONDS_PER_SCENE_DEFAULT,
      ),
      SECONDS_PER_SCENE_MIN,
      SECONDS_PER_SCENE_MAX,
    ),
  )
  // El corte real se pide con un pequeño retraso: cada valor es un job del
  // sidecar y el slider dispara muchos seguidos.
  const [previewSeconds, setPreviewSeconds] = useState(seconds)

  useEffect(() => {
    const timer = setTimeout(
      () => setPreviewSeconds(seconds),
      SCENE_CUT_PREVIEW_DEBOUNCE_MS,
    )
    return () => clearTimeout(timer)
  }, [seconds])

  const preview = useSceneCutPreview({
    projectId,
    secondsPerScene: previewSeconds,
    enabled: true,
  })
  const exact =
    preview.exact && preview.sceneCount !== null && previewSeconds === seconds
  const animationMinutes = confirmation.animationMinutes ?? 0
  const animatesEntireDuration =
    animationMinutes > 0 &&
    animationMinutes * SECONDS_PER_MINUTE >= confirmation.audioDurationSeconds
  const displayedSeconds = animatesEntireDuration
    ? ANIMATION_PREFIX_SCENE_SECONDS
    : seconds
  const durationLabel = () => {
    if (animatesEntireDuration) return 'create.secondsStep.perAnimatedClip'
    if (animationMinutes > 0) return 'create.secondsStep.perSceneAfterAnimation'

    return 'create.secondsStep.perScene'
  }
  const estimatedCount = secondsStepSceneEstimate(confirmation, seconds)
  const count =
    exact && preview.sceneCount !== null ? preview.sceneCount : estimatedCount

  const confirm = () => {
    if (!animatesEntireDuration) rememberSecondsPerScene(seconds)
    onConfirm({ secondsPerScene: seconds })
  }

  return (
    <div className="overflow-hidden rounded-2xl border-2 border-primary/40 bg-primary/5">
      <div className="space-y-5 p-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="font-display text-5xl font-extrabold leading-none text-foreground">
              {displayedSeconds}
              <span className="text-2xl"> s</span>
            </p>
            <p className={cn(SUPPORT_NOTE_CLASS, 'mt-1 text-muted-foreground')}>
              {t(durationLabel())}
            </p>
          </div>
          <div className="text-right">
            <p className="font-display text-5xl font-extrabold leading-none text-saffron">
              {exact ? '' : '≈ '}
              {count}
            </p>
            <p className={cn(SUPPORT_NOTE_CLASS, 'mt-1 text-muted-foreground')}>
              {t('create.secondsStep.total', { count })}
            </p>
          </div>
        </div>

        {animationMinutes > 0 && (
          <p className={cn(SUPPORT_NOTE_CLASS, 'text-sky')}>
            {t(
              animatesEntireDuration
                ? 'create.secondsStep.animatedWholeHint'
                : 'create.secondsStep.animatedPrefixHint',
              {
                minutes: animationMinutes,
              },
            )}
          </p>
        )}

        <AvatarSpansNote
          spans={confirmation.avatarSpans}
          dropped={confirmation.avatarDropped}
          lookType={confirmation.avatarLookType}
        />

        {!animatesEntireDuration && (
          <>
            <div>
              <input
                type="range"
                min={SECONDS_PER_SCENE_MIN}
                max={SECONDS_PER_SCENE_MAX}
                step={1}
                value={seconds}
                onChange={(event) => setSeconds(Number(event.target.value))}
                className="w-full accent-primary"
                aria-label={t(
                  animationMinutes > 0
                    ? 'create.secondsStep.sliderAfterAnimationAria'
                    : 'create.secondsStep.sliderAria',
                )}
              />
              <div className="flex justify-between font-display text-xs font-bold text-muted-foreground">
                <span>
                  {t('create.secondsStep.sliderMin', {
                    seconds: SECONDS_PER_SCENE_MIN,
                  })}
                </span>
                <span>
                  {t('create.secondsStep.sliderMax', {
                    seconds: SECONDS_PER_SCENE_MAX,
                  })}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className={cn(SUPPORT_NOTE_CLASS, 'text-muted-foreground')}>
                {t('create.secondsStep.shortcuts')}
              </span>
              {SECONDS_PER_SCENE_SHORTCUTS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSeconds(value)}
                  className={cn(
                    'rounded-full border-2 px-4 py-1.5 font-display text-sm font-bold transition-colors',
                    value === seconds
                      ? 'border-primary bg-primary/20 text-foreground'
                      : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  {t('create.secondsStep.shortcut', { seconds: value })}
                </button>
              ))}
            </div>
          </>
        )}

        <p
          className={cn(
            SUPPORT_NOTE_CLASS,
            'leading-snug text-muted-foreground',
          )}
        >
          {t(
            animationMinutes > 0
              ? 'create.secondsStep.animationExplanation'
              : 'create.secondsStep.explanation',
          )}
        </p>

        {/* Ancho completo a propósito: es la única acción de la pantalla
            mientras el pipeline espera. */}
        <button
          type="button"
          onClick={confirm}
          className="btn-squish flex w-full items-center justify-center gap-3 rounded-xl bg-saffron px-6 py-5 font-display text-xl font-extrabold text-charcoal shadow-lg shadow-saffron/30 transition-opacity"
        >
          <PlayCircle className="h-6 w-6" />
          {t(
            animationMinutes > 0
              ? 'create.secondsStep.confirmAnimated'
              : 'create.secondsStep.confirm',
            { count, seconds },
          )}
        </button>
        <p className="text-center font-body text-sm text-muted-foreground">
          {t('create.secondsStep.footnote')}
        </p>
      </div>
    </div>
  )
}
