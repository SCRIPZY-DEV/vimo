import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LoaderCircle } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { useFlowRecovery } from '@/modules/extension/hooks/useFlowRecovery'
import { useFlowGallery } from '@/modules/extension/hooks/useFlowGallery'
import { useFlowHistoryDeletion } from '@/modules/extension/hooks/useFlowHistoryDeletion'
import { FlowHistoryToolbar } from '@/modules/extension/components/FlowHistoryToolbar'
import { FlowHistoryConfirmation } from '@/modules/extension/components/FlowHistoryConfirmation'
import { FlowHistoryResult } from '@/modules/extension/components/FlowHistoryResult'
import { flowBatchTitle } from '@/modules/extension/utilities/flowBatchTitle'
import type { FlowHistoryTarget } from '@/modules/extension/types/gallery'
import { FlowRecoveryBatch } from '@/modules/extension/components/FlowRecoveryBatch'
import { FlowRecoveryConfirmation } from '@/modules/extension/components/FlowRecoveryConfirmation'
import type {
  FlowBatch,
  FlowImageJob,
  FlowRecoveryAction,
} from '@/modules/common/types/flow'

function batchTime(batch: FlowBatch, jobs: FlowImageJob[]): number {
  const createdAt = Date.parse(batch.createdAt ?? '')
  if (Number.isFinite(createdAt)) return createdAt
  return jobs.reduce((latest, job) => {
    const timestamp = Date.parse(job.createdAt ?? '')
    return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest
  }, 0)
}

export function FlowRecoveryPanel() {
  const { t, i18n } = useTranslation()
  const recovery = useFlowRecovery()
  const history = useFlowHistoryDeletion()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deletionTargets, setDeletionTargets] = useState<
    FlowHistoryTarget[] | null
  >(null)
  const [confirmation, setConfirmation] = useState<FlowRecoveryAction | null>(
    null,
  )
  const jobs = recovery.status?.jobs ?? []
  const batches = recovery.status?.batches ?? []
  const gallery = useFlowGallery(batches.map((batch) => batch.batchId))
  const metadata = new Map(
    gallery.data?.batches.map((batch) => [batch.batchId, batch]),
  )
  const jobsByBatch = new Map<string, FlowImageJob[]>()
  for (const job of jobs) {
    const batchJobs = jobsByBatch.get(job.batchId) ?? []
    batchJobs.push(job)
    jobsByBatch.set(job.batchId, batchJobs)
  }
  const sortedBatches = [...batches].sort((left, right) => {
    return (
      batchTime(right, jobsByBatch.get(right.batchId) ?? []) -
      batchTime(left, jobsByBatch.get(left.batchId) ?? [])
    )
  })
  const targets = new Map(
    sortedBatches.map((batch) => [
      batch.batchId,
      {
        batchId: batch.batchId,
        title: flowBatchTitle(
          batch,
          jobsByBatch.get(batch.batchId) ?? [],
          metadata.get(batch.batchId),
          t,
          i18n.resolvedLanguage,
        ),
        jobCount: jobsByBatch.get(batch.batchId)?.length ?? 0,
      },
    ]),
  )
  const available = sortedBatches
    .filter((batch) => batch.localDeletable === true)
    .flatMap((batch) => {
      const target = targets.get(batch.batchId)
      return target ? [target] : []
    })
  const selected = available.filter((target) => selectedIds.has(target.batchId))
  const busy = recovery.busy || history.busy
  const confirmDeletion = (selection: FlowHistoryTarget[]) => {
    if (busy || selection.length === 0) return
    setDeletionTargets(selection.map((target) => ({ ...target })))
  }
  if (!recovery.status) return null

  return (
    <section className="space-y-3 rounded-2xl border-2 border-border bg-card p-5">
      <h2 className="font-display text-lg font-bold">
        {t('extension.galleryTitle')}
      </h2>
      <p className="text-sm text-muted-foreground">
        {t('extension.galleryHint')}
      </p>
      {!!recovery.status.nativeImport?.failed && (
        <p role="alert" className="text-sm text-destructive">
          {t('extension.nativeImportFailed')}
        </p>
      )}
      {recovery.errorKey && (
        <p role="alert" className="text-sm text-destructive">
          {t(recovery.errorKey)}
        </p>
      )}
      {history.errorKey && (
        <p role="alert" className="text-sm text-destructive">
          {t(history.errorKey)}
        </p>
      )}
      {sortedBatches.length > 0 && (
        <FlowHistoryToolbar
          available={available.length}
          excluded={sortedBatches.length - available.length}
          selected={selected.length}
          busy={busy}
          onSelectAll={() =>
            setSelectedIds(new Set(available.map((target) => target.batchId)))
          }
          onClear={() => setSelectedIds(new Set())}
          onDeleteSelected={() => confirmDeletion(selected)}
          onDeleteAll={() => confirmDeletion(available)}
        />
      )}
      {history.busy && (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
          {t('extension.historyDeleting')}
        </p>
      )}
      <FlowHistoryResult
        result={history.result}
        busy={busy}
        onRetry={confirmDeletion}
        onDismiss={history.reset}
      />
      {gallery.isError && (
        <div role="alert" className="space-y-2 rounded-xl bg-muted p-3">
          <p className="text-sm">{t('extension.galleryMetadataError')}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={gallery.isFetching}
            onClick={() => void gallery.refetch()}
          >
            {t('extension.galleryReloadMetadata')}
          </Button>
        </div>
      )}
      {sortedBatches.length === 0 && (
        <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
          {t('extension.galleryEmpty')}
        </p>
      )}
      {sortedBatches.map((batch) => (
        <FlowRecoveryBatch
          key={batch.batchId}
          batch={batch}
          jobs={jobsByBatch.get(batch.batchId) ?? []}
          metadata={metadata.get(batch.batchId)}
          busy={busy}
          title={
            targets.get(batch.batchId)?.title ?? t('extension.galleryUntitled')
          }
          selected={batch.localDeletable && selectedIds.has(batch.batchId)}
          onSelect={(checked) =>
            setSelectedIds((previous) => {
              const next = new Set(previous)
              if (checked) next.add(batch.batchId)
              else next.delete(batch.batchId)
              return next
            })
          }
          onDelete={() => {
            const target = targets.get(batch.batchId)
            if (target && batch.localDeletable) confirmDeletion([target])
          }}
          onAction={recovery.execute}
          onConfirm={setConfirmation}
        />
      ))}
      {sortedBatches.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t('extension.galleryDeleteHint')}
        </p>
      )}
      <FlowHistoryConfirmation
        targets={deletionTargets}
        busy={busy}
        onClose={() => setDeletionTargets(null)}
        onConfirm={() => {
          if (!deletionTargets || busy) return
          void history.execute(deletionTargets)
          setDeletionTargets(null)
          setSelectedIds(new Set())
        }}
      />
      <FlowRecoveryConfirmation
        action={confirmation}
        onClose={() => setConfirmation(null)}
        onConfirm={() => {
          if (confirmation) recovery.execute(confirmation)
          setConfirmation(null)
        }}
      />
    </section>
  )
}
