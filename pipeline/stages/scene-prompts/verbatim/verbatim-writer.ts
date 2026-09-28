import { createHash } from 'node:crypto'

import {
  modelProfile,
  rescueModelFor,
  resolveVerbatimModel,
} from '../../../providers/llm/model-catalog.ts'
import { isLlmAuthFailure } from '../../../providers/llm/auth-failure.ts'
import { PipelineFailure } from '../../../runner/failure.ts'
import {
  isOutputTruncated,
  withVerbatimRetry,
  type VerbatimClient,
  type VerbatimMessage,
} from '../../../providers/llm/verbatim-client.ts'
import type { LlmModelProfile } from '../../../types/llm-models.ts'
import type { StyleProtagonist } from '../../../types/video-project.ts'
import { isInsufficientCreditsFailure } from '../../../utils/insufficient-credits.ts'
import { buildProtagonistDesignMessage } from '../../../prompts/protagonist-request.ts'
import {
  parseProtagonistDescription,
  PROTAGONIST_TOKENS_BUDGET,
} from '../../shared/protagonist-description.ts'
import { FINAL_PROMPT_BODY_BUDGET } from '../../shared/prompt-safety.ts'
import {
  buildAssistantCharacterTurn,
  buildCharacterDesignMessage,
  buildFragmentsMessage,
  buildScriptMessage,
  buildVerbatimSystem,
  gemWithCharacterPhase,
  VERBATIM_SCENE_WARDROBE,
  type VerbatimCharacterMode,
  type VerbatimFragment,
} from '../../../prompts/verbatim-messages.ts'
import {
  countCompletedPrompts,
  extractCodeBlock,
  LIMIT_PROTOCOL_REGEX,
  localSceneDefect,
  readIdMarkers,
  responseContamination,
  restoreStyleTail,
  splitPrompts,
  stripIdMarker,
  stripReasoning,
  trimEmbeddedCharacterSheet,
  unwrapJsonPrompts,
  validateCharacterPrompt,
} from './parser.ts'
import {
  capWovenIdentity,
  cleanDescription,
  descriptionFromUserPrompt,
  dropSentencesWithState,
  extractWardrobe,
  fallbackUserDescription,
  identityWordCount,
  MIN_IDENTITY_WORDS,
  mentionsProtagonist,
  namesByName,
  namesSubject,
  pointSubjectToImage,
  portraitStateMark,
  removeSubject,
  roleFromDescription,
  roleUsableForWeaving,
  splitOutfit,
  trimPortrait,
  wardrobesLookAlike,
  weaveSubject,
} from './subject-weaver.ts'

// EL CARRIL VERBATIM — la gema del usuario manda, entera y sin envoltorio.
// Port de `motor-web/verbatim/motor.ts` del origen. En qué se diferencia del
// carril de la casa (prompt-writer.ts, que NO se toca):
//
//   |                  | Casa (catálogo)               | Verbatim (gema propia)        |
//   |------------------|-------------------------------|-------------------------------|
//   | `system`         | estilo + GLOBAL_RULES         | la GEMA, verbatim             |
//   | mecánica         | dentro del system             | en mensajes de USUARIO        |
//   | formato          | JSON `{"prompt_imagen": …}`   | bloque de código, línea vacía |
//   | correspondencia  | una llamada por escena        | por ORDEN / ids `((n))`       |
//   | flujo de chat    | no existe                     | se REPLICA (turno assistant)  |
//
// El protagonista: **una sola llamada** (Fase 1), y en cada escena que lo
// nombre se TEJE: `[subject]` → "the <rol>" y la descripción idéntica pegada
// al final (subject-weaver). Un plano de recurso sin `[subject]` queda tal
// cual.

/** Presupuesto de contenido por fragmento (el margen lo pone el perfil). */
const TOKENS_PER_FRAGMENT = 320

/**
 * Tamaño de lote PROPIO del carril verbatim (E34 del origen): hasta 20
 * fragmentos por pedido. La gema está escrita para recibir la LISTA de
 * fragmentos («si recibes 15 fragmentos, devuelves EXACTAMENTE 15 prompts»);
 * con lotes chicos el patrón de lista se desdibuja y el 1:1 se viola más — y
 * cada lote extra es otro boleto para la lotería del 429. El costo es
 * latencia, y se paga a propósito: acá la fidelidad al estilo vale más que la
 * velocidad de la fase.
 *
 * Exportado: el simulador de costos del selector (rama del selector) necesita
 * saber cuántas veces se repite el guion, y ese número sale de acá.
 */
export const VERBATIM_BATCH_SIZE = 20

/**
 * Rondas extra de reintento, cada vez más quirúrgicas: la PRIMERA re-pide
 * TODAS las faltantes juntas (con los ids van identificadas); si reincide,
 * lotes de a 5; al final de a 1 (un pedido de UN fragmento con el conteo
 * anclado no tiene cómo violar el 1:1 por agrupación). Solo después una
 * escena queda como faltante — y pasa a la ronda de rescate con otro modelo.
 */
const RETRY_BATCH_SIZES = [VERBATIM_BATCH_SIZE, 5, 1] as const

/**
 * Intentos de la fase del personaje, más generosos que los de la fase de
 * prompts: medido, algunos modelos devuelven ~1 de cada 3 veces SOLO la frase
 * de cierre de la gema (sin bloque y sin personaje). Subirlo acá es barato
 * (una llamada chica); en la fase de prompts cada intento es un lote.
 */
const CHARACTER_ATTEMPTS = 3

/**
 * Códigos del proveedor que delatan al MODELO (no a la red del usuario ni a
 * un corte determinista que la escalera cura con lotes más chicos). Con uno
 * de estos, el lote ya agotó `withVerbatimRetry`: es un fallo real del
 * elegido y la UI merece enterarse para bloquearlo un rato.
 */
export const PROVIDER_TROUBLE_CODES: ReadonlySet<string> = new Set([
  'llm_timeout',
  'llm_rate_limited',
  'llm_provider_error',
  'llm_empty_response',
])

/** Código sintético: el elegido dejó escenas tercas y otro modelo las rescata. */
export const LLM_RESCUE_NEEDED = 'llm_rescue_needed'

/**
 * Lo que el proyecto declaró sobre su protagonista, ya resuelto por la stage.
 * Unión discriminada a propósito: cada modo trae exactamente el material que
 * necesita, así que no existe el estado imposible «referencia sin nombre» ni
 * «texto sin prompt».
 */
export type VerbatimCharacterInput =
  /** El pipeline lo diseña con la Fase 1 de la gema. El default. Con
   *  `designed`, el proyecto YA lo tiene resuelto (guardado de una corrida
   *  anterior, o recuperado de sus prompts): la Fase 1 no corre y se teje ese
   *  mismo — rediseñarlo cambiaba de personaje a mitad del video. */
  | { mode: 'generic'; designed?: StyleProtagonist }
  /** Lo escribió el usuario. El nombre (E47) es el rol de tejido de
   *  respaldo: su ficha no tiene por qué abrir con un rol. */
  | { mode: 'text'; prompt: string; name?: string }
  /** El usuario aportó una foto: la identidad viaja en la imagen. */
  | { mode: 'reference'; name: string }
  /** El video no tiene protagonista. `withoutScriptProtagonist` (E49) solo
   *  en la reescritura de una escena DESMARCADA. */
  | { mode: 'none'; withoutScriptProtagonist?: boolean }

/**
 * Los prompts ya FINALIZADOS de un lote recién cosechado: tejido del sujeto y
 * vestuario aplicados, o sea exactamente lo que va a recibir el generador de
 * imágenes. Es lo que se puede persistir sin miedo.
 */
export interface VerbatimBatchPrompts {
  prompts: ReadonlyMap<number, string>
  scenesWithSubject: readonly number[]
}

