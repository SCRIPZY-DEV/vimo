import { useSyncExternalStore } from 'react'
import i18next from 'i18next'
import { toast } from '@/modules/common/hooks/useToast'
import { scheduleCreditsRefresh } from '@/modules/common/utilities/creditsRefresh'
import { videosApi } from '@/modules/videos/api'
import {
  AUTO_RETRY_DELAYS_SECONDS,
  AUTO_RETRY_MAX_ATTEMPTS,
  CANCEL_SETTLE_TIMEOUT_MS,
  CREATE_ERROR_MESSAGE_KEYS,
  CREATE_TASK_STORAGE_KEY,
  INTERRUPTED_ERROR_KEY,
  LOG_LINES_LIMIT,
  RETRYABLE_ERROR_CODES,
  UNKNOWN_CREATE_ERROR_KEY,
} from '@/modules/videos/constants'
import { hasPrompt } from '@/modules/videos/utilities/hasPrompt'
import {
  libraryTabFor,
  rememberLibraryTab,
} from '@/modules/videos/utilities/libraryTab'
import { refreshProjectQueries } from '@/modules/videos/utilities/projectRefresh'
import type { PipelineJobHandle } from '@/modules/common/fetcher/pipeline'
import type {
  CreateTask,
  CreateTaskSeed,
  ProjectRunOptions,
  SceneCutChoice,
} from '@/modules/videos/types/create'
import type { PipelineEventPayload } from '@pipeline/runner/events.ts'
import type { StageId } from '@pipeline/runner/stage-id.ts'
import type { SceneSummary } from '@pipeline/types/scenes.ts'
import type { VideoFormat } from '@pipeline/types/video-format.ts'
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

    const stored = JSON.parse(raw) as CreateTask
    // Una cancelación a medio cerrar no sobrevive el reinicio: el job murió
    // con la app y el proyecto quedó en disco como lo dejó el sidecar.
    if (stored.cancelRequested) return null

    // Tareas persistidas antes del cronómetro con pausa: defaults. El
    // reintento automático nunca sobrevive un reinicio (su timer murió).
    const task: CreateTask = {
      ...stored,
      pausedAt: stored.pausedAt ?? null,
      pausedMs: stored.pausedMs ?? 0,
      finishedAt: stored.finishedAt ?? null,
      retry: null,
      retryAttempts: stored.retryAttempts ?? 0,
      videoFormat: stored.videoFormat ?? '16:9',
      promptsWritten: stored.promptsWritten ?? null,
      // La pasada de recuperación pertenece a un job vivo: no sobrevive.
      imagesRecovery: null,
      cancelRequested: false,
    }
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

// ── Reintento automático ante fallos transitorios (port del origen) ──

let retryTimer: ReturnType<typeof setInterval> | null = null

function stopRetryTimer() {
  if (retryTimer !== null) clearInterval(retryTimer)
  retryTimer = null
}

