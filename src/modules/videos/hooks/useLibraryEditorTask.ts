import { useSyncExternalStore } from 'react'
import i18next from 'i18next'
import {
  avatarsQueryKeys,
  BALANCE_RECHECK_MS,
} from '@/modules/avatars/constants'
import { toast } from '@/modules/common/hooks/useToast'
import { queryClient } from '@/modules/common/queryClient'
import { blockAnimationProvider } from '@/modules/common/utilities/animationProviderBlocks'
import { scheduleCreditsRefresh } from '@/modules/common/utilities/creditsRefresh'
import { videosApi } from '@/modules/videos/api'
import {
  INSUFFICIENT_CREDITS_CODES,
  NON_RETRYABLE_ANIMATION_CODES,
} from '@/modules/videos/constants'
import {
  hasBusyCreateTask,
  subscribeCreateTask,
} from '@/modules/videos/hooks/useCreateTask'
import { avatarRenderPayload } from '@/modules/videos/utilities/avatarRegeneration'
import { setEditorProjectBusyCheck } from '@/modules/videos/utilities/editorProjectBusy'
import { errorKeyOf } from '@/modules/videos/utilities/errorKeyOf'
import type {
  AvatarRenderRequestOptions,
  EditorAvatarRenderState,
  LibraryEditorTask,
  EditorAnimationRequest,
  RegenQueueEntry,
  SceneAnimationFailure,
  SceneAnimationProgress,
} from '@/modules/videos/types/library'
import type {
  SceneAnimationReviewAttempt,
  SceneAnimationReviewOutcome,
} from '@/modules/videos/types/sceneImageReview'
import type { PipelineEventPayload } from '@pipeline/runner/events.ts'
import type { AnimateScenesResult } from '@pipeline/types/animation.ts'
import type {
  AvatarRenderScenesPayload,
  AvatarRenderScenesResult,
} from '@pipeline/types/avatar.ts'
import type {
  ExportClipsResult,
  RegenerateSceneImagesResult,
  RenderVideoResult,
} from '@pipeline/types/video-project.ts'
import type { ImageProviderId } from '@pipeline/types/image-provider.ts'
import { ANIMATION_CONCURRENCY } from '@pipeline/types/video-provider.ts'
import type { VideoProviderId } from '@pipeline/types/video-provider.ts'

// Store del editor, por proyecto y fuera de React (patrón useCreateTask):
// los jobs de regen/render/export/animación siguen vivos al navegar. SIN
// localStorage — un job muere con la app y al volver el detail refetchea el
// disco.
//
// Concurrencia (ADR-0014): la cola de regen se coalesce en UN job por
// proyecto; regen ⊻ render ⊻ export ⊻ conjunto de animaciones ⊻ audio ⊻ el
// avatar de HeyGen, y todo ⊻ el pipeline completo de useCreateTask. El store
// es el único despachador.
const tasks = new Map<string, LibraryEditorTask>()
const animationRequests = new Map<string, EditorAnimationRequest[]>()
const subscribers = new Set<() => void>()
let generationOrder = 0

function notify() {
  for (const subscriber of subscribers) subscriber()
}

