import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/modules/common/hooks/useToast'
import { videosApi } from '@/modules/videos/api'
import { videosQueryKeys } from '@/modules/videos/constants'
import type { SceneDetail } from '@pipeline/types/video-project.ts'

interface UseSceneTransitionsOptions {
  projectId: string
  scenes: SceneDetail[]
}

export function useSceneTransitions({
  projectId,
  scenes,
}: UseSceneTransitionsOptions) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const entries = scenes
    .filter(
      (scene) =>
        scene.startSeconds !== undefined &&
        scene.endSeconds !== undefined &&
        scene.endSeconds > scene.startSeconds,
    )
    .slice(1)
  const enabled =
    entries.length > 0 &&
    entries.every((scene) => scene.staticTransitionIn === true)
  const mutation = useMutation({
    async mutationFn(value: boolean) {
      const changes = entries
        .filter((scene) => (scene.staticTransitionIn === true) !== value)
        .map((scene) => ({ id: scene.id, staticTransitionIn: value }))
      if (changes.length === 0) return
      await videosApi.updateScenes(projectId, changes)
    },
    async onSuccess(_result, value) {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: videosQueryKeys.projectDetail(projectId),
        }),
        queryClient.invalidateQueries({ queryKey: videosQueryKeys.projects }),
      ])
      if (value)
        toast({ description: t('library.editor.transitions.playHint') })
    },
    onError(error) {
      toast({
        description: t(videosApi.errorMessageKey(error)),
        variant: 'destructive',
      })
    },
  })
  return {
    enabled,
    available: entries.length > 0,
    saving: mutation.isPending,
    change: mutation.mutate,
  }
}