// Cuenta regresiva visible; al llegar a 0 relanza el job (las fases hechas
// son cache-hit). El timer muere con la app: al restaurar, la tarea vuelve
// como error interrumpido normal.
function startAutoRetry(taskId: string, projectId: string, errorKey: string) {
  const task = currentTask
  if (!task || task.id !== taskId) return

  const attempt = task.retryAttempts + 1
  // Backoff creciente del origen (30 s, 90 s, 3 min).
  const delayIndex = Math.min(attempt, AUTO_RETRY_DELAYS_SECONDS.length) - 1
  stopRetryTimer()
  patchTask(taskId, {
    status: 'generating',
    jobId: null,
    stage: null,
    errorKey,
    retry: {
      attempt,
      maxAttempts: AUTO_RETRY_MAX_ATTEMPTS,
      secondsLeft: AUTO_RETRY_DELAYS_SECONDS[delayIndex],
    },
    retryAttempts: attempt,
  })

  retryTimer = setInterval(() => {
    const current = currentTask
    if (!current || current.id !== taskId || !current.retry) {
      stopRetryTimer()
      return
    }
    const secondsLeft = current.retry.secondsLeft - 1
    if (secondsLeft > 0) {
      patchTask(taskId, { retry: { ...current.retry, secondsLeft } })
      return
    }
    stopRetryTimer()
    patchTask(taskId, { retry: null })
    void runPipeline(taskId, projectId)
  }, 1000)
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

  // Cancelación pedida: nada de lo que llegue cambia la pantalla (ya no se
  // muestra); solo el cierre del job libera el turno. Cancelar no es error.
  if (task.cancelRequested) {
    if (event.type === 'job-completed' || event.type === 'job-failed')
      finishCancel(taskId)
    return
  }

  switch (event.type) {
    case 'stage-started':
      patchTask(taskId, { stage: event.stageId, imagesRecovery: null })
      return

    case 'stage-skipped':
    case 'stage-completed':
      patchTask(taskId, {
        completedStages: withStage(task.completedStages, event.stageId),
        // El stream del redactor ya no importa con los prompts persistidos.
        ...(event.stageId === 'scene-prompts' ? { promptsWritten: null } : {}),
        ...(event.stageId === 'images' ? { imagesRecovery: null } : {}),
      })
      return

    // Pasada de recuperación de imágenes. En `rewrite` se vacía el prompt de
    // las escenas afectadas para que la grilla las muestre escribiéndose;
    // cada scene-prompt-ready lo rellena. `retry` cierra el rewrite anterior.
    case 'images-recovery-pass':
      patchTask(taskId, {
        imagesRecovery: {
          kind: event.kind,
          sceneIds: event.sceneIds,
          pass: event.pass,
          maxPasses: event.maxPasses,
          streamed: 0,
        },
        ...(event.kind === 'rewrite'
          ? { scenes: clearPrompts(task.scenes, event.sceneIds) }
          : {}),
      })
      return

    case 'log':
      patchTask(taskId, { logs: appendLog(task, event.message) })
      return

    case 'scenes-planned':
      patchTask(taskId, {
        // Merge por id, no reemplazo (origen v0.35.0): al reanudar, la grilla
        // ya viene sembrada desde disco y un reemplazo la vaciaría hasta que
        // lleguen los eventos.
        scenes: mergePlannedScenes(task.scenes, event.scenes),
        audioDurationSeconds: event.audioDurationSeconds,
      })
      return

    case 'scene-prompt-ready':
      patchTask(taskId, { scenes: mergeScene(task.scenes, event.scene) })
      return

    // Cifras absolutas del stream del redactor: reemplazan, no suman. Se
    // conserva el máximo visto — un job relanzado (reintento automático)
    // vuelve a escribir desde cero y la barra no debe devolverse.
    case 'scene-prompts-progress': {
      // Durante una reescritura (carril verbatim) las cifras son sobre TODAS
      // las escenas, con las no afectadas contadas como listas: se traduce al
      // subconjunto y no toca `promptsWritten` (su máximo monótono lo dejaría
      // clavado en el total).
      const recovery = task.imagesRecovery
      if (recovery?.kind === 'rewrite') {
        const subset = recovery.sceneIds.length
        const streamed = Math.min(
          subset,
          Math.max(0, event.ready - (event.total - subset)),
        )
        patchTask(taskId, {
          imagesRecovery: {
            ...recovery,
            streamed: Math.max(recovery.streamed, streamed),
          },
        })
        return
      }

      patchTask(taskId, {
        promptsWritten: {
          ready: Math.max(task.promptsWritten?.ready ?? 0, event.ready),
          total: event.total,
        },
      })
      return
    }

    case 'scene-image-started':
      patchTask(taskId, {
        scenes: patchScene(task.scenes, event.sceneId, {
          imageStatus: 'generating',
          imageProgress: undefined,
        }),
      })
      return

    // Avance de una imagen en curso (solo Evolink lo informa): la celda de
    // la grilla muestra el porcentaje; se limpia al cerrar la imagen.
    case 'scene-image-progress':
      patchTask(taskId, {
        scenes: patchScene(task.scenes, event.sceneId, {
          imageProgress: event.percent,
        }),
      })
      return

    case 'scene-image-ready':
      patchTask(taskId, {
        scenes: patchScene(task.scenes, event.sceneId, {
          imageStatus: 'ok',
          imagePath: event.imagePath,
          imageProgress: undefined,
        }),
      })
      return

    case 'scene-image-failed':
      patchTask(taskId, {
        scenes: patchScene(task.scenes, event.sceneId, {
          imageStatus: 'error',
          imageProgress: undefined,
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
          partIndex: event.partIndex ?? null,
          partTotal: event.partTotal ?? null,
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
          // Solo el carril de segundos lo trae: cambia el diálogo a slider.
          ...(event.secondsPerScene !== undefined
            ? { secondsPerScene: event.secondsPerScene }
            : {}),
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
          // Arranca la pausa del cronómetro: la espera no cuenta.
          pausedAt: Date.now(),
        })
        return
      }
      patchTask(taskId, {
        status: 'completed',
        jobId: null,
        stage: null,
        imagesRecovery: null,
        videoPath: result?.videoPath ?? null,
        finishedAt: Date.now(),
        retryAttempts: 0,
      })
      scheduleCreditsRefresh()
      return
    }

    case 'job-failed': {
      stopActiveJob()
      // Fallo transitorio con reintentos disponibles → cuenta regresiva y
      // relanzamiento automático en vez de tarjeta de error.
      if (
        RETRYABLE_ERROR_CODES.has(event.code) &&
        task.retryAttempts < AUTO_RETRY_MAX_ATTEMPTS
      ) {
        startAutoRetry(taskId, task.projectId, errorKeyFor(event.code))
        return
      }
      patchTask(taskId, {
        status: 'error',
        jobId: null,
        stage: null,
        imagesRecovery: null,
        errorKey: errorKeyFor(event.code),
      })
      return
    }

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
  // Merge por id (nunca reemplazo): conserva el estado de imagen ya conocido
  // y un prompt ya visto si el evento no trae otro — el contador de prompts
  // solo puede subir.
  const index = scenes.findIndex((scene) => scene.id === incoming.id)
  if (index < 0) return [...scenes, incoming].sort((a, b) => a.id - b.id)
  const known = scenes[index]
  const merged = [...scenes]
  merged[index] = {
    ...known,
    ...incoming,
    imagePrompt: hasPrompt(incoming) ? incoming.imagePrompt : known.imagePrompt,
  }
  return merged
}

// Las escenas recién planeadas conservan lo que la tarea ya sabía de cada
// una (prompt e imagen) cuando el evento no lo trae: en un run fresco llegan
// vacías y el merge equivale a un reemplazo; en un resume no borra lo sembrado.
function mergePlannedScenes(
  previous: CreateTask['scenes'],
  planned: SceneSummary[],
): CreateTask['scenes'] {
  return planned.map((scene) => {
    const known = previous.find((item) => item.id === scene.id)
    if (!known) return scene
    const knownImage = known.imageStatus === 'ok' && scene.imageStatus !== 'ok'
    return {
      ...scene,
      imagePrompt: hasPrompt(scene) ? scene.imagePrompt : known.imagePrompt,
      imageStatus: knownImage ? known.imageStatus : scene.imageStatus,
      imagePath: knownImage ? known.imagePath : scene.imagePath,
    }
  })
}

// Deja sin prompt a las escenas que la fase de imágenes va a reescribir: la
// grilla las pinta con su placeholder hasta que llegue el prompt nuevo.
function clearPrompts(
  scenes: CreateTask['scenes'],
  sceneIds: number[],
): CreateTask['scenes'] {
  const targets = new Set(sceneIds)
  return scenes.map((scene) =>
    targets.has(scene.id) ? { ...scene, imagePrompt: undefined } : scene,
  )
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
  videoFormat: VideoFormat = '16:9',
  seed?: CreateTaskSeed,
): CreateTask {
  return {
    id,
    jobId: null,
    projectId,
    projectName,
    status: 'creating',
    stage: null,
    // Sembrado desde disco al reanudar (origen: `hidratar`): las fases hechas
    // y la grilla aparecen al toque; los eventos del job hacen merge encima.
    completedStages: seed?.completedStages ?? [],
    scenes: seed?.scenes ?? [],
    audioDurationSeconds: seed?.audioDurationSeconds ?? null,
    voiceProgress: null,
    bgmProgress: null,
    renderProgress: null,
    promptsWritten: null,
    imagesRecovery: null,
    confirmation: null,
    logs: [],
    videoPath: null,
    errorKey: null,
    startedAt: Date.now(),
    pausedAt: null,
    pausedMs: 0,
    finishedAt: null,
    retry: null,
    retryAttempts: 0,
    videoFormat,
    cancelRequested: false,
  }
}

// Lanza el job del pipeline y engancha sus eventos a la tarea.
async function runPipeline(taskId: string, projectId: string): Promise<void> {
  // Si venía en pausa (confirmación), el tramo pausado se acumula y el
  // cronómetro retoma.
  const previous = currentTask
  const pausePatch =
    previous?.id === taskId && previous.pausedAt !== null
      ? {
          pausedMs: previous.pausedMs + (Date.now() - previous.pausedAt),
          pausedAt: null,
        }
      : {}
  // `promptsWritten` NO se resetea: al relanzar (reintento, reanudación) el
  // redactor arranca de cero y la barra se quedaría quieta hasta alcanzar lo
  // ya visto — nunca vuelve atrás (regla del origen). Lo limpia la fase al
  // completarse y cada tarea nueva nace sin él.
  // `imagesRecovery` sí: describe una pasada del job anterior, ya muerto.
  patchTask(taskId, {
    status: 'generating',
    errorKey: null,
    confirmation: null,
    imagesRecovery: null,
    ...pausePatch,
  })

  // La tarea pudo descartarse mientras se creaba el proyecto: no se lanza
  // un job huérfano.
  if (currentTask?.id !== taskId) return

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
  setTask(
    makeTask(
      taskId,
      '',
      input.payload.name,
      input.payload.options.videoFormat ?? '16:9',
    ),
  )

  let projectId: string
  try {
    const project = await videosApi.createProject(input.payload)
    projectId = project.projectId
    patchTask(taskId, { projectId })
    // La biblioteca abre en la pestaña del formato recién creado.
    rememberLibraryTab(libraryTabFor(input.payload.options.videoFormat))
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

// ¿Hay un job pesado en curso? Un solo pipeline completo a la vez en toda la
// app (ADR-0014): Library y Create comparten este store. Exportado para que
// el store del editor aplique la misma exclusión.
export function hasBusyCreateTask(): boolean {
  const status = currentTask?.status
  return status === 'creating' || status === 'generating'
}

// Otro job pesado está corriendo: se avisa acá, una vez, y no en cada vista.
function rejectIfBusy(): boolean {
  if (!hasBusyCreateTask()) return false
  toast({
    description: i18next.t('library.errors.projectBusy'),
    variant: 'destructive',
  })
  return true
}

// Arranca (o reanuda) el pipeline sobre un proyecto YA existente en disco —
// la vía de Library para reanudar interrumpidos, reintentar errores y
// generar borradores. Devuelve false si otro job pesado está corriendo.
async function startPipelineForProject(
  projectId: string,
  projectName: string,
  options: ProjectRunOptions = {},
): Promise<boolean> {
  if (rejectIfBusy()) return false

  stopActiveJob()
  const taskId = newTaskId()
  setTask(
    makeTask(taskId, projectId, projectName, options.videoFormat, options.seed),
  )
  await runPipeline(taskId, projectId)
  return true
}

// Confirma el corte de un proyecto SIN tarea viva (la pausa sobrevivió a un
// reinicio: el estado quedó en disco) y relanza.
async function confirmScenesForProject(
  projectId: string,
  projectName: string,
  choice: SceneCutChoice,
  options: ProjectRunOptions = {},
): Promise<boolean> {
  if (rejectIfBusy()) return false

  stopActiveJob()
  const taskId = newTaskId()
  setTask(
    makeTask(taskId, projectId, projectName, options.videoFormat, options.seed),
  )
  try {
    await videosApi.confirmScenes({ projectId, ...choice })
  } catch (error) {
    patchTask(taskId, {
      status: 'error',
      errorKey: videosApi.errorMessageKey(error),
    })
    return true
  }
  await runPipeline(taskId, projectId)
  return true
}

// Confirma el corte (conteo o segundos) y relanza (fases 1-2 cache-hit).
async function confirmScenes(choice: SceneCutChoice): Promise<void> {
  const task = currentTask
  if (!task || task.status !== 'awaitingConfirmation') return

  patchTask(task.id, { status: 'generating', confirmation: null })
  try {
    await videosApi.confirmScenes({ projectId: task.projectId, ...choice })
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

// Cierra la cancelación: suelta el job y borra la tarea. Idempotente — la
// llaman el cierre del job, el fallo del aviso y la red de seguridad.
function finishCancel(taskId: string) {
  const task = currentTask
  if (!task || task.id !== taskId || !task.cancelRequested) return
  stopActiveJob()
  setTask(null)
  // El sidecar ya dejó el proyecto en disco como `paused`: la biblioteca
  // pasa de «Generando» a «Cancelado» sin que la persona vuelva a entrar.
  refreshProjectQueries(task.projectId)
}

// Cancelar NO es un error (origen v0.35.0). La tarea deja de mostrarse en el
// acto y la vista navega a la biblioteca; el job sigue ocupando el turno
// hasta que el sidecar confirme el cierre (un solo pipeline a la vez), y en
// disco el proyecto queda `paused`: la biblioteca lo lista como cancelado.
function cancel() {
  const task = currentTask
  if (!task) return
  stopRetryTimer()

  // Sin job vivo (cuenta regresiva de reintento, pausa, fallo previo) no hay
  // nada que esperar.
  if (!task.jobId || !activeJob) {
    stopActiveJob()
    setTask(null)
    return
  }

  const taskId = task.id
  patchTask(taskId, { cancelRequested: true, retry: null })
  videosApi.cancelJob(task.jobId).catch(() => finishCancel(taskId))
  setTimeout(() => finishCancel(taskId), CANCEL_SETTLE_TIMEOUT_MS)
}

// «Crear otro» y cerrar la confirmación: el mismo cierre que cancelar.
function discardTask() {
  cancel()
}

function subscribe(listener: () => void): () => void {
  subscribers.add(listener)
  return () => {
    subscribers.delete(listener)
  }
}

// Para el store del editor: al cerrar un pipeline completo re-despacha las
// colas de regen que quedaron esperando por la exclusión mutua.
export const subscribeCreateTask = subscribe

function getSnapshot(): CreateTask | null {
  return currentTask
}

export function useCreateTask() {
  const stored = useSyncExternalStore(subscribe, getSnapshot)
  // Con cancelación pedida la tarea ya no existe para la UI: la vista volvió
  // a la biblioteca y el proyecto se lee desde disco.
  const task = stored?.cancelRequested ? null : stored

  return {
    task,
    startCreation,
    startPipelineForProject,
    confirmScenes,
    confirmScenesForProject,
    resume,
    cancel,
    discardTask,
  }
}
