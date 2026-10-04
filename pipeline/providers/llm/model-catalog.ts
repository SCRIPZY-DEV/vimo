import type { LlmModelProfile } from '../../types/llm-models.ts'

// CATÁLOGO DE MODELOS del carril verbatim (gema propia). Port de
// `motor-web/verbatim/modelos.ts` del origen, con dos recortes deliberados:
//
//  - Solo perfiles de **DeepInfra** (decisión v0.99.0 del origen: «incluí
//    solamente los proveedores de DeepInfra; todos los usuarios están usando
//    DeepInfra»). Los perfiles CometAPI no se portan: acá no existe esa key en
//    api-keys y el proveedor está deshabilitado en el origen mismo.
//  - Sin `modelos-extra.json` ni overrides por `.env` (la herramienta de
//    pruebas del dueño): leer el entorno del proceso está prohibido en el
//    sidecar (ADR-0010) y el archivo a mano era exclusivo del flujo desktop
//    viejo. `MODEL_CATALOG` es la única fuente.
//
// Todo lo demás se conserva tal cual, incluidas las cifras: cada campo de cada
// entrada fue MEDIDO en el origen (no deducido de documentación) y los
// comentarios dicen cuándo y cómo.
//
// MEDIDO CON EL MOTOR REAL (origen, 2026-08-21, mismo estilo, mismo proyecto
// de 15 escenas, un modelo por corrida):
//
//   modelo               seg    escenas  encuadres  200 escenas
//   o4-mini ULTRA        10-12    15/15      7        $0,047
//   o4-mini TURBO         9-17    15/15      7        $0,031
//   Llama 4 Scout          17     15/15      7        $0,017
//   DeepSeek V4 Flash      38     15/15      7        $0,012
//   DeepSeek V4 Pro        26     15/15     10        $0,176
//   Claude Haiku 4.5    24-29     15/15      7        $0,245
//
// DESCARTADOS CON DATO, para que nadie los vuelva a proponer sin medir:
//  - Qwen3 235B: entre 12 y 221 segundos según el momento del día.
//  - Gemma 4 26B: el más lento y repite el mismo decorado en casi todas.
//  - Línea Qwen 3.5 y GLM-4.7-Flash: «piensan», y ese pensamiento se factura
//    como salida (el 397B gastó 7.177 tokens contra ~2.000 de los demás).
//  - gemini-2.0-flash-001: respondía perfecto pero está DEPRECADO desde
//    2026-02: «responde 200» no prueba que un modelo esté vigente.
//
// Las cifras anteriores son históricas. Validación 2026-09-28: V4.1 Flash
// ofrece mejor equilibrio de tiempo/costo y conserva Haiku como alternativa.
// MiMo Flash usa `none`: el razonamiento por defecto agotó la salida en las
// pruebas. V4 Pro quedó técnico para el revisor temporal, fuera del selector.
// 2026-10-04: retirado el revisor (ADR-0043), el dueño pidió volver a ofrecer
// tres redactores más baratos de los que había antes del recorte: Llama 4
// Scout, DeepSeek V4 Flash y GPT o4-mini TURBO, probados con videos reales
// sin la revisión. V4 Pro sigue fuera: es caro y su modelo empezó a fallar.
// No se alteran los perfiles de previews/Catálogo ni la configuración de guion.
// ADR-0044: la redacción elegible y sus rescates usan solo perfiles ofrecidos.
// El ORDEN del array es el que ve el usuario en el selector.
export const MODEL_CATALOG: readonly LlmModelProfile[] = [
  {
    id: 'deepseek-ai/DeepSeek-V4.1-Flash',
    label: 'DeepSeek V4.1 Flash',
    author: 'DeepSeek',
    speed: 'fast',
    tokensField: 'max_tokens',
    outputTokensMargin: 3000,
    // Tarifa regular conservadora; la promoción temporal no se garantiza.
    pricing: { input: 0.2, output: 0.6 },
    outputFactor: 0.85,
    inCatalog: true,
    inUi: true,
  },
  {
    id: 'XiaomiMiMo/MiMo-V2.6-Flash',
    label: 'MiMo V2.6 Flash',
    author: 'Xiaomi',
    speed: 'fast',
    tokensField: 'max_tokens',
    reasoningEffort: 'none',
    outputTokensMargin: 3000,
    pricing: { input: 0.14, output: 0.28 },
    outputFactor: 0.85,
    inCatalog: true,
    inUi: false,
  },
  {
    id: 'deepseek-ai/DeepSeek-V4-Pro',
    label: 'DeepSeek V4 Pro',
    author: 'DeepSeek',
    speed: 'medium',
    tokensField: 'max_tokens',
    outputTokensMargin: 3000,
    pricing: { input: 1.3, output: 2.6 },
    outputFactor: 0.85,
    inCatalog: true,
    inUi: false,
  },
  {
    id: 'openai/gpt-oss-120b-Ultra',
    label: 'GPT o4-mini ULTRA',
    author: 'DeepInfra',
    speed: 'fast',
    tokensField: 'max_tokens',
    // Medido así (sin `reasoning_effort`): 10,3 s y 12,4 s, 15/15 las dos
    // veces. El margen es el de su hermano Turbo: la familia gpt-oss descuenta
    // el razonamiento del MISMO tope de salida.
    outputTokensMargin: 2500,
    // Verificado en el catálogo del proveedor el 2026-08-21 (vigente).
    pricing: { input: 0.2, output: 0.95 },
    // El que más se apartaba del promedio, y para el lado caro: razona antes
    // de escribir y ese razonamiento se factura como salida. Medido 5 veces
    // (15 escenas): 1,69× a 2,33×, media 1,93×. Se deja en 2 porque el
    // simulador se equivoca del lado caro a propósito, y porque es el modelo
    // que entonces venía elegido; se conserva la calibración histórica.
    outputFactor: 2,
    inCatalog: true,
    inUi: false,
  },
  {
    id: 'Qwen/Qwen3-235B-A22B-Instruct-2507',
    label: 'Qwen3 235B',
    author: 'Alibaba',
    speed: 'slow',
    tokensField: 'max_tokens',
    outputTokensMargin: 3000,
    pricing: { input: 0.09, output: 0.55 },
    outputFactor: 0.9,
    inCatalog: true,
    inUi: false,
    // RETIRADO en el origen (v1.17.0): la misma llamada tardó 12 s por la
    // mañana y 221 s por la tarde, y el único proyecto que lo tenía elegido
    // eran tests del dueño. Un proyecto que lo pida se genera con el de la
    // casa y queda dicho en el log.
    retired: true,
  },
  {
    id: 'meta-llama/Llama-4-Scout-17B-16E-Instruct',
    label: 'Llama 4 Scout',
    author: 'Meta',
    speed: 'fast',
    tokensField: 'max_tokens',
    outputTokensMargin: 3000,
    pricing: { input: 0.1, output: 0.3 },
    // El que menos escribe de la lista: 0,55× y 0,58× del promedio en las dos
    // medidas. Escribe escenas más cortas, pero completas.
    outputFactor: 0.6,
    inCatalog: true,
    inUi: true,
  },
  {
    id: 'deepseek-ai/DeepSeek-V4-Flash',
    label: 'DeepSeek V4 Flash',
    author: 'DeepSeek',
    speed: 'medium',
    tokensField: 'max_tokens',
    outputTokensMargin: 3000,
    // Declara caché al 20% de la entrada; NO se carga como `pricing.cache`
    // hasta verificarlo por cobro: la estimación se mantiene del lado caro.
    pricing: { input: 0.09, output: 0.18 },
    outputFactor: 0.85,
    inCatalog: true,
    inUi: true,
  },
  {
    id: 'anthropic/claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    author: 'Anthropic',
    speed: 'medium',
    tokensField: 'max_tokens',
    outputTokensMargin: 3000,
    pricing: { input: 1.0, output: 5.0 },
    // El que CLAVA el promedio (0,99×). Va explícito y no ausente para que se
    // lea que fue medido, no que se olvidó.
    outputFactor: 1,
    inCatalog: true,
    inUi: true,
  },
  {
    id: 'deepseek-ai/DeepSeek-V3.2',
    label: 'DeepSeek V3.2',
    author: 'DeepSeek',
    speed: 'fast',
    tokensField: 'max_tokens',
    // Por DeepInfra NO hace falta `reasoning_effort` (4 corridas sin un solo
    // `finish_reason: "length"`); mandarlo sin necesidad es arriesgar un 400
    // por enum. Por CometAPI sí lo exigía — el proveedor importa tanto como
    // el modelo, no se copian conclusiones de uno al otro.
    outputTokensMargin: 3000,
    // El ÚNICO de los medidos que cachea el prefijo: la entrada repetida sale
    // a mitad de precio (verificado por cobro en el origen, 2026-08-20).
    pricing: { input: 0.26, output: 0.38, cache: 0.13 },
    inCatalog: true,
    // FUERA de la UI (v1.5.0 del origen): por DeepInfra vive ocupado — 429
    // «model busy» crónico, medido 10/10 en hora pico. Se CONSERVA en catálogo
    // para identificarlo y para políticas internas. Desde ADR-0044, la
    // redacción elegible de un proyecto antiguo se resuelve al predeterminado.
    inUi: false,
  },
  {
    id: 'openai/gpt-oss-120b-Turbo',
    label: 'GPT o4-mini TURBO',
    author: 'OpenAI',
    speed: 'fast',
    tokensField: 'max_tokens',
    // Familia gpt-oss: sin "low" razona de más, y el razonamiento viaja aparte
    // pero CONSUME del tope de salida — de ahí también el margen.
    reasoningEffort: 'low',
    outputTokensMargin: 2500,
    pricing: { input: 0.15, output: 0.6 },
    // También razona, pero mucho más irregular que su hermano ULTRA: 0,83× a
    // 1,66× en 5 corridas idénticas, media 1,18. Esa varianza es la razón de
    // haberlo medido 5 veces y no una.
    outputFactor: 1.3,
    inCatalog: true,
    // Históricamente entró a la UI: devuelve 14/15 escenas en 4 de 6
    // corridas — la escalera de reintentos del motor lo absorbe (lotes de 5 y
    // de 1). Decisión explícita del origen (v1.6.0). Vuelve el 2026-10-04.
    inUi: true,
  },
]

