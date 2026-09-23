// Cortacircuitos por proveedor de animación dentro de UN job (ADR-0040).
// Ninguno de los dos proveedores publica si un modelo está caído, así que se
// detecta contando fallos terminales seguidos atribuibles al proveedor
// (455 de Kie, 5xx, tareas que mueren del lado del servidor). Los rechazos
// atribuibles a la persona —saldo, clave, moderación— nunca cuentan.
//
// Abierto, los encargos que todavía no se hicieron fallan al toque con
// `animation_provider_down` en vez de quemar reintentos contra un proveedor
// caído; el subcomando avisa a la UI UNA vez para que esconda ese proveedor
// un rato y ofrezca el otro.

export const CIRCUIT_BREAKER_THRESHOLD = 2

export interface ProviderCircuitBreaker {
  isOpen(): boolean
  recordSuccess(): void
  // Devuelve true la ÚNICA vez que el cortacircuitos pasa a abierto.
  recordProviderDown(): boolean
}

export function createCircuitBreaker(
  threshold = CIRCUIT_BREAKER_THRESHOLD,
): ProviderCircuitBreaker {
  let consecutiveFailures = 0
  let open = false

  return {
    isOpen: () => open,
    recordSuccess() {
      consecutiveFailures = 0
    },
    recordProviderDown() {
      if (open) return false
      consecutiveFailures++
      if (consecutiveFailures < threshold) return false
      open = true
      return true
    },
  }
}
