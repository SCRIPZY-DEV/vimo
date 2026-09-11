import {
  balanceFor,
  sufficiencyOf,
  type CreditsBalances,
} from '@/modules/common/utilities/creditsBalance'
import type {
  CostCheckResult,
  CostEstimateLine,
} from '@/modules/common/types/credits'

// Cruza la estimación con los saldos leídos (ADR-0031). Bloquea SOLO con
// saldo leído e insuficiente en una línea obligatoria: una cuenta ilegible
// (sin clave, red caída) se avisa, no se bloquea — el proveedor dirá.
// `labelOf` pone la marca del proveedor (el catálogo vive en api-keys).
export function compareCostLines(
  estimates: CostEstimateLine[],
  balances: CreditsBalances,
  labelOf: (providerId: string) => string,
): CostCheckResult {
  const lines = estimates.map((estimate) => {
    const balance = balanceFor(estimate.domain, estimate.providerId, balances)
    return {
      providerId: estimate.providerId,
      providerLabel: labelOf(estimate.providerId),
      // La unidad la manda el saldo leído (ElevenLabs cobra caracteres);
      // sin saldo, la de la estimación.
      unit: balance.available === null ? estimate.unit : balance.unit,
      estimated: estimate.estimated,
      available: balance.available,
      sufficient: sufficiencyOf(estimate.estimated, balance.available),
      ...(estimate.informative ? { informative: true } : {}),
    }
  })

  return {
    lines,
    blocking: lines.some(
      (line) => line.sufficient === false && !line.informative,
    ),
    unreadable: lines.some((line) => line.available === null),
  }
}