export interface VerbatimWriterOptions {
  /** La gema del usuario. Viaja VERBATIM como `system`. */
  gem: string
  /** Modelo elegido en el proyecto. Vacío → el de la casa. */
  modelId?: string
  /** Qué hace este video con el protagonista. Ausente = `generic`. */
  character?: VerbatimCharacterInput
  /** Contrato local del editor; un incumplimiento se reintenta como defecto
   *  de esa escena antes de tejer identidad o permitir generar imágenes. */
  validatePrompt?: (prompt: string, sceneId: number) => boolean
  /** Revisa prompts finales antes de persistir/comprar imágenes. Solo escenas
   *  temporales; previews conservan su contrato sin este callback. */
  preparePrompt?: (prompt: string, sceneId: number) => string
  reviewPrompts?: (
    prompts: ReadonlyMap<number, string>,
  ) => Promise<ReadonlyMap<number, string>>
  /** Vestuario por escena. Ausente = la constante `VERBATIM_SCENE_WARDROBE`
   *  (inyectable solo para probar las dos variantes sin tocar la constante). */
  sceneWardrobe?: boolean
  /** Cliente ya armado con la clave del job (todos los perfiles del catálogo
   *  son DeepInfra: el mismo cliente sirve para el elegido y el rescate). */
  client: VerbatimClient
  signal?: AbortSignal
  /**
   * El protagonista se acaba de RESOLVER en esta corrida (no venía en
   * `character.designed`). Se espera ANTES de pedir el primer lote: quien
   * llama lo guarda en el proyecto, y un job que muere en plena Fase 2
   * reanuda con el mismo personaje.
   */
  onProtagonistDesigned?: (protagonist: StyleProtagonist) => Promise<void>
  /** Log informativo hacia el canal de eventos del job. */
  onLog?: (message: string) => void
  /** Avisos (fail-soft, degradaciones): en el origen iban por console.warn;
   *  acá el sidecar no tiene console — van al canal como nivel warn. */
  onWarn?: (message: string) => void
  /**
   * Cuántos prompts van escritos, mientras se escriben. `ready` NUNCA
   * retrocede: los lotes van en paralelo y el total se lleva sumando los
   * máximos por lote.
   */
  onProgress?: (ready: number, total: number) => void
  /**
   * Un lote cerró y sus prompts ya están pagados: quien llame los persiste
   * ANTES de que la corrida pueda morir. Sin esto, un fallo más adelante
   * tiraba todo lo escrito y el reintento volvía a comprarlo entero.
   */
  onBatchReady?: (batch: VerbatimBatchPrompts) => Promise<void>
  /**
   * El modelo ELEGIDO falló de verdad: un lote agotó sus reintentos con un
   * código de PROVIDER_TROUBLE_CODES, o sus escenas tercas pasan al rescate
   * (LLM_RESCUE_NEEDED). Solo para el elegido: la ronda de rescate no avisa.
   */
  onModelTrouble?: (modelId: string, code: string, sceneIds: number[]) => void
}

export interface VerbatimResult {
  /** Prompt de escena por número de fragmento (id de escena). */
  prompts: Map<number, string>
  missing: number[]
  /**
   * Ids de escena cuyo prompt nombró al protagonista (medido ANTES de
   * resolver la etiqueta — la única ventana donde `[subject]` existe). Es el
   * dato que decide qué escenas llevan la foto de referencia adjunta.
   */
  scenesWithSubject: number[]
  profile: LlmModelProfile
  inputTokens: number
  outputTokens: number
}

/**
 * Lo que sale de la Fase 1: `portrait` es el prompt COMPLETO del personaje
 * tal como lo escribió la gema — lo que se replica en el turno de assistant;
 * `description` es el retrato pasado por los tres tijeretazos — lo que se
 * TEJE al final de cada escena.
 */
interface VerbatimCharacter {
  portrait: string
  description: string
  /** La ficha buena salió de un reintento CON la fase de personaje de la
   *  plataforma inyectada (la gema sola no supo). */
  completedByPlatform?: boolean
}

/**
 * FASE 1 — el personaje. Una llamada: `system` = gema, `user` = guion +
 * consigna. La respuesta se guarda entera (`portrait`) y la descripción sale
 * de los tijeretazos; `portraitStateMark` VERIFICA el resultado: con marca,
 * la descripción congelaría las 50 escenas y se pide de nuevo.
 */
