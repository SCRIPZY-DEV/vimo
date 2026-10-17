// Arma el pack v4 de la demo (ADR-0029, ADR-0030; formato v4 en
// docs/handoff/2026-10-14-demo-v4/design.md §3) desde proyectos NATIVOS
// terminados —uno por historia, en el formato de esa historia— y las gemas de
// «Mi estilo». Primero valida todo lo que no necesita procesar los medios:
// cada proyecto, la traducción al formato del pack (claves en español, sin
// recibos ni URLs del proveedor), el manifest, el formato real de cada medio y
// un staging armado con copias baratas (clones en APFS) que revisa el mismo
// lector que usa la app (validatePack): una entrada mala falla en segundos.
// Después recomprime imágenes, clips y videos con el ffmpeg empaquetado,
// varios a la vez, vuelve a pasar el lector y escribe las partes: zips sin
// compresión (los medios ya vienen comprimidos) y sin ZIP64, cada uno con
// historias enteras —nunca un archivo partido entre dos zips—; la primera
// parte abre con manifest.json y gemas/. Imprime parts.json (archivo, bytes y
// SHA-256 de cada parte) para DEFAULT_PIPELINE_CONFIG.demo. Solo dev; no
// viaja en el build.
//
//   pnpm build:demo-pack --stories <stories.json> --gems <gems.json> \
//     --out <carpeta> [--part-mb 500] [--jobs 4] [--no-recompress]
//
// stories.json, en el orden del manifest (una historia por formato e id):
//   [{ "format": "16:9" | "9:16",
//      "id": "<catalogStyleId del estilo, o id de la gema>",
//      "kind": "catalog" | "gem",
//      "project": "<carpeta del proyecto animado>",
//      "staticVideo": "<mp4 del mismo proyecto sin animar>",
//      "title"?: "<nombre sugerido; por defecto, el del proyecto>" }]
// gems.json:
//   [{ "id": "storytelling", "styleId": "demo-storytelling",
//      "styleDir": "<_styles/<styleId>: style.json y sample-N.jpg>",
//      "avatarPreview"?: "<vista del look, si una historia de la gema trae
//                         avatar>" }]
// Las rutas relativas se resuelven contra la carpeta del JSON que las nombra.
//
// En --out quedan vimo-demo-pack-v4.part-<n>.zip y parts.json
// ([{ "file", "bytes", "sha256" }]); las partes de un armado anterior en esa
// carpeta se reemplazan. --part-mb es el tope de cada parte en MB (1 MB =
// 1 000 000 bytes): una historia más grande que el tope va sola en su parte, y
// ninguna parte pasa de 2000 MB (el límite de un asset de GitHub es 2 GiB).
// --jobs es cuántos ffmpeg corren a la vez (4 por defecto): no cambia la
// salida, que sale igual byte a byte. --no-recompress copia los medios tal
// cual (para probar rápido) y no necesita ffmpeg.
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  constants as fsConstants,
  createReadStream,
  createWriteStream,
  existsSync,
} from 'node:fs'
import {
  copyFile,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { crc32 } from 'node:zlib'

import { sceneAnimationClipFile } from '../pipeline/animation/clip-path.ts'
import {
  findAvatarLookPreview,
  sceneAvatarClipFile,
} from '../pipeline/avatar/clip-path.ts'
import {
  DEMO_GEMS_FOLDER,
  DEMO_PACK_FORMAT_VERSION,
  DEMO_PACK_MANIFEST_FILE,
  DEMO_SHORT_FOLDER,
  PACK_ANIMATED_VIDEO_FILE,
  PACK_ANIMATIONS_DIRECTORY,
  PACK_AUDIO_FILE,
  PACK_AVATAR_DIRECTORY,
  PACK_AVATAR_PREVIEW_FILE,
  PACK_SCENES_FILE,
  PACK_SCRIPT_FILE,
  PACK_VIDEO_FILE,
  PACK_WORDS_FILE,
  demoStoryDirectory,
  packImageFile,
  validatePack,
} from '../pipeline/commands/demo/pack.ts'
import {
  MAX_SAMPLES,
  STYLE_FILE,
  STYLE_ID_PATTERN,
  isCatalogStyleId,
} from '../pipeline/commands/styles/style-store.ts'
import {
  isValidFile,
  resolveProjectPaths,
  sceneImageFile,
} from '../pipeline/project/paths.ts'
import { videoFormatOf } from '../pipeline/types/video-format.ts'
import { executableSuffix, targetTriple } from './target-triple.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

// ── Entrada ──────────────────────────────────────────────────────────────────
const VALUE_FLAGS = ['stories', 'gems', 'out', 'part-mb', 'jobs']
const REQUIRED_FLAGS = ['stories', 'gems', 'out']
const NO_RECOMPRESS_FLAG = '--no-recompress'
const DEFAULT_JOBS = 4
const PACK_FORMATS = ['16:9', '9:16']
const SHORT_FORMAT = '9:16'
const CATALOG_KIND = 'catalog'
const GEM_KIND = 'gem'
const STORY_KINDS = [CATALOG_KIND, GEM_KIND]
// Una historia con estos ids caería sobre otra carpeta del pack.
const RESERVED_STORY_IDS = [DEMO_SHORT_FOLDER, DEMO_GEMS_FOLDER]

// ── Lo que se exige a un proyecto ────────────────────────────────────────────
const COMPLETED_STATE = 'completed'
const TTS_NARRATION = 'tts'
const ANIMATION_STAGE = 'animation'
const AVATAR_STAGE = 'avatar'
const READY_STATUS = 'ready'
const MIN_VIDEO_BYTES = 100_000
// El personaje con el que se generó la historia: el del estilo (`generic`) o
// ninguno; cualquier otro modo sale como `none`.
const GENERIC_CHARACTER = 'generic'
const NO_CHARACTER = 'none'
// Una gema con personaje propio apunta a un personaje de la biblioteca de
// quien la creó, que una máquina de la demo no tiene.
const OWN_CHARACTER = 'own'

// Lo que nunca viaja en el pack, que es un release público. En escenas.json:
// los recibos, la tarea, los créditos y el código de error del proveedor en
// los bloques de animación y los recibos de HeyGen en el avatar. En el
// style.json de una gema: de dónde se clonó (`origin` puede traer el link del
// video de YouTube) y el texto que se mandó al agente (Ruling R13). En todos,
// cualquier campo cuyo valor sea una URL.
const ANIMATION_PRIVATE_FIELDS = [
  'task',
  'attempts',
  'creditsConsumed',
  'errorCode',
]
const AVATAR_PRIVATE_FIELDS = ['attempts']
const GEM_PRIVATE_FIELDS = ['origin', 'sourcePrompt']
const URL_VALUE_PATTERN = /^https?:\/\//i
const URL_ANYWHERE_PATTERN = /https?:\/\//i

// ── Medios ───────────────────────────────────────────────────────────────────
// Cómo viaja cada archivo de medios: las imágenes y los clips y videos se
// recomprimen; el audio, tal cual.
const IMAGE_MEDIA = 'image'
const CLIP_MEDIA = 'clip'
const VIDEO_MEDIA = 'video'
const PLAIN_MEDIA = 'plain'
// El formato real, por los primeros bytes: el pipeline guarda PNG con
// extensión .jpg (Ruling R4) y el demuxer de image2 decide por la extensión,
// así que se fuerza el que corresponde. Un mp4 abre con la caja `ftyp`.
const MEDIA_HEADER_BYTES = 12
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex')
const JPEG_SIGNATURE = Buffer.from('ffd8ff', 'hex')
const RIFF_SIGNATURE = 'RIFF'
const WEBP_SIGNATURE = 'WEBP'
const MP4_FIRST_BOX = 'ftyp'
const PNG_DEMUXER = 'png_pipe'
const JPEG_DEMUXER = 'jpeg_pipe'
const WEBP_DEMUXER = 'webp_pipe'
// Las carpetas del pack relativas a su raíz, para el plan (pack.ts arma las
// rutas con join, que normaliza el punto).
const PLAN_ROOT = '.'

// ── Recompresión (spec §3, «Tamaño y partes»; Ruling R10) ────────────────────
// Imágenes en JPEG (4:2:0, -q:v 4). Clips mudos y videos en H.264 CRF 28 con
// el preset medium: un video 1080p queda en ≈ 22 MB por minuto, igual a la
// vista en la pantalla de la demo. Cuadro por cuadro: el render y el editor
// cuentan los cuadros de un clip normalizado.
const IMAGE_QUALITY = '4'
const CLIP_CRF = '28'
const VIDEO_CRF = '28'
const VIDEO_PRESET = 'medium'
const RECOMPRESSED_IMAGE_EXTENSION = '.jpg'
const FFMPEG_OUTPUT_BYTES = 16 * 1024 * 1024
const IMAGE_OUTPUT_ARGUMENTS = [
  '-frames:v',
  '1',
  '-q:v',
  IMAGE_QUALITY,
  '-pix_fmt',
  'yuvj420p',
  '-update',
  '1',
]
const CLIP_OUTPUT_ARGUMENTS = [
  '-map',
  '0:v:0',
  '-an',
  '-sn',
  '-dn',
  '-map_metadata',
  '-1',
  '-c:v',
  'libx264',
  '-preset',
  VIDEO_PRESET,
  '-crf',
  CLIP_CRF,
  '-pix_fmt',
  'yuv420p',
  '-fps_mode',
  'passthrough',
  '-movflags',
  '+faststart',
]
const VIDEO_OUTPUT_ARGUMENTS = [
  '-c:v',
  'libx264',
  '-preset',
  VIDEO_PRESET,
  '-crf',
  VIDEO_CRF,
  '-pix_fmt',
  'yuv420p',
  '-fps_mode',
  'passthrough',
  '-c:a',
  'copy',
  '-movflags',
  '+faststart',
]

// ── Partes ───────────────────────────────────────────────────────────────────
const PARTS_FILE = 'parts.json'
const PART_FILE_PREFIX = `vimo-demo-pack-${DEMO_PACK_FORMAT_VERSION}.part-`
const PART_FILE_EXTENSION = '.zip'
const BYTES_PER_MEGABYTE = 1_000_000
const DEFAULT_PART_MEGABYTES = 500
const MAX_PART_MEGABYTES = 2000
// Zip «store» sin ZIP64: cabeceras de tamaño fijo, < 4 GiB y < 65535
// entradas por zip.
const LOCAL_HEADER_BYTES = 30
const CENTRAL_HEADER_BYTES = 46
const END_OF_CENTRAL_DIRECTORY_BYTES = 22
const MAX_ZIP_ENTRY_BYTES = 0xffffffff
const MAX_ZIP_ENTRIES = 0xffff

// `fail()` lanza en vez de terminar el proceso: así el `catch` de más abajo
// puede imprimir el mensaje y dejar que el `finally` limpie el staging antes
// de salir con process.exitCode = 1.
class BuildFailure extends Error {}

function fail(message) {
  throw new BuildFailure(message)
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isText(value) {
  return typeof value === 'string' && value.trim() !== ''
}

function isStyleId(value) {
  return typeof value === 'string' && STYLE_ID_PATTERN.test(value)
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
}

function formatMegabytes(bytes) {
  return `${(bytes / BYTES_PER_MEGABYTE).toFixed(1)} MB`
}

// Un bloque sin sus campos privados ni campos cuyo valor sea una URL.
function withoutPrivateFields(block, privateFields) {
  return Object.fromEntries(
    Object.entries(block).filter(
      ([key, value]) =>
        !privateFields.includes(key) &&
        !(typeof value === 'string' && URL_VALUE_PATTERN.test(value)),
    ),
  )
}

// ── Argumentos ───────────────────────────────────────────────────────────────
function parseArguments(argv) {
  const values = {}
  let recompress = true
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index]
    if (flag === NO_RECOMPRESS_FLAG) {
      recompress = false
      continue
    }

    const name = flag.startsWith('--') ? flag.slice(2) : ''
    if (!VALUE_FLAGS.includes(name)) fail(`argumento inválido: ${flag}`)
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--'))
      fail(`--${name} necesita un valor`)
    values[name] = value
    index += 1
  }
  for (const name of REQUIRED_FLAGS) {
    if (!values[name]) fail(`falta --${name}`)
  }

  const partMegabytes =
    values['part-mb'] === undefined
      ? DEFAULT_PART_MEGABYTES
      : Number(values['part-mb'])
  if (!(partMegabytes > 0) || partMegabytes > MAX_PART_MEGABYTES)
    fail(
      `--part-mb tiene que ser un número mayor que 0 y hasta ${MAX_PART_MEGABYTES}`,
    )
  const jobs = values.jobs === undefined ? DEFAULT_JOBS : Number(values.jobs)
  if (!Number.isInteger(jobs) || jobs < 1)
    fail('--jobs tiene que ser un entero mayor que 0')

  return {
    stories: resolve(values.stories),
    gems: resolve(values.gems),
    out: resolve(values.out),
    partBytes: Math.floor(partMegabytes * BYTES_PER_MEGABYTE),
    jobs,
    recompress,
  }
}

