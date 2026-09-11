import { DEMO_ACCESS_STORAGE_KEY } from '../constants'

interface DemoAccessMemory {
  email: string
  demo: boolean
}

// El veredicto de vimo.click es fail-open sin red (ADR-0006), pero el flag
// `demo` no se puede inventar: se recuerda el último recibido para ESTE
// correo y se reutiliza offline (ADR-0029). Otro correo no lo hereda.
export function rememberDemoAccess(email: string | null, demo: boolean): void {
  if (!email) return
  try {
    const memory: DemoAccessMemory = { email, demo }
    localStorage.setItem(DEMO_ACCESS_STORAGE_KEY, JSON.stringify(memory))
  } catch {
    // Storage lleno o deshabilitado: la próxima verificación con red lo repone.
  }
}

export function recallDemoAccess(email: string | null): boolean {
  if (!email) return false
  try {
    const raw = localStorage.getItem(DEMO_ACCESS_STORAGE_KEY)
    if (!raw) return false
    const memory = JSON.parse(raw) as Partial<DemoAccessMemory>
    return memory.email === email && memory.demo === true
  } catch {
    return false
  }
}
