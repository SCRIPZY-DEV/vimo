import type { FlowToolsExecutionPlan } from '@pipeline/types/flow-execution-plan.ts'
import { normalizeFlowExecutionPlan } from '@/modules/common/utilities/flowExecutionPlan'
import type {
  FlowRestartConsent,
  FlowRestartRequest,
} from '@/modules/common/types/flow'
import { resolveFlowRestartConsent } from '@/modules/common/utilities/flowRestartConsent'
import { useRef, useState } from 'react'
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
import type { PipelineEventPayload } from '@pipeline/runner/events.ts'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'
import type {
  CatalogDraftSamplesSource,
  GenerateStyleSamplesPayload,
  StyleSample,
} from '@pipeline/types/styles.ts'

export interface SampleGenerationState {
  running: boolean
  // Fase reportada por el sidecar; null = sin job.
  phase: 'prompts' | 'images' | null
  // Progreso por muestra (id → %) durante la fase de imágenes.
  samplePercents: Record<number, number>
  promptPercents: Record<number, number>
  sampleStatuses: Record<number, string>
  sampleImages: Record<number, string>
  completed: boolean
  errorKey: string | null
}

const INITIAL_STATE: SampleGenerationState = {
  running: false,
  phase: null,
  samplePercents: {},
  promptPercents: {},
  sampleStatuses: {},
  sampleImages: {},
  completed: false,
  errorKey: null,
}

// Lo que reporta `generate-style-samples` en cada evento de avance.
interface SampleProgressDetail {
  phase?: 'prompts' | 'images'
  sampleId?: number
  status?: string
  path?: string
  mtimeMs?: number
}

function isStyleSample(value: unknown): value is StyleSample {
  if (typeof value !== 'object' || value === null) return false
  return (
    typeof Reflect.get(value, 'file') === 'string' &&
    typeof Reflect.get(value, 'path') === 'string' &&
    typeof Reflect.get(value, 'mtimeMs') === 'number'
  )
}

// Las muestras del resultado del job, si el sidecar las devolvió con su forma.
function samplesOfResult(result: unknown): StyleSample[] {
  if (typeof result !== 'object' || result === null) return []
  const samples: unknown = Reflect.get(result, 'samples')
  if (!Array.isArray(samples)) return []
  return samples.filter(isStyleSample)
}

// Job de muestras de un estilo: progreso por muestra vía eventos del Channel
// (reemplazo del polling de 500 ms del origen). Al completar invalida la
// galería — las muestras nuevas ya están en disco — y difiere el refetch del
// saldo del proveedor (también si falló: pudo cobrar alguna muestra). Un
// borrador del catálogo (Entrega 3, ADR-0049) genera con el mismo job y el
// mismo avance; sus muestras no están en ninguna galería local, así que
// `generateForCatalogDraft` las devuelve para que el modal las suba.
export function useStyleSampleGeneration() {
  const [state, setState] = useState(INITIAL_STATE)
  const restartRequest = useRef<FlowRestartConsent | null>(null)
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

  // Corre el job y resuelve con las muestras del resultado al completar, o
  // con null si falló (el porqué queda en `errorKey`). `invalidate` dice si
  // hay una galería local que refrescar (Mi estilo sí; un borrador del
  // catálogo no).
  const run = async (
    payload: GenerateStyleSamplesPayload,
    invalidate: boolean,
  ): Promise<StyleSample[] | null> => {
    setState({ ...INITIAL_STATE, running: true })
    const refreshGallery = () => {
      if (!invalidate) return
      void queryClient.invalidateQueries({
        queryKey: videosQueryKeys.customStyles,
      })
    }
    return new Promise<StyleSample[] | null>((resolve) => {
      const onEvent = (event: PipelineEventPayload) => {
        if (event.type === 'progress') {
          const detail = (event.detail ?? {}) as SampleProgressDetail
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
            sampleStatuses:
              detail.phase === 'images' &&
              detail.sampleId !== undefined &&
              detail.status
                ? {
                    ...previous.sampleStatuses,
                    [detail.sampleId]: detail.status,
                  }
                : previous.sampleStatuses,
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
          restartRequest.current = null
          setState((previous) => ({
            ...previous,
            running: false,
            phase: null,
            completed: true,
          }))
          refreshGallery()
          scheduleCreditsRefresh()
          resolve(samplesOfResult(event.result))
          return
        }
        if (event.type === 'job-failed') {
          refreshGallery()
          setState((previous) => ({
            ...previous,
            running: false,
            phase: null,
            errorKey:
              CREATE_ERROR_MESSAGE_KEYS[event.code] ?? UNKNOWN_CREATE_ERROR_KEY,
          }))
          scheduleCreditsRefresh()
          resolve(null)
        }
      }
      videosApi.generateStyleSamples(payload, onEvent).catch((error) => {
        setState((previous) => ({
          ...previous,
          running: false,
          phase: null,
          errorKey: videosApi.errorMessageKey(error),
        }))
        scheduleCreditsRefresh()
        resolve(null)
      })
    })
  }

  const generate = async (
    styleId: string,
    imageProvider: ImageProviderId,
    {
      templateGem,
      restart,
      revision = styleId,
      executionPlan,
    }: SampleGenerationOptions,
  ) => {
    const plan = normalizeFlowExecutionPlan(executionPlan)
    if (plan && imageProvider !== 'flow')
      throw new Error('execution_plan_invalid')
    const scope = JSON.stringify([
      styleId,
      imageProvider,
      revision,
      ...(plan ? [plan] : []),
    ])
    restartRequest.current =
      imageProvider === 'flow'
        ? resolveFlowRestartConsent(restartRequest.current, scope, restart)
        : null
    // Conserva el modelo de plantilla y el consentimiento del mismo recibo.
    await run(
      {
        styleId,
        imageProvider,
        ...(plan ? { executionPlan: plan } : {}),
        ...restartRequest.current?.request,
        ...(templateGem && settingsPromptModel
          ? { promptModel: settingsPromptModel }
          : {}),
      },
      true,
    )
  }

  // Un borrador del catálogo es siempre una gema de plantilla: escribe con el
  // modelo de Ajustes, como las de Mi estilo.
  const generateForCatalogDraft = (
    catalogDraft: CatalogDraftSamplesSource,
    imageProvider: ImageProviderId,
    restart?: FlowRestartRequest,
    executionPlan?: FlowToolsExecutionPlan,
  ) => {
    const plan = normalizeFlowExecutionPlan(executionPlan)
    if (plan && imageProvider !== 'flow')
      throw new Error('execution_plan_invalid')
    const scope = JSON.stringify([
      catalogDraft,
      imageProvider,
      settingsPromptModel,
      ...(plan ? [plan] : []),
    ])
    restartRequest.current =
      imageProvider === 'flow'
        ? resolveFlowRestartConsent(restartRequest.current, scope, restart)
        : null
    return run(
      {
        catalogDraft,
        imageProvider,
        ...(plan ? { executionPlan: plan } : {}),
        ...restartRequest.current?.request,
        ...(settingsPromptModel ? { promptModel: settingsPromptModel } : {}),
      },
      false,
    )
  }

  return { ...state, generate, generateForCatalogDraft }
}
