import { useTranslation } from 'react-i18next'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { Switch } from '@/modules/common/ui/switch'
import { cn } from '@/modules/common/utilities/cn'
import { SliderRow } from '@/modules/common/components/SliderRow'
import {
  MINIMAX_EMOTIONS,
  VOICE_SETTINGS_DEFAULTS,
} from '@/modules/voices/constants'
import type { VoiceProviderId } from '@pipeline/types/voices.ts'
import type { VoiceSettingsFormValue } from '@/modules/voices/types/voices'

interface VoiceSettingsPanelProps {
  provider: VoiceProviderId
  value: VoiceSettingsFormValue
  onChange: (value: VoiceSettingsFormValue) => void
  disabled: boolean
}

/**
 * Ajustes de síntesis por motor (rangos del origen). En Edge solo se ofrece
 * volumen: rate/pitch devuelven audio vacío vía DubVoice.
 */
export function VoiceSettingsPanel({
  provider,
  value,
  onChange,
  disabled,
}: VoiceSettingsPanelProps) {
  const { t } = useTranslation()

  const patch = (partial: Partial<VoiceSettingsFormValue>) => {
    onChange({ ...value, ...partial })
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-background p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-sm font-bold text-foreground">
          {t('voices.ajustes.titulo')}
        </p>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => onChange(VOICE_SETTINGS_DEFAULTS)}
          className="h-7 rounded-lg font-display text-xs text-muted-foreground"
        >
          <RotateCcw className="mr-1 h-3 w-3" />
          {t('voices.ajustes.restaurar')}
        </Button>
      </div>

      {provider === 'minimax' && (
        <>
          <SliderRow
            id="voice-speed"
            label={t('voices.ajustes.velocidad')}
            min={0.5}
            max={2}
            step={0.05}
            value={value.speed}
            disabled={disabled}
            onChange={(speed) => patch({ speed })}
          />
          <SliderRow
            id="voice-pitch"
            label={t('voices.ajustes.tono')}
            min={-12}
            max={12}
            step={1}
            value={value.pitch}
            disabled={disabled}
            onChange={(pitch) => patch({ pitch })}
          />
          <SliderRow
            id="voice-volume"
            label={t('voices.ajustes.volumen')}
            min={0.5}
            max={10}
            step={0.5}
            value={value.volume}
            disabled={disabled}
            onChange={(volume) => patch({ volume })}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-28 shrink-0 font-body text-sm text-muted-foreground">
              {t('voices.ajustes.emocion')}
            </span>
            {MINIMAX_EMOTIONS.map((emotion) => {
              const selected = value.emotion === emotion
              return (
                <button
                  key={emotion || 'auto'}
                  type="button"
                  disabled={disabled}
                  onClick={() => patch({ emotion })}
                  className={cn(
                    'rounded-full border px-2.5 py-1 font-body text-xs transition-colors',
                    selected
                      ? 'border-saffron bg-saffron font-semibold text-charcoal'
                      : 'border-border bg-card text-muted-foreground hover:border-saffron/40 hover:text-foreground',
                  )}
                >
                  {emotion
                    ? t(`voices.ajustes.emociones.${emotion}`)
                    : t('voices.ajustes.emociones.auto')}
                </button>
              )
            })}
          </div>
        </>
      )}

      {provider === 'elevenlabs' && (
        <>
          <SliderRow
            id="voice-speed"
            label={t('voices.ajustes.velocidad')}
            min={0.7}
            max={1.2}
            step={0.05}
            value={value.speed}
            disabled={disabled}
            onChange={(speed) => patch({ speed })}
          />
          <SliderRow
            id="voice-stability"
            label={t('voices.ajustes.estabilidad')}
            min={0}
            max={1}
            step={0.05}
            value={value.stability}
            disabled={disabled}
            onChange={(stability) => patch({ stability })}
          />
          <SliderRow
            id="voice-similarity"
            label={t('voices.ajustes.similitud')}
            min={0}
            max={1}
            step={0.05}
            value={value.similarity}
            disabled={disabled}
            onChange={(similarity) => patch({ similarity })}
          />
          <SliderRow
            id="voice-style"
            label={t('voices.ajustes.estilo')}
            min={0}
            max={1}
            step={0.05}
            value={value.style}
            disabled={disabled}
            onChange={(style) => patch({ style })}
          />
          <label className="flex cursor-pointer items-center gap-3 font-body text-sm text-muted-foreground">
            <span className="w-28 shrink-0">
              {t('voices.ajustes.speakerBoost')}
            </span>
            <Switch
              checked={value.speakerBoost}
              disabled={disabled}
              onCheckedChange={(speakerBoost) => patch({ speakerBoost })}
            />
          </label>
        </>
      )}

      {provider === 'edge' && (
        <SliderRow
          id="voice-volume-edge"
          label={t('voices.ajustes.volumen')}
          min={0}
          max={100}
          step={5}
          value={value.volumeEdge}
          disabled={disabled}
          onChange={(volumeEdge) => patch({ volumeEdge })}
        />
      )}
    </div>
  )
}