// ── Gemas (gems.json) ────────────────────────────────────────────────────────
// El nombre de la muestra N de una gema, como en la galería (style-store).
function sampleFile(index) {
  return `sample-${index}.jpg`
}

// Las muestras de una gema: sample-1.jpg, sample-2.jpg… hasta la primera que
// falta, como las copia la siembra.
async function gemSamples(styleDir) {
  const samples = []
  for (let index = 1; index <= MAX_SAMPLES; index++) {
    const file = join(styleDir, sampleFile(index))
    if (!(await isValidFile(file))) break
    samples.push(file)
  }
  return samples
}

async function readGems(file) {
  const entries = await readJson(file)
  if (!Array.isArray(entries)) fail(`${file} falta o no es un arreglo de gemas`)

  const base = dirname(file)
  const gems = []
  for (const entry of entries) {
    if (!isRecord(entry) || !isStyleId(entry.id) || !isStyleId(entry.styleId))
      fail(
        `${file}: cada gema necesita id y styleId que cumplan ${STYLE_ID_PATTERN}`,
      )
    if (
      gems.some((gem) => gem.id === entry.id || gem.styleId === entry.styleId)
    )
      fail(`${file}: la gema "${entry.id}" está dos veces`)
    if (!isText(entry.styleDir)) fail(`gema ${entry.id}: falta styleDir`)
    if (entry.avatarPreview !== undefined && !isText(entry.avatarPreview))
      fail(`gema ${entry.id}: avatarPreview tiene que ser una ruta`)

    const styleDir = resolve(base, entry.styleDir)
    const style = await readJson(join(styleDir, STYLE_FILE))
    if (!isRecord(style) || !isText(style.name))
      fail(
        `gema ${entry.id}: ${join(styleDir, STYLE_FILE)} falta o no tiene name`,
      )
    if (isRecord(style.character) && style.character.mode === OWN_CHARACTER)
      fail(
        `gema ${entry.id}: el estilo usa un personaje propio (character.mode ${OWN_CHARACTER}) que una máquina de la demo no tiene`,
      )
    const samples = await gemSamples(styleDir)
    if (samples.length === 0)
      fail(`gema ${entry.id}: falta ${join(styleDir, sampleFile(1))}`)
    const avatarPreview =
      entry.avatarPreview === undefined
        ? undefined
        : resolve(base, entry.avatarPreview)
    if (avatarPreview && !(await isValidFile(avatarPreview)))
      fail(`gema ${entry.id}: falta ${avatarPreview}`)

    gems.push({
      id: entry.id,
      styleId: entry.styleId,
      packedStyle: withoutPrivateFields(style, GEM_PRIVATE_FIELDS),
      samples,
      avatarPreview,
    })
  }
  return gems
}

