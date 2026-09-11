import { copyFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

import { sceneImageFile } from '../../project/paths.ts'
import {
  toSceneSummaries,
  toSceneSummary,
  writeScenes,
} from '../../project/scenes-file.ts'
import { PipelineFailure, toPipelineFailure } from '../../runner/failure.ts'
import type { StageId } from '../../runner/stage-id.ts'
import type { CreateVideoContext } from '../../stages/context.ts'
import type { DemoStories, DemoStyleEntry } from '../../types/demo.ts'
import type { Scene, TranscriptWord } from '../../types/scenes.ts'
import { videoFormatOf } from '../../types/video-format.ts'
import type { RunVideoPipelineResult } from '../../types/video-project.ts'
import { ensureDirectory, writeFileAtomic } from '../../utils/atomic-fs.ts'
import {
  DEMO_CUSTOM_STYLE_FOLDER,
  DEMO_PACK_MANIFEST_FILE,
  PACK_AUDIO_FILE,
  PACK_SCRIPT_FILE,
  PACK_VIDEO_FILE,
  demoPackRoot,
  demoStoryDirectory,
  demoStyleFolderFor,
  isPackInstalled,
  packImageFile,
  readDemoManifest,
  readPackScenes,
  readPackWords,
} from './pack.ts'

// La generación SIMULADA del modo demo (ADR-0029; port de pipelineDemo.ts
// del origen). En vez de las stages reales se recorren las seis fases con
// esperas (~40 s en total) mientras los archivos del proyecto se materializan
// desde el pack: audio, palabras, escenas, imágenes y video. Reglas duras:
//  - Cero proveedores y cero claves: nada de acá importa stages/ ni providers/.
//  - Cada archivo se copia ANTES de emitir el evento que lo referencia (la
//    grilla pide la imagen al instante del scene-image-ready).
//  - Solo eventos de runner/events.ts, y nunca awaiting-scene-confirmation.
//  - Toda espera respeta context.signal: cancelar deja `paused` como una
//    corrida real; volver a correr es idempotente (las copias pisan).
//  - La carpeta se elige por formato (raíz = 16:9, `short/` = 9:16) y estilo;
//    con `own-audio` no hay ramp de voz (ADR-0030).

// Presupuesto ≈ 40 s (pedido del dueño): las fases por escena reparten su
// presupuesto entre las N escenas del pack; las imágenes van de a 10 como la
// fase real.
const VOICE_TICKS = [25, 50, 75, 100]
const VOICE_TICK_MS = 1000
const TRANSCRIPTION_WAITS_MS = [1200, 1300]
const SCENE_CUTS_WAIT_MS = 1500
const PROMPTS_BUDGET_MS = 5000
const PROMPT_MIN_MS = 250
const IMAGE_BATCH_SIZE = 10
const IMAGES_BUDGET_MS = 19_000
const IMAGE_BATCH_MIN_MS = 1800
const IMAGE_STARTED_MS = 60
const IMAGE_READY_MS = 100
const IMAGE_WAVE_MIN_MS = 200
const IMAGE_PROGRESS_WAVES = [25, 55, 85]
const RENDER_CHUNK_TICKS = [12, 34, 58, 79]
const RENDER_CHUNK_MS = 1000
const RENDER_CONCAT_WAIT_MS = 600
const RENDER_CONCAT_PERCENT = 92
const RENDER_FINAL_WAIT_MS = 400

export async function runDemoPipeline(
  context: CreateVideoContext,
): Promise<RunVideoPipelineResult> {
  const demo = context.config.demo

  // Mismo manejo de estado que run-video-pipeline, repetido a propósito: el
  // camino real no se toca (ADR-0029). Se marca ANTES de leer el pack para
  // que un pack ausente o un estilo fuera de catálogo también dejen
  // state = 'error' + errorCode persistidos, igual que cualquier otro fallo
  // (la biblioteca tiene que mostrar el error tras un reload).
  context.metadata.state = 'generating'
  context.metadata.errorCode = undefined
  await context.saveMetadata()

  try {
    const packRoot = demoPackRoot(context)
    if (!(await isPackInstalled(packRoot, demo)))
      throw new PipelineFailure(
        'demo_not_ready',
        'the demo pack is not installed in this projects root',
      )

    const styleFolder = demoStyleFolderFor(context.options)
    const format = videoFormatOf(context.options)
    const manifest = await readDemoManifest(packRoot, demo)
    const stories = manifest.stories[format]
    // Crear en demo solo ofrece los formatos con historias en el pack (Short
    // queda en «Próximamente» con un pack v2): llegar acá es un payload a
    // mano o un pack cambiado por debajo, y queda como error del proyecto.
    if (!stories)
      throw new PipelineFailure(
        'demo_format_not_included',
        `the demo pack has no ${format} stories`,
      )
    const storyDirectory = demoStoryDirectory(packRoot, format, styleFolder)
    const entry = resolveStyleEntry(stories, styleFolder)
    const packScenes = await readPackScenes(storyDirectory)
    const packWords = await readPackWords(storyDirectory)
    const packScript = await readFile(
      join(storyDirectory, PACK_SCRIPT_FILE),
      'utf8',
    )

    const wait = (ms: number) =>
      sleep(Math.round(ms * demo.delayScale), undefined, {
        signal: context.signal,
      })

    const stage = async (stageId: StageId, body: () => Promise<void>) => {
      context.signal.throwIfAborted()
      context.emitter.emit({ type: 'stage-started', stageId })
      await body()
      context.emitter.emit({ type: 'stage-completed', stageId })
      if (!context.metadata.completedStages.includes(stageId))
        context.metadata.completedStages.push(stageId)
      await context.saveMetadata()
    }

    const scenes: Scene[] = packScenes.map((scene) => ({
      id: scene.id,
      text: scene.texto,
      startSeconds: scene.tiempoInicioSeg,
      endSeconds: scene.tiempoFinSeg,
    }))
    const sceneCount = Math.max(1, scenes.length)

    // ── voice (~4 s; sin ramp con audio propio) ──
    await stage('voice', async () => {
      // Con «Subir mi audio» la narración ya está en el proyecto
      // (upload-narration) y el pipeline real no sintetiza nada: acá tampoco
      // hay ramp. La copia se hace igual: en demo la narración es SIEMPRE la
      // de la historia del pack (ADR-0030), aunque se haya subido otro archivo.
      if (context.options.narrationMode === 'tts') {
        for (const [index, percent] of VOICE_TICKS.entries()) {
          await wait(VOICE_TICK_MS)
          context.emitter.emit({
            type: 'voice-progress',
            provider: manifest.voice.provider,
            totalChars: packScript.length,
            elapsedSeconds: index + 1,
            percent,
          })
        }
      }
      await copyFile(
        join(storyDirectory, PACK_AUDIO_FILE),
        context.paths.narrationFile,
      )
    })

    // ── transcription (~2.5 s) ──
    await stage('transcription', async () => {
      await wait(TRANSCRIPTION_WAITS_MS[0])
      context.emitter.emit({
        type: 'log',
        level: 'info',
        message: 'transcribing the narration word by word',
      })
      await wait(TRANSCRIPTION_WAITS_MS[1])
      // El formato nativo no lleva confidence.
      const words: TranscriptWord[] = packWords.map((word) => ({
        word: word.word,
        start: word.start,
        end: word.end,
      }))
      await writeFileAtomic(
        context.paths.wordsFile,
        `${JSON.stringify(words, null, 2)}\n`,
      )
      context.metadata.audioDurationSeconds =
        entry.audioDurationSeconds > 0
          ? entry.audioDurationSeconds
          : words[words.length - 1].end
      context.metadata.wordCount = words.length
    })

    // ── scene-cuts (~1.5 s) ──
    await stage('scene-cuts', async () => {
      await wait(SCENE_CUTS_WAIT_MS)
      await writeScenes(context.paths, scenes)
      context.emitter.emit({
        type: 'scenes-planned',
        scenes: await toSceneSummaries(context.paths, scenes),
        audioDurationSeconds: context.metadata.audioDurationSeconds ?? 0,
      })
      context.metadata.sceneCount = scenes.length
    })

    // ── scene-prompts (~5 s repartidos) ──
    await stage('scene-prompts', async () => {
      const perSceneMs = Math.max(
        PROMPT_MIN_MS,
        Math.round(PROMPTS_BUDGET_MS / sceneCount),
      )
      for (const [index, scene] of scenes.entries()) {
        await wait(perSceneMs)
        scene.imagePrompt = packScenes[index].promptImagen ?? ''
        context.emitter.emit({
          type: 'scene-prompt-ready',
          scene: await toSceneSummary(context.paths, scene),
        })
        context.emitter.emit({
          type: 'scene-prompts-progress',
          ready: index + 1,
          total: scenes.length,
        })
      }
      await writeScenes(context.paths, scenes)
    })

    // ── images (~19 s, en lotes de 10 como la fase real) ──
    await stage('images', async () => {
      await ensureDirectory(context.paths.scenesDirectory)
      const batches = Math.ceil(scenes.length / IMAGE_BATCH_SIZE)
      const perBatchMs = Math.max(
        IMAGE_BATCH_MIN_MS,
        Math.round(IMAGES_BUDGET_MS / Math.max(1, batches)),
      )
      for (let start = 0; start < scenes.length; start += IMAGE_BATCH_SIZE) {
        const batch = scenes.slice(start, start + IMAGE_BATCH_SIZE)
        for (const scene of batch) {
          context.emitter.emit({
            type: 'scene-image-started',
            sceneId: scene.id,
          })
          await wait(IMAGE_STARTED_MS)
        }
        const waveMs = Math.max(
          IMAGE_WAVE_MIN_MS,
          Math.round(
            (perBatchMs - batch.length * (IMAGE_STARTED_MS + IMAGE_READY_MS)) /
              IMAGE_PROGRESS_WAVES.length,
          ),
        )
        for (const percent of IMAGE_PROGRESS_WAVES) {
          await wait(waveMs)
          for (const scene of batch)
            context.emitter.emit({
              type: 'scene-image-progress',
              sceneId: scene.id,
              percent,
              status: 'processing',
            })
        }
        for (const scene of batch) {
          const imagePath = sceneImageFile(context.paths, scene.id)
          await copyFile(packImageFile(storyDirectory, scene.id), imagePath)
          context.emitter.emit({
            type: 'scene-image-ready',
            sceneId: scene.id,
            imagePath,
          })
          await wait(IMAGE_READY_MS)
        }
      }
    })

    // ── render (~5 s) ──
    await stage('render', async () => {
      for (const percent of RENDER_CHUNK_TICKS) {
        await wait(RENDER_CHUNK_MS)
        context.emitter.emit({
          type: 'render-progress',
          percent,
          phase: 'chunks',
        })
      }
      await wait(RENDER_CONCAT_WAIT_MS)
      context.emitter.emit({
        type: 'render-progress',
        percent: RENDER_CONCAT_PERCENT,
        phase: 'concat',
      })
      await copyFile(
        join(storyDirectory, PACK_VIDEO_FILE),
        context.paths.videoFile,
      )
      await wait(RENDER_FINAL_WAIT_MS)
      context.emitter.emit({
        type: 'render-progress',
        percent: 100,
        phase: 'final',
      })
    })

    context.metadata.state = 'completed'
    context.metadata.videoOutdated = false
    await context.saveMetadata()
    return { status: 'completed', videoPath: context.paths.videoFile }
  } catch (error) {
    if (context.signal.aborted) {
      context.metadata.state = 'paused'
      await context.saveMetadata()
      throw error
    }
    context.metadata.state = 'error'
    context.metadata.errorCode = toPipelineFailure(error).code
    await context.saveMetadata()
    throw error
  }
}

// La carpeta de la gema no tiene entrada en stories.styles (vive aparte, en
// stories.customStyle); cualquier otra carpeta sin entrada es un pack
// incompleto — nunca se cae de vuelta a un estilo cualquiera del manifest
// por accidente (validatePack ya exige las tres, pero un pack corrupto
// puede haber sido instalado antes de que ese chequeo existiera).
function resolveStyleEntry(
  stories: DemoStories,
  folder: string,
): DemoStyleEntry {
  if (folder === DEMO_CUSTOM_STYLE_FOLDER) return stories.customStyle

  const entry = stories.styles.find((style) => style.id === folder)
  if (entry) return entry

  throw new PipelineFailure(
    'demo_pack_incomplete',
    `${DEMO_PACK_MANIFEST_FILE} has no entry for style folder "${folder}"`,
  )
}
