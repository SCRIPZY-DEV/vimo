import { useSyncExternalStore } from 'react'
import { scheduleCreditsRefresh } from '@/modules/common/utilities/creditsRefresh'
import { videosApi } from '@/modules/videos/api'
import {
  hasBusyCreateTask,
  subscribeCreateTask,
} from '@/modules/videos/hooks/useCreateTask'
import type {
  LibraryEditorTask,
  RegenQueueEntry,
} from '@/modules/videos/types/library'
import type { PipelineEventPayload } from '@pipeline/runner/events.ts'
import type {
  ExportClipsResult,
  RegenerateSceneImagesResult,
  RenderVideoResult,
} from '@pipeline/types/video-project.ts'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'

// Store del editor, por proyecto y fuera de React (patrón useCreateTask):
// los jobs de regen/render/export siguen vivos al navegar. SIN localStorage
// — un job muere con la app y al volver el detail refetchea el disco.
//
// Concurrencia (ADR-0014): la cola de regen se coalesce en UN job por
// proyecto; regen ⊻ render ⊻ export ⊻ audio, y todo ⊻ el pipeline completo
// de useCreateTask. El store es el único despachador.
const tasks = new Map<string, LibraryEditorTask>()
const subscribers = new Set<() => void>()

function notify() {
  for (const subscriber of subscribers) subscriber()
}

function emptyTask(projectId: string): LibraryEditorTask {
  return {
    projectId,
    regenQueue: [],
    activeRegen: null,
    pendingImageProvider: null,
    sceneStatus: {},
    sceneErrors: {},
    sceneVersions: {},
    render: null,
    export: null,
    audioBusy: false,
    errorKey: null,
    revision: 0,
  }
}

function taskOf(projectId: string): LibraryEditorTask {
  return tasks.get(projectId) ?? emptyTask(projectId)
}

function patchTask(projectId: string, patch: Partial<LibraryEditorTask>) {
  tasks.set(projectId, { ...taskOf(projectId), ...patch })
  notify()
}

// ¿El proyecto puede aceptar un job nuevo del editor?
function isProjectBusy(projectId: string): boolean {
  const task = taskOf(projectId)
  return (
    task.activeRegen !== null ||
    task.render !== null ||
    task.export !== null ||
    task.audioBusy ||
    hasBusyCreateTask()
  )
}

// ── Regeneración: cola coalescida ──

function enqueueRegen(projectId: string, entries: RegenQueueEntry[]) {
  const task = taskOf(projectId)
  const queue = [...task.regenQueue]
  const sceneStatus = { ...task.sceneStatus }
  const sceneErrors = { ...task.sceneErrors }
  for (const entry of entries) {
    const index = queue.findIndex((queued) => queued.id === entry.id)
    // Coalescing: un pedido de reescritura del prompt nunca se pierde por un
    // segundo click sin descripción nueva.
    if (index >= 0)
      queue[index] = {
        id: entry.id,
        rewritePrompt: queue[index].rewritePrompt || entry.rewritePrompt,
      }
    else queue.push(entry)
    // Spinner inmediato: la escena espera su lote; el error viejo se limpia.
    sceneStatus[entry.id] = 'generating'
    delete sceneErrors[entry.id]
  }
  patchTask(projectId, {
    regenQueue: queue,
    sceneStatus,
    sceneErrors,
    errorKey: null,
  })
  void dispatchRegen(projectId)
}

// La exclusión con el pipeline completo no tiene callback: cuando ese store
// cambia, cualquier cola que quedó esperando vuelve a intentar despachar.
subscribeCreateTask(() => {
  if (hasBusyCreateTask()) return
  for (const task of tasks.values()) {
    if (task.regenQueue.length > 0) void dispatchRegen(task.projectId)
  }
})

function setPendingImageProvider(
  projectId: string,
  provider: ImageProviderId | null,
) {
  patchTask(projectId, { pendingImageProvider: provider })
}