// ── Historias (stories.json) ─────────────────────────────────────────────────
// Cómo se nombra una historia en los mensajes: su carpeta en el pack.
function storyLabel(format, id) {
  if (format === SHORT_FORMAT) return `${DEMO_SHORT_FOLDER}/${id}`
  return id
}

async function readStories(file, gems) {
  const entries = await readJson(file)
  if (!Array.isArray(entries) || entries.length === 0)
    fail(`${file} falta o no es un arreglo con al menos una historia`)

  const base = dirname(file)
  const stories = []
  for (const entry of entries) {
    if (!isRecord(entry)) fail(`${file}: cada historia es un objeto`)
    const { format, id, kind } = entry
    if (!PACK_FORMATS.includes(format))
      fail(`${file}: formato inválido "${format}" (16:9 o 9:16)`)
    if (!STORY_KINDS.includes(kind))
      fail(`${file}: kind inválido "${kind}" (catalog o gem)`)
    if (kind === CATALOG_KIND && !isCatalogStyleId(id))
      fail(`${file}: "${id}" no es un id de estilo del catálogo`)
    const gem =
      kind === GEM_KIND
        ? gems.find((candidate) => candidate.id === id)
        : undefined
    if (kind === GEM_KIND && !gem)
      fail(`${file}: la historia de gema "${id}" no está en gems.json`)
    if (RESERVED_STORY_IDS.includes(id))
      fail(`${file}: "${id}" es una carpeta del pack, no una historia`)

    const label = storyLabel(format, id)
    if (stories.some((story) => story.label === label))
      fail(`${file}: ${label} está dos veces`)
    if (!isText(entry.project) || !isText(entry.staticVideo))
      fail(`${label}: falta project o staticVideo en ${file}`)
    if (entry.title !== undefined && !isText(entry.title))
      fail(`${label}: title tiene que ser un texto`)

    stories.push({
      format,
      id,
      kind,
      gem,
      label,
      project: resolve(base, entry.project),
      staticVideo: resolve(base, entry.staticVideo),
      title: entry.title?.trim(),
    })
  }
  return stories
}

// ── Un proyecto nativo terminado → lo que necesita su historia ───────────────
function hasCompletedStage(metadata, stage) {
  return (
    Array.isArray(metadata.completedStages) &&
    metadata.completedStages.includes(stage)
  )
}

function isWord(value) {
  return (
    isRecord(value) &&
    typeof value.word === 'string' &&
    typeof value.start === 'number' &&
    typeof value.end === 'number'
  )
}

// La voz de la narración, o undefined si al proyecto le falta algún dato: el
// nombre también, porque el lector lo cambiaría por un texto vacío.
function voiceOf(options) {
  if (
    !isText(options.voiceProvider) ||
    !isText(options.voiceId) ||
    !isText(options.voiceName)
  )
    return undefined
  return {
    provider: options.voiceProvider,
    voiceId: options.voiceId,
    name: options.voiceName,
  }
}

// La historia sale del estilo que dice stories.json: el del catálogo por su
// catalogStyleId (carril del catálogo nuevo); la gema, por su styleId.
function checkStyle(story, options) {
  const customStyle = isRecord(options.customStyle)
    ? options.customStyle
    : undefined
  if (story.kind === CATALOG_KIND) {
    if (customStyle?.catalogStyleId === story.id) return
    fail(
      `${story.label}: el proyecto no es del estilo del catálogo "${story.id}" (customStyle.catalogStyleId es ${customStyle?.catalogStyleId})`,
    )
  }

  if (
    customStyle?.catalogStyleId === undefined &&
    customStyle?.styleId === story.gem.styleId
  )
    return
  fail(
    `${story.label}: el proyecto no es de la gema "${story.gem.id}" (customStyle.styleId tiene que ser ${story.gem.styleId})`,
  )
}

async function checkVideo(label, file, role) {
  const info = await stat(file).catch(() => null)
  if (info?.isFile() && info.size >= MIN_VIDEO_BYTES) return
  fail(
    `${label}: ${role} (${file}) falta o pesa menos de ${MIN_VIDEO_BYTES} bytes`,
  )
}

// Las escenas: ids contiguos desde 1, con tiempos, y cada una con su prompt y
// su imagen salvo las apariciones del avatar (Vimo no les genera ninguna,
// ADR-0057).
async function checkScenes(label, paths, scenes, hasAvatar) {
  for (const [index, scene] of scenes.entries()) {
    if (!isRecord(scene) || scene.id !== index + 1)
      fail(
        `${label}: ids de escena no contiguos (la posición ${index + 1} tiene el id ${scene?.id})`,
      )
    if (
      typeof scene.startSeconds !== 'number' ||
      typeof scene.endSeconds !== 'number'
    )
      fail(`${label}: la escena ${scene.id} no tiene tiempos`)
    if (isRecord(scene.avatar)) {
      if (!hasAvatar)
        fail(
          `${label}: la escena ${scene.id} es una aparición del avatar y el proyecto no tiene options.avatar`,
        )
      continue
    }

    if (!isText(scene.imagePrompt))
      fail(`${label}: la escena ${scene.id} no tiene imagePrompt`)
    if (!(await isValidFile(sceneImageFile(paths, scene.id))))
      fail(`${label}: falta scenes/scene_${scene.id}.jpg`)
  }
}

