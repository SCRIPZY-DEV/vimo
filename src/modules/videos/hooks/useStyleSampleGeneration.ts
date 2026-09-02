import { useState } from 'react'
import { queryClient } from '@/modules/common/queryClient'
import { videosApi } from '@/modules/videos/api'
import {
  CREATE_ERROR_MESSAGE_KEYS,
  UNKNOWN_CREATE_ERROR_KEY,
  videosQueryKeys,
} from '@/modules/videos/constants'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'

export interface SampleGenerationState {
  running: boolean
  // Fase reportada por el sidecar; null = sin job.
  phase: 'prompts' | 'images' | null
  // Progreso por muestra (id → %) durante la fase de imágenes.
  samplePercents: Record<number, number>
  completed: boolean
  errorKey: string | null
}

const INITIAL_STATE: SampleGenerationState = {
  running: false,
  phase: null,
  samplePercents: {},
  completed: false,
  errorKey: null,
}

// Job de muestras de un estilo: progreso por muestra vía eventos del Channel
// (reemplazo del polling de 500 ms del origen). Al completar invalida la
// galería — las muestras nuevas ya están en disco.
export function useStyleSampleGeneration() {
  const [state, setState] = useState(INITIAL_STATE)

  const generate = async (styleId: string, imageProvider: ImageProviderId) => {
    setState({ ...INITIAL_STATE, running: true })
    try {
      await videosApi.generateStyleSamples(
        { styleId, imageProvider },
        (event) => {
          if (event.type === 'progress') {
            const detail = (event.detail ?? {}) as {
              phase?: 'prompts' | 'images'
              sampleId?: number
            }
            setState((previous) => ({
              ...previous,
              phase: detail.phase ?? previous.phase,
              samplePercents:
                detail.phase === 'images' && detail.sampleId !== undefined
                  ? {
                      ...previous.samplePercents,
                      [detail.sampleId]: event.percent ?? 0,
                    }
                  : previous.samplePercents,
            }))
            return
          }
          if (event.type === 'job-completed') {
            setState((previous) => ({
              ...previous,
              running: false,
              phase: null,
              completed: true,
            }))
            void queryClient.invalidateQueries({
              queryKey: videosQueryKeys.customStyles,
            })
            return
          }
          if (event.type === 'job-failed') {
            setState((previous) => ({
              ...previous,
              running: false,
              phase: null,
              errorKey:
                CREATE_ERROR_MESSAGE_KEYS[event.code] ??
                UNKNOWN_CREATE_ERROR_KEY,
            }))
          }
        },
      )
    } catch (error) {
      setState((previous) => ({
        ...previous,
        running: false,
        phase: null,
        errorKey: videosApi.errorMessageKey(error),
      }))
    }
  }

  return { ...state, generate }
}
