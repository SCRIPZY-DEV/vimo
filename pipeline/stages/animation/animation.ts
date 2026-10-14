import {
  generateSceneAnimations,
  hasAnimationWork,
} from '../../animation/generate.ts'
import {
  animatesWholeVideo,
  animationRangeEnd,
  hasAutomaticAnimation,
} from '../../animation/scope.ts'
import {
  readScenes,
  toSceneSummaries,
  writeScenes,
} from '../../project/scenes-file.ts'
import type { Scene } from '../../types/scenes.ts'
import { ANIMATION_PREFIX_SCENE_SECONDS } from '../../types/video-provider.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { Stage } from '../../runner/stage.ts'
import type { CreateVideoContext } from '../context.ts'

// Fase independiente: todas las imágenes ya existen. Reanudar consulta los
// recibos y solo completa intervalos pendientes; nunca recompra los listos.
export const animationStage: Stage<CreateVideoContext> = {
  id: 'animation',
  async skip(context) {
    if (
      !hasAutomaticAnimation(context.options) ||
      context.options.demo ||
      context.regenerateSceneIds
    )
      return true
    if (await hasAnimationWork(context)) return false
    const scenes = await readScenes(context.paths)
    const endSeconds = automaticRangeEnd(context)
    // Deshacer retira la política del prefijo para restaurar las reglas del
    // editor. Una reanudación explícita la repone incluso si los clips ya
    // se completaron manualmente: la UI debe poder mostrarlos sin recomprar.
    if ((scenes ?? []).some((scene) => needsPrefixMarker(scene, endSeconds)))
      return false
    // Un cache-hit también comunica el rango; no escribe ni vuelve a animar.
    if (scenes) await emitAnimationPlan(context, scenes, endSeconds)
    return true
  },
  async run(context) {
    context.signal.throwIfAborted()
    if (!hasAutomaticAnimation(context.options) || context.regenerateSceneIds)
      return
    let scenes = await readScenes(context.paths)
    const endSeconds = automaticRangeEnd(context)
    if (scenes?.some((scene) => needsPrefixMarker(scene, endSeconds))) {
      const restored = scenes.map((scene) => {
        if (!needsPrefixMarker(scene, endSeconds)) return scene
        return {
          ...scene,
          animationRequestedSeconds: ANIMATION_PREFIX_SCENE_SECONDS,
        }
      })
      context.signal.throwIfAborted()
      await writeScenes(context.paths, restored)
      scenes = restored
    }
    if (scenes) await emitAnimationPlan(context, scenes, endSeconds)
    const result = await generateSceneAnimations(context, {
      minutes: animatesWholeVideo(context.options)
        ? undefined
        : context.options.animationMinutes,
      pairPrefixScenes: true,
      // Cada ejecución nueva es una reanudación explícita. Solo los recibos
      // confirmados como fallidos se reinician; listos y pendientes se conservan.
      retryFailed: true,
    })
    context.signal.throwIfAborted()
    if (result.failed.length || result.rejected.length)
      throw new PipelineFailure(
        'animation_incomplete',
        'The requested animated interval still has failed units',
      )
  },
}

async function emitAnimationPlan(
  context: CreateVideoContext,
  scenes: Scene[],
  endSeconds: number,
): Promise<void> {
  const audioDurationSeconds =
    context.metadata.audioDurationSeconds ??
    Math.max(0, ...scenes.map((scene) => scene.endSeconds ?? 0))
  const summaries = await toSceneSummaries(
    context.paths,
    scenes,
    context.metadata,
  )
  context.signal.throwIfAborted()
  context.emitter.emit({
    type: 'scenes-planned',
    scenes: summaries,
    audioDurationSeconds,
    animationEndSeconds: Math.min(endSeconds, audioDurationSeconds),
  })
}

function automaticRangeEnd(context: CreateVideoContext): number {
  return animationRangeEnd(
    animatesWholeVideo(context.options)
      ? undefined
      : context.options.animationMinutes,
    context.metadata.audioDurationSeconds,
  )
}

// Una escena de avatar nunca recibe la marca del prefijo animado: no es fuente
// de Kie (ADR-0057).
function needsPrefixMarker(scene: Scene, endSeconds: number): boolean {
  return (
    !scene.avatar &&
    scene.animationRequestedSeconds === undefined &&
    scene.startSeconds !== undefined &&
    Number.isFinite(scene.startSeconds) &&
    scene.startSeconds >= 0 &&
    scene.startSeconds < endSeconds &&
    scene.endSeconds !== undefined &&
    Number.isFinite(scene.endSeconds) &&
    scene.endSeconds > scene.startSeconds
  )
}
