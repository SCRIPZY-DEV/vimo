import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/modules/common/hooks/useToast'
import { videosApi } from '@/modules/videos/api'
import {
  DEFAULT_IMAGE_CHOICE,
  videosQueryKeys,
} from '@/modules/videos/constants'
import { useLibraryEditorTask } from '@/modules/videos/hooks/useLibraryEditorTask'
import { useLibraryProjectDetail } from '@/modules/videos/hooks/useLibraryProjectDetail'
import { normalizeQuality } from '@/modules/videos/utilities/imageQuality'
import type {
  RegenQueueEntry,
  SceneImageChoice,
} from '@/modules/videos/types/library'
import type { SceneChange } from '@pipeline/types/video-project.ts'
import type {
  SceneDetail,
  VideoProjectOptions,
} from '@pipeline/types/video-project.ts'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'

// Núcleo del editor: el detail del disco + una copia de trabajo local de las
// escenas (drag del timeline y textareas editan la copia; el commit persiste
// por lote vía update-scenes) + el store de jobs del proyecto.
export function useLibraryEditor(projectId: string) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { detail, isLoading, errorKey } = useLibraryProjectDetail(projectId)
  const editorTask = useLibraryEditorTask(projectId)

  // ── Copia de trabajo ──

  const [workingScenes, setWorkingScenes] = useState<SceneDetail[]>([])
  const [selectedSceneId, setSelectedSceneId] = useState<number | null>(null)
  const [syncedScenes, setSyncedScenes] = useState<SceneDetail[] | undefined>(
    undefined,
  )
  // Par de escenas cuya frontera se está arrastrando en el timeline.
  const [draggedBoundary, setDraggedBoundary] = useState<
    [number, number] | null
  >(null)

  // Resync de la copia de trabajo con cada refetch (ajuste durante el
  // render, no en un efecto): el disco es la verdad tras cada job — salvo
  // la descripción que el usuario está tipeando, que se conserva hasta que
  // él mismo la guarde (si no, cambiar la calidad o cerrar un job la
  // borraría y «Regenerar» haría un re-roll del prompt viejo sin avisar).
  // En la primera carga se selecciona la primera escena para que el editor
  // no abra vacío; en los refetches posteriores se respeta la selección del
  // usuario (incluida la deselección con Esc).
  const detailScenes = detail?.scenes
  if (detailScenes && detailScenes !== syncedScenes) {
    const isFirstLoad = syncedScenes === undefined
    setSyncedScenes(detailScenes)
    setWorkingScenes(
      keepUserPromptDrafts(syncedScenes, workingScenes, detailScenes),
    )
    if (isFirstLoad) setSelectedSceneId(detailScenes[0]?.id ?? null)
  }

  const selectedScene =
    workingScenes.find((scene) => scene.id === selectedSceneId) ?? null
  const storedSelectedScene = detail?.scenes.find(
    (scene) => scene.id === selectedSceneId,
  )

  const patchWorkingScene = (sceneId: number, patch: Partial<SceneDetail>) => {
    setWorkingScenes((scenes) =>
      scenes.map((scene) =>
        scene.id === sceneId ? { ...scene, ...patch } : scene,
      ),
    )
  }

  // ── Persistencia ──

  // Cada job cerrado (regen/render/export/audio) sube `revision`: lo leído
  // del disco quedó viejo.
  const revision = editorTask.task?.revision ?? 0
  useEffect(() => {
    if (revision === 0) return
    void queryClient.invalidateQueries({
      queryKey: videosQueryKeys.projectDetail(projectId),
    })
    void queryClient.invalidateQueries({ queryKey: videosQueryKeys.projects })
  }, [revision, projectId, queryClient])

  const commitMutation = useMutation({
    mutationFn: (changes: SceneChange[]) => {
      return videosApi.updateScenes(projectId, changes)
    },
    onError: (error) => {
      toast({
        description: t(videosApi.errorMessageKey(error)),
        variant: 'destructive',
      })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: videosQueryKeys.projectDetail(projectId),
      })
    },
  })

  // Persiste por lote vía update-scenes.
  const commitScenes = (changes: SceneChange[]) => {
    if (changes.length === 0) return
    commitMutation.mutate(changes)
  }

  // Aplica a la copia de trabajo y persiste el mismo cambio.
  const updateSelectedScene = (patch: Omit<SceneChange, 'id'>) => {
    if (!selectedScene) return
    patchWorkingScene(selectedScene.id, patch)
    commitScenes([{ id: selectedScene.id, ...patch }])
  }

  // Si el guardado falla no se encola: el job reescribiría el prompt desde
  // el userPrompt viejo (el toast del onError ya avisó).
  const commitAndRegenerate = async (
    changes: SceneChange[],
    entries: RegenQueueEntry[],
  ) => {
    if (changes.length > 0) {
      try {
        await commitMutation.mutateAsync(changes)
      } catch {
        return
      }
    }
    editorTask.enqueueRegen(projectId, entries)
  }

  // ── Escena seleccionada ──

  const imageChoice = resolveImageChoice(
    editorTask.task?.pendingImageProvider,
    detail?.metadata.options,
    selectedScene,
  )

  // Descripción editada y todavía no guardada en disco.
  const userPromptDirty =
    selectedScene !== null &&
    userPromptOf(selectedScene) !== userPromptOf(storedSelectedScene)

  const patchSelectedUserPrompt = (userPrompt: string) => {
    if (selectedScene) patchWorkingScene(selectedScene.id, { userPrompt })
  }

  // Blur de la textarea: la descripción sobrevive a salir del editor.
  const commitSelectedUserPrompt = () => {
    if (!selectedScene || !userPromptDirty) return
    commitScenes([
      { id: selectedScene.id, userPrompt: userPromptOf(selectedScene) },
    ])
  }

  // La calidad persiste en la escena; el proveedor es un override
  // transitorio del próximo lote de regeneración (ADR-0014).
  const changeImageChoice = (choice: SceneImageChoice) => {
    editorTask.setPendingImageProvider(projectId, choice.provider)
    updateSelectedScene({ imageQuality: choice.quality })
  }

  const changeCharacters = (charactersPresent: number[]) => {
    updateSelectedScene({ charactersPresent })
  }

  // Con descripción sin guardar, se guarda y se reescribe el prompt;
  // si no, un re-roll con el prompt vigente.
  const regenerateSelected = () => {
    if (!selectedScene) return
    const changes: SceneChange[] = userPromptDirty
      ? [{ id: selectedScene.id, userPrompt: userPromptOf(selectedScene) }]
      : []
    void commitAndRegenerate(changes, [
      { id: selectedScene.id, rewritePrompt: userPromptDirty },
    ])
  }

  // ── Fronteras del timeline ──

  // Drag en vivo: mueve end[izq] y start[der] en la copia de trabajo.
  const dragBoundary = (
    leftId: number,
    rightId: number,
    boundarySeconds: number,
  ) => {
    patchWorkingScene(leftId, { endSeconds: boundarySeconds })
    patchWorkingScene(rightId, { startSeconds: boundarySeconds })
    setDraggedBoundary([leftId, rightId])
  }

  // Al soltar: persiste el par tocado en un solo batch.
  const commitBoundary = () => {
    if (!draggedBoundary) return
    const [leftId, rightId] = draggedBoundary
    setDraggedBoundary(null)
    const left = workingScenes.find((scene) => scene.id === leftId)
    const right = workingScenes.find((scene) => scene.id === rightId)
    if (!left || !right) return
    commitScenes([
      {
        id: leftId,
        startSeconds: left.startSeconds,
        endSeconds: left.endSeconds,
      },
      {
        id: rightId,
        startSeconds: right.startSeconds,
        endSeconds: right.endSeconds,
      },
    ])
  }

  return {
    detail,
    isLoading,
    errorKey,
    workingScenes,
    selectedScene,
    selectedSceneId,
    setSelectedSceneId,
    imageChoice,
    userPromptDirty,
    patchSelectedUserPrompt,
    commitSelectedUserPrompt,
    changeImageChoice,
    changeCharacters,
    regenerateSelected,
    dragBoundary,
    commitBoundary,
    editorTask,
  }
}

