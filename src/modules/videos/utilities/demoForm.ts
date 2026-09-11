import {
  DEMO_VIDEO_FORMAT,
  VIDEO_FORMATS,
  VIDEO_STYLES,
} from '@/modules/videos/constants'
import { defaultQualityFor } from '@/modules/videos/utilities/imageQuality'
import type { CreateFormValue } from '@/modules/videos/types/create'
import type { StyleSource } from '@/modules/videos/types/styles'
import type { CharacterStyleId } from '@pipeline/types/characters.ts'
import type {
  DemoManifest,
  DemoStories,
  DemoStyleEntry,
} from '@pipeline/types/demo.ts'
import type { VideoFormat } from '@pipeline/types/video-format.ts'

// Crear en modo demo (ADR-0027, ADR-0028): todo sale del manifest del pack —
// voz, estilos visibles, formatos disponibles, nombre, guion, escenas y
// audio. Publicar un pack con otras historias no exige tocar la app.

// Las historias del formato elegido. Sin Short en el pack, las de 16:9: el
// selector de formato bloquea Short en ese caso, así que solo se llega acá
// con un formato que el pack trae.
export function demoStoriesFor(
  manifest: DemoManifest,
  format: VideoFormat,
): DemoStories {
  return manifest.stories[format] ?? manifest.stories['16:9']
}

// Ids del catálogo con historia pre-hecha, en el orden de la galería. Lee
// solo 16:9: por contrato el árbol short/ espeja el mismo conjunto de
// estilos que la raíz (validatePack exige las mismas tres entradas del
// catálogo en los dos árboles, ADR-0028 regla 2), así que los ids de la
// galería no cambian entre formatos.
export function demoStyleIds(manifest: DemoManifest): CharacterStyleId[] {
  const ids: CharacterStyleId[] = []
  for (const style of VIDEO_STYLES) {
    if (manifest.stories['16:9'].styles.some((entry) => entry.id === style.id))
      ids.push(style.id)
  }
  return ids
}

// Formatos sin historias en el pack: el selector los muestra en
// «Próximamente» (con el pack v2 instalado, Short).
export function demoComingSoonFormats(manifest: DemoManifest): VideoFormat[] {
  return VIDEO_FORMATS.map((format) => format.id).filter(
    (id) => manifest.stories[id] === undefined,
  )
}

// La historia de lo elegido: la gema en «Mi estilo»; si no, la del estilo
// del catálogo (o la primera del pack), en el formato elegido.
export function demoEntryFor(
  manifest: DemoManifest,
  format: VideoFormat,
  styleSource: StyleSource,
  styleId: CharacterStyleId,
): DemoStyleEntry {
  const stories = demoStoriesFor(manifest, format)
  if (styleSource === 'custom') return stories.customStyle
  return (
    stories.styles.find((entry) => entry.id === styleId) ?? stories.styles[0]
  )
}

// Nombre con el que «Subir mi audio» muestra el audio de la historia: el
// archivo del pack se llama audio.mp3 en todas las carpetas.
export function demoAudioFileLabel(
  manifest: DemoManifest,
  form: CreateFormValue,
): string {
  const entry = demoEntryFor(
    manifest,
    form.videoFormat,
    form.styleSource,
    form.styleId,
  )
  return `${entry.suggestedName}.mp3`
}

function storyPatch(
  entry: DemoStyleEntry,
): Pick<
  CreateFormValue,
  'name' | 'script' | 'sceneCount' | 'narrationFilePath'
> {
  return {
    name: entry.suggestedName,
    script: entry.script,
    sceneCount: entry.sceneCount,
    // El audio de la historia queda elegido desde el arranque: «Subir mi
    // audio» lo muestra cargado y, con tts, el payload no lo manda.
    narrationFilePath: entry.audioFile,
  }
}

// El formulario inicial en demo: voz y primer estilo del pack, sin pausas,
// sin música ni personajes, arrancando en 16:9.
export function demoFormValue(
  base: CreateFormValue,
  manifest: DemoManifest,
): CreateFormValue {
  const styleId = demoStyleIds(manifest)[0] ?? base.styleId
  return {
    ...base,
    narrationMode: 'tts',
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
    ...storyPatch(
      demoEntryFor(manifest, DEMO_VIDEO_FORMAT, 'catalog', styleId),
    ),
  }
}

// Al cambiar de formato, de estilo o de pestaña, nombre, guion, escenas y
// audio siguen a la historia elegida (derivado en el manejador del cambio,
// sin efecto).
export function demoFollowStyle(
  manifest: DemoManifest,
  current: CreateFormValue,
  patch: Partial<CreateFormValue>,
): Partial<CreateFormValue> {
  if (
    patch.videoFormat === undefined &&
    patch.styleId === undefined &&
    patch.styleSource === undefined
  )
    return {}
  const format = patch.videoFormat ?? current.videoFormat
  const styleSource = patch.styleSource ?? current.styleSource
  const styleId = patch.styleId ?? current.styleId
  return storyPatch(demoEntryFor(manifest, format, styleSource, styleId))
}
