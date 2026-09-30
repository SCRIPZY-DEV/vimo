import {
  planAnimationUnits,
  animationUnitFromBlock,
  overlapsShortFinalAnimationScene,
} from '@pipeline/animation/planner.ts'
import { animationRangeEnd } from '@pipeline/animation/scope.ts'
import { sceneAnimationBlocks } from '@pipeline/animation/scene-blocks.ts'
import { readyAnimationClips } from '@/modules/videos/utilities/animationClips'
import { shortTailPendingAnimationUnits } from '@/modules/videos/utilities/resumableAnimationIntervals'
import type { AnimationPlanPreview } from '@/modules/videos/types/library'
import type { AnimationUnit } from '@pipeline/animation/planner.ts'
import type { SceneAnimationView } from '@pipeline/types/animation.ts'
import type { SceneDetail } from '@pipeline/types/video-project.ts'
import type { VideoFormat } from '@pipeline/types/video-format.ts'

interface GalleryAnimationPlanOptions {
  durationSeconds?: number
  videoFormat: VideoFormat
}

interface PendingGalleryClip {
  animation: SceneAnimationView
  unit: AnimationUnit
}

interface GalleryAnimationPlan extends AnimationPlanPreview {
  units: AnimationUnit[]
  sceneIds: number[]
  requestedSeconds: number
}

// Toda la selección se planifica una sola vez: sumar previews individuales
// solapados convertiría 1+2 en 1+2 y 3+4 cuando ambas primeras duran 3 s.
// Los recibos pendientes conservan además el intervalo que ya se encargó,
// aunque el formato actual hubiera planificado otros clips para esas imágenes.
export function galleryAnimationPlan(
  scenes: SceneDetail[],
  sceneIds: number[],
  options: GalleryAnimationPlanOptions,
): GalleryAnimationPlan {
  const requestedIds = new Set(sceneIds)
  const selectedIds = new Set(
    scenes
      .filter((scene) => requestedIds.has(scene.id))
      .map((scene) => scene.absorbedBy ?? scene.id),
  )
  const ready = readyAnimationClips(scenes)
  const preservedPending = shortTailPendingAnimationUnits(scenes)
  const pending: PendingGalleryClip[] = []
  for (const scene of scenes) {
    const historical = sceneAnimationBlocks(scene).filter(
      (animation) => !ready.some((clip) => clip.animation === animation),
    )
    for (const animation of [
      ...(scene.animationPending ?? []),
      ...historical,
    ]) {
      const unit = animationUnitFromBlock(scene.id, animation, scenes)
      if (overlapsShortFinalAnimationScene(scenes, unit)) continue
      // El sidecar cosecha un único recibo por intervalo, incluso si aparece
      // como candidato y en el manifiesto histórico a la vez.
      if (pending.some((clip) => sameInterval(clip.unit, unit))) continue
      pending.push({ animation, unit })
    }
  }

  let expanding = true
  while (expanding) {
    const previousSize = selectedIds.size
    for (const clip of [...ready, ...pending]) {
      if (!clip.animation.sceneIds.some((id) => selectedIds.has(id))) continue
      for (const id of clip.animation.sceneIds) selectedIds.add(id)
    }
    expanding = selectedIds.size !== previousSize
  }

  const replaced = ready.filter((clip) =>
    clip.animation.sceneIds.some((id) => selectedIds.has(id)),
  )
  const selectedPending = pending.filter((clip) =>
    clip.animation.sceneIds.some((id) => selectedIds.has(id)),
  )
  const coveredIntervals = ready.filter((clip) => !replaced.includes(clip))
  const plannerOptions = {
    endSeconds: animationRangeEnd(undefined, options.durationSeconds),
    mergeShortScenes: options.videoFormat !== '9:16',
    replacementUnits: [
      ...replaced.map((clip) =>
        animationUnitFromBlock(clip.lead.id, clip.animation, scenes),
      ),
      ...preservedPending,
    ],
    coveredIntervals: [
      ...coveredIntervals,
      ...selectedPending.map((clip) => clip.unit),
    ],
  }
  const plan = planAnimationUnits(scenes, [...selectedIds], [], plannerOptions)
  const units = [
    ...selectedPending.map((clip) => clip.unit),
    ...plan.units,
  ].sort((left, right) => left.startSeconds - right.startSeconds)
  const resumable = selectedPending.filter(
    (clip) => clip.animation.canResumeTask,
  )
  const unpaid = [
    ...plan.units,
    ...selectedPending
      .filter((clip) => !clip.animation.canResumeTask)
      .map((clip) => clip.unit),
  ]
  const preview: GalleryAnimationPlan = {
    units,
    sceneIds: [...new Set(units.flatMap((unit) => unit.sceneIds))],
    slotSeconds: units.reduce((sum, unit) => sum + unit.slotSeconds, 0),
    readyClips: replaced.map((clip) => clip.animation),
    staticTailSceneId: plan.staticTailSceneId,
    staticTailPending: preservedPending.some((unit) =>
      unit.sceneIds.some((id) => selectedIds.has(id)),
    ),
    requestedSeconds: unpaid.reduce(
      (sum, unit) => sum + unit.requestedSeconds,
      0,
    ),
    canResumeTask: resumable.length > 0,
    canRecoverLocally:
      resumable.length > 0 &&
      resumable.every((clip) => clip.animation.canRecoverLocally),
  }
  if (units[0]) preview.unit = units[0]
  // Un lote parcialmente inválido debe poder rechazarse entero antes del
  // cobro; el consumidor no puede conformarse con que exista la primera unidad.
  if (plan.rejected[0]) preview.rejection = plan.rejected[0]
  return preview
}

function sameInterval(left: AnimationUnit, right: AnimationUnit): boolean {
  return (
    Math.round(left.startSeconds * 1000) ===
      Math.round(right.startSeconds * 1000) &&
    Math.round(left.endSeconds * 1000) === Math.round(right.endSeconds * 1000)
  )
}
