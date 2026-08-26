import { useTranslation } from 'react-i18next'
import { LabeledSelect } from '@/modules/videos/components/LabeledSelect'
import type { SceneImageChoice } from '@/modules/videos/types/library'
import {
  EVOLINK_ONLY_MODEL,
  FAL_IMAGE_MODELS,
  IMAGE_PROVIDERS,
} from '@/modules/videos/constants'
import {
  defaultQualityFor,
  qualityOptionsFor,
} from '@/modules/videos/utilities/imageQuality'
import type {
  FalImageModelId,
  ImageProviderId,
} from '@pipeline/types/image-provider.ts'

interface SceneModelQualityPickerProps {
  value: SceneImageChoice
  disabled: boolean
  onChange(value: SceneImageChoice): void
}

// Proveedor + modelo + calidad para regenerar UNA escena. Modelo y calidad
// persisten por escena; el proveedor es un override transitorio del próximo
// lote (ADR-0014).
export function SceneModelQualityPicker({
  value,
  disabled,
  onChange,
}: SceneModelQualityPickerProps) {
  const { t } = useTranslation()

  const qualityOptions = qualityOptionsFor(value.provider, value.model)
  const showQuality = qualityOptions.length > 0

  // Los ids de calidad no se comparten entre proveedores ni modelos: cambiar
  // cualquiera de los dos reajusta la calidad a la default.
  const changeProvider = (provider: ImageProviderId) => {
    const model = provider === 'evolink' ? EVOLINK_ONLY_MODEL : value.model
    onChange({ provider, model, quality: defaultQualityFor(provider, model) })
  }

  const changeModel = (model: FalImageModelId) => {
    onChange({
      ...value,
      model,
      quality: defaultQualityFor(value.provider, model),
    })
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

      {value.provider === 'fal' && (
        <LabeledSelect
          label={t('library.editor.panel.model')}
          value={value.model}
          options={FAL_IMAGE_MODELS}
          disabled={disabled}
          onChange={changeModel}
        />
      )}

      {showQuality && (
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
      )}
    </div>
  )
}
