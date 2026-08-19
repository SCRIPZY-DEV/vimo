import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Input } from '@/modules/common/ui/input'
import { Label } from '@/modules/common/ui/label'
import { Switch } from '@/modules/common/ui/switch'
import { Textarea } from '@/modules/common/ui/textarea'
import { Button } from '@/modules/common/ui/button'
import { cn } from '@/modules/common/utilities/cn'
import {
  MUSIC_MODEL_LABEL,
  MUSIC_VARIATIONS,
  PROMPT_LIMIT,
  PROMPT_LIMIT_CUSTOM,
  SONG_TITLE_LIMIT,
  STYLE_LIMIT,
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
  const promptLimit = value.advanced ? PROMPT_LIMIT_CUSTOM : PROMPT_LIMIT

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
          maxLength={promptLimit}
          disabled={disabled}
          onChange={(event) => patch({ prompt: event.target.value })}
          placeholder={t('music.form.promptPlaceholder')}
          className="min-h-24 resize-y font-body"
        />
        <p className="text-right font-mono text-xs text-muted-foreground">
          {value.prompt.length} / {promptLimit}
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

      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        onClick={() => patch({ advanced: !value.advanced })}
        className="rounded-lg font-display text-muted-foreground"
      >
        {value.advanced ? (
          <ChevronDown className="mr-1.5 h-4 w-4" />
        ) : (
          <ChevronRight className="mr-1.5 h-4 w-4" />
        )}
        {t('music.form.avanzado')}
      </Button>

      {value.advanced && (
        <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="music-style" className="font-display">
              {t('music.form.estilo')}
            </Label>
            <Input
              id="music-style"
              value={value.style}
              maxLength={STYLE_LIMIT}
              disabled={disabled}
              onChange={(event) => patch({ style: event.target.value })}
              placeholder={t('music.form.estiloPlaceholder')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="music-title" className="font-display">
              {t('music.form.tituloCancion')}
            </Label>
            <Input
              id="music-title"
              value={value.title}
              maxLength={SONG_TITLE_LIMIT}
              disabled={disabled}
              onChange={(event) => patch({ title: event.target.value })}
              placeholder={t('music.form.tituloCancionPlaceholder')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="music-negative-tags" className="font-display">
              {t('music.form.negativas')}
            </Label>
            <Input
              id="music-negative-tags"
              value={value.negativeTags}
              disabled={disabled}
              onChange={(event) => patch({ negativeTags: event.target.value })}
              placeholder={t('music.form.negativasPlaceholder')}
            />
          </div>

          {!value.instrumental && (
            <div className="space-y-1.5">
              <Label className="font-display">
                {t('music.form.generoVocal')}
              </Label>
              <div className="flex gap-2">
                {(
                  [
                    ['', t('music.form.generoAuto')],
                    ['m', t('music.form.generoMasculino')],
                    ['f', t('music.form.generoFemenino')],
                  ] as const
                ).map(([gender, label]) => (
                  <Button
                    key={gender || 'auto'}
                    type="button"
                    size="sm"
                    variant={
                      value.vocalGender === gender ? 'default' : 'outline'
                    }
                    disabled={disabled}
                    onClick={() => patch({ vocalGender: gender })}
                    className="rounded-lg font-display"
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

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