async function dispatchRegen(projectId: string): Promise<void> {
  const task = taskOf(projectId)
  if (task.regenQueue.length === 0 || isProjectBusy(projectId)) return

  const batch = task.regenQueue
  const sceneIds = batch.map((entry) => entry.id)
  patchTask(projectId, {
    regenQueue: [],
    activeRegen: { jobId: null, sceneIds },
  })

  try {
    const job = await videosApi.startRegeneration(
      {
        projectId,
        scenes: batch,
        ...(task.pendingImageProvider
          ? { imageProvider: task.pendingImageProvider }
          : {}),
      },
      (event) => handleRegenEvent(projectId, sceneIds, event),
    )
    const current = taskOf(projectId)
    if (current.activeRegen && current.activeRegen.jobId === null)
      patchTask(projectId, { activeRegen: { jobId: job.jobId, sceneIds } })
    else job.stop()
  } catch (error) {
    finishRegen(projectId, sceneIds, videosApi.errorMessageKey(error))
  }
}

function handleRegenEvent(
  projectId: string,
  sceneIds: number[],
  event: PipelineEventPayload,
) {
  const task = taskOf(projectId)

  switch (event.type) {
    case 'scene-image-started':
      patchTask(projectId, {
        sceneStatus: { ...task.sceneStatus, [event.sceneId]: 'generating' },
      })
      return

    case 'scene-image-ready':
      patchTask(projectId, {
        sceneStatus: { ...task.sceneStatus, [event.sceneId]: 'ok' },
        sceneVersions: { ...task.sceneVersions, [event.sceneId]: Date.now() },
      })
      return

    case 'scene-image-failed':
      patchTask(projectId, {
        sceneStatus: { ...task.sceneStatus, [event.sceneId]: 'error' },
        sceneErrors: {
          ...task.sceneErrors,
          [event.sceneId]: videosApi.errorMessageKey({ code: event.code }),
        },
      })
      return

    case 'job-completed': {
      // El job cierra OK aunque alguna escena no haya salido: `failed` trae
      // las que conservan su imagen vieja.
      const result =
        event.result as unknown as RegenerateSceneImagesResult | null
      const failed = result?.failed ?? []
      finishRegen(
        projectId,
        sceneIds,
        failed.length > 0 ? 'library.editor.regenFailed' : null,
        new Set(failed),
      )
      return
    }

    case 'job-failed':
      finishRegen(
        projectId,
        sceneIds,
        videosApi.errorMessageKey({ code: event.code }),
      )
      return

    default:
      return
  }
}

function finishRegen(
  projectId: string,
  sceneIds: number[],
  errorKey: string | null,
  failedIds: Set<number> = new Set(sceneIds),
) {
  const task = taskOf(projectId)
  const sceneStatus = { ...task.sceneStatus }
  const sceneErrors = { ...task.sceneErrors }
  // Los estados transitorios del lote se limpian; el detail refetcheado
  // cuenta la verdad (una fallida conserva su imagen anterior en disco). El
  // motivo del fallo se conserva por escena hasta el próximo intento.
  for (const sceneId of sceneIds) {
    delete sceneStatus[sceneId]
    if (!failedIds.has(sceneId)) delete sceneErrors[sceneId]
    else sceneErrors[sceneId] ??= errorKey ?? 'create.errors.unknown'
  }
  patchTask(projectId, {
    activeRegen: null,
    sceneStatus,
    sceneErrors,
    errorKey,
    revision: task.revision + 1,
  })
  scheduleCreditsRefresh()
  void dispatchRegen(projectId)
}

// ── Render ──

async function startRender(projectId: string): Promise<boolean> {
  if (isProjectBusy(projectId)) return false

  patchTask(projectId, {
    render: { jobId: null, percent: 0, phase: 'chunks' },
    errorKey: null,
  })
  try {
    const job = await videosApi.startRender({ projectId }, (event) =>
      handleRenderEvent(projectId, event),
    )
    const current = taskOf(projectId)
    if (current.render && current.render.jobId === null)
      patchTask(projectId, { render: { ...current.render, jobId: job.jobId } })
    else job.stop()
  } catch (error) {
    patchTask(projectId, {
      render: null,
      errorKey: videosApi.errorMessageKey(error),
    })
  }
  return true
}

