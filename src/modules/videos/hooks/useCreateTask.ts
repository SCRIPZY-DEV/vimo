import { useSyncExternalStore } from 'react'
import { videosApi } from '@/modules/videos/api'
import {
  CREATE_ERROR_MESSAGE_KEYS,
  CREATE_TASK_STORAGE_KEY,
  INTERRUPTED_ERROR_KEY,
  LOG_LINES_LIMIT,
  UNKNOWN_CREATE_ERROR_KEY,
} from '@/modules/videos/constants'
import type { PipelineJobHandle } from '@/modules/common/fetcher/pipeline'
import type { CreateTask } from '@/modules/videos/types/create'
import type { PipelineEventPayload } from '@pipeline/runner/events.ts'
import type { StageId } from '@pipeline/runner/stage-id.ts'
import type {
  CreateVideoProjectPayload,
  RunVideoPipelineResult,
} from '@pipeline/types/video-project.ts'

// Store de la tarea de creación, fuera de React (mismo patrón que música y
// voces): el layout desmonta la vista al navegar y el job sigue corriendo,
// así que el listener de eventos y el estado no pueden vivir en el árbol.
let currentTask: CreateTask | null = restoreTask()
let activeJob: PipelineJobHandle | null = null
const subscribers = new Set<() => void>()

function notify() {
  for (const subscriber of subscribers) subscriber()
}

function persistTask(task: CreateTask | null) {
  try {
    if (task === null) {
      localStorage.removeItem(CREATE_TASK_STORAGE_KEY)
      return
    }
    localStorage.setItem(CREATE_TASK_STORAGE_KEY, JSON.stringify(task))
  } catch {
    // Storage lleno o deshabilitado: la tarea sigue viva en memoria.
  }
}

function setTask(task: CreateTask | null) {
  currentTask = task
  persistTask(task)
  notify()
}

// Ignora patches de callbacks viejos si la tarea ya fue reemplazada.
function patchTask(taskId: string, patch: Partial<CreateTask>) {
  if (!currentTask || currentTask.id !== taskId) return
  setTask({ ...currentTask, ...patch })
}

function restoreTask(): CreateTask | null {
  try {
    const raw = localStorage.getItem(CREATE_TASK_STORAGE_KEY)
    if (!raw) return null

    const task = JSON.parse(raw) as CreateTask
    // El job muere con la app; el PROYECTO sobrevive en disco. Una tarea que
    // quedó generando se marca interrumpida (el usuario reanuda con el mismo
    // botón: las fases hechas son cache-hit). La pausa de confirmación y el
    // completado sí sobreviven tal cual.
    if (task.status === 'generating' || task.status === 'creating') {
      return {
        ...task,
        status: 'error',
        stage: null,
        jobId: null,
        errorKey: INTERRUPTED_ERROR_KEY,
      }
    }
    return task
  } catch {
    return null
  }
}

