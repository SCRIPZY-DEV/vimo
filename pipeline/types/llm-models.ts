// Tipos del catálogo de modelos del carril verbatim (gema propia). Port de
// `motor-web/verbatim/modelos.ts` del origen. Browser-safe: la UI los importa
// con `import type`; los datos viven en `providers/llm/model-catalog.ts` y le
// llegan a la UI por subcomando (list-prompt-models).
//
// La idea a conservar del origen: **una entrada NO es un id, es un PERFIL DE
// PETICIÓN**. Los modelos no aceptan el mismo cuerpo, y mandarle el equivocado
// a uno devuelve 400 o le quema el tope de salida.

/** Cuán rápido responde, para que la UI no lo prometa al revés. */
export type ModelSpeed = 'fast' | 'medium' | 'slow'

/** USD por 1M tokens. `cache` = entrada ya cacheada, si el modelo la cobra aparte. */
export interface ModelPricing {
  input: number
  output: number
  cache?: number
}

export interface LlmModelProfile {
  /** Id tal cual lo espera el proveedor en el campo `model`. */
  id: string
  /** Nombre de producto para la tarjeta de la UI (no se traduce). */
  label: string
  /** Quién lo hizo. Va en la UI para agrupar de un vistazo. */
  author: string
  speed: ModelSpeed
  /**
   * Cómo se llama el tope de salida en ESTE modelo. La familia GPT-5 usa
   * `max_completion_tokens`; el resto, el clásico `max_tokens`.
   */
  tokensField: 'max_tokens' | 'max_completion_tokens'
  /**
   * Valor de `reasoning_effort`, o ausente para NO mandar el campo. Cada
   * familia acepta un enum distinto: adivinarlo fuera de la familia gpt-oss/
   * GPT-5 es un 400 seguro (medido en el origen, 2026-08-15).
   */
  reasoningEffort?: string
  /**
   * Margen fijo de tokens que se suma al presupuesto de contenido. Los modelos
   * que razonan descuentan ese razonamiento del MISMO tope, así que sin margen
   * el `content` vuelve vacío o cortado aunque el pedido sea chico.
   */
  outputTokensMargin: number
  /** `false` cuando el perfil se dedujo por familia (id fuera del catálogo). */
  inCatalog: boolean
  /**
   * Si se ofrece para redacción elegible (ADR-0044). Un proyecto antiguo con
   * un modelo oculto se resuelve al predeterminado; el perfil técnico queda
   * disponible para servicios internos con política propia, como previews.
   */
  inUi: boolean
  /**
   * RETIRADO: el modelo no se usa más, ni siquiera si un proyecto guardado lo
   * tiene elegido — se degrada al de la casa con aviso por log. Es distinto de
   * `inUi: false`, que restringe la elección del usuario pero conserva el
   * perfil para políticas internas. La entrada permite identificar pedidos
   * históricos sin volver a ofrecerlos ni borrar su auditoría.
   */
  retired?: true
  /**
   * Carril de servicio de DeepInfra, opcional. "priority" = 1.5× el precio,
   * cola preferente; "flex" = 0.8×, más lento. Solo lo aceptan los modelos
   * etiquetados; en uno sin etiqueta se ignora, no rompe. Los perfiles de la
   * casa NO lo definen: el precio que ve el usuario es el normal.
   */
  serviceTier?: 'priority' | 'flex'
  /**
   * Qué cobra el proveedor, en USD por 1M tokens. Alimenta el simulador de
   * costos del selector (rama posterior). OPCIONAL a propósito: un modelo sin
   * precio no muestra cifra — inventar un número sería peor, porque se ve
   * igual de creíble.
   */
  pricing?: ModelPricing
  /**
   * Cuánto escribe este modelo comparado con el promedio con el que se calibró
   * el simulador. Ausente = 1. Existe porque los modelos que «piensan» antes
   * de escribir facturan ese razonamiento COMO SALIDA (el o4-mini ULTRA movía
   * casi el doble de tokens que la media — medido 5 veces en el origen,
   * 1,69× a 2,33×). Solo toca lo que se MUESTRA: el pedido no cambia en nada.
   */
  outputFactor?: number
}

// ─── Contrato de list-prompt-models ───

export interface ListPromptModelsResult {
  // Lo que se OFRECE en el selector (inUi && !retired), en el orden del
  // catálogo. El de la casa siempre está (invariante del origen).
  models: LlmModelProfile[]
  defaultId: string
  // Escenas por pedido del carril verbatim: el simulador de costos lo
  // necesita para contar lotes (la gema y el guion viajan en cada uno).
  batchSize: number
}
