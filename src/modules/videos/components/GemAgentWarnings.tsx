import { useTranslation } from 'react-i18next'
import { Alert } from '@/modules/common/components/Alert'

interface GemAgentWarningsProps {
  warnings: string[]
}

// Lo que el agente descartó o encontró ambiguo al ordenar la gema (spec §6.2),
// escrito en el idioma de la app. Se muestra después de «Preparar con IA»; no
// se guarda con el estilo.
export function GemAgentWarnings({ warnings }: GemAgentWarningsProps) {
  const { t } = useTranslation()

  if (warnings.length === 0) return null

  return (
    <Alert tone="info" title={t('create.gemTemplate.warningsTitle')}>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </Alert>
  )
}
