import type { DisplayedLook } from '@/modules/avatars/types/look'
import {
  AVATAR_ENGINE_CHOICES,
  avatarEngineAvailable,
} from '@pipeline/types/avatar.ts'
import type { AvatarLookSummary } from '@pipeline/types/avatar.ts'

// Los motores con los que Vimo puede generar un video con este look (entrega
// 2e): los que el look admite y para los que hay tarifa
// (`avatarEngineAvailable`), en el orden en que Crear los ofrece y las fichas
// los muestran (V, IV, III), no en el que los lista el proveedor.
export function lookEngines(
  look: Pick<AvatarLookSummary, 'supportedEngines' | 'lookType'>,
) {
  return AVATAR_ENGINE_CHOICES.filter((engine) =>
    avatarEngineAvailable(engine, look),
  )
}

// Por qué un look no sirve para un video de Vimo (la clave del texto que lo
// explica), o null si sirve: listo y con al menos uno de los motores III, IV o
// V (`lookEngines`; antes solo servía Avatar III). Los looks del stock público
// no traen `status`: están listos. Lo consultan la ficha de un look (su atajo
// «Usar como principal») y el pie de su reproductor.
export function lookUnusableReasonKey(look: DisplayedLook): string | null {
  const status = look.status ?? 'ready'
  if (status === 'processing') return 'avatars.reproductor.noListoHint'
  if (status === 'failed') return 'avatars.detalle.lookFallido'
  if (lookEngines(look).length === 0)
    return 'avatars.reproductor.noCompatibleHint'

  return null
}
