import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import { apiKeysApi } from '@/modules/api-keys/api'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/modules/common/ui/dialog'
import { Button } from '@/modules/common/ui/button'
import { cn } from '@/modules/common/utilities/cn'
import { StyleCloneCharacterStep } from '@/modules/videos/components/StyleCloneCharacterStep'
import { StyleCloneFailure } from '@/modules/videos/components/StyleCloneFailure'
import { StyleCloneScenesStep } from '@/modules/videos/components/StyleCloneScenesStep'
import { StyleCloneSourceStep } from '@/modules/videos/components/StyleCloneSourceStep'
import { StyleCloneWorkingStep } from '@/modules/videos/components/StyleCloneWorkingStep'
import {
  closeStyleCloneModal,
  openStyleCloneModal,
} from '@/modules/videos/hooks/useStyleCloneModal'
import {
  discardStyleClone,
  renameStyleClone,
  respondStyleClone,
  retryStyleClone,
  startStyleClone,
  useStyleClones,
} from '@/modules/videos/hooks/useStyleClones'
import { styleCloneModalStepOf } from '@/modules/videos/utilities/styleCloneView'
import type { StyleCloneModalTarget } from '@/modules/videos/hooks/useStyleCloneModal'
import type { StyleCloneStartInput } from '@/modules/videos/types/styleClone'

interface StyleCloneModalProps {
  target: StyleCloneModalTarget
}

// El modal del creador de estilo con IA (ADR-0050): el paso de origen de una
// clonación nueva o, para una sesión abierta, el paso en que está (trabajando,
// eligiendo el personaje, mirando las escenas o detenida). Cerrarlo no
// descarta nada: la sesión vive en su store y sigue en segundo plano.
export function StyleCloneModal({ target }: StyleCloneModalProps) {
  const { t } = useTranslation()
  const { sessions } = useStyleClones()
  const session =
    target.kind === 'session' ? sessions.get(target.sessionId) : undefined
  // La sesión terminó (se guardó o se descartó) con el modal abierto.
  const gone = target.kind === 'session' && !session

  useEffect(() => {
    if (gone) closeStyleCloneModal()
  }, [gone])

  if (gone) return null

  const step = session ? styleCloneModalStepOf(session) : 'source'
  // En las escenas de prueba la cabecera a la vista es el campo del nombre y
  // la fila de acciones trae su «Descartar»: las dos cosas las pone el paso.
  const stepOwnsFrame = step === 'scenes'

  const start = (input: StyleCloneStartInput) => {
    // Volver del aviso de imágenes inválidas reemplaza a esa sesión.
    if (session) void discardStyleClone(session.id)
    const sessionId = startStyleClone(input)
    if (sessionId) openStyleCloneModal({ kind: 'session', sessionId })
  }

  const discard = () => {
    if (!session) return
    if (!window.confirm(t('create.styleClone.discardConfirm'))) return
    void discardStyleClone(session.id)
    closeStyleCloneModal()
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) closeStyleCloneModal()
      }}
    >
      <DialogContent
        // Los pasos con imágenes para comparar piden más ancho.
        className={cn(
          'max-h-[90vh] overflow-y-auto',
          step === 'character' || step === 'scenes' ? 'max-w-5xl' : 'max-w-3xl',
        )}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {/* El título y la descripción siguen para los lectores de pantalla
            aunque no estén a la vista. */}
        <DialogHeader className={cn(stepOwnsFrame && 'sr-only')}>
          <DialogTitle className="font-display">
            {session && step !== 'source'
              ? session.name
              : t('create.styleClone.modalTitle')}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t('create.styleClone.modalDescription')}
          </DialogDescription>
        </DialogHeader>

        {step === 'source' && (
          <StyleCloneSourceStep
            // Una sesión rechazada siembra el paso con lo que traía.
            key={session?.id ?? 'new'}
            rejected={session ?? null}
            onStart={start}
          />
        )}
        {session && step === 'working' && (
          <StyleCloneWorkingStep session={session} />
        )}
        {session && step === 'character' && (
          <StyleCloneCharacterStep
            // Otra ronda de diseños = otra elección: el paso arranca limpio.
            key={session.designsRound}
            session={session}
            onRespond={(response) => respondStyleClone(session.id, response)}
          />
        )}
        {session && step === 'scenes' && (
          <StyleCloneScenesStep
            key={session.scenesRound}
            session={session}
            onRename={(name) => renameStyleClone(session.id, name)}
            onRespond={(response) => respondStyleClone(session.id, response)}
            onDiscard={discard}
          />
        )}
        {session && step === 'failed' && (
          <StyleCloneFailure
            session={session}
            onRetry={() => retryStyleClone(session.id)}
            onDiscard={discard}
            onReload={() =>
              void apiKeysApi.openBillingPage(session.imageProvider)
            }
          />
        )}

        {/* Mientras trabaja o elige el personaje, la clonación se puede
            abandonar desde acá (detenida, su aviso ya trae «Descartar»; en las
            escenas va en la fila de «Aprobar y guardar»). */}
        {session &&
          step !== 'source' &&
          step !== 'failed' &&
          !stepOwnsFrame && (
            <div className="flex justify-start border-t border-border pt-3">
              <Button type="button" size="sm" variant="ghost" onClick={discard}>
                <Trash2 className="mr-2 h-4 w-4" />
                {t('create.styleClone.discard')}
              </Button>
            </div>
          )}
      </DialogContent>
    </Dialog>
  )
}
