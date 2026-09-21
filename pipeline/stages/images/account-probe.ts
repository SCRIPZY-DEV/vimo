import { getFalCredits } from '../../providers/image/fal.ts'
import { getEvolinkCredits } from '../../providers/music/evolink.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { ImageProviderId } from '../../types/image-provider.ts'

// LA SONDA DE CUENTA — qué le pasa a la cuenta cuando el proveedor de imagen
// rechaza un pedido con un status ambiguo (ADR-0031).
//
// Un rechazo por saldo agotado se reconocía solo por su TEXTO (402 o un
// cuerpo que matchee `INSUFFICIENT_CREDITS_BODY_PATTERN`). Un proveedor que lo
// dice de otra forma — un 403 sin la frase esperada — se leía como «clave
// inválida» o «error del proveedor», el carril lo tragaba escena por escena,
// corrían las 4 pasadas de recuperación y el job moría con `images_incomplete`:
// el usuario veía celdas rojas y ningún aviso de recargar.
//
// La sonda no depende del texto: ante el primer rechazo ambiguo le PREGUNTA
// el saldo al proveedor, una sola vez por corrida, y con eso se decide si fue
// saldo, clave, o algo de esa escena.

export type AccountVerdict =
  // La cuenta no tiene saldo: el job se pausa y se reanuda tras recargar.
  | 'insufficient-credits'
  // El proveedor rechazó la clave también al consultar el saldo.
  | 'invalid-key'
  // La clave funciona y hay saldo: el rechazo es de ese pedido, no de la cuenta.
  | 'key-valid'
  // No se pudo leer el saldo: decide el status del rechazo original.
  | 'unknown'

export interface AccountProbe {
  verdict(provider: ImageProviderId, apiKey: string): Promise<AccountVerdict>
}

// Una lectura por proveedor y por corrida: 50 escenas rechazadas a la vez
// comparten la MISMA promesa en vez de pegarle 50 veces al endpoint de saldo.
export function createAccountProbe(signal: AbortSignal): AccountProbe {
  const verdicts = new Map<ImageProviderId, Promise<AccountVerdict>>()

  return {
    verdict(provider, apiKey) {
      const known = verdicts.get(provider)
      if (known) return known

      const reading =
        provider === 'evolink'
          ? readEvolinkAccount(apiKey, signal)
          : readFalAccount(apiKey, signal)
      verdicts.set(provider, reading)
      return reading
    },
  }
}

async function readEvolinkAccount(
  apiKey: string,
  signal: AbortSignal,
): Promise<AccountVerdict> {
  try {
    const credits = await getEvolinkCredits(apiKey, signal)
    // Un cero por OMISIÓN del campo no es una cuenta vacía (ver
    // `balanceReported`): sin saldo informado, la clave al menos funciona.
    const isEmpty =
      credits.balanceReported && !credits.unlimited && credits.remaining <= 0
    return isEmpty ? 'insufficient-credits' : 'key-valid'
  } catch (error) {
    if (signal.aborted) throw error
    // El endpoint de saldo acepta cualquier clave válida: si también la
    // rechaza, la clave es el problema y no hace falta adivinarlo del texto.
    if (
      error instanceof PipelineFailure &&
      error.code === 'music_invalid_api_key'
    )
      return 'invalid-key'
    return 'unknown'
  }
}

async function readFalAccount(
  apiKey: string,
  signal: AbortSignal,
): Promise<AccountVerdict> {
  try {
    const credits = await getFalCredits(apiKey, signal)
    if (credits.remaining === null) return 'unknown'
    return credits.remaining <= 0 ? 'insufficient-credits' : 'key-valid'
  } catch (error) {
    if (signal.aborted) throw error
    // Nunca `invalid-key`: el billing de Fal exige una key ADMIN, y una key
    // normal que genera imágenes sin problema recibe 401/403 ahí.
    return 'unknown'
  }
}

// Fallos de la CUENTA que cortan la fase entera: reintentar escena por escena
// solo repite el rechazo y termina en un `images_incomplete` que no le dice a
// nadie qué arreglar.
export const IMAGE_ACCOUNT_FAILURE_CODES: ReadonlySet<string> = new Set([
  'image_invalid_api_key',
  'image_account_rejected',
])

export function isImageAccountFailure(error: unknown): boolean {
  return (
    error instanceof PipelineFailure &&
    IMAGE_ACCOUNT_FAILURE_CODES.has(error.code)
  )
}

export interface AccountRejection {
  probe: AccountProbe
  provider: ImageProviderId
  apiKey: string
  // Status HTTP del rechazo original.
  status: number
  // Motivo técnico del proveedor, para el mensaje del fallo (diagnóstico).
  detail: string
}

function insufficientCreditsFailure(
  rejection: AccountRejection,
): PipelineFailure {
  const { provider, status, detail } = rejection
  return new PipelineFailure(
    'image_insufficient_credits',
    `${provider} rejected the request (status=${status}) and the account balance reads empty: ${detail}`,
  )
}

// Un 401/403 es SIEMPRE de la cuenta, nunca de una escena: devuelve el fallo
// que corta la fase. Cuál, lo decide la sonda:
//
//   el saldo lee vacío            → image_insufficient_credits (pausa retomable)
//   la sonda también rechazó      → image_invalid_api_key
//   401 sin poder leer el saldo   → image_invalid_api_key
//   cualquier otro caso           → image_account_rejected (la cuenta no puede
//                                   generar: plan, bloqueo, permisos)
export async function resolveAuthRejection(
  rejection: AccountRejection,
): Promise<PipelineFailure> {
  const { provider, status, detail } = rejection
  const verdict = await rejection.probe.verdict(provider, rejection.apiKey)

  if (verdict === 'insufficient-credits')
    return insufficientCreditsFailure(rejection)
  if (verdict === 'invalid-key' || (verdict === 'unknown' && status === 401))
    return new PipelineFailure(
      'image_invalid_api_key',
      `${provider} rejected the API key (status=${status}): ${detail}`,
    )

  return new PipelineFailure(
    'image_account_rejected',
    `${provider} refused to generate for this account (status=${status}, account check: ${verdict}): ${detail}`,
  )
}

// Cualquier otro 4xx puede ser de ese pedido (un parámetro, un prompt) o de la
// cuenta. Solo corta la fase si el saldo lee vacío; si no, devuelve `null` y el
// carril sigue como siempre (reintenta o marca la escena).
export async function resolveClientErrorRejection(
  rejection: AccountRejection,
): Promise<PipelineFailure | null> {
  const verdict = await rejection.probe.verdict(
    rejection.provider,
    rejection.apiKey,
  )
  return verdict === 'insufficient-credits'
    ? insufficientCreditsFailure(rejection)
    : null
}
