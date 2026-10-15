import { copyFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

import { sceneAnimationClipFile } from '../../animation/clip-path.ts'
import { animationUnitFromBlock } from '../../animation/planner.ts'
import { animationRangeEnd } from '../../animation/scope.ts'
import { TRANSITION_POLICY_VERSION } from '../../animation/transitions.ts'
import {
  avatarLookPreviewFile,
  sceneAvatarClipFile,
} from '../../avatar/clip-path.ts'
import { sceneImageFile } from '../../project/paths.ts'
import {
  animationView,
  toSceneSummaries,
  toSceneSummary,
  writeScenes,
} from '../../project/scenes-file.ts'
import type { AvatarScenePhase } from '../../runner/events.ts'
import { PipelineFailure, toPipelineFailure } from '../../runner/failure.ts'
import type { StageId } from '../../runner/stage-id.ts'
import type { CreateVideoContext } from '../../stages/context.ts'
import type { SceneAnimation } from '../../types/animation.ts'
import type { SceneAvatar } from '../../types/avatar.ts'
import type {
  DemoAvatar,
  DemoStories,
  DemoStyleEntry,
} from '../../types/demo.ts'
import type { Scene, TranscriptWord } from '../../types/scenes.ts'
import { videoFormatOf } from '../../types/video-format.ts'
import { ANIMATION_CONCURRENCY } from '../../types/video-provider.ts'
import type { RunVideoPipelineResult } from '../../types/video-project.ts'
import { ensureDirectory, writeFileAtomic } from '../../utils/atomic-fs.ts'
import {
  DEMO_PACK_MANIFEST_FILE,
  PACK_ANIMATED_VIDEO_FILE,
  PACK_ANIMATIONS_DIRECTORY,
  PACK_AUDIO_FILE,
  PACK_AVATAR_DIRECTORY,
  PACK_SCRIPT_FILE,
  PACK_VIDEO_FILE,
  demoPackRoot,
  demoStoryDirectory,
  demoStoryFolderFor,
  isPackInstalled,
  packAvatarLookFile,
  packImageFile,
  readDemoManifest,
  readPackScenes,
  readPackWords,
  type PackScene,
} from './pack.ts'

// La generación SIMULADA del modo demo (ADR-0029; port de pipelineDemo.ts
// del origen; animación y avatar desde el pack v4,
// docs/handoff/2026-10-14-demo-v4/design.md §4). En vez de las stages reales
// se recorren las ocho fases de la corrida real con esperas mientras los
// archivos del proyecto se materializan desde el pack: audio, palabras,
// escenas, imágenes, apariciones del avatar, clips y video. Reglas duras:
//  - Cero proveedores y cero claves: nada de acá importa stages/ ni providers/.
//  - Cada archivo se copia ANTES de emitir el evento que lo referencia (la
//    grilla pide la imagen al instante del scene-image-ready; la vista de un
//    clip o de una aparición lo busca en disco).
//  - Solo eventos de runner/events.ts, y nunca awaiting-scene-confirmation.
//    Las fases que no aplican avisan `stage-skipped`, como el corredor real.
//  - Toda espera respeta context.signal: cancelar deja `paused` como una
//    corrida real; volver a correr es idempotente (las copias pisan).
//  - La historia se elige por formato (raíz = 16:9, `short/` = 9:16) y por
//    el estilo del catálogo o la gema del proyecto (demoStoryFolderFor); con
//    `own-audio` no hay ramp de voz (ADR-0030).
//  - La animación corre solo si el proyecto la pidió (animationMinutes) y la
//    historia trae la variante animada; el avatar, si la historia lo trae (en
//    la demo nunca viene del payload).

// Presupuesto (pedido del dueño): ≈ 40 s sin animación y ≈ 55 s con ella.
// Las fases por escena reparten su presupuesto entre las N escenas del pack;
// las imágenes y los clips van en tandas de 10 como las fases reales y el
// avatar corre junto con las imágenes, dentro de su tiempo.
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
// Avatar (~15 s, menos que las imágenes): las apariciones arrancan juntas
// —HeyGen renderiza hasta 10 a la vez— con el corte del audio, pasan juntas
// por la subida y el render, y quedan listas de a una: la descarga, la
// normalización y el clip en su parte de la ventana de cada una.
const AVATAR_STARTED_MS = 150
const AVATAR_SHARED_PHASES: readonly AvatarScenePhase[] = ['upload', 'render']
const AVATAR_PHASE_MS = 700
const AVATAR_BUDGET_MS = 15_000
const AVATAR_FINISH_MIN_MS = 900
const AVATAR_DOWNLOAD_SHARE = 0.6
const AVATAR_NORMALIZE_SHARE = 0.2
const AVATAR_READY_SHARE = 0.2
// Animación (~15 s): el plan y, por tanda, los anuncios, las olas de avance
// (con porcentaje: sin él la UI sube con su rampa de ~75 s de Kie) y los
// clips listos de a uno.
const ANIMATION_PLAN_WAIT_MS = 600
const ANIMATION_BUDGET_MS = 14_000
const ANIMATION_BATCH_MIN_MS = 3000
const ANIMATION_STARTED_MS = 120
const ANIMATION_READY_MS = 300
const ANIMATION_WAVE_MIN_MS = 300
const ANIMATION_PROGRESS_WAVES = [15, 35, 55, 75, 90]
// El estado que informa Kie mientras genera (providers/video/kie.ts).
const ANIMATION_PROGRESS_STATUS = 'generating'
const RENDER_CHUNK_TICKS = [12, 34, 58, 79]
const RENDER_CHUNK_MS = 1000
const RENDER_CONCAT_WAIT_MS = 600
const RENDER_CONCAT_PERCENT = 92
const RENDER_FINAL_WAIT_MS = 400

// Una escena del proyecto junto con la del pack de la que sale: lo que cada
// fase restaura (el prompt, la aparición, los clips) se lee de ahí.
interface DemoScene {
  scene: Scene
  packScene: PackScene
}

// Lo que comparten las fases de la simulación.
interface DemoRun {
  context: CreateVideoContext
  storyDirectory: string
  scenes: DemoScene[]
  // Espera escalada por `delayScale`; la corta `signal` (la del job, si no
  // se pasa otra).
  wait(ms: number, signal?: AbortSignal): Promise<void>
}

// Una fase de las que corren a la vez (images y avatar).
interface DemoStage {
  stageId: StageId
  run(signal: AbortSignal): Promise<void>
}

// Un clip del pack: el bloque tal como lo dejó la corrida real, en la escena
// que lo encabeza, con su tramo.
interface DemoClip {
  lead: Scene
  block: SceneAnimation
  clipFile: string
  startSeconds: number
  endSeconds: number
}

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

    const format = videoFormatOf(context.options)
    const manifest = await readDemoManifest(packRoot)
    const stories = manifest.stories[format]
    // Crear en demo solo ofrece los formatos con historias en el pack (sin
    // ellas, el formato queda en «Próximamente»): llegar acá es un payload a
    // mano o un pack cambiado por debajo, y queda como error del proyecto.
    if (!stories)
      throw new PipelineFailure(
        'demo_format_not_included',
        `the demo pack has no ${format} stories`,
      )
    const storyFolder = demoStoryFolderFor(context.options, manifest)
    const storyDirectory = demoStoryDirectory(packRoot, format, storyFolder)
    const entry = resolveStoryEntry(stories, storyFolder)
    const packScenes = await readPackScenes(storyDirectory)
    const packWords = await readPackWords(storyDirectory)
    const packScript = await readFile(
      join(storyDirectory, PACK_SCRIPT_FILE),
      'utf8',
    )
    const animate =
      (context.options.animationMinutes ?? 0) > 0 && entry.animated
    const avatar = entry.avatar

    const wait = (ms: number, signal = context.signal) =>
      sleep(Math.round(ms * demo.delayScale), undefined, { signal })

    // Cada fase como la avisa el corredor real (runner/run-stages.ts):
    // completedStages anota las que corrieron, nunca las salteadas.
    const complete = async (stageId: StageId) => {
      context.emitter.emit({ type: 'stage-completed', stageId })
      if (!context.metadata.completedStages.includes(stageId))
        context.metadata.completedStages.push(stageId)
      await context.saveMetadata()
    }

    const stage = async (stageId: StageId, body: () => Promise<void>) => {
      context.signal.throwIfAborted()
      context.emitter.emit({ type: 'stage-started', stageId })
      await body()
      await complete(stageId)
    }

    const skip = (stageId: StageId) => {
      context.signal.throwIfAborted()
      context.emitter.emit({ type: 'stage-skipped', stageId })
    }

    // Las fases que corren a la vez (runGroup del corredor, entrega 2h):
    // arrancan juntas y cada una termina por su cuenta. Si una falla, las
    // demás se cortan con una señal propia, unida a la del job, y el fallo
    // sale recién cuando todas pararon: ninguna escribe después del cierre.
    const alongside = async (members: DemoStage[]) => {
      context.signal.throwIfAborted()
      for (const member of members)
        context.emitter.emit({ type: 'stage-started', stageId: member.stageId })
      const controller = new AbortController()
      const signal = AbortSignal.any([context.signal, controller.signal])
      const failures: unknown[] = []
      await Promise.all(
        members.map(async (member) => {
          try {
            await member.run(signal)
            await complete(member.stageId)
          } catch (error) {
            failures.push(error)
            controller.abort()
          }
        }),
      )
      if (failures.length > 0) throw failures[0]
    }

    const scenes = packScenes.map((packScene) => {
      return {
        scene: cutScene(packScene, { animate, avatar: avatar !== undefined }),
        packScene,
      }
    })
    const projectScenes = scenes.map(({ scene }) => scene)
    // Las apariciones del avatar no llevan prompt ni imagen (ADR-0057).
    const imageScenes = scenes.filter(({ scene }) => !scene.avatar)
    const run: DemoRun = { context, storyDirectory, scenes, wait }

    // Con avatar, el proyecto queda como lo deja Crear al elegirlo
    // (create-video-project): sus opciones y la vista del look en avatar/,
    // antes de cualquier evento que nombre una aparición.
    if (avatar) await prepareAvatarProject(run, avatar)

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
      await writeScenes(context.paths, projectScenes)
      context.emitter.emit({
        type: 'scenes-planned',
        scenes: await toSceneSummaries(
          context.paths,
          projectScenes,
          context.metadata,
        ),
        audioDurationSeconds: context.metadata.audioDurationSeconds ?? 0,
      })
      // Como el corte real: qué escenas son del avatar y cuántas apariciones
      // pedidas no están en él.
      if (avatar) {
        const sceneIds = projectScenes
          .filter((scene) => scene.avatar)
          .map((scene) => scene.id)
        context.emitter.emit({
          type: 'avatar-planned',
          sceneIds,
          dropped: Math.max(0, avatar.options.appearances - sceneIds.length),
        })
      }
      context.metadata.sceneCount = projectScenes.length
    })

    // ── scene-prompts (~5 s repartidos) ──
    await stage('scene-prompts', async () => {
      const perSceneMs = Math.max(
        PROMPT_MIN_MS,
        Math.round(PROMPTS_BUDGET_MS / Math.max(1, imageScenes.length)),
      )
      for (const [index, { scene, packScene }] of imageScenes.entries()) {
        await wait(perSceneMs)
        scene.imagePrompt = packScene.promptImagen ?? ''
        context.emitter.emit({
          type: 'scene-prompt-ready',
          scene: await toSceneSummary(context.paths, scene, context.metadata),
        })
        // Como el carril real: sobre todas las escenas, con las apariciones
        // del avatar contadas como listas (no llevan prompt).
        context.emitter.emit({
          type: 'scene-prompts-progress',
          ready: scenes.length - imageScenes.length + index + 1,
          total: scenes.length,
        })
      }
      await writeScenes(context.paths, projectScenes)
    })

    // ── images (~19 s, en lotes de 10 como la fase real) ──
    const simulateImages = async (signal: AbortSignal) => {
      await ensureDirectory(context.paths.scenesDirectory)
      const batches = Math.ceil(imageScenes.length / IMAGE_BATCH_SIZE)
      const perBatchMs = Math.max(
        IMAGE_BATCH_MIN_MS,
        Math.round(IMAGES_BUDGET_MS / Math.max(1, batches)),
      )
      for (
        let start = 0;
        start < imageScenes.length;
        start += IMAGE_BATCH_SIZE
      ) {
        const batch = imageScenes
          .slice(start, start + IMAGE_BATCH_SIZE)
          .map(({ scene }) => scene)
        for (const scene of batch) {
          context.emitter.emit({
            type: 'scene-image-started',
            sceneId: scene.id,
          })
          await wait(IMAGE_STARTED_MS, signal)
        }
        const waveMs = Math.max(
          IMAGE_WAVE_MIN_MS,
          Math.round(
            (perBatchMs - batch.length * (IMAGE_STARTED_MS + IMAGE_READY_MS)) /
              IMAGE_PROGRESS_WAVES.length,
          ),
        )
        for (const percent of IMAGE_PROGRESS_WAVES) {
          await wait(waveMs, signal)
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
          await wait(IMAGE_READY_MS, signal)
        }
      }
    }

    // ── avatar (~15 s, junto con las imágenes) ──
    // Como el corredor: sin avatar se saltea antes de que arranquen las
    // imágenes; con él, las dos fases corren a la vez.
    if (avatar) {
      await alongside([
        { stageId: 'images', run: simulateImages },
        { stageId: 'avatar', run: (signal) => simulateAvatar(run, signal) },
      ])
    } else {
      skip('avatar')
      await stage('images', () => simulateImages(context.signal))
    }

    // ── animation (~15 s; solo con animationMinutes y la variante animada) ──
    if (animate) await stage('animation', () => simulateAnimation(run))
    else skip('animation')

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
      // El video de la variante: el animado solo si corrió la animación.
      await copyFile(
        join(
          storyDirectory,
          animate ? PACK_ANIMATED_VIDEO_FILE : PACK_VIDEO_FILE,
        ),
        context.paths.videoFile,
      )
      await wait(RENDER_FINAL_WAIT_MS)
      context.emitter.emit({
        type: 'render-progress',
        percent: 100,
        phase: 'final',
      })
      // La política de transiciones del mp4, como la marca el render real
      // (stages/render/render.ts): sin ella el editor da el video por
      // desactualizado y simula la vista previa en vez de reproducirlo.
      context.metadata.renderTransitionVersion = TRANSITION_POLICY_VERSION
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

