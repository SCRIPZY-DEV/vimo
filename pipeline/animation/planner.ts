import type {
  AnimationRejection,
  AnimationStrategy,
  SceneAnimationView,
} from '../types/animation.ts'
import {
  MIN_REQUESTED_ANIMATION_SECONDS,
  MAX_REQUESTED_ANIMATION_SECONDS,
  ANIMATION_PREFIX_SCENE_SECONDS,
} from '../types/video-provider.ts'
import { slotFrames } from './timing.ts'

// Puro y compartido por editor/sidecar. Los intervalos mandan: fusionar o
// acelerar nunca cambia el inicio de una escena posterior.
const SHORT_SCENE_SECONDS = 3
const TIME_EPSILON = 0.001

export interface PlannerScene {
  id: number
  startSeconds?: number
  endSeconds?: number
  animationRequestedSeconds?: number
}

export interface AnimationInterval {
  startSeconds: number
  endSeconds: number
}

export interface AnimationUnit extends AnimationInterval {
  leadSceneId: number
  sceneIds: number[]
  slotSeconds: number
  requestedSeconds: number
  strategy: AnimationStrategy
}

export interface AnimationPlan {
  units: AnimationUnit[]
  rejected: AnimationRejection[]
}

export interface AnimationPlannerOptions {
  endSeconds?: number
  coveredIntervals?: AnimationInterval[]
  mergeShortScenes?: boolean
  // Solo creación automática: pareja3+3 o3+cola parcial; el editor no lo activa.
  pairPrefixScenes?: boolean
  replacementUnits?: AnimationUnit[]
}

// Recupera el contrato temporal del clip pagado, aunque la política actual
// planifique sus imágenes de otra manera (p. ej. una fusión histórica en short).
export function animationUnitFromBlock(
  leadSceneId: number,
  animation: Pick<
    SceneAnimationView,
    | 'sceneIds'
    | 'startSeconds'
    | 'endSeconds'
    | 'slotSeconds'
    | 'requestedSeconds'
    | 'strategy'
  >,
  scenes: PlannerScene[],
): AnimationUnit {
  const first = scenes.find((scene) => scene.id === animation.sceneIds[0])
  const last = scenes.find((scene) => scene.id === animation.sceneIds.at(-1))
  const startSeconds = animation.startSeconds ?? first?.startSeconds ?? 0
  const endSeconds =
    animation.endSeconds ??
    last?.endSeconds ??
    startSeconds + animation.slotSeconds
  return {
    leadSceneId,
    sceneIds: animation.sceneIds,
    startSeconds,
    endSeconds,
    slotSeconds: endSeconds - startSeconds,
    requestedSeconds:
      animation.requestedSeconds ??
      requestedAnimationSeconds(endSeconds - startSeconds),
    strategy:
      animation.strategy ??
      (animation.sceneIds.length > 1 ? 'merge' : 'direct'),
  }
}

function validInterval(interval: AnimationInterval): boolean {
  return (
    Number.isFinite(interval.startSeconds) &&
    Number.isFinite(interval.endSeconds) &&
    interval.startSeconds >= 0 &&
    interval.endSeconds > interval.startSeconds
  )
}

function uncoveredIntervals(
  interval: AnimationInterval,
  covered: AnimationInterval[],
): AnimationInterval[] {
  let remaining = [interval]
  for (const taken of covered) {
    if (!validInterval(taken)) continue
    remaining = remaining.flatMap((part) => {
      if (
        taken.endSeconds <= part.startSeconds ||
        taken.startSeconds >= part.endSeconds
      )
        return [part]
      const pieces: AnimationInterval[] = []
      if (taken.startSeconds > part.startSeconds)
        pieces.push({
          startSeconds: part.startSeconds,
          endSeconds: taken.startSeconds,
        })
      if (taken.endSeconds < part.endSeconds)
        pieces.push({
          startSeconds: taken.endSeconds,
          endSeconds: part.endSeconds,
        })
      return pieces
    })
  }
  return remaining
}

export function requestedAnimationSeconds(slotSeconds: number): number {
  return Math.min(
    MAX_REQUESTED_ANIMATION_SECONDS,
    Math.max(
      MIN_REQUESTED_ANIMATION_SECONDS,
      Math.ceil(slotSeconds - TIME_EPSILON),
    ),
  )
}

// Conservado para consumidores históricos; la elección ya no minimiza un
// costo de deformación contra un clip fijo de seis segundos.
export function deformationCost(slotSeconds: number): number {
  if (!Number.isFinite(slotSeconds) || slotSeconds <= 0)
    return Number.POSITIVE_INFINITY
  return requestedAnimationSeconds(slotSeconds) / slotSeconds
}

