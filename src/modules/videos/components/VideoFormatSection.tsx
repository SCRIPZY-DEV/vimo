import { useTranslation } from 'react-i18next'
import { RectangleHorizontal } from 'lucide-react'
import { Label } from '@/modules/common/ui/label'
import { cn } from '@/modules/common/utilities/cn'
import { VIDEO_FORMATS } from '@/modules/videos/constants'
import { defaultQualityFor } from '@/modules/videos/utilities/imageQuality'
import type { CreateFormValue } from '@/modules/videos/types/create'

interface VideoFormatSectionProps {
  value: CreateFormValue
  disabled: boolean
  onChange: (patch: Partial<CreateFormValue>) => void
}

export function VideoFormatSection({
  value,
  disabled,
  onChange,
}: VideoFormatSectionProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-3 rounded-xl border-2 border-border bg-card p-4">
      <Label className="flex items-center gap-2 font-display font-semibold">
        <RectangleHorizontal className="h-4 w-4 text-saffron" />
        {t('create.format.label')}
      </Label>

      <div className="grid grid-cols-2 gap-2">
        {VIDEO_FORMATS.map((format) => {
          const selected = value.videoFormat === format.id
          return (
            <button
              key={format.id}
              type="button"
              disabled={disabled}
              // Cambiar de formato resetea la calidad a la default del nuevo
              // formato (los ids de Fal llevan el tamaño exacto).
              onClick={() =>
                onChange({
                  videoFormat: format.id,
                  imageQuality: defaultQualityFor(
                    value.imageProvider,
                    format.id,
                  ),
                })
              }
              // pointer-events-none en los SVG: el cursor no parpadea sobre
              // los trazos del ícono (workaround medido del origen).
              className={cn(
                'rounded-xl border-2 px-4 py-3 text-left transition-all [&_svg]:pointer-events-none',
                selected
                  ? 'border-saffron bg-saffron/10'
                  : 'border-border bg-card hover:border-saffron/40',
              )}
            >
              <span className="flex items-center gap-2 font-display text-sm font-bold text-foreground">
                <format.Icon
                  className={cn('h-4 w-4', selected && 'text-saffron')}
                />
                {t(format.titleKey)}
              </span>
              <span className="font-body text-xs text-muted-foreground">
                {t(format.detailKey)}
              </span>
            </button>
          )
        })}
      </div>

      <p className="font-body text-xs text-muted-foreground">
        {t('create.format.hint')}
      </p>
    </div>
  )
}
