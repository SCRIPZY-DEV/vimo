import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { cn } from '@/modules/common/utilities/cn'
import {
  CUSTOM_STYLE_FIELD_CLASS,
  STYLE_CLONE_COMMENT_LIMIT,
} from '@/modules/videos/constants'

interface StyleCloneCommentBoxProps {
  // id del textarea, para su etiqueta.
  id: string
  placeholder: string
  // Qué pasa al mandar el comentario (qué se rehace).
  hint: string
  disabled: boolean
  onSend: (comment: string) => void
}

// «¿Qué ajustamos?»: el comentario con el que la IA rehace una ronda de
// pruebas (los 3 diseños o las escenas). El texto vive acá hasta que se manda.
export function StyleCloneCommentBox({
  id,
  placeholder,
  hint,
  disabled,
  onSend,
}: StyleCloneCommentBoxProps) {
  const { t } = useTranslation()
  const [comment, setComment] = useState('')
  const canSend = comment.trim().length > 0 && !disabled

  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
      <label
        htmlFor={id}
        className="block font-display text-sm font-bold text-foreground"
      >
        {t('create.styleClone.adjustQuestion')}
      </label>
      <textarea
        id={id}
        value={comment}
        disabled={disabled}
        maxLength={STYLE_CLONE_COMMENT_LIMIT}
        onChange={(event) => setComment(event.target.value)}
        placeholder={placeholder}
        rows={2}
        className={cn(
          CUSTOM_STYLE_FIELD_CLASS,
          'resize-y font-body text-sm placeholder:text-muted-foreground/70',
        )}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-body text-xs text-muted-foreground">{hint}</p>
        <div className="flex items-center gap-3">
          <span className="font-body text-[11px] tabular-nums text-muted-foreground">
            {t('create.styleClone.adjustCount', {
              used: comment.length.toLocaleString(),
              limit: STYLE_CLONE_COMMENT_LIMIT.toLocaleString(),
            })}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canSend}
            onClick={() => onSend(comment.trim())}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {t('create.styleClone.adjustSend')}
          </Button>
        </div>
      </div>
    </div>
  )
}
