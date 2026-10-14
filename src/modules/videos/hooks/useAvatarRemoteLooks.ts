import { useStockLooks } from '@/modules/avatars/hooks/useStockLooks'
import type { AvatarSummary } from '@pipeline/types/avatar.ts'

interface UseAvatarRemoteLooksOptions {
  avatar: AvatarSummary
  enabled: boolean
}

// Los looks de un avatar de la biblioteca según el listado de HeyGen (sus
// vistas previas remotas y sus videos), gratis y con la caché por grupo de
// `useStockLooks`: la tarjeta del avatar en Crear, la grilla del botón «Look»
// y el panel de la biblioteca leen la MISMA consulta. Acá vive, una sola vez,
// de qué listado sale: un avatar propio, de los privados de la cuenta; uno de
// stock, de los públicos (si dos usos lo calcularan distinto, la caché se
// partiría y cada avatar pediría dos listados).
export function useAvatarRemoteLooks({
  avatar,
  enabled,
}: UseAvatarRemoteLooksOptions) {
  return useStockLooks({
    ownership: avatar.ownership === 'own' ? 'private' : 'public',
    groupId: avatar.groupId,
    enabled,
  })
}