/** El que se usa cuando el proyecto no eligió ninguno: el de producción. */
export const DEFAULT_LLM_MODEL_ID = MODEL_CATALOG[0]!.id

/*
 * EL RESCATE SALE DEL CATÁLOGO QUE SE VE (v1.16.0 del origen). La ronda de
 * rescate se anuncia en el log del proyecto, así que nombrar ahí un modelo que
 * no figura en la app es contarle al usuario de algo que no puede ni elegir.
 *
 * Y es una LISTA, no una constante: con una constante, el usuario que eligiera
 * justo el modelo de rescate se quedaba SIN ronda de rescate. Con la lista,
 * cada modelo tiene otro detrás, siempre.
 *
 * El único criterio que importa es OTRA FAMILIA: si una escena no salió tras
 * tres rondas con el elegido, pedírsela a su hermano de la misma casa es
 * repetir el intento que ya falló.
 */
export const RESCUE_MODEL_ORDER: readonly string[] = [
  // Rescates entre familias aprobadas; nunca vuelve a un perfil oculto.
  'deepseek-ai/DeepSeek-V4.1-Flash',
  'anthropic/claude-haiku-4-5',
]

/**
 * De qué «casa» es un modelo. En DeepInfra el id es `autor/modelo`, así que el
 * prefijo alcanza — y es justo lo que hace que el ULTRA no rescate al TURBO
 * (los dos son `openai/`) ni el V4-Pro al V4-Flash. Un id sin barra no matchea
 * ninguna familia conocida y se rescata con el primero de la lista: de un
 * modelo desconocido no sabemos a quién se parece, y dejarlo sin rescate sería
 * la peor de las dos opciones.
 */
