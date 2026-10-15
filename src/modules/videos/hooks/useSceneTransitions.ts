import { useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/modules/common/hooks/useToast'
import { videosApi } from '@/modules/videos/api'
import { videosQueryKeys } from '@/modules/videos/constants'
import { sceneTransitionSelection } from '@/modules/videos/utilities/sceneTransitionSelection'
import type {
  SceneTransitionChange,
  UseSceneTransitionsOptions,
} from '@/modules/videos/types/sceneTransitions'

export function useSceneTransitions({
  projectId,
  scenes,
  selectedSceneId,
}: UseSceneTransitionsOptions) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const selection = useMemo(
    () => sceneTransitionSelection(scenes, selectedSceneId),
    [scenes, selectedSceneId],
  )
  const { allTargets, selectedTarget } = selection
  const enabled =
    allTargets.length > 0 && allTargets.every((target) => target.enabled)
  const mutation = useMutation({
    async mutationFn({ projectId, value, targets }: SceneTransitionChange) {
      const changes = targets
        .filter((target) => target.enabled !== value)
        .map((target) => ({ id: target.id, staticTransitionIn: value }))
      if (changes.length === 0) return
      await videosApi.updateScenes(projectId, changes)
    },
    async onSuccess(_result, { projectId, value }) {
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
  const change = (value: boolean) => {
    if (mutation.isPending || allTargets.length === 0) return
    mutation.mutate({ projectId, value, targets: allTargets })
  }
  const changeSelected = (value: boolean) => {
    if (mutation.isPending || !selectedTarget) return
    // El destino viaja con el gesto: cambiar de selección mientras guarda
    // no puede redirigir la escritura a otra frontera ni convertirla en global.
    mutation.mutate({ projectId, value, targets: [selectedTarget] })
  }
  return {
    ...selection,
    enabled,
    available: allTargets.length > 0,
    saving: mutation.isPending,
    change,
    changeSelected,
  }
}
