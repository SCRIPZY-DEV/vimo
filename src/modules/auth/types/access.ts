/**
 * Motivos que devuelve el endpoint de verificación. Los literales están en
 * español a propósito: son el contrato del server (vimo.click) y se comparan
 * tal cual llegan.
 * TODO: Esto tambien se deberia cambiar a ingles, pero hay que coordinarlo con el server.
 */
export type AccessReason =
  | 'ok'
  | 'sin-token'
  | 'token-invalido'
  | 'no-en-allowlist'
  | 'trial-expirado'
  | 'error-interno'
  | 'offline'

//TODO: Esto debe coincidir con el tipo de plan que devuelve supabase. Cambiar a ingles.
export type AccessPlan = 'trial' | 'activo'

/** Cuerpo crudo que responde POST /api/verificar-acceso. */
export interface VerifyAccessResponse {
  autorizado: boolean
  motivo: AccessReason
  plan?: AccessPlan
  diasRestantes?: number
  trialExpira?: string
  // Modo demo (ADR-0029): true para administradores y correos en demo_accesos.
  demo?: boolean
}

/** Veredicto normalizado que cachea TanStack y consumen guards y vistas. */
export interface AccessStatus {
  authorized: boolean
  reason: AccessReason
  plan: AccessPlan | null
  daysLeft: number | null
  trialExpiresAt: string | null
  email: string | null
  name: string | null
  avatar: string | null
  // Muestra la entrada «Demo» del sidebar. Sin red, vale el último valor
  // recordado para este correo (el pack ya está en disco y nada se gasta).
  demo: boolean
}
