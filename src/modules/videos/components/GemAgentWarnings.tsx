import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { Alert } from '@/modules/common/components/Alert'
import { Button } from '@/modules/common/ui/button'

interface GemAgentWarningsProps {
  warnings: string[]
  // La gema se actualizó sola a la plantilla (spec §4.4) y se guardó sin que
  // la persona la viera: el aviso sale aunque el agente no haya avisado nada y
  // pide revisar las secciones.
  migrated?: boolean
  // Descartar el aviso de la migración; sin él, no hay botón.
  onDismiss?: () => void
}

// Lo que el agente descartó o encontró ambiguo al ordenar la gema (spec §6.2),
// escrito en el idioma de la app. Se muestra después de «Preparar con IA» o de
// la migración automática; no se guarda con el estilo.
export function GemAgentWarnings({
  warnings,
  migrated = false,
  onDismiss,
}: GemAgentWarningsProps) {
  const { t } = useTranslation()

  if (warnings.length === 0 && !migrated) return null

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
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </Alert>
  )
}
