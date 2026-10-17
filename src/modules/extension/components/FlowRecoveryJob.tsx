import { flowAutoRecoveryPending } from '@pipeline/types/flow-auto-recovery.ts'
import { useTranslation } from 'react-i18next'
import { Button } from '@/modules/common/ui/button'
import { FlowImagePreview } from '@/modules/extension/components/FlowImagePreview'
import {
  canCancelFlowJob,
  canRetryFlowGeneration,
} from '@/modules/extension/utilities/flowJobActions'
import { flowJobReviewKey } from '@/modules/extension/utilities/flowJobReviewKey'
import type {
  FlowImageJob,
  FlowRecoveryAction,
} from '@/modules/common/types/flow'
import type { FlowGalleryBatch } from '@/modules/extension/types/gallery'

interface FlowRecoveryJobProps {
  job: FlowImageJob
  kind: FlowGalleryBatch['kind']
  sourceKey?: string
  busy: boolean
  onAction: (action: FlowRecoveryAction) => void
  onConfirm: (action: FlowRecoveryAction) => void
}

function jobDescription(
  job: FlowImageJob,
  retry: boolean,
  canDownload: boolean,
): string {
  if (job.state === 'canceled') return 'extension.jobCanceled'
  if (job.state === 'deleted') return 'extension.galleryJobDeleted'
  if (job.cancelRequested) return 'extension.galleryCancelRequested'
  if (flowAutoRecoveryPending(job)) return 'extension.phaseAutoRecovering'
  if (job.generationRetry?.status === 'pending')
    return 'extension.galleryRetryQueued'
  if (retry) return 'extension.rpc13'
  if (canDownload) return 'extension.downloadPending'
  const reviewKey = flowJobReviewKey(job)
  if (reviewKey) return reviewKey
  if (
    [
      'queued',
      'assigned',
      'received',
      'dispatching',
      'preparing_token',
      'submitting',
    ].includes(job.state)
  )
    return 'extension.queued'
  if (job.state === 'uploading') return 'extension.galleryUploading'
  if (['generating', 'running'].includes(job.state))
    return 'extension.galleryGenerating'
  if (job.state === 'downloading') return 'extension.galleryDownloading'
  if (job.state === 'ready') return 'extension.jobReady'
  if (job.state === 'failed') return 'extension.galleryJobFailed'
  return 'extension.reviewRequired'
}

export function FlowRecoveryJob({
  job,
  kind,
  sourceKey,
  busy,
  onAction,
  onConfirm,
}: FlowRecoveryJobProps) {
  const { t } = useTranslation()
  const retry = canRetryFlowGeneration(job)
  const canDownload =
    !!job.result &&
    ['download_failed', 'awaiting_url', 'failed'].includes(job.state)
  const labelKey =
    kind === 'video' && sourceKey
      ? 'extension.galleryScene'
      : kind === 'style'
        ? 'extension.gallerySample'
        : kind === 'character'
          ? 'extension.galleryCharacterPreview'
          : 'extension.jobNumber'
  const label = t(labelKey, {
    index:
      kind === 'video'
        ? (sourceKey ?? job.promptIndex ?? '—')
        : (job.promptIndex ?? '—'),
  })

  return (
    <li className="min-w-0 space-y-3 rounded-xl border border-border p-3">
      <FlowImagePreview job={job} label={label} />
      <p className="break-words font-display text-sm font-bold">{label}</p>
      <p className="text-xs text-muted-foreground">
        {t(jobDescription(job, retry, canDownload))}
      </p>
      <div className="flex flex-wrap gap-2">
        {canDownload && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              onAction({ type: 'download', imageJobId: job.imageJobId })
            }
          >
            {t('extension.recoverDownload')}
          </Button>
        )}
        {retry && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onConfirm({ type: 'retry', job })}
          >
            {t('extension.retryGeneration')}
          </Button>
        )}
        {canCancelFlowJob(job) && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              onAction({ type: 'cancel', imageJobId: job.imageJobId })
            }
          >
            {t('extension.cancelJob')}
          </Button>
        )}
        {job.localDeletable && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() =>
              onConfirm({ type: 'deleteImage', imageJobId: job.imageJobId })
            }
          >
            {t('extension.deleteImage')}
          </Button>
        )}
      </div>
      {job.prompt ? (
        <details className="text-xs">
          <summary className="cursor-pointer font-medium">
            {t('extension.galleryPrompt')}
          </summary>
          <p className="mt-2 whitespace-pre-wrap break-words text-muted-foreground">
            {job.prompt}
          </p>
        </details>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t('extension.galleryPromptUnavailable')}
        </p>
      )}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">
          {t('extension.galleryTechnicalDetails')}
        </summary>
        <dl className="mt-2 space-y-1">
          <dt>{t('extension.galleryJobId')}</dt>
          <dd className="break-all font-mono">{job.imageJobId}</dd>
        </dl>
      </details>
    </li>
  )
}
