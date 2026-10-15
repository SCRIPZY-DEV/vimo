import { useSyncExternalStore } from 'react'
import { videosApi } from '@/modules/videos/api'
import {
  DEMO_BUSY_POLL_INTERVAL_MS,
  DEMO_PREPARE_SILENCE_LIMIT_MS,
  DEMO_STATUS_TIMEOUT_MS,
} from '@/modules/videos/constants'
import { createDemoPrepareStore } from '@/modules/videos/utilities/demoPrepareStore'

// El job demo-prepare (la descarga del pack por partes) vive fuera de React,
// uno solo por app (patrón de useCreateTask): salir de la puerta no lo
// cancela y volver muestra su avance (createDemoPrepareStore decide el resto).
const demoPrepare = createDemoPrepareStore(videosApi, {
  pollIntervalMs: DEMO_BUSY_POLL_INTERVAL_MS,
  silenceLimitMs: DEMO_PREPARE_SILENCE_LIMIT_MS,
  statusTimeoutMs: DEMO_STATUS_TIMEOUT_MS,
})

export function useDemoPrepare() {
  const job = useSyncExternalStore(
    demoPrepare.subscribe,
    demoPrepare.getSnapshot,
  )

  return { job, start: demoPrepare.start, reset: demoPrepare.reset }
}