// El archivo del clip que nombra un bloque: un nombre suelto de Vimo, nunca
// una ruta (sceneAnimationClipFile lo valida).
function animationClipSource(label, paths, sceneId, block) {
  if (!isText(block.clipFile))
    fail(`${label}: el clip de la escena ${sceneId} no tiene clipFile`)
  try {
    return sceneAnimationClipFile(paths, sceneId, block)
  } catch {
    return fail(
      `${label}: la escena ${sceneId} nombra un clip inválido (${block.clipFile})`,
    )
  }
}

// Los clips de un proyecto animado (bloques en sus escenas o minutos pedidos):
// la fase terminada y cada bloque listo, normalizado y con su archivo. Sin
// bloques ni minutos pedidos, el proyecto no está animado.
async function animationClipsOf(label, paths, metadata, scenes) {
  const blocks = scenes.flatMap((scene) =>
    Array.isArray(scene.animations)
      ? scene.animations.map((block) => ({ sceneId: scene.id, block }))
      : [],
  )
  const requestedMinutes = metadata.options.animationMinutes
  if (blocks.length === 0 && !(requestedMinutes > 0)) return []
  if (!hasCompletedStage(metadata, ANIMATION_STAGE))
    fail(
      `${label}: el proyecto está animado y "animation" no está en completedStages`,
    )
  if (blocks.length === 0)
    fail(
      `${label}: el proyecto pidió ${requestedMinutes} min de animación y no tiene clips`,
    )

  const clips = []
  for (const { sceneId, block } of blocks) {
    if (!isRecord(block) || block.status !== READY_STATUS)
      fail(
        `${label}: el clip de la escena ${sceneId} no está listo (status ${block?.status})`,
      )
    if (!(block.normalizedSeconds > 0))
      fail(
        `${label}: el clip de la escena ${sceneId} no tiene normalizedSeconds > 0`,
      )
    const source = animationClipSource(label, paths, sceneId, block)
    if (!(await isValidFile(source)))
      fail(`${label}: falta animations/${block.clipFile}`)
    clips.push({ name: block.clipFile, source })
  }
  return clips
}

// El avatar de un proyecto (options.avatar): solo en una historia de gema que
// trae la vista del look en gems.json, con la fase terminada, cada aparición
// lista y con su clip, tantas como pidió (lo que muestra la tarjeta de Crear)
// y la vista del look en avatar/.
async function avatarOf(story, paths, metadata, scenes) {
  const { label } = story
  const options = metadata.options.avatar
  if (!isRecord(options)) return undefined
  if (story.kind !== GEM_KIND)
    fail(`${label}: solo una historia de gema puede traer avatar`)
  if (!story.gem.avatarPreview)
    fail(
      `${label}: la historia trae avatar y la gema "${story.gem.id}" no tiene avatarPreview en gems.json`,
    )
  if (!hasCompletedStage(metadata, AVATAR_STAGE))
    fail(
      `${label}: el proyecto trae avatar y "avatar" no está en completedStages`,
    )

  const appearances = scenes.filter((scene) => isRecord(scene.avatar))
  const clips = []
  for (const scene of appearances) {
    const { avatar } = scene
    if (avatar.status !== READY_STATUS)
      fail(
        `${label}: la aparición de la escena ${scene.id} no está lista (status ${avatar.status})`,
      )
    const source = sceneAvatarClipFile(paths, avatar)
    if (!source)
      fail(
        `${label}: la aparición de la escena ${scene.id} no nombra un clip válido (${avatar.clipFile})`,
      )
    if (!(await isValidFile(source)))
      fail(`${label}: falta avatar/${avatar.clipFile}`)
    clips.push({ name: avatar.clipFile, source })
  }
  if (appearances.length !== options.appearances)
    fail(
      `${label}: options.avatar pide ${options.appearances} apariciones y scenes.json trae ${appearances.length}`,
    )
  const look = await findAvatarLookPreview(paths)
  if (!look) fail(`${label}: falta la vista del look en avatar/ (look.<ext>)`)

  return { options, clips, look }
}

async function readProject(story, referenceVoice) {
  const { label } = story
  // project.json no depende del id; el resto de las rutas, sí (el video).
  const metadata = await readJson(
    resolveProjectPaths(story.project, basename(story.project)).metadataFile,
  )
  if (!isRecord(metadata) || !isText(metadata.id))
    fail(`${label}: ${story.project}/project.json falta o no tiene id`)
  const paths = resolveProjectPaths(story.project, metadata.id)
  if (metadata.state !== COMPLETED_STATE)
    fail(`${label}: el proyecto no está completed (está ${metadata.state})`)
  // Imágenes o clips rehechos después del render dejan el proyecto en
  // completed con este flag (markStoredVideoOutdated); solo un render lo
  // limpia. Su mp4 ya no es el que describen escenas.json y animaciones/.
  if (metadata.videoOutdated === true)
    fail(
      `${label}: el video del proyecto está desactualizado (videoOutdated): las imágenes o los clips cambiaron después del render; volvé a renderizarlo`,
    )
  if (!isRecord(metadata.options))
    fail(`${label}: project.json no tiene options`)

  const { options } = metadata
  const format = videoFormatOf(options)
  if (format !== story.format)
    fail(
      `${label}: el proyecto es ${format} y stories.json lo pone en ${story.format}`,
    )
  if (options.narrationMode !== TTS_NARRATION)
    fail(`${label}: el proyecto tiene que narrar con tts`)
  const voice = voiceOf(options)
  if (!voice)
    fail(`${label}: el proyecto no declara voiceProvider, voiceId y voiceName`)
  if (
    referenceVoice &&
    (voice.provider !== referenceVoice.provider ||
      voice.voiceId !== referenceVoice.voiceId)
  )
    fail(
      `${label}: la voz (${voice.provider} ${voice.voiceId}) no es la de la primera historia (${referenceVoice.provider} ${referenceVoice.voiceId}); misma voz en todas las historias`,
    )
  checkStyle(story, options)
  if (!(metadata.audioDurationSeconds > 0))
    fail(`${label}: project.json sin audioDurationSeconds`)
  const name =
    story.title ?? (isText(metadata.name) ? metadata.name.trim() : '')
  if (!name) fail(`${label}: el proyecto no tiene nombre ni title`)

  const script = (
    await readFile(paths.scriptFile, 'utf8').catch(() => '')
  ).trim()
  if (!script)
    fail(`${label}: ${basename(paths.scriptFile)} falta o está vacío`)
  if (!(await isValidFile(paths.narrationFile)))
    fail(`${label}: falta ${basename(paths.narrationFile)}`)
  const words = await readJson(paths.wordsFile)
  if (!Array.isArray(words) || words.length === 0 || !words.every(isWord))
    fail(
      `${label}: ${basename(paths.wordsFile)} falta, está vacío o malformado`,
    )
  const scenes = await readJson(paths.scenesFile)
  if (!Array.isArray(scenes) || scenes.length === 0)
    fail(`${label}: ${basename(paths.scenesFile)} falta o está vacío`)
  await checkScenes(label, paths, scenes, isRecord(options.avatar))

  const animationClips = await animationClipsOf(label, paths, metadata, scenes)
  const avatar = await avatarOf(story, paths, metadata, scenes)
  await checkVideo(label, story.staticVideo, 'staticVideo')
  if (animationClips.length > 0) {
    await checkVideo(label, paths.videoFile, 'el video animado del proyecto')
    if (story.staticVideo === paths.videoFile)
      fail(
        `${label}: staticVideo es el video animado del proyecto; tiene que ser el render sin animar`,
      )
  }

  return {
    story,
    paths,
    metadata,
    voice,
    name,
    script,
    scenes,
    // La traducción al pack ya hecha (y revisada): nada de esto espera a los
    // medios.
    packWords: words.map(({ word, start, end }) => ({ word, start, end })),
    packScenes: scenes.map((scene) => toPackScene(label, scene)),
    character:
      options.customStyle?.character?.mode === GENERIC_CHARACTER
        ? GENERIC_CHARACTER
        : NO_CHARACTER,
    animationClips,
    avatar,
  }
}

