import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, ExternalLink, Mic } from 'lucide-react'
import { VOICE_VENDOR_LABELS } from '@/modules/common/constants'
import { Button } from '@/modules/common/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/modules/common/ui/dialog'
import { VoicePickerModal } from '@/modules/videos/components/VoicePickerModal'
import { voicesApi } from '@/modules/voices/api'
import type { SelectedVoice } from '@/modules/videos/types/create'
import type { VoiceVendorId } from '@pipeline/types/voices.ts'

interface VoiceSwitchDialogProps {
  // Proveedor de la voz que falló: su panel es donde se revisa el historial.
  vendor: VoiceVendorId | null
  // El fallo pudo dejar una generación aceptada (y cobrada) por el proveedor.
  maybePaid: boolean
  onSelect: (voice: SelectedVoice) => void
  onClose: () => void
}

// «Cambiar voz» tras un fallo de la narración (ADR-0053): primero un aviso
// para revisar el historial del proveedor (la generación pudo cobrarse y se
// pierde al cambiar); al continuar, el mismo selector de voz de Crear.
export function VoiceSwitchDialog({
  vendor,
  maybePaid,
  onSelect,
  onClose,
}: VoiceSwitchDialogProps) {
  const { t } = useTranslation()
  const [picking, setPicking] = useState(false)

  if (picking)
    return (
      <VoicePickerModal current={null} onSelect={onSelect} onClose={onClose} />
    )

  const provider = vendor ? VOICE_VENDOR_LABELS[vendor] : null

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-coral/15 p-2">
              <AlertCircle className="h-5 w-5 text-coral" />
            </div>
            <div className="flex-1">
              <DialogTitle className="font-display text-lg font-semibold">
                {t('create.voiceSwitch.title')}
              </DialogTitle>
              <DialogDescription className="mt-1.5 text-sm text-muted-foreground">
                {provider
                  ? t('create.voiceSwitch.checkHistory', { provider })
                  : t('create.voiceSwitch.checkHistoryUnknown')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {maybePaid && (
          <div className="space-y-2">
            <p className="rounded-lg bg-coral/10 px-3 py-2.5 font-body text-sm text-foreground">
              {provider
                ? t('create.voiceSwitch.maybePaid', { provider })
                : t('create.voiceSwitch.maybePaidUnknown')}
            </p>
            <p className="font-body text-xs text-muted-foreground">
              {t('create.voiceSwitch.discardHint')}
            </p>
          </div>
        )}

        <DialogFooter className="mt-2 gap-2 sm:gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('create.voiceSwitch.cancel')}
          </Button>
          {vendor && (
            <Button
              variant="outline"
              onClick={() => void voicesApi.openHistoryPage(vendor)}
            >
              <ExternalLink className="mr-1.5 h-4 w-4" />
              {t('create.voiceSwitch.openHistory', { provider })}
            </Button>
          )}
          <Button
            onClick={() => setPicking(true)}
            className="bg-saffron font-display font-bold text-charcoal hover:bg-saffron/90"
          >
            <Mic className="mr-1.5 h-4 w-4" />
            {t('create.voiceSwitch.continue')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