function modelFamily(id: string): string {
  const slash = id.indexOf('/')
  return (slash > 0 ? id.slice(0, slash) : id).toLowerCase()
}

/**
 * El modelo que re-pide las escenas tercas cuando el elegido las dejó afuera.
 * `undefined` = no hay a quién escalar y la ronda no corre: sin candidato es
 * preferible terminar con las faltantes declaradas antes que re-pedirle a
 * quien ya falló tres veces.
 */
export function rescueModelFor(chosenId: string): LlmModelProfile | undefined {
  const chosenFamily = modelFamily(chosenId)
  for (const id of RESCUE_MODEL_ORDER) {
    if (modelFamily(id) === chosenFamily) continue
    const profile = modelProfile(id)
    if (!profile.inCatalog || !profile.inUi || profile.retired) continue
    return profile
  }
  return undefined
}

/**
 * Perfil deducido por FAMILIA para un id que no está en el catálogo. En el
 * origen existía por los overrides de `.env`; acá permite identificar un
 * pedido desconocido para informar su sustitución. `resolveVerbatimModel`
 * nunca lo ejecuta: la redacción elegible requiere pertenecer a la oferta.
 * No se adivina `reasoning_effort`: cada familia acepta un enum distinto.
 */
function genericProfile(id: string): LlmModelProfile {
  return {
    id,
    label: id,
    author: 'DeepInfra',
    speed: 'medium',
    tokensField: 'max_tokens',
    // Holgado a propósito: de un modelo desconocido no sabemos si razona.
    outputTokensMargin: 3000,
    inCatalog: false,
    inUi: false,
  }
}

