import { avatarRenderPercent } from '@/modules/videos/utilities/avatarRenderPercent'
import type { AvatarSceneActivity } from '@/modules/videos/types/create'

// El porcentaje simulado de la aparición de un avatar que se está generando
// (entrega 2e, diseño §21.5): la misma curva del editor (avatarRenderPercent)
// contada desde el inicio de la aparición, que la propia actividad da con su
// tiempo (lo que informó el sidecar menos lo que ya corría cuando llegó). Así
// el porcentaje y el tiempo de la fila cuentan desde el mismo instante.
// null fuera de «generando»: una lista, una fallida o una que espera no tienen
// avance que mostrar (HeyGen no informa uno real), y 100 nunca se dice: al
// terminar, la fila dice «Lista».
export function avatarActivityPercent(
  activity: AvatarSceneActivity | undefined,
  now: number,
): number | null {
  if (activity?.status !== 'generating') return null

  const startedAt = activity.receivedAt - activity.elapsedSeconds * 1000

  return avatarRenderPercent(startedAt, now)
}
