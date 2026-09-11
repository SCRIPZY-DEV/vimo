// Unidad en la que cobra un proveedor: créditos propios (Evolink, DubVoice),
// dólares (Fal) o caracteres (ElevenLabs).
export type CreditsUnit = 'credits' | 'usd' | 'characters'

// Qué familia de proveedor gasta (prefijo de los códigos del sidecar).
export type CreditsDomain =
  'voice' | 'image' | 'llm' | 'transcription' | 'music'

// Lo que un trabajo va a gastar en un proveedor, antes de arrancar. Con
// `informative` el gasto es opcional (música de fondo) y nunca bloquea.
export interface CostEstimateLine {
  domain: CreditsDomain
  providerId: string
  unit: CreditsUnit
  estimated: number
  informative?: boolean
}

// Una fila del aviso de saldo: cuánto se estima gastar en un proveedor y
// cuánto hay. Agnóstica del proveedor a propósito (ADR-0031/0032): cuando
// cambie la fuente del saldo, cambia quien arma la fila, no la UI.
//   - `estimated: null` → no se pudo estimar; solo se informa el saldo.
//   - `available: null` → saldo no legible (sin clave, red caída); no bloquea.
//   - `sufficient: null` → no se puede afirmar nada; solo `false` bloquea.
//   - `informative` → gasto opcional (música de fondo): nunca bloquea.
export interface CreditsShortfallLine {
  providerId: string
  providerLabel: string
  unit: CreditsUnit
  estimated: number | null
  available: number | null
  sufficient: boolean | null
  informative?: boolean
}

// Estimación comparada con los saldos leídos. `blocking` solo con saldo
// leído e insuficiente en una línea obligatoria; `unreadable` si alguna
// cuenta no se pudo leer (se avisa, no se bloquea).
export interface CostCheckResult {
  lines: CreditsShortfallLine[]
  blocking: boolean
  unreadable: boolean
}
