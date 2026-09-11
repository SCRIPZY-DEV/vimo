import { PipelineFailure } from '../../runner/failure.ts'

// Código estable del rechazo de credenciales del proveedor LLM (401/403). Es
// un fallo de la CLAVE, no del modelo ni de la red: no se reintenta, no
// degrada a otro modelo y no cae al prompt de relleno — corta el job para
// que la persona vea «revisá tu clave» en vez de un video con prompts vacíos
// (incidente 2026-09-11: una clave de DeepInfra rechazada generó videos
// enteros con el fallback determinístico sin que nadie se enterara).
export const LLM_AUTH_CODE = 'llm_auth'

export function isAuthStatus(status: number): boolean {
  return status === 401 || status === 403
}

export function isLlmAuthFailure(error: unknown): boolean {
  return error instanceof PipelineFailure && error.code === LLM_AUTH_CODE
}
