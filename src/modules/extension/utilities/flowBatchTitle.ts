import type { TFunction } from 'i18next'
import type { FlowBatch, FlowImageJob } from '@/modules/common/types/flow'
import type { FlowGalleryBatch } from '@/modules/extension/types/gallery'

function batchKindKey(kind: FlowGalleryBatch['kind'], count: number): string {
  if (kind === 'video')
    return count === 1
      ? 'extension.galleryKindRegeneration'
      : 'extension.galleryKindVideo'
  if (kind === 'style') return 'extension.galleryKindStyle'
  if (kind === 'character') return 'extension.galleryKindCharacter'
  return 'extension.galleryKindImages'
}

// La tarjeta y la confirmación muestran exactamente el mismo nombre de lote.
export function flowBatchTitle(
  batch: FlowBatch,
  jobs: FlowImageJob[],
  metadata: FlowGalleryBatch | undefined,
  t: TFunction,
  language: string | undefined,
): string {
  const createdAt = Date.parse(batch.createdAt ?? jobs[0]?.createdAt ?? '')
  const date = Number.isFinite(createdAt)
    ? new Intl.DateTimeFormat(language, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(createdAt)
    : t('extension.galleryUnknownDate')
  return t('extension.galleryBatchTitle', {
    title: metadata?.title || t('extension.galleryUntitled'),
    kind: t(batchKindKey(metadata?.kind ?? 'images', batch.requestedCount)),
    date,
  })
}
