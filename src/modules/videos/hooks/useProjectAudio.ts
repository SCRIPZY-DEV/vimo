import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/modules/common/hooks/useToast'
import { videosApi } from '@/modules/videos/api'
import { videosQueryKeys } from '@/modules/videos/constants'
import { useLibraryEditorTask } from '@/modules/videos/hooks/useLibraryEditorTask'
import type { PipelineEventPayload } from '@pipeline/runner/events.ts'
import type {
  MusicGenerationParams,
  MusicOption,
} from '@pipeline/types/music.ts'
import type {
  AudioMixChange,
  MusicChoice,
  NarrationReplacement,
} from '@/modules/videos/types/library'

// Audio del proyecto desde el editor: reemplazo de narración (con progreso
// de síntesis), música (IA reusa generate-music del dominio music; acá solo
// viaja la URL elegida) y mezcla. Las operaciones que tocan archivos pasan
// por la exclusión del store (audioBusy).
export function useProjectAudio(projectId: string) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { task, beginAudioOperation, endAudioOperation } =
    useLibraryEditorTask(projectId)

  const [narrationPercent, setNarrationPercent] = useState<number | null>(null)
  const [musicPercent, setMusicPercent] = useState<number | null>(null)

  const toastBusy = () => {
    toast({
      description: t('library.errors.projectBusy'),
      variant: 'destructive',
    })
  }

  // Corre un job streaming hasta su cierre dentro de la exclusión de audio.
  const runAudioJob = async (
    start: (onEvent: (event: PipelineEventPayload) => void) => Promise<unknown>,
    onEvent?: (event: PipelineEventPayload) => void,
  ): Promise<boolean> => {
    if (!beginAudioOperation(projectId)) {
      toastBusy()
      return false
    }
    try {
      await new Promise<void>((resolve, reject) => {
        start((event) => {
          onEvent?.(event)
          if (event.type === 'job-completed') resolve()
          if (event.type === 'job-failed') reject({ code: event.code })
        }).catch(reject)
      })
      endAudioOperation(projectId, null)
      return true
    } catch (error) {
      endAudioOperation(projectId, videosApi.errorMessageKey(error))
      return false
    }
  }

  const replaceNarration = async (
    payload: NarrationReplacement,
  ): Promise<boolean> => {
    setNarrationPercent(0)
    const ok = await runAudioJob(
      (onEvent) =>
        videosApi.startReplaceNarration({ projectId, ...payload }, onEvent),
      (event) => {
        if (event.type === 'voice-progress' && event.percent != null)
          setNarrationPercent(event.percent)
      },
    )
    setNarrationPercent(null)
    if (ok) toast({ description: t('library.audio.narrationReplaced') })
    return ok
  }

  const setMusic = async (payload: MusicChoice): Promise<boolean> => {
    if (!beginAudioOperation(projectId)) {
      toastBusy()
      return false
    }
    try {
      await videosApi.setProjectMusic({ projectId, ...payload })
      endAudioOperation(projectId, null)
      toast({ description: t('library.music.updated') })
      return true
    } catch (error) {
      endAudioOperation(projectId, videosApi.errorMessageKey(error))
      return false
    }
  }

  // La generación IA no toca el proyecto (devuelve variaciones remotas):
  // corre sin exclusión y el usuario elige después.
  const generateMusic = async (
    params: MusicGenerationParams,
  ): Promise<MusicOption[] | null> => {
    setMusicPercent(0)
    try {
      return await new Promise<MusicOption[]>((resolve, reject) => {
        videosApi
          .generateProjectMusic(params, (event) => {
            if (event.type === 'progress' && event.percent !== undefined)
              setMusicPercent(event.percent)
            if (event.type === 'job-completed') {
              const result = event.result as unknown as {
                options: MusicOption[]
              } | null
              resolve(result?.options ?? [])
            }
            if (event.type === 'job-failed') reject({ code: event.code })
          })
          .catch(reject)
      })
    } catch (error) {
      toast({
        description: t(videosApi.errorMessageKey(error)),
        variant: 'destructive',
      })
      return null
    } finally {
      setMusicPercent(null)
    }
  }

  const suggestMusicPrompt = async (script: string): Promise<string | null> => {
    try {
      return await videosApi.suggestMusicPrompt(script)
    } catch (error) {
      toast({
        description: t(videosApi.errorMessageKey(error)),
        variant: 'destructive',
      })
      return null
    }
  }

  const updateMix = async (payload: AudioMixChange): Promise<boolean> => {
    try {
      await videosApi.updateAudioMix({ projectId, ...payload })
      void queryClient.invalidateQueries({
        queryKey: videosQueryKeys.projectDetail(projectId),
      })
      return true
    } catch (error) {
      toast({
        description: t(videosApi.errorMessageKey(error)),
        variant: 'destructive',
      })
      return false
    }
  }

  const pickAudioFile = () => {
    return videosApi.pickNarrationFile()
  }

  return {
    audioBusy: task?.audioBusy ?? false,
    narrationPercent,
    musicPercent,
    replaceNarration,
    setMusic,
    generateMusic,
    suggestMusicPrompt,
    updateMix,
    pickAudioFile,
  }
}
