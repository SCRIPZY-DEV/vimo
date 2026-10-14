import type { PipelineContext } from './context.ts'
import type { StageId } from './stage-id.ts'

// Contrato de las fases (ADR-0010). El genérico permite que las stages de
// Create reciban su contexto extendido (rutas del proyecto, opciones, biblia)
// sin que el runner sepa de él.
//
// Una stage puede pedir PAUSA devolviendo { pause: true } (la confirmación
// de escenas, ADR-0013): el runner corta el recorrido sin marcarla completa
// y el job termina limpio — al relanzar, la stage retoma donde quedó.
export interface StagePause {
  pause: true
}

export interface Stage<TContext extends PipelineContext = PipelineContext> {
  id: StageId
  // Arranca junto con esa fase, si la sigue en la lista que recorre el runner
  // (entrega 2h, diseño §24.1): el avatar con las imágenes. Corren a la vez y
  // cada una avisa que terminó apenas termina; el orden del registro no
  // cambia. Sin esa fase en la lista antes que ella, corre sola, como siempre.
  runsAlongside?: StageId
  // Devuelve true si la fase no aplica para este job o su artefacto en
  // disco ya es válido (cache-hit: así se retoma un proyecto a medias).
  skip?(context: TContext): boolean | Promise<boolean>
  run(context: TContext): Promise<StagePause | undefined>
}
