import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { RotateCcw } from 'lucide-react'
import { VoiceVendorSwitch } from '@/modules/common/components/VoiceVendorSwitch'
import { VOICE_VENDOR_DEFAULT } from '@/modules/common/constants'
import { Button } from '@/modules/common/ui/button'
import { cn } from '@/modules/common/utilities/cn'
import { useVoiceVendorPreference } from '@/modules/settings/hooks/useVoiceVendorPreference'

// Preferencia «proveedor de voces» (ADR-0024). Esta sección solo conoce la
// PREFERENCIA: cuando no hay ninguna, el vendor efectivo lo decide voices
// según las claves guardadas (DubVoice, o ElevenLabs si es la única), y acá
// se muestra la nota de «automático» en vez de adivinar.

interface VoiceVendorSectionProps {
  // Se llegó con `?focus=voiceVendor`.
  focused: boolean
}

export function VoiceVendorSection({ focused }: VoiceVendorSectionProps) {
  const { t } = useTranslation()
  const { isNative, preference, isLoading, saveVoiceVendor, saving } =
    useVoiceVendorPreference()

  const disabled = !isNative || isLoading || saving
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!focused) return
    sectionRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [focused])

  return (
    <motion.section
      ref={sectionRef}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className={cn(
        'space-y-4 rounded-2xl border-2 bg-card p-6 shadow-card transition-colors',
        focused ? 'border-saffron' : 'border-border',
      )}
    >
      <div>
        <h2 className="font-display text-lg font-bold text-foreground">
          {t('settings.voiceVendorTitle')}
        </h2>
        <p className="font-body text-sm text-muted-foreground">
          {t('settings.voiceVendorTagline')}
        </p>
      </div>

      {!isNative && (
        <p className="font-body text-sm text-saffron">
          {t('settings.soloEscritorio')}
        </p>
      )}

      <div
        className={cn(
          'space-y-3',
          !isNative && 'pointer-events-none opacity-60',
        )}
      >
        <VoiceVendorSwitch
          value={preference ?? VOICE_VENDOR_DEFAULT}
          disabled={disabled}
          onChange={saveVoiceVendor}
        />

        {preference === null ? (
          <p className="font-body text-xs text-muted-foreground">
            {t('settings.voiceVendorAutomaticHint')}
          </p>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => saveVoiceVendor(null)}
            className="rounded-lg font-display text-muted-foreground"
          >
            <RotateCcw className="mr-1.5 h-4 w-4" />
            {t('settings.voiceVendorResetAutomatic')}
          </Button>
        )}
      </div>
    </motion.section>
  )
}
