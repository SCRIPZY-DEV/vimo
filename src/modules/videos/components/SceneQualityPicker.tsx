import { useTranslation } from 'react-i18next'
import { LabeledSelect } from '@/modules/videos/components/LabeledSelect'
import type { SceneImageChoice } from '@/modules/videos/types/library'
import { IMAGE_PROVIDERS } from '@/modules/videos/constants'
import {
  defaultQualityFor,
  qualityOptionsFor,
} from '@/modules/videos/utilities/imageQuality'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'
import type { VideoFormat } from '@pipeline/types/video-format.ts'

interface SceneQualityPickerProps {
  value: SceneImageChoice
  videoFormat: VideoFormat
  disabled: boolean
  onChange(value: SceneImageChoice): void
}

// Proveedor + calidad para regenerar UNA escena. La calidad persiste por
// escena; el proveedor es un override transitorio del próximo lote (ADR-0014).
// En un short solo se ofrecen tamaños verticales (Fal).
export function SceneQualityPicker({
  value,
  videoFormat,
  disabled,
  onChange,
}: SceneQualityPickerProps) {
  const { t } = useTranslation()

  const qualityOptions = qualityOptionsFor(value.provider, videoFormat)

  // Los ids de calidad no se comparten entre proveedores: cambiar de
  // proveedor reajusta la calidad a la default.
  const changeProvider = (provider: ImageProviderId) => {
    onChange({ provider, quality: defaultQualityFor(provider, videoFormat) })
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
          // «16:9 · Low»: el formato con el que está construido el video.
          // Sin precio: el del catálogo no es el precio real por imagen.
          label: t(option.labelKey, { format: videoFormat }),
          note: t(option.noteKey),
        }))}
        disabled={disabled}
        onChange={(quality) => onChange({ ...value, quality })}
      />
    </div>
  )
}
