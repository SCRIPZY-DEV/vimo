import { useTranslation } from 'react-i18next'
import { Upload, X } from 'lucide-react'
import { SelectableCard } from '@/modules/common/components/SelectableCard'
import { Button } from '@/modules/common/ui/button'
import { Label } from '@/modules/common/ui/label'
import { Textarea } from '@/modules/common/ui/textarea'
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
      <Label className="font-display">{t('create.narration.label')}</Label>

      <div className="grid grid-cols-2 gap-2">
        {NARRATION_MODES.map((mode) => {
          const isSelected = mode.id === value.narrationMode
          return (
            <SelectableCard
              key={mode.id}
              selected={isSelected}
              disabled={disabled}
              onClick={() => onChange({ narrationMode: mode.id })}
              className="flex items-start gap-2 text-left"
            >
              <mode.Icon className="mt-0.5 h-4 w-4 shrink-0 text-saffron" />
              <span className="min-w-0">
                <span className="block font-display text-sm font-bold text-foreground">
                  {t(mode.labelKey)}
                </span>
                <span className="block font-body text-xs text-muted-foreground">
                  {t(mode.hintKey)}
                </span>
              </span>
            </SelectableCard>
          )
        })}
      </div>

      {isUpload && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-background p-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={onPickAudio}
            className="rounded-lg font-display"
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            {t('create.narration.chooseFile')}
          </Button>
          {fileName ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-mono text-xs text-foreground">
                {fileName}
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange({ narrationFilePath: null })}
                aria-label={t('create.narration.clearFile')}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ) : (
            <span className="font-body text-xs text-muted-foreground">
              {t('create.narration.noFile')}
            </span>
          )}
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
          placeholder={t('create.script.placeholder')}
          className="min-h-40 resize-y font-body"
        />
        <div className="flex justify-between font-mono text-xs text-muted-foreground">
          <span>
            {t('create.script.wordCount', { count: countWords(value.script) })}
          </span>
          <span>
            {value.script.length} / {SCRIPT_CHAR_LIMIT}
          </span>
        </div>
      </div>
    </div>
  )
}