function describeProject(project) {
  const animated =
    project.animationClips.length > 0
      ? ` · animada (${project.animationClips.length} clips)`
      : ''
  const avatar = project.avatar
    ? ` · avatar (${project.avatar.clips.length} apariciones)`
    : ''
  return `${project.story.label}: «${project.name}» · ${project.scenes.length} escenas · ${project.metadata.audioDurationSeconds} s${animated}${avatar}`
}

// El orden del manifest y de las partes: 16:9 y después Short; en cada
// formato, el catálogo y después las gemas, cada grupo en el orden de
// stories.json.
function storyGroups(projects) {
  return PACK_FORMATS.map((format) => {
    const ofFormat = projects.filter(
      (project) => project.story.format === format,
    )
    return {
      format,
      catalog: ofFormat.filter(
        (project) => project.story.kind === CATALOG_KIND,
      ),
      gems: ofFormat.filter((project) => project.story.kind === GEM_KIND),
    }
  })
}

// ── Nativo → pack ────────────────────────────────────────────────────────────
// Lo que el editor y la simulación necesitan de la escena, con su forma
// nativa (PackSceneNative de pack.ts), o undefined si no trae nada.
function nativeFieldsOf(scene) {
  const native = {}
  if (scene.animationRequestedSeconds !== undefined)
    native.animationRequestedSeconds = scene.animationRequestedSeconds
  if (scene.staticTransitionIn !== undefined)
    native.staticTransitionIn = scene.staticTransitionIn
  if (Array.isArray(scene.animations) && scene.animations.length > 0)
    native.animations = scene.animations.map((block) =>
      withoutPrivateFields(block, ANIMATION_PRIVATE_FIELDS),
    )
  if (isRecord(scene.avatar))
    native.avatar = withoutPrivateFields(scene.avatar, AVATAR_PRIVATE_FIELDS)
  if (Object.keys(native).length === 0) return undefined
  return native
}

// Los campos del v3 (claves en español) más `nativo`. Una aparición del
// avatar no lleva promptImagen.
function toPackScene(label, scene) {
  const packScene = {
    id: scene.id,
    texto: scene.text ?? '',
    promptImagen: scene.imagePrompt,
    tiempoInicioSeg: scene.startSeconds,
    tiempoFinSeg: scene.endSeconds,
  }
  const native = nativeFieldsOf(scene)
  if (!native) return packScene
  if (URL_ANYWHERE_PATTERN.test(JSON.stringify(native)))
    fail(
      `${label}: la escena ${scene.id} conserva una URL en sus datos nativos`,
    )
  return { ...packScene, nativo: native }
}

function manifestStory(project) {
  const entry = {
    id: project.story.id,
    nombreSugerido: project.name,
    numEscenas: project.scenes.length,
    duracionAudioSeg: project.metadata.audioDurationSeconds,
    personaje: project.character,
    animada: project.animationClips.length > 0,
  }
  if (!project.avatar) return entry

  // El nombre que muestra la tarjeta es el del look elegido; `opciones` son
  // las del proyecto, que la simulación copia tal cual.
  const { options } = project.avatar
  return {
    ...entry,
    avatar: {
      nombre: options.lookName,
      motor: options.engine,
      apariciones: options.appearances,
      segundosPorAparicion: options.secondsPerAppearance,
      opciones: options,
    },
  }
}

// La raíz es el bloque 16:9; `short`, el de 9:16, solo si trae historias.
function buildManifest(projects, gems, voice) {
  const blocks = storyGroups(projects).map(({ catalog, gems: gemStories }) => ({
    estilos: catalog.map(manifestStory),
    historiasGema: gemStories.map(manifestStory),
  }))
  const [landscape, short] = blocks
  const manifest = {
    version: DEMO_PACK_FORMAT_VERSION,
    voz: {
      provider: voice.provider,
      voice_id: voice.voiceId,
      nombre: voice.name,
    },
    gemas: gems.map(({ id, styleId }) => ({ id, styleId })),
    ...landscape,
  }
  if (short.estilos.length + short.historiasGema.length === 0) return manifest
  return { ...manifest, short }
}

// ── El plan: qué lleva el pack, sin escribir nada ────────────────────────────
// Los textos (manifest, style.json de las gemas, guiones, palabras y
// escenas), ya traducidos, y los medios, cada uno con su origen, su destino
// en el pack (relativo a la raíz) y cómo viaja.
function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

// La vista del look conserva su nombre (look.<ext>); recomprimida, es un .jpg.
function lookName(source, recompress) {
  if (!recompress) return basename(source)
  return `${basename(source, extname(source))}${RECOMPRESSED_IMAGE_EXTENSION}`
}

function gemPlan(gem) {
  const folder = join(DEMO_GEMS_FOLDER, gem.id)
  const media = gem.samples.map((sample, index) => ({
    kind: IMAGE_MEDIA,
    source: sample,
    target: join(folder, sampleFile(index + 1)),
    label: folder,
  }))
  if (gem.avatarPreview)
    media.push({
      kind: IMAGE_MEDIA,
      source: gem.avatarPreview,
      target: join(folder, PACK_AVATAR_PREVIEW_FILE),
      label: folder,
    })
  return {
    texts: [
      { target: join(folder, STYLE_FILE), content: jsonText(gem.packedStyle) },
    ],
    media,
  }
}

