// Texto de un error desconocido: invoke() de Tauri rechaza con un string, el
// resto del código con Error.
export function errorDetail(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  return String(error)
}
