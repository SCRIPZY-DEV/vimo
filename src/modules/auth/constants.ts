import {
  commonQueryKeys,
  VIMO_SERVER_BASE_URL,
} from '@/modules/common/constants'

export const AuthRoutesPaths = {
  login: '/login',
  callback: '/auth/callback',
  accessDenied: '/access-denied',
  logout: '/logout',
  license: '/license',
} as const

/** Claves de query del módulo — siempre acá, nunca arrays literales en hooks. */
export const authQueryKeys = {
  // La clave del veredicto vive en common para que otros módulos lean sus
  // interruptores con useAccessFeature (ADR-0006, enmienda 2026-09-30). Es la
  // misma de siempre: auth la sigue usando con este nombre.
  access: commonQueryKeys.access,
} as const

/** Edge function que valida allowlist + trial (excepción al fetcher, ver ADR-0006). */
export const VERIFY_ACCESS_URL = `${VIMO_SERVER_BASE_URL}/api/verificar-acceso`
/** Deep link de retorno del OAuth en desktop — debe estar en el allowlist de Supabase. */
export const AUTH_DEEP_LINK_URL = 'vimo://auth/callback'

/** getSession puede colgarse con varias pestañas (navigator.locks): tope duro. */
export const SESSION_TIMEOUT_MS = 10_000
export const VERIFY_TIMEOUT_MS = 10_000
export const SIGN_OUT_TIMEOUT_MS = 1500
export const CALLBACK_POLL_INTERVAL_MS = 100
export const CALLBACK_POLL_MAX_ATTEMPTS = 40
export const ACCESS_STALE_TIME_MS = 5 * 60_000

/**
 * Últimos flags del veredicto (demo, admin e interruptores), por correo:
 * sobreviven al modo sin red (ADR-0029, ADR-0048). La clave conserva su
 * nombre histórico para no perder lo que ya estaba recordado.
 */
export const ACCESS_FLAGS_STORAGE_KEY = 'vimo:demo:access:v1'