async function designCharacter(
  script: string,
  options: VerbatimWriterOptions,
  profile: LlmModelProfile,
  count: (input: number, output: number) => void,
  cacheKey: string,
): Promise<VerbatimCharacter | undefined> {
  // El último intento que llegó a recortarse, para la red de rescate del catch.
  let lastAttempt: VerbatimCharacter | undefined
  // La señal E42 DENTRO del loop: si un intento demostró que la gema no sabe
  // diseñar su personaje, los siguientes van con la FASE DE PERSONAJE de la
  // plataforma sumada al system. Los fallos de transporte NO encienden la
  // bandera: sin evidencia de que la gema no supo, la gema viaja pura.
  let gemDidNotKnow = false
  try {
    return await withVerbatimRetry(
      async () => {
        options.signal?.throwIfAborted()
        const response = await options.client.call({
          profile,
          messages: [
            {
              role: 'system',
              content: gemDidNotKnow
                ? gemWithCharacterPhase(options.gem)
                : options.gem,
            },
            {
              role: 'user',
              content: buildCharacterDesignMessage(script, {
                sceneWardrobe: options.sceneWardrobe,
              }),
            },
          ],
          contentTokensBudget: TOKENS_PER_FRAGMENT,
          signal: options.signal,
          cacheKey,
        })
        count(response.inputTokens, response.outputTokens)
        // La misma red de des-envoltura que la Fase 2: un retrato en JSON
        // contaminaba el ROL tejido en cada escena.
        const characterBlock = extractCodeBlock(
          stripReasoning(response.content),
        )
        const unwrapped = unwrapJsonPrompts(characterBlock)
        const [first] = unwrapped
          ? unwrapped.map((item) => item.text)
          : splitPrompts(characterBlock)
        const portrait = first?.trim() ?? ''
        if (!portrait)
          throw new Error('the model returned no usable character prompt')
        validateCharacterPrompt(portrait, 'character prompt')
        // Tijeretazo 1: Style + charla, a una línea. 2 y 3: recortes.
        const clean = cleanDescription(portrait)
        const description = clean ? trimPortrait(clean) : ''
        if (!description)
          throw new Error(
            'the character description came out empty after trimming',
          )
        const current: VerbatimCharacter = { portrait, description }
        lastAttempt = current
        const mark = portraitStateMark(description)
        if (mark) {
          // Marca de estado ≠ gema sin fase: una gema sana también puede
          // dejar pasar una pose. Se re-pide SIN encender la bandera.
          throw new Error(
            `a portrait state mark survived the trims ("${mark}") and would freeze every scene; retrying`,
          )
        }
        // Las dos señales de «la gema no supo» (E42). Encienden la bandera
        // ANTES de re-pedir: el intento siguiente ya lleva la fase.
        if (roleFromDescription(description) === 'main character') {
          gemDidNotKnow = true
          throw new Error(
            'the character sheet did not open with a role; retrying with the platform character phase in the system',
          )
        }
        // Ficha FLACA (jerga de estilo sin identidad): sin pelo/ropa/colores
        // el atuendo sale distinto entre escenas. Si en todos los intentos
        // vino flaca, el catch la conserva igual (mejor flaca que nada).
        if (identityWordCount(description) < MIN_IDENTITY_WORDS) {
          gemDidNotKnow = true
          throw new Error(
            'the character sheet came with style jargon but almost no identity; retrying with the platform character phase',
          )
        }
        return gemDidNotKnow
          ? { ...current, completedByPlatform: true }
          : current
      },
      CHARACTER_ATTEMPTS,
      options.signal,
    )
  } catch (error) {
    // Clave rechazada: no es «la gema no supo», es que nadie puede escribir.
    // Corta el job en vez de seguir sin personaje.
    if (isLlmAuthFailure(error)) throw error
    // Red de rescate: si en TODOS los intentos alguna marca sobrevivió, se
    // tira LA FRASE entera que la trae (el recorte fino que falló tres veces
    // va a fallar la cuarta). Perder una frase de identidad es mejor que
    // congelar la pose en 50 escenas o degradar a "the main character".
    if (!options.signal?.aborted && lastAttempt) {
      const rescue = dropSentencesWithState(lastAttempt.description)
      if (rescue && portraitStateMark(rescue) === undefined) {
        options.onWarn?.(
          `a portrait state mark resisted the trims in every attempt; the sentence carrying it was dropped (last rejection: ${
            error instanceof Error ? error.message : String(error)
          })`,
        )
        return { portrait: lastAttempt.portrait, description: rescue }
      }
      // La ficha FLACA que agotó sus intentos también entra por acá (una
      // descripción limpia pasa entera): se conserva — mejor flaca que nada.
    }
    // Fail-soft: sin personaje el video se hace igual. PERO el motivo se
    // registra siempre — un «no se pudo» mudo dejó 14 escenas con el sujeto
    // sin definir y nadie supo por qué hasta abrir un probe a mano (E30).
    options.onWarn?.(
      `could not design the protagonist: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
    return undefined
  }
}

/**
 * ÚLTIMO RECURSO de la Fase 1: un solo pedido, en formato formulario (JSON),
 * con la gema como system. Devuelve la descripción ya podada y con tope, o
 * `undefined` si tampoco salió — ahí el video sigue como antes (fail-soft).
 * Clave rechazada y saldo agotado cortan el job: no son «la gema no supo».
 */
async function requestProtagonist(
  script: string,
  options: VerbatimWriterOptions,
  profile: LlmModelProfile,
  count: (input: number, output: number) => void,
  cacheKey: string,
): Promise<string | undefined> {
  try {
    options.signal?.throwIfAborted()
    const response = await options.client.call({
      profile,
      messages: [
        { role: 'system', content: options.gem },
        { role: 'user', content: buildProtagonistDesignMessage(script) },
      ],
      contentTokensBudget: PROTAGONIST_TOKENS_BUDGET,
      signal: options.signal,
      cacheKey,
    })
    count(response.inputTokens, response.outputTokens)
    const parsed = parseProtagonistDescription(stripReasoning(response.content))
    if (!parsed) return undefined

    const flattened = parsed.replace(/\s+/g, ' ').trim()
    return capWovenIdentity(descriptionFromUserPrompt(parsed) || flattened)
  } catch (error) {
    if (isLlmAuthFailure(error) || isInsufficientCreditsFailure(error))
      throw error
    if (options.signal?.aborted) throw error
    options.onWarn?.(
      `the protagonist fallback request failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
    return undefined
  }
}

/**
 * El personaje YA RESUELTO de esta corrida: lo que la Fase 1 devolvió, o lo
 * que el usuario trajo, o nada. Lo consumen los dos puntos donde el personaje
 * toca la salida: el turno de `assistant` y el prompt final.
 */
export interface CharacterPlan {
  mode: VerbatimCharacterMode
  /** Lo que se replica en el turno de assistant. Ausente = no va assistant. */
  portrait?: string
  /** La descripción que se pega al final de cada escena que nombre al sujeto. */
  description?: string
  /** Con qué nombre se resuelve `[subject]` cuando la identidad está en la foto. */
  name?: string
  /** Solo cuando el protagonista se resolvió EN ESTA corrida: lo que hay que
   *  guardar en el proyecto. Ausente si ya venía resuelto o no aplica. */
  designedNow?: StyleProtagonist
}

/**
 * El aviso cuando la gema no define cómo crear su personaje. En el origen era
 * un texto en pantalla con las tres salidas; acá va como warn por el canal de
 * eventos (los logs del sidecar son diagnósticos en inglés — si la UI gana un
 * aviso propio, será un evento tipado en una rama posterior).
 */
export const GEM_WITHOUT_CHARACTER_WARNING =
  'this style has no character-design phase: the protagonist may vary between scenes (add that phase to the style, or pick your own character)'
export const GEM_COMPLETED_BY_PLATFORM_WARNING =
  'this style has no character-design phase: the platform completed the character sheet this time so the video comes out right'

/**
 * FASE 1 o su reemplazo, según el modo. Solo `generic` gasta una llamada: en
 * los otros tres la identidad ya está decidida antes de arrancar — pedir un
 * retrato sería pagar tokens para tirarlos, y en `reference` sería peor que
 * inútil (un retrato de texto compitiendo con la foto).
 */
async function resolveCharacter(
  input: VerbatimCharacterInput,
  script: string,
  options: VerbatimWriterOptions,
  profile: LlmModelProfile,
  count: (input: number, output: number) => void,
  cacheKey: string,
): Promise<CharacterPlan> {
  switch (input.mode) {
    case 'text': {
      // El prompt del usuario entra como si lo hubiera escrito el modelo
      // (turno de assistant), y su descripción permanente sale de los mismos
      // tres tijeretazos que el retrato de la Fase 1.
      const portrait = input.prompt.trim()
      let description = capWovenIdentity(descriptionFromUserPrompt(portrait))
      // Los tijeretazos no dejaron nada: mejor la ficha del usuario apenas
      // limpia que un video sin identidad (antes solo quedaba un aviso).
      const fromFallback = !description
      if (fromFallback) description = fallbackUserDescription(portrait)
      // E47 — La ficha del usuario puede abrir con RASGOS y no con un rol: el
      // rol scrapeado de ahí tejía basura. Con nombre disponible y rol
      // inusable, se antepone el nombre (el nombre propio se teje sin
      // artículo). Solo en este modo: el retrato de la Fase 1 abre con el rol
      // por consigna y E42 lo vigila.
      const name = input.name?.trim()
      if (
        description &&
        name &&
        !roleUsableForWeaving(roleFromDescription(description))
      ) {
        description = `${name}, ${description}`
      }
      if (!description) {
        // Fail-soft con el motivo dicho (E30): la escena sale bien escrita
        // igual (el assistant lleva el prompt completo); falta solo la
        // descripción pegada al final. Jamás se le pide al usuario que
        // reescriba su personaje por esto.
        options.onWarn?.(
          'no usable permanent description survived trimming the user character prompt: it still travels in the conversation, but is not appended to each scene',
        )
      } else if (fromFallback) {
        options.onLog?.(
          'the trims left no permanent description: the lightly cleaned user description is appended to each scene instead',
        )
      }
      options.onLog?.(
        'user character travels identical in every scene it appears in',
      )
      return {
        mode: 'text',
        portrait,
        description: description || undefined,
        name,
      }
    }
    case 'reference': {
      options.onLog?.(
        'the reference photo defines the character: it is attached to the generator in every scene it appears in',
      )
      return { mode: 'reference', name: input.name.trim() }
    }
    case 'none': {
      options.onLog?.(
        input.withoutScriptProtagonist
          ? 'the protagonist stays out of these scenes: they are written about the place and what happens'
          : 'this style carries no protagonist: scenes are written about what is narrated',
      )
      return { mode: 'none' }
    }
    default: {
      // El proyecto ya tiene a su protagonista: se teje ESE, sin Fase 1.
      if (input.designed) {
        options.onLog?.(
          'protagonist already resolved for this project: reused as-is, not redesigned',
        )
        return {
          mode: 'generic',
          portrait: input.designed.portrait,
          description: input.designed.description,
        }
      }

      return designProtagonistPlan(script, options, profile, count, cacheKey)
    }
  }
}

/**
 * El protagonista de una gema SIN personaje del usuario: la Fase 1 y, si no
 * deja ninguna ficha, el pedido de último recurso. Devuelve el plan con
 * `designedNow` cuando salió algo, o `generic` pelado cuando no.
 */
async function designProtagonistPlan(
  script: string,
  options: VerbatimWriterOptions,
  profile: LlmModelProfile,
  count: (input: number, output: number) => void,
  cacheKey: string,
): Promise<CharacterPlan> {
  const designed = await designCharacter(
    script,
    options,
    profile,
    count,
    cacheKey,
  )
  if (designed) {
    // ¿La gema realmente sabe diseñar un personaje? Tres finales, cada
    // uno con su verdad: la diseñó bien; no supo pero la fase inyectada
    // completó la ficha; o ni con eso salió (la conservó el rescate).
    if (designed.completedByPlatform) {
      options.onWarn?.(GEM_COMPLETED_BY_PLATFORM_WARNING)
    } else {
      const gemWithoutCharacter =
        roleFromDescription(designed.description) === 'main character' ||
        identityWordCount(designed.description) < MIN_IDENTITY_WORDS
      if (gemWithoutCharacter) {
        options.onWarn?.(GEM_WITHOUT_CHARACTER_WARNING)
      } else {
        options.onLog?.(
          'protagonist designed once: travels identical in every scene it appears in',
        )
      }
    }
    const description = capWovenIdentity(designed.description)
    const outfit =
      (options.sceneWardrobe ?? VERBATIM_SCENE_WARDROBE)
        ? splitOutfit(description).outfit
        : undefined
    if (options.sceneWardrobe ?? VERBATIM_SCENE_WARDROBE)
      options.onLog?.(
        outfit
          ? 'the character sheet separates its base outfit: scene wardrobe can replace it'
          : 'the character sheet has no separate outfit sentence: scene wardrobe travels with the whole description',
      )
    return {
      mode: 'generic',
      portrait: designed.portrait,
      description,
      designedNow: {
        portrait: designed.portrait,
        description,
        ...(outfit ? { outfit } : {}),
        source: designed.completedByPlatform ? 'platform-phase' : 'style-phase',
      },
    }
  }

  // Último recurso: la Fase 1 no dejó NINGUNA ficha. Antes el video salía
  // entero con "the main character"; ahora se le pide la identidad a la
  // gema en formato formulario (el mismo pedido de las muestras).
  const requested = await requestProtagonist(
    script,
    options,
    profile,
    count,
    cacheKey,
  )
  if (requested) {
    options.onWarn?.(
      'the character-design phase left no usable sheet: the protagonist came from the platform fallback request instead',
    )
    return {
      mode: 'generic',
      portrait: requested,
      description: requested,
      designedNow: {
        portrait: requested,
        description: requested,
        source: 'fallback-request',
      },
    }
  }
  options.onWarn?.(GEM_WITHOUT_CHARACTER_WARNING)
  return { mode: 'generic' }
}

/** La clave de caché del proveedor: gema + guion, parametrizada por modelo. */
function verbatimCacheKey(
  modelId: string,
  gem: string,
  script: string,
): string {
  return `vimo-verbatim-${createHash('sha1')
    .update(modelId)
    .update(' ')
    .update(gem)
    .update(' ')
    .update(script)
    .digest('hex')
    .slice(0, 24)}`
}

// Las muestras no heredan cambios del selector de escenas: conservan el
// perfil previo, sin high ni nuevos plazos (ADR-0044).
const STYLE_PREVIEW_PROTAGONIST_MODEL_ID = 'openai/gpt-oss-120b-Ultra'

export interface StyleProtagonistDesignOptions {
  /** La gema del usuario, verbatim como `system`. */
  gem: string
  script: string
  client: VerbatimClient
  signal?: AbortSignal
  onLog?: (message: string) => void
  onWarn?: (message: string) => void
}

/**
 * El protagonista que una gema define, resuelto EXACTAMENTE como lo resuelve
 * el video (misma Fase 1, mismos recortes, mismo último recurso), para quien
 * no corre el carril entero: las muestras del estilo. Antes las muestras se
 * lo pedían a la gema con un formulario JSON pensado para un humano neutro
 * («head/hair», «no art style words») y el modelo NORMALIZABA al personaje:
 * un muñeco de cabeza blanca y ojos de punto salía como una persona con pelo
 * en las muestras, y como muñeco en el video. Con la misma Fase 1 en los dos
 * lados, lo que se ve en la muestra es lo que sale en el video. `undefined`
 * si ni la Fase 1 ni el último recurso dejaron nada (ya avisado por `onWarn`).
 */
export async function designStyleProtagonist(
  options: StyleProtagonistDesignOptions,
): Promise<StyleProtagonist | undefined> {
  const profile = modelProfile(STYLE_PREVIEW_PROTAGONIST_MODEL_ID)
  const writerOptions: VerbatimWriterOptions = {
    gem: options.gem,
    client: options.client,
    signal: options.signal,
    onLog: options.onLog,
    onWarn: options.onWarn,
  }
  const plan = await designProtagonistPlan(
    options.script,
    writerOptions,
    profile,
    () => {},
    verbatimCacheKey(profile.id, options.gem, options.script),
  )
  return plan.designedNow
}

/**
 * El prompt de escena listo para el generador (TEJIDO, no encabezado). La
 * lógica vive en subject-weaver: `[subject]` → "the <rol>" + descripción
 * idéntica al final; plano de recurso queda tal cual; sin descripción, el tag
 * se degrada al genérico (E29-bis: nunca un `[subject]` pelado al generador).
 * Con foto se resuelve con el nombre y no se pega nada; sin protagonista se
 * degrada al neutro.
 */
export function composeFinalPrompt(
  scenePrompt: string,
  character?: CharacterPlan,
  wardrobe?: string,
): string {
  if (!character) return weaveSubject(scenePrompt)
  if (character.mode === 'reference')
    return pointSubjectToImage(scenePrompt, character.name ?? '', wardrobe)
  if (character.mode === 'none') return removeSubject(scenePrompt)
  return weaveSubject(
    scenePrompt,
    character.description,
    character.name,
    wardrobe,
  )
}

/**
 * La ropa de cada escena, leída de los marcadores y con una regla de
 * continuidad: una escena cuyo marcador se PARECE al de la escena anterior
 * (comparten una prenda) hereda ese texto palabra por palabra — dos
 * fragmentos seguidos en la playa no cambian de traje de baño porque el
 * modelo lo redactó distinto. Una ropa distinta (de la playa a la nieve)
 * corta la cadena. Devuelve los prompts con el marcador quitado, la ropa por
 * escena, y los marcadores descartados.
 */
function readSceneWardrobes(prompts: ReadonlyMap<number, string>): {
  scenes: Map<number, string>
  wardrobes: Map<number, string>
  rejected: Map<number, string>
} {
  const scenes = new Map<number, string>()
  const wardrobes = new Map<number, string>()
  const rejected = new Map<number, string>()
  const ids = [...prompts.keys()].sort((a, b) => a - b)
  for (const id of ids) {
    const extraction = extractWardrobe(prompts.get(id)!)
    scenes.set(id, extraction.scene)
    if (extraction.rejected) rejected.set(id, extraction.rejected)
    if (!extraction.wardrobe) continue
    const previous = wardrobes.get(id - 1)
    wardrobes.set(
      id,
      previous && wardrobesLookAlike(previous, extraction.wardrobe)
        ? previous
        : extraction.wardrobe,
    )
  }
  return { scenes, wardrobes, rejected }
}

/**
 * Lo que el post-proceso produce a partir de lo cosechado: el prompt FINAL de
 * cada escena —tejido del sujeto y vestuario ya aplicados— y los contadores
 * con los que el final de la corrida arma sus avisos.
 */
interface FinalizedVerbatimPrompts {
  prompts: Map<number, string>
  scenesWithSubject: number[]
  wardrobes: Map<number, string>
  rejectedWardrobes: Map<number, string>
  overBudget: number[]
  sneakedIn: number
  bare: number
}

/**
 * Convierte los prompts crudos cosechados en los que va a recibir el
 * generador. Es PURA a propósito —ni logs ni disco— porque se llama dos
 * veces: al cerrar cada lote, para persistir lo que ya se pagó, y una vez al
 * final, canónica, que es la que alimenta los avisos y el resultado.
 *
 * `only` acota qué escenas se COMPONEN y se devuelven, nunca qué arma la
 * cadena del vestuario: `readSceneWardrobes` corre siempre sobre el
 * `obtained` completo porque su regla de continuidad mira la escena anterior
 * (la N hereda la ropa de la N-1 cuando se parecen). Acotar la cadena al lote
 * rompería esa herencia, que es justo lo que sostiene el vestuario por escena.
 */
function finalizeVerbatimPrompts(
  obtained: ReadonlyMap<number, string>,
  character: CharacterPlan,
  sceneWardrobe: boolean,
  only?: ReadonlySet<number>,
): FinalizedVerbatimPrompts {
  const prompts = new Map<number, string>()
  const scenesWithSubject: number[] = []
  const overBudget: number[] = []
  let sneakedIn = 0
  let bare = 0
  // Los marcadores salen del prompt ANTES de mirar quién nombra al
  // protagonista, y la ropa se teje junto al rol.
  const wardrobes = sceneWardrobe ? readSceneWardrobes(obtained) : undefined

  for (const [n, rawPrompt] of obtained) {
    if (only && !only.has(n)) continue
    const prompt = wardrobes?.scenes.get(n) ?? rawPrompt
    // Con FOTO, una escena también «trae al protagonista» si el modelo
    // escribió su NOMBRE directo en vez de la etiqueta (v1.27.0). Y en los
    // modos con DESCRIPCIÓN, también si lo mencionó de forma genérica sin
    // etiqueta ("The narrator sits...", v1.29.0): el tejido se la pega.
    const isBare =
      (character.mode === 'generic' || character.mode === 'text') &&
      !!character.description &&
      !namesSubject(prompt) &&
      mentionsProtagonist(prompt)
    const carriesSubject =
      namesSubject(prompt) ||
      ((character.mode === 'reference' || character.mode === 'text') &&
        namesByName(prompt, character.name)) ||
      isBare
    if (carriesSubject) {
      scenesWithSubject.push(n)
      if (character.mode === 'none') sneakedIn++
      if (isBare) bare++
    }
    const finalPrompt = composeFinalPrompt(
      prompt,
      character,
      wardrobes?.wardrobes.get(n),
    )
    if (finalPrompt.length > FINAL_PROMPT_BODY_BUDGET) overBudget.push(n)
    prompts.set(n, finalPrompt)
  }
  scenesWithSubject.sort((a, b) => a - b)

  return {
    prompts,
    scenesWithSubject,
    wardrobes: wardrobes?.wardrobes ?? new Map(),
    rejectedWardrobes: wardrobes?.rejected ?? new Map(),
    overBudget,
    sneakedIn,
    bare,
  }
}
function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = []
  for (let index = 0; index < items.length; index += size)
    batches.push(items.slice(index, index + size))
  return batches
}

