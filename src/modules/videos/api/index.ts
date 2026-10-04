import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { openPath, revealItemInDir } from '@tauri-apps/plugin-opener'
import {
  PipelineJobError,
  pipelineErrorCode,
  runPipelineJob,
  startPipelineJob,
} from '@/modules/common/fetcher/pipeline'
import {
  vimoServerFetch,
  vimoServerStream,
} from '@/modules/common/fetcher/vimoServer'
import {
  VimoServerError,
  vimoServerErrorCode,
  vimoServerRetryAt,
} from '@/modules/common/fetcher/vimoServerError'
import { bytesToBase64 } from '@/modules/common/utilities/bytesToBase64'
import { isNative } from '@/modules/common/utilities/isNative'
import {
  CATALOG_COPY_UNDETAILED_ERROR_CODES,
  CREATE_ERROR_MESSAGE_KEYS,
  DEMO_ERROR_MESSAGE_KEYS,
  GEM_REBUILD_ERROR_MESSAGE_KEYS,
  GEM_REBUILD_NO_VISUAL_STYLE_CODE,
  GEM_REBUILD_PATH,
  GEM_REBUILD_QUOTA_CODE,
  GEM_REBUILD_QUOTA_LATER_KEY,
  GEM_REBUILD_TIMEOUT_MS,
  LIBRARY_ERROR_MESSAGE_KEYS,
  NARRATION_AUDIO_EXTENSIONS,
  STYLE_CLONE_ERROR_MESSAGE_KEYS,
  STYLE_CLONE_IDLE_TIMEOUT_MS,
  STYLE_CLONE_IMAGE_EXTENSIONS,
  STYLE_CLONE_PATH,
  STYLE_CLONE_TIMEOUT_MS,
  UNKNOWN_CREATE_ERROR_KEY,
  UNKNOWN_DEMO_ERROR_KEY,
  UNKNOWN_GEM_REBUILD_ERROR_KEY,
  UNKNOWN_STYLE_CLONE_ERROR_KEY,
} from '@/modules/videos/constants'
import {
  catalogSampleImages,
  catalogSampleUpload,
} from '@/modules/videos/utilities/catalogSamples'
import { readGemRebuildResponse } from '@/modules/videos/utilities/gemTemplate'
import {
  styleCloneServerImageOf,
  styleCloneTurnOutcome,
} from '@/modules/videos/utilities/styleCloneTurn'
import type { PipelineJobHandle } from '@/modules/common/fetcher/pipeline'
import type {
  GemRebuildRequest,
  GemRebuildResponse,
} from '@/modules/videos/types/gemRebuild'
import type {
  StyleCloneTurnDraft,
  StyleCloneTurnRequest,
  StyleCloneTurnResult,
} from '@/modules/videos/types/styleClone'
import type { PipelineEventPayload } from '@pipeline/runner/events.ts'
import type {
  AnimateScenesPayload,
  UndoSceneAnimationResult,
} from '@pipeline/types/animation.ts'
import type {
  CatalogCopyToCustomPayload,
  CatalogCopyToCustomResult,
  CatalogGem,
  CatalogListResult,
  CatalogSampleUpload,
} from '@pipeline/types/catalog.ts'
import type { CharactersListResult } from '@pipeline/types/characters.ts'
import type { DemoStatusResult } from '@pipeline/types/demo.ts'
import type {
  StyleCloneDiscardPayload,
  StyleCloneDrawPayload,
  StyleCloneDrawProgressDetail,
  StyleCloneDrawResult,
  StyleCloneMaterialItem,
  StyleClonePreparePayload,
  StyleClonePrepareResult,
  StyleCloneSavePayload,
  StyleCloneSaveResult,
} from '@pipeline/types/style-clone.ts'
import type {
  GenerateStyleSamplesPayload,
  StyleDeletePayload,
  StyleSavePayload,
  StyleSaveResult,
  StylesListResult,
} from '@pipeline/types/styles.ts'
import type {
  MusicGenerationParams,
  SuggestMusicPromptResult,
} from '@pipeline/types/music.ts'
import type {
  ConfirmScenesPayload,
  SetPromptModelPayload,
  PreviewSceneCutsPayload,
  PreviewSceneCutsResult,
  CreateVideoProjectPayload,
  CreateVideoProjectResult,
  DeleteVideoProjectsResult,
  ExportClipsPayload,
  ListVideoProjectsResult,
  ProbeTtsPayload,
  ProbeTtsResult,
  RegenerateSceneImagesPayload,
  RenderVideoPayload,
  ReplaceNarrationPayload,
  RunVideoPipelinePayload,
  SceneChange,
  SetProjectMusicPayload,
  UpdateAudioMixPayload,
  UpdateScenesResult,
  UploadNarrationPayload,
  VideoProjectDetailResult,
  VideoProjectListItem,
  VideoProjectStatusResult,
} from '@pipeline/types/video-project.ts'