// La carpeta de una historia (la inversa de la tabla de ADR-0029): solo lo
// que nombran sus escenas, nunca los `.source.mp4` ni las referencias de un
// clip, ni el crudo o el audio de una aparición.
function storyPlan(project, recompress) {
  const { story, paths } = project
  const { label } = story
  const folder = demoStoryDirectory(PLAN_ROOT, story.format, story.id)
  const texts = [
    { target: join(folder, PACK_SCRIPT_FILE), content: `${project.script}\n` },
    {
      target: join(folder, PACK_WORDS_FILE),
      content: JSON.stringify(project.packWords),
    },
    {
      target: join(folder, PACK_SCENES_FILE),
      content: jsonText(project.packScenes),
    },
  ]
  const item = (kind, source, target) => ({ kind, source, target, label })

  const media = [
    item(PLAIN_MEDIA, paths.narrationFile, join(folder, PACK_AUDIO_FILE)),
  ]
  for (const scene of project.scenes) {
    if (isRecord(scene.avatar)) continue
    media.push(
      item(
        IMAGE_MEDIA,
        sceneImageFile(paths, scene.id),
        packImageFile(folder, scene.id),
      ),
    )
  }
  for (const clip of project.animationClips)
    media.push(
      item(
        CLIP_MEDIA,
        clip.source,
        join(folder, PACK_ANIMATIONS_DIRECTORY, clip.name),
      ),
    )
  if (project.avatar) {
    const avatarFolder = join(folder, PACK_AVATAR_DIRECTORY)
    for (const clip of project.avatar.clips)
      media.push(item(CLIP_MEDIA, clip.source, join(avatarFolder, clip.name)))
    const { look } = project.avatar
    media.push(
      item(IMAGE_MEDIA, look, join(avatarFolder, lookName(look, recompress))),
    )
  }
  media.push(
    item(VIDEO_MEDIA, story.staticVideo, join(folder, PACK_VIDEO_FILE)),
  )
  if (project.animationClips.length > 0)
    media.push(
      item(
        VIDEO_MEDIA,
        paths.videoFile,
        join(folder, PACK_ANIMATED_VIDEO_FILE),
      ),
    )
  return { texts, media }
}

async function readMediaHeader(path) {
  const handle = await open(path, 'r')
  try {
    const header = Buffer.alloc(MEDIA_HEADER_BYTES)
    await handle.read(header, 0, MEDIA_HEADER_BYTES, 0)
    return header
  } finally {
    await handle.close()
  }
}

// El demuxer de ffmpeg que corresponde a los bytes de una imagen, o
// undefined si no es PNG, JPEG ni WEBP.
function imageDemuxerOf(header) {
  if (header.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE))
    return PNG_DEMUXER
  if (header.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE))
    return JPEG_DEMUXER
  if (
    header.toString('latin1', 0, 4) === RIFF_SIGNATURE &&
    header.toString('latin1', 8, 12) === WEBP_SIGNATURE
  )
    return WEBP_DEMUXER
  return undefined
}

// Lo que se puede revisar de un medio sin procesarlo: su formato real. Una
// imagen se lleva el demuxer con el que se recomprime.
async function withFormat(item) {
  if (item.kind === PLAIN_MEDIA) return item
  const header = await readMediaHeader(item.source)
  if (item.kind !== IMAGE_MEDIA) {
    if (header.toString('latin1', 4, 8) === MP4_FIRST_BOX) return item
    return fail(`${item.label}: ${item.source} no es un mp4`)
  }

  const demuxer = imageDemuxerOf(header)
  if (!demuxer)
    fail(`${item.label}: ${item.source} no es una imagen PNG, JPEG ni WEBP`)
  return { ...item, demuxer }
}

async function packPlan(gems, orderedProjects, manifest, recompress) {
  const pieces = [
    ...gems.map(gemPlan),
    ...orderedProjects.map((project) => storyPlan(project, recompress)),
  ]
  const texts = [
    { target: DEMO_PACK_MANIFEST_FILE, content: jsonText(manifest) },
    ...pieces.flatMap((piece) => piece.texts),
  ]
  const media = []
  for (const item of pieces.flatMap((piece) => piece.media))
    media.push(await withFormat(item))
  return { texts, media }
}

// ── Staging ──────────────────────────────────────────────────────────────────
// Copia barata: en APFS (macOS) es un clon instantáneo que no ocupa disco
// hasta que se reescribe; donde no se puede clonar, una copia común.
function cloneFile(source, target) {
  return copyFile(source, target, fsConstants.COPYFILE_FICLONE)
}

// El staging con los textos y los medios tal como vienen: es el pack final
// con --no-recompress y, si no, lo que el lector revisa antes de recomprimir.
async function writeStaging(staging, plan) {
  for (const text of plan.texts) {
    const target = join(staging, text.target)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, text.content)
  }
  for (const item of plan.media) {
    const target = join(staging, item.target)
    await mkdir(dirname(target), { recursive: true })
    await cloneFile(item.source, target)
  }
}

// El mismo lector que corre demo-prepare, y que cada archivo viaje en una
// sola unidad (devuelve las unidades con los tamaños de ese momento).
async function checkStaging(staging, orderedProjects, moment) {
  const problem = await validatePack(staging)
  if (problem) fail(`el lector de la app rechaza el pack ${moment}: ${problem}`)
  return packUnits(staging, orderedProjects)
}

// ── Recompresión con el ffmpeg empaquetado ───────────────────────────────────
// El mismo binario que Rust inyecta en `binaryPaths.ffmpeg` (ADR-0026): nunca
// el del PATH.
function pinnedFfmpeg() {
  let triple
  try {
    triple = targetTriple()
  } catch (error) {
    return fail(
      `no se pudo saber el target triple (rustc -Vv): ${error.message}`,
    )
  }
  const path = join(
    repoRoot,
    'src-tauri',
    'binaries',
    `ffmpeg-${triple}${executableSuffix(triple)}`,
  )
  if (!existsSync(path))
    fail(`falta el ffmpeg empaquetado: ${path} (pnpm fetch:binaries)`)
  return path
}

const runFile = promisify(execFile)

async function runFfmpeg(
  ffmpeg,
  source,
  target,
  inputArguments,
  outputArguments,
) {
  try {
    await runFile(
      ffmpeg,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        ...inputArguments,
        '-i',
        source,
        ...outputArguments,
        '-y',
        target,
      ],
      { maxBuffer: FFMPEG_OUTPUT_BYTES },
    )
  } catch (error) {
    const detail = String(error.stderr || error.message)
      .trim()
      .split('\n')
      .pop()
    fail(`ffmpeg no pudo recomprimir ${source}: ${detail}`)
  }
}

// Reescribe en el staging la copia de un medio con su versión recomprimida.
function recompressMedia(ffmpeg, staging, item) {
  const target = join(staging, item.target)
  if (item.kind === IMAGE_MEDIA)
    return runFfmpeg(
      ffmpeg,
      item.source,
      target,
      ['-f', item.demuxer],
      IMAGE_OUTPUT_ARGUMENTS,
    )
  if (item.kind === CLIP_MEDIA)
    return runFfmpeg(ffmpeg, item.source, target, [], CLIP_OUTPUT_ARGUMENTS)
  return runFfmpeg(ffmpeg, item.source, target, [], VIDEO_OUTPUT_ARGUMENTS)
}