/**
 * Convierte la respuesta de un lote en prompts, mapeando POR ORDEN (o por ID
 * si vinieron los marcadores).
 *
 * De MÁS no es un fallo: se recorta y se sigue (medido: el modelo se
 * entusiasma y agrega escenas al final, +1/+2, todas bien formadas). De MENOS
 * sí: falta un fragmento y no hay forma de saber cuál — se descarta el lote
 * ENTERO y se reintenta (una lista corrida pondría la imagen equivocada en
 * cada escena desde ahí hasta el final).
 *
 * Taxonomía de fallos (E35): CONTEO/ORDEN roto o CONTAMINACIÓN → lote entero
 * (no hay mapeo confiable que salvar). Defecto LOCAL de una escena (hueco de
 * plantilla, ficha de personaje) → esa escena vuelve en `defective` y las
 * demás se COSECHAN.
 */
export interface BatchReading {
  good: { n: number; prompt: string }[]
  defective: { n: number; reason: string }[]
  /** Prompts sobrantes descartados del final, textuales: el log dice QUÉ se
   *  tiró y no solo cuántos. */
  trimmed: string[]
  /** Escenas SALVADAS en el acto (traían la ficha adentro, E35): además del
   *  número va LO QUE SE QUITÓ, textual — la única forma de auditar desde
   *  afuera que la cura no se llevó nada bueno. */
  repaired: { n: number; removed: string }[]
  /** Escenas a las que se les DEVOLVIÓ la cola de estilo que el modelo se
   *  olvidó de poner (sin ella el video sale mitad y mitad). */
  styleRestored: { n: number; added: string }[]
}

