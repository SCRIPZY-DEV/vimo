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
import type { FlowHistoryTarget } from '@/modules/extension/types/gallery'

interface FlowHistoryConfirmationProps {
  targets: FlowHistoryTarget[] | null
  busy: boolean
  onConfirm: () => void
  onClose: () => void
}

export function FlowHistoryConfirmation({
  targets,
  busy,
  onConfirm,
  onClose,
}: FlowHistoryConfirmationProps) {
  const { t } = useTranslation()
  return (
    <AlertDialog
      open={targets !== null}
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('extension.historyConfirmTitle', {
              count: targets?.length ?? 0,
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('extension.deleteBody')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <p className="text-sm text-muted-foreground">
          {t('extension.historyConfirmScope')}
        </p>
        <ul className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-border p-3">
          {(targets ?? []).map((target) => (
            <li key={target.batchId} className="space-y-1">
              <p className="break-words text-sm font-medium">{target.title}</p>
              <p className="text-xs text-muted-foreground">
                {t('extension.historyJobCount', { count: target.jobCount })}
              </p>
            </li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel type="button" disabled={busy}>
            {t('extension.back')}
          </AlertDialogCancel>
          <AlertDialogAction
            type="button"
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={busy || !targets?.length}
            onClick={onConfirm}
          >
            {t('extension.confirmDelete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
