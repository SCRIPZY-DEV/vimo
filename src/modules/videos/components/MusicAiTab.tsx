import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Sparkles, Wand2 } from 'lucide-react'
import { AudioPlayer } from '@/modules/common/components/AudioPlayer'
import { CheckboxRow } from '@/modules/common/components/CheckboxRow'
import { LabeledProgress } from '@/modules/common/components/LabeledProgress'
import { Button } from '@/modules/common/ui/button'
import { Label } from '@/modules/common/ui/label'
import { Textarea } from '@/modules/common/ui/textarea'
import type { MusicChoice } from '@/modules/videos/types/library'
import type { MusicOption } from '@pipeline/types/music.ts'

interface MusicAiTabProps {
  // Sin guion no hay de dónde sugerir un prompt.
  canSuggest: boolean
  busy: boolean
  // null = no hay generación en curso.
  musicPercent: number | null
  onGenerate(
    prompt: string,
    instrumental: boolean,
  ): Promise<MusicOption[] | null>
  onSuggestPrompt(): Promise<string | null>
  onChoose(choice: MusicChoice): void
}

// Pestaña de música generada por IA: prompt (con sugerencia a partir del
// guion), generación y elección entre las variaciones devueltas. Su estado
// vive acá y muere con el diálogo.
export function MusicAiTab({
  canSuggest,
  busy,
  musicPercent,
  onGenerate,
  onSuggestPrompt,
  onChoose,
}: MusicAiTabProps) {
  const { t } = useTranslation()
  const [prompt, setPrompt] = useState('')
  const [instrumental, setInstrumental] = useState(true)
  const [suggesting, setSuggesting] = useState(false)
  const [options, setOptions] = useState<MusicOption[]>([])

  const suggest = async () => {
    setSuggesting(true)
    const suggestion = await onSuggestPrompt()
    setSuggesting(false)
    if (suggestion) setPrompt(suggestion)
  }

  const generate = async () => {
    setOptions([])
    const generated = await onGenerate(prompt, instrumental)
    if (generated) setOptions(generated)
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="music-prompt" className="font-display">
            {t('library.music.prompt')}
          </Label>
          <Button
            variant="ghost"
            size="sm"
            disabled={suggesting || !canSuggest}
            onClick={() => void suggest()}
            className="h-7 rounded-lg font-display text-muted-foreground"
          >
            {suggesting ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wand2 className="mr-1 h-3.5 w-3.5" />
            )}
            {t('library.music.suggest')}
          </Button>
        </div>
        <Textarea
          id="music-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={t('library.music.promptPlaceholder')}
          className="min-h-20 font-body text-sm"
        />
      </div>

      <CheckboxRow
        label={t('library.music.instrumental')}
        checked={instrumental}
        onChange={setInstrumental}
      />

      {musicPercent !== null ? (
        <LabeledProgress
          label={t('library.music.generating')}
          percent={musicPercent}
        />
      ) : (
        <Button
          onClick={() => void generate()}
          disabled={prompt.trim().length === 0}
          className="w-full rounded-xl font-display font-bold"
        >
          <Sparkles className="mr-1.5 h-4 w-4" />
          {t('library.music.generate')}
        </Button>
      )}

      {options.length > 0 && (
        <div className="space-y-2">
          <p className="font-display text-sm font-bold text-foreground">
            {t('library.music.chooseVariation')}
          </p>
          {options.map((option, index) => (
            <div
              key={option.audioUrl}
              className="space-y-2 rounded-xl border border-border p-2"
            >
              <p className="font-body text-xs text-muted-foreground">
                {option.title ??
                  t('library.music.variation', { number: index + 1 })}
              </p>
              <AudioPlayer src={option.audioUrl} />
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  onChoose({ source: 'download-url', url: option.audioUrl })
                }
                className="rounded-lg font-display"
              >
                {t('library.music.useThis')}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