export const videosApi = {
  isNative() {
    return isNative()
  },
  async createProject(
    payload: CreateVideoProjectPayload,
  ): Promise<CreateVideoProjectResult> {
    return runPipelineJob<CreateVideoProjectResult>(
      'create-video-project',
      payload,
    )
  },
  async uploadNarration(payload: UploadNarrationPayload): Promise<void> {
    await runPipelineJob('upload-narration', payload)
  },
  async pickNarrationFile(): Promise<string | null> {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'audio', extensions: NARRATION_AUDIO_EXTENSIONS }],
    })
    return typeof selected === 'string' ? selected : null
  },
  async startPipeline(
    payload: RunVideoPipelinePayload,
    onEvent: (event: PipelineEventPayload) => void,
  ): Promise<PipelineJobHandle> {
    return startPipelineJob('run-video-pipeline', payload, onEvent)
  },
  async confirmScenes(payload: ConfirmScenesPayload): Promise<void> {
    await runPipelineJob('confirm-scenes', payload)
  },
  async setPromptModel(payload: SetPromptModelPayload): Promise<void> {
    await runPipelineJob('set-prompt-model', payload)
  },
  async previewSceneCuts(
    payload: PreviewSceneCutsPayload,
  ): Promise<PreviewSceneCutsResult> {
    return runPipelineJob<PreviewSceneCutsResult>('preview-scene-cuts', payload)
  },
  async probeTts(payload: ProbeTtsPayload): Promise<ProbeTtsResult> {
    return runPipelineJob<ProbeTtsResult>('probe-tts', payload)
  },
  async projectStatus(projectId: string): Promise<VideoProjectStatusResult> {
    return runPipelineJob<VideoProjectStatusResult>('video-project-status', {
      projectId,
    })
  },
  async listProjects(): Promise<VideoProjectListItem[]> {
    const result = await runPipelineJob<ListVideoProjectsResult>(
      'list-video-projects',
    )
    return result.projects
  },
  async deleteProjects(projectIds: string[]): Promise<number> {
    const result = await runPipelineJob<DeleteVideoProjectsResult>(
      'delete-video-projects',
      { projectIds },
    )
    return result.deleted
  },
  async projectDetail(projectId: string): Promise<VideoProjectDetailResult> {
    return runPipelineJob<VideoProjectDetailResult>('video-project-detail', {
      projectId,
    })
  },
  async updateScenes(
    projectId: string,
    changes: SceneChange[],
  ): Promise<UpdateScenesResult> {
    return runPipelineJob<UpdateScenesResult>('update-scenes', {
      projectId,
      changes,
    })
  },
  async startRegeneration(
    payload: RegenerateSceneImagesPayload,
    onEvent: (event: PipelineEventPayload) => void,
  ): Promise<PipelineJobHandle> {
    return startPipelineJob('regenerate-scene-images', payload, onEvent)
  },
  async startAnimation(
    payload: AnimateScenesPayload,
    onEvent: (event: PipelineEventPayload) => void,
  ): Promise<PipelineJobHandle> {
    return startPipelineJob('animate-scenes', payload, onEvent)
  },
  async undoAnimation(
    projectId: string,
    sceneId: number,
  ): Promise<UndoSceneAnimationResult> {
    return runPipelineJob<UndoSceneAnimationResult>('undo-scene-animation', {
      projectId,
      sceneId,
    })
  },
  async startRender(
    payload: RenderVideoPayload,
    onEvent: (event: PipelineEventPayload) => void,
  ): Promise<PipelineJobHandle> {
    return startPipelineJob('render-video', payload, onEvent)
  },
  async startExportClips(
    payload: ExportClipsPayload,
    onEvent: (event: PipelineEventPayload) => void,
  ): Promise<PipelineJobHandle> {
    return startPipelineJob('export-clips', payload, onEvent)
  },
  async startReplaceNarration(
    payload: ReplaceNarrationPayload,
    onEvent: (event: PipelineEventPayload) => void,
  ): Promise<PipelineJobHandle> {
    return startPipelineJob('replace-narration', payload, onEvent)
  },
  async setProjectMusic(payload: SetProjectMusicPayload): Promise<void> {
    await runPipelineJob('set-project-music', payload)
  },
  async updateAudioMix(payload: UpdateAudioMixPayload): Promise<void> {
    await runPipelineJob('update-audio-mix', payload)
  },
  async generateProjectMusic(
    params: MusicGenerationParams,
    onEvent: (event: PipelineEventPayload) => void,
  ): Promise<PipelineJobHandle> {
    return startPipelineJob('generate-music', params, onEvent)
  },
  async suggestMusicPrompt(script: string): Promise<string> {
    const result = await runPipelineJob<SuggestMusicPromptResult>(
      'suggest-music-prompt',
      { script },
    )
    return result.prompt
  },
  async openFolder(path: string): Promise<void> {
    return openPath(path)
  },
  async listCustomStyles(): Promise<StylesListResult> {
    return runPipelineJob('styles-list')
  },
  async saveCustomStyle(payload: StyleSavePayload): Promise<StyleSaveResult> {
    return runPipelineJob('style-save', payload)
  },
  async deleteCustomStyle(payload: StyleDeletePayload): Promise<void> {
    await runPipelineJob('style-delete', payload)
  },
  async generateStyleSamples(
    payload: GenerateStyleSamplesPayload,
    onEvent: (event: PipelineEventPayload) => void,
  ): Promise<PipelineJobHandle> {
    return startPipelineJob('generate-style-samples', payload, onEvent)
  },
  // Catálogo de Vimo (Entrega 2, plan E2 §5.3): las gemas en el orden de la
  // pestaña, y la copia de una a Mi estilo.
  async listCatalogStyles(): Promise<CatalogListResult> {
    return runPipelineJob('catalog-styles-list')
  },
  async copyCatalogStyle(
    payload: CatalogCopyToCustomPayload,
  ): Promise<CatalogCopyToCustomResult> {
    return runPipelineJob('catalog-style-copy', payload)
  },
  // Las muestras de una gema para «Pasar a mi estilo»: viven en la app (plan
  // E2, P1), así que se leen de sus propios archivos con `fetch` (mismo
  // origen; no es el sidecar ni un servicio externo, por eso no pasa por el
  // fetcher) y viajan en base64. Una que no se puede bajar o leer, o que el
  // sidecar rechazaría, se omite: la copia sale con menos muestras.
  async catalogSampleUploads(gem: CatalogGem): Promise<CatalogSampleUpload[]> {
    const uploads = await Promise.all(
      catalogSampleImages(gem).map(async (url, index) => {
        try {
          const response = await fetch(url)
          if (!response.ok) return null
          const bytes = new Uint8Array(await response.arrayBuffer())
          return catalogSampleUpload(bytes, index + 1)
        } catch {
          return null
        }
      }),
    )
    return uploads.filter((upload) => upload !== null)
  },
  // Agente reconstructor de vimo.click (ADR-0048): la gema entera vuelve por
  // secciones. Una respuesta 200 que no cumple el contrato no se usa.
  async rebuildGem(request: GemRebuildRequest): Promise<GemRebuildResponse> {
    const body = await vimoServerFetch<unknown>(GEM_REBUILD_PATH, {
      body: request,
      timeoutMs: GEM_REBUILD_TIMEOUT_MS,
    })
    const response = readGemRebuildResponse(body)
    if (!response) throw new VimoServerError('http', { status: 200 })
    return response
  },
  gemRebuildErrorKey(error: unknown): string {
    const code = vimoServerErrorCode(error)
    if (!code) return UNKNOWN_GEM_REBUILD_ERROR_KEY
    if (code === GEM_REBUILD_QUOTA_CODE && vimoServerRetryAt(error) === null)
      return GEM_REBUILD_QUOTA_LATER_KEY
    // El código viene del cuerpo de la respuesta: `constructor` o `__proto__`
    // no son códigos del servidor aunque el objeto del mapa los herede.
    if (!Object.hasOwn(GEM_REBUILD_ERROR_MESSAGE_KEYS, code))
      return UNKNOWN_GEM_REBUILD_ERROR_KEY
    return GEM_REBUILD_ERROR_MESSAGE_KEYS[code]
  },
  gemRebuildErrorRetryable(error: unknown): boolean {
    return vimoServerErrorCode(error) !== GEM_REBUILD_NO_VISUAL_STYLE_CODE
  },
  // ── Creador de estilo con IA (ADR-0050) ──
  // Las imágenes de referencia que elige la persona: viajan al sidecar como
  // rutas, igual que la foto de un personaje.
  async pickStyleCloneImages(): Promise<string[]> {
    const selected = await open({
      multiple: true,
      directory: false,
      filters: [{ name: 'images', extensions: STYLE_CLONE_IMAGE_EXTENSIONS }],
    })
    if (selected === null) return []
    return Array.isArray(selected) ? selected : [selected]
  },
  async prepareStyleClone(
    payload: StyleClonePreparePayload,
  ): Promise<StyleClonePrepareResult> {
    return runPipelineJob('style-clone-prepare', payload)
  },
  // Dibuja una ronda de pruebas; `onProgress` avisa de cada una apenas sale.
  async drawStyleClone(
    payload: StyleCloneDrawPayload,
    onProgress: (detail: StyleCloneDrawProgressDetail) => void,
  ): Promise<StyleCloneDrawResult> {
    return runPipelineJob('style-clone-draw', payload, (event) => {
      if (event.type !== 'progress' || !event.detail) return
      onProgress(event.detail as unknown as StyleCloneDrawProgressDetail)
    })
  },
  async saveStyleClone(
    payload: StyleCloneSavePayload,
  ): Promise<StyleCloneSaveResult> {
    return runPipelineJob('style-clone-save', payload)
  },
  async discardStyleClone(payload: StyleCloneDiscardPayload): Promise<void> {
    await runPipelineJob('style-clone-discard', payload)
  },
  // Un turno del creador de estilo de vimo.click. Las imágenes del material
  // se leen del disco (mismo origen que cualquier imagen que muestra la app:
  // el protocolo de assets, no un servicio externo) y viajan en base64. La
  // respuesta llega por partes; una que se corta o que no cumple el contrato
  // falla como error del servidor sin código.
  async styleCloneTurn(
    draft: StyleCloneTurnDraft,
    material: StyleCloneMaterialItem[],
    appVersion: string,
    locale: string,
  ): Promise<StyleCloneTurnResult> {
    const images = await Promise.all(
      material.map(async (item) => {
        const response = await fetch(convertFileSrc(item.path))
        if (!response.ok)
          throw new PipelineJobError(
            'style_clone_file_missing',
            `the material image "${item.file}" could not be read`,
          )
        const bytes = new Uint8Array(await response.arrayBuffer())
        return styleCloneServerImageOf(item, bytesToBase64(bytes))
      }),
    )
    const request: StyleCloneTurnRequest = {
      ...draft,
      material: images,
      appVersion,
      locale,
    }
    const lines = await vimoServerStream(STYLE_CLONE_PATH, {
      body: request,
      timeoutMs: STYLE_CLONE_TIMEOUT_MS,
      idleTimeoutMs: STYLE_CLONE_IDLE_TIMEOUT_MS,
    })
    const outcome = styleCloneTurnOutcome(lines)
    if (!outcome.ok)
      throw new VimoServerError('http', {
        status: 200,
        ...(outcome.code ? { code: outcome.code } : {}),
      })
    return outcome.result
  },
  // El código estable de un fallo de la clonación, venga del sidecar o de
  // vimo.click; '' = sin código.
  styleCloneErrorCode(error: unknown): string {
    return vimoServerErrorCode(error) ?? pipelineErrorCode(error) ?? ''
  },
  styleCloneErrorKey(code: string | null): string {
    if (!code) return UNKNOWN_STYLE_CLONE_ERROR_KEY
    // El código puede venir del cuerpo de una respuesta: `constructor` o
    // `__proto__` no son códigos aunque el objeto del mapa los herede.
    if (Object.hasOwn(STYLE_CLONE_ERROR_MESSAGE_KEYS, code))
      return STYLE_CLONE_ERROR_MESSAGE_KEYS[code]
    if (Object.hasOwn(CREATE_ERROR_MESSAGE_KEYS, code))
      return CREATE_ERROR_MESSAGE_KEYS[code]
    return UNKNOWN_STYLE_CLONE_ERROR_KEY
  },
  async demoStatus(): Promise<DemoStatusResult> {
    return runPipelineJob<DemoStatusResult>('demo-status')
  },
  async startDemoPrepare(
    onEvent: (event: PipelineEventPayload) => void,
  ): Promise<PipelineJobHandle> {
    return startPipelineJob('demo-prepare', undefined, onEvent)
  },
  demoErrorMessageKey(error: unknown): string {
    const code = pipelineErrorCode(error)
    if (!code) return UNKNOWN_DEMO_ERROR_KEY
    return DEMO_ERROR_MESSAGE_KEYS[code] ?? UNKNOWN_DEMO_ERROR_KEY
  },
  async cancelJob(jobId: string): Promise<void> {
    return invoke('cancel_pipeline_job', { jobId })
  },
  async listCharacters(): Promise<CharactersListResult> {
    return runPipelineJob<CharactersListResult>('characters-list')
  },
  async openVideo(path: string): Promise<void> {
    return openPath(path)
  },
  async revealVideo(path: string): Promise<void> {
    return revealItemInDir(path)
  },
  // `version` (mtime del sidecar) rompe la caché de convertFileSrc: la ruta
  // de una imagen regenerada no cambia, la URL sí tiene que cambiar.
  imageSource(path: string, version?: number): string {
    const url = convertFileSrc(path)
    return version === undefined ? url : `${url}?v=${version}`
  },
  videoSource(path: string, version?: number): string {
    const url = convertFileSrc(path)
    return version === undefined ? url : `${url}?v=${version}`
  },
  errorMessageKey(error: unknown): string {
    const code = pipelineErrorCode(error)
    if (!code) return UNKNOWN_CREATE_ERROR_KEY
    return LIBRARY_ERROR_MESSAGE_KEYS[code] ?? UNKNOWN_CREATE_ERROR_KEY
  },
  // El porqué de una copia de «Pasar a mi estilo» que falló, o null cuando el
  // texto de ese código está escrito para el formulario de Crear y no aplica a
  // la copia: el titular del aviso ya dice que no salió.
  catalogCopyErrorKey(error: unknown): string | null {
    const code = pipelineErrorCode(error)
    if (!code) return UNKNOWN_CREATE_ERROR_KEY
    if (CATALOG_COPY_UNDETAILED_ERROR_CODES.has(code)) return null
    return LIBRARY_ERROR_MESSAGE_KEYS[code] ?? UNKNOWN_CREATE_ERROR_KEY
  },
  // El código crudo, para las decisiones que no dependen del texto (saldo
  // agotado → alerta de la cuenta que rechazó, ADR-0031).
  errorCode(error: unknown): string | null {
    return pipelineErrorCode(error)
  },
}
