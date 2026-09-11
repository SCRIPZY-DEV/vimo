import type { DemoManifest } from '@pipeline/types/demo.ts'

// Lee el manifest que la puerta de la demo deja en el state del router
// (CreateDemoNavigationState). Una navegación normal, o un state ajeno, es
// «sin demo»: nada acá confía en la forma sin mirarla.
export function readDemoState(state: unknown): DemoManifest | null {
  if (typeof state !== 'object' || state === null || !('demo' in state))
    return null
  const demo = (state as { demo: unknown }).demo
  if (typeof demo !== 'object' || demo === null) return null

  const manifest = demo as Partial<DemoManifest>
  // Las historias 16:9 están en todo pack (ADR-0028): sin ellas el state no
  // es un manifest de la demo.
  const landscape = manifest.stories?.['16:9']
  if (!landscape) return null

  if (!Array.isArray(landscape.styles) || landscape.styles.length === 0)
    return null
  if (!manifest.voice || !landscape.customStyle || !manifest.customStyleId)
    return null

  return manifest as DemoManifest
}
