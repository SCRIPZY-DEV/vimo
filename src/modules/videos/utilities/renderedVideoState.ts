import type { RenderedVideoState } from '@/modules/videos/types/library'

export function renderedVideoState(
  hasVideo: boolean,
  outdated: boolean,
): RenderedVideoState {
  if (!hasVideo) return 'none'
  if (outdated) return 'outdated'
  return 'current'
}
