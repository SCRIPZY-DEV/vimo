import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/modules/common/hooks/useToast'
import { useRequiredApiKeys } from '@/modules/api-keys/hooks/useRequiredApiKeys'
import { videosApi } from '@/modules/videos/api'
import {
  DEFAULT_IMAGE_CHOICE,
  videosQueryKeys,
} from '@/modules/videos/constants'
import { useLibraryEditorTask } from '@/modules/videos/hooks/useLibraryEditorTask'
import { useLibraryProjectDetail } from '@/modules/videos/hooks/useLibraryProjectDetail'
import { clampBoundarySeconds } from '@/modules/videos/utilities/clampBoundarySeconds'
import { normalizeQuality } from '@/modules/videos/utilities/imageQuality'
import { preferredImageProvider } from '@/modules/videos/utilities/preferredImageProvider'
import type {
  ClipEdge,
  RegenQueueEntry,
  SceneImageChoice,
} from '@/modules/videos/types/library'
import type { SceneChange } from '@pipeline/types/video-project.ts'
import type {
  SceneDetail,
  VideoProjectOptions,
} from '@pipeline/types/video-project.ts'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'
import type { VideoFormat } from '@pipeline/types/video-format.ts'

// Núcleo del editor: el detail del disco + una copia de trabajo local de las
// escenas (drag del timeline y textareas editan la copia; el commit persiste
// por lote vía update-scenes) + el store de jobs del proyecto.
export function useLibraryEditor(projectId: string) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { detail, isLoading, errorKey } = useLibraryProjectDetail(projectId)
  const editorTask = useLibraryEditorTask(projectId)
  const { configuredProviders } = useRequiredApiKeys()

  // ── Copia de trabajo ──

  const [workingScenes, setWorkingScenes] = useState<SceneDetail[]>([])
  const [selectedSceneId, setSelectedSceneId] = useState<number | null>(null)
  const [syncedScenes, setSyncedScenes] = useState<SceneDetail[] | undefined>(
    undefined,
  )

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
    onError: (error, changes) => {
      // Si el disco no cambió, Query conserva la misma referencia y el
      // resync de render no corre. Revertir explícitamente las casillas.
      for (const change of changes) {
        if (change.charactersPresent === undefined) continue
        const stored = detail?.scenes.find((scene) => scene.id === change.id)
        patchWorkingScene(change.id, {
          charactersPresent: stored?.charactersPresent ?? [],
        })
      }
      toast({
        description: t(videosApi.errorMessageKey(error)),
        variant: 'destructive',
      })
    },
    onSettled: () => {
      // El panel se libera con la selección confirmada por disco, también
      // ante fallo: no hay una ventana clickeable con el optimista viejo.
      return queryClient.invalidateQueries({
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
    configuredProviders,
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
    if (commitMutation.isPending) return
    updateSelectedScene({ charactersPresent })
  }

  // Con descripción sin guardar, se guarda y se reescribe el prompt;
  // si no, un re-roll con el prompt vigente.
  const regenerateSelected = () => {
    if (!selectedScene || commitMutation.isPending) return
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
  }

  // Al soltar: persiste el par tocado en un solo batch, solo los campos que
  // cambiaron. Recibe la frontera final en vez de leerla del estado: el
  // mouseup del timeline corre en un listener registrado al iniciar el drag,
  // o sea con la clausura de ESE render, donde cualquier estado que el drag
  // haya cambiado se ve viejo. Así se perdía el commit: las duraciones
  // vivían solo en la copia local y el primer refetch las pisaba.
  const commitBoundary = (
    leftId: number,
    rightId: number,
    boundarySeconds: number,
  ) => {
    commitScenes([
      { id: leftId, endSeconds: boundarySeconds },
      { id: rightId, startSeconds: boundarySeconds },
    ])
  }

  // ── In/Out tipeados en el panel ──

  // Solo las fronteras compartidas se mueven: la escena seleccionada tiene
  // In editable si hay una anterior y Out editable si hay una siguiente.
  const selectedIndex = workingScenes.findIndex(
    (scene) => scene.id === selectedSceneId,
  )
  const canEditClipIn = selectedIndex > 0
  const canEditClipOut =
    selectedIndex >= 0 && selectedIndex < workingScenes.length - 1

  // Mueve la frontera del lado pedido de la escena seleccionada, acotada
  // como el drag del timeline, y la persiste por el mismo camino.
  const moveSelectedClipEdge = (edge: ClipEdge, seconds: number) => {
    const editable = edge === 'in' ? canEditClipIn : canEditClipOut
    if (!editable) return

    const scene = workingScenes[selectedIndex]
    const neighbor =
      workingScenes[edge === 'in' ? selectedIndex - 1 : selectedIndex + 1]
    const left = edge === 'in' ? neighbor : scene
    const right = edge === 'in' ? scene : neighbor
    const boundary = clampBoundarySeconds(left, right, seconds)
    if (boundary === left.endSeconds) return

    dragBoundary(left.id, right.id, boundary)
    commitBoundary(left.id, right.id, boundary)
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
    savingChanges: commitMutation.isPending,
    regenerateSelected,
    dragBoundary,
    commitBoundary,
    canEditClipIn,
    canEditClipOut,
    moveSelectedClipEdge,
    editorTask,
  }
}

// Proveedor y calidad con que se regenera la escena seleccionada, por
// prioridad: override pendiente del editor → el proveedor con clave
// configurada (Evolink si están las dos) → opciones del proyecto → default.
// La calidad sale de la escena si la tiene (ADR-0014).
function resolveImageChoice(
  pendingProvider: ImageProviderId | null | undefined,
  configuredProviders: ReadonlySet<string>,
  options: VideoProjectOptions | undefined,
  scene: SceneDetail | null,
): SceneImageChoice {
  const provider = resolveImageProvider(
    pendingProvider,
    configuredProviders,
    options,
  )
  const format = options?.videoFormat ?? '16:9'
  return {
    provider,
    quality: resolveImageQuality(provider, format, options, scene),
  }
}

function resolveImageProvider(
  pendingProvider: ImageProviderId | null | undefined,
  configuredProviders: ReadonlySet<string>,
  options: VideoProjectOptions | undefined,
): ImageProviderId {
  if (pendingProvider) return pendingProvider

  const preferred = preferredImageProvider(configuredProviders)
  if (preferred) return preferred

  if (options) return options.imageProvider
  return DEFAULT_IMAGE_CHOICE.provider
}

function resolveImageQuality(
  provider: ImageProviderId,
  format: VideoFormat,
  options: VideoProjectOptions | undefined,
  scene: SceneDetail | null,
): string {
  if (scene?.imageQuality)
    return normalizeQuality(provider, scene.imageQuality, format)
  if (options?.imageQuality)
    return normalizeQuality(provider, options.imageQuality, format)
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