/**
 * El trozo que la reparación se llevó: lo que hay en el original y no en el
 * reparado. Por prefijo y sufijo comunes, así sirve igual para el corte del
 * final y para la extirpación del medio.
 */
function whatWasRemoved(original: string, repaired: string): string {
  let start = 0
  while (start < repaired.length && original[start] === repaired[start]) start++
  let end = 0
  while (
    end < repaired.length - start &&
    original[original.length - 1 - end] === repaired[repaired.length - 1 - end]
  ) {
    end++
  }
  return original.slice(start, original.length - end).trim()
}

/**
 * Clasifica UNA escena del lote: sana → `good`; con la ficha pegada y escena
 * salvable → se CORTA y va a `good` (+ `repaired`); cualquier otro defecto →
 * `defective`. Reparar acá y no re-pedir: en racha de fichas, CADA re-pedido
 * vuelve con la misma ficha (un video real quemó las 3 rondas). El recorte se
 * re-valida ENTERO: un hueco E33 no se cura cortando.
 */
function classifyScene(n: number, prompt: string, target: BatchReading): void {
  const defect = localSceneDefect(prompt)
  if (!defect) {
    target.good.push({ n, prompt })
    return
  }
  const trimmedPrompt = trimEmbeddedCharacterSheet(prompt)
  if (
    trimmedPrompt !== undefined &&
    localSceneDefect(trimmedPrompt) === undefined
  ) {
    target.good.push({ n, prompt: trimmedPrompt })
    target.repaired.push({ n, removed: whatWasRemoved(prompt, trimmedPrompt) })
    return
  }
  target.defective.push({ n, reason: defect })
}