// La entrada del manifest de la historia elegida: la de un estilo del
// catálogo o la de una gema (un id no se repite en un formato, validatePack
// lo exige). Sin entrada el pack está incompleto: nunca se cae de vuelta a
// otra historia del manifest por accidente.
function resolveStoryEntry(
  stories: DemoStories,
  folder: string,
): DemoStyleEntry {
  const entry = [...stories.styles, ...stories.gems].find(
    (story) => story.id === folder,
  )
  if (entry) return entry

  throw new PipelineFailure(
    'demo_pack_incomplete',
    `${DEMO_PACK_MANIFEST_FILE} has no entry for story folder "${folder}"`,
  )
}

// La escena del corte: los tiempos y el texto del pack, la transición de la
// escena, la marca del primer minuto si la animación va a correr (como la
// deja el corte real con la animación pedida) y, en una aparición, la semilla
// del avatar (la fase `avatar` la completa). Sin animación no se restaura
// nada de ella: el video es el sin animar.
function cutScene(
  packScene: PackScene,
  plan: { animate: boolean; avatar: boolean },
): Scene {
  const scene: Scene = {
    id: packScene.id,
    text: packScene.texto,
    startSeconds: packScene.tiempoInicioSeg,
    endSeconds: packScene.tiempoFinSeg,
  }
  const native = packScene.nativo
  if (native?.staticTransitionIn !== undefined)
    scene.staticTransitionIn = native.staticTransitionIn
  if (plan.animate && native?.animationRequestedSeconds !== undefined)
    scene.animationRequestedSeconds = native.animationRequestedSeconds
  if (plan.avatar && native?.avatar) scene.avatar = plannedAvatar(native.avatar)
  return scene
}

