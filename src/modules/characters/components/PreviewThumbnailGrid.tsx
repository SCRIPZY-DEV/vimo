import { useTranslation } from 'react-i18next'
import { ImageIcon, Loader2 } from 'lucide-react'
import { Skeleton } from '@/modules/common/ui/skeleton'
import type { PreviewView } from '@/modules/characters/types/characters'

interface PreviewThumbnailGridProps {
  // Ya vienen filtrados: mientras se genera, el estilo en curso no está
  previews: PreviewView[]
  generating: boolean
  generatingLabel: string
  labelOf: (styleId: string) => string
}

export function PreviewThumbnailGrid({
  previews,
  generating,
  generatingLabel,
  labelOf,
}: PreviewThumbnailGridProps) {
  const { t } = useTranslation()

  if (previews.length === 0 && !generating) {
    return (
      <p className="flex items-center gap-2 font-body text-xs text-muted-foreground">
        <ImageIcon className="h-4 w-4" />
        {t('characters.preview.vacio')}
      </p>
    )
  }

  return (
    <ul className="flex flex-wrap justify-center gap-3">
      {previews.map((preview) => (
        <li
          key={preview.styleId}
          className="w-[calc((100%-1.5rem)/3)] space-y-1"
        >
          <img
            src={preview.url}
            alt=""
            className="aspect-square w-full rounded-xl border border-border object-cover"
          />
          <p className="truncate text-center font-display text-xs font-bold text-foreground">
            {labelOf(preview.styleId)}
          </p>
        </li>
      ))}
      {generating && (
        <li className="w-[calc((100%-1.5rem)/3)] space-y-1">
          <Skeleton className="flex aspect-square w-full items-center justify-center rounded-xl border border-border">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </Skeleton>
          <p className="truncate text-center font-body text-xs text-muted-foreground">
            {generatingLabel}
          </p>
        </li>
      )}
    </ul>
  )
}
