import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/modules/common/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/modules/common/ui/alert-dialog'
import type { FlowRestartRequest } from '@/modules/common/types/flow'

interface FlowRestartButtonProps {
  onRestart: (request: FlowRestartRequest) => void
  disabled?: boolean
}
export function FlowRestartButton({
  onRestart,
  disabled = false,
}: FlowRestartButtonProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const request = useRef<FlowRestartRequest | null>(null)
  const confirm = () => {
    request.current ??= {
      flowRestartRequestId: crypto.randomUUID(),
      flowAcknowledgeDuplicateRisk: true,
    }
    onRestart(request.current)
    setOpen(false)
  }
  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {t('extension.restartButton')}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('extension.restartTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('extension.restartBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">
              {t('extension.back')}
            </AlertDialogCancel>
            <AlertDialogAction type="button" onClick={confirm}>
              {t('extension.restartConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
