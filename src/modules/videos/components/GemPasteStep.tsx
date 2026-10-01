import { useTranslation } from 'react-i18next'
import { Loader2, Sparkles } from 'lucide-react'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import { Button } from '@/modules/common/ui/button'
import { cn } from '@/modules/common/utilities/cn'
import { videosApi } from '@/modules/videos/api'
import { GemRebuildErrorText } from '@/modules/videos/components/GemRebuildErrorText'
import {
  CUSTOM_STYLE_FIELD_CLASS,
  CUSTOM_STYLE_PROMPT_LIMIT,
} from '@/modules/videos/constants'

interface GemPasteStepProps {
  text: string
  pending: boolean
  // Error del último intento, que se muestra traducido; null = ninguno.
  error: Error | null
  onTextChange: (text: string) => void
  onPrepare: () => void
  // Solo al reemplazar una gema que ya tiene secciones: volver sin cambiarlas.
  onBack?: () => void
}

// «Pegá tu gema» (spec §7): una caja grande y «Preparar con IA». Mientras la IA
// trabaja todo queda quieto (el botón deshabilitado evita un segundo pedido);
// si falla, el texto sigue en la caja y el botón pasa a «Reintentar», salvo
// cuando el texto no es una gema: reintentarlo igual daría lo mismo, así que
// el botón vuelve a «Preparar con IA» para el texto que se pegue en su lugar.
export function GemPasteStep({
  text,
  pending,
  error,
  onTextChange,
  onPrepare,
  onBack,
}: GemPasteStepProps) {
  const { t } = useTranslation()
  // Sin `maxLength` en la caja: el navegador recortaría en silencio el final de
  // una gema pegada de más (las reglas, las frases de cierre) y la IA la
  // prepararía incompleta, gastando un pedido del cupo diario. Se avisa y el
  // botón espera a que la gema entre en el tope.
  const overLimit = text.length > CUSTOM_STYLE_PROMPT_LIMIT
  const canPrepare = text.trim().length > 0 && !pending && !overLimit
  const retrying = error !== null && videosApi.gemRebuildErrorRetryable(error)

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
            overLimit ? 'text-coral' : 'text-muted-foreground',
          )}
        >
          {t('create.gemTemplate.pasteCount', {
            used: text.length.toLocaleString(),
            limit: CUSTOM_STYLE_PROMPT_LIMIT.toLocaleString(),
          })}
        </p>
        {overLimit && (
          <p role="alert" className="text-xs text-coral">
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
      {error && !pending && (
        <ErrorMessage>
          <GemRebuildErrorText error={error} />
        </ErrorMessage>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {onBack && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={onBack}
          >
            {t('create.gemTemplate.backToSections')}
          </Button>
        )}
        <Button type="button" disabled={!canPrepare} onClick={onPrepare}>
          {pending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('create.gemTemplate.preparing')}
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              {retrying
                ? t('create.gemTemplate.retry')
                : t('create.gemTemplate.prepare')}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
