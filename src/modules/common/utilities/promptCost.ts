import type { ModelPricing } from '@pipeline/types/llm-models.ts'

// SIMULADOR DE COSTOS — cuánto cuesta escribir los prompts de N escenas.
// Port sin imports de `costoPrompts.ts` del origen (v1.10.0 → v1.19.0): así
// una aserción con Node type-stripping lo corre tal cual, sin navegador y
// sin gastar un centavo. Todo lo que puede cambiar (precios, tamaño de lote,
// factor de salida) llega por parámetro desde el catálogo del sidecar; acá
// solo viven las constantes calibradas con mediciones.
//
// POR QUÉ NO ES UNA REGLA DE TRES
// El motor manda la gema y el guion COMPLETO en cada lote de escenas (decisión
// explícita del carril verbatim). Al subir las escenas suben a la vez la
// cantidad de lotes Y el tamaño del guion que viaja en cada uno: la entrada
// crece más rápido que lineal. Medido sobre proyectos reales: 15 escenas ≈
// 15.900 caracteres de entrada; 182 escenas ≈ 168.000.
//
// CONTRASTADO CONTRA LA REALIDAD (2026-08-21, origen): corrida real de 15
// escenas con una gema de 5.722 caracteres vs. los tokens que reportó el
// proveedor — entrada predicha 4.678 / medida 4.572 (+2,3 %); salida 2.537 /
// 2.234 (+13,6 %) (predicho sin el margen de re-pedidos). El sesgo queda A
// PROPÓSITO del lado caro: estimar de menos y que salga más es peor.
//
// NO CONFUNDIR CON EL LARGO DEL PROMPT FINAL: el prompt que ve el generador
// de imágenes es más largo que lo que escribió el modelo, porque la ficha del
// personaje se pega DESPUÉS, localmente, y no se paga. Medido (170 escenas):
// prompt final 360–1.132 ch (mediana 920); escrito por el modelo 360–818 ch
// (mediana 605). Por eso la constante de salida vale ~630 y no ~1.100.

// Caracteres de NARRACIÓN por escena. Medido: 15 escenas suman 678
// caracteres de texto hablado (45,2 por escena).
const NARRATION_CHARS_PER_SCENE = 45

// Lo que el motor agrega a la Fase 1 además de la gema y el guion: la
// consigna del personaje y el envoltorio del mensaje.
const PHASE_1_FIXED_CHARS = 1_074

// Lo que se repite en CADA lote además de la gema y el guion: la línea
// técnica de los ids, la ficha del personaje que vuelve como turno del
// asistente, el preámbulo y la cola del conteo.
const BATCH_FIXED_CHARS = 1_830

// Caracteres que escribe el modelo POR ESCENA. Medido sobre 170 escenas de 12
// corridas reales (rango 360–818, mediana 605); apenas arriba, del lado caro.
// Es un PROMEDIO de varios modelos: cuánto se aparta cada uno lo dice su
// `outputFactor` (ver abajo).
const OUTPUT_CHARS_PER_SCENE = 630

// La ficha del personaje de la Fase 1. Medido: 280–1.041 caracteres.
const CHARACTER_OUTPUT_CHARS = 700

// Caracteres por token. La entrada es español (gema + guion) y rinde peor
// que el inglés; la salida son prompts en inglés. El 3,5 está anclado a una
// medición real: 6.794 caracteres → 1.925 prompt_tokens (3,53 ch/token).
const CHARS_PER_INPUT_TOKEN = 3.5
const CHARS_PER_OUTPUT_TOKEN = 4.0

// Cuánto se agrega por las escenas que hay que volver a pedir: el motor
// re-pide las defectuosas o ausentes y esos pedidos también se pagan.
// Medido: Qwen suele salir entero de una; gpt-oss Turbo deja 1–3 de 15.
// Deliberadamente NO se nombra en la interfaz.
const RETRY_FACTOR = 1.15

// Multiplicadores del carril de servicio de DeepInfra (verificados por cobro).
const SERVICE_TIER_MULTIPLIER = { priority: 1.5, flex: 0.8 } as const

// El rango del simulador y su punto de partida.
export const SIMULATOR_SCENES_MIN = 100
export const SIMULATOR_SCENES_MAX = 600
export const SIMULATOR_SCENES_STEP = 50
export const SIMULATOR_SCENES_DEFAULT = 200

// Tamaño de lote de respaldo si el sidecar no lo informó (mismo valor que
// VERBATIM_BATCH_SIZE).
const FALLBACK_BATCH_SIZE = 10

// v1.16.0 del origen — CADA MODELO ESCRIBE LO QUE QUIERE. Hay modelos que
// «piensan» antes de escribir y ese razonamiento se factura como salida.
// Medido (15 escenas, tokens de salida, veces el promedio): o4-mini ULTRA
// 1,69–2,33 (se cobraba la MITAD); TURBO 0,83–1,66; Haiku 4.5 0,99; DeepSeek
// V4 Flash 0,79–0,82; V4 Pro 0,77–0,82; Llama 4 Scout 0,55–0,58. Los factores
// del catálogo redondean HACIA ARRIBA de la media medida. Sin factor vale 1.

export interface PromptCostInput {
  scenes: number
  // Caracteres de la gema del usuario: es SU estilo el que viaja en cada lote.
  gemChars: number
  pricing?: ModelPricing
  serviceTier?: 'priority' | 'flex'
  // Cuántas escenas entran en un pedido. Lo informa el sidecar.
  batchSize?: number
  // Cuánto escribe ESTE modelo comparado con el promedio calibrado.
  outputFactor?: number
  // ¿Corre la Fase 1 (diseño del personaje)? Solo con «personaje genérico».
  // Ausente = true. Cobrar una llamada que no pasa infla ~9 % a 200 escenas.
  withCharacterPhase?: boolean
}

