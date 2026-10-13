import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { normalizeFlowExecutionPlan } from '@/modules/common/utilities/flowExecutionPlan'
import type { FlowToolsExecutionPlan } from '@pipeline/types/flow-execution-plan.ts'
import { FLOW_RESULT_RECOVERY_KEYS } from '@/modules/common/constants'
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
import { galleryAnimationPlan } from '@/modules/videos/utilities/galleryAnimationPlan'
import {
  animationUndoPending,
  hasPendingAnimationSource,
  undoableAnimationClips,
} from '@/modules/videos/utilities/animationUndo'
import { normalizeQuality } from '@/modules/videos/utilities/imageQuality'
import { preferredImageProvider } from '@/modules/videos/utilities/preferredImageProvider'
import type {
  ClipEdge,
  FlowRegenerationIntent,
  RegenQueueEntry,
  SceneImageChoice,
} from '@/modules/videos/types/library'
import type {
  GalleryImageRequest,
  GallerySceneUpdate,
  UndoGalleryAnimation,
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
  const [flowSelection, setFlowSelection] = useState({
    projectId,
    sceneIds: [] as number[],
  })
  const selectedFlowSceneIds =
    flowSelection.projectId === projectId
      ? flowSelection.sceneIds.filter((id) =>
          workingScenes.some((scene) => scene.id === id),
        )
      : []
  const [syncedProjectId, setSyncedProjectId] = useState(projectId)
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
    const isFirstLoad =
      syncedScenes === undefined || syncedProjectId !== projectId
    setSyncedProjectId(projectId)
    setSyncedScenes(detailScenes)
    if (flowSelection.projectId === projectId) {
      const missingSelection = flowSelection.sceneIds.filter((id) =>
        detailScenes.some((scene) => scene.id === id),
      )
      if (missingSelection.length !== flowSelection.sceneIds.length)
        setFlowSelection({ projectId, sceneIds: missingSelection })
    }
    setWorkingScenes(
      keepSceneDrafts(
        isFirstLoad ? undefined : syncedScenes,
        workingScenes,
        detailScenes,
      ),
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

  // La reserva compartida impide iniciar render/animación mientras se restaura
  // una pareja. La mutación identifica su proyecto aunque cambie la ruta.
  const undoMutation = useMutation({
    mutationFn: ({
      projectId: targetProjectId,
      sceneId,
    }: UndoGalleryAnimation) => {
      return videosApi.undoAnimation(targetProjectId, sceneId)
    },
    onError: (error) => {
      toast({
        description: t(videosApi.errorMessageKey(error)),
        variant: 'destructive',
      })
    },
    onSettled: async (_result, _error, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: videosQueryKeys.projectDetail(variables.projectId),
        }),
        queryClient.invalidateQueries({ queryKey: videosQueryKeys.projects }),
      ])
    },
  })
  const readyClips = undoableAnimationClips(workingScenes)
  const hasReadyAnimation = (sceneIds: number[]) =>
    readyClips.some((clip) => clip.sceneIds.some((id) => sceneIds.includes(id)))
  const selectedAnimationSceneCount = new Set(
    readyClips
      .filter((clip) => clip.sceneIds.includes(selectedSceneId ?? -1))
      .flatMap((clip) => clip.sceneIds),
  ).size
  const selectedAnimationUndoPending =
    selectedSceneId !== null &&
    animationUndoPending(workingScenes, selectedSceneId)
  const undoingSceneId =
    undoMutation.isPending && undoMutation.variables?.projectId === projectId
      ? undoMutation.variables.sceneId
      : null

  const undoAnimation = async (sceneId: number) => {
    if (
      undoMutation.isPending ||
      gallerySubmission.current ||
      (pendingSceneUpdates.current.get(projectId) ?? 0) > 0 ||
      !hasReadyAnimation([sceneId]) ||
      animationUndoPending(workingScenes, sceneId) ||
      !editorTask.beginSceneEdit(projectId)
    )
      return false
    try {
      const result = await undoMutation.mutateAsync({ projectId, sceneId })
      editorTask.clearRestoredAnimations(projectId, result.restored)
      return true
    } catch {
      return false
    } finally {
      editorTask.endSceneEdit(projectId)
    }
  }

  // Persiste por lote vía update-scenes.
  const commitScenes = (changes: SceneChange[]) => {
    if (
      changes.length === 0 ||
      gallerySubmission.current ||
      editorTask.isProjectBusy(projectId)
    )
      return
    commitMutation.mutate({ projectId, changes })
  }

  // Aplica a la copia de trabajo y persiste el mismo cambio.
  const updateSelectedScene = (patch: Omit<SceneChange, 'id'>) => {
    if (!selectedScene) return
    patchWorkingScene(selectedScene.id, patch)
    commitScenes([{ id: selectedScene.id, ...patch }])
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

  // Un clic identifica la operación completa; el coordinador conserva los IDs
  // de una operación incierta aunque la UI se remonte. La cola captura proveedor
  // y borradores; los guarda cuando le toca, sin competir con el lote activo.
  const regenerationSceneIds =
    imageChoice.provider === 'flow' && selectedFlowSceneIds.length > 0
      ? selectedFlowSceneIds
      : selectedScene
        ? [selectedScene.id]
        : []
  const occupiedSceneIds = new Set([
    ...(editorTask.task?.activeRegen?.sceneIds ?? []),
    ...(editorTask.task?.regenQueue.map((entry) => entry.id) ?? []),
    ...(editorTask.task?.animation?.sceneIds ?? []),
  ])
  const toggleFlowScene = (sceneId: number) => {
    if (occupiedSceneIds.has(sceneId)) return
    const latest = queryClient.getQueryData<VideoProjectDetailResult>(
      videosQueryKeys.projectDetail(projectId),
    )
    if (!latest?.scenes.some((scene) => scene.id === sceneId)) return
    setFlowSelection({
      projectId,
      sceneIds: selectedFlowSceneIds.includes(sceneId)
        ? selectedFlowSceneIds.filter((id) => id !== sceneId)
        : [...selectedFlowSceneIds, sceneId],
    })
  }
  const clearFlowSelection = () => setFlowSelection({ projectId, sceneIds: [] })
  const flowRequests = useRef(new Map<string, FlowRegenerationIntent>())
  const flowIntentFor = (
    sceneIds: number[],
    executionPlan?: FlowToolsExecutionPlan,
    imageProvider = imageChoice.provider,
  ): FlowRegenerationIntent => {
    if (imageProvider !== 'flow') return {}
    const scope = JSON.stringify([
      projectId,
      ...sceneIds.slice().sort((left, right) => left - right),
    ])
    const recovering = sceneIds.some(
      (id) =>
        editorTask.task?.sceneStatus[id] === 'awaiting_sync' ||
        FLOW_RESULT_RECOVERY_KEYS.has(editorTask.task?.sceneErrors[id] ?? ''),
    )
    const previous = recovering ? flowRequests.current.get(scope) : undefined
    if (previous) return { ...previous, flowRecoverOnly: true }

    // Una recuperación sin memoria local se resuelve por el recibo durable;
    // nunca adopta la preferencia elegida para una generación nueva.
    const plan = recovering
      ? undefined
      : normalizeFlowExecutionPlan(executionPlan)
    const intent = {
      flowRegenerationRequestId: crypto.randomUUID(),
      ...(recovering ? { flowRecoverOnly: true } : {}),
      ...(plan ? { executionPlan: plan } : {}),
    }
    flowRequests.current.set(scope, intent)
    return intent
  }
  const regenerateSelected = async (executionPlan?: FlowToolsExecutionPlan) => {
    if (
      currentProject.current !== projectId ||
      commitMutation.isPending ||
      gallerySubmission.current ||
      undoMutation.isPending ||
      regenerationSceneIds.length === 0
    )
      return false
    // Revalidar tras el precheck asíncrono sin convertir una selección múltiple
    // ya recuperada en un nuevo pedido sobre la escena abierta.
    const latest = queryClient.getQueryData<VideoProjectDetailResult>(
      videosQueryKeys.projectDetail(projectId),
    )
    const requestedSceneIds =
      imageChoice.provider === 'flow' && selectedFlowSceneIds.length > 0
        ? selectedFlowSceneIds.filter((id) =>
            latest?.scenes.some((scene) => scene.id === id),
          )
        : regenerationSceneIds
    if (
      requestedSceneIds.length === 0 ||
      requestedSceneIds.some((id) => occupiedSceneIds.has(id)) ||
      hasReadyAnimation(requestedSceneIds) ||
      hasPendingAnimationSource(workingScenes, requestedSceneIds)
    )
      return false
    const flowIntent = flowIntentFor(requestedSceneIds, executionPlan)
    const entries: RegenQueueEntry[] = workingScenes
      .filter((scene) => requestedSceneIds.includes(scene.id))
      .map((scene) => {
        const stored = detail?.scenes.find((item) => item.id === scene.id)
        const dirty = userPromptOf(scene) !== userPromptOf(stored)
        return {
          id: scene.id,
          rewritePrompt:
            dirty ||
            promptRewrites[`${projectId}:${scene.id}`] !== undefined ||
            stored?.userPromptPending === true,
          imageProvider: imageChoice.provider,
          imageQuality: imageChoice.quality,
          charactersPresent: scene.charactersPresent,
          ...flowIntent,
          ...(dirty ? { userPrompt: userPromptOf(scene) } : {}),
        }
      })
    if (!editorTask.enqueueRegen(projectId, entries)) return false
    setPromptRewrites((current) => {
      const next = { ...current }
      for (const id of requestedSceneIds) {
        const key = `${projectId}:${id}`
        if (next[key] === promptRewrites[key]) delete next[key]
      }
      return next
    })
    clearFlowSelection()
    return true
  }

  // La galería entrega la intención al store: persiste las descripciones cuando
  // obtiene turno, incluso si el modal se cierra o cambia la ruta del editor.
  const regenerateGalleryImages = async (
    requests: GalleryImageRequest[],
    executionPlan?: FlowToolsExecutionPlan,
    imageProvider = imageChoice.provider,
  ) => {
    if (
      gallerySubmission.current ||
      (pendingSceneUpdates.current.get(projectId) ?? 0) > 0
    )
      return false
    const unique = [
      ...new Map(requests.map((entry) => [entry.id, entry])).values(),
    ]
    if (
      unique.length === 0 ||
      hasReadyAnimation(unique.map((entry) => entry.id)) ||
      hasPendingAnimationSource(
        workingScenes,
        unique.map((entry) => entry.id),
      ) ||
      unique.some(
        (entry) =>
          !workingScenes.some((scene) => scene.id === entry.id) ||
          entry.description.length > MAX_USER_PROMPT_CHARS,
      )
    )
      return false
    const flowIntent = flowIntentFor(
      unique.map((entry) => entry.id),
      executionPlan,
      imageProvider,
    )
    const accepted = editorTask.enqueueRegen(
      projectId,
      unique.map((entry) => {
        const description = entry.description.trim()
        const scene = workingScenes.find(
          (candidate) => candidate.id === entry.id,
        )!
        return {
          id: entry.id,
          imageProvider,
          imageQuality: resolveImageQuality(
            imageProvider,
            detail?.metadata.options.videoFormat ?? '16:9',
            detail?.metadata.options,
            scene,
          ),
          charactersPresent: scene.charactersPresent,
          ...flowIntent,
          rewritePrompt: description.length > 0,
          ...(description ? { userPrompt: description } : {}),
        }
      }),
    )
    if (!accepted) return false
    // La descripción explícita de la galería sustituye el borrador anterior
    // del panel. Sigue siendo un borrador hasta que el store confirme el disco.
    const descriptions = new Map(
      unique
        .filter((entry) => entry.description.trim())
        .map((entry) => [entry.id, entry.description.trim()]),
    )
    const previousPrompts = new Map(
      workingScenes.map((scene) => [scene.id, userPromptOf(scene)]),
    )
    setWorkingScenes((current) =>
      current.map((scene) => {
        const description = descriptions.get(scene.id)
        if (
          description === undefined ||
          userPromptOf(scene) !== previousPrompts.get(scene.id)
        )
          return scene
        return { ...scene, userPrompt: description }
      }),
    )
    setPromptRewrites((current) => {
      const next = { ...current }
      for (const id of descriptions.keys()) {
        const key = `${projectId}:${id}`
        if (next[key] === previousPrompts.get(id)) delete next[key]
      }
      return next
    })
    return true
  }

  // ── Animación de la escena seleccionada (ADR-0047) ──

  const videoProvider: VideoProviderId = 'kie'

  // Sobre una escena ya animada es «rehacer» (se paga otro clip); sobre una
  // absorbida se rehace el clip de la que encabeza; si no, es un clip nuevo.
  const animateSelected = () => {
    if (!selectedScene) return
    retryAnimation([selectedScene.id])
  }

  // Reintentar autoriza otro presupuesto solo tras fallos terminales. El
  // backend cosecha siempre primero las tareas existentes aunque force=true.
  const retryAnimation = (sceneIds: number[]) => {
    if (sceneIds.length === 0) return
    const plan = galleryAnimationPlan(workingScenes, sceneIds, {
      videoFormat: detail?.metadata.options.videoFormat ?? '16:9',
      durationSeconds: detail?.metadata.audioDurationSeconds,
    })
    if (plan.rejection || plan.sceneIds.length === 0) return
    void editorTask.startAnimation(
      projectId,
      plan.sceneIds,
      videoProvider,
      true,
    )
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
    savingChanges: commitMutation.isPending || undoMutation.isPending,
    undoAnimation,
    undoingSceneId,
    selectedAnimationSceneCount,
    selectedAnimationUndoPending,
    regenerateSelected,
    regenerateGalleryImages,
    regenerationSceneIds,
    selectedFlowSceneIds,
    occupiedSceneIds,
    toggleFlowScene,
    clearFlowSelection,
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
  if (options?.imageProvider === 'flow') return 'flow'

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

// Un refetch de otra escena no descarta la descripción, calidad o personajes
// elegidos mientras el proyecto tenía trabajos activos. Cuando disco confirma
// esos mismos valores dejan de diferir del baseline y la siguiente lectura manda.
function keepSceneDrafts(
  previousSynced: SceneDetail[] | undefined,
  previousWorking: SceneDetail[],
  next: SceneDetail[],
): SceneDetail[] {
  if (!previousSynced) return next
  return next.map((scene) => {
    const synced = previousSynced.find((item) => item.id === scene.id)
    const working = previousWorking.find((item) => item.id === scene.id)
    if (!synced || !working) return scene
    const merged = { ...scene }
    const draft = userPromptOf(working)
    if (draft !== userPromptOf(synced)) {
      if (draft.length > 0) merged.userPrompt = draft
      else delete merged.userPrompt
    }
    if (working.imageQuality !== synced.imageQuality)
      merged.imageQuality = working.imageQuality
    if (
      JSON.stringify(working.charactersPresent ?? []) !==
      JSON.stringify(synced.charactersPresent ?? [])
    )
      merged.charactersPresent = working.charactersPresent
    return merged
  })
}
