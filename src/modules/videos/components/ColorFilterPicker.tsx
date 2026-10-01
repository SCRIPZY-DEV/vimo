import { useTranslation } from 'react-i18next'
import { SegmentedTabs } from '@/modules/common/components/SegmentedTabs'
import { COLOR_FILTER_LABEL_KEYS } from '@/modules/videos/constants'
import { COLOR_FILTER_IDS } from '@/modules/videos/utilities/gemTemplate'
import type { ColorFilterId } from '@pipeline/types/styles.ts'

interface ColorFilterPickerProps {
  value: ColorFilterId
  disabled: boolean
  onChange: (value: ColorFilterId) => void
}

// El filtro de color del estilo (spec §5.5): uno de tres presets, que el
// sidecar aplica al video terminado. Presentacional.
export function ColorFilterPicker({
  value,
  disabled,
  onChange,
}: ColorFilterPickerProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium">
        {t('create.gemTemplate.colorFilterTitle')}
      </p>
      <SegmentedTabs
        value={value}
        ariaLabel={t('create.gemTemplate.colorFilterTitle')}
        disabled={disabled}
        options={COLOR_FILTER_IDS.map((id) => ({
          id,
          label: t(COLOR_FILTER_LABEL_KEYS[id]),
        }))}
        onChange={onChange}
      />
      <p className="font-body text-xs text-muted-foreground">
        {t('create.gemTemplate.colorFilterHint')}
      </p>
    </div>
  )
}
