import {
  planAnimationUnits,
  animationUnitFromBlock,
} from '@pipeline/animation/planner.ts'
import { animationRangeEnd } from '@pipeline/animation/scope.ts'
import { readyAnimationClips } from '@/modules/videos/utilities/animationClips'
import {
  resumableAnimationIntervals,
  shortTailPendingAnimationUnits,
} from '@/modules/videos/utilities/resumableAnimationIntervals'
import type { AnimationPlanPreview } from '@/modules/videos/types/library'
import type { SceneDetail } from '@pipeline/types/video-project.ts'
import type { VideoFormat } from '@pipeline/types/video-format.ts'

interface AnimationPreviewOptions {
  durationSeconds?: number
  videoFormat?: VideoFormat
}

// Rehacer una escena de un grupo conserva la sustitución atómica del sidecar.
// El presupuesto incluye todo el grupo, también si ahora sus imágenes se
// animan por separado; sus recibos siguen visibles hasta terminar el reemplazo.
export function animationPlanPreview(
  timedScenes: SceneDetail[],
  selected: SceneDetail,
  options: AnimationPreviewOptions = {},
): AnimationPlanPreview {
  const selectedIds = new Set([selected.absorbedBy ?? selected.id])
  const ready = readyAnimationClips(timedScenes)
  let expanding = true
  while (expanding) {
    const previousSize = selectedIds.size
    for (const clip of ready)
      if (clip.animation.sceneIds.some((id) => selectedIds.has(id)))
        for (const id of clip.animation.sceneIds) selectedIds.add(id)
    expanding = selectedIds.size !== previousSize
  }
  const replaced = ready.filter((clip) =>
    clip.animation.sceneIds.some((id) => selectedIds.has(id)),
  )
  const coveredIntervals = ready.filter((clip) => !replaced.includes(clip))
  const preservedPending = shortTailPendingAnimationUnits(timedScenes)
  const plannerOptions = {
    endSeconds: animationRangeEnd(undefined, options.durationSeconds),
    mergeShortScenes: options.videoFormat !== '9:16',
    replacementUnits: [
      ...replaced.map((clip) =>
        animationUnitFromBlock(clip.lead.id, clip.animation, timedScenes),
      ),
      ...preservedPending,
    ],
    coveredIntervals,
  }
  const plan = planAnimationUnits(
    timedScenes,
    [...selectedIds],
    [],
    plannerOptions,
  )
  const targets = timedScenes.filter((scene) => selectedIds.has(scene.id))
  const resumable = resumableAnimationIntervals(timedScenes).filter(
    (interval) =>
      targets.some(
        (scene) =>
          scene.startSeconds !== undefined &&
          scene.endSeconds !== undefined &&
          interval.startSeconds < scene.endSeconds &&
          interval.endSeconds > scene.startSeconds,
      ),
  )
  const unpaid = planAnimationUnits(timedScenes, [...selectedIds], [], {
    ...plannerOptions,
    coveredIntervals: [...coveredIntervals, ...resumable],
  })
  const preview: AnimationPlanPreview = {
    sceneIds: [...new Set(plan.units.flatMap((unit) => unit.sceneIds))],
    slotSeconds: plan.units.reduce((sum, unit) => sum + unit.slotSeconds, 0),
    readyClips: replaced.map((clip) => clip.animation),
    requestedSeconds: unpaid.units.reduce(
      (sum, unit) => sum + unit.requestedSeconds,
      0,
    ),
    staticTailSceneId: plan.staticTailSceneId,
    staticTailPending: preservedPending.some((unit) =>
      unit.sceneIds.some((id) => selectedIds.has(id)),
    ),
    canResumeTask: resumable.length > 0,
    canRecoverLocally: resumable.some((interval) => interval.canRecoverLocally),
  }
  if (plan.units[0]) preview.unit = plan.units[0]
  if (plan.rejected[0]) preview.rejection = plan.rejected[0]
  return preview
}
