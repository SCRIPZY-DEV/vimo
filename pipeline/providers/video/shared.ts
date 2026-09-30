import { readFile } from 'node:fs/promises'

import { PipelineFailure } from '../../runner/failure.ts'
import {
  isInsufficientCreditsResponse,
  isInsufficientTaskError,
} from '../../utils/insufficient-credits.ts'

// Piezas compartidas por los dos proveedores de animación. La clasificación de
// fallos es la parte delicada: confundir «sin saldo» con «clave inválida»
// manda a la persona a revisar la clave en vez de a recargar (ADR-0031).

const CONTENT_POLICY_PATTERN =
  /content[_ ]?policy|safety|moderat|nsfw|inappropriate|sensitive|violates/

const AUTHENTICATION_PATTERN =
  /unauthori[sz]ed|unauthenticated|invalid[ _-]?(?:api[ _-]?key|token|credential)|(?:api[ _-]?key|token|credential)[ _-]?(?:invalid|expired|revoked)|authentication[ _-]?(?:failed|required)/i
const RATE_LIMIT_PATTERN =
  /rate[ _-]?limit|too many requests|throttl|concurrency[ _-]?(?:limit|exceeded)/i

// Rechazo de parámetros que llega COMO TAREA MUERTA: el proveedor acepta el
// pedido y lo mata después con un texto de validación. Repetir el mismo
// pedido repite el rechazo. Casos reales del 2026-09-12 con PoYo: «Frame mode
// requires exactly 2 images», «The prompt is too long. Please shorten it».
const INVALID_REQUEST_PATTERN =
  /too long|shorten|requires exactly|must be|invalid (?:parameter|argument|input|request)|unsupported|not supported/i

// Fallo de una tarea que sí conviene re-encargar: el proveedor la dio por
// fallida, así que no quedó trabajo pagado en vuelo. Saldo, moderación y
// parámetros rechazados NO entran acá: re-encargar solo repite el rechazo.
export class RetryableTaskError extends Error {
  readonly reason: string
  readonly creditsConsumed?: number

  constructor(reason: string, creditsConsumed?: number) {
    super(reason)
    this.name = 'RetryableTaskError'
    this.reason = reason
    this.creditsConsumed = reportedCredits(creditsConsumed)
  }
}

// Fallo terminal de una tarea que el proveedor YA dio por muerta: no hay
// trabajo pagado en vuelo. El carril conserva el recibo histórico; saldo
// permite retomar tras recargar, los demás rechazos exigen una acción explícita.
export class DeadTaskFailure extends PipelineFailure {
  readonly creditsConsumed?: number

  constructor(code: string, message: string, creditsConsumed?: number) {
    super(code, message)
    this.name = 'DeadTaskFailure'
    this.creditsConsumed = reportedCredits(creditsConsumed)
  }
}

function reportedCredits(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined
}

export function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
}

export async function errorBodyText(response: Response): Promise<string> {
  return (await response.text().catch(() => '')).slice(0, 300)
}

// Clasificación de una petición rechazada. El cuerpo se lee ANTES de mirar el
// status porque el saldo agotado no siempre viene como 402.
export function requestFailure(
  provider: string,
  response: Response,
  bodyText: string,
): PipelineFailure {
  if (isInsufficientCreditsResponse(response.status, bodyText))
    return new PipelineFailure(
      'animation_insufficient_credits',
      `${provider} rejected the request for insufficient credits (status=${response.status}) ${bodyText}`,
    )
  if (response.status === 401 || response.status === 403)
    return new PipelineFailure(
      'animation_invalid_api_key',
      `${provider} rejected the API key (status=${response.status})`,
    )
  if (response.status === 429)
    return new PipelineFailure(
      'animation_rate_limited',
      response.headers.get('retry-after') ?? '3',
    )
  // 455 en Kie y 502/503 en poyo son degradación del proveedor, no un fallo de
  // este pedido: el cortacircuitos los usa para apagar el modelo.
  if (response.status === 455 || response.status >= 500)
    return new PipelineFailure(
      'animation_provider_down',
      `${provider} is unavailable (status=${response.status}) ${bodyText}`,
    )
  return new PipelineFailure(
    'animation_provider_error',
    `${provider} request failed (status=${response.status}) ${bodyText}`,
  )
}

// Clasificación de una tarea que el proveedor marcó como fallida.
export function taskFailure(
  provider: string,
  error: { code?: string; message?: string; creditsConsumed?: number },
): never {
  const code = error.code ?? 'unknown_error'
  const message = error.message ?? `${provider} task failed`

  if (CONTENT_POLICY_PATTERN.test(`${code} ${message}`.toLowerCase()))
    throw new DeadTaskFailure(
      'animation_content_policy',
      `${provider} rejected the prompt by content policy: ${message.slice(0, 200)}`,
      error.creditsConsumed,
    )
  // Un límite de cuenta puede llegar dentro de una tarea que ya terminó en
  // fail. Su recibo se conserva como terminal y no consume fallos de modelo.
  if (code === '429' || RATE_LIMIT_PATTERN.test(`${code} ${message}`))
    throw new DeadTaskFailure(
      'animation_rate_limited',
      `${provider} task hit an account limit: [${code}] ${message.slice(0, 200)}`,
      error.creditsConsumed,
    )
  if (code === '402' || isInsufficientTaskError(code, message))
    throw new DeadTaskFailure(
      'animation_insufficient_credits',
      `${provider} task rejected for insufficient credits: [${code}] ${message.slice(0, 200)}`,
      error.creditsConsumed,
    )
  if (
    code === '401' ||
    code === '403' ||
    AUTHENTICATION_PATTERN.test(`${code} ${message}`)
  )
    throw new DeadTaskFailure(
      'animation_invalid_api_key',
      `${provider} task rejected authentication: [${code}] ${message.slice(0, 200)}`,
      error.creditsConsumed,
    )
  if (INVALID_REQUEST_PATTERN.test(message))
    throw new DeadTaskFailure(
      'animation_invalid_request',
      `${provider} rejected the request parameters: [${code}] ${message.slice(0, 200)}`,
      error.creditsConsumed,
    )

  // Cualquier otro fallo de tarea es re-encargable: el proveedor ya la dio por
  // perdida, así que no hay trabajo pagado esperando.
  throw new RetryableTaskError(
    `[${code}] ${message.slice(0, 200)}`,
    error.creditsConsumed,
  )
}

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

// Los dos proveedores suben en base64 y aceptan data URL. Las imágenes de
// escena son .jpg, pero se resuelve el tipo por extensión igual.
export async function readImageAsDataUrl(localPath: string): Promise<string> {
  const extension = localPath.split('.').pop()?.toLowerCase() ?? 'jpg'
  const mime = MIME_BY_EXTENSION[extension] ?? 'image/jpeg'
  const bytes = await readFile(localPath).catch(() => null)
  if (!bytes)
    throw new PipelineFailure(
      'animation_image_missing',
      `scene image not readable: ${localPath}`,
    )

  return `data:${mime};base64,${bytes.toString('base64')}`
}

// Nombre del archivo subido. Lleva algo aleatorio porque los dos hosts
// sobrescriben al repetir nombre, y dos proyectos distintos pueden tener una
// escena con el mismo número.
export function uploadFileName(prefix: string): string {
  return `${prefix}.${Math.random().toString(36).slice(2, 10)}.jpg`
}
