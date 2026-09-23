import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { commonApi } from '@/modules/common/api'
import { commonQueryKeys } from '@/modules/common/constants'
import { useImageCredits } from '@/modules/common/hooks/useImageCredits'
import { useVideoCredits } from '@/modules/common/hooks/useVideoCredits'
import { compareCostLines } from '@/modules/common/utilities/compareCostLines'
import { providerLabel } from '@/modules/api-keys/utilities/providerLabel'
import { useRequiredApiKeys } from '@/modules/api-keys/hooks/useRequiredApiKeys'
import {
  MAX_USER_PROMPT_CHARS,
  LIBRARY_ERROR_MESSAGE_KEYS,
} from '@/modules/videos/constants'
import { useLibraryEditorTask } from '@/modules/videos/hooks/useLibraryEditorTask'
import { useLibraryProjectDetail } from '@/modules/videos/hooks/useLibraryProjectDetail'
import { galleryAnimationPlan } from '@/modules/videos/utilities/galleryAnimationPlan'
import { imageCostEstimate } from '@/modules/videos/utilities/imageCostEstimate'
import { animationCostEstimate } from '@/modules/videos/utilities/animationCostEstimate'
import {
  defaultQualityFor,
  normalizeQuality,
} from '@/modules/videos/utilities/imageQuality'
import type {
  GalleryActionsOptions,
  GalleryActionAvailability,
  GalleryImageRequest,
} from '@/modules/videos/types/galleryActions'