export function readBatchPrompts(
  raw: string,
  batch: readonly VerbatimFragment[],
): BatchReading {
  const clean = stripReasoning(raw)
  const block = extractCodeBlock(clean)
  // RED DE DES-ENVOLTURA (v1.29.0): si la respuesta vino en JSON (una gema
  // del usuario que lo pida), se desenvuelve ANTES de trocear. Con ids en el
  // JSON, la correspondencia es por ID directo (mejor dato que el orden).
  const fromJson = unwrapJsonPrompts(block)
  if (fromJson && fromJson.every((item) => typeof item.n === 'number')) {
    return readById(
      fromJson
        .map((item) => ({
          n: item.n as number,
          text: stripIdMarker(item.text),
        }))
        .filter((item) => item.text.length > 0),
      batch,
    )
  }
  const pieces = fromJson
    ? fromJson.map((item) => item.text)
    : splitPrompts(block, batch.length)
  const first = batch[0]?.n ?? 0
  const last = batch[batch.length - 1]?.n ?? 0

  // DOBLE LECTURA: con los marcadores `((n))` en TODOS los trozos, la
  // correspondencia es por ID y el conteo deja de ser un juicio de vida o
  // muerte. Sin marcadores completos, el camino por ORDEN de siempre.
  const byId = readIdMarkers(pieces)
  if (byId) return readById(byId, batch)

  const texts = pieces.map(stripIdMarker)

  // El recorte del entusiasmo tiene TOPE: +1/+2 es lo medido. Muchos más ya
  // no es entusiasmo: es el modelo re-haciendo el video entero, y ahí el
  // primer prompt del bloque NO corresponde al primer fragmento del lote —
  // recortar mapearía la imagen de otra escena, en silencio.
  if (texts.length > batch.length + 2)
    throw new Error(
      `the model returned ${texts.length} prompts for a batch of ${batch.length} fragments (${first}-${last}): it rewrote too much and the order is no longer reliable; discarding the whole batch`,
    )

  const trimmed: string[] = []
  if (texts.length > batch.length) {
    trimmed.push(...texts.slice(batch.length))
    texts.length = batch.length
  }

  if (texts.length !== batch.length) {
    const limit = LIMIT_PROTOCOL_REGEX.exec(clean)
    if (limit)
      throw new Error(
        `the model cut its answer with its limit protocol (up to fragment ${limit[1]}): ${texts.length} prompts for the ${batch.length} in the batch (${first}-${last}); retrying with a smaller batch`,
      )
    throw new Error(
      `the model returned ${texts.length} prompts for a batch of ${batch.length} fragments (${first}-${last}); without a 1:1 mapping the batch is discarded and retried`,
    )
  }

  const reading: BatchReading = {
    good: [],
    defective: [],
    trimmed,
    repaired: [],
    styleRestored: [],
  }
  batch.forEach((fragment, index) => {
    const prompt = texts[index] ?? ''
    const contamination = responseContamination(prompt)
    if (contamination)
      throw new Error(
        `in the prompt for fragment ${fragment.n}: ${contamination}; the whole answer is suspect — discarding the batch`,
      )
    classifyScene(fragment.n, prompt, reading)
  })
  reading.styleRestored = restoreStyleTail(reading.good)
  return reading
}

/**
 * Lectura POR ID: faltante identificado exacto → `defective` (la ronda
 * siguiente lo re-pide SOLO); duplicado → queda la PRIMERA aparición y el
 * resto a `trimmed` con su texto; id fuera del lote → `trimmed`;
 * contaminación en CUALQUIER trozo → condena al lote entero.
 */
function readById(
  byId: readonly { n: number; text: string }[],
  batch: readonly VerbatimFragment[],
): BatchReading {
  for (const { n, text } of byId) {
    const contamination = responseContamination(text)
    if (contamination)
      throw new Error(
        `in the prompt for fragment ${n}: ${contamination}; the whole answer is suspect — discarding the batch`,
      )
  }

  const trimmed: string[] = []
  const batchIds = new Set(batch.map((fragment) => fragment.n))
  const byNumber = new Map<number, string>()
  for (const { n, text } of byId) {
    if (!batchIds.has(n)) {
      trimmed.push(`((${n})) outside the batch: ${text}`)
    } else if (byNumber.has(n)) {
      trimmed.push(`((${n})) duplicated: ${text}`)
    } else {
      byNumber.set(n, text)
    }
  }

  const reading: BatchReading = {
    good: [],
    defective: [],
    trimmed,
    repaired: [],
    styleRestored: [],
  }
  for (const fragment of batch) {
    const prompt = byNumber.get(fragment.n)
    if (prompt === undefined) {
      reading.defective.push({
        n: fragment.n,
        reason: 'missing from the answer (identified by id)',
      })
      continue
    }
    classifyScene(fragment.n, prompt, reading)
  }
  reading.styleRestored = restoreStyleTail(reading.good)
  return reading
}

/**
 * FASE 2 — los prompts de escena, en lotes que salen TODOS a la vez. Ningún
 * lote espera al anterior: la fase dura lo que tarda UNO. Un lote caído no
 * tumba la corrida — sus fragmentos quedan como faltantes y entran a la
 * escalera de reintento con lotes más chicos.
 */
