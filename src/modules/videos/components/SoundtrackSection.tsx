import { useTranslation } from 'react-i18next'
import { Input } from '@/modules/common/ui/input'
import { Label } from '@/modules/common/ui/label'
import { Switch } from '@/modules/common/ui/switch'
import { Textarea } from '@/modules/common/ui/textarea'
import { cn } from '@/modules/common/utilities/cn'
import { BGM_MODES } from '@/modules/videos/constants'
import type { CreateFormValue } from '@/modules/videos/types/create'

interface SoundtrackSectionProps {
  value: CreateFormValue
  disabled: boolean
  onChange: (patch: Partial<CreateFormValue>) => void
}

export function SoundtrackSection({
  value,
  disabled,
  onChange,
}: SoundtrackSectionProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="flex cursor-pointer items-center gap-3">
          <Switch
            checked={value.useBgm}
            disabled={disabled}
            onCheckedChange={(useBgm) => onChange({ useBgm })}
          />
          <span className="font-display text-sm font-bold text-foreground">
            {t('create.music.label')}
          </span>
        </label>

        {value.useBgm && (
          <div
            className={cn(
              'space-y-3 rounded-xl border border-border bg-background p-4',
              disabled && 'pointer-events-none opacity-60',
            )}
          >
            <div className="flex gap-2">
              {BGM_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => onChange({ bgmMode: mode.id })}
                  className={cn(
                    'flex-1 rounded-lg border-2 px-3 py-2 font-display text-sm transition-colors',
                    value.bgmMode === mode.id
                      ? 'border-saffron bg-saffron/10 font-bold text-foreground'
                      : 'border-border text-muted-foreground hover:border-saffron/40',
                  )}
                >
                  {t(mode.labelKey)}
                </button>
              ))}
            </div>

            {value.bgmMode === 'evolink-ai' ? (
              <div className="space-y-2">
                <Label htmlFor="create-bgm-prompt" className="font-display">
                  {t('create.music.promptLabel')}
                </Label>
                <Textarea
                  id="create-bgm-prompt"
                  value={value.bgmPrompt}
                  onChange={(event) =>
                    onChange({ bgmPrompt: event.target.value })
                  }
                  placeholder={t('create.music.promptPlaceholder')}
                  className="min-h-20 resize-y font-body"
                />
                <label className="flex cursor-pointer items-center gap-3 font-body text-sm text-muted-foreground">
                  <Switch
                    checked={value.bgmInstrumental}
                    onCheckedChange={(bgmInstrumental) =>
                      onChange({ bgmInstrumental })
                    }
                  />
                  {t('create.music.instrumental')}
                </label>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="create-bgm-url" className="font-display">
                  {t('create.music.urlLabel')}
                </Label>
                <Input
                  id="create-bgm-url"
                  value={value.bgmUrl}
                  onChange={(event) => onChange({ bgmUrl: event.target.value })}
                  placeholder={t('create.music.urlPlaceholder')}
                />
                <p className="font-body text-xs text-muted-foreground">
                  {t('create.music.urlHint')}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label className="flex cursor-pointer items-center gap-3">
          <Switch
            checked={value.useOverlay}
            disabled={disabled}
            onCheckedChange={(useOverlay) => onChange({ useOverlay })}
          />
          <span className="font-display text-sm font-bold text-foreground">
            {t('create.overlay.label')}
          </span>
        </label>

        {value.useOverlay && (
          <div
            className={cn(
              'space-y-1.5 rounded-xl border border-border bg-background p-4',
              disabled && 'pointer-events-none opacity-60',
            )}
          >
            <Label htmlFor="create-overlay-url" className="font-display">
              {t('create.overlay.urlLabel')}
            </Label>
            <Input
              id="create-overlay-url"
              value={value.overlayUrl}
              onChange={(event) => onChange({ overlayUrl: event.target.value })}
              placeholder={t('create.overlay.urlPlaceholder')}
            />
            <p className="font-body text-xs text-muted-foreground">
              {t('create.overlay.hint')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
