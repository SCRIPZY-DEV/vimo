import { PipelineFailure } from '../../runner/failure.ts'
import type {
  Ai33Catalog,
  Ai33CreateTaskResponse,
  Ai33CreditsResponse,
  Ai33TaskResponse,
  Ai33TasksResponse,
  Ai33Voice,
  Ai33VoicesResponse,
  GenerateVoicePayload,
  ListVoicesFilters,
  ListVoicesResult,
  VoiceCreditsResult,
  VoiceSummary,
} from '../../types/voices.ts'
import { rateLimitDelayMs } from '../../utils/http-retry.ts'
import { isInsufficientCreditsResponse } from '../../utils/insufficient-credits.ts'
import { sleep } from '../../utils/sleep.ts'
import {
  LIST_TIMEOUT_MS,
  SYNTHESIS_TIMEOUT_MS,
  downloadAudioFromUrl,
  requestSignal,
  rethrowIfCancelled,
} from './dubvoice.ts'
import { CATALOG_PAGE_SIZE } from './elevenlabs-shared.ts'
import { languageNameParam } from './language-names.ts'
import type {
  FindSubmittedTaskInput,
  SynthesisProgress,
  TtsProvider,
} from './provider.ts'
import type { VoiceRequestCheckpoint } from './request-checkpoint.ts'

// Motor ai33 (OpenSpeaker, ADR-0053): un agregador como DubVoice, con API
// unificada v3. El motor real viaja como prefijo del voice_id
// ("elevenlabs_<id>", "minimax_<id>", …) y la síntesis es ASÍNCRONA: FormData
// a POST /v3/text-to-speech → task_id → polling de GET /v1/task/{id} →
// descarga de metadata.audio_url. De los ajustes de voz solo honra `speed`.
export const AI33_BASE_URL = 'https://api.ai33.pro'

// La API admite 1 000 000 de chars por tarea, pero partes de 25 000 (como
// los motores de DubVoice v1, ADR-0025) acotan lo que se pierde si una parte
// falla y permiten reusar las ya pagadas al reintentar.
export const AI33_CHUNK_CHARS = 25_000

const LANE_NAME = 'ai33'
// Id del proveedor en los fallos (ADR-0038).
const FAILURE_PROVIDER = 'ai33'
const RETRY_MAX_ATTEMPTS = 6
// La doc pide backoff con jitter ante 429 y 503 server_busy.
const RETRY_JITTER_MS = 1000
const POLL_TIMEOUT_MS = 20 * 60 * 1000
const POLL_REQUEST_TIMEOUT_MS = 30_000
const MIN_SPEED = 0.5
const MAX_SPEED = 1.5
const DEFAULT_CATALOG: Ai33Catalog = 'elevenlabs'
// Vbee completo en la Voice Library: las voces propias y las de la comunidad.
const VBEE_VOICE_OWNERSHIP = 'all'
// Huella del pedido en `file_name`: permite reconocer la tarea en
// GET /v1/tasks si el POST se corta sin devolver el task_id.
const FILE_NAME_PREFIX = 'vimo-'
const FILE_NAME_FINGERPRINT_CHARS = 24
// Búsqueda de un envío perdido en GET /v1/tasks: páginas recientes y margen
// de reloj entre la máquina y el servidor.
const TASKS_PAGE_LIMIT = 20
const TASKS_MAX_PAGES = 3
const TASK_CLOCK_SKEW_MS = 5 * 60 * 1000

