import { useTranslation } from 'react-i18next'
import { LabeledSelect } from '@/modules/videos/components/LabeledSelect'
import { FAL_IMAGE_MODELS, IMAGE_PROVIDERS } from '@/modules/videos/constants'
import {
  defaultQualityFor,
  qualityOptionsFor,
} from '@/modules/videos/utilities/imageQuality'
import type { CreateFormValue } from '@/modules/videos/types/create'
import type {
  FalImageModelId,
  ImageProviderId,
} from '@pipeline/types/image-provider.ts'

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

  const qualityOptions = qualityOptionsFor(value.imageProvider, value.falModel)
  const showQuality = qualityOptions.length > 0

  // Los ids de calidad no se comparten entre proveedores ni modelos, así que
  // cambiar cualquiera de los dos obliga a reajustar la calidad elegida.
  const changeProvider = (provider: ImageProviderId) => {
    onChange({
      imageProvider: provider,
      imageQuality: defaultQualityFor(provider, value.falModel),
    })
  }

  const changeModel = (falModel: FalImageModelId) => {
    onChange({
      falModel,
      imageQuality: defaultQualityFor(value.imageProvider, falModel),
    })
  }

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <LabeledSelect
        label={t('create.image.provider')}
        value={value.imageProvider}
        options={IMAGE_PROVIDERS}
        disabled={disabled}
        onChange={changeProvider}
      />

      {value.imageProvider === 'fal' && (
        <LabeledSelect
          label={t('create.image.model')}
          value={value.falModel}
          options={FAL_IMAGE_MODELS}
          disabled={disabled}
          onChange={changeModel}
        />
      )}

      {showQuality && (
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
      )}
    </div>
  )
}
