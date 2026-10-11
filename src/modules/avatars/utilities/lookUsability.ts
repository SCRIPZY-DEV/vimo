import { VIMO_AVATAR_ENGINE } from '@/modules/avatars/constants'
import type { DisplayedLook } from '@/modules/avatars/types/look'

// Por qué un look no sirve para un video de Vimo (la clave del texto que lo
// explica), o null si sirve: listo y con el motor que Vimo usa. Los looks del
// stock público no traen `status`: están listos. Lo consultan la ficha de un
// look (su atajo «Usar como principal») y el pie de su reproductor.
export function lookUnusableReasonKey(look: DisplayedLook): string | null {
  const status = look.status ?? 'ready'
  if (status === 'processing') return 'avatars.reproductor.noListoHint'
  if (status === 'failed') return 'avatars.detalle.lookFallido'
  if (!look.supportedEngines.includes(VIMO_AVATAR_ENGINE))
    return 'avatars.reproductor.noCompatibleHint'

  return null
}
