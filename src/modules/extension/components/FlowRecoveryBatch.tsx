import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { cn } from '@/modules/common/utilities/cn'
import { FLOW_GALLERY_PAGE_SIZE } from '@/modules/extension/constants'
import { FlowRecoveryJob } from '@/modules/extension/components/FlowRecoveryJob'
import { canCancelFlowJob } from '@/modules/extension/utilities/flowJobActions'
import type {
  FlowBatch,
  FlowImageJob,
  FlowRecoveryAction,
} from '@/modules/common/types/flow'
import type { FlowGalleryBatch } from '@/modules/extension/types/gallery'

interface FlowRecoveryBatchProps {
  batch: FlowBatch
  jobs: FlowImageJob[]
  metadata?: FlowGalleryBatch
  busy: boolean
  title: string
  selected: boolean
  onSelect: (selected: boolean) => void
  onDelete: () => void
  onAction: (action: FlowRecoveryAction) => void
  onConfirm: (action: FlowRecoveryAction) => void
}

export function FlowRecoveryBatch({
  batch,
  jobs,
  metadata,
  busy,
  title,
  selected,
  onSelect,
  onDelete,
  onAction,
  onConfirm,
}: FlowRecoveryBatchProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [page, setPage] = useState(0)
  const contentId = useId()
  const sortedJobs = [...jobs].sort((left, right) => {
    return (
      (left.promptIndex ?? 0) - (right.promptIndex ?? 0) ||
      left.imageJobId.localeCompare(right.imageJobId)
    )
  })
  const totalPages = Math.max(
    1,
    Math.ceil(jobs.length / FLOW_GALLERY_PAGE_SIZE),
  )
  const currentPage = Math.min(page, totalPages - 1)
  const visibleJobs = sortedJobs.slice(
    currentPage * FLOW_GALLERY_PAGE_SIZE,
    (currentPage + 1) * FLOW_GALLERY_PAGE_SIZE,
  )
  const sourceKeys = new Map(
    metadata?.items.map((item) => [item.imageJobId, item.sourceKey]),
  )
  const kind = metadata?.kind ?? 'images'
  const canCancel =
    (batch.status !== 'canceled' && batch.remainingCount > 0) ||
    jobs.some(canCancelFlowJob)

  return (
    <article className="overflow-hidden rounded-xl border border-border">
      <div className="flex items-start">
        <input
          type="checkbox"
          className="ml-4 mt-5 h-4 w-4 shrink-0 accent-ocean"
          checked={selected}
          disabled={busy || !batch.localDeletable}
          aria-label={t('extension.historySelectBatch', { title })}
          onChange={(event) => onSelect(event.target.checked)}
        />
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={contentId}
          aria-label={t(
            expanded
              ? 'extension.galleryCloseBatch'
              : 'extension.galleryOpenBatch',
            { title },
          )}
          className="flex min-w-0 flex-1 items-start gap-3 p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ocean"
          onClick={() => setExpanded(!expanded)}
        >
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'mt-0.5 h-4 w-4 shrink-0 transition-transform',
              !expanded && '-rotate-90',
            )}
          />
          <span className="min-w-0 flex-1 space-y-1">
            <span className="block break-words font-display text-sm font-bold">
              {title}
            </span>
            <span className="block text-xs text-muted-foreground">
              {t('extension.galleryBatchProgress', {
                ready: jobs.filter((job) => job.state === 'ready').length,
                total: jobs.length,
              })}
            </span>
            <span className="block text-xs text-muted-foreground">
              {t('extension.batchCount', {
                submitted: batch.submittedCount,
                requested: batch.requestedCount,
                pending: batch.remainingCount,
              })}
            </span>
          </span>
        </button>
        {batch.localDeletable && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="mr-2 mt-2 shrink-0"
            disabled={busy}
            onClick={onDelete}
            aria-label={t('extension.historyDeleteBatch', { title })}
            title={t('extension.historyDeleteBatch', { title })}
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
          </Button>
        )}
      </div>
      {expanded && (
        <div id={contentId} className="space-y-4 border-t border-border p-4">
          <div className="flex flex-wrap gap-2">
            {canCancel && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  onConfirm({ type: 'cancelBatch', batchId: batch.batchId })
                }
              >
                {t('extension.cancelBatch')}
              </Button>
            )}
          </div>
          {visibleJobs.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t('extension.galleryNoJobs')}
            </p>
          )}
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {visibleJobs.map((job) => (
              <FlowRecoveryJob
                key={job.imageJobId}
                job={job}
                kind={kind}
                sourceKey={sourceKeys.get(job.imageJobId)}
                busy={busy}
                onAction={onAction}
                onConfirm={onConfirm}
              />
            ))}
          </ul>
          {totalPages > 1 && (
            <nav
              aria-label={t('extension.galleryPage', {
                page: currentPage + 1,
                total: totalPages,
              })}
              className="flex flex-wrap items-center justify-center gap-3"
            >
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
                aria-label={t('extension.galleryPrevious')}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <p aria-live="polite" className="text-xs text-muted-foreground">
                {t('extension.galleryPage', {
                  page: currentPage + 1,
                  total: totalPages,
                })}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={currentPage + 1 >= totalPages}
                onClick={() => setPage(currentPage + 1)}
                aria-label={t('extension.galleryNext')}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </nav>
          )}
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">
              {t('extension.galleryTechnicalDetails')}
            </summary>
            <dl className="mt-2 space-y-1">
              <dt>{t('extension.galleryBatchId')}</dt>
              <dd className="break-all font-mono">{batch.batchId}</dd>
            </dl>
          </details>
        </div>
      )}
    </article>
  )
}
