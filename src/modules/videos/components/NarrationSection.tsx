import { useTranslation } from 'react-i18next'
import { FileAudio, Mic, X } from 'lucide-react'
import { LongTextNotice } from '@/modules/common/components/LongTextNotice'
import { Label } from '@/modules/common/ui/label'
import { Textarea } from '@/modules/common/ui/textarea'
import { cn } from '@/modules/common/utilities/cn'
import { NARRATION_MODES, SCRIPT_CHAR_LIMIT } from '@/modules/videos/constants'
import { countWords } from '@/modules/videos/utilities/countWords'
import type { CreateFormValue } from '@/modules/videos/types/create'

interface NarrationSectionProps {
  value: CreateFormValue
  disabled: boolean
  onChange: (patch: Partial<CreateFormValue>) => void
  onPickAudio: () => void
}

export function NarrationSection({
  value,
  disabled,
  onChange,
  onPickAudio,
}: NarrationSectionProps) {
  const { t } = useTranslation()

  const isUpload = value.narrationMode === 'own-audio'
  const fileName = value.narrationFilePath?.split(/[\\/]/).pop() ?? null

  return (
    <div className="space-y-3">
      <Label className="flex items-center gap-2 font-display font-semibold">
        <Mic className="h-4 w-4 text-saffron" />
        {t('create.narration.label')}
      </Label>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {NARRATION_MODES.map((mode) => {
          const isSelected = mode.id === value.narrationMode
          return (
            <button
              key={mode.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ narrationMode: mode.id })}
              className={cn(
                'rounded-xl border-2 px-4 py-3 text-left transition-all',
                isSelected
                  ? 'border-saffron bg-saffron/5'
                  : 'border-border bg-card hover:border-saffron/40',
              )}
            >
              <span className="flex items-center gap-2 font-display text-sm font-bold text-foreground">
                <mode.Icon className="h-4 w-4" /> {t(mode.labelKey)}
              </span>
              <span className="font-body text-xs text-muted-foreground">
                {t(mode.hintKey)}
              </span>
            </button>
          )
        })}
      </div>

      {isUpload && (
        <div className="space-y-2">
          <Label className="flex items-center gap-2 font-display font-semibold">
            <FileAudio className="h-4 w-4 text-saffron" />
            {t('create.narration.audioLabel')}
          </Label>

          <button
            type="button"
            disabled={disabled}
            onClick={onPickAudio}
            className="flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-border bg-card p-3 text-left transition-all hover:border-saffron/40"
          >
            <span className="rounded-lg bg-saffron px-4 py-2 font-display text-sm font-bold text-charcoal transition-colors hover:bg-saffron/90">
              {t('create.narration.chooseFile')}
            </span>
            {!fileName && (
              <span className="font-body text-sm text-muted-foreground">
                {t('create.narration.noFile')}
              </span>
            )}
          </button>

          {fileName && (
            <div className="flex items-center gap-2 rounded-lg border border-saffron/30 bg-saffron/10 px-3 py-2">
              <FileAudio className="h-4 w-4 shrink-0 text-saffron" />
              <span className="truncate font-body text-sm text-foreground">
                {fileName}
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange({ narrationFilePath: null })}
                aria-label={t('create.narration.clearFile')}
                className="ml-auto shrink-0 text-muted-foreground hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <p className="font-body text-xs text-muted-foreground">
            {t('create.narration.audioHint')}
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        {/* Con audio propio el guion es opcional: si falta, el pipeline lo
            reconstruye desde la transcripción. */}
        <Label htmlFor="create-script" className="font-display">
          {isUpload
            ? t('create.script.optionalLabel')
            : t('create.script.label')}
        </Label>
        <Textarea
          id="create-script"
          value={value.script}
          maxLength={SCRIPT_CHAR_LIMIT}
          disabled={disabled}
          onChange={(event) => onChange({ script: event.target.value })}
          placeholder={
            isUpload
              ? t('create.script.optionalPlaceholder')
              : t('create.script.placeholder')
          }
          className="min-h-40 resize-y font-body"
        />
        <div className="flex justify-between font-mono text-xs text-muted-foreground">
          <span>
            {t('create.script.wordCount', { count: countWords(value.script) })}
          </span>
          <span>
            {t('create.script.charCount', {
              count: value.script.length,
              max: SCRIPT_CHAR_LIMIT,
            })}
          </span>
        </div>
        {!isUpload && <LongTextNotice characters={value.script.length} />}
        {isUpload && (
          <p className="font-body text-xs text-muted-foreground">
            {t('create.script.optionalHint')}
          </p>
        )}
      </div>
    </div>
  )
}
