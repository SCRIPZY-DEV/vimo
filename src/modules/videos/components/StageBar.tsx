import { useTranslation } from 'react-i18next'
import { Check, Loader2, PauseCircle } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import {
  ACTIVE_STAGE_TONES,
  DEFAULT_ACTIVE_STAGE_TONE,
  PIPELINE_STAGES,
} from '@/modules/videos/constants'
import type { StageId } from '@pipeline/runner/stage-id.ts'
import type { ImagesRecoveryView } from '@/modules/videos/types/create'

interface StageBarProps {
  // Las fases que corren ahora (entrega 2h): el avatar corre junto con las
  // imágenes, así que pueden girar dos filas a la vez.
  activeStages: StageId[]
  showAnimation?: boolean
  // La fila del avatar solo con avatar presentador (por datos: una fase
  // saltada no queda en `completedStages`).
  showAvatar?: boolean
  completedStages: StageId[]
  // En pausa de confirmación: la fase que espera muestra pausa honesta en
  // vez de un spinner mentiroso (el job está cerrado).
  paused: boolean
  // Pasada de recuperación de imágenes en curso: con `rewrite` la fila de
  // prompts vuelve a «en curso» (la fase sigue completa para el runner, pero
  // para la persona los prompts NO están listos) y la de imágenes espera.
  recovery: ImagesRecoveryView | null
  // El modelo de prompts lleva PROMPT_STAGE_STALL_MS sin escribir (ADR-0028):
  // la fila de prompts lo dice, así el spinner no miente.
  promptModelStalled: boolean
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

// ¿Gira la fila de esta fase? Gira toda fase en curso (entrega 2h, spec
// §24.2: «Generando imágenes» y «Generando el avatar» giran juntas). Durante
// la reescritura de prompts de una pasada de recuperación, la de prompts
// vuelve a girar y la de imágenes espera; el avatar, si corre, sigue girando.
function isStageRunning(
  stageId: StageId,
  activeStages: StageId[],
  rewriting: boolean,
): boolean {
  if (rewriting && stageId === 'scene-prompts') return true

  if (rewriting && stageId === 'images') return false

  return activeStages.includes(stageId)
}

// Lista de fases (port de BarraDeFases del origen): completada en saffron,
// en curso en ocean, en pausa en saffron pleno con «te está esperando»,
// pendiente neutra con un punto. Un escalón más grande que el origen (alto,
// ícono y texto): a ventana completa la lista se veía diminuta.
export function StageBar({
  activeStages,
  showAnimation = false,
  showAvatar = false,
  completedStages,
  paused,
  recovery,
  promptModelStalled,
}: StageBarProps) {
  const { t } = useTranslation()

  const rewriting = recovery?.kind === 'rewrite'
  const stages = PIPELINE_STAGES.filter((stage) => {
    if (stage.id === 'animation') return showAnimation

    if (stage.id === 'avatar') return showAvatar

    return true
  })

  // Con el job cerrado en pausa no corre ninguna fase: la que espera es la
  // primera sin completar.
  const pausedStageId = paused
    ? (stages.find((stage) => !completedStages.includes(stage.id))?.id ?? null)
    : null

  return (
    <ul className="space-y-2">
      {stages.map((stage) => {
        const reopened = rewriting && stage.id === 'scene-prompts'
        const done = completedStages.includes(stage.id) && !reopened
        const waiting = stage.id === pausedStageId
        const active =
          !done && !waiting && isStageRunning(stage.id, activeStages, rewriting)
        const pending = !done && !waiting && !active
        const note = recoveryNote(stage.id, recovery)
        const tone = ACTIVE_STAGE_TONES[stage.id] ?? DEFAULT_ACTIVE_STAGE_TONE

        return (
          <li
            key={stage.id}
            className={cn(
              'flex items-center gap-3 rounded-lg border-2 px-4 py-3.5 transition-colors',
              done && 'border-saffron/40 bg-saffron/5',
              active && tone.row,
              waiting && 'border-saffron bg-saffron/10',
              pending && 'border-border bg-card',
            )}
          >
            <span
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                done && 'bg-saffron text-charcoal',
                active && tone.badge,
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
              {active && promptModelStalled && stage.id === 'scene-prompts' && (
                <span className="block font-body text-sm font-normal text-coral-text">
                  {t('create.progress.promptModelStalled')}
                </span>
              )}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
