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
    <details className="rounded-xl border-2 border-border bg-card">
      <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-3 font-display text-sm font-semibold">
        <span>{t('create.music.sectionTitle')}</span>
        <span className="ml-auto font-handwritten text-xs text-muted-foreground">
          {t('create.music.sectionHint')}
        </span>
      </summary>

      <div className="space-y-4 px-4 pb-4">
        <div className="flex items-start gap-3">
          <input
            id="create-use-bgm"
            type="checkbox"
            checked={value.useBgm}
            disabled={disabled}
            onChange={(event) => onChange({ useBgm: event.target.checked })}
            className="mt-1.5 h-4 w-4 accent-saffron"
          />
          <div className="flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Label
                htmlFor="create-use-bgm"
                className="font-display font-semibold"
              >
                {t('create.music.label')}
              </Label>
              <div
                className={cn(
                  'inline-flex items-center rounded-full bg-muted p-0.5',
                  !value.useBgm && 'pointer-events-none opacity-50',
                )}
              >
                {BGM_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange({ bgmMode: mode.id })}
                    className={cn(
                      'rounded-full px-3 py-1 font-display text-xs font-bold transition-colors',
                      value.bgmMode === mode.id
                        ? 'bg-saffron text-charcoal shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {t(mode.labelKey)}
                  </button>
                ))}
              </div>
            </div>

            {value.bgmMode === 'evolink-ai' ? (
              <div
                className={cn(
                  'space-y-3',
                  !value.useBgm && 'pointer-events-none opacity-50',
                )}
              >
                <Label htmlFor="create-bgm-prompt" className="font-display">
                  {t('create.music.promptLabel')}
                </Label>
                <Textarea
                  id="create-bgm-prompt"
                  value={value.bgmPrompt}
                  disabled={disabled || !value.useBgm}
                  onChange={(event) =>
                    onChange({ bgmPrompt: event.target.value })
                  }
                  placeholder={t('create.music.promptPlaceholder')}
                  className="min-h-20 resize-y font-body"
                />
                <label className="flex cursor-pointer items-center gap-3 font-body text-sm text-muted-foreground">
                  <Switch
                    checked={value.bgmInstrumental}
                    disabled={disabled || !value.useBgm}
                    onCheckedChange={(bgmInstrumental) =>
                      onChange({ bgmInstrumental })
                    }
                  />
                  {t('create.music.instrumental')}
                </label>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Input
                  id="create-bgm-url"
                  value={value.bgmUrl}
                  disabled={disabled || !value.useBgm}
                  onChange={(event) => onChange({ bgmUrl: event.target.value })}
                  placeholder={t('create.music.urlPlaceholder')}
                  className="font-body"
                />
                <p className="font-body text-xs text-muted-foreground">
                  {t('create.music.urlHint')}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-start gap-3 border-t border-border pt-2">
          <input
            id="create-use-overlay"
            type="checkbox"
            checked={value.useOverlay}
            disabled={disabled}
            onChange={(event) => onChange({ useOverlay: event.target.checked })}
            className="mt-1.5 h-4 w-4 accent-saffron"
          />
          <div className="flex-1 space-y-2">
            <Label
              htmlFor="create-overlay-url"
              className="font-display font-semibold"
            >
              {t('create.overlay.label')}
            </Label>
            <Input
              id="create-overlay-url"
              value={value.overlayUrl}
              disabled={disabled || !value.useOverlay}
              onChange={(event) => onChange({ overlayUrl: event.target.value })}
              placeholder={t('create.overlay.urlPlaceholder')}
              className="font-body"
            />
            <p className="font-body text-xs text-muted-foreground">
              {t('create.overlay.hint')}
            </p>
          </div>
        </div>
      </div>
    </details>
  )
}
