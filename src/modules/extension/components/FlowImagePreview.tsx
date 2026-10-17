import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImageIcon, Loader2, Maximize2 } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/modules/common/ui/dialog'
import { useFlowPreview } from '@/modules/extension/hooks/useFlowPreview'
import type { FlowImageJob } from '@/modules/common/types/flow'

interface FlowImagePreviewProps {
  job: FlowImageJob
  label: string
}

export function FlowImagePreview({ job, label }: FlowImagePreviewProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  const ready = job.state === 'ready'
  const preview = useFlowPreview(job.imageJobId, ready)
  const failed = preview.isError || imageFailed
  const source = preview.data
    ? `data:${preview.data.mimeType};base64,${preview.data.base64}`
    : null
  const retry = async () => {
    const result = await preview.refetch()
    if (result.isSuccess) setImageFailed(false)
  }

  if (!ready)
    return (
      <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-lg bg-muted p-4 text-center">
        <ImageIcon
          aria-hidden="true"
          className="h-7 w-7 text-muted-foreground/50"
        />
        <p className="text-xs text-muted-foreground">
          {t('extension.galleryPreviewUnavailable')}
        </p>
      </div>
    )
  if (preview.isLoading || (preview.isFetching && failed))
    return (
      <div
        role="status"
        className="flex aspect-video flex-col items-center justify-center gap-2 rounded-lg bg-muted p-4 text-center"
      >
        <Loader2
          aria-hidden="true"
          className="h-5 w-5 animate-spin text-muted-foreground"
        />
        <p className="text-xs text-muted-foreground">
          {t('extension.galleryReadPreview')}
        </p>
      </div>
    )
  if (failed || !source)
    return (
      <div
        role="alert"
        className="flex aspect-video flex-col items-center justify-center gap-2 rounded-lg bg-muted p-3 text-center"
      >
        <p className="text-xs text-muted-foreground">
          {t('extension.galleryPreviewError')}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={preview.isFetching}
          onClick={() => void retry()}
        >
          {t('extension.galleryRetryPreview')}
        </Button>
      </div>
    )

  return (
    <>
      <button
        type="button"
        aria-label={t('extension.galleryEnlarge', { label })}
        onClick={() => setOpen(true)}
        className="group relative block aspect-video w-full overflow-hidden rounded-lg bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean"
      >
        <img
          src={source}
          alt={label}
          decoding="async"
          loading="lazy"
          className="h-full w-full object-contain"
          onError={() => setImageFailed(true)}
        />
        <span
          aria-hidden="true"
          className="absolute bottom-2 right-2 rounded-md bg-black/60 p-1.5 text-white opacity-80 transition-opacity group-hover:opacity-100"
        >
          <Maximize2 className="h-4 w-4" />
        </span>
      </button>
      {open && (
        <Dialog open onOpenChange={setOpen}>
          <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-5xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{label}</DialogTitle>
              <DialogDescription>
                {t('extension.galleryPreviewDescription')}
              </DialogDescription>
            </DialogHeader>
            <img
              src={source}
              alt={label}
              decoding="async"
              className="max-h-[65vh] w-full rounded-lg bg-muted object-contain"
              onError={() => {
                setOpen(false)
                setImageFailed(true)
              }}
            />
            {job.prompt && (
              <details className="rounded-lg border border-border p-3 text-sm">
                <summary className="cursor-pointer font-medium">
                  {t('extension.galleryPrompt')}
                </summary>
                <p className="mt-3 whitespace-pre-wrap break-words font-body text-sm text-muted-foreground">
                  {job.prompt}
                </p>
              </details>
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
