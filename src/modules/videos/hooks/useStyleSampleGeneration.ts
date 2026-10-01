import { useState } from 'react'
import { usePromptModelBlocks } from '@/modules/common/hooks/usePromptModelBlocks'
import { usePromptModels } from '@/modules/common/hooks/usePromptModels'
import { queryClient } from '@/modules/common/queryClient'
import { scheduleCreditsRefresh } from '@/modules/common/utilities/creditsRefresh'
import { resolvePromptModel } from '@/modules/common/utilities/resolvePromptModel'
import { usePromptModelPreference } from '@/modules/settings/hooks/usePromptModelPreference'
import { videosApi } from '@/modules/videos/api'
import {
  CREATE_ERROR_MESSAGE_KEYS,
  UNKNOWN_CREATE_ERROR_KEY,
  videosQueryKeys,
} from '@/modules/videos/constants'
import type { SampleGenerationOptions } from '@/modules/videos/types/styles'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'
import type { GenerateStyleSamplesPayload } from '@pipeline/types/styles.ts'

export interface SampleGenerationState {
  running: boolean
  // Fase reportada por el sidecar; null = sin job.
  phase: 'prompts' | 'images' | null
  // Progreso por muestra (id → %) durante la fase de imágenes.
  samplePercents: Record<number, number>
  promptPercents: Record<number, number>
  sampleImages: Record<number, string>
  completed: boolean
  errorKey: string | null
}

const INITIAL_STATE: SampleGenerationState = {
  running: false,
  phase: null,
  samplePercents: {},
  promptPercents: {},
  sampleImages: {},
  completed: false,
  errorKey: null,
}

// Job de muestras de un estilo: progreso por muestra vía eventos del Channel
// (reemplazo del polling de 500 ms del origen). Al completar invalida la
// galería — las muestras nuevas ya están en disco — y difiere el refetch del
// saldo del proveedor (también si falló: pudo cobrar alguna muestra).
export function useStyleSampleGeneration() {
  const [state, setState] = useState(INITIAL_STATE)
  // Una gema de plantilla escribe sus muestras con el modelo de Ajustes, como
  // el video (spec §5.6, ADR-0022), resuelto igual que en Crear: uno retirado
  // o bloqueado (ADR-0028) cae a otro del catálogo.
  const { promptModelDefaults } = usePromptModelPreference()
  const { models, defaultId } = usePromptModels()
  const { blockedIds } = usePromptModelBlocks()
  const settingsPromptModel = resolvePromptModel(
    promptModelDefaults?.modelId ?? null,
    models,
    defaultId,
    blockedIds,
  )

  const generate = async (
    styleId: string,
    imageProvider: ImageProviderId,
    { templateGem }: SampleGenerationOptions,
  ) => {
    setState({ ...INITIAL_STATE, running: true })
    // Una gema vieja manda exactamente lo de siempre.
    const payload: GenerateStyleSamplesPayload = {
      styleId,
      imageProvider,
      ...(templateGem && settingsPromptModel
        ? { promptModel: settingsPromptModel }
        : {}),
    }
    try {
      await videosApi.generateStyleSamples(payload, (event) => {
        if (event.type === 'progress') {
          const detail = (event.detail ?? {}) as {
            phase?: 'prompts' | 'images'
            sampleId?: number
            status?: string
            path?: string
            mtimeMs?: number
          }
          setState((previous) => ({
            ...previous,
            phase: detail.phase ?? previous.phase,
            promptPercents:
              detail.phase === 'prompts' && detail.sampleId !== undefined
                ? {
                    ...previous.promptPercents,
                    [detail.sampleId]: event.percent ?? 0,
                  }
                : previous.promptPercents,
            sampleImages:
              detail.status === 'completed' &&
              detail.path &&
              detail.sampleId !== undefined
                ? {
                    ...previous.sampleImages,
                    [detail.sampleId]: videosApi.imageSource(
                      detail.path,
                      detail.mtimeMs,
                    ),
                  }
                : previous.sampleImages,
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
          scheduleCreditsRefresh()
          return
        }
        if (event.type === 'job-failed') {
          void queryClient.invalidateQueries({
            queryKey: videosQueryKeys.customStyles,
          })
          setState((previous) => ({
            ...previous,
            running: false,
            phase: null,
            errorKey:
              CREATE_ERROR_MESSAGE_KEYS[event.code] ?? UNKNOWN_CREATE_ERROR_KEY,
          }))
          scheduleCreditsRefresh()
        }
      })
    } catch (error) {
      setState((previous) => ({
        ...previous,
        running: false,
        phase: null,
        errorKey: videosApi.errorMessageKey(error),
      }))
      scheduleCreditsRefresh()
    }
  }

  return { ...state, generate }
}
