import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Pencil, RefreshCw } from 'lucide-react'
import { apiKeysApi } from '@/modules/api-keys/api'
import { InsufficientCreditsAlert } from '@/modules/common/components/InsufficientCreditsAlert'
import DoodleSadFace from '@/modules/common/doodles/DoodleSadFace'
import { Button } from '@/modules/common/ui/button'
import { useCreditsIssueLine } from '@/modules/videos/hooks/useCreditsIssueLine'
import { useProjectStatus } from '@/modules/videos/hooks/useProjectStatus'
import { useResumeCostCheck } from '@/modules/videos/hooks/useResumeCostCheck'
import type { CreditsIssueContext } from '@/modules/videos/types/credits'

interface InsufficientCreditsCardProps {
  message: string
  projectId: string
  context: CreditsIssueContext
  // Reanudar desde el último checkpoint: lo ya hecho se conserva.
  onRetry: () => void
  // Con imágenes ya generadas se puede seguir en el editor.
  onContinueInEditor?: () => void
}

// Bloque de «sin saldo» dentro de la pantalla de progreso (ADR-0031): qué
// cuenta se quedó sin saldo, cuánto falta por gastar (leído del disco),
// saldo actual, recargar, y reanudar recién cuando el saldo alcanza.
export function InsufficientCreditsCard({
  message,
  projectId,
  context,
  onRetry,
  onContinueInEditor,
}: InsufficientCreditsCardProps) {
  const { t } = useTranslation()
  const { status } = useProjectStatus(projectId, true)
  const issue = useCreditsIssueLine({ context })
  const check = useResumeCostCheck({ status })
  const lines = check.result.lines.some(
    (line) => line.providerId === issue.line.providerId,
  )
    ? check.result.lines
    : [issue.line, ...check.result.lines]
  const canRetry =
    check.canResumePaidAnimation ||
    (!check.result.blocking && issue.line.sufficient !== false)

  const refresh = () => {
    issue.refresh()
    check.refresh()
  }
  const retry = async () => {
    if (!check.canResumePaidAnimation) {
      const fresh = await check.verify()
      if (fresh.blocking) return
    }
    onRetry()
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 rounded-xl border-2 border-coral/40 bg-coral/5 p-6"
    >
      <div className="flex items-start gap-4">
        <DoodleSadFace size={48} delay={100} />
        <div className="flex-1">
          <p className="font-display text-base font-bold text-coral-text">
            {t('create.progress.noCredits.title')}
          </p>
          <p className="mt-1 font-body text-sm text-foreground/80">{message}</p>
          <p className="mt-1 font-body text-xs text-muted-foreground">
            {t(
              check.canResumePaidAnimation
                ? 'library.editor.panel.animation.resumePaidHint'
                : 'create.progress.noCredits.body',
            )}
          </p>
        </div>
      </div>

      <InsufficientCreditsAlert
        lines={lines}
        blocking={!canRetry}
        onReload={(providerId) => void apiKeysApi.openBillingPage(providerId)}
        onRefresh={refresh}
        refreshing={issue.refreshing || check.refreshing}
      />

      <div className="space-y-2">
        <Button
          size="lg"
          onClick={() => void retry()}
          disabled={!canRetry}
          className="btn-squish w-full rounded-xl bg-saffron font-display font-bold text-charcoal hover:bg-saffron/90"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          {t('create.progress.noCredits.retry')}
        </Button>
        <p className="text-center font-body text-xs text-muted-foreground">
          {t('create.progress.noCredits.retryHint')}
        </p>
      </div>

      {onContinueInEditor && (
        <div className="space-y-2">
          <Button
            size="lg"
            variant="outline"
            onClick={onContinueInEditor}
            className="w-full rounded-xl font-display font-bold"
          >
            <Pencil className="mr-2 h-4 w-4" />
            {t('create.errors.continueInEditor')}
          </Button>
          <p className="text-center font-body text-xs text-muted-foreground">
            {t('create.progress.error.continueHint')}
          </p>
        </div>
      )}
    </motion.div>
  )
}
