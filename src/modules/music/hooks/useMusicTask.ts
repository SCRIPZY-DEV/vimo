import { useSyncExternalStore } from 'react'
import { musicApi } from '@/modules/music/api'
import {
  COOLDOWN_ERROR_KEY,
  GENERATION_COOLDOWN_MS,
  INTERRUPTED_ERROR_KEY,
  MUSIC_ERROR_MESSAGE_KEYS,
  MUSIC_TASK_STORAGE_KEY,
  UNKNOWN_MUSIC_ERROR_KEY,
} from '@/modules/music/constants'
import type { PipelineJobHandle } from '@/modules/common/fetcher/pipeline'
import type { MusicTask } from '@/modules/music/types/music'
import type { PipelineEventPayload } from '@pipeline/runner/events.ts'
import type {
  MusicGenerationParams,
  MusicGenerationResult,
  MusicOption,
  MusicProgressDetail,
} from '@pipeline/types/music.ts'

/**
 * Store de la tarea de música, fuera de React (mismo patrón que useToast):
 * el layout desmonta la vista al navegar y el job sigue corriendo, así que el
 * listener de eventos y el estado no pueden vivir en el árbol de la vista.
 */
let currentTask: MusicTask | null = restoreTask()
let lastGenerationAt = 0
let activeJob: PipelineJobHandle | null = null
const subscribers = new Set<() => void>()

function notify() {
  for (const subscriber of subscribers) subscriber()
}

function persistTask(task: MusicTask | null) {
  try {
    if (task === null) {
      localStorage.removeItem(MUSIC_TASK_STORAGE_KEY)
      return
    }
    localStorage.setItem(MUSIC_TASK_STORAGE_KEY, JSON.stringify(task))
  } catch {
    // Storage lleno o deshabilitado: la tarea sigue viva en memoria.
  }
}

function setTask(task: MusicTask | null) {
  currentTask = task
  persistTask(task)
  notify()
}

/** Ignora patches de callbacks viejos si la tarea ya fue reemplazada. */
function patchTask(taskId: string, patch: Partial<MusicTask>) {
  if (!currentTask || currentTask.id !== taskId) return
  setTask({ ...currentTask, ...patch })
}

function restoreTask(): MusicTask | null {
  try {
    const raw = localStorage.getItem(MUSIC_TASK_STORAGE_KEY)
    if (!raw) return null

    const task = JSON.parse(raw) as MusicTask
    // Un job en curso no sobrevive al cierre de la app (el proceso muere con
    // ella): con opciones se puede seguir eligiendo; sin ellas, se perdió.
    if (task.status === 'generating' || task.status === 'choosing') {
      if (task.options?.length) {
        return {
          ...task,
          status: 'readyToChoose',
          jobId: null,
          errorKey: null,
          errorSeconds: null,
        }
      }
      return {
        ...task,
        status: 'error',
        jobId: null,
        errorKey: INTERRUPTED_ERROR_KEY,
        errorSeconds: null,
      }
    }
    return task
  } catch {
    return null
  }
}

function newTaskId(): string {
  return `tm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function stopActiveJob() {
  activeJob?.stop()
  activeJob = null
}

function errorKeyFor(code: string): string {
  return MUSIC_ERROR_MESSAGE_KEYS[code] ?? UNKNOWN_MUSIC_ERROR_KEY
}

function handleGenerationEvent(taskId: string, event: PipelineEventPayload) {
  if (event.type === 'progress') {
    const detail = (event.detail ?? {}) as MusicProgressDetail
    const patch: Partial<MusicTask> = {}
    if (typeof event.percent === 'number') patch.progressPercent = event.percent
    if (detail.elapsedSeconds !== undefined)
      patch.elapsedSeconds = detail.elapsedSeconds
    if (detail.estimatedCredits !== undefined)
      patch.estimatedCredits = detail.estimatedCredits
    patchTask(taskId, patch)
    return
  }

  if (event.type === 'job-completed') {
    stopActiveJob()
    const result = event.result as unknown as MusicGenerationResult | null
    patchTask(taskId, {
      status: 'readyToChoose',
      options: result?.options ?? [],
      jobId: null,
    })
    return
  }

  if (event.type === 'job-failed') {
    stopActiveJob()
    patchTask(taskId, {
      status: 'error',
      errorKey: errorKeyFor(event.code),
      errorSeconds: null,
      jobId: null,
    })
  }
}

async function startGeneration(params: MusicGenerationParams): Promise<void> {
  const now = Date.now()
  const sinceLast = now - lastGenerationAt
  if (lastGenerationAt > 0 && sinceLast < GENERATION_COOLDOWN_MS) {
    const seconds = Math.ceil((GENERATION_COOLDOWN_MS - sinceLast) / 1000)
    if (currentTask) {
      patchTask(currentTask.id, {
        errorKey: COOLDOWN_ERROR_KEY,
        errorSeconds: seconds,
      })
      return
    }
    setTask(makeTask(newTaskId(), params, now, COOLDOWN_ERROR_KEY, seconds))
    return
  }

  if (currentTask?.jobId && currentTask.status === 'generating') {
    void musicApi.cancelJob(currentTask.jobId)
  }
  stopActiveJob()
  lastGenerationAt = now

  const taskId = newTaskId()
  setTask(makeTask(taskId, params, now))

  try {
    const job = await musicApi.startGeneration(params, (event) =>
      handleGenerationEvent(taskId, event),
    )
    // El job pudo terminar con eventos bufferizados antes de llegar acá.
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
      errorKey: musicApi.errorMessageKey(error),
    })
  }
}

function makeTask(
  id: string,
  request: MusicGenerationParams,
  createdAt: number,
  errorKey: string | null = null,
  errorSeconds: number | null = null,
): MusicTask {
  return {
    id,
    jobId: null,
    status: errorKey ? 'error' : 'generating',
    request,
    progressPercent: 0,
    elapsedSeconds: null,
    estimatedCredits: null,
    options: null,
    chosenOption: null,
    chosenEntry: null,
    errorKey,
    errorSeconds,
    createdAt,
  }
}

async function chooseOption(option: MusicOption, name?: string): Promise<void> {
  const task = currentTask
  if (!task || task.status !== 'readyToChoose') return

  patchTask(task.id, {
    status: 'choosing',
    chosenOption: option,
    errorKey: null,
    errorSeconds: null,
  })
  try {
    const entry = await musicApi.chooseMusic({
      option,
      name,
      prompt: task.request.prompt,
      customMode: task.request.customMode,
      style: task.request.style,
      instrumental: task.request.instrumental,
    })
    patchTask(task.id, { status: 'completed', chosenEntry: entry })
  } catch (error) {
    // Vuelve al chooser para poder reintentar con otra opción (como el origen).
    patchTask(task.id, {
      status: 'readyToChoose',
      chosenOption: null,
      errorKey: musicApi.errorMessageKey(error),
    })
  }
}

async function regenerate(): Promise<void> {
  if (!currentTask) return
  return startGeneration(currentTask.request)
}

function discardTask() {
  if (currentTask?.jobId) void musicApi.cancelJob(currentTask.jobId)
  stopActiveJob()
  setTask(null)
}

function subscribe(listener: () => void): () => void {
  subscribers.add(listener)
  return () => {
    subscribers.delete(listener)
  }
}

function getSnapshot(): MusicTask | null {
  return currentTask
}

export function useMusicTask() {
  const task = useSyncExternalStore(subscribe, getSnapshot)

  return { task, startGeneration, chooseOption, regenerate, discardTask }
}
