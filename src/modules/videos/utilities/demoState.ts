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

  // El bloque 9:16 es opcional (pack v2 no lo trae), pero si la CLAVE está
  // presente tiene que traer la misma forma que 16:9 (ADR-0028): la vieja
  // verificación por truthiness dejaba pasar `stories: { '9:16': null }` —
  // demoComingSoonFormats solo mira si la clave existe (seguiría ofreciendo
  // Short) mientras demoStoriesFor serviría en silencio la historia de 16:9.
  if (manifest.stories && '9:16' in manifest.stories) {
    const short = manifest.stories['9:16']
    if (
      !short ||
      !Array.isArray(short.styles) ||
      short.styles.length === 0 ||
      !short.customStyle
    )
      return null
  }

  return manifest as DemoManifest
}
