import { ACCESS_FLAGS_STORAGE_KEY } from '@/modules/auth/constants'
import {
  parseRememberedAccess,
  serializeRememberedAccess,
} from '@/modules/auth/utilities/accessFlags'
import type { AccessFlags } from '@/modules/auth/types/access'

// El veredicto de vimo.click es fail-open sin red (ADR-0006), pero sus flags
// no se pueden inventar: se recuerda lo último recibido para ESTE correo y se
// reutiliza offline (`demo` desde ADR-0029; `admin` y los interruptores desde
// ADR-0048). Otro correo no lo hereda.
export function rememberAccessFlags(
  email: string | null,
  flags: AccessFlags,
): void {
  if (!email) return
  try {
    localStorage.setItem(
      ACCESS_FLAGS_STORAGE_KEY,
      serializeRememberedAccess(email, flags),
    )
  } catch {
    // Storage lleno o deshabilitado: la próxima verificación con red lo repone.
  }
}

export function recallAccessFlags(email: string | null): AccessFlags {
  try {
    return parseRememberedAccess(
      localStorage.getItem(ACCESS_FLAGS_STORAGE_KEY),
      email,
    )
  } catch {
    return parseRememberedAccess(null, email)
  }
}
