import { DEMO_VIDEO_FORMAT, VIDEO_STYLES } from '@/modules/videos/constants'
import { defaultQualityFor } from '@/modules/videos/utilities/imageQuality'
import type { CreateFormValue } from '@/modules/videos/types/create'
import type { StyleSource } from '@/modules/videos/types/styles'
import type { CharacterStyleId } from '@pipeline/types/characters.ts'
import type { DemoManifest, DemoStyleEntry } from '@pipeline/types/demo.ts'

// Crear en modo demo (ADR-0027): todo sale del manifest del pack — voz,
// estilos visibles, nombre, guion y escenas. Publicar un pack con otras
// historias no exige tocar la app.

// Ids del catálogo con historia pre-hecha, en el orden de la galería.
export function demoStyleIds(manifest: DemoManifest): CharacterStyleId[] {
  const ids: CharacterStyleId[] = []
  for (const style of VIDEO_STYLES) {
    if (manifest.stories['16:9'].styles.some((entry) => entry.id === style.id))
      ids.push(style.id)
  }
  return ids
}

// La historia de lo elegido: la gema en «Mi estilo»; si no, la del estilo
// del catálogo (o la primera del pack).
export function demoEntryFor(
  manifest: DemoManifest,
  styleSource: StyleSource,
  styleId: CharacterStyleId,
): DemoStyleEntry {
  if (styleSource === 'custom') return manifest.stories['16:9'].customStyle
  return (
    manifest.stories['16:9'].styles.find((entry) => entry.id === styleId) ??
    manifest.stories['16:9'].styles[0]
  )
}

function storyPatch(
  entry: DemoStyleEntry,
): Pick<CreateFormValue, 'name' | 'script' | 'sceneCount'> {
  return {
    name: entry.suggestedName,
    script: entry.script,
    sceneCount: entry.sceneCount,
  }
}

// El formulario inicial en demo: voz y primer estilo del pack, sin pausas,
// sin música ni personajes, siempre 16:9.
export function demoFormValue(
  base: CreateFormValue,
  manifest: DemoManifest,
): CreateFormValue {
  const styleId = demoStyleIds(manifest)[0] ?? base.styleId
  return {
    ...base,
    narrationMode: 'tts',
    narrationFilePath: null,
    styleSource: 'catalog',
    styleId,
    customStyle: null,
    voice: {
      provider: manifest.voice.provider,
      voiceId: manifest.voice.voiceId,
      name: manifest.voice.name,
    },
    characters: [],
    useBgm: false,
    useOverlay: false,
    confirmScenes: false,
    autoRender: true,
    videoFormat: DEMO_VIDEO_FORMAT,
    imageQuality: defaultQualityFor(base.imageProvider, DEMO_VIDEO_FORMAT),
    ...storyPatch(demoEntryFor(manifest, 'catalog', styleId)),
  }
}

// Al cambiar de estilo o de pestaña, nombre, guion y escenas siguen a la
// historia elegida (derivado en el manejador del cambio, sin efecto).
export function demoFollowStyle(
  manifest: DemoManifest,
  current: CreateFormValue,
  patch: Partial<CreateFormValue>,
): Partial<CreateFormValue> {
  if (patch.styleId === undefined && patch.styleSource === undefined) return {}
  const styleSource = patch.styleSource ?? current.styleSource
  const styleId = patch.styleId ?? current.styleId
  return storyPatch(demoEntryFor(manifest, styleSource, styleId))
}
