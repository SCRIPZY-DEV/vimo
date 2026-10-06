import { useEffect, useEffectEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { Alert } from '@/modules/common/components/Alert'
import { Button } from '@/modules/common/ui/button'
import { GEM_WARNINGS_AUTO_DISMISS_MS } from '@/modules/videos/constants'

interface GemAgentWarningsProps {
  warnings: string[]
  // La gema se actualizó sola a la plantilla (spec §4.4) y se guardó sin que
  // la persona la viera: el aviso sale aunque el agente no haya avisado nada y
  // pide revisar las secciones.
  migrated?: boolean
  // Descartar el aviso de la migración; sin él, no hay botón ni se cierra
  // solo.
  onDismiss?: () => void
}

// Lo que el agente descartó o encontró ambiguo al ordenar la gema (spec §6.2),
// escrito en el idioma de la app, y debajo la aclaración de que las reglas de
// flujo, formato e idioma que el agente saca las pone Vimo. Se muestra después
// de la adaptación de una gema pegada o de la migración automática; no se
// guarda con el estilo. Si la persona no lo cierra, se descarta solo al rato.
export function GemAgentWarnings({
  warnings,
  migrated = false,
  onDismiss,
}: GemAgentWarningsProps) {
  const { t } = useTranslation()
  const visible = warnings.length > 0 || migrated
  const dismissible = onDismiss !== undefined

  // El reloj corre desde que el aviso aparece; `onDismiss` se lee al vencer,
  // así un render del modal no lo reinicia.
  const dismiss = useEffectEvent(() => onDismiss?.())
  useEffect(() => {
    if (!visible || !dismissible) return

    const timer = setTimeout(() => dismiss(), GEM_WARNINGS_AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [visible, dismissible])

  if (!visible) return null

  return (
    <Alert
      tone="info"
      title={t('create.gemTemplate.warningsTitle')}
      actions={
        onDismiss && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('create.gemTemplate.migrationDismiss')}
            onClick={onDismiss}
            className="h-7 w-7 shrink-0 rounded-lg text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        )
      }
    >
      {migrated && <p>{t('create.gemTemplate.migrationReview')}</p>}
      {warnings.length > 0 && (
        <>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
          {/* Lo que el agente saca a propósito no se pierde: el marco de Vimo
              trae sus propias reglas de flujo, formato e idioma (ADR-0048). */}
          <p className="mt-1.5 text-muted-foreground">
            {t('create.gemTemplate.warningsPlatformNote')}
          </p>
        </>
      )}
    </Alert>
  )
}
