import { useTranslation } from 'react-i18next'

interface VoiceCountProps {
  // null cuando el total es desconocido (ElevenLabs sin `total` en la respuesta).
  count: number | null
}

// Contador de voces disponibles del catálogo activo, encima de la grilla.
export function VoiceCount({ count }: VoiceCountProps) {
  const { t } = useTranslation()

  if (count === null) return null

  return (
    <p className="font-body text-sm tabular-nums text-muted-foreground">
      {t('voices.availableCount', { count })}
    </p>
  )
}