// Lo que el corte siembra en una aparición antes de generarla
// (stages/scene-cuts/pins.ts): el look y el motor, `planned`.
function plannedAvatar(avatar: SceneAvatar): SceneAvatar {
  return {
    lookId: avatar.lookId,
    lookName: avatar.lookName,
    lookType: avatar.lookType,
    engine: avatar.engine,
    origin: avatar.origin,
    ...(avatar.expressive === true ? { expressive: true } : {}),
    status: 'planned',
  }
}

function elapsedSecondsSince(startedAt: number): number {
  return Math.max(0, Math.round((Date.now() - startedAt) / 1000))
}

// Las opciones del avatar de la historia en el proyecto (Ruling R8) y la
// vista del look copiada a avatar/look.<ext>: la imagen fija de cada
// aparición.
async function prepareAvatarProject(
  run: DemoRun,
  avatar: DemoAvatar,
): Promise<void> {
  const { context } = run
  const look = await packAvatarLookFile(run.storyDirectory)
  if (!look)
    throw new PipelineFailure(
      'demo_pack_incomplete',
      `${run.storyDirectory} has no avatar look in ${PACK_AVATAR_DIRECTORY}/`,
    )

  await ensureDirectory(context.paths.avatarDirectory)
  await copyFile(
    look.file,
    avatarLookPreviewFile(context.paths, look.extension),
  )
  context.metadata.options.avatar = { ...avatar.options }
  await context.saveMetadata()
}