function newTaskId(): string {
  return `tc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function stopActiveJob() {
  activeJob?.stop()
  activeJob = null
}

function errorKeyFor(code: string): string {
  return CREATE_ERROR_MESSAGE_KEYS[code] ?? UNKNOWN_CREATE_ERROR_KEY
}

function appendLog(task: CreateTask, message: string): string[] {
  return [...task.logs, message].slice(-LOG_LINES_LIMIT)
}

// Traduce un evento del sidecar al estado de la tarea.
function handleEvent(taskId: string, event: PipelineEventPayload) {
  const task = currentTask
  if (!task || task.id !== taskId) return

  switch (event.type) {
    case 'stage-started':
      patchTask(taskId, { stage: event.stageId })
      return

    case 'stage-skipped':
    case 'stage-completed':
      patchTask(taskId, {
        completedStages: withStage(task.completedStages, event.stageId),
      })
      return

    case 'log':
      patchTask(taskId, { logs: appendLog(task, event.message) })
      return

    case 'scenes-planned':
      patchTask(taskId, {
        scenes: event.scenes,
        audioDurationSeconds: event.audioDurationSeconds,
      })
      return

    case 'scene-prompt-ready':
      patchTask(taskId, { scenes: mergeScene(task.scenes, event.scene) })
      return

    case 'scene-image-started':
      patchTask(taskId, {
        scenes: patchScene(task.scenes, event.sceneId, {
          imageStatus: 'generating',
        }),
      })
      return

    case 'scene-image-ready':
      patchTask(taskId, {
        scenes: patchScene(task.scenes, event.sceneId, {
          imageStatus: 'ok',
          imagePath: event.imagePath,
        }),
      })
      return

    case 'scene-image-failed':
      patchTask(taskId, {
        scenes: patchScene(task.scenes, event.sceneId, {
          imageStatus: 'error',
        }),
      })
      return

    case 'voice-progress':
      patchTask(taskId, {
        voiceProgress: {
          provider: event.provider,
          totalChars: event.totalChars,
          elapsedSeconds: event.elapsedSeconds,
          percent: event.percent ?? null,
        },
      })
      return

    case 'bgm-progress':
      patchTask(taskId, {
        bgmProgress: {
          percent: event.percent,
          status: event.status,
          elapsedSeconds: event.elapsedSeconds,
        },
      })
      return

    case 'render-progress':
      patchTask(taskId, {
        renderProgress: { percent: event.percent, phase: event.phase },
      })
      return

    case 'awaiting-scene-confirmation':
      patchTask(taskId, {
        confirmation: {
          suggestedScenes: event.suggestedScenes,
          audioDurationSeconds: event.audioDurationSeconds,
          wordCount: event.wordCount,
        },
      })
      return

    case 'job-completed': {
      stopActiveJob()
      const result = event.result as unknown as RunVideoPipelineResult | null
      // Cierre limpio en pausa: NO es un completado (semántica del origen).
      if (result?.status === 'awaiting-confirmation') {
        patchTask(taskId, {
          status: 'awaitingConfirmation',
          jobId: null,
          stage: null,
        })
        return
      }
      patchTask(taskId, {
        status: 'completed',
        jobId: null,
        stage: null,
        videoPath: result?.videoPath ?? null,
      })
      return
    }

    case 'job-failed':
      stopActiveJob()
      patchTask(taskId, {
        status: 'error',
        jobId: null,
        stage: null,
        errorKey: errorKeyFor(event.code),
      })
      return

    default:
      return
  }
}

function withStage(stages: StageId[], stageId: StageId): StageId[] {
  return stages.includes(stageId) ? stages : [...stages, stageId]
}

function mergeScene(
  scenes: CreateTask['scenes'],
  incoming: CreateTask['scenes'][number],
): CreateTask['scenes'] {
  // Merge por id (nunca reemplazo): conserva el estado de imagen ya conocido.
  const index = scenes.findIndex((scene) => scene.id === incoming.id)
  if (index < 0) return [...scenes, incoming].sort((a, b) => a.id - b.id)
  const merged = [...scenes]
  merged[index] = { ...merged[index], ...incoming }
  return merged
}

function patchScene(
  scenes: CreateTask['scenes'],
  sceneId: number,
  patch: Partial<CreateTask['scenes'][number]>,
): CreateTask['scenes'] {
  return scenes.map((scene) =>
    scene.id === sceneId ? { ...scene, ...patch } : scene,
  )
}

function makeTask(
  id: string,
  projectId: string,
  projectName: string,
): CreateTask {
  return {
    id,
    jobId: null,
    projectId,
    projectName,
    status: 'creating',
    stage: null,
    completedStages: [],
    scenes: [],
    audioDurationSeconds: null,
    voiceProgress: null,
    bgmProgress: null,
    renderProgress: null,
    confirmation: null,
    logs: [],
    videoPath: null,
    errorKey: null,
    startedAt: Date.now(),
  }
}

// Lanza el job del pipeline y engancha sus eventos a la tarea.
async function runPipeline(taskId: string, projectId: string): Promise<void> {
  patchTask(taskId, {
    status: 'generating',
    errorKey: null,
    confirmation: null,
  })
  try {
    const job = await videosApi.startPipeline({ projectId }, (event) =>
      handleEvent(taskId, event),
    )
    // El job pudo terminar con eventos encolados antes de llegar acá.
    const task = currentTask
    if (task?.id === taskId && task.status === 'generating') {
      activeJob = job
      patchTask(taskId, { jobId: job.jobId })
      return
    }
    job.stop()
  } catch (error) {
    patchTask(taskId, {
      status: 'error',
      jobId: null,
      errorKey: videosApi.errorMessageKey(error),
    })
  }
}

// Crea el proyecto en disco, sube la narración propia si la hay y arranca el
// pipeline. Un fallo antes de arrancar deja la tarea en error con su clave.
async function startCreation(input: {
  payload: CreateVideoProjectPayload
  narrationFilePath?: string | null
}): Promise<void> {
  stopActiveJob()
  const taskId = newTaskId()
  setTask(makeTask(taskId, '', input.payload.name))

  let projectId: string
  try {
    const project = await videosApi.createProject(input.payload)
    projectId = project.projectId
    patchTask(taskId, { projectId })
  } catch (error) {
    patchTask(taskId, {
      status: 'error',
      errorKey: videosApi.errorMessageKey(error),
    })
    return
  }

  if (input.narrationFilePath) {
    try {
      await videosApi.uploadNarration({
        projectId,
        audioPath: input.narrationFilePath,
      })
    } catch (error) {
      patchTask(taskId, {
        status: 'error',
        errorKey: videosApi.errorMessageKey(error),
      })
      return
    }
  }

  await runPipeline(taskId, projectId)
}

// Confirma la cantidad de escenas y relanza (fases 1-2 son cache-hit).
async function confirmScenes(sceneCount: number): Promise<void> {
  const task = currentTask
  if (!task || task.status !== 'awaitingConfirmation') return

  patchTask(task.id, { status: 'generating', confirmation: null })
  try {
    await videosApi.confirmScenes({ projectId: task.projectId, sceneCount })
  } catch (error) {
    patchTask(task.id, {
      status: 'error',
      errorKey: videosApi.errorMessageKey(error),
    })
    return
  }
  await runPipeline(task.id, task.projectId)
}

// Reanuda tras un error o una cancelación: el proyecto sigue en disco.
async function resume(): Promise<void> {
  const task = currentTask
  if (!task || !task.projectId) return
  await runPipeline(task.id, task.projectId)
}

function cancel() {
  const task = currentTask
  if (!task?.jobId) return
  void videosApi.cancelJob(task.jobId)
}

function discardTask() {
  if (currentTask?.jobId) void videosApi.cancelJob(currentTask.jobId)
  stopActiveJob()
  setTask(null)
}

function subscribe(listener: () => void): () => void {
  subscribers.add(listener)
  return () => {
    subscribers.delete(listener)
  }
}

function getSnapshot(): CreateTask | null {
  return currentTask
}

export function useCreateTask() {
  const task = useSyncExternalStore(subscribe, getSnapshot)

  return { task, startCreation, confirmScenes, resume, cancel, discardTask }
}
