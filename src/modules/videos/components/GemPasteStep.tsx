import { useTranslation } from 'react-i18next'
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { cn } from '@/modules/common/utilities/cn'
import {
  CUSTOM_STYLE_FIELD_CLASS,
  CUSTOM_STYLE_PROMPT_LIMIT,
} from '@/modules/videos/constants'

interface GemPasteStepProps {
  text: string
  // Guardando la gema pegada para adaptarla.
  pending: boolean
  onTextChange: (text: string) => void
  onPrepare: () => void
}

// «Pegá tu gema» de un estilo nuevo (spec §7): una caja grande y «Preparar
// con IA». El botón guarda la gema tal cual y la manda a adaptar en segundo
// plano: mientras se guarda todo queda quieto (el botón deshabilitado evita un
// segundo pedido). Cómo va la adaptación, y su «Reintentar», lo muestra el
// aviso de la gema.
export function GemPasteStep({
  text,
  pending,
  onTextChange,
  onPrepare,
}: GemPasteStepProps) {
  const { t } = useTranslation()
  // Sin `maxLength` en la caja: el navegador recortaría en silencio el final de
  // una gema pegada de más (las reglas, las frases de cierre) y la IA la
  // prepararía incompleta, gastando un pedido del cupo diario. Se avisa y el
  // botón espera a que la gema entre en el tope.
  const overLimit = text.length > CUSTOM_STYLE_PROMPT_LIMIT
  const canPrepare = text.trim().length > 0 && !pending && !overLimit

  return (
    <div className="space-y-3">
      <label
        htmlFor="gem-paste"
        className="block font-display text-sm font-bold text-foreground"
      >
        {t('create.gemTemplate.pasteTitle')}
      </label>
      <textarea
        id="gem-paste"
        value={text}
        disabled={pending}
        onChange={(event) => onTextChange(event.target.value)}
        placeholder={t('create.gemTemplate.pastePlaceholder')}
        rows={16}
        spellCheck={false}
        className={cn(
          CUSTOM_STYLE_FIELD_CLASS,
          'resize-y font-mono text-xs leading-relaxed placeholder:text-muted-foreground/70',
        )}
      />
      <div className="space-y-1 text-right font-body">
        <p
          className={cn(
            'text-[11px] tabular-nums',
            overLimit ? 'text-coral-text' : 'text-muted-foreground',
          )}
        >
          {t('create.gemTemplate.pasteCount', {
            used: text.length.toLocaleString(),
            limit: CUSTOM_STYLE_PROMPT_LIMIT.toLocaleString(),
          })}
        </p>
        {overLimit && (
          <p role="alert" className="text-xs text-coral-text">
            {t('create.gemTemplate.errors.invalidText', {
              limit: CUSTOM_STYLE_PROMPT_LIMIT.toLocaleString(),
            })}
          </p>
        )}
      </div>

      {pending && (
        <p role="status" className="font-body text-xs text-muted-foreground">
          {t('create.gemTemplate.preparingHint')}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="button" disabled={!canPrepare} onClick={onPrepare}>
          {pending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('create.gemTemplate.preparing')}
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              {t('create.gemTemplate.prepare')}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
