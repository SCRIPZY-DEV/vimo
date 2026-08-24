import { useTranslation } from 'react-i18next'
import { Label } from '@/modules/common/ui/label'
import { cn } from '@/modules/common/utilities/cn'
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
            <button
              key={style.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(style.id)}
              className={cn(
                'rounded-xl border-2 bg-card px-3 py-3 text-center transition-colors',
                isSelected
                  ? 'border-saffron bg-saffron/10'
                  : 'border-border hover:border-saffron/40',
                disabled && 'pointer-events-none opacity-60',
              )}
            >
              <span className="font-display text-sm font-bold text-foreground">
                {t(style.labelKey)}
              </span>
            </button>
          )
        })}
      </div>
      <p className="font-body text-xs text-muted-foreground">
        {t('create.style.hint')}
      </p>
    </div>
  )
}
