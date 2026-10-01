import type {
  GemMigrationOutcome,
  GemMigrationState,
  GemMigrationSteps,
} from '@/modules/videos/types/styles'
import type { CustomStyleSummary } from '@pipeline/types/styles.ts'

// Migración de gemas viejas a la plantilla (spec §4.4), como store fuera de
// React (patrón de useCustomStyleEditor): la dispara la galería (al abrir una
// gema en el modal o al elegirla en Crear) y la leen la galería y el modal.
// Puro: `migrate` llega inyectado (migrateStoredGem con el agente y el
// sidecar), así el guard scripts/test/check-app-gem-migration.mjs lo prueba sin
// red ni sidecar.
export function createGemMigrations(
  migrate: (style: CustomStyleSummary) => Promise<GemMigrationOutcome>,
) {
  let states: ReadonlyMap<string, GemMigrationState> = new Map()
  const subscribers = new Set<() => void>()
  // Gemas ya migradas en esta sesión: la lista puede tardar en refrescarse y
  // mostrarlas todavía viejas; no se vuelven a mandar al agente.
  const migrated = new Set<string>()

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

  const run = async (style: CustomStyleSummary) => {
    put(style.id, { status: 'pending', name: style.name, error: null })
    try {
      const outcome = await migrate(style)
      // Borrada mientras tanto: no se guardó nada y no queda aviso ni
      // «Reintentar»; tampoco cuenta como migrada.
      if (outcome === 'migrated') migrated.add(style.id)
      remove(style.id)
    } catch (error) {
      put(style.id, { status: 'failed', name: style.name, error })
    }
  }

  // Solo una gema vieja con texto que no se migró todavía en esta sesión.
  const migratable = (style: CustomStyleSummary) =>
    !style.sections &&
    Boolean(style.systemPrompt?.trim()) &&
    !migrated.has(style.id)

  return {
    // Automático (abrir en el modal, elegir en Crear): una vez por gema y por
    // sesión. Después de un fallo no se repite solo: queda «Reintentar».
    migrateOnce(style: CustomStyleSummary): void {
      if (!migratable(style) || states.has(style.id)) return
      void run(style)
    },
    // «Reintentar»: otra vez, salvo que ya haya una en vuelo.
    retry(style: CustomStyleSummary): void {
      if (!migratable(style) || states.get(style.id)?.status === 'pending')
        return
      void run(style)
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
 * volvería a crear.
 */
export async function migrateStoredGem(
  styleId: string,
  steps: GemMigrationSteps,
): Promise<GemMigrationOutcome> {
  const stored = await steps.findStored(styleId)
  if (!stored) return 'deleted'

  const response = await steps.rebuild(stored)
  const stillStored = await steps.findStored(styleId)
  if (!stillStored) return 'deleted'

  await steps.save(stored, response)
  return 'migrated'
}
