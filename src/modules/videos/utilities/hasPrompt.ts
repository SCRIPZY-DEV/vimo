import type { SceneSummary } from '@pipeline/types/scenes.ts'

export function hasPrompt(scene: SceneSummary): boolean {
  return (scene.imagePrompt ?? '').trim().length > 0
}
