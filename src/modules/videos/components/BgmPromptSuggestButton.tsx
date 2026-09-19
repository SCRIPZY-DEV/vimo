import { useTranslation } from 'react-i18next'
import { Loader2, Wand2 } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/modules/common/ui/tooltip'
import { useSuggestBgmPrompt } from '@/modules/videos/hooks/useSuggestBgmPrompt'

interface BgmPromptSuggestButtonProps {
  // Guion del formulario: sin guion no hay de dónde sugerir.
  script: string
  disabled: boolean
  onSuggested: (prompt: string) => void
}

// Botón que propone el prompt de la música de fondo leyendo el guion. Es dueño
// de su mutación; el padre solo recibe la sugerencia ya lista.
export function BgmPromptSuggestButton({
  script,
  disabled,
  onSuggested,
}: BgmPromptSuggestButtonProps) {
  const { t } = useTranslation()
  const { suggestPrompt, suggesting } = useSuggestBgmPrompt()

  const hasScript = script.trim().length > 0

  const suggest = async () => {
    const prompt = await suggestPrompt(script)
    if (!prompt) return

    onSuggested(prompt)
  }

  return (
    <Tooltip>
      {/* El span recibe el hover: un botón deshabilitado no dispara eventos. */}
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || suggesting || !hasScript}
            onClick={() => void suggest()}
            className="h-7 rounded-lg font-display text-muted-foreground"
          >
            {suggesting ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wand2 className="mr-1 h-3.5 w-3.5" />
            )}
            {suggesting
              ? t('create.music.suggesting')
              : t('create.music.suggest')}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {hasScript
          ? t('create.music.suggestCostHint')
          : t('create.music.suggestNeedsScript')}
      </TooltipContent>
    </Tooltip>
  )
}