// Los tokens que se estima que va a mover el pedido. Se expone para auditar.
export interface EstimatedPromptTokens {
  input: number
  // De esa entrada, cuánta se cobraría a precio de caché (0 si no cachea).
  cachedInput: number
  output: number
  calls: number
}

// Separado del precio a propósito: así se puede verificar la FORMA de la
// curva (más que proporcional, la gema pesa) sin mezclarla con tarifas.
export function estimatePromptTokens(
  input: Pick<
    PromptCostInput,
    'scenes' | 'gemChars' | 'batchSize' | 'outputFactor' | 'withCharacterPhase'
  >,
): EstimatedPromptTokens {
  const scenes = Math.max(1, Math.round(input.scenes))
  const gem = Math.max(0, input.gemChars)
  const batchSize = Math.max(1, input.batchSize ?? FALLBACK_BATCH_SIZE)
  const batches = Math.ceil(scenes / batchSize)
  // Un factor roto (0, negativo, NaN) vale 1: anular la salida entera
  // mostraría un costo ridículamente barato con la misma cara que uno real.
  const outputFactor =
    typeof input.outputFactor === 'number' &&
    Number.isFinite(input.outputFactor) &&
    input.outputFactor > 0
      ? input.outputFactor
      : 1
  const withPhase1 = input.withCharacterPhase !== false

  const script = scenes * NARRATION_CHARS_PER_SCENE
  // Lo que se repite entero en cada pedido de la Fase 2.
  const batchPrefix = gem + script + BATCH_FIXED_CHARS

  const phase1Chars = withPhase1 ? gem + script + PHASE_1_FIXED_CHARS : 0
  // Los fragmentos se reparten entre los lotes: sumados dan el guion una vez.
  const phase2Chars = batches * batchPrefix + script

  // El factor pesa sobre TODO lo que escribe el modelo — la ficha de la Fase
  // 1 también sale de su pluma (y en los que razonan, también se razona ahí).
  const outputChars =
    ((withPhase1 ? CHARACTER_OUTPUT_CHARS : 0) +
      scenes * OUTPUT_CHARS_PER_SCENE) *
    outputFactor

  // El prefijo de los lotes 2..L es idéntico al del primero: eso es lo que un
  // modelo con caché cobra más barato. El primero siempre se paga entero.
  const cachedChars = Math.max(0, batches - 1) * batchPrefix

  return {
    input: Math.round(
      ((phase1Chars + phase2Chars) * RETRY_FACTOR) / CHARS_PER_INPUT_TOKEN,
    ),
    cachedInput: Math.round(
      (cachedChars * RETRY_FACTOR) / CHARS_PER_INPUT_TOKEN,
    ),
    output: Math.round((outputChars * RETRY_FACTOR) / CHARS_PER_OUTPUT_TOKEN),
    calls: (withPhase1 ? 1 : 0) + batches,
  }
}

// Cuánto costaría en dólares. `null` cuando el modelo no tiene precios: una
// cifra inventada se vería igual de creíble que una real.
export function estimatePromptCost(input: PromptCostInput): number | null {
  if (!input.pricing) return null
  const { input: inputPrice, output: outputPrice, cache } = input.pricing
  if (!(inputPrice > 0) || !(outputPrice > 0)) return null

  const tokens = estimatePromptTokens(input)
  const multiplier = input.serviceTier
    ? SERVICE_TIER_MULTIPLIER[input.serviceTier]
    : 1

  // Con caché, la parte repetida se cobra a su tarifa y el resto a la normal.
  const cachedInput = cache !== undefined ? tokens.cachedInput : 0
  const fullInput = tokens.input - cachedInput

  const usd =
    (fullInput / 1e6) * inputPrice +
    (cachedInput / 1e6) * (cache ?? inputPrice) +
    (tokens.output / 1e6) * outputPrice

  return usd * multiplier
}

// v1.14.0 del origen — BANDAS DE PRECIO. La banda se calcula con LA MISMA
// cuenta que muestra el simulador, sobre el estilo REAL del usuario y el
// largo por defecto (200 escenas): así el título del grupo y la cifra nunca se
// contradicen. Los cortes son redondos a propósito (3 y 10 centavos por video
// de 200 escenas): separan «no lo pienses», «algo cuesta» y «elegilo si te
// importa el resultado».
export type PriceBand = 'economic' | 'mid' | 'high' | 'no-price'

const ECONOMIC_CUTOFF_USD = 0.03
const MID_CUTOFF_USD = 0.1

export function priceBand(input: PromptCostInput): PriceBand {
  const usd = estimatePromptCost({ ...input, scenes: SIMULATOR_SCENES_DEFAULT })
  if (usd === null) return 'no-price'
  if (usd < ECONOMIC_CUTOFF_USD) return 'economic'
  if (usd < MID_CUTOFF_USD) return 'mid'
  return 'high'
}

// El orden en que se muestran los grupos. `level` es la posición de la banda
// en la escala (1 de 3) que la UI dibuja como puntos llenos; 0 = fuera de la
// escala (sin precio no es «barato», es desconocido).
export const PRICE_BANDS: {
  band: PriceBand
  labelKey: string
  level: number
}[] = [
  { band: 'economic', labelKey: 'create.promptModel.bands.economic', level: 1 },
  { band: 'mid', labelKey: 'create.promptModel.bands.mid', level: 2 },
  { band: 'high', labelKey: 'create.promptModel.bands.high', level: 3 },
  { band: 'no-price', labelKey: 'create.promptModel.bands.noPrice', level: 0 },
]

// Cuántos puntos dibuja la escala de precio.
export const PRICE_LEVELS = 3
