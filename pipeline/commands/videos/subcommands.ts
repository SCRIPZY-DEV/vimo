import type { SubcommandHandler } from '../../runner/subcommand.ts'
import { confirmScenes } from './confirm-scenes.ts'
import { createVideoProject } from './create-video-project.ts'
import { deleteVideoProjects } from './delete-video-projects.ts'
import { exportClips } from './export-clips.ts'
import { getImageCredits } from './get-image-credits.ts'
import { listVideoProjects } from './list-video-projects.ts'
import { previewSceneCuts } from './preview-scene-cuts.ts'
import { probeTts } from './probe-tts.ts'
import { regenerateSceneImages } from './regenerate-scene-images.ts'
import { renderVideo } from './render-video.ts'
import { replaceNarration } from './replace-narration.ts'
import { runVideoPipeline } from './run-video-pipeline.ts'
import { setProjectMusic } from './set-project-music.ts'
import { updateAudioMix } from './update-audio-mix.ts'
import { updateScenes } from './update-scenes.ts'
import { uploadNarration } from './upload-narration.ts'
import { videoProjectDetail } from './video-project-detail.ts'
import { videoProjectStatus } from './video-project-status.ts'

export const videosSubcommands: Record<string, SubcommandHandler> = {
  'create-video-project': createVideoProject,
  'upload-narration': uploadNarration,
  'run-video-pipeline': runVideoPipeline,
  'video-project-status': videoProjectStatus,
  'confirm-scenes': confirmScenes,
  'preview-scene-cuts': previewSceneCuts,
  'probe-tts': probeTts,
  'list-video-projects': listVideoProjects,
  'delete-video-projects': deleteVideoProjects,
  'video-project-detail': videoProjectDetail,
  'update-scenes': updateScenes,
  'regenerate-scene-images': regenerateSceneImages,
  'render-video': renderVideo,
  'update-audio-mix': updateAudioMix,
  'replace-narration': replaceNarration,
  'set-project-music': setProjectMusic,
  'export-clips': exportClips,
  'get-image-credits': getImageCredits,
}
