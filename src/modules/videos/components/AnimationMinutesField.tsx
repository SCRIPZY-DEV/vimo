import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/modules/common/ui/input'
import { Label } from '@/modules/common/ui/label'
import { formatTime } from '@/modules/common/utilities/formatTime'
import {
  ANIMATION_MINUTES_MIN,
  SECONDS_PER_MINUTE,
} from '@/modules/videos/constants'
import {
  animationMinutesLimit,
  clampAnimationMinutes,
} from '@/modules/videos/utilities/animationMinutesLimit'

interface AnimationMinutesFieldProps {
  id: string
  minutes: number
  durationSeconds?: number
  allowWholeVideo?: boolean
  wholeVideo?: boolean
  onWholeVideoChange?(wholeVideo: boolean): void
  disabled: boolean
  onChange(minutes: number): void
}

interface MinutesDraft {
  minutes: number
  text: string
}

export function AnimationMinutesField({
  id,
  minutes,
  durationSeconds,
  allowWholeVideo = false,
  wholeVideo = false,
  onWholeVideoChange,
  disabled,
  onChange,
}: AnimationMinutesFieldProps) {
  const { t } = useTranslation()
  const [custom, setCustom] = useState(minutes > ANIMATION_MINUTES_MIN)
  const [draft, setDraft] = useState<MinutesDraft | null>(null)
  const maximum = animationMinutesLimit(durationSeconds)
  const selected = clampAnimationMinutes(minutes, durationSeconds)
  const inputValue = draft?.minutes === selected ? draft.text : String(selected)
  const shortVideo =
    durationSeconds !== undefined && durationSeconds < SECONDS_PER_MINUTE

  if (shortVideo && !allowWholeVideo)
    return (
      <p className="font-body text-sm text-foreground">
        {t('create.animation.wholeVideo', {
          duration: formatTime(Math.max(0, durationSeconds)),
        })}
      </p>
    )

  return (
    <fieldset disabled={disabled} className="space-y-2">
      <legend className="sr-only">{t('create.animation.range')}</legend>
      {!shortVideo && (
        <label className="flex items-center gap-2 font-body text-sm">
          <input
            type="radio"
            name={id}
            checked={!custom && !wholeVideo}
            onChange={() => {
              onWholeVideoChange?.(false)
              setCustom(false)
              setDraft(null)
              onChange(ANIMATION_MINUTES_MIN)
            }}
            className="accent-sky"
          />
          {t('create.animation.firstMinute')}
        </label>
      )}
      {!shortVideo && (
        <label className="flex items-center gap-2 font-body text-sm">
          <input
            type="radio"
            name={id}
            checked={custom && !wholeVideo}
            onChange={() => {
              onWholeVideoChange?.(false)
              setCustom(true)
            }}
            className="accent-sky"
          />
          {t('create.animation.customMinutes')}
        </label>
      )}
      {allowWholeVideo && (
        <label className="flex items-center gap-2 font-body text-sm">
          <input
            type="radio"
            name={id}
            checked={wholeVideo || shortVideo}
            onChange={() => {
              setDraft(null)
              onWholeVideoChange?.(true)
            }}
            className="accent-sky"
          />
          {t('create.animation.allVideo')}
        </label>
      )}
      {custom && !wholeVideo && !shortVideo && (
        <div className="flex items-center gap-2 pl-6">
          <Label htmlFor={id} className="sr-only">
            {t('create.animation.minutesLabel')}
          </Label>
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            min={ANIMATION_MINUTES_MIN}
            max={maximum}
            step={1}
            value={inputValue}
            disabled={disabled}
            onChange={(event) => {
              const raw = event.target.value
              const next = clampAnimationMinutes(
                raw === '' ? ANIMATION_MINUTES_MIN : Number(raw),
                durationSeconds,
              )
              setDraft({ minutes: next, text: raw === '' ? '' : String(next) })
              onChange(next)
            }}
            onBlur={(event) => {
              setDraft(null)
              onChange(
                clampAnimationMinutes(
                  event.target.value === ''
                    ? ANIMATION_MINUTES_MIN
                    : Number(event.target.value),
                  durationSeconds,
                ),
              )
            }}
            className="w-24"
          />
          <span className="font-body text-xs text-muted-foreground">
            {t('create.animation.minutesUnit')}
          </span>
        </div>
      )}
      {durationSeconds !== undefined && (
        <p className="font-body text-xs text-muted-foreground">
          {t(
            shortVideo || wholeVideo
              ? 'create.animation.wholeVideo'
              : 'create.animation.durationLimit',
            {
              duration: formatTime(durationSeconds),
              minutes: maximum,
            },
          )}
        </p>
      )}
    </fieldset>
  )
}
