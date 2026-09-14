import { PipelineFailure } from '../../runner/failure.ts'
import type { LlmModelProfile } from '../../types/llm-models.ts'
import {
  isInsufficientCreditsFailure,
  isInsufficientCreditsResponse,
} from '../../utils/insufficient-credits.ts'
import {
  isAuthStatus,
  isLlmAuthFailure,
  LLM_AUTH_CODE,
} from './auth-failure.ts'

// CLIENTE del carril verbatim (gema propia). Port de
// `motor-web/verbatim/cliente.ts` del origen, reescrito sobre fetch (el
// portable no usa el SDK de OpenAI; ver `deepinfra.ts` al lado).
//
// Diferencias deliberadas con `deepinfra.ts` (el cliente del carril de la
// casa, que NO se toca):
//
//  - Recibe la CONVERSACIÓN entera (system + user + assistant + user), porque
//    este carril replica turno por turno el chat que el usuario validó.
//  - **Sin `response_format`**: el formato de salida lo fija el system prompt
//    del usuario (un bloque de código con los prompts separados por línea en
//    blanco). Pedir `json_object` contradice su prompt y lo pisa.
//  - **Sin `temperature`/`top_p`**: la familia GPT-5 los rechaza con 400 y el
//    resto no los necesita. Los perfiles de la casa no la declaran.
//  - El tope de salida y el `reasoning_effort` los decide el PERFIL del
//    modelo (`model-catalog.ts`), no este archivo.
//  - **SIEMPRE en streaming**: una generación no-streaming deja la conexión
//    abierta y MUDA mientras el modelo escribe, y un gateway intermedio la
//    corta a los ~120 s (medido en el origen: los lotes de 20 pasaron por
//    poco, 92.9 s; los de 60+ murieron TODOS). Subir el timeout no arregla
//    nada — el que corta es el intermediario, y solo deja de cortar si ve
//    bytes.

// 10 minutos, techo POR LLAMADA (no por corrida): con streaming el pedido
// normal termina en segundos; esto solo corta una conexión colgada de verdad.
const VERBATIM_TIMEOUT_MS = 600_000

/** Código estable del fallo determinista: la respuesta se cortó por tokens. */
export const LLM_OUTPUT_TRUNCATED = 'llm_output_truncated'

export interface VerbatimMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface VerbatimResponse {
  content: string
  inputTokens: number
  outputTokens: number
}

export interface VerbatimClientOptions {
  apiKey: string
  baseUrl: string
}

export interface VerbatimCallOptions {
  profile: LlmModelProfile
  /** Los mensajes llegan ya armados: el `system` es el del usuario, literal. */
  messages: VerbatimMessage[]
  /** Presupuesto de CONTENIDO; el margen del perfil se suma acá adentro. */
  contentTokensBudget: number
  /**
   * `prompt_cache_key`: todos los lotes de una corrida comparten el MISMO
   * prefijo (gema + guion + personaje). MEDIDO en el origen (2026-08-20): el
   * caché de DeepInfra es AUTOMÁTICO y por modelo — hoy no ahorra un centavo,
   * pero se manda porque no cuesta nada y el día que un modelo ofrecido
   * cachee, el ahorro entra solo (mismo prefijo en cada lote y reintento).
   */
  cacheKey?: string
  signal?: AbortSignal
  /**
   * Se llama con TODO lo escrito hasta ahora, cada vez que llega texto nuevo.
   * Existe para informar progreso REAL mientras el modelo escribe: quien lo
   * consume cuenta cuántos prompts terminó. Sin esto la única señal es
   * «terminó todo» y la UI se queda en cero aunque el modelo haya escrito
   * 8 de 9.
   */
  onProgress?: (accumulated: string) => void
  // Catálogo no acepta un EOF silencioso como respuesta completa. Opt-in:
  // preserva el contrato previo de los otros consumidores de este cliente.
  requireComplete?: boolean
}

export interface VerbatimClient {
  call(options: VerbatimCallOptions): Promise<VerbatimResponse>
}

/**
 * Fallo que NO tiene sentido reintentar con el mismo pedido: repetirlo da el
 * mismo corte — hay que pedir menos (lotes más chicos, lo hace el motor).
 */
export function isOutputTruncated(error: unknown): boolean {
  return error instanceof PipelineFailure && error.code === LLM_OUTPUT_TRUNCATED
}

