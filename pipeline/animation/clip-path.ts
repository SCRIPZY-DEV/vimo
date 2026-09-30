import { join } from 'node:path'
import { sceneClipFile, type ProjectPaths } from '../project/paths.ts'
import type { SceneAnimation } from '../types/animation.ts'
import { PipelineFailure } from '../runner/failure.ts'

export function sceneAnimationClipFile(
  paths: ProjectPaths,
  sceneId: number,
  animation: Pick<SceneAnimation, 'clipFile'>,
): string {
  if (!animation.clipFile) return sceneClipFile(paths, sceneId)
  if (!/^[a-zA-Z0-9_-]+\.mp4$/.test(animation.clipFile))
    throw new PipelineFailure(
      'animation_media_invalid',
      'Invalid local animation filename',
    )
  return join(paths.animationsDirectory, animation.clipFile)
}