// Corre `worker` sobre cada tarea, de a `jobs` a la vez y en el orden de la
// lista. Tras el primer error no arranca ninguna más, espera a las que están
// en curso (ningún ffmpeg queda escribiendo en un staging borrado) y lo
// relanza.
async function runPool(tasks, jobs, worker) {
  let next = 0
  const failures = []
  const runner = async () => {
    while (failures.length === 0 && next < tasks.length) {
      const task = tasks[next]
      next += 1
      try {
        await worker(task)
      } catch (error) {
        failures.push(error)
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(jobs, tasks.length) }, runner),
  )
  if (failures.length > 0) throw failures[0]
}

// Recomprime todos los medios menos el audio y avisa cuando termina cada
// historia o gema (el orden de los avisos depende de quién termina primero;
// el de los archivos en el pack, no).
async function recompressAll(ffmpeg, staging, plan, jobs) {
  const pending = plan.media.filter((item) => item.kind !== PLAIN_MEDIA)
  const remaining = new Map()
  for (const item of pending)
    remaining.set(item.label, (remaining.get(item.label) ?? 0) + 1)
  const total = remaining.size
  let finished = 0
  await runPool(pending, jobs, async (item) => {
    await recompressMedia(ffmpeg, staging, item)
    const left = remaining.get(item.label) - 1
    remaining.set(item.label, left)
    if (left > 0) return
    finished += 1
    process.stdout.write(
      `  · ${item.label} recomprimida (${finished}/${total})\n`,
    )
  })
}

// ── Partes ───────────────────────────────────────────────────────────────────
function zipName(root, path) {
  return relative(root, path).split('\\').join('/')
}

async function listFiles(root, directory = root) {
  const files = []
  // Orden binario, no localeCompare: los SHA-256 de las partes quedan
  // pineados en DEFAULT_PIPELINE_CONFIG.demo, así que los mismos insumos
  // tienen que dar los mismos zips sin importar el locale de la máquina.
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort(
    (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  )) {
    if (entry.name.startsWith('.')) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await listFiles(root, path)))
    else
      files.push({
        name: zipName(root, path),
        path,
        size: (await stat(path)).size,
      })
  }
  return files
}

// Lo que viaja junto: el manifest con las gemas (al frente de la parte 1) y
// después cada historia entera, en el orden del manifest. Cada archivo del
// staging va en una sola unidad, y cada unidad entra en un zip sin ZIP64.
async function packUnits(staging, orderedProjects) {
  const manifestPath = join(staging, DEMO_PACK_MANIFEST_FILE)
  const manifest = {
    name: zipName(staging, manifestPath),
    path: manifestPath,
    size: (await stat(manifestPath)).size,
  }
  // Sin gemas en gems.json no hay carpeta gemas/.
  const gemsDirectory = join(staging, DEMO_GEMS_FOLDER)
  const gems = existsSync(gemsDirectory)
    ? await listFiles(staging, gemsDirectory)
    : []
  const units = [{ label: 'manifest y gemas', files: [manifest, ...gems] }]
  for (const project of orderedProjects) {
    const { format, id, label } = project.story
    const directory = demoStoryDirectory(staging, format, id)
    units.push({ label, files: await listFiles(staging, directory) })
  }

  const packed = units.reduce((count, unit) => count + unit.files.length, 0)
  const staged = (await listFiles(staging)).length
  if (packed !== staged)
    fail(`el staging tiene ${staged} archivos y las partes llevarían ${packed}`)
  for (const unit of units) {
    if (unit.files.length > MAX_ZIP_ENTRIES)
      fail(
        `${unit.label} tiene ${unit.files.length} archivos: más de los ${MAX_ZIP_ENTRIES} de un zip sin ZIP64`,
      )
  }
  return units
}

function zipEntryBytes(file) {
  return (
    LOCAL_HEADER_BYTES +
    CENTRAL_HEADER_BYTES +
    2 * Buffer.byteLength(file.name) +
    file.size
  )
}

// Reparte las unidades en partes, en orden: una parte nueva cuando la que
// sigue no entra en el tope. Una unidad más grande que el tope va sola (una
// historia nunca se parte).
function planParts(units, partBytes) {
  const parts = []
  for (const unit of units) {
    const bytes = unit.files.reduce((sum, file) => sum + zipEntryBytes(file), 0)
    const current = parts.at(-1)
    if (current && current.bytes + bytes <= partBytes) {
      current.labels.push(unit.label)
      current.files.push(...unit.files)
      current.bytes += bytes
      continue
    }
    parts.push({
      labels: [unit.label],
      files: [...unit.files],
      bytes: END_OF_CENTRAL_DIRECTORY_BYTES + bytes,
    })
  }

  for (const [index, part] of parts.entries()) {
    if (part.bytes > MAX_PART_MEGABYTES * BYTES_PER_MEGABYTE)
      fail(
        `la parte ${index + 1} (${part.labels.join(', ')}) pesaría ${formatMegabytes(part.bytes)}: más que el tope de ${MAX_PART_MEGABYTES} MB`,
      )
    if (part.files.length > MAX_ZIP_ENTRIES)
      fail(
        `la parte ${index + 1} tendría ${part.files.length} archivos: más de los ${MAX_ZIP_ENTRIES} de un zip sin ZIP64`,
      )
  }
  return parts
}

// ── Zip «store» por streaming (sin ZIP64: < 4 GiB y < 65535 entradas) ────────
async function fileCrc32(path) {
  let crc = 0
  for await (const chunk of createReadStream(path)) crc = crc32(chunk, crc)
  return crc >>> 0
}

function localHeader(nameBytes, crc, size) {
  const header = Buffer.alloc(LOCAL_HEADER_BYTES)
  header.writeUInt32LE(0x04034b50, 0)
  header.writeUInt16LE(20, 4)
  header.writeUInt16LE(0x0800, 6)
  header.writeUInt16LE(0, 8)
  header.writeUInt16LE(0, 10)
  header.writeUInt16LE(0x21, 12)
  header.writeUInt32LE(crc, 14)
  header.writeUInt32LE(size, 18)
  header.writeUInt32LE(size, 22)
  header.writeUInt16LE(nameBytes.length, 26)
  header.writeUInt16LE(0, 28)
  return header
}

function centralHeader(nameBytes, crc, size, offset) {
  const header = Buffer.alloc(CENTRAL_HEADER_BYTES)
  header.writeUInt32LE(0x02014b50, 0)
  header.writeUInt16LE(20, 4)
  header.writeUInt16LE(20, 6)
  header.writeUInt16LE(0x0800, 8)
  header.writeUInt16LE(0, 10)
  header.writeUInt16LE(0, 12)
  header.writeUInt16LE(0x21, 14)
  header.writeUInt32LE(crc, 16)
  header.writeUInt32LE(size, 20)
  header.writeUInt32LE(size, 24)
  header.writeUInt16LE(nameBytes.length, 28)
  header.writeUInt16LE(0, 30)
  header.writeUInt16LE(0, 32)
  header.writeUInt16LE(0, 34)
  header.writeUInt16LE(0, 36)
  header.writeUInt32LE(0, 38)
  header.writeUInt32LE(offset, 42)
  return header
}

