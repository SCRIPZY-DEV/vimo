import {
  isValidFile,
  projectsRootOf,
  resolveProjectDir,
  resolveProjectPaths,
} from '../../project/paths.ts'
import { readProjectMetadata } from '../../project/metadata.ts'
import {
  animationRangeEnd,
  effectiveAnimationMinutes,
} from '../../animation/scope.ts'
import { planPrefixSceneWindows } from '../../animation/prefix-scenes.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { TranscriptWord } from '../../types/scenes.ts'
import type {
  PreviewSceneCutsPayload,
  PreviewSceneCutsResult,
} from '../../types/video-project.ts'
import { readTextWithRetry } from '../../utils/atomic-fs.ts'
import {
  clampSecondsPerScene,
  cutScenesBySeconds,
} from '../../stages/scene-cuts/by-seconds.ts'
import {
  countScenesAroundSpans,
  planAvatarPins,
} from '../../stages/scene-cuts/pins.ts'

// Vista previa del corte por segundos, para el slider del diálogo de
// confirmación: función PURA sobre words.json, con exactamente la MISMA
// implementación que después corta (by-seconds.ts) — una sola implementación,
// así la vista previa no puede mentir. No escribe nada.
export async function previewSceneCuts(
  context: PipelineContext,
): Promise<PreviewSceneCutsResult> {
  const payload = context.job.payload as PreviewSceneCutsPayload | undefined
  if (!payload?.projectId)
    throw new PipelineFailure(
      'invalid_payload',
      'payload.projectId is required',
    )

  const seconds = clampSecondsPerScene(payload.secondsPerScene)

  const projectDir = resolveProjectDir(
    projectsRootOf(context),
    payload.projectId,
  )
  const paths = resolveProjectPaths(projectDir, payload.projectId)

  if (!(await isValidFile(paths.wordsFile)))
    throw new PipelineFailure(
      'words_missing',
      'preview-scene-cuts needs words.json (did transcription run?)',
    )
  const words = JSON.parse(
    await readTextWithRetry(paths.wordsFile),
  ) as TranscriptWord[]
  if (!Array.isArray(words) || words.length === 0)
    throw new PipelineFailure('words_missing', 'words.json is empty')

  const metadata = await readProjectMetadata(paths)
  const audioDurationSeconds =
    metadata.audioDurationSeconds ?? words[words.length - 1].end

  const animationMinutes = effectiveAnimationMinutes(
    metadata.options,
    audioDurationSeconds,
  )

  // Con avatar (ADR-0057) la vista previa cuenta alrededor de sus pines, con
  // las mismas ventanas que después corta la fase: si no, contaría escenas
  // que el avatar reemplaza.
  const avatarPlan = planAvatarPins(
    metadata.options.avatar,
    words,
    audioDurationSeconds,
  )
  if (avatarPlan && avatarPlan.pins.length > 0)
    return {
      sceneCount: countScenesAroundSpans(
        audioDurationSeconds,
        avatarPlan.pins,
        {
          secondsPerScene: seconds,
          prefixEndSeconds:
            animationMinutes > 0
              ? animationRangeEnd(animationMinutes, audioDurationSeconds)
              : 0,
        },
      ),
      audioDurationSeconds,
    }

  return {
    sceneCount:
      animationMinutes > 0
        ? planPrefixSceneWindows({
            totalSeconds: audioDurationSeconds,
            minutes: animationMinutes,
            secondsPerScene: seconds,
          }).length
        : cutScenesBySeconds(words, seconds, audioDurationSeconds).length,
    audioDurationSeconds,
  }
}
