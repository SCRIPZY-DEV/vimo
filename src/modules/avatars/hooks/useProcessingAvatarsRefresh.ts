import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { avatarsApi } from '@/modules/avatars/api'
import {
  avatarsQueryKeys,
  PROCESSING_REFRESH_GIVE_UP_CODES,
  PROCESSING_REFRESH_INTERVAL_MS,
} from '@/modules/avatars/constants'
import type { AvatarSummary } from '@pipeline/types/avatar.ts'

// Mientras un avatar entrena, o alguno de sus looks se está generando, le
// pregunta a HeyGen cómo va (el sidecar guarda el estado nuevo) y la lista se
// vuelve a leer. Los errores no se muestran: es un sondeo, el usuario no
// pidió nada. Un error pasajero (red, 429, 5xx, la clave) se reintenta en la
// ronda siguiente, siempre; solo uno definitivo
// (PROCESSING_REFRESH_GIVE_UP_CODES: el avatar ya no está en la biblioteca o
// el pedido no es válido) deja de preguntar por ese avatar, de inmediato y
// hasta que se vuelve a abrir la vista. Un avatar cuyo grupo HeyGen ya no
// tiene vuelve del refresco como `failed` (`avatar_group_missing`): deja de
// estar pendiente y el sondeo lo suelta sin error. Cuando algo termina (el
// entrenamiento o un look), el saldo de HeyGen se relee: HeyGen puede
// descontar al completar.
export function useProcessingAvatarsRefresh(entries: AvatarSummary[]) {
  const queryClient = useQueryClient()
  const [abandonedIds, setAbandonedIds] = useState<string[]>([])
  const inFlight = useRef(false)
  // Cuándo arrancó la última ronda: si el conjunto de pendientes cambia (un
  // avatar terminó, se sumó otro), la ronda siguiente respeta el intervalo en
  // vez de adelantarse.
  const lastRoundAt = useRef(0)
  // Qué procesaba cada avatar en su última ronda (él mismo y sus looks): si
  // algo sale de ahí, terminó.
  const processingSeen = useRef(new Map<string, Set<string>>())

  const idsKey = entries
    .filter((entry) => isPending(entry) && !abandonedIds.includes(entry.id))
    .map((entry) => entry.id)
    .join(',')

  useEffect(() => {
    if (!idsKey) return

    const ids = idsKey.split(',')
    const refreshOne = async (id: string): Promise<RefreshOutcome> => {
      try {
        const entry = await avatarsApi.refresh(id)
        const settled = settledSince(processingSeen.current, entry)
        return { id, abandoned: false, settled }
      } catch (error) {
        const code = avatarsApi.errorCode(error)
        const abandoned =
          code !== null && PROCESSING_REFRESH_GIVE_UP_CODES.includes(code)
        return { id, abandoned, settled: false }
      }
    }
    const tick = async () => {
      if (inFlight.current) return

      inFlight.current = true
      lastRoundAt.current = Date.now()
      try {
        const results = await Promise.all(ids.map(refreshOne))
        const abandoned = results
          .filter((result) => result.abandoned)
          .map((result) => result.id)
        if (abandoned.length > 0)
          setAbandonedIds((current) => [...current, ...abandoned])
        // Una lectura gratis por ronda en la que algo terminó.
        if (results.some((result) => result.settled))
          void queryClient.invalidateQueries({
            queryKey: avatarsQueryKeys.balance,
          })
        await queryClient.invalidateQueries({ queryKey: avatarsQueryKeys.list })
      } finally {
        inFlight.current = false
      }
    }

    // La primera ronda llega cuando se cumple el intervalo desde la anterior
    // (ya, si no hubo ninguna o pasó más de un intervalo).
    const delay = Math.max(
      0,
      lastRoundAt.current + PROCESSING_REFRESH_INTERVAL_MS - Date.now(),
    )
    let timer: ReturnType<typeof setInterval> | undefined
    const first = setTimeout(() => {
      void tick()
      timer = setInterval(() => void tick(), PROCESSING_REFRESH_INTERVAL_MS)
    }, delay)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [idsKey, queryClient])
}

// Cómo le fue a un avatar en una ronda: si hay que dejar de preguntar por él
// y si algo de lo que procesaba terminó.
interface RefreshOutcome {
  id: string
  abandoned: boolean
  settled: boolean
}

// Un avatar que entrena (desde foto) o con un look en camino (generado desde
// Vimo): los dos se completan solos del lado de HeyGen.
function isPending(entry: AvatarSummary) {
  if (entry.status === 'processing') return true

  return entry.looks.some((look) => look.status === 'processing')
}

// Lo que procesa un avatar: él mismo y cada uno de sus looks.
function processingKeys(entry: AvatarSummary): Set<string> {
  const keys = new Set(
    entry.looks
      .filter((look) => look.status === 'processing')
      .map((look) => `look:${look.lookId}`),
  )
  if (entry.status === 'processing') keys.add('avatar')
  return keys
}

// Si algo terminó desde la ronda anterior de este avatar, y anota lo de
// ahora. Un avatar que dejó de estar pendiente terminó algo aunque no haya
// ronda anterior (solo se sondea lo que está pendiente).
function settledSince(
  seen: Map<string, Set<string>>,
  entry: AvatarSummary,
): boolean {
  const before = seen.get(entry.id)
  const now = processingKeys(entry)
  seen.set(entry.id, now)
  if (!isPending(entry)) return true
  if (!before) return false

  return [...before].some((key) => !now.has(key))
}
