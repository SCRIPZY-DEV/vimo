import { useTranslation } from 'react-i18next'
import { RotateCcw } from 'lucide-react'
import { apiKeysApi } from '@/modules/api-keys/api'
import { InsufficientCreditsAlert } from '@/modules/common/components/InsufficientCreditsAlert'
import { Button } from '@/modules/common/ui/button'
import {
  CREATE_ERROR_MESSAGE_KEYS,
  UNKNOWN_CREATE_ERROR_KEY,
} from '@/modules/videos/constants'
import { useCreditsIssueLine } from '@/modules/videos/hooks/useCreditsIssueLine'
import { useResumeCostCheck } from '@/modules/videos/hooks/useResumeCostCheck'
import { creditsDomainOf } from '@/modules/videos/utilities/creditsDomainOf'
import { vendorOfProvider } from '@/modules/voices/utilities/vendorOfProvider'
import type { VideoProjectStatusResult } from '@pipeline/types/video-project.ts'

interface NoCreditsResumePanelProps {
  status: VideoProjectStatusResult
  onResume: () => void
}

// Proyecto pausado por saldo, rehidratado desde disco (sin tarea viva): qué
// cuenta rechazó, cuánto falta por gastar, saldo actual, recargar y
// reanudar recién cuando el saldo re-leído alcanza (ADR-0029).
export function NoCreditsResumePanel({
  status,
  onResume,
}: NoCreditsResumePanelProps) {
  const { t } = useTranslation()
  const { metadata } = status
  const code = metadata.errorCode ?? ''
  const context = {
    domain: creditsDomainOf(code) ?? 'image',
    imageProvider: metadata.options.imageProvider ?? null,
    voiceVendor: metadata.options.voiceProvider
      ? vendorOfProvider(metadata.options.voiceProvider)
      : null,
  }
  // La estimación de lo pendiente manda; si no toca la cuenta que rechazó
  // (LLM, transcripción: sin saldo legible) se muestra igual esa cuenta.
  const issue = useCreditsIssueLine({ context })
  const check = useResumeCostCheck({ status })
  const lines = check.result.lines.some(
    (line) => line.providerId === issue.line.providerId,
  )
    ? check.result.lines
    : [issue.line, ...check.result.lines]
  const canResume = !check.result.blocking && issue.line.sufficient !== false

  const refresh = () => {
    issue.refresh()
    check.refresh()
  }
  const resume = async () => {
    const fresh = await check.verify()
    if (fresh.blocking) return
    onResume()
  }

  return (
    <div className="space-y-4 rounded-2xl border-2 border-coral/30 bg-coral/5 p-6">
      <p className="font-body text-sm text-foreground">
        {t(CREATE_ERROR_MESSAGE_KEYS[code] ?? UNKNOWN_CREATE_ERROR_KEY)}
      </p>
      <p className="font-body text-sm text-muted-foreground">
        {t('library.progress.noCredits')}
      </p>

      <InsufficientCreditsAlert
        lines={lines}
        blocking={!canResume}
        onReload={(providerId) => void apiKeysApi.openBillingPage(providerId)}
        onRefresh={refresh}
        refreshing={issue.refreshing || check.refreshing}
      />

      <Button
        onClick={() => void resume()}
        disabled={!canResume}
        className="rounded-xl font-display font-bold"
      >
        <RotateCcw className="mr-1.5 h-4 w-4" />
        {t('common.resume')}
      </Button>
    </div>
  )
}
