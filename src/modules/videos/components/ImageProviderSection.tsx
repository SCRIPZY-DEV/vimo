import { useTranslation } from 'react-i18next'
import { LabeledSelect } from '@/modules/videos/components/LabeledSelect'
import { IMAGE_PROVIDERS } from '@/modules/videos/constants'
import {
  defaultQualityFor,
  qualityOptionsFor,
} from '@/modules/videos/utilities/imageQuality'
import type { CreateFormValue } from '@/modules/videos/types/create'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'

interface ImageProviderSectionProps {
  value: CreateFormValue
  disabled: boolean
  onChange: (patch: Partial<CreateFormValue>) => void
}

export function ImageProviderSection({
  value,
  disabled,
  onChange,
}: ImageProviderSectionProps) {
  const { t } = useTranslation()

  const qualityOptions = qualityOptionsFor(value.imageProvider)

  // Los ids de calidad no se comparten entre proveedores, así que cambiar de
  // proveedor obliga a reajustar la calidad elegida.
  const changeProvider = (provider: ImageProviderId) => {
    onChange({
      imageProvider: provider,
      imageQuality: defaultQualityFor(provider),
    })
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <LabeledSelect
        label={t('create.image.provider')}
        value={value.imageProvider}
        options={IMAGE_PROVIDERS}
        disabled={disabled}
        onChange={changeProvider}
      />

      <LabeledSelect
        label={t('create.image.quality')}
        value={value.imageQuality}
        options={qualityOptions.map((option) => ({
          id: option.id,
          label: t(option.labelKey),
        }))}
        disabled={disabled}
        onChange={(imageQuality) => onChange({ imageQuality })}
      />
    </div>
  )
}
