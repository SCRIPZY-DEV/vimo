import { useTranslation } from 'react-i18next'
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
import type { FlowRecoveryAction } from '@/modules/common/types/flow'

interface FlowRecoveryConfirmationProps {
  action: FlowRecoveryAction | null
  onConfirm: () => void
  onClose: () => void
}
export function FlowRecoveryConfirmation({
  action,
  onConfirm,
  onClose,
}: FlowRecoveryConfirmationProps) {
  const { t } = useTranslation()
  const retry = action?.type === 'retry'
  const cancel = action?.type === 'cancelBatch'
  const titleKey = retry
    ? 'extension.retryTitle'
    : cancel
      ? 'extension.cancelBatchTitle'
      : 'extension.deleteTitle'
  const bodyKey = retry
    ? 'extension.retryBody'
    : cancel
      ? 'extension.cancelBatchBody'
      : 'extension.deleteBody'
  return (
    <AlertDialog
      open={action !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t(titleKey)}</AlertDialogTitle>
          <AlertDialogDescription>{t(bodyKey)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel type="button">
            {t('extension.back')}
          </AlertDialogCancel>
          <AlertDialogAction type="button" onClick={onConfirm}>
            {t(
              retry
                ? 'extension.confirmRetry'
                : cancel
                  ? 'extension.confirmCancel'
                  : 'extension.confirmDelete',
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