export function planAnimationUnits(
  scenes: PlannerScene[],
  markedSceneIds: number[],
  coveredSceneIds: Iterable<number> = [],
  options: AnimationPlannerOptions = {},
): AnimationPlan {
  const marked = new Set(markedSceneIds)
  const coveredIds = new Set(coveredSceneIds)
  const covered = [...(options.coveredIntervals ?? [])]
  const units: AnimationUnit[] = []
  const rejected: AnimationRejection[] = []
  const rangeEnd = options.endSeconds ?? Number.POSITIVE_INFINITY
  if (Number.isNaN(rangeEnd) || rangeEnd <= 0) return { units, rejected }

  for (const unit of options.replacementUnits ?? []) {
    if (!unit.sceneIds.some((id) => marked.has(id))) continue
    if (!validInterval(unit) || unit.endSeconds > rangeEnd) continue
    if (
      covered.some(
        (interval) =>
          interval.startSeconds < unit.endSeconds &&
          interval.endSeconds > unit.startSeconds,
      )
    )
      continue
    if (
      !Number.isInteger(unit.requestedSeconds) ||
      unit.requestedSeconds < MIN_REQUESTED_ANIMATION_SECONDS ||
      unit.requestedSeconds > MAX_REQUESTED_ANIMATION_SECONDS
    )
      continue
    units.push({ ...unit })
    covered.push(unit)
  }

  for (const [index, scene] of scenes.entries()) {
    if (!marked.has(scene.id)) continue
    const startSeconds = scene.startSeconds ?? Number.NaN
    const sceneEnd = scene.endSeconds ?? Number.NaN
    const duration = sceneEnd - startSeconds
    if (
      !validInterval({ startSeconds, endSeconds: sceneEnd }) ||
      duration > MAX_REQUESTED_ANIMATION_SECONDS + TIME_EPSILON
    ) {
      rejected.push({
        sceneId: scene.id,
        reason: 'slot_out_of_range',
        slotSeconds: Number.isFinite(duration) ? duration : 0,
      })
      continue
    }
    if (startSeconds >= rangeEnd) continue
    if (coveredIds.has(scene.id)) {
      rejected.push({
        sceneId: scene.id,
        reason: 'already_covered',
        slotSeconds: duration,
      })
      continue
    }

    const parts = uncoveredIntervals(
      { startSeconds, endSeconds: Math.min(sceneEnd, rangeEnd) },
      covered,
    )
    if (parts.length === 0) continue
    for (const part of parts) {
      const next = scenes[index + 1]
      let endSeconds = part.endSeconds
      const sceneIds = [scene.id]
      // El editor conserva3+3 completas. La creación admite además la cola
      // parcial del audio: sus dos imágenes permanecen dentro del clip.
      if (
        options.mergeShortScenes !== false &&
        (scene.animationRequestedSeconds === undefined ||
          options.pairPrefixScenes === true) &&
        Math.abs(duration - SHORT_SCENE_SECONDS) < TIME_EPSILON &&
        part.startSeconds === startSeconds &&
        part.endSeconds === sceneEnd &&
        next?.startSeconds !== undefined &&
        next.endSeconds !== undefined &&
        Math.abs(next.startSeconds - sceneEnd) < TIME_EPSILON &&
        (Math.abs(next.endSeconds - next.startSeconds - SHORT_SCENE_SECONDS) <
          TIME_EPSILON ||
          (options.pairPrefixScenes === true &&
            next.endSeconds > next.startSeconds &&
            next.endSeconds - next.startSeconds < SHORT_SCENE_SECONDS &&
            Math.abs(next.endSeconds - rangeEnd) < TIME_EPSILON)) &&
        next.endSeconds <= rangeEnd &&
        !coveredIds.has(next.id) &&
        uncoveredIntervals(
          { startSeconds: next.startSeconds, endSeconds: next.endSeconds },
          covered,
        ).some(
          (available) =>
            available.startSeconds === next.startSeconds &&
            available.endSeconds === next.endSeconds,
        )
      ) {
        endSeconds = next.endSeconds
        sceneIds.push(next.id)
      }

      const slotSeconds = endSeconds - part.startSeconds
      if (
        slotSeconds <= TIME_EPSILON ||
        slotFrames(part.startSeconds, endSeconds) < 1
      )
        continue
      units.push({
        leadSceneId: scene.id,
        sceneIds,
        startSeconds: part.startSeconds,
        endSeconds,
        slotSeconds,
        requestedSeconds: Math.max(
          requestedAnimationSeconds(slotSeconds),
          scene.animationRequestedSeconds === ANIMATION_PREFIX_SCENE_SECONDS
            ? ANIMATION_PREFIX_SCENE_SECONDS
            : MIN_REQUESTED_ANIMATION_SECONDS,
        ),
        strategy:
          sceneIds.length > 1
            ? 'merge'
            : slotSeconds < MIN_REQUESTED_ANIMATION_SECONDS
              ? 'trim'
              : 'direct',
      })
      covered.push({ startSeconds: part.startSeconds, endSeconds })
    }
  }
  return {
    units: units.sort((a, b) => a.startSeconds - b.startSeconds),
    rejected,
  }
}

export function absorbedSceneIds(plan: AnimationPlan): number[] {
  return plan.units.flatMap((unit) => unit.sceneIds.slice(1))
}