function authHeaders(apiKey: string): Record<string, string> {
  return { 'xi-api-key': apiKey }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function retryDelayMs(
  response: Response,
  bodyText: string,
  attempt: number,
): number {
  return (
    rateLimitDelayMs(response, bodyText, attempt) +
    Math.random() * RETRY_JITTER_MS
  )
}

// 503 con code `server_busy`: presión de capacidad temporal, la tarea no se
// creó y la doc pide reintentar.
function isServerBusy(status: number, bodyText: string): boolean {
  return status === 503 && /server_busy/i.test(bodyText)
}

function isMaintenance(status: number, bodyText: string): boolean {
  if (status === 502 || status === 503 || status === 504) return true
  return /maintenance|bad gateway/i.test(bodyText)
}

interface Ai33FetchOptions {
  timeoutMs: number
  signal?: AbortSignal
  // Texto narrado del pedido: se recorta de los cuerpos de error antes de
  // que lleguen al mensaje (ver errorHint).
  userText?: string
}

// Desde cuántos caracteres del texto narrado se reconoce su eco en un cuerpo
// de error, y cuánto del cuerpo entra al mensaje.
const ECHO_PROBE_CHARS = 20
const ERROR_HINT_CHARS = 200

/**
 * Lo que un cuerpo de error de ai33 aporta al mensaje (y al log de
 * diagnóstico, ADR-0038): hasta 200 caracteres, cortados donde empiece un eco
 * del texto narrado. El guion del usuario nunca viaja al log, aunque el
 * proveedor lo repita en un error de validación.
 */
function errorHint(bodyText: string, userText?: string): string {
  const hint = bodyText.slice(0, ERROR_HINT_CHARS)
  const probe = userText?.trim().slice(0, ECHO_PROBE_CHARS)
  if (!probe || probe.length < ECHO_PROBE_CHARS) return hint

  const echoAt = bodyText.indexOf(probe)
  if (echoAt === -1 || echoAt >= ERROR_HINT_CHARS) return hint
  return `${bodyText.slice(0, echoAt)}[narration omitted]`
}

/**
 * fetch contra ai33 con reintentos ante 429 y 503 server_busy (ninguno crea
 * la tarea) y clasificación a codes `voice_*` estables. Devuelve la Response
 * solo si vino ok.
 */
async function ai33Fetch(
  url: string,
  init: RequestInit,
  options: Ai33FetchOptions,
): Promise<Response> {
  for (let attempt = 0; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
    const response = await fetch(url, {
      ...init,
      signal: requestSignal(options.timeoutMs, options.signal),
    }).catch((error: unknown) => {
      rethrowIfCancelled(options.signal, error)
      throw new PipelineFailure('voice_network', 'ai33 request failed', {
        provider: FAILURE_PROVIDER,
      })
    })

    if (response.ok) return response

    const bodyText = await response.text().catch(() => '')

    if (isInsufficientCreditsResponse(response.status, bodyText))
      throw new PipelineFailure(
        'voice_insufficient_credits',
        `ai33 rejected the request for insufficient credits (status=${response.status}): ${errorHint(bodyText, options.userText)}`,
        { provider: FAILURE_PROVIDER, httpStatus: response.status },
      )

    if (response.status === 401 || response.status === 403)
      throw new PipelineFailure(
        'voice_invalid_api_key',
        `ai33 rejected the API key (status=${response.status})`,
        { provider: FAILURE_PROVIDER, httpStatus: response.status },
      )

    const retryable =
      response.status === 429 || isServerBusy(response.status, bodyText)
    if (retryable && attempt < RETRY_MAX_ATTEMPTS) {
      await sleep(retryDelayMs(response, bodyText, attempt), options.signal)
      options.signal?.throwIfAborted()
      continue
    }

    if (response.status === 429)
      throw new PipelineFailure(
        'voice_rate_limited',
        `ai33 rate limit persisted after ${RETRY_MAX_ATTEMPTS} retries`,
        { provider: FAILURE_PROVIDER, httpStatus: response.status },
      )

    if (isMaintenance(response.status, bodyText))
      throw new PipelineFailure(
        'voice_maintenance',
        `ai33 is unavailable (status=${response.status}): ${errorHint(bodyText, options.userText)}`,
        { provider: FAILURE_PROVIDER, httpStatus: response.status },
      )

    throw new PipelineFailure(
      'voice_provider_error',
      `ai33 request failed (status=${response.status}): ${errorHint(bodyText, options.userText)}`,
      { provider: FAILURE_PROVIDER, httpStatus: response.status },
    )
  }

  // Inalcanzable: el loop retorna o lanza; TypeScript no lo sabe.
  throw new PipelineFailure('voice_provider_error', 'unreachable retry loop', {
    provider: FAILURE_PROVIDER,
  })
}

function numberOf(value: number | string | undefined): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

// Saldo de la cuenta (GET /v1/credits).
export async function getAi33Credits(
  apiKey: string,
  signal?: AbortSignal,
): Promise<VoiceCreditsResult> {
  const response = await ai33Fetch(
    `${AI33_BASE_URL}/v1/credits`,
    { headers: authHeaders(apiKey) },
    { timeoutMs: LIST_TIMEOUT_MS, signal },
  )

  const data = (await response.json()) as Ai33CreditsResponse
  const credits =
    numberOf(data.credits) ??
    numberOf(data.credit) ??
    numberOf(data.balance) ??
    numberOf(data.ec_remain_credits) ??
    numberOf(data.data?.credits) ??
    numberOf(data.data?.credit) ??
    numberOf(data.data?.balance)

  return { vendor: 'ai33', unit: 'credits', credits: credits ?? 0 }
}

// La doc promete ids ya prefijados; si alguno llega sin prefijo se lo
// agrega, porque la síntesis v3 lo exige.
function prefixedVoiceId(catalog: Ai33Catalog, voiceId: string): string {
  if (voiceId.startsWith(`${catalog}_`)) return voiceId
  return `${catalog}_${voiceId}`
}

function normalizeVoice(
  catalog: Ai33Catalog,
  voice: Ai33Voice,
): VoiceSummary | null {
  const rawId = voice.voice_id ?? voice.id
  if (!rawId) return null

  const voiceId = prefixedVoiceId(catalog, rawId)
  const summary: VoiceSummary = {
    provider: 'ai33',
    voiceId,
    name: voice.name ?? voice.voice_name ?? rawId,
  }
  const language = voice.locale ?? voice.language
  if (language) summary.language = language
  if (voice.gender) summary.gender = voice.gender
  if (voice.accent) summary.accent = voice.accent
  if (voice.category) summary.category = voice.category
  const previewUrl = voice.preview_url ?? voice.sample_audio
  if (previewUrl) summary.previewUrl = previewUrl
  if (catalog === 'clone') summary.isClone = true

  return summary
}

function hasMorePages(data: Ai33VoicesResponse, page: number): boolean {
  const pagination = data.pagination
  if (typeof pagination?.has_more === 'boolean') return pagination.has_more
  if (typeof pagination?.total_pages === 'number')
    return page < pagination.total_pages
  if (typeof pagination?.total === 'number')
    return page * CATALOG_PAGE_SIZE < pagination.total

  // Sin datos de paginación: página llena = "tal vez hay más".
  return (data.data ?? []).length === CATALOG_PAGE_SIZE
}

// Voice Library v3: pagina server-side un catálogo por vez.
export async function listAi33Voices(
  apiKey: string,
  filters: ListVoicesFilters,
  signal?: AbortSignal,
): Promise<ListVoicesResult> {
  const catalog = filters.catalog ?? DEFAULT_CATALOG
  const page = filters.page ?? 1
  const query = new URLSearchParams({
    provider: catalog,
    page: String(page),
    page_size: String(CATALOG_PAGE_SIZE),
  })
  if (filters.search) query.set('search', filters.search)
  // Filtra por nombre completo ("language=Vietnamese" en la doc).
  if (filters.language)
    query.set('language', languageNameParam(filters.language))
  if (filters.gender) query.set('gender', filters.gender)
  // Sin `voice_ownership` ai33 lista solo las voces propias de Vbee. Fish no
  // tiene equivalente: ai33 expone 50 voces por consulta (total: 50 con
  // cualquier page_size o `sort`); las demás se encuentran buscando.
  if (catalog === 'vbee') query.set('voice_ownership', VBEE_VOICE_OWNERSHIP)

  const response = await ai33Fetch(
    `${AI33_BASE_URL}/v3/voices?${query.toString()}`,
    { headers: authHeaders(apiKey) },
    { timeoutMs: LIST_TIMEOUT_MS, signal },
  )

  const data = (await response.json()) as Ai33VoicesResponse
  const voices: VoiceSummary[] = []
  for (const voice of data.data ?? []) {
    const normalized = normalizeVoice(catalog, voice)
    if (normalized) voices.push(normalized)
  }

  const result: ListVoicesResult = {
    voices,
    hasMore: hasMorePages(data, page),
  }
  if (typeof data.pagination?.total === 'number')
    result.total = data.pagination.total

  return result
}

// Intervalo de polling escalado por largo del texto, como en DubVoice: cada
// consulta gasta un token del cupo de polling.
function pollIntervalMs(textLength: number): number {
  if (textLength < 1000) return 3000
  if (textLength < 10_000) return 7000
  return 20_000
}

interface SynthesizeAi33TaskInput {
  payload: GenerateVoicePayload
  text: string
  apiKey: string
  checkpoint?: VoiceRequestCheckpoint
  signal?: AbortSignal
  onProgress(progress: SynthesisProgress): void
}

function submissionFileName(fingerprint: string): string {
  return `${FILE_NAME_PREFIX}${fingerprint.slice(0, FILE_NAME_FINGERPRINT_CHARS)}`
}

// Un 200 con cuerpo que no es JSON se trata como respuesta sin task_id.
function parseCreateResponse(bodyText: string): Ai33CreateTaskResponse {
  try {
    return JSON.parse(bodyText) as Ai33CreateTaskResponse
  } catch {
    return {}
  }
}

async function submitAi33Task({
  payload,
  text,
  apiKey,
  checkpoint,
}: SynthesizeAi33TaskInput): Promise<string> {
  const form = new FormData()
  form.set('text', text)
  form.set('voice_id', payload.voiceId)
  form.set(
    'speed',
    String(clamp(payload.settings?.speed ?? 1, MIN_SPEED, MAX_SPEED)),
  )
  form.set('with_transcript', 'false')
  if (checkpoint)
    form.set('file_name', submissionFileName(checkpoint.receipt.fingerprint))

  const response = await ai33Fetch(
    `${AI33_BASE_URL}/v3/text-to-speech`,
    { method: 'POST', headers: authHeaders(apiKey), body: form },
    // Una vez enviado, esperar el recibo incluso si se canceló la UI. El
    // próximo job podrá consultar ese id en vez de pagar otra generación.
    { timeoutMs: SYNTHESIS_TIMEOUT_MS, userText: text },
  )

  const bodyText = await response.text()
  const data = parseCreateResponse(bodyText)
  if (data.success !== false && data.task_id) return data.task_id

  if (isInsufficientCreditsResponse(response.status, bodyText))
    throw new PipelineFailure(
      'voice_insufficient_credits',
      `ai33 rejected the request for insufficient credits: ${errorHint(bodyText, text)}`,
      { provider: FAILURE_PROVIDER, httpStatus: response.status },
    )
  throw new PipelineFailure(
    'voice_provider_error',
    `ai33 returned no task_id: ${errorHint(bodyText, text)}`,
    { provider: FAILURE_PROVIDER, httpStatus: response.status },
  )
}

// La respuesta de la tarea para el log, SIN `text`: ai33 devuelve ahí los
// primeros 1000 caracteres de la narración, y el guion del usuario nunca
// viaja al log de diagnóstico (ADR-0038).
function taskSummary(data: Ai33TaskResponse): string {
  return JSON.stringify({
    id: data.id,
    status: data.status,
    error_message: data.error_message,
    credit_cost: data.credit_cost,
    progress: data.progress,
    metadata: data.metadata,
  })
}

async function synthesizeAi33Task(
  input: SynthesizeAi33TaskInput,
): Promise<Buffer> {
  const { text, apiKey, checkpoint, signal, onProgress } = input
  let taskId = checkpoint?.receipt.taskId
  if (!taskId) {
    signal?.throwIfAborted()
    taskId = await submitAi33Task(input)
    await checkpoint?.update({ taskId, state: 'pending' })
  }

  const intervalMs = pollIntervalMs(text.length)
  const startedAt = checkpoint?.receipt.startedAt ?? Date.now()
  const pollStartedAt = Date.now()
  const elapsedSeconds = () => Math.round((Date.now() - startedAt) / 1000)
  onProgress({
    percent: checkpoint?.receipt.percent ?? 0,
    status: 'processing',
    elapsedSeconds: elapsedSeconds(),
  })
  let waitMs = 0
  let rateLimitedPolls = 0

  while (Date.now() - pollStartedAt < POLL_TIMEOUT_MS) {
    signal?.throwIfAborted()
    await sleep(waitMs, signal)
    signal?.throwIfAborted()
    waitMs = intervalMs

    let response: Response
    try {
      response = await fetch(
        `${AI33_BASE_URL}/v1/task/${encodeURIComponent(taskId)}`,
        {
          headers: authHeaders(apiKey),
          signal: requestSignal(POLL_REQUEST_TIMEOUT_MS, signal),
        },
      )
    } catch (error) {
      rethrowIfCancelled(signal, error)
      // Error de red transitorio: se reintenta en el próximo poll.
      continue
    }

    if (response.status === 401 || response.status === 403)
      throw new PipelineFailure(
        'voice_invalid_api_key',
        `ai33 rejected the API key (status=${response.status})`,
        { provider: FAILURE_PROVIDER, httpStatus: response.status, taskId },
      )
    if (response.status === 429) {
      const bodyText = await response.text().catch(() => '')
      waitMs = retryDelayMs(response, bodyText, rateLimitedPolls++)
      continue
    }
    // Cualquier otro error del poll es transitorio: se sigue esperando.
    if (!response.ok) continue
    rateLimitedPolls = 0

    const data = (await response.json()) as Ai33TaskResponse
    const status = data.status?.toLowerCase()

    if (
      typeof data.progress === 'number' &&
      data.progress >= 0 &&
      data.progress <= 100
    ) {
      await checkpoint?.update({ percent: data.progress })
      onProgress({
        percent: data.progress,
        status: status ?? 'processing',
        elapsedSeconds: elapsedSeconds(),
      })
    }

    if (status === 'done') {
      const audioUrl = data.metadata?.audio_url
      // Tarea cobrada sin URL: queda pendiente (task_id en el recibo) para
      // que un reintento la consulte en vez de pagar otra.
      if (!audioUrl)
        throw new PipelineFailure(
          'voice_provider_error',
          `ai33 task finished without audio_url: ${taskSummary(data)}`,
          { provider: FAILURE_PROVIDER, httpStatus: response.status, taskId },
        )
      await checkpoint?.update({ resultUrl: audioUrl, percent: 100 })
      return downloadAudioFromUrl(audioUrl, signal, FAILURE_PROVIDER)
    }
    if (status === 'error' || status === 'failed') {
      await checkpoint?.update({ state: 'failed' })
      // error_message primero: suele ser la única pista que queda en el log
      // de diagnóstico (ADR-0038), y el detalle del evento se corta a 300.
      throw new PipelineFailure(
        'voice_generation_failed',
        `${LANE_NAME} task failed: ${data.error_message ?? 'no error_message'} ${taskSummary(data)}`,
        { provider: FAILURE_PROVIDER, httpStatus: response.status, taskId },
      )
    }
  }

  throw new PipelineFailure(
    'voice_timeout',
    `${LANE_NAME} task did not complete within 20 minutes`,
    { provider: FAILURE_PROVIDER, taskId },
  )
}

function tasksOf(data: Ai33TasksResponse | Ai33TaskResponse[]) {
  if (Array.isArray(data)) return data
  return data.data ?? data.tasks ?? data.items ?? []
}

function createdAtMs(task: Ai33TaskResponse): number | undefined {
  if (!task.created_at) return undefined
  const parsed = Date.parse(task.created_at)
  return Number.isFinite(parsed) ? parsed : undefined
}

// Sin la marca del envío: misma longitud, mismo comienzo (el listado recorta
// el texto a 1000 chars) y creada después de empezar el envío.
function matchesSubmission(
  task: Ai33TaskResponse,
  text: string,
  notBefore: number,
): boolean {
  const createdAt = createdAtMs(task)
  if (createdAt === undefined || createdAt < notBefore) return false
  if (task.text_length !== text.length) return false
  return typeof task.text === 'string' && text.startsWith(task.text)
}

/**
 * Busca la tarea de un envío cuya respuesta se perdió (red caída, timeout,
 * 5xx del gateway). Primero por `file_name` (la marca del pedido); si el
 * listado no la expone, por texto y hora, y solo con una coincidencia única.
 * null = confirmado que no existe; lanza si el listado falla o es ambiguo.
 */
export async function findAi33SubmittedTask({
  apiKey,
  receipt,
  text,
  signal,
}: FindSubmittedTaskInput): Promise<string | null> {
  const fileName = submissionFileName(receipt.fingerprint)
  const notBefore = receipt.startedAt - TASK_CLOCK_SKEW_MS
  const candidates = new Set<string>()

  for (let page = 1; page <= TASKS_MAX_PAGES; page++) {
    const query = new URLSearchParams({
      page: String(page),
      limit: String(TASKS_PAGE_LIMIT),
      type: 'tts',
    })
    const response = await ai33Fetch(
      `${AI33_BASE_URL}/v1/tasks?${query.toString()}`,
      { headers: authHeaders(apiKey) },
      { timeoutMs: LIST_TIMEOUT_MS, signal },
    )
    const tasks = tasksOf(
      (await response.json()) as Ai33TasksResponse | Ai33TaskResponse[],
    )

    for (const task of tasks) {
      if (!task.id) continue
      if ((task.file_name ?? task.metadata?.file_name) === fileName)
        return task.id
      if (matchesSubmission(task, text, notBefore)) candidates.add(task.id)
    }

    // Listado del más nuevo al más viejo: una página que ya llega a tareas
    // anteriores al envío, o incompleta, cierra la búsqueda.
    const oldest = createdAtMs(tasks[tasks.length - 1] ?? {})
    if (
      tasks.length < TASKS_PAGE_LIMIT ||
      (oldest !== undefined && oldest < notBefore)
    )
      break
  }

  if (candidates.size > 1)
    throw new PipelineFailure(
      'voice_request_unresolved',
      `ai33 lists ${candidates.size} tasks that could be the lost submission`,
      { provider: FAILURE_PROVIDER },
    )
  return candidates.values().next().value ?? null
}

export const ai33Provider: TtsProvider = {
  id: 'ai33',
  vendor: 'ai33',
  laneName: LANE_NAME,
  chunkCharLimit() {
    return AI33_CHUNK_CHARS
  },
  reportsProgress: true,
  supportsTaskResume: true,
  apiKeyOf(apiKeys) {
    return apiKeys.ai33
  },
  listVoices({ apiKey, filters, signal }) {
    return listAi33Voices(apiKey, filters, signal)
  },
  // Una página de un solo item: ejercita auth y salud sin facturar.
  probeRequest(apiKey) {
    return {
      url: `${AI33_BASE_URL}/v3/voices?provider=edge&page_size=1`,
      init: { headers: authHeaders(apiKey) },
    }
  },
  async synthesize({ payload, text, apiKey, signal, onProgress, checkpoint }) {
    const audio = await synthesizeAi33Task({
      payload,
      text,
      apiKey,
      checkpoint,
      signal,
      onProgress: (progress) => onProgress?.(progress),
    })
    return { audio }
  },
  findSubmittedTask: findAi33SubmittedTask,
}