// La fase `avatar` con los eventos del carril real (avatar/render-scenes.ts y
// avatar/lane.ts): por aparición, started y sus fases —el audio, la subida,
// el render en HeyGen, la descarga y la normalización— hasta ready con la
// vista de la escena.
async function simulateAvatar(
  run: DemoRun,
  signal: AbortSignal,
): Promise<void> {
  const { context } = run
  const appearances = run.scenes.filter(({ scene }) => scene.avatar)
  // Arrancan juntas: el reloj de cada una sale del mismo momento.
  const startedAt = Date.now()
  const progress = (sceneId: number, phase: AvatarScenePhase) => {
    context.emitter.emit({
      type: 'avatar-scene-progress',
      sceneId,
      phase,
      elapsedSeconds: elapsedSecondsSince(startedAt),
    })
  }

  for (const { scene } of appearances) {
    context.emitter.emit({ type: 'avatar-scene-started', sceneId: scene.id })
    progress(scene.id, 'audio')
    await run.wait(AVATAR_STARTED_MS, signal)
  }
  for (const phase of AVATAR_SHARED_PHASES) {
    await run.wait(AVATAR_PHASE_MS, signal)
    for (const { scene } of appearances) progress(scene.id, phase)
  }

  const sharedMs =
    appearances.length * AVATAR_STARTED_MS +
    AVATAR_SHARED_PHASES.length * AVATAR_PHASE_MS
  const finishMs = Math.max(
    AVATAR_FINISH_MIN_MS,
    Math.round((AVATAR_BUDGET_MS - sharedMs) / Math.max(1, appearances.length)),
  )
  for (const { scene, packScene } of appearances) {
    await run.wait(finishMs * AVATAR_DOWNLOAD_SHARE, signal)
    progress(scene.id, 'download')
    await run.wait(finishMs * AVATAR_NORMALIZE_SHARE, signal)
    progress(scene.id, 'normalize')
    await run.wait(finishMs * AVATAR_READY_SHARE, signal)
    await restoreAppearance(run, scene, packScene)
    context.emitter.emit({
      type: 'avatar-scene-ready',
      sceneId: scene.id,
      scene: await toSceneSummary(context.paths, scene, context.metadata),
    })
  }
}

