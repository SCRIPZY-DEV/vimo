import type { CreateFormValue } from '@/modules/videos/types/create'
import type { DemoStyleRequestResult } from '@/modules/videos/types/demo'
import type { SelectedCustomStyle } from '@/modules/videos/types/styles'
import type { CatalogGem } from '@pipeline/types/catalog.ts'
import type {
  DemoAvatar,
  DemoGem,
  DemoManifest,
  DemoStories,
  DemoStyleEntry,
} from '@pipeline/types/demo.ts'
import type { VideoFormat } from '@pipeline/types/video-format.ts'

// Crear en modo demo (ADR-0029, ADR-0030; spec demo v4 §2): todo sale del
// manifest del pack —voz, estilos y gemas que se ofrecen, formatos, nombre,
// guion, escenas, audio y el avatar—. Publicar un pack con otras historias no
// exige tocar la app. Módulo puro, sin imports de runtime: lo corre
// scripts/test/check-app-demo-form.mjs con Node, sin bundler.

// Lo que se elige en las pestañas: la pestaña y la tarjeta.
type StyleChoice = Pick<CreateFormValue, 'styleSource' | 'customStyle'>

type StoryChoice = Pick<
  CreateFormValue,
  'videoFormat' | 'styleSource' | 'customStyle'
>

// Los formatos del selector de Crear, en su orden: el espejo de los ids de
// VIDEO_FORMATS (constants.ts), que este módulo no puede importar porque corre
// con Node pelado. El guard fija que sean todos los formatos del contrato.
const VIDEO_FORMAT_IDS: VideoFormat[] = ['16:9', '9:16']

const NO_STORIES: DemoStories = { styles: [], gems: [] }

// Las historias de un formato; sin ese formato en el pack, ninguna (el
// selector lo deja en «Próximamente»).
function storiesFor(manifest: DemoManifest, format: VideoFormat): DemoStories {
  return manifest.stories[format] ?? NO_STORIES
}

// Ids de los estilos del catálogo con historia en el formato, en el orden del
// manifest: la galería del Catálogo de la demo muestra solo esos.
export function demoCatalogIds(
  manifest: DemoManifest,
  format: VideoFormat,
): string[] {
  return storiesFor(manifest, format).styles.map((entry) => entry.id)
}

// Las gemas del pack con historia en el formato (en Short no está
// Jardinería), por el id con el que la galería de Mi estilo las lista: el
// `styleId` sembrado, no el id de la gema.
export function demoGemStyleIds(
  manifest: DemoManifest,
  format: VideoFormat,
): string[] {
  return storiesFor(manifest, format).gems.flatMap((entry) => {
    const gem = manifest.gems.find((candidate) => candidate.id === entry.id)
    if (!gem) return []

    return [gem.styleId]
  })
}

// La historia que trae el avatar (la de Jardinería), en el primer formato que
// la tiene; null si el pack no trae ninguna.
function avatarStory(manifest: DemoManifest): DemoStyleEntry | null {
  for (const format of VIDEO_FORMAT_IDS) {
    const entry = storiesFor(manifest, format).gems.find(
      (candidate) => candidate.avatar !== undefined,
    )
    if (entry) return entry
  }

  return null
}

// La gema de la historia con avatar: la única que el switch de avatar puede
// usar. null sin avatar en el pack (el switch queda en «Próximamente»).
export function demoAvatarGem(manifest: DemoManifest): DemoGem | null {
  const entry = avatarStory(manifest)
  if (!entry) return null

  return manifest.gems.find((gem) => gem.id === entry.id) ?? null
}

// El avatar que muestra la tarjeta de Crear: el de la historia, fijo.
export function demoAvatar(manifest: DemoManifest): DemoAvatar | null {
  return avatarStory(manifest)?.avatar ?? null
}

// ¿Lo elegido es la gema del avatar (en Mi estilo)?
function choosesAvatarGem(
  manifest: DemoManifest,
  choice: StyleChoice,
): boolean {
  const gem = demoAvatarGem(manifest)
  if (!gem || choice.styleSource !== 'custom' || !choice.customStyle)
    return false

  return choice.customStyle.styleId === gem.styleId
}

// Los formatos donde la gema del avatar trae su historia con avatar.
function avatarFormats(manifest: DemoManifest): VideoFormat[] {
  const gem = demoAvatarGem(manifest)
  if (!gem) return []

  return VIDEO_FORMAT_IDS.filter((format) => {
    const entry = storiesFor(manifest, format).gems.find(
      (candidate) => candidate.id === gem.id,
    )
    return entry?.avatar !== undefined
  })
}

