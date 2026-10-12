import { useTranslation } from 'react-i18next'
import { Button } from '@/modules/common/ui/button'
import { flowErrorKey } from '@/modules/common/utilities/flowErrorKey'
import type {
  FlowHistoryDeletionOutcome,
  FlowHistoryDeletionResult,
  FlowHistoryTarget,
} from '@/modules/extension/types/gallery'

interface FlowHistoryResultProps {
  result: FlowHistoryDeletionResult | null
  busy: boolean
  onRetry: (targets: FlowHistoryTarget[]) => void
  onDismiss: () => void
}

function outcomeMessageKey(outcome: FlowHistoryDeletionOutcome): string {
  if (outcome.status === 'blocked') return 'extension.historyDeletionBlocked'
  if (outcome.status === 'deleted') return 'extension.historyCleanupPending'
  return flowErrorKey(outcome.error)
}

export function FlowHistoryResult({
  result,
  busy,
  onRetry,
  onDismiss,
}: FlowHistoryResultProps) {
  const { t } = useTranslation()
  if (!result) return null
  const deleted = result.outcomes.filter(
    (outcome) => outcome.status === 'deleted',
  ).length
  const pending = result.outcomes.filter(
    (outcome) => outcome.status !== 'deleted' || outcome.cleanupPending,
  )
  return (
    <div
      role="status"
      className="space-y-3 rounded-xl border border-border bg-muted/50 p-3"
    >
      <p className="text-sm font-medium">
        {t(
          pending.length
            ? 'extension.historyDeletionPartial'
            : 'extension.historyDeletionComplete',
          { deleted, total: result.outcomes.length },
        )}
      </p>
      {pending.length > 0 && (
        <ul className="max-h-64 space-y-2 overflow-y-auto">
          {pending.map((outcome) => (
            <li key={outcome.target.batchId} className="space-y-1">
              <p className="break-words text-sm font-medium">
                {outcome.target.title}
              </p>
              <p className="text-xs text-muted-foreground">
                {t(outcomeMessageKey(outcome))}
              </p>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        {pending.length > 0 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onRetry(pending.map((outcome) => outcome.target))}
          >
            {t('extension.historyRetryPending')}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={onDismiss}
        >
          {t('extension.historyDismissResult')}
        </Button>
      </div>
    </div>
  )
}
