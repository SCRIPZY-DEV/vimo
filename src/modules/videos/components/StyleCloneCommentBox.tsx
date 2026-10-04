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
// Va compacta (la pregunta y qué hace en una línea, el botón al lado de la
// caja) para dejarles el alto del modal a las pruebas.
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
    <div className="space-y-1.5 rounded-xl border border-border bg-muted/30 px-3 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <label
            htmlFor={id}
            className="font-display text-sm font-bold text-foreground"
          >
            {t('create.styleClone.adjustQuestion')}
          </label>
          <p className="font-body text-xs text-muted-foreground">{hint}</p>
        </div>
        <span className="font-body text-[11px] tabular-nums text-muted-foreground">
          {t('create.styleClone.adjustCount', {
            used: comment.length.toLocaleString(),
            limit: STYLE_CLONE_COMMENT_LIMIT.toLocaleString(),
          })}
        </span>
      </div>
      <div className="flex items-end gap-2">
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
            'min-w-0 flex-1 resize-y font-body text-sm placeholder:text-muted-foreground/70',
          )}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={!canSend}
          onClick={() => onSend(comment.trim())}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          {t('create.styleClone.adjustSend')}
        </Button>
      </div>
    </div>
  )
}
