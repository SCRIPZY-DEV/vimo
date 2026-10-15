import {
  DEMO_DISK_FULL_UNKNOWN_KEY,
  DEMO_ERROR_MESSAGE_KEYS,
  UNKNOWN_DEMO_ERROR_KEY,
} from '@/modules/videos/constants'
import {
  demoRequiredGigabytes,
  formatGigabytes,
} from '@/modules/videos/utilities/demoGigabytes'
import { DEMO_DISK_FULL_CODE } from '@/modules/videos/utilities/demoPrepareStore'
import type { DemoFailureMessage } from '@/modules/videos/types/demo'

// El aviso de un fallo de la puerta: la clave de su código, o la genérica sin
// un código conocido. Con el disco lleno van los GB que hay que liberar, en el
// idioma activo; sin esa cifra, el mismo porqué sin ella.
export function demoFailureMessage(
  errorCode: string | null,
  requiredFreeBytes: number | null,
  locale: string | undefined,
): DemoFailureMessage {
  if (!errorCode || !Object.hasOwn(DEMO_ERROR_MESSAGE_KEYS, errorCode))
    return { key: UNKNOWN_DEMO_ERROR_KEY }

  if (errorCode !== DEMO_DISK_FULL_CODE)
    return { key: DEMO_ERROR_MESSAGE_KEYS[errorCode] }

  if (requiredFreeBytes === null) return { key: DEMO_DISK_FULL_UNKNOWN_KEY }

  const gb = formatGigabytes(demoRequiredGigabytes(requiredFreeBytes), locale)
  return { key: DEMO_ERROR_MESSAGE_KEYS[errorCode], values: { gb } }
}
