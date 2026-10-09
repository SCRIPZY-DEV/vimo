import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { avatarsApi } from '@/modules/avatars/api'
import {
  avatarsQueryKeys,
  PROCESSING_REFRESH_INTERVAL_MS,
} from '@/modules/avatars/constants'
import type { AvatarSummary } from '@pipeline/types/avatar.ts'

// Mientras haya avatares entrenando, les pregunta a HeyGen cómo van (el
// sidecar guarda el estado nuevo) y la lista se vuelve a leer. Los errores se
// ignoran a propósito: es un sondeo, el usuario no pidió nada.
export function useProcessingAvatarsRefresh(entries: AvatarSummary[]) {
  const queryClient = useQueryClient()
  const processingIds = entries
    .filter((entry) => entry.status === 'processing')
    .map((entry) => entry.id)
  const idsKey = processingIds.join(',')
  const inFlight = useRef(false)

  useEffect(() => {
    if (!idsKey) return
    const ids = idsKey.split(',')
    const tick = async () => {
      if (inFlight.current) return
      inFlight.current = true
      try {
        await Promise.all(
          ids.map((id) => avatarsApi.refresh(id).catch(() => null)),
        )
        await queryClient.invalidateQueries({ queryKey: avatarsQueryKeys.list })
      } finally {
        inFlight.current = false
      }
    }
    void tick()
    const timer = setInterval(() => void tick(), PROCESSING_REFRESH_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [idsKey, queryClient])
}
