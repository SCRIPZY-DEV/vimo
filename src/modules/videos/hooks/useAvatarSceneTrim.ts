import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from '@/modules/common/hooks/useToast'
import { videosApi } from '@/modules/videos/api'
import { videosQueryKeys } from '@/modules/videos/constants'
import { errorKeyOf } from '@/modules/videos/utilities/errorKeyOf'
import { formatSlotSeconds } from '@/modules/videos/utilities/formatSlotSeconds'
import type { AvatarTrimScenePayload } from '@pipeline/types/avatar.ts'

// «Recortar a N s» una escena de avatar lista desde el editor (entrega 2g,
// diseño §23.3): Vimo corta el final del clip que ya tiene, gratis y al
// instante, sin hablar con el proveedor ni pedir confirmación (no cuesta
// nada). Al terminar relee el proyecto —la pista y la escena que sigue ya
// tienen los tiempos nuevos, y el video exportado queda desactualizado— y
// avisa con un aviso pasajero lo que dura ahora (la duración real, con un
// decimal: el corte cae en la pausa más cercana). Si falla, el aviso lleva el
// motivo, con el texto del código del sidecar (`errorKeyOf`, como el resto de
// los avisos del avatar: `avatar_trim_unavailable`, `avatar_resize_locked`,
// `avatar_resize_out_of_range`), y la escena no cambia. La mutación sigue
// pendiente hasta que la relectura termina: el botón no puede recortar dos
// veces el mismo tramo con una escena que todavía muestra la duración vieja.
export function useAvatarSceneTrim(projectId: string) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const language = i18n.resolvedLanguage ?? 'es'

  const mutation = useMutation({
    mutationFn: (payload: AvatarTrimScenePayload) => {
      return videosApi.trimAvatarScene(payload)
    },
    onSuccess: async (result) => {
      toast({
        description: t('library.editor.avatar.recortado', {
          seconds: formatSlotSeconds(
            result.endSeconds - result.startSeconds,
            language,
          ),
        }),
      })
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: videosQueryKeys.projectDetail(projectId),
        }),
        queryClient.invalidateQueries({ queryKey: videosQueryKeys.projects }),
      ])
    },
    onError: (error) => {
      toast({
        description: t('library.editor.avatar.recortarFallo', {
          reason: t(errorKeyOf(videosApi.errorCode(error) ?? undefined)),
        }),
        variant: 'destructive',
      })
    },
  })

  return {
    trim: (sceneId: number, seconds: number) =>
      mutation.mutate({ projectId, sceneId, seconds }),
    trimming: mutation.isPending,
  }
}
