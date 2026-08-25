import type { PipelineContext } from './context.ts'
import type { Stage } from './stage.ts'
import type { StageId } from './stage-id.ts'

export interface RunStagesHooks {
  // Corre tras cada stage completada (Create persiste completedStages acá).
  onStageCompleted?(stageId: StageId): void | Promise<void>
}

export interface StagesRunResult {
  // true si una stage pidió pausa: el job debe terminar limpio, sin marcar
  // el recorrido como completo.
  paused: boolean
}

// Runner declarativo (ADR-0010): recorre el registro en orden y es el ÚNICO
// que emite stage-started / stage-skipped / stage-completed. Una stage que
// los emita a mano es una regresión (guard por grep en ADR-0013).
export async function runStages<TContext extends PipelineContext>(
  stages: Stage<TContext>[],
  context: TContext,
  hooks: RunStagesHooks = {},
): Promise<StagesRunResult> {
  for (const stage of stages) {
    // La cancelación se atiende en el borde de cada fase; dentro de una
    // fase larga la atiende la propia stage vía context.signal.
    context.signal.throwIfAborted()

    if (stage.skip && (await stage.skip(context))) {
      context.emitter.emit({ type: 'stage-skipped', stageId: stage.id })
      continue
    }

    context.emitter.emit({ type: 'stage-started', stageId: stage.id })
    const outcome = await stage.run(context)

    if (outcome?.pause) return { paused: true }

    context.emitter.emit({ type: 'stage-completed', stageId: stage.id })
    await hooks.onStageCompleted?.(stage.id)
  }

  return { paused: false }
}