// La aparición lista: su clip en avatar/ y su bloque del pack en scenes.json,
// antes del evento que la nombra.
async function restoreAppearance(
  run: DemoRun,
  scene: Scene,
  packScene: PackScene,
): Promise<void> {
  const { paths } = run.context
  const avatar = packScene.nativo?.avatar
  const target = avatar ? sceneAvatarClipFile(paths, avatar) : undefined
  if (!avatar?.clipFile || !target)
    throw new PipelineFailure(
      'demo_pack_incomplete',
      `avatar scene ${scene.id} in ${run.storyDirectory} names no clip Vimo can use`,
    )

  await copyFile(
    join(run.storyDirectory, PACK_AVATAR_DIRECTORY, avatar.clipFile),
    target,
  )
  scene.avatar = avatar
  await writeScenes(
    paths,
    run.scenes.map((item) => item.scene),
  )
}

// La fase `animation` con los eventos de la real (stages/animation/
// animation.ts y animation/generate.ts): el plan con el fin de la animación
// y, por tanda de clips, los anuncios, el avance y los listos con su vista.
async function simulateAnimation(run: DemoRun): Promise<void> {
  const { context } = run
  const scenes = run.scenes.map(({ scene }) => scene)
  const audioDurationSeconds = context.metadata.audioDurationSeconds ?? 0
  await run.wait(ANIMATION_PLAN_WAIT_MS)
  context.emitter.emit({
    type: 'scenes-planned',
    scenes: await toSceneSummaries(context.paths, scenes, context.metadata),
    audioDurationSeconds,
    animationEndSeconds: animationRangeEnd(
      context.options.animationMinutes,
      audioDurationSeconds,
    ),
  })

  await ensureDirectory(context.paths.animationsDirectory)
  const clips = packClips(run)
  const batches = Math.ceil(clips.length / ANIMATION_CONCURRENCY)
  const perBatchMs = Math.max(
    ANIMATION_BATCH_MIN_MS,
    Math.round(ANIMATION_BUDGET_MS / Math.max(1, batches)),
  )
  for (let start = 0; start < clips.length; start += ANIMATION_CONCURRENCY)
    await simulateClipBatch(
      run,
      clips.slice(start, start + ANIMATION_CONCURRENCY),
      perBatchMs,
    )
}

