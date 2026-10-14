import type { PipelineContext } from '../../runner/context.ts'
import type { AvatarBalanceResult } from '../../types/avatar.ts'
import { requireHeyGenClient } from './heygen-client.ts'

// Saldo de la billetera de HeyGen para la vista Avatares (`GET /v3/users/me`).
// Nunca falla: sin clave, o ante cualquier fallo de HeyGen, responde
// `available: false` con el motivo y la vista muestra «saldo no disponible».
export async function avatarBalance(
  context: PipelineContext,
): Promise<AvatarBalanceResult> {
  if (!context.job.apiKeys.heygen)
    return { available: false, errorCode: 'missing_api_key' }

  return requireHeyGenClient(context).getBalance()
}
