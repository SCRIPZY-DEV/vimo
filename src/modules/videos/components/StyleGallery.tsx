import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { StyleCard } from '@/modules/videos/components/StyleCard'
import { VIDEO_STYLES } from '@/modules/videos/constants'
import { styleReferenceImages } from '@/modules/videos/utilities/styleReferences'
import type { CharacterStyleId } from '@pipeline/types/characters.ts'

interface StyleGalleryProps {
  value: CharacterStyleId
  disabled: boolean
  onChange: (styleId: CharacterStyleId) => void
}

export function StyleGallery({ value, disabled, onChange }: StyleGalleryProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-3">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500">
          <Check className="h-4 w-4 text-white" strokeWidth={3} />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-lg font-extrabold leading-tight text-foreground">
            {t('create.style.label')}
          </h3>
          <p className="font-body text-sm leading-snug text-muted-foreground">
            {t('create.style.hint')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {VIDEO_STYLES.map((style) => (
          <StyleCard
            key={style.id}
            images={styleReferenceImages(style.id)}
            title={t(style.labelKey)}
            description={t(style.descriptionKey)}
            selected={style.id === value}
            disabled={disabled}
            onSelect={() => onChange(style.id)}
          />
        ))}
      </div>
    </div>
  )
}
