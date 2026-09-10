import { useEffect, useRef, useState } from 'react'
import { charactersApi } from '@/modules/characters/api'
import { UNKNOWN_CHARACTERS_ERROR_KEY } from '@/modules/characters/constants'
import type { PipelineJobHandle } from '@/modules/common/fetcher/pipeline'
import type { PipelineEventPayload } from '@pipeline/runner/events.ts'
import type {
  CharacterPreviewPhase,
  CharacterPreviewProgressDetail,
  GenerateCharacterPreviewPayload,
  GenerateCharacterPreviewResult,
} from '@pipeline/types/characters.ts'

// El result del job viaja como JSON suelto: acá se lee con el contrato del sidecar
function previewDataUri(result: unknown): string | null {
  const preview = result as GenerateCharacterPreviewResult | null
  return preview?.dataUri ?? null
}

function progressPhase(detail: unknown): CharacterPreviewPhase | null {
  const progress = detail as CharacterPreviewProgressDetail | null
  return progress?.phase ?? null
}

// El estado vive en el componente y no en un store como música/voz: el preview
// solo existe mientras el modal está abierto, y al cerrarlo se cancela el job
export function useCharacterPreview() {
  const [generating, setGenerating] = useState(false)
  const [percent, setPercent] = useState(0)
  // Hasta el primer `progress` con porcentaje de la fase en curso no hay
  // número que mostrar, solo el spinner (el sidecar simula el avance de Fal y
  // del prompt; Evolink informa el suyo).
  const [hasProgress, setHasProgress] = useState(false)
  // Solo con estilo propio: la gema escribe el prompt antes de la imagen.
  const [phase, setPhase] = useState<CharacterPreviewPhase | null>(null)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const activeJob = useRef<PipelineJobHandle | null>(null)

  // El job no debe sobrevivir al modal que lo lanzó.
  useEffect(() => {
    return () => {
      const job = activeJob.current
      activeJob.current = null
      if (!job) return
      job.stop()
      void charactersApi.cancelJob(job.jobId)
    }
  }, [])

  const generate = (payload: GenerateCharacterPreviewPayload) => {
    return new Promise<string | null>((resolve) => {
      setGenerating(true)
      setPercent(0)
      setHasProgress(false)
      setPhase(null)
      setErrorKey(null)

      let finished = false
      // La fase vigente vive en el closure del job: el estado de React llega
      // tarde para decidir si un `progress` reinicia la barra.
      let currentPhase: CharacterPreviewPhase | null = null
      const finish = (dataUri: string | null, failureKey: string | null) => {
        finished = true
        activeJob.current?.stop()
        activeJob.current = null
        setGenerating(false)
        if (failureKey) setErrorKey(failureKey)
        resolve(dataUri)
      }

      const handleEvent = (event: PipelineEventPayload) => {
        if (event.type === 'progress') {
          const nextPhase = progressPhase(event.detail)
          // Cambio de fase (prompt → imagen): la barra arranca de nuevo.
          if (nextPhase && nextPhase !== currentPhase) {
            currentPhase = nextPhase
            setPhase(nextPhase)
            setPercent(0)
            setHasProgress(false)
          }
          if (typeof event.percent !== 'number') return

          // Nunca retrocede: el ramp simulado del sidecar y el avance real
          // del proveedor pueden intercalarse.
          const percent = event.percent
          setPercent((current) => Math.max(current, percent))
          setHasProgress(true)
          return
        }

        if (event.type === 'job-completed') {
          const dataUri = previewDataUri(event.result)
          if (!dataUri) {
            finish(null, UNKNOWN_CHARACTERS_ERROR_KEY)
            return
          }

          finish(dataUri, null)
          return
        }

        if (event.type === 'job-failed') {
          finish(null, charactersApi.errorMessageKey(event))
        }
      }

      charactersApi.startPreview(payload, handleEvent).then(
        (job) => {
          // El job pudo completarse con eventos encolados antes de llegar acá.
          if (finished) {
            job.stop()
            return
          }
          activeJob.current = job
        },
        (error: unknown) => finish(null, charactersApi.errorMessageKey(error)),
      )
    })
  }

  const cancel = () => {
    const job = activeJob.current
    activeJob.current = null
    setGenerating(false)
    if (!job) return
    job.stop()
    void charactersApi.cancelJob(job.jobId)
  }

  return {
    generating,
    percent,
    hasProgress,
    phase,
    errorKey,
    generate,
    cancel,
  }
}
