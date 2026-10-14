import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Clapperboard } from 'lucide-react'
import { apiKeysFocusPath } from '@/modules/api-keys/constants'
import { useRequiredApiKeys } from '@/modules/api-keys/hooks/useRequiredApiKeys'
import { Button } from '@/modules/common/ui/button'
import { Label } from '@/modules/common/ui/label'
import { Switch } from '@/modules/common/ui/switch'
import { AnimationCreditEstimate } from '@/modules/videos/components/AnimationCreditEstimate'
import { ANIMATION_PREFIX_SCENE_SECONDS } from '@pipeline/types/video-provider.ts'
import { ANIMATION_MINUTES_DEFAULT } from '@/modules/videos/constants'
import { estimateAnimationSeconds } from '@/modules/videos/utilities/estimateAnimationSeconds'
import type { CreateFormValue } from '@/modules/videos/types/create'

interface CreateAnimationSectionProps {
  value: CreateFormValue
  disabled: boolean
  onChange(patch: Partial<CreateFormValue>): void
}

export function CreateAnimationSection({
  value,
  disabled,
  onChange,
}: CreateAnimationSectionProps) {
  const { t } = useTranslation()
  const { configuredProviders } = useRequiredApiKeys()
  const requestedSeconds = estimateAnimationSeconds(value)

  return (
    <section className="space-y-3 rounded-xl border-2 border-sky/40 bg-sky/5 p-4">
      <Label
        htmlFor="create-animate-scenes"
        className="flex cursor-pointer items-center gap-2 rounded-lg py-1"
      >
        <Clapperboard className="h-4 w-4 text-sky" />
        <span className="flex-1 font-display">
          {t('create.animation.firstMinute')}
        </span>
        <Switch
          id="create-animate-scenes"
          className="data-[state=checked]:bg-sky"
          checked={value.animateScenes}
          disabled={disabled}
          onCheckedChange={(animateScenes) =>
            onChange({
              animateScenes,
              animationMinutes: ANIMATION_MINUTES_DEFAULT,
              animateWholeVideo: false,
            })
          }
        />
      </Label>
      {value.animateScenes && (
        <>
          <p className="font-body text-xs text-muted-foreground">
            {t('create.animation.hint')}
          </p>
          <AnimationCreditEstimate
            requestedSeconds={requestedSeconds}
            clipCount={requestedSeconds / ANIMATION_PREFIX_SCENE_SECONDS}
          />
          <p className="font-body text-xs text-muted-foreground">
            {t('create.animation.firstMinuteEstimateHint')}
          </p>
          {!configuredProviders.has('kie') && (
            <div className="space-y-2">
              <p className="font-body text-xs text-coral-text">
                {t('create.validation.animationKeyRequired')}
              </p>
              <Button asChild size="sm" variant="outline">
                <Link to={apiKeysFocusPath(['kie'])}>
                  {t('library.editor.panel.animation.configure')}
                </Link>
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