// Escribe los archivos en el orden dado (el de la parte).
async function writeStoreZip(files, out) {
  const output = createWriteStream(out)
  const write = (buffer) =>
    new Promise((resolvePromise, reject) => {
      output.write(buffer, (error) =>
        error ? reject(error) : resolvePromise(),
      )
    })
  const centrals = []
  let offset = 0
  // Si algo falla a mitad del zip (una entrada de más, o el corte de 4 GiB),
  // no dejamos una parte truncada: se cierra el stream y se borra el archivo
  // antes de volver a lanzar.
  try {
    for (const file of files) {
      if (file.size > MAX_ZIP_ENTRY_BYTES)
        fail(`${file.name} supera los 4 GiB de un zip sin ZIP64`)
      const nameBytes = Buffer.from(file.name, 'utf8')
      const nextOffset =
        offset + LOCAL_HEADER_BYTES + nameBytes.length + file.size
      if (nextOffset > MAX_ZIP_ENTRY_BYTES)
        fail('el zip supera los 4 GiB de un zip sin ZIP64')
      const crc = await fileCrc32(file.path)
      await write(localHeader(nameBytes, crc, file.size))
      await write(nameBytes)
      // `write` ya respeta backpressure (el callback de `stream.write`
      // resuelve recién cuando el chunk se drenó); evitamos
      // `pipeline(src, output, { end: false })` porque cada llamada deja
      // listeners de error/close/finish en el WriteStream de larga vida
      // hasta que termina de verdad, y con 200+ entradas dispara
      // MaxListenersExceededWarning.
      for await (const chunk of createReadStream(file.path)) await write(chunk)
      centrals.push(centralHeader(nameBytes, crc, file.size, offset), nameBytes)
      offset = nextOffset
    }
    const centralDirectory = Buffer.concat(centrals)
    const end = Buffer.alloc(END_OF_CENTRAL_DIRECTORY_BYTES)
    end.writeUInt32LE(0x06054b50, 0)
    end.writeUInt16LE(0, 4)
    end.writeUInt16LE(0, 6)
    end.writeUInt16LE(files.length, 8)
    end.writeUInt16LE(files.length, 10)
    end.writeUInt32LE(centralDirectory.length, 12)
    end.writeUInt32LE(offset, 16)
    end.writeUInt16LE(0, 20)
    await write(centralDirectory)
    await write(end)
    await new Promise((resolvePromise, reject) => {
      output.end((error) => (error ? reject(error) : resolvePromise()))
    })
  } catch (error) {
    output.destroy()
    await rm(out, { force: true })
    throw error
  }
}

async function fileSha256(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

function isBuildFile(name) {
  if (name === PARTS_FILE) return true
  return name.startsWith(PART_FILE_PREFIX) && name.endsWith(PART_FILE_EXTENSION)
}

// Las partes y el parts.json de un armado anterior en --out se reemplazan
// enteros: una parte que sobra no queda al lado de las nuevas.
async function removeBuildFiles(out) {
  for (const name of await readdir(out)) {
    if (isBuildFile(name)) await rm(join(out, name), { force: true })
  }
}

async function writeParts(out, parts) {
  await mkdir(out, { recursive: true })
  await removeBuildFiles(out)
  const listed = []
  try {
    for (const [index, part] of parts.entries()) {
      const file = `${PART_FILE_PREFIX}${index + 1}${PART_FILE_EXTENSION}`
      const path = join(out, file)
      await writeStoreZip(part.files, path)
      const bytes = (await stat(path)).size
      if (bytes !== part.bytes)
        fail(`${file} pesa ${bytes} bytes y se planeó de ${part.bytes}`)
      listed.push({ file, bytes, sha256: await fileSha256(path) })
    }
    await writeFile(
      join(out, PARTS_FILE),
      `${JSON.stringify(listed, null, 2)}\n`,
    )
  } catch (error) {
    await removeBuildFiles(out)
    throw error
  }
  return listed
}

// ── Main ────────────────────────────────────────────────────────────────────
try {
  const options = parseArguments(process.argv.slice(2))
  // Antes de tocar nada: --out es una carpeta (o todavía no existe).
  const outInfo = await stat(options.out).catch(() => null)
  if (outInfo && !outInfo.isDirectory())
    fail(`--out existe y no es una carpeta: ${options.out}`)
  const ffmpeg = options.recompress ? pinnedFfmpeg() : undefined

  // 1. Todo lo que se valida sin procesar los medios: las entradas, la
  //    traducción al pack, el manifest y el formato real de cada medio.
  const gems = await readGems(options.gems)
  const stories = await readStories(options.stories, gems)
  process.stdout.write(`Proyectos (${stories.length} historias):\n`)
  const projects = []
  let voice
  for (const story of stories) {
    const project = await readProject(story, voice)
    voice ??= project.voice
    projects.push(project)
    process.stdout.write(`  ✓ ${describeProject(project)}\n`)
  }
  const orderedProjects = storyGroups(projects).flatMap(({ catalog, gems }) => [
    ...catalog,
    ...gems,
  ])
  const manifest = buildManifest(projects, gems, voice)
  const plan = await packPlan(
    gems,
    orderedProjects,
    manifest,
    options.recompress,
  )
  process.stdout.write(
    `Voz: ${voice.provider} ${voice.voiceId} (${voice.name}) · ${plan.media.length} medios\n`,
  )

  const staging = await mkdtemp(join(tmpdir(), 'vimo-demo-pack-v4-'))
  try {
    // 2. El staging con copias baratas y el lector de la app: una entrada
    //    mala falla acá, en segundos, antes de recomprimir nada.
    await writeStaging(staging, plan)
    let units = await checkStaging(
      staging,
      orderedProjects,
      'antes de recomprimir',
    )
    process.stdout.write(
      'El lector de la app acepta el pack antes de recomprimir.\n',
    )

    // 3. Recomprimir de a varios y volver a pasar el lector.
    if (ffmpeg) {
      process.stdout.write(
        `Recomprimiendo con ${options.jobs} ffmpeg a la vez:\n`,
      )
      await recompressAll(ffmpeg, staging, plan, options.jobs)
      units = await checkStaging(
        staging,
        orderedProjects,
        'después de recomprimir',
      )
    }

    // 4. Las partes.
    const parts = planParts(units, options.partBytes)
    const listed = await writeParts(options.out, parts)
    const total = listed.reduce((sum, part) => sum + part.bytes, 0)
    process.stdout.write(
      `\n✅ Pack ${DEMO_PACK_FORMAT_VERSION} en ${listed.length} partes (${formatMegabytes(total)}): ${options.out}\n`,
    )
    for (const [index, part] of listed.entries())
      process.stdout.write(
        `   ${part.file} · ${formatMegabytes(part.bytes)} · ${parts[index].labels.join(', ')}\n`,
      )
    process.stdout.write(
      `\n${PARTS_FILE}:\n${JSON.stringify(listed, null, 2)}\n`,
    )
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
} catch (error) {
  if (!(error instanceof BuildFailure)) throw error
  process.stderr.write(`✗ ${error.message}\n`)
  process.exitCode = 1
}
