import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Mic, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { Label } from '@/modules/common/ui/label'
import { cn } from '@/modules/common/utilities/cn'
import { VoicePickerModal } from '@/modules/videos/components/VoicePickerModal'
import { VoiceSettingsFields } from '@/modules/videos/components/VoiceSettingsFields'
import type { CreateFormValue } from '@/modules/videos/types/create'

interface VoiceSectionProps {
  value: CreateFormValue
  disabled: boolean
  onChange: (patch: Partial<CreateFormValue>) => void
}

export function VoiceSection({ value, disabled, onChange }: VoiceSectionProps) {
  const { t } = useTranslation()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div className="space-y-2">
      <Label className="font-display">{t('create.voice.label')}</Label>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => setPickerOpen(true)}
          className="rounded-xl font-display"
        >
          <Mic className="mr-1.5 h-4 w-4" />
          {value.voice ? t('create.voice.change') : t('create.voice.choose')}
        </Button>

        {value.voice ? (
          <span className="min-w-0 font-body text-sm text-foreground">
            <span className="font-display font-bold">{value.voice.name}</span>
            <span className="ml-1.5 font-mono text-xs text-muted-foreground">
              {value.voice.provider}
            </span>
          </span>
        ) : (
          <span className="font-body text-sm text-muted-foreground">
            {t('create.voice.none')}
          </span>
        )}

        {value.voice && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => setSettingsOpen(!settingsOpen)}
            className={cn(
              'rounded-lg font-display text-muted-foreground',
              settingsOpen && 'text-foreground',
            )}
          >
            <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
            {t('create.voice.settings')}
          </Button>
        )}
      </div>

      {value.voice && settingsOpen && (
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
