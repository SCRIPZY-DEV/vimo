import { useTranslation } from 'react-i18next'
import { SelectableCard } from '@/modules/common/components/SelectableCard'
import { Label } from '@/modules/common/ui/label'
import { VIDEO_STYLES } from '@/modules/videos/constants'
import type { CharacterStyleId } from '@pipeline/types/characters.ts'

interface StyleGalleryProps {
  value: CharacterStyleId
  disabled: boolean
  onChange: (styleId: CharacterStyleId) => void
}

export function StyleGallery({ value, disabled, onChange }: StyleGalleryProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-2">
      <Label className="font-display">{t('create.style.label')}</Label>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {VIDEO_STYLES.map((style) => {
          const isSelected = style.id === value
          return (
            <SelectableCard
              key={style.id}
              selected={isSelected}
              disabled={disabled}
              onClick={() => onChange(style.id)}
              className="text-center"
            >
              <span className="font-display text-sm font-bold text-foreground">
                {t(style.labelKey)}
              </span>
            </SelectableCard>
          )
        })}
      </div>
      <p className="font-body text-xs text-muted-foreground">
        {t('create.style.hint')}
      </p>
    </div>
  )
}