// Los clips de la historia en el orden del video. validatePack exige el
// nombre de cada uno en una historia animada.
function packClips(run: DemoRun): DemoClip[] {
  const scenes = run.scenes.map(({ scene }) => scene)
  const clips = run.scenes.flatMap(({ scene, packScene }) => {
    return (packScene.nativo?.animations ?? []).map((block) => {
      if (!block.clipFile)
        throw new PipelineFailure(
          'demo_pack_incomplete',
          `an animation block of scene ${scene.id} in ${run.storyDirectory} names no clip`,
        )

      const unit = animationUnitFromBlock(scene.id, block, scenes)
      return {
        lead: scene,
        block,
        clipFile: block.clipFile,
        startSeconds: unit.startSeconds,
        endSeconds: unit.endSeconds,
      }
    })
  })
  return clips.sort((first, second) => first.startSeconds - second.startSeconds)
}

// Una tanda de clips a la vez, como la fase real (ANIMATION_CONCURRENCY).
async function simulateClipBatch(
  run: DemoRun,
  batch: DemoClip[],
  batchMs: number,
): Promise<void> {
  const { context } = run
  const startedAt = Date.now()
  for (const clip of batch) {
    context.emitter.emit({
      type: 'scene-animation-started',
      sceneId: clip.lead.id,
      sceneIds: clip.block.sceneIds,
      attempt: 1,
      animationId: clip.block.id,
      startSeconds: clip.startSeconds,
      endSeconds: clip.endSeconds,
    })
    await run.wait(ANIMATION_STARTED_MS)
  }

  const waveMs = Math.max(
    ANIMATION_WAVE_MIN_MS,
    Math.round(
      (batchMs - batch.length * (ANIMATION_STARTED_MS + ANIMATION_READY_MS)) /
        ANIMATION_PROGRESS_WAVES.length,
    ),
  )
  for (const percent of ANIMATION_PROGRESS_WAVES) {
    await run.wait(waveMs)
    for (const clip of batch)
      context.emitter.emit({
        type: 'scene-animation-progress',
        sceneId: clip.lead.id,
        percent,
        status: ANIMATION_PROGRESS_STATUS,
        elapsedSeconds: elapsedSecondsSince(startedAt),
      })
  }

  for (const clip of batch) {
    const clipPath = await restoreClip(run, clip)
    context.emitter.emit({
      type: 'scene-animation-ready',
      sceneId: clip.lead.id,
      sceneIds: clip.block.sceneIds,
      clipPath,
      animation: await animationView(context.paths, clip.lead.id, clip.block),
    })
    await run.wait(ANIMATION_READY_MS)
  }
}

// El clip listo: copiado a animations/ y su bloque del pack en la escena que
// lo encabeza (scenes.json), antes del evento que lo nombra. Devuelve dónde
// quedó.
async function restoreClip(run: DemoRun, clip: DemoClip): Promise<string> {
  const { paths } = run.context
  const clipPath = sceneAnimationClipFile(paths, clip.lead.id, clip.block)
  await copyFile(
    join(run.storyDirectory, PACK_ANIMATIONS_DIRECTORY, clip.clipFile),
    clipPath,
  )
  clip.lead.animations = [...(clip.lead.animations ?? []), clip.block]
  await writeScenes(
    paths,
    run.scenes.map((item) => item.scene),
  )
  return clipPath
}
