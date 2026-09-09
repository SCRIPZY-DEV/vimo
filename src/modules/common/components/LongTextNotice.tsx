import { useTranslation } from 'react-i18next'
import { Alert } from '@/modules/common/components/Alert'
import { LONG_TEXT_WARNING_THRESHOLD } from '@/modules/common/constants'

interface LongTextNoticeProps {
  characters: number
}

// Aviso bajo un textarea de narración cuando el texto es largo: la voz se
// genera por partes y tarda. Lo montan Voces (probador) y Crear (guion).
export function LongTextNotice({ characters }: LongTextNoticeProps) {
  const { t } = useTranslation()

  if (characters < LONG_TEXT_WARNING_THRESHOLD) return null

  return (
    <Alert tone="info" title={t('common.longTextNotice.title')}>
      {t('common.longTextNotice.body', {
        characters: characters.toLocaleString(),
      })}
    </Alert>
  )
}