/**
 * Perfil técnico, también usado por políticas internas de previews/Catálogo.
 * No decide qué modelos puede elegir un proyecto: eso corresponde a
 * `resolveVerbatimModel`. Id vacío → predeterminado; desconocido → perfil
 * genérico solo para identificarlo, nunca para ofrecerlo en un selector.
 */
export function modelProfile(id: string | null | undefined): LlmModelProfile {
  const requested = typeof id === 'string' ? id.trim() : ''
  if (!requested) return MODEL_CATALOG[0]!

  return (
    MODEL_CATALOG.find((model) => model.id === requested) ??
    genericProfile(requested)
  )
}

export interface ResolvedVerbatimModel {
  profile: LlmModelProfile
  /**
   * Presente cuando el pedido del proyecto se degradó al modelo de la casa
   * (oculto, retirado o desconocido). Quien llama lo anuncia por los eventos
   * del job — preferimos un renglón visible antes que un cambio callado de
   * modelo; en el sidecar no hay `console`: stdout es el canal NDJSON.
   */
  degradedFrom?: LlmModelProfile
}

/**
 * La oferta también gobierna la ejecución del redactor elegible: un modelo
 * oculto, retirado o desconocido de un proyecto antiguo se sustituye por el
 * predeterminado con aviso. No reescribe preferencias ni artefactos pagados.
 * Los servicios internos con política propia consultan `modelProfile`.
 */
export function resolveVerbatimModel(chosenId?: string): ResolvedVerbatimModel {
  const fallback = MODEL_CATALOG[0]!
  const requested = chosenId?.trim()
  if (!requested) return { profile: fallback }

  const profile = modelProfile(requested)
  if (!profile.inCatalog || !profile.inUi || profile.retired)
    return { profile: fallback, degradedFrom: profile }

  return { profile }
}

/** Lo que se le OFRECE al usuario en el selector (rama del selector, B3). */
export function offeredModels(): LlmModelProfile[] {
  return MODEL_CATALOG.filter(
    (model) => model.inCatalog && model.inUi && !model.retired,
  )
}