// Un trozo del stream chat-completions. El trozo de `usage` llega con
// `choices: []`.
interface StreamChunk {
  choices?: {
    delta?: { content?: string }
    finish_reason?: string | null
  }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

export function createVerbatimClient(
  options: VerbatimClientOptions,
): VerbatimClient {
  const { apiKey, baseUrl } = options

  return {
    async call(callOptions) {
      const { profile, signal } = callOptions
      const timeout = AbortSignal.timeout(VERBATIM_TIMEOUT_MS)
      const combinedSignal = signal
        ? AbortSignal.any([signal, timeout])
        : timeout

      const failWith = (error: unknown): never => {
        // Una cancelación pedida no se disfraza de error del proveedor.
        if (signal?.aborted) throw error
        if (timeout.aborted)
          throw new PipelineFailure(
            'llm_timeout',
            `verbatim request to ${profile.id} timed out`,
          )
        throw new PipelineFailure(
          'llm_network',
          `verbatim request to ${profile.id} failed`,
        )
      }

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: profile.id,
          messages: callOptions.messages,
          [profile.tokensField]:
            callOptions.contentTokensBudget + profile.outputTokensMargin,
          ...(profile.reasoningEffort !== undefined
            ? { reasoning_effort: profile.reasoningEffort }
            : {}),
          // Carril de servicio, solo si el perfil lo pide. VERIFICADO por
          // COBRO en el origen (no por «no dio error»: DeepInfra acepta con
          // 200 cualquier campo que no conoce y lo tira en silencio).
          ...(profile.serviceTier ? { service_tier: profile.serviceTier } : {}),
          stream: true,
          // El conteo de tokens no viaja en ningún delta: sin esto se pierde.
          stream_options: { include_usage: true },
          ...(callOptions.cacheKey
            ? { prompt_cache_key: callOptions.cacheKey }
            : {}),
        }),
        signal: combinedSignal,
      }).catch(failWith)

      if (response.status === 429)
        throw new PipelineFailure(
          'llm_rate_limited',
          `verbatim rate limit hit on ${profile.id}`,
        )
      if (!response.ok || !response.body) {
        const bodyText = (await response.text().catch(() => '')).slice(0, 300)
        // Saldo agotado antes que la clave (ADR-0031).
        if (isInsufficientCreditsResponse(response.status, bodyText))
          throw new PipelineFailure(
            'llm_insufficient_credits',
            `DeepInfra rejected ${profile.id} for insufficient balance (status=${response.status}) ${bodyText}`,
          )
        // Credenciales rechazadas: es la clave, no el modelo (ver auth-failure).
        if (isAuthStatus(response.status))
          throw new PipelineFailure(
            LLM_AUTH_CODE,
            `DeepInfra rejected the API key (status=${response.status})`,
          )
        throw new PipelineFailure(
          'llm_provider_error',
          `verbatim request to ${profile.id} failed (status=${response.status}) ${bodyText}`,
        )
      }

      // Lectura del stream SSE: eventos `data: {json}` separados por líneas,
      // cerrados con `data: [DONE]`.
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      const parts: string[] = []
      let buffered = ''
      let finishReason = ''
      let inputTokens = 0
      let outputTokens = 0

      const consumeLine = (line: string) => {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) return
        const payload = trimmed.slice('data:'.length).trim()
        if (!payload || payload === '[DONE]') return

        let chunk: StreamChunk
        try {
          chunk = JSON.parse(payload) as StreamChunk
        } catch {
          // Un evento a medio llegar o basura del proxy no tumba la corrida.
          return
        }
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens ?? inputTokens
          outputTokens = chunk.usage.completion_tokens ?? outputTokens
        }
        const choice = chunk.choices?.[0]
        if (!choice) return
        const delta = choice.delta?.content
        if (typeof delta === 'string' && delta) {
          parts.push(delta)
          // Solo cuando llega texto nuevo: los trozos de `usage` o de control
          // no cambian nada y no tienen por qué disparar un recuento.
          callOptions.onProgress?.(parts.join(''))
        }
        if (typeof choice.finish_reason === 'string' && choice.finish_reason)
          finishReason = choice.finish_reason
      }

      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buffered += decoder.decode(value, { stream: true })
          const lines = buffered.split('\n')
          buffered = lines.pop() ?? ''
          for (const line of lines) consumeLine(line)
        }
        buffered += decoder.decode()
        if (buffered) consumeLine(buffered)
      } catch (error) {
        failWith(error)
      }

      // Un bloque cortado a la mitad se ve igual que un bloque mal escrito;
      // `finish_reason` es la única señal fiable de que el problema fue el
      // techo de tokens. Repetir el mismo pedido no lo arregla.
      if (finishReason === 'length')
        throw new PipelineFailure(
          LLM_OUTPUT_TRUNCATED,
          `${profile.id} response hit the output token ceiling`,
        )

      if (callOptions.requireComplete && finishReason !== 'stop')
        throw new PipelineFailure(
          'llm_empty_response',
          `${profile.id} stream ended without a complete text response`,
        )

      const content = parts.join('').trim()
      if (!content)
        throw new PipelineFailure(
          'llm_empty_response',
          `${profile.id} returned an empty verbatim response`,
        )

      return {
        content,
        inputTokens,
        // ~4 caracteres por token es la regla gruesa: solo se usa si el
        // proveedor no mandó `usage`, para el costo aproximado.
        outputTokens: outputTokens || Math.round(content.length / 4),
      }
    },
  }
}

