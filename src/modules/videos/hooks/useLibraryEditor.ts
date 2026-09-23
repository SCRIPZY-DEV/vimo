import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/modules/common/hooks/useToast'
import { useRequiredApiKeys } from '@/modules/api-keys/hooks/useRequiredApiKeys'
import { videosApi } from '@/modules/videos/api'
import {
  DEFAULT_IMAGE_CHOICE,
  MAX_USER_PROMPT_CHARS,
  videosQueryKeys,
} from '@/modules/videos/constants'
import { useLibraryEditorTask } from '@/modules/videos/hooks/useLibraryEditorTask'
import { useLibraryProjectDetail } from '@/modules/videos/hooks/useLibraryProjectDetail'
import { clampBoundarySeconds } from '@/modules/videos/utilities/clampBoundarySeconds'
import { animationTimingLocked } from '@/modules/videos/utilities/animationTimingLocked'
import { normalizeQuality } from '@/modules/videos/utilities/imageQuality'
import { preferredImageProvider } from '@/modules/videos/utilities/preferredImageProvider'
import type {
  ClipEdge,
  RegenQueueEntry,
  SceneImageChoice,
} from '@/modules/videos/types/library'
import type {
  GalleryImageRequest,
  GallerySceneUpdate,
} from '@/modules/videos/types/galleryActions'
import type { SceneChange } from '@pipeline/types/video-project.ts'
import type {
  SceneDetail,
  VideoProjectDetailResult,
  VideoProjectOptions,
} from '@pipeline/types/video-project.ts'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'
import type { VideoFormat } from '@pipeline/types/video-format.ts'
import type { VideoProviderId } from '@pipeline/types/video-provider.ts'

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

  const gallerySubmission = useRef(false)
  const pendingSceneUpdates = useRef(new Map<string, number>())
  const currentProject = useRef<string | null>(projectId)
  useLayoutEffect(() => {
    currentProject.current = projectId
    return () => {
      currentProject.current = null
    }
  }, [projectId])

  // ── Copia de trabajo ──

  const [workingScenes, setWorkingScenes] = useState<SceneDetail[]>([])
  const [selectedSceneId, setSelectedSceneId] = useState<number | null>(null)
  // La intención de reescribir no desaparece cuando el blur guarda el texto.
  // La clave incluye el proyecto para no transferir ediciones entre rutas.
  const [promptRewrites, setPromptRewrites] = useState<Record<string, string>>(
    {},
  )
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
    mutationFn: ({
      projectId: targetProjectId,
      changes,
    }: GallerySceneUpdate) => {
      return videosApi.updateScenes(targetProjectId, changes)
    },
    onMutate: (variables) => {
      const count = pendingSceneUpdates.current.get(variables.projectId) ?? 0
      pendingSceneUpdates.current.set(variables.projectId, count + 1)
    },
    onError: (error, variables) => {
      // Si el disco no cambió, Query conserva la misma referencia y el
      // resync de render no corre. Revertir las casillas del proyecto que
      // inició la escritura, sin tocar el editor de una ruta posterior.
      if (currentProject.current === variables.projectId) {
        const storedDetail = queryClient.getQueryData<VideoProjectDetailResult>(
          videosQueryKeys.projectDetail(variables.projectId),
        )
        for (const change of variables.changes) {
          if (change.charactersPresent === undefined) continue
          const stored = storedDetail?.scenes.find(
            (scene) => scene.id === change.id,
          )
          patchWorkingScene(change.id, {
            charactersPresent: stored?.charactersPresent ?? [],
          })
        }
      }
      toast({
        description: t(videosApi.errorMessageKey(error)),
        variant: 'destructive',
      })
    },
    onSettled: async (_result, _error, variables) => {
      // La reserva y el panel siguen bloqueados hasta reconciliar con disco,
      // también ante fallo. La ruta de destino viene de la mutación.
      try {
        await queryClient.invalidateQueries({
          queryKey: videosQueryKeys.projectDetail(variables.projectId),
        })
      } finally {
        const count = pendingSceneUpdates.current.get(variables.projectId) ?? 1
        if (count <= 1) pendingSceneUpdates.current.delete(variables.projectId)
        else pendingSceneUpdates.current.set(variables.projectId, count - 1)
      }
    },
  })

  // Persiste por lote vía update-scenes.
  const commitScenes = (changes: SceneChange[]) => {
    if (changes.length === 0 || gallerySubmission.current) return
    commitMutation.mutate({ projectId, changes })
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
        await commitMutation.mutateAsync({ projectId, changes })
      } catch {
        return false
      }
    }
    editorTask.enqueueRegen(projectId, entries)
    return true
  }

  // ── Escena seleccionada ──

  const imageChoice = resolveImageChoice(
    editorTask.task?.pendingImageProvider,
    configuredProviders,
    detail?.metadata.options,
    selectedScene,
  )

  // Guardar una descripción y usarla para rehacer la imagen son decisiones
  // distintas: el blur solo satisface la primera.
  const selectedPromptKey = `${projectId}:${selectedSceneId}`
  const userPromptUnsaved =
    selectedScene !== null &&
    userPromptOf(selectedScene) !== userPromptOf(storedSelectedScene)
  const userPromptDirty =
    userPromptUnsaved || promptRewrites[selectedPromptKey] !== undefined

  // Descripción que el imagePrompt vigente todavía no refleja: el borrador sin
  // guardar, o una ya guardada que el sidecar marca como pendiente. Guardarla
  // no la aplica — recién la próxima regeneración reescribe el prompt.
  const userPromptPending =
    userPromptDirty || storedSelectedScene?.userPromptPending === true

  const patchSelectedUserPrompt = (userPrompt: string) => {
    if (!selectedScene) return
    setPromptRewrites((current) => ({
      ...current,
      [selectedPromptKey]: userPrompt,
    }))
    patchWorkingScene(selectedScene.id, { userPrompt })
  }

  // Blur de la textarea: la descripción sobrevive a salir del editor.
  const commitSelectedUserPrompt = () => {
    if (!selectedScene || !userPromptUnsaved) return
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

  // Con descripción pendiente se reescribe el prompt (guardándola antes si
  // es un borrador); si no, un re-roll con el prompt vigente.
  const regenerateSelected = async () => {
    if (!selectedScene || commitMutation.isPending || gallerySubmission.current)
      return false
    const changes: SceneChange[] = userPromptUnsaved
      ? [{ id: selectedScene.id, userPrompt: userPromptOf(selectedScene) }]
      : []
    const submittedPrompt = promptRewrites[selectedPromptKey]
    const queued = await commitAndRegenerate(changes, [
      { id: selectedScene.id, rewritePrompt: userPromptPending },
    ])
    if (!queued || submittedPrompt === undefined) return queued
    setPromptRewrites((current) => {
      if (current[selectedPromptKey] !== submittedPrompt) return current
      const next = { ...current }
      delete next[selectedPromptKey]
      return next
    })
    return true
  }

  // Galería: un guardado por lote antes de encolar; vacío conserva la
  // descripción guardada. El sidecar aplica cualquier cambio pendiente,
  // incluida una eliminación, antes de decidir si reutiliza el imagePrompt.
  const regenerateGalleryImages = async (requests: GalleryImageRequest[]) => {
    if (
      gallerySubmission.current ||
      (pendingSceneUpdates.current.get(projectId) ?? 0) > 0 ||
      editorTask.isProjectBusy(projectId)
    )
      return false
    const unique = [
      ...new Map(requests.map((entry) => [entry.id, entry])).values(),
    ]
    if (
      unique.length === 0 ||
      unique.some(
        (entry) =>
          !workingScenes.some((scene) => scene.id === entry.id) ||
          entry.description.length > MAX_USER_PROMPT_CHARS,
      )
    )
      return false

    if (!editorTask.beginSceneEdit(projectId)) return false
    gallerySubmission.current = true
    const changes = unique.flatMap((entry) => {
      const userPrompt = entry.description.trim()
      return userPrompt ? [{ id: entry.id, userPrompt }] : []
    })
    const previousPrompts = new Map(
      workingScenes.map((scene) => [scene.id, userPromptOf(scene)]),
    )
    try {
      if (changes.length > 0)
        await commitMutation.mutateAsync({ projectId, changes })
      // Cerrar la galería no cancela la operación. Cambiar de proyecto tampoco
      // debe escribir los borradores en el editor de destino.
      if (currentProject.current === projectId) {
        setWorkingScenes((current) =>
          current.map((scene) => {
            const change = changes.find((entry) => entry.id === scene.id)
            if (
              !change ||
              userPromptOf(scene) !== previousPrompts.get(scene.id)
            )
              return scene
            return { ...scene, userPrompt: change.userPrompt }
          }),
        )
        setPromptRewrites((current) => {
          const next = { ...current }
          for (const change of changes) {
            const key = `${projectId}:${change.id}`
            if (current[key] === previousPrompts.get(change.id))
              delete next[key]
          }
          return next
        })
      }
      editorTask.enqueueRegen(
        projectId,
        unique.map((entry) => ({
          id: entry.id,
          rewritePrompt: entry.description.trim().length > 0,
        })),
      )
      return true
    } catch {
      // La mutación ya muestra el error; los inputs se conservan para reintentar.
      return false
    } finally {
      gallerySubmission.current = false
      editorTask.endSceneEdit(projectId)
    }
  }

  // ── Animación de la escena seleccionada (ADR-0040) ──

  const videoProvider: VideoProviderId = 'kie'

  // Sobre una escena ya animada es «rehacer» (se paga otro clip); sobre una
  // absorbida se rehace el clip de la que encabeza; si no, es un clip nuevo.
  const animateSelected = () => {
    if (!selectedScene) return
    const leadId = selectedScene.absorbedBy ?? selectedScene.id
    void editorTask.startAnimation(projectId, [leadId], videoProvider, true)
  }

  // Reintentar autoriza otro presupuesto solo tras fallos terminales. El
  // backend cosecha siempre primero las tareas existentes aunque force=true.
  const retryAnimation = (sceneIds: number[]) => {
    if (sceneIds.length === 0) return
    void editorTask.startAnimation(projectId, sceneIds, videoProvider, true)
  }

  // ── Fronteras del timeline ──

  // Drag en vivo: mueve end[izq] y start[der] en la copia de trabajo.
  const dragBoundary = (
    leftId: number,
    rightId: number,
    boundarySeconds: number,
  ) => {
    if (
      editorTask.isProjectBusy(projectId) ||
      animationTimingLocked(workingScenes, [leftId, rightId])
    )
      return
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
    if (
      editorTask.isProjectBusy(projectId) ||
      animationTimingLocked(workingScenes, [leftId, rightId])
    )
      return
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
  const timingBusy = editorTask.isProjectBusy(projectId)
  const canEditClipIn =
    selectedIndex > 0 &&
    !timingBusy &&
    !animationTimingLocked(workingScenes, [
      workingScenes[selectedIndex - 1].id,
      workingScenes[selectedIndex].id,
    ])
  const canEditClipOut =
    selectedIndex >= 0 &&
    selectedIndex < workingScenes.length - 1 &&
    !timingBusy &&
    !animationTimingLocked(workingScenes, [
      workingScenes[selectedIndex].id,
      workingScenes[selectedIndex + 1].id,
    ])

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
    userPromptPending,
    patchSelectedUserPrompt,
    commitSelectedUserPrompt,
    changeImageChoice,
    changeCharacters,
    savingChanges: commitMutation.isPending,
    regenerateSelected,
    regenerateGalleryImages,
    videoProvider,
    configuredProviders,
    animateSelected,
    retryAnimation,
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
