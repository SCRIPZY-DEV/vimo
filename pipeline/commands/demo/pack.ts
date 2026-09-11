import { copyFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { isValidFile, projectsRootOf } from '../../project/paths.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { DemoConfig } from '../../config/pipeline-config.ts'
import type {
  DemoManifest,
  DemoStories,
  DemoStoriesByFormat,
  DemoStyleEntry,
  DemoVoice,
} from '../../types/demo.ts'
import type { VideoFormat } from '../../types/video-format.ts'
import type { VideoProjectOptions } from '../../types/video-project.ts'
import type { VoiceProviderId } from '../../types/voices.ts'
import { ensureDirectory, writeFileAtomic } from '../../utils/atomic-fs.ts'
import {
  MAX_SAMPLES,
  MAX_SHOTS,
  STYLE_FILE,
  styleDirectory,
  type StoredStyle,
} from '../styles/style-store.ts'

// El pack pre-hecho de la demo (ADR-0027, v3 en ADR-0028): el zip publicado
// se extrae TAL CUAL (claves en español) en <projectsRoot>/_demo-pack y se
// traduce al formato nativo al leer y al copiar. La raíz es el formato v2
// (una carpeta por estilo, en 16:9); `short/` repite ese árbol en 9:16 y es
// opcional — sin él no hay historias Short. Este archivo es el único que
// conoce ese formato.
export const DEMO_PACK_SUBDIRECTORY = '_demo-pack'
export const DEMO_PACK_OK_FILE = '.ok'
export const DEMO_PACK_MANIFEST_FILE = 'manifest.json'
// Estilos del catálogo con historia pre-hecha (carpetas del pack = styleId).
export const DEMO_CATALOG_STYLES = [
  'pov_stickman',
  'normal',
  'cartoon',
] as const
// La gema («Mi estilo») del pack: su historia y su estilo.json + muestras.
export const DEMO_CUSTOM_STYLE_FOLDER = 'storytelling'
export const DEMO_GEM_FOLDER = 'gema'
// Las historias en 9:16 (pack v3): mismo árbol por estilo bajo esta carpeta.
export const DEMO_SHORT_FOLDER = 'short'
// Id con el que se siembra en la galería (_styles/<id>/); cumple
// STYLE_ID_PATTERN.
export const DEMO_CUSTOM_STYLE_ID = 'demo-storytelling'

// Archivos por carpeta de estilo, con sus nombres del origen.
export const PACK_SCRIPT_FILE = 'guion.txt'
export const PACK_AUDIO_FILE = 'audio.mp3'
export const PACK_WORDS_FILE = 'palabras.json'
export const PACK_SCENES_FILE = 'escenas.json'
export const PACK_IMAGES_DIRECTORY = 'imagenes'
export const PACK_VIDEO_FILE = 'video_final.mp4'
export const PACK_GEM_STYLE_FILE = 'estilo.json'
const PACK_GEM_SAMPLE_PREFIX = 'muestra-'

const VOICE_PROVIDER_IDS: readonly string[] = [
  'minimax',
  'elevenlabs',
  'vbee',
  'fishaudio',
  'edge',
  'elevenlabs-direct',
]
const FALLBACK_VOICE_PROVIDER: VoiceProviderId = 'elevenlabs'

// ─── Formato del origen (solo lectura) ───

interface PackManifestEntry {
  id?: string
  nombreSugerido?: string
  numEscenas?: number
  duracionAudioSeg?: number
}

// Las historias de un formato tal como las lista el manifest: la raíz (16:9)
// y, desde v3, el bloque `short` (9:16).
interface PackStoriesManifest {
  estilos?: PackManifestEntry[]
  gema?: PackManifestEntry
}

interface PackManifest extends PackStoriesManifest {
  version?: string
  voz?: { provider?: string; voice_id?: string; nombre?: string }
  short?: PackStoriesManifest
}

export interface PackScene {
  id: number
  texto: string
  promptImagen?: string
  tiempoInicioSeg: number
  tiempoFinSeg: number
}

export interface PackWord {
  word: string
  start: number
  end: number
  confidence?: number
}

interface PackGemStyle {
  nombre?: string
  systemPrompt?: string
  planos?: string | string[]
}

interface OkMarker {
  version?: string
  sha256?: string
}

export function demoPackRoot(context: PipelineContext): string {
  return join(projectsRootOf(context), DEMO_PACK_SUBDIRECTORY)
}

export function packImageFile(storyDirectory: string, sceneId: number): string {
  return join(storyDirectory, PACK_IMAGES_DIRECTORY, `imagen_${sceneId}.jpg`)
}

// Con qué carpeta del pack se arma un proyecto: la gema manda (customStyle
// presente = carril «Mi estilo»); si no, el estilo del catálogo elegido. Un
// estilo fuera de la demo es un error FINAL (el formulario en demo solo
// ofrece los del pack).
export function demoStyleFolderFor(options: VideoProjectOptions): string {
  if (options.customStyle) return DEMO_CUSTOM_STYLE_FOLDER
  if ((DEMO_CATALOG_STYLES as readonly string[]).includes(options.styleId))
    return options.styleId
  throw new PipelineFailure(
    'demo_style_not_included',
    `style "${options.styleId}" has no pre-built demo`,
  )
}

// La carpeta de una historia = formato + estilo: la raíz para 16:9, `short/`
// para 9:16 (ADR-0028).
export function demoStoryDirectory(
  packRoot: string,
  format: VideoFormat,
  styleFolder: string,
): string {
  if (format === '9:16') return join(packRoot, DEMO_SHORT_FOLDER, styleFolder)
  return join(packRoot, styleFolder)
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch {
    return null
  }
}

function hasStories(block: PackStoriesManifest | undefined): boolean {
  return Array.isArray(block?.estilos) && block?.gema !== undefined
}

// El bloque `short` es opcional, pero si está tiene la misma forma que la
// raíz: un `short` malformado invalida el manifest entero.
async function readPackManifest(
  packRoot: string,
): Promise<PackManifest | null> {
  const manifest = await readJsonFile<PackManifest>(
    join(packRoot, DEMO_PACK_MANIFEST_FILE),
  )
  if (!manifest?.voz?.voice_id || !hasStories(manifest)) return null
  if (manifest.short !== undefined && !hasStories(manifest.short)) return null
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

// Las historias de un árbol (la raíz o `short/`): el manifest tiene que
// nombrar los tres estilos del catálogo (con ese `id` exacto) y una gema con
// id, y cada carpeta tiene que estar completa. Si falta algo,
// run-demo-pipeline no lo encontraría más tarde y el proyecto quedaría
// incompletable sin que `.ok` lo hubiera avisado. `prefix` vacío = la raíz.
async function validateStories(
  packRoot: string,
  prefix: string,
  block: PackStoriesManifest,
): Promise<string | null> {
  const label = prefix ? `${prefix} ` : ''
  for (const styleId of DEMO_CATALOG_STYLES) {
    if (!block.estilos?.some((entry) => entry.id === styleId))
      return `${DEMO_PACK_MANIFEST_FILE} lists no ${label}entry for style "${styleId}"`
  }
  if (!block.gema?.id?.trim())
    return `${DEMO_PACK_MANIFEST_FILE} ${label}gema entry has no id`

  for (const folder of [...DEMO_CATALOG_STYLES, DEMO_CUSTOM_STYLE_FOLDER]) {
    const relative = prefix ? `${prefix}/${folder}` : folder
    const directory = join(packRoot, prefix, folder)
    for (const file of [
      PACK_SCRIPT_FILE,
      PACK_AUDIO_FILE,
      PACK_WORDS_FILE,
      PACK_VIDEO_FILE,
    ]) {
      if (!(await isValidFile(join(directory, file))))
        return `${relative}/${file} is missing`
    }
    const scenes = await readJsonFile<PackScene[]>(
      join(directory, PACK_SCENES_FILE),
    )
    if (!Array.isArray(scenes) || scenes.length === 0)
      return `${relative}/${PACK_SCENES_FILE} is missing or empty`
    for (const scene of scenes) {
      if (
        typeof scene?.id !== 'number' ||
        typeof scene.promptImagen !== 'string'
      )
        return `${relative}/${PACK_SCENES_FILE} has a scene without id or promptImagen`
      if (!(await isValidFile(packImageFile(directory, scene.id))))
        return `${relative}/${PACK_IMAGES_DIRECTORY}/imagen_${scene.id}.jpg is missing`
    }
  }
  return null
}

// null = pack completo; string = el primer problema encontrado (diagnóstico).
export async function validatePack(packRoot: string): Promise<string | null> {
  const manifest = await readPackManifest(packRoot)
  if (!manifest) return `${DEMO_PACK_MANIFEST_FILE} is missing or malformed`

  const landscape = await validateStories(packRoot, '', manifest)
  if (landscape) return landscape

  // `short/` es opcional; presente, se exige entero (ADR-0028).
  if (manifest.short) {
    const short = await validateStories(
      packRoot,
      DEMO_SHORT_FOLDER,
      manifest.short,
    )
    if (short) return short
  }

  const gem = await readJsonFile<PackGemStyle>(
    join(packRoot, DEMO_GEM_FOLDER, PACK_GEM_STYLE_FILE),
  )
  if (!gem?.nombre?.trim() || !gem.systemPrompt?.trim())
    return `${DEMO_GEM_FOLDER}/${PACK_GEM_STYLE_FILE} lacks nombre or systemPrompt`
  if (
    !(await isValidFile(
      join(packRoot, DEMO_GEM_FOLDER, `${PACK_GEM_SAMPLE_PREFIX}1.jpg`),
    ))
  )
    return `${DEMO_GEM_FOLDER}/${PACK_GEM_SAMPLE_PREFIX}1.jpg is missing`

  return null
}

// Instalado = el marcador `.ok` sella ESTA versión y ESTE SHA-256, y los
// archivos están completos (un pack a medias o de otra versión no cuenta).
export async function isPackInstalled(
  packRoot: string,
  demo: DemoConfig,
): Promise<boolean> {
  const marker = await readJsonFile<OkMarker>(join(packRoot, DEMO_PACK_OK_FILE))
  if (!marker) return false
  if (marker.version !== demo.packVersion) return false
  if (marker.sha256?.toLowerCase() !== demo.packSha256.toLowerCase())
    return false
  return (await validatePack(packRoot)) === null
}

export async function writeOkMarker(
  packRoot: string,
  demo: DemoConfig,
  sha256: string,
): Promise<void> {
  const marker: OkMarker = { version: demo.packVersion, sha256 }
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

async function toStyleEntry(
  packRoot: string,
  prefix: string,
  folder: string,
  entry: PackManifestEntry,
): Promise<DemoStyleEntry> {
  const directory = join(packRoot, prefix, folder)
  const script = await readFile(join(directory, PACK_SCRIPT_FILE), 'utf8')
  return {
    id: entry.id ?? folder,
    suggestedName: entry.nombreSugerido ?? folder,
    script: script.trim(),
    sceneCount: entry.numEscenas ?? 0,
    audioDurationSeconds: entry.duracionAudioSeg ?? 0,
    audioFile: join(directory, PACK_AUDIO_FILE),
  }
}

// Las historias de un árbol en formato nativo. Solo entran los estilos del
// catálogo que tienen carpeta en el pack.
async function readStories(
  packRoot: string,
  prefix: string,
  block: PackStoriesManifest,
): Promise<DemoStories> {
  const styles: DemoStyleEntry[] = []
  for (const entry of block.estilos ?? []) {
    if (!entry.id) continue
    if (!(DEMO_CATALOG_STYLES as readonly string[]).includes(entry.id)) continue
    styles.push(await toStyleEntry(packRoot, prefix, entry.id, entry))
  }
  if (styles.length === 0)
    throw new PipelineFailure(
      'demo_pack_incomplete',
      `${DEMO_PACK_MANIFEST_FILE} lists no ${prefix || 'landscape'} catalog style`,
    )
  if (!block.gema)
    throw new PipelineFailure(
      'demo_pack_incomplete',
      `${DEMO_PACK_MANIFEST_FILE} has no ${prefix || 'landscape'} gema entry`,
    )
  return {
    styles,
    customStyle: await toStyleEntry(
      packRoot,
      prefix,
      DEMO_CUSTOM_STYLE_FOLDER,
      block.gema,
    ),
  }
}

// El manifest nativo: lo que Crear necesita para pre-llenarse, con las
// historias por formato (16:9 siempre; 9:16 solo si el pack trae `short`).
export async function readDemoManifest(
  packRoot: string,
  demo: DemoConfig,
): Promise<DemoManifest> {
  const manifest = await readPackManifest(packRoot)
  if (!manifest)
    throw new PipelineFailure(
      'demo_pack_incomplete',
      `${DEMO_PACK_MANIFEST_FILE} is missing or malformed`,
    )

  const stories: DemoStoriesByFormat = {
    '16:9': await readStories(packRoot, '', manifest),
  }
  if (manifest.short)
    stories['9:16'] = await readStories(
      packRoot,
      DEMO_SHORT_FOLDER,
      manifest.short,
    )

  const voice: DemoVoice = {
    provider: toVoiceProviderId(manifest.voz?.provider),
    voiceId: manifest.voz?.voice_id ?? '',
    name: manifest.voz?.nombre ?? '',
  }

  return {
    version: manifest.version ?? demo.packVersion,
    voice,
    stories,
    customStyleId: DEMO_CUSTOM_STYLE_ID,
  }
}

function toShots(planos: string | string[] | undefined): string[] {
  const raw = Array.isArray(planos) ? planos : (planos ?? '').split('\n')
  return raw
    .map((shot) => (typeof shot === 'string' ? shot.trim() : ''))
    .filter(Boolean)
    .slice(0, MAX_SHOTS)
}

export async function isCustomStyleSeeded(
  context: PipelineContext,
): Promise<boolean> {
  return isValidFile(
    join(styleDirectory(context, DEMO_CUSTOM_STYLE_ID), STYLE_FILE),
  )
}

// Siembra la gema en la galería nativa (contrato de style-store: style.json
// sin id adentro + sample-N.jpg). SOLO si no existe: nunca pisa ediciones.
export async function seedCustomStyle(
  context: PipelineContext,
  packRoot: string,
): Promise<void> {
  if (await isCustomStyleSeeded(context)) return

  const gemDirectory = join(packRoot, DEMO_GEM_FOLDER)
  const gem = await readJsonFile<PackGemStyle>(
    join(gemDirectory, PACK_GEM_STYLE_FILE),
  )
  if (!gem?.nombre?.trim() || !gem.systemPrompt?.trim())
    throw new PipelineFailure(
      'demo_pack_incomplete',
      `${DEMO_GEM_FOLDER}/${PACK_GEM_STYLE_FILE} lacks nombre or systemPrompt`,
    )

  const stored: StoredStyle = {
    name: gem.nombre.trim(),
    systemPrompt: gem.systemPrompt,
    shots: toShots(gem.planos),
    // El armador del pack fuerza personaje genérico en la gema.
    character: { mode: 'generic' },
    createdAt: new Date().toISOString(),
  }
  const directory = styleDirectory(context, DEMO_CUSTOM_STYLE_ID)
  await ensureDirectory(directory)
  for (let index = 1; index <= MAX_SAMPLES; index++) {
    const sample = join(gemDirectory, `${PACK_GEM_SAMPLE_PREFIX}${index}.jpg`)
    if (!(await isValidFile(sample))) break
    await copyFile(sample, join(directory, `sample-${index}.jpg`))
  }
  // El style.json va al final: hasta que existe, la gema no cuenta como
  // sembrada y una interrupción a medias se repara sola en el próximo prepare.
  await writeFileAtomic(
    join(directory, STYLE_FILE),
    `${JSON.stringify(stored, null, 2)}\n`,
  )
}