/**
 * Espera antes de cada reintento normal. Crece: 1.5 s, 3 s, 6 s… Reintentar
 * SIN esperar vuelve inútil el reintento justo cuando más falta hace (medido
 * en el origen: DeepInfra contesta 429 «Model busy, retry later» y pegarle
 * tres veces en el mismo instante falla las tres).
 */
const RETRY_BASE_DELAY_MS = 1500

/**
 * E34 del origen — Cuando el proveedor dice «estoy ocupado, volvé más tarde»,
 * se le hace caso DE VERDAD: esperas largas en escalera, aparte del
 * presupuesto de reintentos normal. Una ráfaga de saturación dura MINUTOS, no
 * segundos; la espera es barata (un 429 no cobra tokens) y del otro lado hay
 * un video del usuario a medio hacer. Mismo espíritu que la regla de oro de
 * los proveedores de imágenes (E26): la espera se espera — un «volvé más
 * tarde» no es un error, es una instrucción.
 */
const QUOTA_BACKOFF_MS = [
  5_000, 10_000, 20_000, 30_000, 45_000, 60_000,
] as const

function isQuotaError(error: unknown): boolean {
  if (error instanceof PipelineFailure && error.code === 'llm_rate_limited')
    return true
  const message = error instanceof Error ? error.message : String(error)
  return /\b429\b|model busy|rate.?limit|too many requests/i.test(message)
}

// Espera abortable que RESUELVE al cancelar (no lanza): quien espera vuelve al
// loop, ve la señal abortada y corta por su propio camino.
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(finish, ms)
    function finish() {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }
    function onAbort() {
      clearTimeout(timer)
      finish()
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Reintentos por unidad de trabajo (el motor lo usa por lote): 5xx aislado,
 * respuesta vacía, red. Lo que NO reintenta es el fallo determinista
 * (`llm_output_truncated`) — ahí repetir el mismo pedido da el mismo corte.
 * El 429 NO consume intentos: no es un fallo del pedido, es el proveedor
 * pidiendo tiempo — se le da el tiempo y se repite tal cual.
 */
export async function withVerbatimRetry<T>(
  task: () => Promise<T>,
  attempts = 2,
  signal?: AbortSignal,
  // Inyectable SOLO para poder probar la escalera sin esperarla de verdad.
  quotaBackoffMs: readonly number[] = QUOTA_BACKOFF_MS,
): Promise<T> {
  let lastError: unknown
  let quotaWaits = 0
  for (let attempt = 0; attempt < attempts;) {
    try {
      return await task()
    } catch (error) {
      if (isOutputTruncated(error)) throw error
      // La clave rechazada tampoco se reintenta: repetir da el mismo 401.
      // El saldo agotado, tampoco: repetir da el mismo 402.
      if (isLlmAuthFailure(error) || isInsufficientCreditsFailure(error))
        throw error
      lastError = error
      if (signal?.aborted) break
      if (isQuotaError(error) && quotaWaits < quotaBackoffMs.length) {
        await sleep(quotaBackoffMs[quotaWaits]!, signal)
        quotaWaits += 1
        continue
      }
      attempt += 1
      if (attempt < attempts)
        await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), signal)
    }
  }
  throw lastError
}