// Adaptador de la galería: valida el lote y usa el mismo store del editor.
// El modal no posee jobs; cerrarlo no detiene ni duplica trabajo aceptado.
export function useGalleryActions({
  projectId,
  scenes,
  videoFormat,
  durationSeconds,
  locked,
  imageProvider,
  onRegenerateImages,
}: GalleryActionsOptions) {
  const editorTask = useLibraryEditorTask(projectId)
  const { detail } = useLibraryProjectDetail(projectId)
  const { configuredProviders } = useRequiredApiKeys()
  const imageCredits = useImageCredits({
    enabled: configuredProviders.has(imageProvider),
  })
  const videoCredits = useVideoCredits({
    enabled: configuredProviders.has('kie'),
  })
  const queryClient = useQueryClient()
  const submission = useRef(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const planFor = (ids: number[]) =>
    galleryAnimationPlan(scenes, ids, { videoFormat, durationSeconds })
  const validSelection = (ids: number[]) =>
    ids.length > 0 && ids.every((id) => scenes.some((scene) => scene.id === id))
  const imageEstimate = (ids: number[]) => {
    const lines = scenes
      .filter((scene) => ids.includes(scene.id))
      .flatMap((scene) => {
        const quality = normalizeQuality(
          imageProvider,
          scene.imageQuality ??
            detail?.metadata.options.imageQuality ??
            defaultQualityFor(imageProvider, videoFormat),
          videoFormat,
        )
        const estimate = imageCostEstimate(imageProvider, quality, 1)
        return estimate ? [estimate] : []
      })
    if (!lines.length) return []
    // La suficiencia se compara contra la suma, no contra cada imagen aislada.
    return [
      {
        ...lines[0],
        estimated: lines.reduce((sum, line) => sum + line.estimated, 0),
      },
    ]
  }
  const imageRejection = (ids: number[]) => {
    if (locked) return 'library.editor.demoLocked'
    if (!validSelection(ids)) return 'library.editor.imageGallery.submitFailed'
    if (editorTask.isProjectBusy(projectId)) return 'library.errors.projectBusy'
    if (!configuredProviders.has(imageProvider))
      return 'library.editor.imageGallery.noImageProvider'
    if (ids.some((id) => planFor([id]).canResumeTask))
      return 'library.editor.imageGallery.recoveringImage'
    if (
      compareCostLines(
        imageEstimate(ids),
        { image: imageCredits.credits, voice: null },
        providerLabel,
      ).blocking
    )
      return 'library.editor.imageGallery.insufficientCredits'
    return undefined
  }
  const animationRejection = (ids: number[]) => {
    if (locked) return 'library.editor.demoLocked'
    if (!validSelection(ids)) return 'library.editor.imageGallery.submitFailed'
    const plan = planFor(ids)
    if (plan.rejection || !plan.unit)
      return (
        LIBRARY_ERROR_MESSAGE_KEYS[`animation_${plan.rejection?.reason}`] ??
        'library.editor.animationRange.invalidScenes'
      )
    if (!editorTask.canStartAnimation(projectId, plan.sceneIds))
      return 'library.errors.projectBusy'
    // Solo una recuperación COMPLETAMENTE local permite trabajar sin clave.
    if (
      !configuredProviders.has('kie') &&
      !(plan.requestedSeconds === 0 && plan.canRecoverLocally)
    )
      return 'library.editor.panel.animation.noKey'
    if (
      (plan.requestedSeconds ?? 0) > 0 &&
      (plan.sceneIds ?? []).some(
        (id) => !scenes.find((scene) => scene.id === id)?.imagePath,
      )
    )
      return 'create.errors.animationImageMissing'
    if (
      compareCostLines(
        [animationCostEstimate('kie', plan.requestedSeconds ?? 0)],
        { image: null, voice: null, video: videoCredits.credits },
        providerLabel,
      ).blocking
    )
      return 'library.editor.imageGallery.insufficientCredits'
    return undefined
  }
  const availability = (
    reason: string | undefined,
  ): GalleryActionAvailability => ({
    disabled: submitting || reason !== undefined,
    reason,
  })

  const regenerate = async (requests: GalleryImageRequest[]) => {
    if (submission.current) return false
    const unique = [
      ...new Map(requests.map((entry) => [entry.id, entry])).values(),
    ]
    const ids = unique.map((entry) => entry.id)
    const reason = imageRejection(ids)
    if (
      reason ||
      unique.some((entry) => entry.description.length > MAX_USER_PROMPT_CHARS)
    ) {
      setErrorKey(reason ?? 'library.editor.imageGallery.submitFailed')
      return false
    }
    submission.current = true
    setSubmitting(true)
    setErrorKey(null)
    try {
      const fresh = commonApi.isNative()
        ? await queryClient
            .fetchQuery({
              queryKey: commonQueryKeys.imageCredits,
              queryFn: () => commonApi.getImageCredits(),
              staleTime: 0,
            })
            .catch(() => null)
        : imageCredits.credits
      if (
        compareCostLines(
          imageEstimate(ids),
          { image: fresh, voice: null },
          providerLabel,
        ).blocking
      ) {
        setErrorKey('library.editor.imageGallery.insufficientCredits')
        return false
      }
      const currentReason = imageRejection(ids)
      if (currentReason) {
        setErrorKey(currentReason)
        return false
      }
      editorTask.setPendingImageProvider(projectId, imageProvider)
      const accepted = await onRegenerateImages(unique)
      if (!accepted) setErrorKey('library.editor.imageGallery.submitFailed')
      return accepted
    } catch {
      setErrorKey('library.editor.imageGallery.submitFailed')
      return false
    } finally {
      submission.current = false
      setSubmitting(false)
    }
  }

  const animate = async (ids: number[]) => {
    if (submission.current) return false
    const unique = [...new Set(ids)]
    const reason = animationRejection(unique)
    if (reason) {
      setErrorKey(reason)
      return false
    }
    submission.current = true
    setSubmitting(true)
    setErrorKey(null)
    try {
      const plan = planFor(unique)
      if ((plan.requestedSeconds ?? 0) > 0) {
        const fresh = commonApi.isNative()
          ? await queryClient
              .fetchQuery({
                queryKey: commonQueryKeys.videoCredits,
                queryFn: () => commonApi.getVideoCredits(),
                staleTime: 0,
              })
              .catch(() => null)
          : videoCredits.credits
        if (
          compareCostLines(
            [animationCostEstimate('kie', plan.requestedSeconds ?? 0)],
            { image: null, voice: null, video: fresh },
            providerLabel,
          ).blocking
        ) {
          setErrorKey('library.editor.imageGallery.insufficientCredits')
          return false
        }
      }
      const currentReason = animationRejection(unique)
      if (currentReason) {
        setErrorKey(currentReason)
        return false
      }
      // Un request conjunto evita superponer parejas y mantiene la cuota del
      // proveedor, recuperación y concurrencia que ya gobierna el sidecar.
      const accepted = await editorTask.startAnimation(
        projectId,
        plan.sceneIds ?? [],
        'kie',
        true,
      )
      if (!accepted) setErrorKey('library.editor.imageGallery.submitFailed')
      return accepted
    } catch {
      setErrorKey('library.editor.imageGallery.submitFailed')
      return false
    } finally {
      submission.current = false
      setSubmitting(false)
    }
  }

  const getAnimationLabel = (id: number): 'animate' | 'redo' | 'resume' => {
    const plan = planFor([id])
    if (plan.canResumeTask) return 'resume'
    if (plan.readyClips?.length) return 'redo'
    return 'animate'
  }

  return {
    task: editorTask.task,
    submitting,
    errorKey,
    regenerate,
    animate,
    getAnimationLabel,
    imageAvailability: (ids: number[]) => availability(imageRejection(ids)),
    animationAvailability: (ids: number[]) =>
      availability(animationRejection(ids)),
  }
}
