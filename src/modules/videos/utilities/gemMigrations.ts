import type { GemRebuildOrigin } from '@/modules/videos/types/gemRebuild'
import type {
  GemAdaptationPhase,
  GemMigrationOutcome,
  GemMigrationState,
  GemMigrationSteps,
} from '@/modules/videos/types/styles'
import type { CustomStyleSummary } from '@pipeline/types/styles.ts'

// Migración de gemas viejas a la plantilla (spec §4.4), como store fuera de
// React (patrón de useCustomStyleEditor): la dispara la galería (al abrir una
// gema en el modal o al elegirla en Crear) y la leen la galería y el modal.
// También adapta la gema que se acaba de pegar («Preparar con IA»): el modal la
// guarda como texto y la adaptación sigue aunque se cierre el modal.
// Una migración se guarda ANTES de que la persona vea las secciones, así que la
// que sale bien queda como «migrada», con los avisos del agente, hasta que la
// persona descarta el aviso (memoria de la sesión, no se guarda).
// Puro: `migrate` llega inyectado (migrateStoredGem con el agente y el
// sidecar) y avisa por `report` cuándo pasa al guardado; `now` también, así el
// guard scripts/test/check-app-gem-migration.mjs lo prueba sin red, sin sidecar
// y con un reloj fijo.
export function createGemMigrations(
  migrate: (
    style: CustomStyleSummary,
    origin: GemRebuildOrigin,
    report: (phase: GemAdaptationPhase) => void,
  ) => Promise<GemMigrationOutcome>,
  now: () => number = () => Date.now(),
) {
  let states: ReadonlyMap<string, GemMigrationState> = new Map()
  const subscribers = new Set<() => void>()
  // Gemas ya migradas en esta sesión: la lista puede tardar en refrescarse y
  // mostrarlas todavía viejas; no se vuelven a mandar al agente.
  const migrated = new Set<string>()
  // Con qué origin salió la última de cada gema: «Reintentar» repite el mismo.
  const origins = new Map<string, GemRebuildOrigin>()

  const publish = (next: Map<string, GemMigrationState>) => {
    states = next
    for (const subscriber of subscribers) subscriber()
  }

  const put = (styleId: string, state: GemMigrationState) => {
    const next = new Map(states)
    next.set(styleId, state)
    publish(next)
  }

  const remove = (styleId: string) => {
    const next = new Map(states)
    next.delete(styleId)
    publish(next)
  }

  // El paso en que va la corrida en vuelo de esa gema. Una que ya terminó (o
  // falló) no cambia: el aviso llega siempre antes de que `migrate` resuelva.
  const report = (styleId: string, phase: GemAdaptationPhase) => {
    const current = states.get(styleId)
    if (current?.status !== 'pending') return
    put(styleId, { ...current, phase })
  }

  const run = async (style: CustomStyleSummary, origin: GemRebuildOrigin) => {
    origins.set(style.id, origin)
    put(style.id, {
      status: 'pending',
      name: style.name,
      startedAt: now(),
      phase: 'agent',
    })
    try {
      const outcome = await migrate(style, origin, (phase) =>
        report(style.id, phase),
      )
      // Borrada mientras tanto: no se guardó nada y no queda aviso ni
      // «Reintentar»; tampoco cuenta como migrada.
      if (outcome.status === 'deleted') {
        remove(style.id)
        return
      }

      migrated.add(style.id)
      put(style.id, {
        status: 'migrated',
        name: style.name,
        warnings: outcome.warnings,
      })
    } catch (error) {
      put(style.id, { status: 'failed', name: style.name, error })
    }
  }

  // Una gema guardada como texto, sin secciones.
  const isTextGem = (style: CustomStyleSummary) =>
    !style.sections && Boolean(style.systemPrompt?.trim())
  // Solo una gema vieja con texto que no se migró todavía en esta sesión.
  const migratable = (style: CustomStyleSummary) =>
    isTextGem(style) && !migrated.has(style.id)
  const inFlight = (styleId: string) =>
    states.get(styleId)?.status === 'pending'

  return {
    // Automático (abrir en el modal, elegir en Crear): una vez por gema y por
    // sesión. Después de un fallo no se repite solo: queda «Reintentar».
    migrateOnce(style: CustomStyleSummary): void {
      if (!migratable(style) || states.has(style.id)) return
      void run(style, 'migracion')
    },
    // Una gema recién pegada, ya guardada como texto: se adapta enseguida,
    // aunque esa gema ya se hubiera migrado en la sesión (se pegó otra encima).
    // Con una en vuelo no sale otra.
    adapt(style: CustomStyleSummary): void {
      if (!isTextGem(style) || inFlight(style.id)) return
      migrated.delete(style.id)
      void run(style, 'mi-estilo')
    },
    // «Reintentar»: otra vez, con el mismo origin, salvo que ya haya una en
    // vuelo.
    retry(style: CustomStyleSummary): void {
      if (!migratable(style) || inFlight(style.id)) return
      void run(style, origins.get(style.id) ?? 'migracion')
    },
    // Descartar el aviso de una gema ya migrada (o reemplazada a mano). Una
    // en vuelo o fallida sigue con su aviso: no se descarta.
    dismiss(styleId: string): void {
      if (states.get(styleId)?.status !== 'migrated') return
      remove(styleId)
    },
    subscribe(listener: () => void): () => void {
      subscribers.add(listener)
      return () => {
        subscribers.delete(listener)
      }
    },
    getSnapshot(): ReadonlyMap<string, GemMigrationState> {
      return states
    },
  }
}

/**
 * Una migración sobre lo guardado AHORA, no sobre la tarjeta que mostraba la
 * lista: la persona pudo guardar una edición recién («Reintentar» desde el
 * modal guarda primero) o la lista estar por refrescarse. Así el agente recibe
 * lo que la persona ve, y el guardado (nombre y respaldo) sale de la misma gema
 * que se le mandó. Después del agente (hasta 150 s) se vuelve a mirar: si la
 * persona la borró mientras tanto, no se guarda nada, porque style-save la
 * volvería a crear. Los avisos del agente vuelven con el resultado: nadie los
 * vio todavía. Con la respuesta en mano avisa que pasa al guardado
 * (`steps.report`): la tarjeta lo muestra como fase.
 */
export async function migrateStoredGem(
  styleId: string,
  steps: GemMigrationSteps,
  origin: GemRebuildOrigin = 'migracion',
): Promise<GemMigrationOutcome> {
  const stored = await steps.findStored(styleId)
  if (!stored) return { status: 'deleted' }

  const response = await steps.rebuild(stored, origin)
  steps.report?.('saving')
  const stillStored = await steps.findStored(styleId)
  if (!stillStored) return { status: 'deleted' }

  await steps.save(stored, response)
  return { status: 'migrated', warnings: response.warnings }
}
