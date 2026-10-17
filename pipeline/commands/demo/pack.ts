import { copyFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { isValidFile, projectsRootOf } from '../../project/paths.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { DemoConfig } from '../../config/pipeline-config.ts'
import type { SceneAnimation } from '../../types/animation.ts'
import {
  AVATAR_ENGINES,
  AVATAR_LOOK_TYPES,
  AVATAR_PLACEMENTS,
  type AvatarEngine,
  type ProjectAvatarOptions,
  type SceneAvatar,
} from '../../types/avatar.ts'
import type {
  DemoAvatar,
  DemoCharacterMode,
  DemoGem,
  DemoManifest,
  DemoStories,
  DemoStoriesByFormat,
  DemoStyleEntry,
  DemoVoice,
} from '../../types/demo.ts'
import type { ImageExtension } from '../../types/image-provider.ts'
import { videoFormatOf, type VideoFormat } from '../../types/video-format.ts'
import type { VideoProjectOptions } from '../../types/video-project.ts'
import type { VoiceProviderId } from '../../types/voices.ts'
import { ensureDirectory, writeFileAtomic } from '../../utils/atomic-fs.ts'
import {
  MAX_SAMPLES,
  STYLE_FILE,
  STYLE_ID_PATTERN,
  isCatalogStyleId,
  readGemSections,
  styleDirectory,
  type StoredStyle,
} from '../styles/style-store.ts'
import { partSha256 } from './staging.ts'

// El pack pre-hecho de la demo (ADR-0029, ADR-0030; v4 en
// docs/handoff/2026-10-14-demo-v4/design.md §3): las partes publicadas se
// extraen TAL CUAL (claves en español) en <projectsRoot>/_demo-pack y se
// traducen al formato nativo al leer y al copiar. Lo manda el manifest: cada
// historia que lista (estilos del catálogo y gemas, por formato) tiene su
// carpeta en el árbol de su formato —la raíz para 16:9, `short/` para 9:16—
// y cada gema la suya en `gemas/`. Este archivo es el único que conoce ese
// formato.
export const DEMO_PACK_SUBDIRECTORY = '_demo-pack'
export const DEMO_PACK_OK_FILE = '.ok'
export const DEMO_PACK_MANIFEST_FILE = 'manifest.json'
// La versión del formato que entiende este lector: otro manifest (un pack v3
// instalado) no vale y la puerta ofrece bajar el nuevo.
export const DEMO_PACK_FORMAT_VERSION = 'v4'
// Las historias en 9:16: el mismo árbol por historia bajo esta carpeta.
export const DEMO_SHORT_FOLDER = 'short'
// Las gemas de «Mi estilo»: `gemas/<id>/` con su style.json nativo (sin id),
// sus sample-N.jpg y, si una historia de la gema trae avatar, la vista del
// look.
export const DEMO_GEMS_FOLDER = 'gemas'

// Archivos por carpeta de historia, con sus nombres del origen.
export const PACK_SCRIPT_FILE = 'guion.txt'
export const PACK_AUDIO_FILE = 'audio.mp3'
export const PACK_WORDS_FILE = 'palabras.json'
export const PACK_SCENES_FILE = 'escenas.json'
export const PACK_IMAGES_DIRECTORY = 'imagenes'
export const PACK_VIDEO_FILE = 'video_final.mp4'
// La variante animada (historias con `animada`): el video y los clips que
// nombran sus escenas.
export const PACK_ANIMATED_VIDEO_FILE = 'video_animado.mp4'
export const PACK_ANIMATIONS_DIRECTORY = 'animaciones'
// Los clips de las apariciones del avatar (historias con `avatar`) y la
// vista del look con el nombre que le da Vimo en el proyecto, `look.<ext>`
// (avatar/clip-path.ts): la imagen fija de las apariciones, que la simulación
// copia tal cual (Ruling R8).
export const PACK_AVATAR_DIRECTORY = 'avatar'
const PACK_AVATAR_LOOK_NAME = 'look'
const PACK_AVATAR_LOOK_EXTENSIONS: readonly ImageExtension[] = [
  'jpg',
  'png',
  'webp',
]
// La vista del look del avatar, en la carpeta de la gema.
export const PACK_AVATAR_PREVIEW_FILE = 'avatar.jpg'

// Los formatos del pack, cada uno con su bloque en el manifest y su árbol.
const PACK_FORMATS: readonly VideoFormat[] = ['16:9', '9:16']
const DEMO_CHARACTER_MODES: readonly DemoCharacterMode[] = ['generic', 'none']
// Un clip nombrado en escenas.json es un archivo suelto, como los que arma
// Vimo (animation/clip-path.ts, avatar/clip-path.ts): nunca una ruta. La
// simulación lo copia al proyecto con ese nombre.
const PACK_CLIP_FILE_PATTERN = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*\.mp4$/

const VOICE_PROVIDER_IDS: readonly string[] = [
  'minimax',
  'elevenlabs',
  'vbee',
  'fishaudio',
  'edge',
  'elevenlabs-direct',
  'ai33',
]
const FALLBACK_VOICE_PROVIDER: VoiceProviderId = 'elevenlabs'

// ─── Formato del origen (solo lectura) ───
// Los tipos describen el pack como lo escribe el armador; `validatePack` lo
// comprueba en runtime antes de que nada lo lea.

interface PackAvatar {
  nombre: string
  motor: AvatarEngine
  apariciones: number
  segundosPorAparicion: number
  // Las opciones del proyecto con avatar del que salió la historia: la
  // simulación las copia a `options.avatar` (Ruling R8).
  opciones: ProjectAvatarOptions
}

// Una historia tal como la lista el manifest.
interface PackStory {
  id: string
  nombreSugerido?: string
  numEscenas?: number
  duracionAudioSeg?: number
  personaje: DemoCharacterMode
  animada: boolean
  avatar?: PackAvatar
}

// Las historias de un formato: las del catálogo y las de las gemas.
interface PackStoriesBlock {
  estilos?: PackStory[]
  historiasGema?: PackStory[]
}

interface PackGem {
  id: string
  styleId: string
}

// La raíz del manifest es el bloque 16:9; `short`, el de 9:16.
interface PackManifest extends PackStoriesBlock {
  version: string
  voz?: { provider?: string; voice_id?: string; nombre?: string }
  gemas: PackGem[]
  short?: PackStoriesBlock
}

// Lo que la escena nativa necesita además de los campos de siempre: la
// animación y el avatar, sin recibos, tareas ni URLs del proveedor.
export interface PackSceneNative {
  animationRequestedSeconds?: number
  staticTransitionIn?: boolean
  animations?: SceneAnimation[]
  avatar?: SceneAvatar
}

export interface PackScene {
  id: number
  texto: string
  promptImagen?: string
  tiempoInicioSeg: number
  tiempoFinSeg: number
  nativo?: PackSceneNative
}

export interface PackWord {
  word: string
  start: number
  end: number
  confidence?: number
}

// Lo que sella `.ok`: la versión y los SHA-256 de las partes, en orden.
interface OkMarker {
  version?: string
  parts?: string[]
}

export function demoPackRoot(context: PipelineContext): string {
  return join(projectsRootOf(context), DEMO_PACK_SUBDIRECTORY)
}

export function packImageFile(storyDirectory: string, sceneId: number): string {
  return join(storyDirectory, PACK_IMAGES_DIRECTORY, `imagen_${sceneId}.jpg`)
}

// La vista del look que trae una historia con avatar (la primera de jpg, png
// y webp, como la busca el proyecto), con su extensión; null si no trae.
export async function packAvatarLookFile(
  storyDirectory: string,
): Promise<{ file: string; extension: ImageExtension } | null> {
  for (const extension of PACK_AVATAR_LOOK_EXTENSIONS) {
    const file = join(
      storyDirectory,
      PACK_AVATAR_DIRECTORY,
      `${PACK_AVATAR_LOOK_NAME}.${extension}`,
    )
    if (await isValidFile(file)) return { file, extension }
  }

  return null
}

// La historia de un proyecto demo, por su carpeta: la del estilo del
// catálogo elegido (`customStyle.catalogStyleId`) o la de la gema de «Mi
// estilo» (`customStyle.styleId` igual al `styleId` de una gema del pack),
// siempre que tenga historia en el formato del proyecto. Cualquier otra cosa
// es un error FINAL: Crear en demo solo ofrece lo que el pack trae.
export function demoStoryFolderFor(
  options: VideoProjectOptions,
  manifest: DemoManifest,
): string {
  const format = videoFormatOf(options)
  const stories = manifest.stories[format]
  const customStyle = options.customStyle
  const catalogStyleId = customStyle?.catalogStyleId
  if (catalogStyleId !== undefined) {
    if (stories?.styles.some((entry) => entry.id === catalogStyleId))
      return catalogStyleId
    throw new PipelineFailure(
      'demo_style_not_included',
      `catalog style "${catalogStyleId}" has no pre-built ${format} demo`,
    )
  }

  const styleId = customStyle?.styleId
  const gem =
    typeof styleId === 'string'
      ? manifest.gems.find((candidate) => candidate.styleId === styleId)
      : undefined
  if (gem && stories?.gems.some((entry) => entry.id === gem.id)) return gem.id
  throw new PipelineFailure(
    'demo_style_not_included',
    `style "${styleId ?? options.styleId}" has no pre-built ${format} demo`,
  )
}

// La carpeta de una historia = formato + id: la raíz para 16:9, `short/`
// para 9:16 (ADR-0030).
export function demoStoryDirectory(
  packRoot: string,
  format: VideoFormat,
  storyFolder: string,
): string {
  if (format === '9:16') return join(packRoot, DEMO_SHORT_FOLDER, storyFolder)
  return join(packRoot, storyFolder)
}

// Cómo nombran los diagnósticos a una historia: con su árbol delante.
function storyLabel(format: VideoFormat, id: string): string {
  if (format === '9:16') return `${DEMO_SHORT_FOLDER}/${id}`
  return id
}

function packStoriesBlock(
  manifest: PackManifest,
  format: VideoFormat,
): PackStoriesBlock | undefined {
  if (format === '9:16') return manifest.short
  return manifest
}

function storyCount(block: PackStoriesBlock | undefined): number {
  return (block?.estilos?.length ?? 0) + (block?.historiasGema?.length ?? 0)
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOptionalList(value: unknown): boolean {
  return value === undefined || Array.isArray(value)
}

function hasStoriesShape(block: unknown): boolean {
  if (block === undefined) return true
  if (!isRecord(block)) return false
  return isOptionalList(block.estilos) && isOptionalList(block.historiasGema)
}

// El manifest v4 con su forma: la versión del formato, la voz, la lista de
// gemas y al menos un formato con historias (16:9 en la raíz, 9:16 en
// `short`). Un bloque presente con otra forma invalida el manifest entero.
async function readPackManifest(
  packRoot: string,
): Promise<PackManifest | null> {
  const manifest = await readJsonFile<PackManifest>(
    join(packRoot, DEMO_PACK_MANIFEST_FILE),
  )
  if (!isRecord(manifest)) return null
  if (manifest.version !== DEMO_PACK_FORMAT_VERSION) return null
  const voiceId = manifest.voz?.voice_id
  if (typeof voiceId !== 'string' || !voiceId) return null
  if (!Array.isArray(manifest.gemas)) return null
  if (!hasStoriesShape(manifest) || !hasStoriesShape(manifest.short))
    return null
  const formats = PACK_FORMATS.filter(
    (format) => storyCount(packStoriesBlock(manifest, format)) > 0,
  )
  if (formats.length === 0) return null
  return manifest
}

export async function readPackScenes(
  storyDirectory: string,
): Promise<PackScene[]> {
  const scenes = await readJsonFile<PackScene[]>(
    join(storyDirectory, PACK_SCENES_FILE),
  )
  if (!Array.isArray(scenes) || scenes.length === 0)
    throw new PipelineFailure(
      'demo_pack_incomplete',
      `${PACK_SCENES_FILE} is missing or empty in ${storyDirectory}`,
    )
  return scenes
}

export async function readPackWords(
  storyDirectory: string,
): Promise<PackWord[]> {
  const words = await readJsonFile<PackWord[]>(
    join(storyDirectory, PACK_WORDS_FILE),
  )
  if (!Array.isArray(words) || words.length === 0)
    throw new PipelineFailure(
      'demo_pack_incomplete',
      `${PACK_WORDS_FILE} is missing or empty in ${storyDirectory}`,
    )
  return words
}

function isStyleId(value: unknown): value is string {
  return typeof value === 'string' && STYLE_ID_PATTERN.test(value)
}

function isCharacterMode(value: unknown): value is DemoCharacterMode {
  return DEMO_CHARACTER_MODES.some((mode) => mode === value)
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isFilledText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

// El avatar que declara una historia: lo que muestra la tarjeta de Crear.
function isPackAvatar(value: unknown): value is PackAvatar {
  if (!isRecord(value)) return false
  if (!isFilledText(value.nombre)) return false
  if (!AVATAR_ENGINES.some((engine) => engine === value.motor)) return false
  return (
    isPositiveInteger(value.apariciones) &&
    isPositiveInteger(value.segundosPorAparicion)
  )
}

// Las opciones del proyecto del que salió la historia (ProjectAvatarOptions,
// Ruling R8): los campos que guarda create-video-project, cada uno con su
// tipo. La simulación las copia a `options.avatar` y el editor las lee de
// ahí.
function isProjectAvatarOptions(value: unknown): value is ProjectAvatarOptions {
  if (!isRecord(value)) return false
  if (!isFilledText(value.avatarId)) return false
  if (!isFilledText(value.lookId) || !isFilledText(value.lookName)) return false
  if (!AVATAR_LOOK_TYPES.some((type) => type === value.lookType)) return false
  if (!AVATAR_ENGINES.some((engine) => engine === value.engine)) return false
  if (!isPositiveInteger(value.appearances)) return false
  if (!isPositiveInteger(value.secondsPerAppearance)) return false
  if (typeof value.startWithAvatar !== 'boolean') return false
  return AVATAR_PLACEMENTS.some((placement) => placement === value.placement)
}

function gemSampleFile(index: number): string {
  return `sample-${index}.jpg`
}

// El style.json nativo de una gema del pack (contrato de style-store, sin
// id): vale con nombre y con secciones o systemPrompt, lo mismo que pide la
// galería para listarla (readStyleEntry).
async function readPackGemStyle(
  gemDirectory: string,
): Promise<StoredStyle | null> {
  const stored = await readJsonFile<StoredStyle>(join(gemDirectory, STYLE_FILE))
  if (!isRecord(stored)) return null
  if (typeof stored.name !== 'string' || !stored.name.trim()) return null
  if (readGemSections(stored.sections)) return stored
  if (typeof stored.systemPrompt === 'string' && stored.systemPrompt.trim())
    return stored
  return null
}

// Las gemas que lista el manifest: ids que sirven de carpeta y de id de
// galería, sin repetir, cada una con su style.json y al menos una muestra.
async function validateGems(
  packRoot: string,
  gems: readonly PackGem[],
): Promise<string | null> {
  const ids = new Set<string>()
  const styleIds = new Set<string>()
  for (const gem of gems) {
    if (!isRecord(gem) || !isStyleId(gem.id) || !isStyleId(gem.styleId))
      return `${DEMO_PACK_MANIFEST_FILE} lists a gem without a valid id or styleId`
    if (ids.has(gem.id) || styleIds.has(gem.styleId))
      return `${DEMO_PACK_MANIFEST_FILE} lists gem "${gem.id}" twice`
    ids.add(gem.id)
    styleIds.add(gem.styleId)

    const relative = `${DEMO_GEMS_FOLDER}/${gem.id}`
    const directory = join(packRoot, DEMO_GEMS_FOLDER, gem.id)
    if (!(await readPackGemStyle(directory)))
      return `${relative}/${STYLE_FILE} is missing or lacks name, systemPrompt or sections`
    if (!(await isValidFile(join(directory, gemSampleFile(1)))))
      return `${relative}/${gemSampleFile(1)} is missing`
  }
  return null
}

// Un clip que nombra escenas.json: un archivo suelto que existe en su
// carpeta de la historia.
async function validateClip(
  directory: string,
  label: string,
  folder: string,
  clipFile: unknown,
): Promise<string | null> {
  if (typeof clipFile !== 'string' || !PACK_CLIP_FILE_PATTERN.test(clipFile))
    return `${label}/${PACK_SCENES_FILE} names an invalid ${folder} clip`
  if (!(await isValidFile(join(directory, folder, clipFile))))
    return `${label}/${folder}/${clipFile} is missing`
  return null
}

// Las escenas de una historia: cada una con su imagen y su prompt, salvo una
// aparición del avatar (Vimo no le genera ninguno, ADR-0057); con `animada`,
// el clip de cada bloque de animación, y al menos uno (la simulación los copia
// por su nombre); con `avatar`, el clip de cada aparición, y al menos una.
async function validateScenes(
  directory: string,
  label: string,
  story: PackStory,
): Promise<string | null> {
  const scenes = await readJsonFile<PackScene[]>(
    join(directory, PACK_SCENES_FILE),
  )
  if (!Array.isArray(scenes) || scenes.length === 0)
    return `${label}/${PACK_SCENES_FILE} is missing or empty`

  let animationClips = 0
  let avatarClips = 0
  for (const scene of scenes) {
    if (!isRecord(scene) || typeof scene.id !== 'number')
      return `${label}/${PACK_SCENES_FILE} has a scene without id`
    const native: PackSceneNative = isRecord(scene.nativo) ? scene.nativo : {}
    const avatar =
      story.avatar && isRecord(native.avatar) ? native.avatar : undefined

    if (!avatar) {
      if (typeof scene.promptImagen !== 'string')
        return `${label}/${PACK_SCENES_FILE} has a scene without promptImagen`
      if (!(await isValidFile(packImageFile(directory, scene.id))))
        return `${label}/${PACK_IMAGES_DIRECTORY}/imagen_${scene.id}.jpg is missing`
    }

    if (story.animada) {
      if (!isOptionalList(native.animations))
        return `${label}/${PACK_SCENES_FILE} has animations that are not a list`
      for (const animation of native.animations ?? []) {
        animationClips += 1
        const problem = await validateClip(
          directory,
          label,
          PACK_ANIMATIONS_DIRECTORY,
          isRecord(animation) ? animation.clipFile : undefined,
        )
        if (problem) return problem
      }
    }

    if (!avatar) continue
    avatarClips += 1
    const problem = await validateClip(
      directory,
      label,
      PACK_AVATAR_DIRECTORY,
      avatar.clipFile,
    )
    if (problem) return problem
  }

  if (story.animada && animationClips === 0)
    return `${label}/${PACK_SCENES_FILE} has no animation clip`
  if (story.avatar && avatarClips === 0)
    return `${label}/${PACK_SCENES_FILE} has no avatar appearance`
  return null
}

// Una historia completa: lo que declara el manifest y sus archivos. Si falta
// algo, run-demo-pipeline no lo encontraría más tarde y el proyecto quedaría
// incompletable sin que `.ok` lo hubiera avisado.
async function validateStory(
  packRoot: string,
  format: VideoFormat,
  story: PackStory,
  gem: boolean,
): Promise<string | null> {
  const label = storyLabel(format, story.id)
  if (!isCharacterMode(story.personaje))
    return `${label}: personaje must be generic or none`
  if (typeof story.animada !== 'boolean')
    return `${label}: animada must be a boolean`
  if (story.avatar !== undefined) {
    if (!gem) return `${label}: only gem stories can carry an avatar`
    if (!isPackAvatar(story.avatar))
      return `${label}: avatar needs nombre, motor, apariciones and segundosPorAparicion`
    if (!isProjectAvatarOptions(story.avatar.opciones))
      return `${label}: avatar needs opciones with the avatar options of its project`
  }

  const directory = demoStoryDirectory(packRoot, format, story.id)
  const files = [
    PACK_SCRIPT_FILE,
    PACK_AUDIO_FILE,
    PACK_WORDS_FILE,
    PACK_VIDEO_FILE,
    ...(story.animada ? [PACK_ANIMATED_VIDEO_FILE] : []),
  ]
  for (const file of files) {
    if (!(await isValidFile(join(directory, file))))
      return `${label}/${file} is missing`
  }
  if (story.avatar) {
    const preview = `${DEMO_GEMS_FOLDER}/${story.id}/${PACK_AVATAR_PREVIEW_FILE}`
    if (!(await isValidFile(join(packRoot, preview))))
      return `${preview} is missing`
    if (!(await packAvatarLookFile(directory)))
      return `${label}/${PACK_AVATAR_DIRECTORY}/${PACK_AVATAR_LOOK_NAME}.<${PACK_AVATAR_LOOK_EXTENSIONS.join('|')}> is missing`
  }

  return validateScenes(directory, label, story)
}

// El id de una historia es su carpeta: el de un estilo del catálogo (el
// `catalogStyleId` que manda Crear) o el de una gema que lista `gemas`.
function isStoryId(
  id: unknown,
  gem: boolean,
  gemIds: ReadonlySet<string>,
): id is string {
  if (gem) return typeof id === 'string' && gemIds.has(id)
  return isCatalogStyleId(id)
}

// Las historias de un formato: cada id una sola vez en el formato, también
// entre el catálogo y las gemas (caerían en la misma carpeta).
async function validateStories(
  packRoot: string,
  format: VideoFormat,
  block: PackStoriesBlock,
  gemIds: ReadonlySet<string>,
): Promise<string | null> {
  const prefix = format === '9:16' ? `${DEMO_SHORT_FOLDER} ` : ''
  const stories = [
    ...(block.estilos ?? []).map((story) => ({ story, gem: false })),
    ...(block.historiasGema ?? []).map((story) => ({ story, gem: true })),
  ]
  const seen = new Set<string>()
  for (const { story, gem } of stories) {
    const id = isRecord(story) ? story.id : undefined
    if (!isStoryId(id, gem, gemIds))
      return `${DEMO_PACK_MANIFEST_FILE} lists a ${prefix}story without a valid id`
    if (seen.has(id))
      return `${DEMO_PACK_MANIFEST_FILE} lists ${prefix}story "${id}" twice`
    seen.add(id)

    const problem = await validateStory(packRoot, format, story, gem)
    if (problem) return problem
  }
  return null
}

// null = pack completo; string = el primer problema encontrado (diagnóstico).
// La validación la manda el manifest: cada gema y cada historia que lista
// tiene que estar entera.
export async function validatePack(packRoot: string): Promise<string | null> {
  const manifest = await readPackManifest(packRoot)
  if (!manifest) return `${DEMO_PACK_MANIFEST_FILE} is missing or malformed`

  const gems = await validateGems(packRoot, manifest.gemas)
  if (gems) return gems

  const gemIds = new Set(manifest.gemas.map((gem) => gem.id))
  for (const format of PACK_FORMATS) {
    const block = packStoriesBlock(manifest, format)
    if (!block) continue
    const problem = await validateStories(packRoot, format, block, gemIds)
    if (problem) return problem
  }
  return null
}

// Los SHA-256 de las partes configuradas, en orden.
function packPartShas(demo: DemoConfig): string[] {
  return demo.packParts.map(partSha256)
}

function sealsParts(marker: OkMarker, demo: DemoConfig): boolean {
  const sealed = marker.parts
  const expected = packPartShas(demo)
  if (!Array.isArray(sealed) || sealed.length !== expected.length) return false
  return expected.every((sha256, index) => sealed[index] === sha256)
}

// Instalado = el marcador `.ok` sella ESTA versión y los SHA-256 de ESTAS
// partes, y los archivos están completos (un pack a medias, de otra versión
// o de otro armado no cuenta).
export async function isPackInstalled(
  packRoot: string,
  demo: DemoConfig,
): Promise<boolean> {
  const marker = await readJsonFile<OkMarker>(join(packRoot, DEMO_PACK_OK_FILE))
  if (!marker) return false
  if (marker.version !== demo.packVersion) return false
  if (!sealsParts(marker, demo)) return false
  return (await validatePack(packRoot)) === null
}

export async function writeOkMarker(
  packRoot: string,
  demo: DemoConfig,
): Promise<void> {
  const marker = { version: demo.packVersion, parts: packPartShas(demo) }
  await writeFileAtomic(
    join(packRoot, DEMO_PACK_OK_FILE),
    `${JSON.stringify(marker)}\n`,
  )
}

function isVoiceProviderId(value: string): value is VoiceProviderId {
  return VOICE_PROVIDER_IDS.includes(value)
}

function toVoiceProviderId(value: string | undefined): VoiceProviderId {
  return value && isVoiceProviderId(value) ? value : FALLBACK_VOICE_PROVIDER
}

function toDemoAvatar(
  packRoot: string,
  gemId: string,
  avatar: PackAvatar,
): DemoAvatar {
  return {
    name: avatar.nombre.trim(),
    engine: avatar.motor,
    appearances: avatar.apariciones,
    secondsPerAppearance: avatar.segundosPorAparicion,
    previewFile: join(
      packRoot,
      DEMO_GEMS_FOLDER,
      gemId,
      PACK_AVATAR_PREVIEW_FILE,
    ),
    options: avatar.opciones,
  }
}

async function toStyleEntry(
  packRoot: string,
  format: VideoFormat,
  story: PackStory,
): Promise<DemoStyleEntry> {
  const directory = demoStoryDirectory(packRoot, format, story.id)
  const script = await readFile(join(directory, PACK_SCRIPT_FILE), 'utf8')
  const entry: DemoStyleEntry = {
    id: story.id,
    suggestedName: story.nombreSugerido ?? story.id,
    script: script.trim(),
    sceneCount: story.numEscenas ?? 0,
    audioDurationSeconds: story.duracionAudioSeg ?? 0,
    audioFile: join(directory, PACK_AUDIO_FILE),
    character: story.personaje,
    animated: story.animada,
  }
  if (!story.avatar) return entry

  return { ...entry, avatar: toDemoAvatar(packRoot, story.id, story.avatar) }
}

async function readStories(
  packRoot: string,
  format: VideoFormat,
  block: PackStoriesBlock,
): Promise<DemoStories> {
  const styles: DemoStyleEntry[] = []
  for (const story of block.estilos ?? [])
    styles.push(await toStyleEntry(packRoot, format, story))
  const gems: DemoStyleEntry[] = []
  for (const story of block.historiasGema ?? [])
    gems.push(await toStyleEntry(packRoot, format, story))
  return { styles, gems }
}

async function toDemoGem(packRoot: string, gem: PackGem): Promise<DemoGem> {
  const stored = await readPackGemStyle(
    join(packRoot, DEMO_GEMS_FOLDER, gem.id),
  )
  if (!stored)
    throw new PipelineFailure(
      'demo_pack_incomplete',
      `${DEMO_GEMS_FOLDER}/${gem.id}/${STYLE_FILE} is missing or malformed`,
    )
  return { id: gem.id, styleId: gem.styleId, name: stored.name.trim() }
}

// El manifest nativo: lo que Crear necesita para pre-llenarse, con las gemas
// y las historias de cada formato que el pack trae (un formato sin historias
// no tiene clave).
export async function readDemoManifest(
  packRoot: string,
): Promise<DemoManifest> {
  const manifest = await readPackManifest(packRoot)
  if (!manifest)
    throw new PipelineFailure(
      'demo_pack_incomplete',
      `${DEMO_PACK_MANIFEST_FILE} is missing or malformed`,
    )

  const gems: DemoGem[] = []
  for (const gem of manifest.gemas) gems.push(await toDemoGem(packRoot, gem))

  const stories: DemoStoriesByFormat = {}
  for (const format of PACK_FORMATS) {
    const block = packStoriesBlock(manifest, format)
    if (!block || storyCount(block) === 0) continue
    stories[format] = await readStories(packRoot, format, block)
  }

  const voice: DemoVoice = {
    provider: toVoiceProviderId(manifest.voz?.provider),
    voiceId: manifest.voz?.voice_id ?? '',
    name: manifest.voz?.nombre ?? '',
  }

  return { version: manifest.version, voice, gems, stories }
}

async function isGemSeeded(
  context: PipelineContext,
  gem: DemoGem,
): Promise<boolean> {
  return isValidFile(join(styleDirectory(context, gem.styleId), STYLE_FILE))
}

export async function areGemsSeeded(
  context: PipelineContext,
  gems: readonly DemoGem[],
): Promise<boolean> {
  for (const gem of gems) {
    if (!(await isGemSeeded(context, gem))) return false
  }
  return true
}

// Siembra una gema en la galería nativa (contrato de style-store: style.json
// sin id adentro + sample-N.jpg). SOLO si no existe: nunca pisa ediciones.
async function seedGem(
  context: PipelineContext,
  packRoot: string,
  gem: DemoGem,
): Promise<void> {
  if (await isGemSeeded(context, gem)) return

  const gemDirectory = join(packRoot, DEMO_GEMS_FOLDER, gem.id)
  const stored = await readPackGemStyle(gemDirectory)
  if (!stored)
    throw new PipelineFailure(
      'demo_pack_incomplete',
      `${DEMO_GEMS_FOLDER}/${gem.id}/${STYLE_FILE} is missing or malformed`,
    )

  const directory = styleDirectory(context, gem.styleId)
  await ensureDirectory(directory)
  for (let index = 1; index <= MAX_SAMPLES; index++) {
    const sample = join(gemDirectory, gemSampleFile(index))
    if (!(await isValidFile(sample))) break
    await copyFile(sample, join(directory, gemSampleFile(index)))
  }
  // Para la galería es una gema recién agregada: fecha de hoy y sin la
  // última edición del origen.
  const seeded: StoredStyle = { ...stored, createdAt: new Date().toISOString() }
  delete seeded.updatedAt
  // El style.json va al final: hasta que existe, la gema no cuenta como
  // sembrada y una interrupción a medias se repara sola en el próximo prepare.
  await writeFileAtomic(
    join(directory, STYLE_FILE),
    `${JSON.stringify(seeded, null, 2)}\n`,
  )
}

// Siembra las gemas del pack en `_styles/<styleId>/`, cada una solo si no
// existe: una que la persona editó queda como está y una que borró vuelve.
export async function seedGems(
  context: PipelineContext,
  packRoot: string,
  gems: readonly DemoGem[],
): Promise<void> {
  for (const gem of gems) await seedGem(context, packRoot, gem)
}
