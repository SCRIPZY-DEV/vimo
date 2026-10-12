import type {
  FlowRestartConsent,
  FlowRestartRequest,
} from '@/modules/common/types/flow'

// Una nueva confirmación reemplaza siempre el UUID anterior. Sin confirmación,
// sólo un reintento de la misma intención conserva su autorización previa.
export function resolveFlowRestartConsent(
  current: FlowRestartConsent | null | undefined,
  scope: string,
  request?: FlowRestartRequest,
): FlowRestartConsent | null {
  if (request) return { scope, request }
  if (current?.scope === scope) return current
  return null
}
