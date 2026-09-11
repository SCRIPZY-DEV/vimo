import { useCallback, useEffect, useRef, useState } from 'react'
import { videosApi } from '@/modules/videos/api'
import {
  DEMO_ERROR_MESSAGE_KEYS,
  UNKNOWN_DEMO_ERROR_KEY,
} from '@/modules/videos/constants'
import { demoPrepareProgress } from '@/modules/videos/utilities/demoPrepareProgress'
import type { PipelineJobHandle } from '@/modules/common/fetcher/pipeline'
import type { DemoPrepareView } from '@/modules/videos/types/demo'
import type { DemoPrepareResult } from '@pipeline/types/demo.ts'

const IDLE: DemoPrepareView = {
  status: 'idle',
  progress: null,
  manifest: null,
  errorKey: null,
}

// El job demo-prepare (descarga única del pack) con su progreso. Vive solo
// mientras la puerta está montada: salir de la vista cancela el job (el
// sidecar borra sus temporales) y la próxima visita lo lanza de nuevo.
export function useDemoPrepare() {
  const [view, setView] = useState<DemoPrepareView>(IDLE)
  const jobRef = useRef<PipelineJobHandle | null>(null)
  // Un solo arranque por intento: el efecto que lo dispara puede correr dos
  // veces (StrictMode) antes de que el estado refleje `running`.
  const startedRef = useRef(false)
  // `startDemoPrepare` cablea el Channel antes de esperar el invoke (mismo
  // orden que `runPipelineJob`, pipeline.ts): sus eventos pueden llegar ANTES
  // de que la promesa del handle resuelva. Estas dos banderas son el mismo
  // guard `finished` de `runPipelineJob`, adaptado a un job de vida larga:
  // evitan que el `.then` de más abajo pise un estado que ya cambió mientras
  // el invoke seguía en vuelo.
  const finishedRef = useRef(false)
  const unmountedRef = useRef(false)

  const start = useCallback(() => {
    if (startedRef.current) return
    startedRef.current = true
    setView({ ...IDLE, status: 'running' })

    videosApi
      .startDemoPrepare((event) => {
        if (event.type === 'progress') {
          const progress = demoPrepareProgress(event)
          if (progress) setView((current) => ({ ...current, progress }))
          return
        }
        if (event.type === 'job-completed') {
          jobRef.current = null
          finishedRef.current = true
          const result = event.result as unknown as DemoPrepareResult
          setView({
            status: 'done',
            progress: null,
            manifest: result.manifest,
            errorKey: null,
          })
          return
        }
        if (event.type === 'job-failed') {
          jobRef.current = null
          finishedRef.current = true
          setView({
            status: 'error',
            progress: null,
            manifest: null,
            errorKey:
              DEMO_ERROR_MESSAGE_KEYS[event.code] ?? UNKNOWN_DEMO_ERROR_KEY,
          })
        }
      })
      .then(
        (job) => {
          // El job ya terminó (rápido) antes de que este handle llegara: no
          // resucitarlo en jobRef, alcanza con soltar el listener del canal.
          if (finishedRef.current) {
            job.stop()
            return
          }
          // La vista se desmontó con el invoke todavía en vuelo: el cleanup
          // de abajo ya corrió y no lo vio (jobRef seguía null), así que
          // cancela acá, ahora que por fin hay un id para cancelar.
          if (unmountedRef.current) {
            job.stop()
            void videosApi.cancelJob(job.jobId).catch(() => undefined)
            return
          }
          jobRef.current = job
        },
        (error: unknown) => {
          setView({
            status: 'error',
            progress: null,
            manifest: null,
            errorKey: videosApi.demoErrorMessageKey(error),
          })
        },
      )
  }, [])

  const reset = useCallback(() => {
    // Reintentar puede encontrar un job todavía vivo (el intento anterior no
    // llegó a limpiarse solo): cancelarlo acá antes de soltar la referencia,
    // para no perderle el rastro cuando jobRef pase a apuntar al intento nuevo.
    const job = jobRef.current
    jobRef.current = null
    if (job) {
      job.stop()
      void videosApi.cancelJob(job.jobId).catch(() => undefined)
    }
    finishedRef.current = false
    startedRef.current = false
    setView(IDLE)
  }, [])

  useEffect(
    () => () => {
      unmountedRef.current = true
      const job = jobRef.current
      if (!job) return
      job.stop()
      void videosApi.cancelJob(job.jobId).catch(() => undefined)
    },
    [],
  )

  return { ...view, start, reset }
}
