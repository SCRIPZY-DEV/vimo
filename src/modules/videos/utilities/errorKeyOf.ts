import {
  LIBRARY_ERROR_MESSAGE_KEYS,
  UNKNOWN_CREATE_ERROR_KEY,
} from '@/modules/videos/constants'

// Clave i18n del mensaje de un código del sidecar que quedó guardado en la
// escena (el `errorCode` de un avatar) o que llegó en un evento, o el texto
// genérico si no se conoce. Los `avatar_*` están en CREATE_ERROR_MESSAGE_KEYS
// (spec §14), que LIBRARY_ERROR_MESSAGE_KEYS hereda.
export function errorKeyOf(code: string | undefined): string {
  if (!code) return UNKNOWN_CREATE_ERROR_KEY

  return LIBRARY_ERROR_MESSAGE_KEYS[code] ?? UNKNOWN_CREATE_ERROR_KEY
}
