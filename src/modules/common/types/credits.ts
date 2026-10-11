// Unidad en la que cobra un proveedor: créditos propios (Evolink, DubVoice),
// dólares (Fal) o caracteres (ElevenLabs).
export type CreditsUnit = 'credits' | 'usd' | 'characters'

// Qué familia de proveedor gasta (prefijo de los códigos del sidecar).
// `animation` es la de los clips de video (Kie.ai y PoYo, ADR-0047) y `avatar`
// la del avatar presentador (la billetera de HeyGen, ADR-0057).
export type CreditsDomain =
  'voice' | 'image' | 'llm' | 'transcription' | 'music' | 'animation' | 'avatar'

// Lo que un trabajo va a gastar en un proveedor, antes de arrancar. Con
// `informative` el gasto es opcional (música de fondo) y nunca bloquea. Con
// `upperBound` la cifra es un techo: lo que se pague de verdad puede ser menos.
// El avatar al reanudar cuenta todas las escenas sin clip, y la fase exige
// ese total antes de pagar la primera; paga menos solo cuando alguna ya tiene
// un pedido pagado, que se cosecha sin cobro nuevo (la vista no trae los
// recibos para descontarlo).
export interface CostEstimateLine {
  domain: CreditsDomain
  providerId: string
  unit: CreditsUnit
  estimated: number
  informative?: boolean
  upperBound?: boolean
}

// Una fila del aviso de saldo: cuánto se estima gastar en un proveedor y
// cuánto hay. Agnóstica del proveedor a propósito (ADR-0031/0032): cuando
// cambie la fuente del saldo, cambia quien arma la fila, no la UI.
//   - `estimated: null` → no se pudo estimar; solo se informa el saldo.
//   - `available: null` → saldo no legible (sin clave, red caída); no bloquea.
//   - `sufficient: null` → no se puede afirmar nada; solo `false` bloquea.
//   - `informative` → gasto opcional (música de fondo): nunca bloquea.
//   - `upperBound` → `estimated` es un techo: la fila dice «hasta».
export interface CreditsShortfallLine {
  providerId: string
  providerLabel: string
  unit: CreditsUnit
  estimated: number | null
  available: number | null
  sufficient: boolean | null
  informative?: boolean
  upperBound?: boolean
}

// Estimación comparada con los saldos leídos. `blocking` solo con saldo
// leído e insuficiente en una línea obligatoria; `unreadable` si alguna
// cuenta no se pudo leer (se avisa, no se bloquea).
export interface CostCheckResult {
  lines: CreditsShortfallLine[]
  blocking: boolean
  unreadable: boolean
}