function emptyTask(projectId: string): LibraryEditorTask {
  return {
    projectId,
    savingScenes: false,
    regenQueue: [],
    activeRegen: null,
    sceneRegenDrafts: {},
    pendingImageProvider: null,
    sceneStatus: {},
    sceneErrors: {},
    sceneVersions: {},
    render: null,
    export: null,
    animation: null,
    pendingVideoProvider: null,
    sceneAnimationStatus: {},
    sceneAnimationProgress: {},
    sceneAnimationErrors: {},
    animationFailure: null,
    avatarRender: null,
    sceneAvatarRendering: {},
    audioBusy: false,
    errorKey: null,
    errorCode: null,
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

// ¿El editor tiene una tarea en curso en el proyecto?
function hasEditorTask(projectId: string) {
  const task = taskOf(projectId)
  return (
    task.savingScenes ||
    task.activeRegen !== null ||
    task.regenQueue.length > 0 ||
    task.render !== null ||
    task.export !== null ||
    task.animation !== null ||
    task.avatarRender !== null ||
    task.audioBusy
  )
}

// ¿El proyecto puede aceptar un job nuevo del editor?
function isProjectBusy(projectId: string): boolean {
  return hasEditorTask(projectId) || hasBusyCreateTask()
}

// Y al revés: Crear no lanza el pipeline sobre un proyecto con una tarea del
// editor en curso (rejectIfBusy en useCreateTask; entrega 2d, M3 de la
// revisión final).
setEditorProjectBusyCheck(hasEditorTask)

// Las ediciones exclusivas, como deshacer un clip, reservan el proyecto.
// Las descripciones de regeneración usan su propia reserva activeRegen al
// despachar, por lo que no bloquean la admisión de escenas disjuntas.
function beginSceneEdit(projectId: string): boolean {
  if (isProjectBusy(projectId) || taskOf(projectId).regenQueue.length > 0)
    return false
  patchTask(projectId, { savingScenes: true })
  return true
}

function endSceneEdit(projectId: string) {
  patchTask(projectId, { savingScenes: false })
  dispatchGenerations(projectId)
}

// ── Regeneración: cola coalescida ──

// Aceptar un encargo no implica escribir todavía. Las escenas ajenas pueden
// entrar a la cola mientras otro lote trabaja; una misma fuente no se reserva dos veces.
function canQueueRegeneration(projectId: string, sceneIds: number[]): boolean {
  const task = taskOf(projectId)
  if (
    task.savingScenes ||
    task.render ||
    task.export ||
    task.avatarRender ||
    task.audioBusy ||
    hasBusyCreateTask()
  )
    return false
  const requests = animationRequests.get(projectId) ?? []
  return !sceneIds.some(
    (id) =>
      task.activeRegen?.sceneIds.includes(id) ||
      task.regenQueue.some((entry) => entry.id === id) ||
      requests.some((request) => request.sceneIds.includes(id)),
  )
}

function enqueueRegen(projectId: string, entries: RegenQueueEntry[]): boolean {
  const unique = [
    ...new Map(entries.map((entry) => [entry.id, entry])).values(),
  ]
  if (
    unique.length === 0 ||
    !canQueueRegeneration(
      projectId,
      unique.map((entry) => entry.id),
    )
  )
    return false
  const task = taskOf(projectId)
  const order = ++generationOrder
  const queued = unique.map((entry) => ({
    ...entry,
    imageProvider:
      entry.imageProvider ?? task.pendingImageProvider ?? undefined,
    order,
  }))
  const sceneStatus = { ...task.sceneStatus }
  const sceneErrors = { ...task.sceneErrors }
  const sceneRegenDrafts = { ...task.sceneRegenDrafts }
  for (const entry of queued) {
    sceneStatus[entry.id] = 'generating'
    delete sceneErrors[entry.id]
    if (entry.userPrompt !== undefined)
      sceneRegenDrafts[entry.id] = entry.userPrompt
  }
  patchTask(projectId, {
    regenQueue: [...task.regenQueue, ...queued],
    sceneStatus,
    sceneErrors,
    sceneRegenDrafts,
    errorKey: null,
    errorCode: null,
  })
  dispatchGenerations(projectId)
  return true
}

// Las dos colas existentes comparten orden de admisión. Un lote de imágenes
// espera a los clips activos y frena solicitudes de animación posteriores;
// después deja pasar al siguiente tipo. No hay dos escritores incompatibles.
function dispatchGenerations(projectId: string) {
  const task = taskOf(projectId)
  if (
    task.savingScenes ||
    task.activeRegen ||
    task.render ||
    task.export ||
    task.avatarRender ||
    task.audioBusy ||
    hasBusyCreateTask()
  )
    return
  const requests = animationRequests.get(projectId) ?? []
  const nextImage = task.regenQueue[0]
  const nextAnimation = requests.find((request) => !request.started)
  if (nextImage && (!nextAnimation || nextImage.order < nextAnimation.order)) {
    if (requests.some((request) => request.started)) return
    void dispatchRegen(projectId)
    return
  }
  dispatchAnimation(projectId)
}

// La exclusión con el pipeline completo no tiene callback: cuando ese store
// cambia, cualquier cola que quedó esperando vuelve a intentar despachar.
subscribeCreateTask(() => {
  if (hasBusyCreateTask()) return
  for (const task of tasks.values()) {
    dispatchGenerations(task.projectId)
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
  const first = task.regenQueue[0]
  if (!first) return
  const nextAnimation = (animationRequests.get(projectId) ?? []).find(
    (request) => !request.started,
  )
  const batch = []
  for (const entry of task.regenQueue) {
    if (
      entry.imageProvider !== first.imageProvider ||
      (nextAnimation && entry.order > nextAnimation.order)
    )
      break
    batch.push(entry)
  }
  const sceneIds = batch.map((entry) => entry.id)
  const requestId = crypto.randomUUID()
  patchTask(projectId, {
    regenQueue: task.regenQueue.slice(batch.length),
    activeRegen: { requestId, jobId: null, sceneIds },
  })

  try {
    const changes = batch.flatMap((entry) =>
      entry.userPrompt !== undefined
        ? [{ id: entry.id, userPrompt: entry.userPrompt }]
        : [],
    )
    if (changes.length > 0) await videosApi.updateScenes(projectId, changes)
    if (taskOf(projectId).activeRegen?.cancelled) {
      finishRegen(
        projectId,
        requestId,
        sceneIds,
        'create.errors.cancelled',
        'cancelled',
      )
      return
    }
    const job = await videosApi.startRegeneration(
      {
        projectId,
        scenes: batch.map(({ id, rewritePrompt }) => ({ id, rewritePrompt })),
        ...(first.imageProvider ? { imageProvider: first.imageProvider } : {}),
      },
      (event) => handleRegenEvent(projectId, requestId, sceneIds, event),
    )
    const current = taskOf(projectId)
    if (
      current.activeRegen?.requestId === requestId &&
      current.activeRegen.jobId === null
    ) {
      patchTask(projectId, {
        activeRegen: { ...current.activeRegen, jobId: job.jobId },
      })
      if (current.activeRegen.cancelled) void videosApi.cancelJob(job.jobId)
    } else job.stop()
  } catch (error) {
    finishRegen(
      projectId,
      requestId,
      sceneIds,
      videosApi.errorMessageKey(error),
      videosApi.errorCode(error),
    )
  }
}

function handleRegenEvent(
  projectId: string,
  requestId: string,
  sceneIds: number[],
  event: PipelineEventPayload,
) {
  const task = taskOf(projectId)
  if (task.activeRegen?.requestId !== requestId) return

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
        requestId,
        sceneIds,
        failed.length > 0 ? 'library.editor.regenFailed' : null,
        null,
        new Set(failed),
      )
      return
    }

    case 'job-failed':
      finishRegen(
        projectId,
        requestId,
        sceneIds,
        videosApi.errorMessageKey({ code: event.code }),
        event.code,
      )
      return

    default:
      return
  }
}

function finishRegen(
  projectId: string,
  requestId: string,
  sceneIds: number[],
  errorKey: string | null,
  errorCode: string | null,
  failedIds: Set<number> = new Set(sceneIds),
) {
  const task = taskOf(projectId)
  if (task.activeRegen?.requestId !== requestId) return
  const sceneStatus = { ...task.sceneStatus }
  const sceneErrors = { ...task.sceneErrors }
  const sceneRegenDrafts = { ...task.sceneRegenDrafts }
  // Los estados transitorios del lote se limpian; el detail refetcheado
  // cuenta la verdad (una fallida conserva su imagen anterior en disco). El
  // motivo del fallo se conserva por escena hasta el próximo intento.
  for (const sceneId of sceneIds) {
    delete sceneStatus[sceneId]
    if (!failedIds.has(sceneId)) {
      delete sceneErrors[sceneId]
      delete sceneRegenDrafts[sceneId]
    } else sceneErrors[sceneId] ??= errorKey ?? 'create.errors.unknown'
  }
  patchTask(projectId, {
    activeRegen: null,
    sceneStatus,
    sceneErrors,
    sceneRegenDrafts,
    errorKey,
    errorCode,
    revision: task.revision + 1,
  })
  scheduleCreditsRefresh()
  dispatchGenerations(projectId)
}

// ── Animación de escenas (ADR-0047) ──

function setPendingVideoProvider(
  projectId: string,
  provider: VideoProviderId | null,
) {
  patchTask(projectId, { pendingVideoProvider: provider })
}

// Las selecciones explícitas comparten hasta diez carriles locales. El límite
// de envíos Kie vive en el sidecar y es independiente del tiempo de generación.
function canStartAnimation(
  projectId: string,
  sceneIds: number[] = [],
): boolean {
  const task = taskOf(projectId)
  const requests = animationRequests.get(projectId) ?? []
  if (
    task.savingScenes ||
    task.render ||
    task.export ||
    task.avatarRender ||
    task.audioBusy ||
    hasBusyCreateTask()
  )
    return false
  if (requests.some((request) => request.minutes !== undefined)) return false
  return !sceneIds.some(
    (id) =>
      task.activeRegen?.sceneIds.includes(id) ||
      task.regenQueue.some((entry) => entry.id === id) ||
      requests.some((request) => request.sceneIds.includes(id)),
  )
}

function animationStateOf(projectId: string) {
  const requests = animationRequests.get(projectId) ?? []
  if (!requests.length) return null
  return {
    jobId: requests.find((request) => request.jobId)?.jobId ?? null,
    sceneIds: [...new Set(requests.flatMap((request) => request.sceneIds))],
    provider: requests[0].provider,
  }
}

async function startAnimation(
  projectId: string,
  sceneIds: number[],
  provider: VideoProviderId,
  force: boolean,
  minutes?: number,
  retryFailed?: boolean,
  onReviewFinished?: (outcome: SceneAnimationReviewOutcome) => void,
): Promise<boolean> {
  if (!canStartAnimation(projectId, sceneIds)) return false
  if (minutes !== undefined && isProjectBusy(projectId)) return false
  if (sceneIds.length === 0) return false
  const request: EditorAnimationRequest = {
    id: crypto.randomUUID(),
    jobId: null,
    sceneIds: [...new Set(sceneIds)],
    provider,
    force,
    minutes,
    retryFailed,
    onReviewFinished,
    started: false,
    order: ++generationOrder,
  }
  const requests = animationRequests.get(projectId) ?? []
  animationRequests.set(projectId, [...requests, request])
  const task = taskOf(projectId)
  const sceneAnimationStatus = { ...task.sceneAnimationStatus }
  const sceneAnimationProgress = { ...task.sceneAnimationProgress }
  const sceneAnimationErrors = { ...task.sceneAnimationErrors }
  for (const sceneId of sceneIds) {
    sceneAnimationStatus[sceneId] = 'generating'
    sceneAnimationProgress[sceneId] = {
      leadId: sceneId,
      startedAt: Date.now(),
      reportedPercent: null,
      phase: 'queued',
    }
    delete sceneAnimationErrors[sceneId]
  }
  patchTask(projectId, {
    animation: animationStateOf(projectId),
    sceneAnimationStatus,
    sceneAnimationProgress,
    sceneAnimationErrors,
    animationFailure: null,
    errorKey: null,
    errorCode: null,
  })
  dispatchGenerations(projectId)
  return true
}

function dispatchAnimation(projectId: string) {
  const requests = animationRequests.get(projectId) ?? []
  const active = requests.filter((request) => request.started).length
  const imageOrder = taskOf(projectId).regenQueue[0]?.order ?? Infinity
  const queued = requests.filter(
    (request) => !request.started && request.order < imageOrder,
  )
  for (const request of queued.slice(
    0,
    Math.max(0, ANIMATION_CONCURRENCY - active),
  )) {
    if (request.started || request.cancelled) continue
    request.started = true
    const task = taskOf(projectId)
    const sceneAnimationProgress = { ...task.sceneAnimationProgress }
    for (const sceneId of request.sceneIds) {
      sceneAnimationProgress[sceneId] = {
        ...sceneAnimationProgress[sceneId],
        phase: 'preparing',
        startedAt: Date.now(),
      }
    }
    patchTask(projectId, { sceneAnimationProgress })
    void submitAnimation(projectId, request)
  }
}

async function submitAnimation(
  projectId: string,
  request: EditorAnimationRequest,
) {
  try {
    const job = await videosApi.startAnimation(
      {
        projectId,
        ...(request.minutes === undefined
          ? { sceneIds: request.sceneIds }
          : { minutes: request.minutes }),
        provider: 'kie',
        force: request.force,
        ...(request.retryFailed ? { retryFailed: true } : {}),
      },
      (event) => handleAnimationEvent(projectId, request.id, event),
    )
    if ((animationRequests.get(projectId) ?? []).includes(request)) {
      request.jobId = job.jobId
      if (request.cancelled) void videosApi.cancelJob(job.jobId)
      patchTask(projectId, { animation: animationStateOf(projectId) })
    } else job.stop()
  } catch (error) {
    finishAnimation(
      projectId,
      request.id,
      videosApi.errorMessageKey(error),
      videosApi.errorCode(error),
      null,
    )
  }
}

function animationFailureOf(
  sceneId: number,
  code: string,
  detail?: string,
): SceneAnimationFailure {
  const failure: SceneAnimationFailure = {
    sceneId,
    key: videosApi.errorMessageKey({ code }),
    retryable: !NON_RETRYABLE_ANIMATION_CODES.has(code),
  }
  if (detail) failure.detail = detail
  return failure
}

function handleAnimationEvent(
  projectId: string,
  requestId: string,
  event: PipelineEventPayload,
) {
  const request = animationRequests
    .get(projectId)
    ?.find((item) => item.id === requestId)
  if (!request) return
  const task = taskOf(projectId)

  switch (event.type) {
    case 'scene-animation-started': {
      request.sceneIds = [...new Set([...request.sceneIds, ...event.sceneIds])]
      // El clip cubre varias escenas: giran todas, no solo la marcada. El
      // reloj es el del clic y NUNCA se reinicia: un reencargo del proveedor
      // (tarea muerta, plazo vencido) sigue contando desde el mismo punto,
      // así el porcentaje jamás baja — volver a 0 se lee como «empezó de
      // nuevo» aunque la persona solo haya salido y vuelto al editor.
      const sceneAnimationStatus = { ...task.sceneAnimationStatus }
      const sceneAnimationProgress = { ...task.sceneAnimationProgress }
      const previous = task.sceneAnimationProgress[event.sceneId]
      const progress: SceneAnimationProgress = {
        leadId: event.sceneId,
        startedAt: previous?.startedAt ?? Date.now(),
        reportedPercent: previous?.reportedPercent ?? null,
        phase: 'preparing',
        animationId: event.animationId,
        startSeconds: event.startSeconds,
        endSeconds: event.endSeconds,
      }
      for (const sceneId of event.sceneIds) {
        sceneAnimationStatus[sceneId] = 'generating'
        sceneAnimationProgress[sceneId] = progress
      }
      patchTask(projectId, {
        animation: animationStateOf(projectId),
        sceneAnimationStatus,
        sceneAnimationProgress,
      })
      return
    }

    // Solo el porcentaje real del proveedor entra al store; sin él (Kie) el
    // reloj de la UI ya simula el avance y no hace falta re-renderizar.
    case 'scene-animation-progress': {
      const sceneAnimationProgress = { ...task.sceneAnimationProgress }
      for (const [key, progress] of Object.entries(sceneAnimationProgress)) {
        if (progress.leadId !== event.sceneId) continue
        sceneAnimationProgress[Number(key)] = {
          ...progress,
          reportedPercent: event.percent ?? progress.reportedPercent,
          phase:
            event.status === 'retrying'
              ? 'retrying'
              : event.status === 'rate-limited'
                ? 'rate-limited'
                : 'generating',
          attempt: event.attempt,
          maxAttempts: event.maxAttempts,
        }
      }
      patchTask(projectId, { sceneAnimationProgress })
      return
    }

    case 'scene-animation-ready': {
      if (request.onReviewFinished)
        request.readySceneIds = [
          ...new Set([...(request.readySceneIds ?? []), ...event.sceneIds]),
        ]
      const sceneAnimationStatus = { ...task.sceneAnimationStatus }
      const sceneAnimationProgress = { ...task.sceneAnimationProgress }
      for (const sceneId of event.sceneIds) {
        sceneAnimationStatus[sceneId] = 'ok'
        delete sceneAnimationProgress[sceneId]
      }
      const sceneAnimationErrors = { ...task.sceneAnimationErrors }
      delete sceneAnimationErrors[event.sceneId]
      patchTask(projectId, {
        sceneAnimationStatus,
        sceneAnimationProgress,
        sceneAnimationErrors,
        revision: task.revision + 1,
      })
      return
    }

    case 'scene-animation-failed': {
      const sceneAnimationProgress = { ...task.sceneAnimationProgress }
      const sceneAnimationStatus = { ...task.sceneAnimationStatus }
      for (const [key, progress] of Object.entries(sceneAnimationProgress)) {
        if (progress.leadId === event.sceneId) {
          delete sceneAnimationProgress[Number(key)]
          sceneAnimationStatus[Number(key)] = 'error'
        }
      }
      sceneAnimationStatus[event.sceneId] = 'error'
      patchTask(projectId, {
        sceneAnimationStatus,
        sceneAnimationProgress,
        sceneAnimationErrors: {
          ...task.sceneAnimationErrors,
          [event.sceneId]: animationFailureOf(
            event.sceneId,
            event.code,
            event.detail,
          ),
        },
      })
      return
    }

    // El sidecar dio por caído al proveedor: se esconde un rato para que la
    // persona pase al otro sin quemar más encargos.
    case 'animation-provider-trouble':
      blockAnimationProvider(event.provider, event.code)
      return

    case 'job-completed': {
      const result = event.result as unknown as AnimateScenesResult | null
      finishAnimation(projectId, requestId, null, null, result)
      return
    }

    case 'job-failed':
      finishAnimation(
        projectId,
        requestId,
        videosApi.errorMessageKey({ code: event.code }),
        event.code,
        null,
      )
      return

    default:
      return
  }
}

// Cierra el job: limpia lo transitorio, arma el aviso del modal con los
// fallos por escena y sube `revision` para que el detail traiga el clip.
// Un rechazo por saldo NO abre el modal: la alerta de la cuenta (ADR-0031)
// ya dice qué pasó y cómo seguir.
function finishAnimation(
  projectId: string,
  requestId: string,
  errorKey: string | null,
  errorCode: string | null,
  result: AnimateScenesResult | null,
) {
  const task = taskOf(projectId)
  const requests = animationRequests.get(projectId) ?? []
  const request = requests.find((item) => item.id === requestId)
  if (!request) return
  const provider = request.provider
  const sceneIds = request.sceneIds
  animationRequests.set(
    projectId,
    requests.filter((item) => item !== request),
  )
  const sceneAnimationErrors = { ...task.sceneAnimationErrors }

  // Sin resultado el job entero cayó: toda escena marcada falló por el
  // motivo del job, salvo las que ya tienen un motivo propio.
  const failedIds = result
    ? [...result.failed, ...result.rejected.map((item) => item.sceneId)]
    : sceneIds
  if (!result && errorCode) {
    for (const sceneId of sceneIds)
      sceneAnimationErrors[sceneId] ??= animationFailureOf(sceneId, errorCode)
  }

  const creditsIssue =
    errorCode !== null && INSUFFICIENT_CREDITS_CODES.has(errorCode)
  const failures = failedIds
    .map((sceneId) => sceneAnimationErrors[sceneId])
    .filter((failure): failure is SceneAnimationFailure => Boolean(failure))
  const animationFailure =
    failures.length > 0 && !creditsIssue ? { provider, failures } : null

  const sceneAnimationStatus = { ...task.sceneAnimationStatus }
  const sceneAnimationProgress = { ...task.sceneAnimationProgress }
  for (const sceneId of sceneIds) {
    delete sceneAnimationStatus[sceneId]
    delete sceneAnimationProgress[sceneId]
  }
  patchTask(projectId, {
    animation: animationStateOf(projectId),
    sceneAnimationStatus,
    sceneAnimationProgress,
    sceneAnimationErrors,
    animationFailure: animationFailure ?? task.animationFailure,
    errorKey:
      errorKey ??
      (failures.length > 0 ? 'library.editor.animationFailed' : task.errorKey),
    errorCode: errorCode ?? task.errorCode,
    revision: task.revision + 1,
  })
  request.onReviewFinished?.({
    succeeded:
      !request.cancelled &&
      result !== null &&
      failedIds.length === 0 &&
      sceneIds.every((id) => request.readySceneIds?.includes(id)),
    sceneIds: request.readySceneIds ?? [],
  })
  scheduleCreditsRefresh()
  dispatchGenerations(projectId)
}

// Restaurar fuentes es una decisión nueva: no reofrecer el fallo de un clip
// retirado. Otros intervalos fallidos y su diálogo siguen disponibles.
function clearRestoredAnimations(projectId: string, sceneIds: number[]) {
  if (sceneIds.length === 0) return
  const restored = new Set(sceneIds)
  const task = taskOf(projectId)
  const sceneAnimationStatus = { ...task.sceneAnimationStatus }
  const sceneAnimationProgress = { ...task.sceneAnimationProgress }
  const sceneAnimationErrors = { ...task.sceneAnimationErrors }
  for (const id of restored) {
    delete sceneAnimationStatus[id]
    delete sceneAnimationProgress[id]
    delete sceneAnimationErrors[id]
  }
  const failures =
    task.animationFailure?.failures.filter(
      (failure) => !restored.has(failure.sceneId),
    ) ?? []
  const animationFailure =
    task.animationFailure && failures.length > 0
      ? { ...task.animationFailure, failures }
      : null
  const clearedLastAnimationError =
    Object.keys(sceneAnimationErrors).length === 0 &&
    task.errorKey === 'library.editor.animationFailed'
  patchTask(projectId, {
    sceneAnimationStatus,
    sceneAnimationProgress,
    sceneAnimationErrors,
    animationFailure,
    errorKey: clearedLastAnimationError ? null : task.errorKey,
    errorCode: clearedLastAnimationError ? null : task.errorCode,
  })
}

function dismissAnimationFailure(projectId: string) {
  patchTask(projectId, { animationFailure: null })
}

// ── Avatar de HeyGen (entrega 2d, spec §20) ──

// «Generar», «Regenerar» o «Regenerar todos» del panel: corre
// `avatar-render-scenes` con esas escenas y, desde la entrega 2e (§21.4), con
// las listas que se pidió regenerar y el movimiento de la escena elegida y,
// desde la 2g (§23.3), la duración nueva de las que la cambiaron
// (avatarRenderPayload: sin ellos, el pedido de siempre). Cobra en HeyGen, así
// que el panel muestra el costo y el saldo antes de llegar acá. Una tarea a la
// vez y exclusiva con todas las del proyecto: no arranca si hay otra y,
// mientras corre, no entra ninguna. Devuelve si la aceptó; el job sigue solo y
// sus eventos llenan el bloque del timeline. Las escenas arrancan «en cola»:
// el sidecar renderiza de a tres y cada una sale de la cola con su
// `avatar-scene-started`.
function startAvatarRender(
  projectId: string,
  sceneIds: number[],
  options: AvatarRenderRequestOptions = {},
): boolean {
  const payload = avatarRenderPayload(projectId, { ...options, sceneIds })
  if (payload.sceneIds.length === 0) return false
  if (isProjectBusy(projectId)) return false

  const task = taskOf(projectId)
  const requestId = crypto.randomUUID()
  const queuedAt = Date.now()
  const sceneAvatarRendering = { ...task.sceneAvatarRendering }
  for (const sceneId of payload.sceneIds)
    sceneAvatarRendering[sceneId] = { startedAt: queuedAt, queued: true }
  patchTask(projectId, {
    avatarRender: {
      requestId,
      jobId: null,
      sceneIds: payload.sceneIds,
      regenerateSceneIds: payload.regenerateSceneIds ?? [],
      failures: {},
    },
    sceneAvatarRendering,
    errorKey: null,
    errorCode: null,
  })
  void submitAvatarRender(projectId, requestId, payload)
  return true
}

async function submitAvatarRender(
  projectId: string,
  requestId: string,
  payload: AvatarRenderScenesPayload,
) {
  try {
    const job = await videosApi.startAvatarRender(payload, (event) =>
      handleAvatarRenderEvent(projectId, requestId, event),
    )
    const current = taskOf(projectId).avatarRender
    // Un job muy rápido pudo cerrar antes de que el invoke devolviera su id.
    if (current?.requestId !== requestId) {
      job.stop()
      return
    }

    patchTask(projectId, { avatarRender: { ...current, jobId: job.jobId } })
    if (current.cancelled) cancelJobQuietly(job.jobId)
  } catch (error) {
    finishAvatarRender(
      projectId,
      requestId,
      videosApi.errorMessageKey(error),
      videosApi.errorCode(error),
      null,
    )
  }
}

function handleAvatarRenderEvent(
  projectId: string,
  requestId: string,
  event: PipelineEventPayload,
) {
  const task = taskOf(projectId)
  const avatarRender = task.avatarRender
  if (avatarRender?.requestId !== requestId) return

  switch (event.type) {
    // Su render arrancó (o avisa una fase sin que el arranque haya llegado):
    // sale de la cola y su reloj empieza acá, una sola vez. Lo que ya salió de
    // la cola (o del render) no vuelve: el porcentaje nunca baja.
    case 'avatar-scene-started':
    case 'avatar-scene-progress':
      if (!task.sceneAvatarRendering[event.sceneId]?.queued) return

      patchTask(projectId, {
        sceneAvatarRendering: {
          ...task.sceneAvatarRendering,
          [event.sceneId]: { startedAt: Date.now() },
        },
      })
      return

    // Lista o fallida: sale del render y `revision` relee el proyecto, que trae
    // del disco su clip o su motivo.
    case 'avatar-scene-ready': {
      const sceneAvatarRendering = { ...task.sceneAvatarRendering }
      delete sceneAvatarRendering[event.sceneId]
      patchTask(projectId, {
        sceneAvatarRendering,
        revision: task.revision + 1,
      })
      return
    }

    case 'avatar-scene-failed': {
      const sceneAvatarRendering = { ...task.sceneAvatarRendering }
      delete sceneAvatarRendering[event.sceneId]
      patchTask(projectId, {
        avatarRender: {
          ...avatarRender,
          failures: { ...avatarRender.failures, [event.sceneId]: event.code },
        },
        sceneAvatarRendering,
        revision: task.revision + 1,
      })
      return
    }

    case 'job-completed': {
      const result = event.result as unknown as AvatarRenderScenesResult | null
      finishAvatarRender(projectId, requestId, null, null, result)
      return
    }

    case 'job-failed':
      finishAvatarRender(
        projectId,
        requestId,
        videosApi.errorMessageKey({ code: event.code }),
        event.code,
        null,
      )
      return

    default:
      return
  }
}

// Cierra el job: limpia lo transitorio, relee el proyecto (cada bloque queda
// listo con su clip o fallido con su motivo; un clip nuevo deja desactualizado
// el video exportado, como cualquier cambio del editor) y el saldo de
// avatares, y avisa. Un job que cayó entero (clave, saldo, cancelación) lo
// dice la alerta del editor (`errorKey`); con saldo agotado, además, la de la
// cuenta (ADR-0031).
function finishAvatarRender(
  projectId: string,
  requestId: string,
  errorKey: string | null,
  errorCode: string | null,
  result: AvatarRenderScenesResult | null,
) {
  const task = taskOf(projectId)
  const avatarRender = task.avatarRender
  if (avatarRender?.requestId !== requestId) return

  // Las que no quedaron listas: las que fallaron y las que seguían en cola o
  // generándose cuando el job cerró.
  const unfinishedIds = avatarRender.sceneIds.filter((sceneId) => {
    const failed = avatarRender.failures[sceneId] !== undefined
    return failed || task.sceneAvatarRendering[sceneId] !== undefined
  })
  const sceneAvatarRendering = { ...task.sceneAvatarRendering }
  for (const sceneId of avatarRender.sceneIds)
    delete sceneAvatarRendering[sceneId]
  patchTask(projectId, {
    avatarRender: null,
    sceneAvatarRendering,
    errorKey,
    errorCode,
    revision: task.revision + 1,
  })
  recheckAvatarBalance()
  if (result) announceAvatarRender(avatarRender, result)
  if (!result && errorKey)
    announceKeptAvatarClips(avatarRender, unfinishedIds, errorKey, errorCode)
  dispatchGenerations(projectId)
}

// Una regeneración de listas que cae entera con `job-failed` (la cuenta
// pausa, la clave deja de servir…) o que ni arrancó (ronda 1 de WP-X, M6 de su
// revisión): las que no quedaron listas conservan su clip anterior (el sidecar
// las devuelve a su estado listo, §21.4) y el aviso lo dice con el motivo del
// job, además del error del editor. Cancelar no avisa nada (lo dice el
// editor, como en la 2d), y una que alcanzó a quedar lista tiene clip nuevo.
function announceKeptAvatarClips(
  avatarRender: EditorAvatarRenderState,
  unfinishedIds: number[],
  errorKey: string,
  errorCode: string | null,
) {
  if (avatarRender.cancelled || errorCode === 'cancelled') return

  if (unfinishedIds.length === 0) return

  const allRetakes = unfinishedIds.every((sceneId) =>
    avatarRender.regenerateSceneIds.includes(sceneId),
  )
  if (!allRetakes) return

  toast({
    description: i18next.t('library.editor.avatar.regenerarFalloConservado', {
      reason: i18next.t(errorKey),
    }),
    variant: 'destructive',
  })
}

// El aviso pasajero del final: «listo» si todas las pedidas quedaron listas;
// si alguna falló, el motivo que más se repite (cada bloque dice el suyo). Si
// las que fallaron son listas que se pidió regenerar (entrega 2e, §21.4), el
// sidecar les dejó el clip anterior y el aviso lo dice.
function announceAvatarRender(
  avatarRender: EditorAvatarRenderState,
  result: AvatarRenderScenesResult,
) {
  if (
    avatarRender.sceneIds.every((sceneId) => result.rendered.includes(sceneId))
  ) {
    toast({ description: i18next.t('library.editor.avatar.listo') })
    return
  }

  if (result.failed.length === 0) return

  const reason = i18next.t(
    errorKeyOf(dominantAvatarFailure(avatarRender, result.failed)),
  )
  const keptPrevious = result.failed.every((sceneId) =>
    avatarRender.regenerateSceneIds.includes(sceneId),
  )
  toast({
    description: i18next.t(
      keptPrevious
        ? 'library.editor.avatar.regenerarFalloConservado'
        : 'library.editor.avatar.fallo',
      { reason },
    ),
    variant: 'destructive',
  })
}

// El código que más se repite entre las escenas que fallaron; a igualdad, el
// de la primera. Sin ninguno anotado, el genérico.
function dominantAvatarFailure(
  avatarRender: EditorAvatarRenderState,
  failedIds: number[],
): string | undefined {
  const counts = new Map<string, number>()
  for (const sceneId of failedIds) {
    const code = avatarRender.failures[sceneId]
    if (code) counts.set(code, (counts.get(code) ?? 0) + 1)
  }

  let dominant: string | undefined
  let dominantCount = 0
  for (const [code, count] of counts) {
    if (count <= dominantCount) continue

    dominant = code
    dominantCount = count
  }
  return dominant
}

// Tras cada job el saldo de avatares se relee al instante y otra vez a los
// BALANCE_RECHECK_MS (HeyGen puede descontar con retraso), con la misma clave
// que la píldora de Avatares y que la confirmación del panel.
function recheckAvatarBalance() {
  const refetch = () =>
    void queryClient.invalidateQueries({ queryKey: avatarsQueryKeys.balance })
  refetch()
  setTimeout(refetch, BALANCE_RECHECK_MS)
}

// ── Render ──

async function startRender(projectId: string): Promise<boolean> {
  if (isProjectBusy(projectId)) return false

  patchTask(projectId, {
    render: { jobId: null, percent: 0, phase: 'chunks' },
    errorKey: null,
    errorCode: null,
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
      errorCode: videosApi.errorCode(error),
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
      dispatchGenerations(projectId)
      return
    }

    case 'job-failed':
      patchTask(projectId, {
        render: null,
        errorKey: videosApi.errorMessageKey({ code: event.code }),
        errorCode: event.code,
        revision: task.revision + 1,
      })
      dispatchGenerations(projectId)
      return

    default:
      return
  }
}

// ── Export de clips ──

async function startExport(projectId: string): Promise<boolean> {
  if (isProjectBusy(projectId)) return false

  patchTask(projectId, {
    export: { jobId: null, percent: 0, cancelled: false },
    errorKey: null,
    errorCode: null,
  })
  try {
    const job = await videosApi.startExportClips({ projectId }, (event) =>
      handleExportEvent(projectId, event),
    )
    const current = taskOf(projectId)
    if (!current.export || current.export.jobId !== null) {
      job.stop()
      return true
    }

    patchTask(projectId, { export: { ...current.export, jobId: job.jobId } })
    // «Cancelar» llegó antes que el id: el job se corta apenas se conoce.
    if (current.export.cancelled) cancelJobQuietly(job.jobId)
  } catch (error) {
    patchTask(projectId, {
      export: null,
      errorKey: videosApi.errorMessageKey(error),
      errorCode: videosApi.errorCode(error),
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
      // Como el origen: la carpeta exportada se abre sola, salvo que la persona
      // haya pedido cancelar y el job terminara antes de cortarse.
      if (result?.directory && !task.export?.cancelled)
        void videosApi.openFolder(result.directory)
      dispatchGenerations(projectId)
      return
    }

    case 'job-failed':
      // Cancelar no es un error: el botón vuelve, sin aviso (el de «Generación
      // cancelada» habla de reanudar, y una exportación vuelve a empezar).
      if (event.code === 'cancelled') {
        patchTask(projectId, { export: null })
        dispatchGenerations(projectId)
        return
      }

      patchTask(projectId, {
        export: null,
        errorKey: videosApi.errorMessageKey({ code: event.code }),
        errorCode: event.code,
      })
      dispatchGenerations(projectId)
      return

    default:
      return
  }
}

// ── Audio (replace-narration / set-music): exclusión + revision ──

function beginAudioOperation(projectId: string): boolean {
  if (isProjectBusy(projectId)) return false
  patchTask(projectId, { audioBusy: true, errorKey: null, errorCode: null })
  return true
}

function endAudioOperation(projectId: string, errorKey: string | null) {
  const task = taskOf(projectId)
  patchTask(projectId, {
    audioBusy: false,
    errorKey,
    revision: task.revision + 1,
  })
  dispatchGenerations(projectId)
}

function cancelActiveJob(projectId: string) {
  const requests = animationRequests.get(projectId) ?? []
  if (requests.length) {
    animationRequests.set(
      projectId,
      requests.filter((request) => request.started),
    )
    const task = taskOf(projectId)
    const sceneAnimationStatus = { ...task.sceneAnimationStatus }
    const sceneAnimationProgress = { ...task.sceneAnimationProgress }
    for (const request of requests) {
      request.cancelled = true
      if (request.jobId) void videosApi.cancelJob(request.jobId)
      if (request.started) continue
      request.onReviewFinished?.({ succeeded: false, sceneIds: [] })
      for (const id of request.sceneIds) {
        delete sceneAnimationStatus[id]
        delete sceneAnimationProgress[id]
      }
    }
    patchTask(projectId, {
      animation: animationStateOf(projectId),
      sceneAnimationStatus,
      sceneAnimationProgress,
    })
  }
  const task = taskOf(projectId)
  const sceneStatus = { ...task.sceneStatus }
  for (const entry of task.regenQueue) delete sceneStatus[entry.id]
  patchTask(projectId, {
    regenQueue: [],
    sceneStatus,
    activeRegen: task.activeRegen
      ? { ...task.activeRegen, cancelled: true }
      : null,
  })
  const jobId = task.activeRegen?.jobId ?? task.render?.jobId
  if (jobId) void videosApi.cancelJob(jobId)

  cancelExport(projectId)

  // El avatar: el job se corta y su cierre llega como `job-failed`. Lo que
  // HeyGen ya cobró queda en sus recibos y la próxima vez se cosecha sin
  // pagar de nuevo. Si el invoke todavía no devolvió el id, se cancela al
  // llegar (submitAvatarRender). Se pide una sola vez: un segundo «Cancelar»
  // (o una tecla repetida) no vuelve a llamar al sidecar (M1 de la revisión
  // del WP-Q).
  const avatarRender = taskOf(projectId).avatarRender
  if (!avatarRender || avatarRender.cancelled) return

  patchTask(projectId, { avatarRender: { ...avatarRender, cancelled: true } })
  if (avatarRender.jobId) cancelJobQuietly(avatarRender.jobId)
}

// La exportación «para editar», como el avatar: se pide una sola vez y, si el
// invoke todavía no devolvió el id, startExport la corta al llegar. Su cierre
// llega como `job-failed` con `cancelled` y el botón vuelve sin aviso.
function cancelExport(projectId: string) {
  const exportState = taskOf(projectId).export
  if (!exportState || exportState.cancelled) return

  patchTask(projectId, { export: { ...exportState, cancelled: true } })
  if (exportState.jobId) cancelJobQuietly(exportState.jobId)
}

// Cancelar un job que ya terminó responde `JobNotFound`: no hay nada que
// cortar y la promesa no queda rechazada sin atender.
function cancelJobQuietly(jobId: string) {
  videosApi.cancelJob(jobId).catch(() => undefined)
}

function clearError(projectId: string) {
  patchTask(projectId, { errorKey: null, errorCode: null })
}

function subscribe(listener: () => void): () => void {
  subscribers.add(listener)
  return () => {
    subscribers.delete(listener)
  }
}

// Observación de solo lectura para la revisión guiada. Se registra después
// de confirmar el encolado y compara con la versión previa al click: incluso
// un job que terminó antes de suscribirse entrega su resultado correcto.
export function watchImageRegeneration(
  projectId: string,
  sceneId: number,
  previousRevision: number,
  previousVersion: number | undefined,
) {
  let stopListening = () => {}
  let finish: (success: boolean) => void = () => {}
  const result = new Promise<boolean>((resolve) => {
    finish = (success) => {
      stopListening()
      resolve(success)
    }
    const check = () => {
      const task = taskOf(projectId)
      if (task.activeRegen?.sceneIds.includes(sceneId)) return
      if (task.regenQueue.some((entry) => entry.id === sceneId)) return
      if (task.revision <= previousRevision) return
      finish(
        task.sceneVersions[sceneId] !== previousVersion &&
          !task.sceneErrors[sceneId],
      )
    }
    stopListening = subscribe(check)
    check()
  })
  return { result, stopObserving: () => finish(false) }
}

// Observa la solicitud exacta, incluso si termina antes de devolver el handle.
// Dejar de observar NO cancela el job ni sus recibos pagados.
export function observeSceneAnimation(
  projectId: string,
  sceneIds: number[],
  provider: VideoProviderId,
): SceneAnimationReviewAttempt {
  let finish: (outcome: SceneAnimationReviewOutcome) => void = () => {}
  const result = new Promise<SceneAnimationReviewOutcome>((resolve) => {
    finish = resolve
  })
  const accepted = startAnimation(
    projectId,
    sceneIds,
    provider,
    true,
    undefined,
    undefined,
    finish,
  )
  void accepted.then(
    (started) => {
      if (!started) finish({ succeeded: false, sceneIds: [] })
    },
    () => finish({ succeeded: false, sceneIds: [] }),
  )
  return {
    accepted,
    result,
    stopObserving: () => finish({ succeeded: false, sceneIds: [] }),
  }
}

export function useLibraryEditorTask(projectId: string) {
  const task = useSyncExternalStore(
    subscribe,
    () => tasks.get(projectId) ?? null,
  )

  return {
    task,
    beginSceneEdit,
    endSceneEdit,
    enqueueRegen,
    setPendingImageProvider,
    setPendingVideoProvider,
    startAnimation,
    observeSceneAnimation,
    dismissAnimationFailure,
    clearRestoredAnimations,
    startAvatarRender,
    startRender,
    startExport,
    beginAudioOperation,
    endAudioOperation,
    cancelActiveJob,
    clearError,
    isProjectBusy,
    canStartAnimation,
    canQueueRegeneration,
  }
}
