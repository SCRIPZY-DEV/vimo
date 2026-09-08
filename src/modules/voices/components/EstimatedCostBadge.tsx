import { useTranslation } from 'react-i18next'
import { Coins } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { VOICE_COST_FACTORS } from '@/modules/voices/constants'
import { vendorOfProvider } from '@/modules/voices/utilities/vendorOfProvider'
import type { VoiceProviderId } from '@pipeline/types/voices.ts'

interface EstimatedCostBadgeProps {
  provider: VoiceProviderId
  characters: number
}

/**
 * Lo que va a costar generar el texto del probador, en la unidad que cobra el
 * vendor: DubVoice descuenta créditos y ElevenLabs directo, caracteres. Con el
 * textarea vacío el badge queda apagado — un costo de cero no merece color.
 */
export function EstimatedCostBadge({
  provider,
  characters,
}: EstimatedCostBadgeProps) {
  const { t, i18n } = useTranslation()

  const units = Math.ceil(characters * VOICE_COST_FACTORS[provider])
  const costKey =
    vendorOfProvider(provider) === 'elevenlabs'
      ? 'voices.probador.estimatedCostCharacters'
      : 'voices.probador.estimatedCostCredits'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 font-display text-sm font-bold transition-colors',
        characters > 0
          ? 'border-ocean/40 bg-ocean/10 text-ocean'
          : 'border-border bg-card text-muted-foreground',
      )}
    >
      <Coins className="h-4 w-4 shrink-0" />
      <span className="tabular-nums">
        {t(costKey, { n: units.toLocaleString(i18n.resolvedLanguage) })}
      </span>
    </span>
  )
}