// La historia de lo elegido en el formato del formulario: la del estilo del
// catálogo, por su `catalogStyleId`, en la pestaña Catálogo; la de la gema del
// pack, por su `styleId` sembrado, en Mi estilo. null sin tarjeta, con una
// tarjeta en la pestaña que no es la suya, o si el pack no la trae en ese
// formato (la galería no la ofrece): sin historia, nombre, guion y audio no se
// tocan.
export function demoEntryFor(
  manifest: DemoManifest,
  form: StoryChoice,
): DemoStyleEntry | null {
  const style = form.customStyle
  if (!style) return null

  const stories = storiesFor(manifest, form.videoFormat)
  if (form.styleSource === 'catalog')
    return (
      stories.styles.find((entry) => entry.id === style.catalogStyleId) ?? null
    )

  const gem = manifest.gems.find(
    (candidate) => candidate.styleId === style.styleId,
  )
  if (!gem) return null

  return stories.gems.find((entry) => entry.id === gem.id) ?? null
}

// ¿Se ofrece el formato con lo elegido? Con el switch de avatar, solo el de la
// historia con avatar; con una tarjeta, si su historia existe en ese formato;
// sin tarjeta (la galería todavía carga), si el pack trae historias de la
// pestaña en ese formato.
function formatOffered(
  manifest: DemoManifest,
  form: Pick<CreateFormValue, 'useAvatar'> & StoryChoice,
): boolean {
  if (form.useAvatar) return avatarFormats(manifest).includes(form.videoFormat)

  if (form.customStyle) return demoEntryFor(manifest, form) !== null

  const stories = storiesFor(manifest, form.videoFormat)
  if (form.styleSource === 'catalog') return stories.styles.length > 0

  return stories.gems.length > 0
}

// Formatos en «Próximamente»: los que no tienen la historia elegida (con
// Jardinería o con el switch de avatar encendido, Short).
export function demoComingSoonFormats(
  manifest: DemoManifest,
  form: Pick<
    CreateFormValue,
    'videoFormat' | 'styleSource' | 'customStyle' | 'useAvatar'
  >,
): VideoFormat[] {
  return VIDEO_FORMAT_IDS.filter(
    (format) => !formatOffered(manifest, { ...form, videoFormat: format }),
  )
}

// El switch encendido: Mi estilo con la gema del avatar, en el formato de su
// historia (el actual si la tiene; si no, el primero que la tiene).
function avatarOnPatch(
  manifest: DemoManifest,
  form: CreateFormValue,
  avatarGemStyle: SelectedCustomStyle | null,
): Partial<CreateFormValue> {
  const formats = avatarFormats(manifest)
  const videoFormat = formats.includes(form.videoFormat)
    ? form.videoFormat
    : (formats[0] ?? form.videoFormat)

  return {
    useAvatar: true,
    styleSource: 'custom',
    customStyle: avatarGemStyle,
    videoFormat,
  }
}

// Lo pedido, salvo una tarjeta sin historia en el formato actual (la que la
// otra pestaña tenía guardada de otro formato): esa no se elige y la pestaña
// queda sin tarjeta; en Catálogo, Crear usa la primera de la galería.
function availableChoice(
  manifest: DemoManifest,
  form: CreateFormValue,
  requested: StyleChoice,
): StyleChoice {
  if (!requested.customStyle) return requested

  const entry = demoEntryFor(manifest, {
    ...requested,
    videoFormat: form.videoFormat,
  })
  if (entry) return requested

  return { ...requested, customStyle: null }
}

// ¿El pedido quita la tarjeta de la pestaña en uso? Pasa al borrar la gema
// elegida.
function deselects(form: CreateFormValue, requested: StyleChoice): boolean {
  return (
    requested.customStyle === null && requested.styleSource === form.styleSource
  )
}

// Qué hace la demo cuando se pide otro estilo o la otra pestaña (pedido del
// dueño del 2026-10-14). Con el switch de avatar encendido solo vale la gema
// del avatar: cualquier otro pedido vuelve a ella, en Mi estilo, y el
// formulario avisa («Usa este estilo para avatar o desactiva el switch para
// usar otro»). Si no hay a dónde volver —la gema no está en la lista de Mi
// estilo, o el pedido quita la tarjeta en uso porque se borró la gema—, el
// switch se apaga y el pedido pasa, sin aviso. Con el switch apagado el pedido
// pasa, salvo elegir esa gema, que lo enciende (su historia trae el avatar y
// no hay versión sin él), y salvo una tarjeta sin historia en el formato
// actual, que no se elige.
export function demoStyleRequest(
  manifest: DemoManifest,
  form: CreateFormValue,
  requested: StyleChoice,
  avatarGemStyle: SelectedCustomStyle | null,
): DemoStyleRequestResult {
  const wantsAvatarGem = choosesAvatarGem(manifest, requested)
  if (form.useAvatar && wantsAvatarGem)
    return { patch: requested, redirected: false }

  if (form.useAvatar && avatarGemStyle && !deselects(form, requested))
    return {
      patch: avatarOnPatch(manifest, form, avatarGemStyle),
      redirected: true,
    }

  if (form.useAvatar)
    return {
      patch: {
        ...availableChoice(manifest, form, requested),
        useAvatar: false,
      },
      redirected: false,
    }

  if (wantsAvatarGem)
    return {
      patch: avatarOnPatch(manifest, form, requested.customStyle),
      redirected: false,
    }

  return {
    patch: availableChoice(manifest, form, requested),
    redirected: false,
  }
}

