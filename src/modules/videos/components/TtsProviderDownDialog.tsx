import { useTranslation } from 'react-i18next'
import { Button } from '@/modules/common/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/modules/common/ui/dialog'
import type { ProbeTtsReason } from '@pipeline/types/video-project.ts'

interface TtsProviderDownDialogProps {
  reason: ProbeTtsReason
  onRetry: () => void
  onClose: () => void
}

export function TtsProviderDownDialog({
  reason,
  onRetry,
  onClose,
}: TtsProviderDownDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">
            {t('create.probe.title')}
          </DialogTitle>
          <DialogDescription>
            {t(`create.probe.reason.${reason}`)}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={onClose}
            className="rounded-xl font-display"
          >
            {t('create.probe.changeVoice')}
          </Button>
          <Button
            onClick={onRetry}
            className="rounded-xl font-display font-bold"
          >
            {t('create.probe.retry')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
