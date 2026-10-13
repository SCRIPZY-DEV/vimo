import { useTranslation } from 'react-i18next'
import { FlowConnectionBadge } from '@/modules/common/components/FlowConnectionBadge'
import { LabeledSelect } from '@/modules/videos/components/LabeledSelect'
import { IMAGE_PROVIDERS } from '@/modules/videos/constants'
import type { GalleryProviderPickerProps } from '@/modules/videos/types/galleryProvider'

export function GalleryProviderPicker({
  value,
  disabled,
  onChange,
}: GalleryProviderPickerProps) {
  const { t } = useTranslation()
  return (
    <div className="min-w-0 space-y-2">
      <LabeledSelect
        label={t('library.editor.panel.provider')}
        value={value}
        options={IMAGE_PROVIDERS.map((provider) => ({
          id: provider.id,
          label: t(provider.labelKey),
        }))}
        disabled={disabled}
        onChange={onChange}
      />
      {value === 'flow' && <FlowConnectionBadge compact />}
    </div>
  )
}
