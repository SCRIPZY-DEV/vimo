import { useTranslation } from 'react-i18next'
import { Label } from '@/modules/common/ui/label'
import { Switch } from '@/modules/common/ui/switch'
import { Textarea } from '@/modules/common/ui/textarea'
import { cn } from '@/modules/common/utilities/cn'
import {
  MUSIC_MODEL_LABEL,
  MUSIC_VARIATIONS,
  PROMPT_LIMIT,
} from '@/modules/music/constants'
import type { MusicFormValue } from '@/modules/music/types/music'

interface MusicFormProps {
  value: MusicFormValue
  onChange: (value: MusicFormValue) => void
  disabled?: boolean
}

export function MusicForm({
  value,
  onChange,
  disabled = false,
}: MusicFormProps) {
  const { t } = useTranslation()

  const patch = (partial: Partial<MusicFormValue>) => {
    onChange({ ...value, ...partial })
  }

  return (
    <div
      className={cn('space-y-4', disabled && 'pointer-events-none opacity-60')}
    >
      <div className="space-y-1.5">
        <Label htmlFor="music-prompt" className="font-display">
          {t('music.form.prompt')}
        </Label>
        <Textarea
          id="music-prompt"
          value={value.prompt}
          maxLength={PROMPT_LIMIT}
          disabled={disabled}
          onChange={(event) => patch({ prompt: event.target.value })}
          placeholder={t('music.form.promptPlaceholder')}
          className="min-h-24 resize-y font-body"
        />
        <p className="text-right font-mono text-xs text-muted-foreground">
          {value.prompt.length} / {PROMPT_LIMIT}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="music-instrumental"
          checked={value.instrumental}
          disabled={disabled}
          onCheckedChange={(checked) => patch({ instrumental: checked })}
        />
        <Label htmlFor="music-instrumental" className="font-body">
          {t('music.form.instrumental')}{' '}
          <span className="text-muted-foreground">
            {t('music.form.instrumentalHint')}
          </span>
        </Label>
      </div>

      <p className="font-body text-xs text-muted-foreground">
        {t('music.form.modelo')}{' '}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
          {MUSIC_MODEL_LABEL}
        </code>{' '}
        · {t('music.form.variaciones', { n: MUSIC_VARIATIONS })}
      </p>
    </div>
  )
}
