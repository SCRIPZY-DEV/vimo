import { VIDEO_FORMATS } from '@/modules/videos/constants'
import type {
  DemoManifest,
  DemoStories,
  DemoStyleEntry,
} from '@pipeline/types/demo.ts'

// Lee el manifest que la puerta de la demo deja en el state del router
// (CreateDemoNavigationState). Una navegación normal, o un state ajeno, es
// «sin demo»: nada acá confía en la forma sin mirarla.
export function readDemoState(state: unknown): DemoManifest | null {
  if (typeof state !== 'object' || state === null || !('demo' in state))
    return null
  const demo = (state as { demo: unknown }).demo
  if (typeof demo !== 'object' || demo === null) return null

  const manifest = demo as Partial<DemoManifest>
  if (!manifest.voice || !Array.isArray(manifest.gems)) return null
  const stories = manifest.stories
  if (typeof stories !== 'object' || stories === null) return null

  // Al menos un formato con historias (pack v4: 16:9, Short o los dos) y, si
  // la CLAVE de un formato está, su bloque con la forma completa: una
  // verificación por truthiness dejaba pasar `stories: { '9:16': null }`
  // (ADR-0030), y demoComingSoonFormats solo mira si la clave existe.
  const formats = VIDEO_FORMATS.map((format) => format.id).filter(
    (format) => format in stories,
  )
  if (formats.length === 0) return null
  if (!formats.every((format) => isDemoStories(stories[format]))) return null

  return manifest as DemoManifest
}

function isDemoStories(value: unknown): value is DemoStories {
  if (typeof value !== 'object' || value === null) return false

  const block = value as Partial<DemoStories>
  if (!Array.isArray(block.styles) || !Array.isArray(block.gems)) return false

  const entries = [...block.styles, ...block.gems]
  if (entries.length === 0) return false

  return entries.every(isDemoEntry)
}

// Cada historia dice con qué personaje se generó y si trae la variante
// animada.
function isDemoEntry(value: unknown): value is DemoStyleEntry {
  if (typeof value !== 'object' || value === null) return false

  const entry = value as Partial<DemoStyleEntry>
  if (typeof entry.id !== 'string') return false
  if (entry.character !== 'generic' && entry.character !== 'none') return false

  return typeof entry.animated === 'boolean'
}
