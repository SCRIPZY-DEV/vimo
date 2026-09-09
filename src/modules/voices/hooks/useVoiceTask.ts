import { useSyncExternalStore } from 'react'
import { voicesApi } from '@/modules/voices/api'
import {
  INTERRUPTED_ERROR_KEY,
  UNKNOWN_VOICE_ERROR_KEY,
  VOICE_ERROR_MESSAGE_KEYS,
  VOICE_TASK_STORAGE_KEY,
} from '@/modules/voices/constants'
import type { PipelineJobHandle } from '@/modules/common/fetcher/pipeline'
import type { VoiceTask } from '@/modules/voices/types/voices'
import type { PipelineEventPayload } from '@pipeline/runner/events.ts'
import type {
  GenerateVoicePayload,
  GenerateVoiceResult,
  VoiceProgressDetail,
} from '@pipeline/types/voices.ts'

/**
 * Store de la tarea de voz, fuera de React (mismo patrón que useMusicTask):
 * el layout desmonta la vista al navegar y el job sigue corriendo, así que el
 * listener de eventos y el estado no pueden vivir en el árbol de la vista.
 * A diferencia de música no hay cooldown: el rate-limit se maneja con los
 * reintentos 429 dentro del job, y solo corre una generación a la vez.
 */
let currentTask: VoiceTask | null = restoreTask()
let activeJob: PipelineJobHandle | null = null
const subscribers = new Set<() => void>()

function notify() {
  for (const subscriber of subscribers) subscriber()
}

function persistTask(task: VoiceTask | null) {
  try {
    if (task === null) {
      localStorage.removeItem(VOICE_TASK_STORAGE_KEY)
      return
    }
    localStorage.setItem(VOICE_TASK_STORAGE_KEY, JSON.stringify(task))
  } catch {
    // Storage lleno o deshabilitado: la tarea sigue viva en memoria.
  }
}

function setTask(task: VoiceTask | null) {
  currentTask = task
  persistTask(task)
  notify()
}

/** Ignora patches de callbacks viejos si la tarea ya fue reemplazada. */
function patchTask(taskId: string, patch: Partial<VoiceTask>) {
  if (!currentTask || currentTask.id !== taskId) return
  setTask({ ...currentTask, ...patch })
}

function restoreTask(): VoiceTask | null {
  try {
    const raw = localStorage.getItem(VOICE_TASK_STORAGE_KEY)
    if (!raw) return null

    const task = JSON.parse(raw) as VoiceTask
    // Un job en curso no sobrevive al cierre de la app (el proceso muere con
    // ella). Una tarea completada sí: el audio quedó en el historial local.
    if (task.status === 'generating') {
      return {
        ...task,
        status: 'error',
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
  return `tv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function stopActiveJob() {
  activeJob?.stop()
  activeJob = null
}

function errorKeyFor(code: string): string {
  return VOICE_ERROR_MESSAGE_KEYS[code] ?? UNKNOWN_VOICE_ERROR_KEY
}

function handleGenerationEvent(taskId: string, event: PipelineEventPayload) {
  if (event.type === 'progress') {
    const detail = (event.detail ?? {}) as VoiceProgressDetail
    const patch: Partial<VoiceTask> = {}
    if (typeof event.percent === 'number') patch.progressPercent = event.percent
    if (detail.elapsedSeconds !== undefined)
      patch.elapsedSeconds = detail.elapsedSeconds
    if (detail.partIndex !== undefined) patch.partIndex = detail.partIndex
    if (detail.partTotal !== undefined) patch.partTotal = detail.partTotal
    patchTask(taskId, patch)
    return
  }

  if (event.type === 'job-completed') {
    stopActiveJob()
    const result = event.result as unknown as GenerateVoiceResult | null
    patchTask(taskId, {
      status: 'completed',
      entry: result?.entry ?? null,
      creditsRemaining: result?.creditsRemaining ?? null,
      progressPercent: 100,
      jobId: null,
    })
    return
  }

  if (event.type === 'job-failed') {
    stopActiveJob()
    // La UI muestra el mensaje i18n genérico; el detalle real del proveedor
    // (status HTTP y cuerpo de la respuesta) solo viaja acá.
    console.error(`generate-voice failed [${event.code}]: ${event.message}`)
    patchTask(taskId, {
      status: 'error',
      errorKey: errorKeyFor(event.code),
      jobId: null,
    })
  }
}

function makeTask(
  id: string,
  request: GenerateVoicePayload,
  createdAt: number,
): VoiceTask {
  return {
    id,
    jobId: null,
    status: 'generating',
    request,
    progressPercent: 0,
    elapsedSeconds: null,
    entry: null,
    creditsRemaining: null,
    errorKey: null,
    createdAt,
  }
}

async function startGeneration(payload: GenerateVoicePayload): Promise<void> {
  if (currentTask?.jobId && currentTask.status === 'generating') {
    void voicesApi.cancelJob(currentTask.jobId)
  }
  stopActiveJob()

  const taskId = newTaskId()
  setTask(makeTask(taskId, payload, Date.now()))

  try {
    const job = await voicesApi.startGeneration(payload, (event) =>
      handleGenerationEvent(taskId, event),
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
      errorKey: voicesApi.errorMessageKey(error),
    })
  }
}

function discardTask() {
  if (currentTask?.jobId) void voicesApi.cancelJob(currentTask.jobId)
  stopActiveJob()
  setTask(null)
}

function subscribe(listener: () => void): () => void {
  subscribers.add(listener)
  return () => {
    subscribers.delete(listener)
  }
}

function getSnapshot(): VoiceTask | null {
  return currentTask
}

export function useVoiceTask() {
  const task = useSyncExternalStore(subscribe, getSnapshot)

  return { task, startGeneration, discardTask }
}
