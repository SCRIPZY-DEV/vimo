import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/modules/common/hooks/useToast'
import { clamp } from '@/modules/common/utilities/clamp'
import { videosApi } from '@/modules/videos/api'
import { videosQueryKeys } from '@/modules/videos/constants'
import { useLibraryEditorTask } from '@/modules/videos/hooks/useLibraryEditorTask'
import { resolvePreviewSoundEffects } from '@/modules/videos/utilities/projectSoundEffects'
import type { ProjectSoundEffectsOptions } from '@/modules/videos/types/projectSoundEffects'
import type {
  SetProjectSoundEffectsPayload,
  SoundEffectInstance,
} from '@pipeline/types/sound-effects.ts'
import type { VideoProjectDetailResult } from '@pipeline/types/video-project.ts'

export function useProjectSoundEffects({
  projectId,
  scenes,
  storedInstances = [],
  durationSeconds,
}: ProjectSoundEffectsOptions) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const editorTask = useLibraryEditorTask(projectId)
  const catalog = useQuery({
    queryKey: videosQueryKeys.soundEffects,
    queryFn: () => videosApi.listSoundEffects(),
    enabled: videosApi.isNative(),
    staleTime: Infinity,
    retry: false,
  })
  const effect =
    catalog.data?.effects.find((item) => item.id === 'click') ?? null
  // Identidad estable para que el reloj del player no reinicie un click
  // con cada actualización del cursor.
  const instances = useMemo(
    () => resolvePreviewSoundEffects(storedInstances, scenes, durationSeconds),
    [storedInstances, scenes, durationSeconds],
  )
  const transitions = scenes.filter((scene) => {
    return (
      scene.startSeconds !== undefined &&
      scene.startSeconds > 0 &&
      scene.endSeconds !== undefined &&
      scene.endSeconds > scene.startSeconds &&
      scene.startSeconds < durationSeconds
    )
  })
  const allTransitionsEnabled =
    transitions.length > 0 &&
    transitions.every((scene) => {
      return instances.some(
        (instance) => instance.transitionSceneId === scene.id,
      )
    })

  const mutation = useMutation({
    mutationFn: (payload: SetProjectSoundEffectsPayload) =>
      videosApi.setProjectSoundEffects(payload),
    async onSuccess(result, payload) {
      queryClient.setQueryData<VideoProjectDetailResult>(
        videosQueryKeys.projectDetail(payload.projectId),
        (previous) => {
          if (!previous) return previous
          return {
            ...previous,
            metadata: {
              ...previous.metadata,
              videoOutdated: true,
              options: {
                ...previous.metadata.options,
                soundEffects: result.instances,
              },
            },
          }
        },
      )
      await queryClient.invalidateQueries({
        queryKey: videosQueryKeys.projectDetail(payload.projectId),
      })
    },
  })

  const save = async (nextInstances: SoundEffectInstance[]) => {
    if (!editorTask.beginAudioOperation(projectId)) {
      toast({
        description: t('library.errors.projectBusy'),
        variant: 'destructive',
      })
      return
    }
    try {
      await mutation.mutateAsync({ projectId, instances: nextInstances })
      editorTask.endAudioOperation(projectId, null)
    } catch (error) {
      const errorKey = videosApi.errorMessageKey(error)
      editorTask.endAudioOperation(projectId, errorKey)
      toast({ description: t(errorKey), variant: 'destructive' })
    }
  }

  const add = (seconds: number) => {
    if (!effect || durationSeconds <= 0 || !Number.isFinite(seconds)) return
    void save([
      ...instances,
      {
        id: crypto.randomUUID(),
        effectId: effect.id,
        startSeconds: clamp(
          seconds,
          0,
          Math.max(0, durationSeconds - effect.durationSeconds),
        ),
      },
    ])
  }

  const move = (id: string, seconds: number) => {
    if (!effect || !Number.isFinite(seconds)) return
    void save(
      instances.map((instance) => {
        if (instance.id !== id) return instance
        // Al mover a mano deja de seguir una transición.
        return {
          id: instance.id,
          effectId: instance.effectId,
          volume: instance.volume,
          startSeconds: clamp(
            seconds,
            0,
            Math.max(0, durationSeconds - effect.durationSeconds),
          ),
        }
      }),
    )
  }

  const toggleAllTransitions = (enabled: boolean) => {
    if (!effect) return
    const next = instances.filter(
      (instance) => instance.transitionSceneId === undefined,
    )
    if (enabled) {
      for (const scene of transitions) {
        const previous = instances.find(
          (instance) => instance.transitionSceneId === scene.id,
        )
        next.push({
          id: previous?.id ?? crypto.randomUUID(),
          effectId: effect.id,
          startSeconds: scene.startSeconds!,
          transitionSceneId: scene.id,
        })
      }
    }
    void save(next)
  }

  return {
    effect,
    instances,
    allTransitionsEnabled,
    transitionsAvailable: transitions.length > 0,
    loading: videosApi.isNative() && catalog.isPending,
    busy: mutation.isPending,
    error: catalog.isError ? t('library.editor.sfx.loadError') : null,
    add,
    move,
    toggleAllTransitions,
    remove: (id: string) => {
      void save(instances.filter((instance) => instance.id !== id))
    },
  }
}