function handleRenderEvent(projectId: string, event: PipelineEventPayload) {
  const task = taskOf(projectId)

  switch (event.type) {
    case 'render-progress':
      if (!task.render) return
      patchTask(projectId, {
        render: { ...task.render, percent: event.percent, phase: event.phase },
      })
      return

    case 'job-completed': {
      patchTask(projectId, { render: null, revision: task.revision + 1 })
      // Como el export de clips: el video recién exportado se muestra en su
      // carpeta, con el archivo seleccionado.
      const result = event.result as unknown as RenderVideoResult | null
      if (result?.videoPath) void videosApi.revealVideo(result.videoPath)
      void dispatchRegen(projectId)
      return
    }

    case 'job-failed':
      patchTask(projectId, {
        render: null,
        errorKey: videosApi.errorMessageKey({ code: event.code }),
        revision: task.revision + 1,
      })
      void dispatchRegen(projectId)
      return

    default:
      return
  }
}

// ── Export de clips ──

async function startExport(projectId: string): Promise<boolean> {
  if (isProjectBusy(projectId)) return false

  patchTask(projectId, {
    export: { jobId: null, percent: 0 },
    errorKey: null,
  })
  try {
    const job = await videosApi.startExportClips({ projectId }, (event) =>
      handleExportEvent(projectId, event),
    )
    const current = taskOf(projectId)
    if (current.export && current.export.jobId === null)
      patchTask(projectId, { export: { ...current.export, jobId: job.jobId } })
    else job.stop()
  } catch (error) {
    patchTask(projectId, {
      export: null,
      errorKey: videosApi.errorMessageKey(error),
    })
  }
  return true
}

function handleExportEvent(projectId: string, event: PipelineEventPayload) {
  const task = taskOf(projectId)

  switch (event.type) {
    case 'progress':
      if (!task.export || event.percent === undefined) return
      patchTask(projectId, {
        export: { ...task.export, percent: event.percent },
      })
      return

    case 'job-completed': {
      patchTask(projectId, { export: null, revision: task.revision + 1 })
      const result = event.result as unknown as ExportClipsResult | null
      // Como el origen: la carpeta exportada se abre sola.
      if (result?.directory) void videosApi.openFolder(result.directory)
      void dispatchRegen(projectId)
      return
    }

    case 'job-failed':
      patchTask(projectId, {
        export: null,
        errorKey: videosApi.errorMessageKey({ code: event.code }),
      })
      void dispatchRegen(projectId)
      return

    default:
      return
  }
}

// ── Audio (replace-narration / set-music): exclusión + revision ──

function beginAudioOperation(projectId: string): boolean {
  if (isProjectBusy(projectId)) return false
  patchTask(projectId, { audioBusy: true, errorKey: null })
  return true
}

function endAudioOperation(projectId: string, errorKey: string | null) {
  const task = taskOf(projectId)
  patchTask(projectId, {
    audioBusy: false,
    errorKey,
    revision: task.revision + 1,
  })
  void dispatchRegen(projectId)
}

function cancelActiveJob(projectId: string) {
  const task = taskOf(projectId)
  const jobId =
    task.activeRegen?.jobId ?? task.render?.jobId ?? task.export?.jobId
  if (jobId) void videosApi.cancelJob(jobId)
}

function clearError(projectId: string) {
  patchTask(projectId, { errorKey: null })
}

function subscribe(listener: () => void): () => void {
  subscribers.add(listener)
  return () => {
    subscribers.delete(listener)
  }
}

export function useLibraryEditorTask(projectId: string) {
  const task = useSyncExternalStore(
    subscribe,
    () => tasks.get(projectId) ?? null,
  )

  return {
    task,
    enqueueRegen,
    setPendingImageProvider,
    startRender,
    startExport,
    beginAudioOperation,
    endAudioOperation,
    cancelActiveJob,
    clearError,
    isProjectBusy,
  }
}
