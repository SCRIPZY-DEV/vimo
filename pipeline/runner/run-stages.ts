import type { PipelineContext } from './context.ts'
import { toPipelineFailure } from './failure.ts'
import type { Stage } from './stage.ts'
import type { StageId } from './stage-id.ts'

export interface RunStagesHooks {
  // Corre tras cada stage completada (Create persiste completedStages acá).
  // Con dos fases a la vez (`runsAlongside`) puede correr para las dos al
  // mismo tiempo: quien escribe tiene que tolerarlo.
  onStageCompleted?(stageId: StageId): void | Promise<void>
}

export interface StagesRunResult {
  // true si una stage pidió pausa: el job debe terminar limpio, sin marcar
  // el recorrido como completo.
  paused: boolean
}

// Cómo terminó una fase de un grupo: completa, en pausa o con su fallo. Con
// el fallo va si su señal ya estaba cancelada cuando falló: entonces el fallo
// es el eco de esa cancelación (la del job, o la del runner porque falló la
// fase con la que corría) y no se avisa como un fallo propio.
type MemberOutcome =
  | { stage: StageId; paused: boolean }
  | { stage: StageId; error: unknown; aborted: boolean }

// Runner declarativo (ADR-0010): recorre el registro en orden y es el ÚNICO
// que emite stage-started / stage-skipped / stage-completed. Una stage que
// los emita a mano es una regresión (guard por grep en ADR-0013).
// Desde la entrega 2h (diseño §24.1), al llegar a una fase, las que la siguen
// en la lista y declaran `runsAlongside` con su id forman un grupo con ella y
// corren a la vez (`runGroup`). Fuera de un grupo, nada cambia.
export async function runStages<TContext extends PipelineContext>(
  stages: Stage<TContext>[],
  context: TContext,
  hooks: RunStagesHooks = {},
): Promise<StagesRunResult> {
  // Las acompañantes ya corrieron con la fase a la que acompañan.
  const grouped = new Set<number>()
  for (const [index, stage] of stages.entries()) {
    if (grouped.has(index)) continue

    // La cancelación se atiende en el borde de cada fase; dentro de una
    // fase larga la atiende la propia stage vía context.signal.
    context.signal.throwIfAborted()

    const companions: Stage<TContext>[] = []
    for (const [position, other] of stages.entries()) {
      if (position <= index || other.runsAlongside !== stage.id) continue

      grouped.add(position)
      companions.push(other)
    }
    if (companions.length > 0) {
      const outcome = await runGroup([stage, ...companions], context, hooks)
      if (outcome.paused) return { paused: true }
      continue
    }

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

// Un grupo (diseño §24.1): el `skip()` de cada fase en orden (las salteadas
// avisan `stage-skipped`), el `stage-started` de cada una que corre (la
// primera de la lista antes) y todas a la vez. Cada una avisa
// `stage-completed` y pasa por el gancho apenas termina. La que manda es la
// primera que corre; las demás (las acompañantes) corren con su propio
// AbortController unido a la señal del job, en una copia del contexto que solo
// cambia `signal` (la metadata y el resto se comparten por referencia).
// Cuando algo falla:
//  1. falla la que manda: se cortan las acompañantes, se espera a que
//     terminen (lo que guardaron, guardado queda) y sale su fallo;
//  2. falla una acompañante: la que manda sigue hasta el final (y avisa que
//     terminó) y después sale el fallo de la acompañante;
//  3. fallan las dos: gana la que manda, y el fallo propio de la otra va al
//     log como aviso con su código (el eco de una cancelación, no);
//  4. la cancelación del job las frena a todas y sale como cancelación;
//  5. una que pide pausa: se espera a las otras y el grupo devuelve la pausa,
//     salvo que otra haya fallado (el fallo manda).
async function runGroup<TContext extends PipelineContext>(
  members: Stage<TContext>[],
  context: TContext,
  hooks: RunStagesHooks,
): Promise<StagesRunResult> {
  const running: Stage<TContext>[] = []
  for (const member of members) {
    if (member.skip && (await member.skip(context))) {
      context.emitter.emit({ type: 'stage-skipped', stageId: member.id })
      continue
    }

    running.push(member)
  }

  const [leader, ...followers] = running
  if (!leader) return { paused: false }

  for (const member of running)
    context.emitter.emit({ type: 'stage-started', stageId: member.id })

  const companions = followers.map((stage) => {
    const controller = new AbortController()
    const signal = AbortSignal.any([context.signal, controller.signal])
    return { stage, controller, context: { ...context, signal } }
  })

  const leaderRun = runMember(leader, context, hooks)
  // Falla la que manda: las acompañantes se cortan enseguida, no al final.
  leaderRun.catch(() => {
    for (const companion of companions) companion.controller.abort()
  })
  const outcomes = await Promise.all([
    settle(leader.id, leaderRun, context.signal),
    ...companions.map((companion) =>
      settle(
        companion.stage.id,
        runMember(companion.stage, companion.context, hooks),
        companion.context.signal,
      ),
    ),
  ])

  const [leaderOutcome, ...companionOutcomes] = outcomes
  const failures = companionOutcomes.filter((outcome) => 'error' in outcome)
  if ('error' in leaderOutcome) {
    warnAlsoFailed(context, leader.id, failures)
    throw leaderOutcome.error
  }

  const [first, ...others] = failures
  if (first && 'error' in first) {
    warnAlsoFailed(context, first.stage, others)
    throw first.error
  }

  return {
    paused: outcomes.some((outcome) => 'paused' in outcome && outcome.paused),
  }
}

// Corre una fase del grupo: su `run`, y si terminó (sin pausa), su
// `stage-completed` y el gancho. Devuelve si pidió pausa.
async function runMember<TContext extends PipelineContext>(
  stage: Stage<TContext>,
  context: TContext,
  hooks: RunStagesHooks,
): Promise<boolean> {
  const outcome = await stage.run(context)
  if (outcome?.pause) return true

  context.emitter.emit({ type: 'stage-completed', stageId: stage.id })
  await hooks.onStageCompleted?.(stage.id)
  return false
}

// Espera a que una fase del grupo termine y dice cómo; nunca rechaza.
async function settle(
  stage: StageId,
  run: Promise<boolean>,
  signal: AbortSignal,
): Promise<MemberOutcome> {
  try {
    return { stage, paused: await run }
  } catch (error) {
    return { stage, error, aborted: signal.aborted }
  }
}

// El fallo propio de cada fase que también falló, como aviso con su código:
// sale el de `winner`. El eco de una cancelación no se avisa.
function warnAlsoFailed(
  context: PipelineContext,
  winner: StageId,
  failures: MemberOutcome[],
): void {
  for (const failure of failures) {
    if (!('error' in failure) || failure.aborted) continue

    const { code, message } = toPipelineFailure(failure.error)
    context.emitter.emit({
      type: 'log',
      level: 'warn',
      message: `${failure.stage} stage also failed (${code}): ${message}; the ${winner} stage failure is the one reported`,
    })
  }
}
