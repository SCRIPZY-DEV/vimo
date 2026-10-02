import { useTranslation } from 'react-i18next'
import { TriangleAlert } from 'lucide-react'
import { PROMPT_FAILURE_REASON_KEYS } from '@/modules/videos/constants'
import type { ScenePromptFailure } from '@pipeline/types/scenes.ts'

interface ScenePromptFailureNoticeProps {
  failure: ScenePromptFailure | undefined
}

// Escena que la corrida dejó sin prompt para rescatarla acá: dice quién
// falló (redactor, revisor o modelos) y que regenerarla usa todo el contexto.
export function ScenePromptFailureNotice({
  failure,
}: ScenePromptFailureNoticeProps) {
  const { t } = useTranslation()

  if (!failure) return null

  return (
    <div className="space-y-1.5 rounded-xl border border-saffron/50 bg-saffron/10 p-3 font-body text-xs leading-relaxed">
      <p className="flex items-center gap-1.5 font-display text-sm font-bold text-foreground">
        <TriangleAlert className="h-4 w-4 shrink-0 text-saffron" />
        {t('library.editor.panel.promptFailureTitle')}
      </p>
      <p className="text-foreground">
        {t(PROMPT_FAILURE_REASON_KEYS[failure.source])}
      </p>
      {failure.detail && (
        <p className="text-muted-foreground">
          {t('library.editor.panel.promptFailureReviewerNote', {
            note: failure.detail,
          })}
        </p>
      )}
      <p className="text-muted-foreground">
        {t('library.editor.panel.promptFailureHint')}
      </p>
    </div>
  )
}
