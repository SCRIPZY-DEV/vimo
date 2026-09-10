import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import { LabeledProgress } from '@/modules/common/components/LabeledProgress'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/modules/common/ui/alert-dialog'
import { Button } from '@/modules/common/ui/button'
import { useAppUpdate } from '@/modules/settings/hooks/useAppUpdate'
import { UpdatePhase } from '../types/updates'

// Aviso global de versión nueva (ADR-0027): aparece en cualquier pantalla
// cuando el chequeo del arranque encuentra un update. «Más tarde» lo oculta
// hasta el próximo chequeo manual desde Ajustes.
export function UpdatePrompt() {
  const { t } = useTranslation()
  const { phase, update, progressPercent, dismissed, install, dismiss } =
    useAppUpdate()

  const installing = phase === UpdatePhase.installing
  const open =
    !dismissed &&
    update !== null &&
    (phase === UpdatePhase.available || installing)
  if (!update) return null

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (next || installing) return
        dismiss()
      }}
    >
      <AlertDialogContent className="rounded-2xl border-2 border-border">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display text-xl font-extrabold">
            {t('settings.updatesPromptTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription className="font-body">
            {t('settings.updatesPromptDescription', {
              version: update.version,
              currentVersion: update.currentVersion,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {update.notes && (
          <div className="space-y-1">
            <p className="font-display text-sm font-bold text-foreground">
              {t('settings.updatesNotesTitle')}
            </p>
            <p className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 font-body text-sm text-muted-foreground">
              {update.notes}
            </p>
          </div>
        )}

        {installing && (
          <LabeledProgress
            label={t('settings.updatesDownloading')}
            percent={progressPercent}
          />
        )}

        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={installing}
            className="rounded-lg font-display"
          >
            {t('settings.updatesLater')}
          </AlertDialogCancel>
          <Button
            onClick={install}
            disabled={installing}
            className="rounded-lg font-display"
          >
            <Download className="mr-1.5 h-4 w-4" />
            {t('settings.updatesInstall')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
