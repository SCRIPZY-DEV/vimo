import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  Ban,
  Hourglass,
  Loader2,
  RefreshCw,
  Shuffle,
} from 'lucide-react'
import { Alert } from '@/modules/common/components/Alert'
import { PromptModelSelector } from '@/modules/common/components/PromptModelSelector'
import { usePromptModelBlocks } from '@/modules/common/hooks/usePromptModelBlocks'
import { usePromptModels } from '@/modules/common/hooks/usePromptModels'
import { Button } from '@/modules/common/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/modules/common/ui/dialog'
import { allPromptModelsBlocked } from '@/modules/common/utilities/allPromptModelsBlocked'
import { resolvePromptModel } from '@/modules/common/utilities/resolvePromptModel'
import type { CreateTask } from '@/modules/videos/types/create'

interface PromptModelIssueDialogProps {
  task: CreateTask
  // Abierto a mano desde la tarjeta de error: va directo a elegir otro modelo.
  forceOpen: boolean
  // Traba: «seguir esperando» (el job sigue). Detenido: cerrar sin decidir
  // (la tarjeta de error conserva las dos salidas).
  onDismiss: () => void
  // Detenido por fallo: relanzar con el MISMO modelo.
  onRetry: () => void
  onSwitch: (modelId: string) => void
  // Con todos los modelos bloqueados la única salida es cancelar.
  onCancel: () => void
}

// El modelo de prompts se trabó o falló (ADR-0028): ya quedó bloqueado una
// hora. Con la traba el job sigue y se decide si esperar; con el fallo el job
// ya se detuvo y NADA avanza hasta elegir: reintentar con el mismo modelo o
// relanzar el mismo proyecto con otro. Plantilla visual de TtsProviderDownDialog.
export function PromptModelIssueDialog({
  task,
  forceOpen,
  onDismiss,
  onRetry,
  onSwitch,
  onCancel,
}: PromptModelIssueDialogProps) {
  const { t } = useTranslation()
  const { models, defaultId, batchSize } = usePromptModels()
  const { blockedIds } = usePromptModelBlocks()
  const [picking, setPicking] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)

  const issue = task.promptModelIssue
  const halting = task.promptModelSwitch === 'halting'
  const switching =
    task.promptModelSwitch === 'cancelling' ||
    task.promptModelSwitch === 'relaunching'
  const busy = halting || switching
  const generating = task.status === 'generating'
  // Detenido por fallo del modelo: el job ya no corre.
  const halted = task.status === 'error' && issue?.reason === 'error'
  const open =
    busy ||
    forceOpen ||
    (issue !== null &&
      issue.snoozedUntil === null &&
      ((issue.reason === 'stalled' && generating) || halted))
  if (!open) return null

  const reason = issue?.reason ?? 'error'
  const troubledId = issue?.modelId ?? task.promptModel
  const troubledModel = models.find((model) => model.id === troubledId)
  const troubledLabel = troubledModel?.label ?? troubledId ?? ''
  const allBlocked = allPromptModelsBlocked(models, blockedIds)
  const candidate = resolvePromptModel(picked, models, defaultId, blockedIds)
  const candidateLabel =
    models.find((model) => model.id === candidate)?.label ?? candidate ?? ''
  // Desde la tarjeta de error no hay job que seguir esperando: se elige.
  // Una tarea antigua puede apuntar a un modelo que ya no se ofrece. Tampoco
  // se habilita reintentarlo mientras el catálogo todavía no esté disponible.
  const choosing = picking || forceOpen || switching || !troubledModel

  const close = () => {
    setPicking(false)
    setPicked(null)
    onDismiss()
  }

  return (
    <Dialog open onOpenChange={(next) => !next && !busy && close()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-coral/15 p-2">
              {reason === 'stalled' ? (
                <Hourglass className="h-5 w-5 text-coral-text" />
              ) : (
                <AlertCircle className="h-5 w-5 text-coral-text" />
              )}
            </div>
            <div className="flex-1">
              <DialogTitle className="font-display text-lg font-semibold">
                {t(`create.promptModelIssue.${reason}.title`, {
                  model: troubledLabel,
                })}
              </DialogTitle>
              <DialogDescription className="mt-1.5 text-sm text-muted-foreground">
                {t(`create.promptModelIssue.${reason}.body`, {
                  model: troubledLabel,
                })}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {troubledModel && (
          <div className="mt-2 rounded-lg bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
            {t('create.promptModelIssue.blockedHint', { model: troubledLabel })}
          </div>
        )}

        {busy && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border-2 border-saffron/40 bg-saffron/5 p-4">
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-saffron" />
            <p className="font-display text-sm font-bold text-foreground">
              {halting
                ? t('create.promptModelIssue.halting')
                : t('create.promptModelIssue.switching', {
                    model: candidateLabel,
                  })}
            </p>
          </div>
        )}

        {choosing && !busy && allBlocked && (
          <div className="mt-4 space-y-3">
            <Alert tone="warning">
              {t('common.promptModelBlocked.allBlocked')}
            </Alert>
            <p className="font-body text-sm text-muted-foreground">
              {t('create.promptModelIssue.allBlockedHint')}
            </p>
          </div>
        )}

        {choosing && !busy && !allBlocked && candidate && (
          <div className="mt-4">
            <PromptModelSelector
              models={models}
              value={candidate}
              gemChars={0}
              batchSize={batchSize}
              withCharacterPhase={false}
              disabled={false}
              showSimulator={false}
              onChange={setPicked}
            />
          </div>
        )}

        <DialogFooter className="mt-4 gap-2 sm:gap-2">
          {!troubledModel && generating && !candidate && !busy && (
            <Button variant="outline" onClick={close}>
              <Hourglass className="mr-1.5 h-4 w-4" />
              {t('create.promptModelIssue.keepWaiting')}
            </Button>
          )}
          {!choosing && !halting && (
            <>
              {halted ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    close()
                    onRetry()
                  }}
                >
                  <RefreshCw className="mr-1.5 h-4 w-4" />
                  {t('create.promptModelIssue.retrySame', {
                    model: troubledLabel,
                  })}
                </Button>
              ) : (
                <Button variant="outline" onClick={close}>
                  <Hourglass className="mr-1.5 h-4 w-4" />
                  {t('create.promptModelIssue.keepWaiting')}
                </Button>
              )}
              <Button onClick={() => setPicking(true)}>
                <Shuffle className="mr-1.5 h-4 w-4" />
                {t('create.promptModelIssue.switchModel')}
              </Button>
            </>
          )}
          {choosing && allBlocked && (
            <Button variant="destructive" disabled={busy} onClick={onCancel}>
              <Ban className="mr-1.5 h-4 w-4" />
              {t('create.promptModelIssue.cancelToLibrary')}
            </Button>
          )}
          {choosing && !allBlocked && candidate && (
            <>
              {generating && (
                <Button variant="outline" disabled={busy} onClick={close}>
                  <Hourglass className="mr-1.5 h-4 w-4" />
                  {t('create.promptModelIssue.keepWaiting')}
                </Button>
              )}
              <Button
                disabled={busy || !candidate}
                onClick={() => {
                  if (!candidate) return
                  setPicking(false)
                  setPicked(null)
                  onSwitch(candidate)
                }}
              >
                {switching ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 h-4 w-4" />
                )}
                {t('create.promptModelIssue.relaunchWith', {
                  model: candidateLabel,
                })}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