// Proveedor y calidad con que se regenera la escena seleccionada, por
// prioridad: override pendiente del editor → opciones del proyecto → default.
// La calidad sale de la escena si la tiene (ADR-0014).
function resolveImageChoice(
  pendingProvider: ImageProviderId | null | undefined,
  options: VideoProjectOptions | undefined,
  scene: SceneDetail | null,
): SceneImageChoice {
  const provider = resolveImageProvider(pendingProvider, options)
  return { provider, quality: resolveImageQuality(provider, options, scene) }
}

function resolveImageProvider(
  pendingProvider: ImageProviderId | null | undefined,
  options: VideoProjectOptions | undefined,
): ImageProviderId {
  if (pendingProvider) return pendingProvider
  if (options) return options.imageProvider
  return DEFAULT_IMAGE_CHOICE.provider
}

function resolveImageQuality(
  provider: ImageProviderId,
  options: VideoProjectOptions | undefined,
  scene: SceneDetail | null,
): string {
  if (scene?.imageQuality) return normalizeQuality(provider, scene.imageQuality)
  if (options?.imageQuality)
    return normalizeQuality(provider, options.imageQuality)
  return DEFAULT_IMAGE_CHOICE.quality
}

function userPromptOf(scene: SceneDetail | undefined): string {
  return scene?.userPrompt ?? ''
}

// Conserva los borradores de `userPrompt`: una escena cuyo texto local
// difiere del último sync tiene una edición sin guardar, y esa gana sobre lo
// que trajo el disco.
function keepUserPromptDrafts(
  previousSynced: SceneDetail[] | undefined,
  previousWorking: SceneDetail[],
  next: SceneDetail[],
): SceneDetail[] {
  if (!previousSynced) return next
  return next.map((scene) => {
    const synced = previousSynced.find((item) => item.id === scene.id)
    const working = previousWorking.find((item) => item.id === scene.id)
    if (!synced || !working) return scene
    const draft = userPromptOf(working)
    if (draft === userPromptOf(synced)) return scene
    if (draft.length > 0) return { ...scene, userPrompt: draft }
    const cleared = { ...scene }
    delete cleared.userPrompt
    return cleared
  })
}
