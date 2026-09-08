import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Mic } from 'lucide-react'
import { Label } from '@/modules/common/ui/label'
import { cn } from '@/modules/common/utilities/cn'
import { VoicePickerModal } from '@/modules/videos/components/VoicePickerModal'
import { VoiceSettingsFields } from '@/modules/videos/components/VoiceSettingsFields'
import { VOICE_PROVIDER_LABELS } from '@/modules/voices/constants'
import type { CreateFormValue } from '@/modules/videos/types/create'

interface VoiceSectionProps {
  value: CreateFormValue
  disabled: boolean
  onChange: (patch: Partial<CreateFormValue>) => void
}

export function VoiceSection({ value, disabled, onChange }: VoiceSectionProps) {
  const { t } = useTranslation()
  const [pickerOpen, setPickerOpen] = useState(false)

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2 font-display font-semibold">
        <Mic className="h-4 w-4 text-saffron" />
        {t('create.voice.label')}
      </Label>

      <button
        type="button"
        disabled={disabled}
        onClick={() => setPickerOpen(true)}
        className={cn(
          'w-full rounded-xl border-2 px-4 py-3 text-left transition-all',
          value.voice
            ? 'border-saffron bg-saffron/5'
            : 'border-dashed border-border bg-card hover:border-saffron/40',
        )}
      >
        {value.voice ? (
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-saffron/30 font-display font-bold text-charcoal">
              {value.voice.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm font-bold text-foreground">
                {value.voice.name}
              </p>
              <p className="font-body text-xs text-muted-foreground">
                {VOICE_PROVIDER_LABELS[value.voice.provider]}
              </p>
            </div>
            <span className="rounded bg-saffron px-2 py-1 font-display text-[10px] font-bold text-charcoal">
              {t('create.voice.change')}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Mic className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <p className="font-display text-sm font-bold text-foreground">
                {t('create.voice.choose')}
              </p>
              <p className="font-body text-xs text-muted-foreground">
                {t('create.voice.hint')}
              </p>
            </div>
          </div>
        )}
      </button>

      {value.voice && (
        <VoiceSettingsFields
          provider={value.voice.provider}
          value={value.voiceSettings}
          disabled={disabled}
          onChange={(voiceSettings) => onChange({ voiceSettings })}
        />
      )}

      {pickerOpen && (
        <VoicePickerModal
          current={value.voice}
          onSelect={(voice) => {
            onChange({ voice })
            setPickerOpen(false)
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
