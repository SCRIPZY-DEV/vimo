export const AuthRoutesPaths = {
  login: '/login',
  callback: '/auth/callback',
  accessDenied: '/access-denied',
  logout: '/logout',
} as const

/** Claves de query del módulo — siempre acá, nunca arrays literales en hooks. */
export const authQueryKeys = {
  access: ['auth', 'access'],
} as const

/** Edge function que valida allowlist + trial (excepción al fetcher, ver ADR-0006). */
export const VERIFY_ACCESS_URL = 'https://vimo.click/api/verificar-acceso'
/** Deep link de retorno del OAuth en desktop — debe estar en el allowlist de Supabase. */
export const AUTH_DEEP_LINK_URL = 'vimo://auth/callback'

/** getSession puede colgarse con varias pestañas (navigator.locks): tope duro. */
export const SESSION_TIMEOUT_MS = 10_000
export const VERIFY_TIMEOUT_MS = 10_000
export const SIGN_OUT_TIMEOUT_MS = 1500
export const CALLBACK_POLL_INTERVAL_MS = 100
export const CALLBACK_POLL_MAX_ATTEMPTS = 40
export const ACCESS_STALE_TIME_MS = 5 * 60_000
