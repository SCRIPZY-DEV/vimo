import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/modules/common/ui/button'
import type { FlowRestartRequest } from '@/modules/common/types/flow'

interface FlowRestartInlineProps {
  onRestart: (request: FlowRestartRequest) => void
  disabled?: boolean
}
export function FlowRestartInline({
  onRestart,
  disabled = false,
}: FlowRestartInlineProps) {
  const { t } = useTranslation()
  const [confirming, setConfirming] = useState(false)
  const request = useRef<FlowRestartRequest | null>(null)
  if (!confirming)
    return (
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => setConfirming(true)}
      >
        {t('extension.restartButton')}
      </Button>
    )
  return (
    <div
      role="group"
      aria-label={t('extension.restartTitle')}
      className="space-y-3 rounded-xl border border-saffron/50 bg-saffron/10 p-3"
    >
      <p className="text-sm">{t('extension.restartBody')}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => setConfirming(false)}
        >
          {t('extension.back')}
        </Button>
        <Button
          type="button"
          disabled={disabled}
          onClick={() => {
            request.current ??= {
              flowRestartRequestId: crypto.randomUUID(),
              flowAcknowledgeDuplicateRisk: true,
            }
            onRestart(request.current)
            setConfirming(false)
          }}
        >
          {t('extension.restartConfirm')}
        </Button>
      </div>
    </div>
  )
}
