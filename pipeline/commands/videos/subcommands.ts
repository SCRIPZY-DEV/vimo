import type { SubcommandHandler } from '../../runner/subcommand.ts'
import {
  withProjectWriteLease,
  withProjectAnimationLease,
  withProjectImageLease,
} from '../../animation/coordination.ts'
import { projectsRootOf, resolveProjectDir } from '../../project/paths.ts'
import { animateScenes } from './animate-scenes.ts'
import { avatarRenderScenes } from './avatar-render-scenes.ts'
import { avatarTrimScene } from './avatar-trim-scene.ts'
import { confirmScenes } from './confirm-scenes.ts'
import { createVideoProject } from './create-video-project.ts'
import { deleteVideoProjects } from './delete-video-projects.ts'
import { exportClips } from './export-clips.ts'
import { getImageCredits } from './get-image-credits.ts'
import { getVideoCredits } from './get-video-credits.ts'
import { listVideoProjects } from './list-video-projects.ts'
import { listSoundEffects } from './list-sound-effects.ts'
import { previewSceneCuts } from './preview-scene-cuts.ts'
import { probeTts } from './probe-tts.ts'
import { regenerateSceneImages } from './regenerate-scene-images.ts'
import { renderVideo } from './render-video.ts'
import { replaceNarration } from './replace-narration.ts'
import { runVideoPipeline } from './run-video-pipeline.ts'
import { setProjectMusic } from './set-project-music.ts'
import { setProjectSoundEffects } from './set-project-sound-effects.ts'
import { setProjectVoice } from './set-project-voice.ts'
import { setPromptModel } from './set-prompt-model.ts'
import { updateAudioMix } from './update-audio-mix.ts'
import { updateScenes } from './update-scenes.ts'
import { undoSceneAnimation } from './undo-scene-animation.ts'
import { uploadNarration } from './upload-narration.ts'
import { videoProjectDetail } from './video-project-detail.ts'
import { videoProjectStatus } from './video-project-status.ts'

const handlers: Record<string, SubcommandHandler> = {
  'create-video-project': createVideoProject,
  'upload-narration': uploadNarration,
  'run-video-pipeline': runVideoPipeline,
  'video-project-status': videoProjectStatus,
  'confirm-scenes': confirmScenes,
  'set-prompt-model': setPromptModel,
  'set-project-voice': setProjectVoice,
  'preview-scene-cuts': previewSceneCuts,
  'probe-tts': probeTts,
  'list-video-projects': listVideoProjects,
  'list-sound-effects': listSoundEffects,
  'delete-video-projects': deleteVideoProjects,
  'video-project-detail': videoProjectDetail,
  'update-scenes': updateScenes,
  'undo-scene-animation': undoSceneAnimation,
  'regenerate-scene-images': regenerateSceneImages,
  'render-video': renderVideo,
  'update-audio-mix': updateAudioMix,
  'replace-narration': replaceNarration,
  'set-project-music': setProjectMusic,
  'set-project-sound-effects': setProjectSoundEffects,
  'export-clips': exportClips,
  'get-image-credits': getImageCredits,
  'animate-scenes': animateScenes,
  'avatar-render-scenes': avatarRenderScenes,
  // El recorte de una aparición (entrega 2g, §23.3): corto, sin proveedor, con
  // el lease exclusivo del proyecto como cualquier escritura de escenas.
  'avatar-trim-scene': avatarTrimScene,
  'get-video-credits': getVideoCredits,
}

// Se protege la entrada del job, no las llamadas internas entre stages.
// Las consultas siguen disponibles mientras un generador guarda recibos.
const readOnlyCommands = new Set([
  'list-sound-effects',
  'video-project-status',
  'video-project-detail',
  'list-video-projects',
  'preview-scene-cuts',
  'probe-tts',
  'get-image-credits',
  'get-video-credits',
  'create-video-project',
])

// Los generadores que comparten el proyecto (ADR-0047, ADR-0057): guardan sus
// recibos con escrituras serializadas aparte y escenas exclusivas, así las
// consultas del editor siguen disponibles mientras esperan al proveedor. El
// resto de los comandos que escriben toma el lease exclusivo, y también un
// generador cuyo pedido mueve escenas (`changesSceneTimes`).
const ANIMATION_LEASE_COMMANDS = new Set([
  'animate-scenes',
  'avatar-render-scenes',
])

// ¿El pedido mueve o saca escenas? Entonces va con el lease exclusivo, como
// cualquier escritura de escenas, aunque sea de un generador: el render del
// avatar con `durations` no vacío (entrega 2g, R-2g-19) saca y mueve escenas
// de imagen al aplicar la duración nueva, y otro generador con el lease
// compartido podría comprar ese mismo tramo o pagar por una escena que salió.
// Sin `durations` (o vacío), convive con `animate-scenes` como siempre.
function changesSceneTimes(name: string, payload: unknown): boolean {
  if (name !== 'avatar-render-scenes') return false

  if (typeof payload !== 'object' || payload === null) return false

  const durations = 'durations' in payload ? payload.durations : undefined
  return Array.isArray(durations) && durations.length > 0
}

export const videosSubcommands: Record<string, SubcommandHandler> =
  Object.fromEntries(
    Object.entries(handlers).map(([name, handler]) => {
      if (readOnlyCommands.has(name)) return [name, handler]
      const guarded: SubcommandHandler = async (context) => {
        const payload = context.job.payload as
          { projectId?: string; projectIds?: string[] } | undefined
        const ids = payload?.projectId
          ? [payload.projectId]
          : (payload?.projectIds ?? [])
        const paths = [...new Set(ids)]
          .sort()
          .map((id) => resolveProjectDir(projectsRootOf(context), id))
        const shared =
          ANIMATION_LEASE_COMMANDS.has(name) &&
          !changesSceneTimes(name, context.job.payload)
        const invokeAt = (index: number): Promise<unknown> => {
          if (index >= paths.length) return handler(context)
          const lease = shared
            ? withProjectAnimationLease
            : name === 'regenerate-scene-images'
              ? withProjectImageLease
              : withProjectWriteLease
          return lease(paths[index], context.signal, () => invokeAt(index + 1))
        }
        return invokeAt(0)
      }
      return [name, guarded]
    }),
  )
