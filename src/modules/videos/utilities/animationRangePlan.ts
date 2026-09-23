import { planAnimationUnits } from '@pipeline/animation/planner.ts'
import { readyAnimationClips } from '@/modules/videos/utilities/animationClips'
import { resumableAnimationIntervals } from '@/modules/videos/utilities/resumableAnimationIntervals'
import { animationRangeEnd } from '@pipeline/animation/scope.ts'
import type { VideoFormat } from '@pipeline/types/video-format.ts'

interface AnimationRangeOptions {
  durationSeconds?: number
  videoFormat?: VideoFormat
  wholeVideo?: boolean
}
import type { SceneDetail } from '@pipeline/types/video-project.ts'

// El mismo planificador puro que el sidecar decide las partes aún sin animar.
export function animationRangePlan(
  scenes: SceneDetail[],
  minutes: number,
  options: AnimationRangeOptions = {},
) {
  const endSeconds = animationRangeEnd(
    options.wholeVideo ? undefined : minutes,
    options.durationSeconds,
  )
  const mergeShortScenes = options.videoFormat !== '9:16'
  const sceneIds = scenes
    .filter(
      (scene) =>
        scene.startSeconds !== undefined && scene.startSeconds < endSeconds,
    )
    .map((scene) => scene.id)
  const coveredIntervals = readyAnimationClips(scenes).map((clip) => ({
    startSeconds: clip.startSeconds,
    endSeconds: clip.endSeconds,
  }))
  const plan = planAnimationUnits(scenes, sceneIds, [], {
    endSeconds,
    mergeShortScenes,
    coveredIntervals,
  })
  const resumableIntervals = resumableAnimationIntervals(scenes).filter(
    (interval) => interval.startSeconds < endSeconds && interval.endSeconds > 0,
  )
  const unpaid = planAnimationUnits(scenes, sceneIds, [], {
    endSeconds,
    mergeShortScenes,
    coveredIntervals: [...coveredIntervals, ...resumableIntervals],
  })
  return {
    ...plan,
    // Un reemplazo pendiente puede seguir cubierto por su clip anterior.
    // Debe conservar una selección válida aunque no falte un intervalo nuevo.
    sceneIds: [
      ...new Set([
        ...plan.units.flatMap((unit) => unit.sceneIds),
        ...scenes
          .filter((scene) =>
            resumableIntervals.some(
              (interval) =>
                scene.startSeconds !== undefined &&
                scene.endSeconds !== undefined &&
                scene.startSeconds < interval.endSeconds &&
                scene.endSeconds > interval.startSeconds,
            ),
          )
          .map((scene) => scene.id),
      ]),
    ],
    newClipCount: unpaid.units.length,
    requestedSeconds: unpaid.units.reduce(
      (sum, unit) => sum + unit.requestedSeconds,
      0,
    ),
    canResumeTask: resumableIntervals.length > 0,
    canRecoverLocally: resumableIntervals.some(
      (interval) => interval.canRecoverLocally,
    ),
  }
}
