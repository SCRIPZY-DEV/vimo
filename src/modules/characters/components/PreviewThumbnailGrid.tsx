import { useTranslation } from 'react-i18next'
import { ImageIcon, Loader2 } from 'lucide-react'
import type { PreviewView } from '@/modules/characters/types/characters'

interface PreviewThumbnailGridProps {
  // Ya vienen filtrados: mientras se genera, el estilo en curso no está
  previews: PreviewView[]
  generating: boolean
  queued?: boolean
  generatingLabel: string
  // Avance del preview en curso (real de Evolink o simulado por el sidecar);
  // null = todavía sin dato, solo el spinner.
  percent: number | null
  labelOf: (styleId: string) => string
}

export function PreviewThumbnailGrid({
  previews,
  generating,
  queued = false,
  generatingLabel,
  percent,
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

  const progress = percent === null ? null : Math.min(100, Math.max(0, percent))

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
          {/* Misma casilla que la grilla de imágenes del pipeline (SceneCell):
              spinner, porcentaje en mono y barra fina abajo. */}
          <div className="relative flex aspect-square w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-ocean/60 bg-ocean/10">
            {queued ? (
              <span className="text-xs text-muted-foreground">
                {t('extension.queued')}
              </span>
            ) : (
              <Loader2 className="h-6 w-6 animate-spin text-ocean" />
            )}
            {!queued && progress !== null && (
              <span className="font-mono text-sm font-bold tabular-nums text-ocean">
                {Math.round(progress)}%
              </span>
            )}
            {!queued && progress !== null && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
                <div
                  className="h-full bg-ocean transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </div>
          <p className="truncate text-center font-body text-xs text-muted-foreground">
            {generatingLabel}
          </p>
        </li>
      )}
    </ul>
  )
}
