import type { GemAdaptationPhase } from '@/modules/videos/types/styles'

interface GemAdaptationInFlight {
  startedAt: number
  phase: GemAdaptationPhase
}

// Tiempos de la simulación. Viven acá y no en constants.ts, como los topes de
// gemTemplate.ts: el guard scripts/test/check-app-gem-adaptation-progress.mjs
// corre este módulo con Node pelado, que no resuelve el alias `@/`. Medido el
// 2026-10-01 con gemas reales: el agente tarda de 15 a 36 s, y 29 s en una de
// 94 000 caracteres.
export const GEM_ADAPTATION_EXPECTED_SECONDS = 30
export const GEM_ADAPTATION_RAMP_PERCENT = 85
export const GEM_ADAPTATION_CAP_PERCENT = 95
export const GEM_ADAPTATION_SAVING_PERCENT = 98

// Porcentaje que muestra la tarjeta de una gema mientras se adapta. El agente
// reconstructor no informa avance (una sola respuesta al final), así que es una
// simulación por tiempo, con la misma curva que un clip de animación: sube en
// línea recta hasta GEM_ADAPTATION_RAMP_PERCENT en el tiempo esperado y después
// se frena hacia el tope, sin llegar nunca al 100 %. Con el agente ya
// respondido, guardar las secciones es casi instantáneo: un valor fijo cerca
// del final. El 100 % lo pone la adaptación terminada, que saca el aviso.
export function gemAdaptationPercent(
  adaptation: GemAdaptationInFlight,
  now: number,
): number {
  if (adaptation.phase === 'saving') return GEM_ADAPTATION_SAVING_PERCENT

  const elapsedSeconds = Math.max(0, (now - adaptation.startedAt) / 1000)
  const simulated =
    elapsedSeconds <= GEM_ADAPTATION_EXPECTED_SECONDS
      ? (GEM_ADAPTATION_RAMP_PERCENT * elapsedSeconds) /
        GEM_ADAPTATION_EXPECTED_SECONDS
      : GEM_ADAPTATION_RAMP_PERCENT +
        (GEM_ADAPTATION_CAP_PERCENT - GEM_ADAPTATION_RAMP_PERCENT) *
          (1 -
            Math.exp(
              -(elapsedSeconds - GEM_ADAPTATION_EXPECTED_SECONDS) /
                GEM_ADAPTATION_EXPECTED_SECONDS,
            ))

  return Math.min(GEM_ADAPTATION_CAP_PERCENT, Math.round(simulated))
}
