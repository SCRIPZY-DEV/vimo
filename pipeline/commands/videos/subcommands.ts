import type { SubcommandHandler } from '../../runner/subcommand.ts'
import { confirmScenes } from './confirm-scenes.ts'
import { createVideoProject } from './create-video-project.ts'
import { probeTts } from './probe-tts.ts'
import { runVideoPipeline } from './run-video-pipeline.ts'
import { uploadNarration } from './upload-narration.ts'
import { videoProjectStatus } from './video-project-status.ts'

export const videosSubcommands: Record<string, SubcommandHandler> = {
  'create-video-project': createVideoProject,
  'upload-narration': uploadNarration,
  'run-video-pipeline': runVideoPipeline,
  'video-project-status': videoProjectStatus,
  'confirm-scenes': confirmScenes,
  'probe-tts': probeTts,
}
