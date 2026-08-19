import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, Loader2, Wand2 } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { Textarea } from '@/modules/common/ui/textarea'
import { useSuggestMusicPrompt } from '@/modules/music/hooks/useSuggestMusicPrompt'

interface MusicPromptSuggesterProps {
  disabled?: boolean
  onSuggested: (prompt: string) => void
}

export function MusicPromptSuggester({
  disabled = false,
  onSuggested,
}: MusicPromptSuggesterProps) {
  const { t } = useTranslation()
  const { suggestPrompt, suggesting, errorKey } = useSuggestMusicPrompt()
  const [open, setOpen] = useState(false)
  const [script, setScript] = useState('')

  const suggest = async () => {
    try {
      onSuggested(await suggestPrompt(script))
    } catch {
      // El error queda expuesto en errorKey; no hay nada más que hacer acá.
    }
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="rounded-lg font-display text-muted-foreground"
      >
        {open ? (
          <ChevronDown className="mr-1.5 h-4 w-4" />
        ) : (
          <ChevronRight className="mr-1.5 h-4 w-4" />
        )}
        {t('music.sugerir.titulo')}
      </Button>

      {open && (
        <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
          <p className="font-body text-sm text-muted-foreground">
            {t('music.sugerir.descripcion')}
          </p>
          <Textarea
            value={script}
            disabled={disabled || suggesting}
            onChange={(event) => setScript(event.target.value)}
            placeholder={t('music.sugerir.placeholder')}
            className="min-h-24 resize-y font-body"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || suggesting || !script.trim()}
            onClick={() => void suggest()}
            className="rounded-lg font-display"
          >
            {suggesting ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="mr-1.5 h-4 w-4" />
            )}
            {suggesting
              ? t('music.sugerir.sugiriendo')
              : t('music.sugerir.boton')}
          </Button>
          {errorKey && (
            <p className="font-body text-sm text-destructive">{t(errorKey)}</p>
          )}
        </div>
      )}
    </div>
  )
}