export async function generateVerbatimPrompts(
  fragments: readonly VerbatimFragment[],
  fullScript: string,
  options: VerbatimWriterOptions,
): Promise<VerbatimResult> {
  const resolved = resolveVerbatimModel(options.modelId)
  const profile = resolved.profile
  if (resolved.degradedFrom) {
    // El motivo verdadero, nunca un cambio callado de modelo.
    options.onWarn?.(
      `the project asked for ${resolved.degradedFrom.label}: that model is not available for scene writing, writing with ${profile.label} instead`,
    )
  }
  let inputTokens = 0
  let outputTokens = 0
  const count = (input: number, output: number) => {
    inputTokens += input
    outputTokens += output
  }

  // Una clave por corrida: todos los lotes (y sus reintentos y el rescate)
  // comparten el prefijo gema + guion + personaje, así que la clave se deriva
  // de ese material y no del reloj — un «Reintentar» posterior del mismo
  // proyecto produce la misma clave y reusa el caché. Parametrizada por
  // modelo: la ronda de rescate necesita SU clave (otras réplicas tibias).
  const cacheKeyFor = (modelId: string) =>
    verbatimCacheKey(modelId, options.gem, fullScript)
  const cacheKey = cacheKeyFor(profile.id)

  options.onLog?.(
    `writing the prompts with ${profile.label} (${profile.author})`,
  )

  const character = await resolveCharacter(
    options.character ?? { mode: 'generic' },
    fullScript,
    options,
    profile,
    count,
    cacheKey,
  )
  // Guardado ANTES del primer lote: si el job muere en plena Fase 2, la
  // reanudación teje a este mismo protagonista en las escenas que faltan.
  if (character.designedNow)
    await options.onProtagonistDesigned?.(character.designedNow)
  const mode = character.mode
  // E49 — El flag viaja en la ENTRADA (no en el plan resuelto): solo la
  // reescritura de una escena desmarcada lo enciende.
  const withoutScriptProtagonist =
    options.character?.mode === 'none' &&
    options.character.withoutScriptProtagonist === true

  // Vestuario por escena: lo miran el cierre de CADA LOTE (que persiste lo ya
  // pagado) y el pase canónico del final, así que se resuelve una sola vez.
  const sceneWardrobe = options.sceneWardrobe ?? VERBATIM_SCENE_WARDROBE

  const batchSize = Math.min(VERBATIM_BATCH_SIZE, fragments.length)
  const batchCount = Math.ceil(fragments.length / batchSize)
  options.onLog?.(
    batchCount === 1
      ? `all ${fragments.length} fragments go in a single request`
      : `${fragments.length} fragments go in ${batchCount} requests of up to ${batchSize}`,
  )

  // El «ejecutor» es lo ÚNICO que cambia en la ronda de rescate: perfil y
  // clave de caché (el cliente es el mismo — todos los perfiles son
  // DeepInfra). La conversación (gema, guion, personaje, ids) es LA MISMA.
  const chosenExecutor = { profile, cacheKey }
  // ¿Algún lote del ELEGIDO falló por algo que no sea la red de la persona?
  // Solo entonces el rescate cuenta como fallo del modelo: sin internet todos
  // los lotes caen con llm_network y no hay a quién culpar.
  let chosenModelBlamed = false
  const obtained = new Map<number, string>()
  const alignmentFeedback = new Map<number, string>()
  // Congela el texto efectivamente revisado: un lote paralelo no puede
  // cambiar su vestuario heredado después de aprobarlo.
  const reviewedPrompts = new Map<number, string>()
  let lastError = ''

  // Progreso REAL: cada lote informa cuántos prompts lleva escritos y acá se
  // suman. Máximo POR LOTE (el callback llega con el total del lote, no con
  // un incremento; y los lotes corren en paralelo, entremezclados).
  const writtenPerBatch = new Map<number, number>()
  const reportProgress = () => {
    let ready = 0
    for (const n of writtenPerBatch.values()) ready += n
    // Los ya cosechados mandan sobre la cuenta del stream: al terminar un
    // lote su cifra es definitiva.
    options.onProgress?.(
      Math.min(fragments.length, Math.max(ready, obtained.size)),
      fragments.length,
    )
  }

  const requestBatch = async (
    batch: readonly VerbatimFragment[],
    batchId: number,
    executor: { profile: LlmModelProfile; cacheKey: string } = chosenExecutor,
  ) => {
    // La conversación del playground, replicada turno por turno. El guion
    // COMPLETO viaja en CADA lote a propósito: es lo que activa la Fase 1 de
    // la gema y da el contexto narrativo. Lo único que cambia entre lotes es
    // el último mensaje. El assistant repite el RETRATO tal como el modelo lo
    // devolvió (con personaje del usuario, su texto: el modelo cree que ese
    // retrato lo escribió él). Con FOTO o SIN protagonista no hay turno que
    // replicar — el preámbulo del lote es el que dice qué hacer.
    const messages: VerbatimMessage[] = [
      {
        role: 'system',
        content: buildVerbatimSystem(options.gem, mode, {
          withoutScriptProtagonist,
          sceneWardrobe: options.sceneWardrobe,
        }),
      },
      { role: 'user', content: buildScriptMessage(fullScript) },
      ...(character.portrait
        ? [
            {
              role: 'assistant' as const,
              content: buildAssistantCharacterTurn(character.portrait),
            },
          ]
        : []),
      {
        role: 'user',
        content: buildFragmentsMessage(
          batch.map((fragment) => {
            const feedback = alignmentFeedback.get(fragment.n)
            if (!feedback) return fragment
            return {
              ...fragment,
              note: [
                fragment.note,
                `CORRECCION DE CORRESPONDENCIA: ${feedback}`,
              ]
                .filter(Boolean)
                .join(' '),
            }
          }),
          mode,
          {
            sceneWardrobe: options.sceneWardrobe,
          },
        ),
      },
    ]
    const reading = await withVerbatimRetry(
      async () => {
        options.signal?.throwIfAborted()
        const response = await options.client.call({
          profile: executor.profile,
          messages,
          contentTokensBudget: batch.length * TOKENS_PER_FRAGMENT,
          signal: options.signal,
          cacheKey: executor.cacheKey,
          onProgress: options.onProgress
            ? (partial) => {
                const written = countCompletedPrompts(partial, batch.length)
                // Solo hacia adelante: un reintento de este mismo lote
                // arranca de cero y no puede hacer retroceder la barra.
                if (written > (writtenPerBatch.get(batchId) ?? 0)) {
                  writtenPerBatch.set(batchId, written)
                  reportProgress()
                }
              }
            : undefined,
        })
        count(response.inputTokens, response.outputTokens)
        const reading = readBatchPrompts(response.content, batch)
        if (options.validatePrompt) {
          reading.good = reading.good.filter((entry) => {
            if (options.validatePrompt!(entry.prompt, entry.n)) return true
            reading.defective.push({
              n: entry.n,
              reason: 'does not respect the character selection for this scene',
            })
            return false
          })
        }
        return reading
      },
      2,
      options.signal,
    )
    if (options.reviewPrompts && reading.good.length > 0) {
      const pendingPrompts = new Map(obtained)
      for (const entry of reading.good)
        pendingPrompts.set(entry.n, entry.prompt)
      const finalized = finalizeVerbatimPrompts(
        pendingPrompts,
        character,
        sceneWardrobe,
        new Set(reading.good.map((entry) => entry.n)),
      )
      if (options.preparePrompt) {
        for (const [id, prompt] of finalized.prompts)
          finalized.prompts.set(id, options.preparePrompt(prompt, id))
      }
      const rejected = await options.reviewPrompts(finalized.prompts)
      options.signal?.throwIfAborted()
      reading.good = reading.good.filter((entry) => {
        const feedback = rejected.get(entry.n)
        if (!feedback) {
          alignmentFeedback.delete(entry.n)
          reviewedPrompts.set(entry.n, finalized.prompts.get(entry.n)!)
          return true
        }
        alignmentFeedback.set(entry.n, feedback)
        reading.defective.push({
          n: entry.n,
          reason: 'narrative alignment rejected',
        })
        return false
      })
    }
    return reading
  }

  // Identifica cada lote para el progreso, por RONDA además de por posición:
  // en la ronda de reintento los lotes son otros, y reusar el id compararía
  // el conteo del lote nuevo contra el máximo del viejo.
  let currentRound = 0
  const runRoundInParallel = async (
    pending: VerbatimFragment[],
    size: number,
    executor = chosenExecutor,
  ) => {
    const round = currentRound++
    const settled = await Promise.allSettled(
      chunk(pending, size).map(async (batch, index) => {
        try {
          const reading = await requestBatch(
            batch,
            round * 1000 + index,
            executor,
          )
          const justObtained = new Set<number>()
          for (const entry of reading.good) {
            if (obtained.has(entry.n)) continue
            obtained.set(entry.n, entry.prompt)
            justObtained.add(entry.n)
          }
          // Trazabilidad del recorte: QUÉ se descartó, no solo cuántos.
          if (reading.trimmed.length > 0) {
            options.onLog?.(
              `the batch brought ${reading.trimmed.length} extra prompt(s) at the end, discarded: ${reading.trimmed
                .map((text) => `"${text.slice(0, 45)}…"`)
                .join(' · ')}`,
            )
          }
          // E35 reparado EN EL ACTO — y se dice TEXTUALMENTE qué se sacó.
          for (const repair of reading.repaired) {
            options.onLog?.(
              `scene ${repair.n} carried the character sheet inside: removed «${repair.removed}» and used the rest as-is, without re-requesting`,
            )
          }
          // La cola de estilo que el modelo se olvidó: se le devuelve la
          // MISMA que traen las otras escenas del lote.
          for (const restore of reading.styleRestored) {
            options.onLog?.(
              `scene ${restore.n} came without the style tail: restored the same one the others carry («${restore.added}»)`,
            )
          }
          // Defecto LOCAL: las buenas ya quedaron cosechadas; la defectuosa
          // no entra a `obtained` y la próxima ronda la re-pide SOLA.
          for (const defect of reading.defective) {
            lastError = `scene ${defect.n} came with ${defect.reason}`
            options.onLog?.(
              `scene ${defect.n} came defective (${defect.reason}): re-requesting it alone, without discarding the batch`,
            )
          }
          // Lo de este lote YA SE PAGÓ: se persiste en el acto para que un
          // fallo posterior —o la cancelación de la UI cuando el modelo da
          // errores— no lo tire y haya que volver a comprarlo. La cadena del
          // vestuario se recalcula sobre TODO lo cosechado hasta acá (la
          // finalización lo exige), pero solo se componen los ids nuevos.
          if (justObtained.size > 0 && options.onBatchReady) {
            const ready = finalizeVerbatimPrompts(
              obtained,
              character,
              sceneWardrobe,
              justObtained,
            )
            for (const id of justObtained) {
              const reviewed = reviewedPrompts.get(id)
              if (reviewed !== undefined) ready.prompts.set(id, reviewed)
            }
            options.signal?.throwIfAborted()
            try {
              await options.onBatchReady({
                prompts: ready.prompts,
                scenesWithSubject: ready.scenesWithSubject,
              })
            } catch (error) {
              // Un problema de disco NO es un fallo del modelo: si esto cayera
              // en el catch del lote, marcaría `chosenModelBlamed` y la UI
              // bloquearía una hora a un modelo sano.
              options.onWarn?.(
                `the prompts of this batch could not be saved (they stay in memory and the run continues): ${
                  error instanceof Error ? error.message : String(error)
                }`,
              )
            }
          }
          // Cosechado: la cifra del stream era una estimación; esto es un hecho.
          reportProgress()
        } catch (error) {
          // Clave rechazada: la escalera y el rescate darían el mismo 401 y
          // el video saldría con prompts de relleno. Se corta el job.
          options.signal?.throwIfAborted()
          if (isLlmAuthFailure(error) || isInsufficientCreditsFailure(error))
            throw error
          if (
            error instanceof PipelineFailure &&
            error.code === 'scene_prompt_alignment_failed'
          )
            throw error
          // Un lote caído NO tumba la corrida: sus fragmentos quedan como
          // faltantes y entran a la escalera de reintento. Un corte por tope
          // de tokens tampoco: la escalera pide lotes más chicos, que es
          // justo la cura para ese fallo determinista.
          if (isOutputTruncated(error)) {
            lastError = 'the answer hit the output token ceiling'
          } else {
            lastError = error instanceof Error ? error.message : String(error)
          }
          // El motivo real, en el acto y por lote: sin esto el único rastro
          // de un fallo del proveedor era el «last notice» del final.
          options.onWarn?.(
            `batch ${batch[0]?.n}-${batch[batch.length - 1]?.n} failed with ${executor.profile.label}: ${lastError}`,
          )
          const networkFailure =
            error instanceof PipelineFailure && error.code === 'llm_network'
          if (executor.profile.id === profile.id && !networkFailure)
            chosenModelBlamed = true
          // Fallo del PROVEEDOR con el modelo elegido (no en el rescate): la
          // UI se entera para bloquearlo un rato. No cambia nada acá: el
          // lote entra igual a la escalera de reintento.
          if (
            executor.profile.id === profile.id &&
            error instanceof PipelineFailure &&
            PROVIDER_TROUBLE_CODES.has(error.code)
          ) {
            options.onModelTrouble?.(
              profile.id,
              error.code,
              batch.map((fragment) => fragment.n),
            )
          }
        }
      }),
    )
    const failed = settled.find((entry) => entry.status === 'rejected')
    if (failed?.status === 'rejected') throw failed.reason
  }

  await runRoundInParallel([...fragments], batchSize)

  for (const retrySize of RETRY_BATCH_SIZES) {
    const missing = fragments.filter((fragment) => !obtained.has(fragment.n))
    if (missing.length === 0) break
    if (options.signal?.aborted) break
    options.onLog?.(
      retrySize === 1
        ? `retrying ${missing.length} scene(s) that did not come out, now one by one`
        : retrySize === VERBATIM_BATCH_SIZE
          ? `retrying ${missing.length} scene(s) that did not come out, all together in one request`
          : `retrying ${missing.length} scene(s) that did not come out, with smaller batches`,
    )
    await runRoundInParallel([...missing], Math.min(batchSize, retrySize))
  }

  // RONDA DE RESCATE con otro modelo de la casa: si el elegido dejó escenas
  // tercas, no nos quedamos trabados en el mismo modelo con el mismo error.
  // La conversación es LA MISMA (gema, guion, personaje, ids) y los guards
  // también — NO viola E34: el estilo lo sigue escribiendo la gema; solo
  // cambia el ejecutor, y queda en el log. Quién rescata lo decide
  // `rescueModelFor`: el primero del catálogo que NO sea de la familia del
  // elegido; sin candidato quedan faltantes declaradas.
  const stubborn = fragments.filter((fragment) => !obtained.has(fragment.n))
  const rescueProfile =
    stubborn.length > 0 ? rescueModelFor(profile.id) : undefined
  if (stubborn.length > 0 && !options.signal?.aborted && rescueProfile) {
    options.onLog?.(
      `the ${stubborn.length} scene(s) that did not come out with ${profile.label} go to ${rescueProfile.label} so the video is not stuck`,
    )
    // Cuatro rondas y el elegido sigue dejando escenas afuera: es el síntoma
    // de «tiene errores seguido», aunque cada lote haya fallado por parseo y
    // no por un código del proveedor. Salvo que TODO haya sido la red: ahí el
    // modelo no tuvo oportunidad y no se lo culpa.
    if (chosenModelBlamed)
      options.onModelTrouble?.(
        profile.id,
        LLM_RESCUE_NEEDED,
        stubborn.map((fragment) => fragment.n),
      )
    const rescueExecutor = {
      profile: rescueProfile,
      cacheKey: cacheKeyFor(rescueProfile.id),
    }
    await runRoundInParallel([...stubborn], batchSize, rescueExecutor)
    const still = fragments.filter((fragment) => !obtained.has(fragment.n))
    if (still.length > 0 && !options.signal?.aborted) {
      options.onLog?.(
        `retrying ${still.length} scene(s) with ${rescueProfile.label}, now one by one`,
      )
      await runRoundInParallel([...still], 1, rescueExecutor)
    }
  }

  const missing = fragments
    .filter((fragment) => !obtained.has(fragment.n))
    .map((fragment) => fragment.n)
  if (missing.length > 0 && lastError) {
    options.onLog?.(
      `${missing.length} scene(s) ended without a prompt. Last model notice: ${lastError}`,
    )
  }

  // El tejido del sujeto pasa ACÁ, sobre el prompt ya validado: lo que se
  // persiste es exactamente lo que va a recibir el generador. Y es la ÚNICA
  // ventana donde se puede saber qué escenas nombran al protagonista: un
  // renglón más abajo la etiqueta ya no existe.
  const finalized = finalizeVerbatimPrompts(obtained, character, sceneWardrobe)
  for (const [id, prompt] of reviewedPrompts) finalized.prompts.set(id, prompt)
  options.signal?.throwIfAborted()
  const { prompts, scenesWithSubject, overBudget, sneakedIn, bare } = finalized
  if (finalized.rejectedWardrobes.size > 0) {
    options.onWarn?.(
      `${finalized.rejectedWardrobes.size} scene(s) put something other than clothing in the wardrobe marker and it was discarded: ${[
        ...finalized.rejectedWardrobes,
      ]
        .map(([id, text]) => `${id} («${text.slice(0, 40)}»)`)
        .join(', ')}`,
    )
  }
  if (finalized.wardrobes.size > 0) {
    options.onLog?.(
      `${finalized.wardrobes.size} scene(s) carry their own wardrobe: ${[...finalized.wardrobes.keys()].join(', ')}`,
    )
  }
  if (overBudget.length > 0) {
    // El scrub final va a recortar estas escenas. Ya no borra la identidad
    // primero (cede escena y cola de estilo antes), pero se dice igual: una
    // cola de estilo muy larga es algo que el usuario puede acortar.
    options.onWarn?.(
      `${overBudget.length} scene prompt(s) exceed the ${FINAL_PROMPT_BODY_BUDGET}-character body budget and will be trimmed before the image request (scene text first, character identity last): ${overBudget
        .sort((a, b) => a - b)
        .join(', ')}`,
    )
  }
  if (sneakedIn > 0) {
    // La red se disparó: el preámbulo lo prohibió y el modelo la usó igual.
    // No rompe nada (el tag se degradó), pero se dice — un modo que «casi
    // nunca» falla y nadie mide, en dos versiones ya falla siempre.
    options.onLog?.(
      `${sneakedIn} scene(s) named a protagonist although this style carries none: replaced with a person without fixed identity`,
    )
  }
  if (bare > 0) {
    options.onLog?.(
      `${bare} scene(s) mentioned the protagonist without describing it and got the description woven in anyway`,
    )
  }

  return {
    prompts,
    missing,
    scenesWithSubject,
    profile,
    inputTokens,
    outputTokens,
  }
}