// El switch de avatar en la demo. Encendido: Mi estilo con la gema del avatar,
// en el formato de su historia (en el pack, 16:9: desde Short pasa a 16:9).
// Sin esa gema en la lista de Mi estilo (todavía carga, o la persona la borró
// en esta visita y la puerta la vuelve a sembrar en la próxima) no se enciende:
// no hay historia con avatar que elegir y el formulario sigue como estaba.
// Apagado con esa gema elegida: la pestaña Catálogo sin tarjeta, donde Crear
// usa la primera que ofrece la galería con su historia (la gema no tiene
// historia sin avatar). Apagado con otra cosa, solo se apaga. Sin avatar en el
// pack el switch no hace nada.
export function demoAvatarToggle(
  manifest: DemoManifest,
  form: CreateFormValue,
  useAvatar: boolean,
  avatarGemStyle: SelectedCustomStyle | null,
): Partial<CreateFormValue> {
  if (!demoAvatarGem(manifest)) return {}

  if (useAvatar && !avatarGemStyle) return {}

  if (useAvatar) return avatarOnPatch(manifest, form, avatarGemStyle)

  if (!choosesAvatarGem(manifest, form)) return { useAvatar: false }

  return { useAvatar: false, styleSource: 'catalog', customStyle: null }
}

// Los estilos que muestra la galería del Catálogo de la demo en el formato:
// los de la lista del catálogo (en su orden) con historia en el pack. Un id
// del pack que la lista no trae no está, ni uno de la lista sin historia. Es
// el único cálculo de lo que se ve: la galería, el texto de la pestaña y la
// tarjeta por defecto salen de acá. Con la lista cargando, ninguno.
export function demoVisibleCatalogGems<Gem extends Pick<CatalogGem, 'id'>>(
  manifest: DemoManifest,
  format: VideoFormat,
  gems: Gem[],
): Gem[] {
  const ids = demoCatalogIds(manifest, format)
  return gems.filter((gem) => ids.includes(gem.id))
}

// La tarjeta que usa la pestaña Catálogo de la demo sin una elegida: la
// primera de la galería. null fuera de esa pestaña, con una tarjeta elegida o
// sin ninguna a la vista (la lista todavía carga): nada elegido, y el envío se
// frena.
export function demoDefaultCatalogGem<Gem extends Pick<CatalogGem, 'id'>>(
  manifest: DemoManifest,
  form: StoryChoice,
  gems: Gem[],
): Gem | null {
  if (form.styleSource !== 'catalog' || form.customStyle) return null

  return demoVisibleCatalogGems(manifest, form.videoFormat, gems).at(0) ?? null
}

// Nombre con el que «Subir mi audio» muestra el audio cargado: el de la
// historia que lo trae (el archivo se llama audio.mp3 en todas las carpetas
// del pack). undefined si no es de ninguna: se muestra el nombre del archivo.
export function demoAudioFileLabel(
  manifest: DemoManifest,
  form: Pick<CreateFormValue, 'narrationFilePath'>,
): string | undefined {
  const entry = VIDEO_FORMAT_IDS.flatMap((format) => {
    const stories = storiesFor(manifest, format)
    return [...stories.styles, ...stories.gems]
  }).find((candidate) => candidate.audioFile === form.narrationFilePath)
  if (!entry) return undefined

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

// El formulario inicial en demo: la voz del pack, sin pausas, sin música ni
// personajes, en la pestaña Catálogo sin tarjeta (Crear usa la primera que
// ofrece la galería) y con la historia del primer estilo del pack en el
// formato de `base`, que trae su calidad (Create la arranca en 16:9).
export function demoFormValue(
  base: CreateFormValue,
  manifest: DemoManifest,
): CreateFormValue {
  const firstStory = storiesFor(manifest, base.videoFormat).styles.at(0)

  return {
    ...base,
    narrationMode: 'tts',
    styleSource: 'catalog',
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
    ...(firstStory ? storyPatch(firstStory) : {}),
  }
}

// Al cambiar de formato, de estilo o de pestaña, nombre, guion, escenas y
// audio siguen a la historia elegida (derivado en el manejador del cambio,
// sin efecto). Sin historia para lo que queda elegido, o si la historia es la
// misma (la misma tarjeta otra vez, o un pedido que la demo rechaza con el
// avatar encendido), no se tocan: lo que la persona escribió se queda.
export function demoFollowStyle(
  manifest: DemoManifest,
  current: CreateFormValue,
  patch: Partial<CreateFormValue>,
): Partial<CreateFormValue> {
  if (
    patch.videoFormat === undefined &&
    patch.customStyle === undefined &&
    patch.styleSource === undefined
  )
    return {}

  const entry = demoEntryFor(manifest, { ...current, ...patch })
  if (!entry || entry === demoEntryFor(manifest, current)) return {}

  return storyPatch(entry)
}
