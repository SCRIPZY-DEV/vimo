import { useTranslation } from 'react-i18next'
import { Check, Loader2, PauseCircle } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { PIPELINE_STAGES } from '@/modules/videos/constants'
import type { StageId } from '@pipeline/runner/stage-id.ts'
import type { ImagesRecoveryView } from '@/modules/videos/types/create'

interface StageBarProps {
  currentStage: StageId | null
  completedStages: StageId[]
  // En pausa de confirmación: la fase que espera muestra pausa honesta en
  // vez de un spinner mentiroso (el job está cerrado).
  paused: boolean
  // Pasada de recuperación de imágenes en curso: con `rewrite` la fila de
  // prompts vuelve a «en curso» (la fase sigue completa para el runner, pero
  // para la persona los prompts NO están listos) y la de imágenes espera.
  recovery: ImagesRecoveryView | null
}

// Sub-línea de la pasada de recuperación bajo la fila que la sufre: la
// reescritura de prompts bajo prompts, el reintento de imágenes bajo imágenes.
function recoveryNote(
  stageId: StageId,
  recovery: ImagesRecoveryView | null,
): { key: string; values: Record<string, number> } | null {
  if (!recovery) return null
  if (recovery.kind === 'rewrite' && stageId === 'scene-prompts') {
    return {
      key: 'create.progress.recovery.rewritingPrompts',
      values: { count: recovery.sceneIds.length },
    }
  }
  if (recovery.kind === 'retry' && stageId === 'images') {
    return {
      key: 'create.progress.recovery.retryingImages',
      values: {
        count: recovery.sceneIds.length,
        pass: recovery.pass,
        maxPasses: recovery.maxPasses,
      },
    }
  }
  return null
}

// Lista de fases (port de BarraDeFases del origen): completada en saffron,
// en curso en ocean, en pausa en saffron pleno con «te está esperando»,
// pendiente neutra con un punto. Un escalón más grande que el origen (alto,
// ícono y texto): a ventana completa la lista se veía diminuta.
export function StageBar({
  currentStage,
  completedStages,
  paused,
  recovery,
}: StageBarProps) {
  const { t } = useTranslation()

  const rewriting = recovery?.kind === 'rewrite'

  // Con el job cerrado en pausa no hay currentStage: la fase que espera es
  // la primera sin completar.
  const pausedStageId = paused
    ? (PIPELINE_STAGES.find((stage) => !completedStages.includes(stage.id))
        ?.id ?? null)
    : null

  return (
    <ul className="space-y-2">
      {PIPELINE_STAGES.map((stage) => {
        const reopened = rewriting && stage.id === 'scene-prompts'
        const done = completedStages.includes(stage.id) && !reopened
        const waiting = stage.id === pausedStageId
        const active =
          !done &&
          !waiting &&
          (rewriting ? reopened : currentStage === stage.id)
        const pending = !done && !waiting && !active
        const note = recoveryNote(stage.id, recovery)

        return (
          <li
            key={stage.id}
            className={cn(
              'flex items-center gap-3 rounded-lg border-2 px-4 py-3.5 transition-colors',
              done && 'border-saffron/40 bg-saffron/5',
              active && 'border-ocean/60 bg-ocean/5',
              waiting && 'border-saffron bg-saffron/10',
              pending && 'border-border bg-card',
            )}
          >
            <span
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                done && 'bg-saffron text-charcoal',
                active && 'bg-ocean text-white',
                waiting && 'bg-saffron text-charcoal',
                pending && 'bg-muted text-muted-foreground',
              )}
            >
              {done ? (
                <Check className="h-4 w-4" strokeWidth={3} />
              ) : active ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : waiting ? (
                <PauseCircle className="h-4 w-4" />
              ) : (
                <span className="text-xs font-bold">·</span>
              )}
            </span>
            <span
              className={cn(
                'font-display text-base font-semibold',
                pending && 'text-muted-foreground',
              )}
            >
              {t(stage.labelKey)}
              {waiting && (
                <span className="block font-body text-sm font-normal text-saffron">
                  {t('create.progress.waitingForYou')}
                </span>
              )}
              {note && (
                <span className="block font-body text-sm font-normal text-ocean">
                  {t(note.key, note.values)}
                </span>
              )}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
