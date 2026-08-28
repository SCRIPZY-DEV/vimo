import { useTranslation } from 'react-i18next'
import { LabeledSelect } from '@/modules/videos/components/LabeledSelect'
import type { SceneImageChoice } from '@/modules/videos/types/library'
import { IMAGE_PROVIDERS } from '@/modules/videos/constants'
import {
  defaultQualityFor,
  qualityOptionsFor,
} from '@/modules/videos/utilities/imageQuality'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'

interface SceneQualityPickerProps {
  value: SceneImageChoice
  disabled: boolean
  onChange(value: SceneImageChoice): void
}

// Proveedor + calidad para regenerar UNA escena. La calidad persiste por
// escena; el proveedor es un override transitorio del próximo lote (ADR-0014).
export function SceneQualityPicker({
  value,
  disabled,
  onChange,
}: SceneQualityPickerProps) {
  const { t } = useTranslation()

  const qualityOptions = qualityOptionsFor(value.provider)

  // Los ids de calidad no se comparten entre proveedores: cambiar de
  // proveedor reajusta la calidad a la default.
  const changeProvider = (provider: ImageProviderId) => {
    onChange({ provider, quality: defaultQualityFor(provider) })
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <LabeledSelect
        label={t('library.editor.panel.provider')}
        value={value.provider}
        options={IMAGE_PROVIDERS}
        disabled={disabled}
        onChange={changeProvider}
      />

      <LabeledSelect
        label={t('library.editor.panel.quality')}
        value={value.quality}
        options={qualityOptions.map((option) => ({
          id: option.id,
          label: t(option.labelKey),
        }))}
        disabled={disabled}
        onChange={(quality) => onChange({ ...value, quality })}
      />
    </div>
  )
}
