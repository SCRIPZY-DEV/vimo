import type { AnimationInterval } from '@pipeline/animation/planner.ts'

// ¿El intervalo pisa alguno de estos tramos? Tocar el borde no es pisar: un
// clip pegado a un avatar, o a otro clip, sigue en su lugar.
export function overlapsAnySpan(
  spans: AnimationInterval[],
  startSeconds: number,
  endSeconds: number,
): boolean {
  return spans.some(
    (span) => span.startSeconds < endSeconds && span.endSeconds > startSeconds,
  )
}
