import { useTranslation } from 'react-i18next'
import {
  VOICE_VENDOR_IDS,
  VOICE_VENDOR_LABELS,
} from '@/modules/common/constants'
import { Tabs, TabsList, TabsTrigger } from '@/modules/common/ui/tabs'
import { cn } from '@/modules/common/utilities/cn'
import type { VoiceVendorId } from '@pipeline/types/voices.ts'

interface VoiceVendorSwitchProps {
  value: VoiceVendorId
  onChange(next: VoiceVendorId): void
  disabled?: boolean
  size?: 'sm' | 'md'
}

// Segmented control DubVoice / ElevenLabs. Presentacional: Ajustes lo monta
// sobre la preferencia; Voces y el picker de Crear sobre un estado local que
// arranca en el proveedor por defecto (ADR-0024).
export function VoiceVendorSwitch({
  value,
  onChange,
  disabled = false,
  size = 'md',
}: VoiceVendorSwitchProps) {
  const { t } = useTranslation()

  return (
    <Tabs
      value={value}
      onValueChange={(next) => onChange(next as VoiceVendorId)}
    >
      <TabsList
        aria-label={t('common.voiceVendor.ariaLabel')}
        className={cn(
          'rounded-xl border-2 border-border bg-muted/40',
          size === 'sm' ? 'h-9' : 'h-11',
        )}
      >
        {VOICE_VENDOR_IDS.map((vendor) => (
          <TabsTrigger
            key={vendor}
            value={vendor}
            disabled={disabled}
            // El activo en saffron pleno, como los chips de filtro: el blanco
            // del trigger común no se distinguía sobre la pista gris.
            className={cn(
              'rounded-lg font-display data-[state=active]:bg-saffron data-[state=active]:font-bold data-[state=active]:text-charcoal',
              size === 'sm' ? 'px-3 text-xs' : 'px-4 text-sm',
            )}
          >
            {VOICE_VENDOR_LABELS[vendor]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
