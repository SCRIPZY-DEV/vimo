// Guard ejecutable del modo demo (ADR-0029, ADR-0030; pack v4 en
// docs/handoff/2026-10-14-demo-v4/design.md §3). Sin app y sin red: genera un
// pack mínimo v4 en una carpeta temporal (las historias que lista el
// manifest: dos estilos del catálogo y dos gemas, una historia animada con un
// clip y una con avatar, 2 escenas por historia, archivos diminutos), lo
// empaqueta en zips en memoria (entero en una parte, y en dos partes como las
// arma el armador), los sirve por HTTP local y corre los subcomandos del
// sidecar contra una carpeta raíz temporal. Cada sección asserta un
// invariante de la ADR o de la spec. La sección 18 corre el armador
// (scripts/build-demo-pack.mjs) sobre proyectos nativos sintéticos, con
// medios diminutos del ffmpeg empaquetado en src-tauri/binaries; las
// secciones 21 a 33 prueban la instalación por partes: reanudable, con
// chequeo de espacio, con las partes que arma el armador (27), con un solo
// instalador por raíz (29 y 30) y ante los fallos de Windows y del disco
// (28, 31, 32 y 33, con stubs que el sidecar carga con --import). La
// simulación recorre las ocho fases de la corrida real (8 y 34 a 37): la
// animación del primer minuto con sus clips, el avatar de Jardinería junto
// con las imágenes y las fases que no aplican salteadas. Las secciones 38 a
// 40 vuelven a la instalación: el tope de inactividad de la descarga (un
// cuelgue de la red falla enseguida y sigue desde la parte que faltaba; una
// parte lenta pero viva no se corta), si alguien tiene el lock según
// demo-status, y el disco lleno al mover el pack o al sembrar las gemas.
//
//   pnpm check:demo
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import fsPromises, {
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  statfs,
  utimes,
  writeFile,
} from 'node:fs/promises'
import { createServer } from 'node:http'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { crc32 } from 'node:zlib'

import { extractZip } from '../../pipeline/commands/demo/extract.ts'
import {
  DEMO_LOCK_FILE,
  DEMO_STEAL_LOCK_FILE,
  withDemoInstallLock,
} from '../../pipeline/commands/demo/install-lock.ts'
import { validatePack } from '../../pipeline/commands/demo/pack.ts'
import {
  STAGING_STATE_FILE,
  requiredFreeBytes,
} from '../../pipeline/commands/demo/staging.ts'
import { DEFAULT_PIPELINE_CONFIG } from '../../pipeline/config/pipeline-config.ts'
import { executableSuffix, targetTriple } from '../target-triple.mjs'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const failures = []
let checks = 0

function assert(condition, message) {
  checks += 1
  if (condition) return
  failures.push(message)
  process.stdout.write(`  ✗ ${message}\n`)
}

function section(title) {
  process.stdout.write(`\n▸ ${title}\n`)
}

// ── Fixture: el pack mínimo v4 ───────────────────────────────────────────────
// Las historias de cada formato, en el orden del manifest: `normal` en los
// dos formatos y `2d-mono` (con personaje fijo) solo en 16:9; la gema
// `storytelling` en los dos y `jardineria` (con avatar) solo en 16:9.
const CATALOG_STORIES = { '16:9': ['normal', '2d-mono'], '9:16': ['normal'] }
const GEM_STORIES = {
  '16:9': ['storytelling', 'jardineria'],
  '9:16': ['storytelling'],
}
// El árbol de cada formato: la raíz es 16:9 y `short/` es 9:16 (ADR-0030).
const FORMAT_PREFIXES = { '16:9': '', '9:16': 'short/' }
const TITLES = {
  '16:9': {
    normal: 'El océano profundo',
    '2d-mono': 'El mono pintor',
    storytelling: 'La luz del farero',
    jardineria: 'Mi huerta en el balcón',
  },
  '9:16': {
    normal: 'Cómo nace una tormenta',
    storytelling: 'El último tren a casa',
  },
}
// Las gemas: su style.json nativo (sin id) va tal cual en gemas/<id>/. Una
// vieja (systemPrompt) y una de plantilla (secciones).
const PACK_CREATED_AT = '2026-10-01T00:00:00.000Z'
const GEMS = [
  {
    id: 'storytelling',
    styleId: 'demo-storytelling',
    style: {
      name: 'STORYTELLING mini',
      systemPrompt: 'You write prompts.',
      shots: [],
      character: { mode: 'none' },
      createdAt: PACK_CREATED_AT,
    },
  },
  {
    id: 'jardineria',
    styleId: 'demo-jardineria',
    style: {
      name: 'Jardinería mini',
      sections: { visualStyle: 'Acuarela suave de un jardín.' },
      shots: [],
      character: { mode: 'none' },
      createdAt: PACK_CREATED_AT,
      updatedAt: '2026-10-02T00:00:00.000Z',
    },
  },
]
// Los estilos con personaje fijo salen con su personaje (`generic`).
const CHARACTER_STORIES = ['2d-mono']
// La única historia animada (un clip en su escena 1) y la única con avatar
// (su escena 2 es una aparición: sin imagen ni prompt, ADR-0057).
const ANIMATED_STORY = { format: '16:9', id: 'normal' }
const AVATAR_STORY = { format: '16:9', id: 'jardineria' }
const ANIMATION_CLIP = 'anim_1.mp4'
const AVATAR_CLIP = 'scene_2.0123abcd.mp4'
const AVATAR_MANIFEST = {
  nombre: 'Jardineria',
  motor: 'avatar_iv',
  apariciones: 5,
  segundosPorAparicion: 5,
  opciones: {
    avatarId: 'jardineria-z2l3du',
    lookId: 'look-jardineria',
    lookName: 'Jardineria',
    lookType: 'photo_avatar',
    engine: 'avatar_iv',
    appearances: 5,
    secondsPerAppearance: 5,
    startWithAvatar: true,
    placement: 'auto',
  },
}
const FAKE_JPG = Buffer.from(
  'ffd8ffe000104a46494600010100000100010000ffd9',
  'hex',
)
const FAKE_MP3 = Buffer.from('not-a-real-mp3-but-enough-for-the-guard')
const FAKE_MP4 = Buffer.from('not-a-real-mp4-but-enough-for-the-guard')
const FAKE_ANIMATED_MP4 = Buffer.from('not-a-real-animated-mp4-for-the-guard')
const FAKE_CLIP_MP4 = Buffer.from('not-a-real-clip-mp4-for-the-guard')

const isStory = (story, format, id) =>
  story.format === format && story.id === id

// Las escenas de una historia, con su bloque `nativo` cuando lo trae: el
// clip de la animada y la aparición del avatar.
function storyScenes(format, id) {
  const kind = format === '9:16' ? 'short scene' : 'scene'
  const first = {
    id: 1,
    texto: 'Primera frase',
    promptImagen: `${id} ${kind} one`,
    tiempoInicioSeg: 0,
    tiempoFinSeg: 1.1,
  }
  const second = {
    id: 2,
    texto: 'Segunda frase',
    promptImagen: `${id} ${kind} two`,
    tiempoInicioSeg: 1.1,
    tiempoFinSeg: 2.3,
  }
  if (isStory(ANIMATED_STORY, format, id))
    first.nativo = {
      animationRequestedSeconds: 6,
      animations: [
        {
          id: 'anim_1',
          clipFile: ANIMATION_CLIP,
          provider: 'kie',
          model: 'grok-imagine-video-1-5-preview',
          sceneIds: [1],
          slotSeconds: 1.1,
          normalizedSeconds: 1.1,
          requestedSeconds: 6,
          prompt: 'slow camera push',
          status: 'ready',
        },
      ],
    }
  if (isStory(AVATAR_STORY, format, id)) {
    delete second.promptImagen
    second.nativo = {
      avatar: {
        lookId: 'look-jardineria',
        lookName: 'Jardineria',
        lookType: 'photo_avatar',
        engine: 'avatar_iv',
        origin: 'auto',
        status: 'ready',
        clipFile: AVATAR_CLIP,
        normalizedSeconds: 1.2,
      },
    }
  }
  return [first, second]
}

// Los archivos de una historia en el árbol de su formato, con su propio
// guion y sus propios prompts para que el guard distinga de qué carpeta
// salió cada copia.
function storyFiles(format, id) {
  const directory = `${FORMAT_PREFIXES[format]}${id}`
  const script = `${TITLES[format][id]}. Primera frase de la historia. Segunda frase.`
  const words = [
    { word: 'Primera', start: 0.1, end: 0.5, confidence: 0.99 },
    { word: 'frase', start: 0.6, end: 1.0, confidence: 0.98 },
    { word: 'Segunda', start: 1.2, end: 1.7, confidence: 0.97 },
    { word: 'frase', start: 1.8, end: 2.3, confidence: 0.99 },
  ]
  const scenes = storyScenes(format, id)
  const files = new Map([
    [`${directory}/guion.txt`, Buffer.from(script)],
    [`${directory}/audio.mp3`, FAKE_MP3],
    [`${directory}/palabras.json`, Buffer.from(JSON.stringify(words))],
    [`${directory}/escenas.json`, Buffer.from(JSON.stringify(scenes))],
    [`${directory}/video_final.mp4`, FAKE_MP4],
  ])
  for (const scene of scenes) {
    const avatar = scene.nativo?.avatar
    if (avatar)
      files.set(`${directory}/avatar/${avatar.clipFile}`, FAKE_CLIP_MP4)
    else files.set(`${directory}/imagenes/imagen_${scene.id}.jpg`, FAKE_JPG)
    for (const animation of scene.nativo?.animations ?? [])
      files.set(`${directory}/animaciones/${animation.clipFile}`, FAKE_CLIP_MP4)
  }
  if (isStory(ANIMATED_STORY, format, id))
    files.set(`${directory}/video_animado.mp4`, FAKE_ANIMATED_MP4)
  // La vista del look junto a los clips del avatar (Ruling R8): la imagen
  // fija de las apariciones, que la simulación copia al proyecto.
  if (isStory(AVATAR_STORY, format, id))
    files.set(`${directory}/avatar/look.jpg`, FAKE_JPG)
  return files
}

// La historia `id` de una lista del manifest del pack (claves en español).
const storyIn = (stories, id) => stories.find((story) => story.id === id)

// Lo que el manifest dice de una historia.
function manifestStory(format, id) {
  return {
    id,
    nombreSugerido: TITLES[format][id],
    numEscenas: 2,
    duracionAudioSeg: 2.3,
    personaje: CHARACTER_STORIES.includes(id) ? 'generic' : 'none',
    animada: isStory(ANIMATED_STORY, format, id),
    ...(isStory(AVATAR_STORY, format, id) ? { avatar: AVATAR_MANIFEST } : {}),
  }
}

// El pack entero: manifest, gemas y las historias de cada formato.
// `withShort: false` deja afuera el bloque `short` y su árbol; `tweak` recibe
// el manifest y los archivos (rutas relativas a la raíz del pack) antes de
// empaquetar, para armar los packs rotos de las secciones de validación.
function buildPackEntries({
  withManifest = true,
  withShort = true,
  container = 'vimo-demo-pack-mini',
  tweak,
} = {}) {
  const formats = withShort ? ['16:9', '9:16'] : ['16:9']
  const storiesBlock = (format) => ({
    estilos: CATALOG_STORIES[format].map((id) => manifestStory(format, id)),
    historiasGema: GEM_STORIES[format].map((id) => manifestStory(format, id)),
  })
  const manifest = {
    version: 'v4',
    voz: { provider: 'ai33', voice_id: 'voice-mini', nombre: 'Abel mini' },
    gemas: GEMS.map(({ id, styleId }) => ({ id, styleId })),
    ...storiesBlock('16:9'),
    ...(withShort ? { short: storiesBlock('9:16') } : {}),
  }
  const files = new Map()
  for (const gem of GEMS) {
    files.set(
      `gemas/${gem.id}/style.json`,
      Buffer.from(JSON.stringify(gem.style)),
    )
    files.set(`gemas/${gem.id}/sample-1.jpg`, FAKE_JPG)
    files.set(`gemas/${gem.id}/sample-2.jpg`, FAKE_JPG)
  }
  files.set(`gemas/${AVATAR_STORY.id}/avatar.jpg`, FAKE_JPG)
  for (const format of formats) {
    for (const id of [...CATALOG_STORIES[format], ...GEM_STORIES[format]])
      for (const [name, data] of storyFiles(format, id)) files.set(name, data)
  }
  tweak?.({ manifest, files })

  const entries = new Map()
  const prefix = container ? `${container}/` : ''
  if (withManifest)
    entries.set(`${prefix}manifest.json`, Buffer.from(JSON.stringify(manifest)))
  for (const [name, data] of files) entries.set(`${prefix}${name}`, data)
  return entries
}

// Zip «store» (sin compresión): cabeceras locales + directorio central + EOCD.
function buildZip(entries) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const [name, data] of entries) {
    const nameBytes = Buffer.from(name, 'utf8')
    const crc = crc32(data) >>> 0
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0x21, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, nameBytes, data)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0x21, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, nameBytes)
    offset += local.length + nameBytes.length + data.length
  }
  const directory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.size, 8)
  end.writeUInt16LE(entries.size, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)
  return Buffer.concat([...locals, directory, end])
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

// ── Fixture del armador v4: proyectos nativos ────────────────────────────────
// Tres proyectos como los deja el pipeline real, en una raíz temporal: el
// estilo `normal` del catálogo en 16:9, animado con un clip; la gema
// `jardineria` en 16:9 con una aparición del avatar; la gema `storytelling`
// en Short. Las imágenes de escena son PNG con extensión .jpg, como las guarda
// el pipeline (Ruling R4); las muestras y la vista del avatar, PNG, JPEG o
// WEBP. Los medios salen del ffmpeg empaquetado y pesan pocos KB, salvo los
// videos: el armador exige más de 100 KB a cada uno.
const BUILDER_SCRIPT = join(repoRoot, 'scripts/build-demo-pack.mjs')
// La carpeta (dentro del workspace) donde la sección 18 escribe la fixture
// nativa; la sección 27 vuelve a armar desde ahí.
const BUILDER_NATIVE_FOLDER = 'builder-native'
const BUILT_PART_PREFIX = 'vimo-demo-pack-v4.part-'
const BUILT_CLIP = '0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e.mp4'
const BUILT_AVATAR_CLIP = 'scene_2.0123abcd.mp4'
const BUILT_RENDER_HASH = 'f'.repeat(64)
const BUILT_VOICE = {
  voiceProvider: 'ai33',
  voiceId: 'voice-mini',
  voiceName: 'Abel mini',
}
const BUILT_AVATAR_OPTIONS = {
  avatarId: 'jardineria-z2l3du',
  lookId: 'look-jardineria',
  lookName: 'Jardineria',
  lookType: 'photo_avatar',
  engine: 'avatar_iv',
  appearances: 1,
  secondsPerAppearance: 5,
  startWithAvatar: false,
  placement: 'auto',
}
// Las historias de la fixture, en el orden de stories.json.
const BUILT_STORIES = [
  { format: '16:9', id: 'normal' },
  { format: '16:9', id: 'jardineria' },
  { format: '9:16', id: 'storytelling' },
]
// Lo que un proyecto real deja junto a sus clips y el pack no lleva.
const BUILT_LEFTOVERS = /\.(source\.mp4|reference-\d+\.jpg|raw\.mp4|wav)$/
// Recibos, tareas y URLs del proveedor: nunca en escenas.json.
const BUILT_PRIVATE_KEYS = [
  '"attempts"',
  '"task"',
  '"videoUrl"',
  '"creditsConsumed"',
  '"errorCode"',
]
const JPEG_MAGIC = Buffer.from('ffd8ff', 'hex')
// Lo que una gema de la galería guarda y el pack público no lleva (Ruling
// R13): de dónde se clonó (con el link del video) y el texto que se mandó al
// agente.
const BUILT_GEM_PRIVATE = {
  origin: {
    kind: 'ai-clone',
    source: 'youtube',
    videoUrl: 'https://www.youtube.com/watch?v=demo-guard',
  },
  sourcePrompt: 'El texto que se mandó al agente para crear la gema.',
}
// Un mp4 que empieza como uno (caja ftyp) y que ffmpeg no puede leer: solo
// falla al recomprimir.
const CORRUPT_MP4 = Buffer.concat([
  Buffer.from('00000018', 'hex'),
  Buffer.from('ftypisom'),
  Buffer.alloc(4096, 0x5a),
])

// El ffmpeg empaquetado (ADR-0026), el mismo que usa el armador; null si no
// está, y entonces la sección 18 falla avisando.
function pinnedFfmpeg() {
  try {
    const triple = targetTriple()
    const path = join(
      repoRoot,
      'src-tauri/binaries',
      `ffmpeg-${triple}${executableSuffix(triple)}`,
    )
    return existsSync(path) ? path : null
  } catch {
    return null
  }
}

// Los medios de prueba, generados una sola vez con lavfi: un PNG, un JPEG y
// un WEBP diminutos, un clip mudo de un segundo y dos videos con audio de
// ruido (que no se comprime) para pasar el mínimo de 100 KB.
async function writeBuilderMedia(ffmpeg, directory) {
  await mkdir(directory, { recursive: true })
  const run = (args) =>
    execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', ...args])
  const noiseVideo = (seed, frequency, path) =>
    run([
      '-f',
      'lavfi',
      '-i',
      `nullsrc=s=128x72:r=25:d=1,geq=lum='random(${seed})*255':cb=128:cr=128`,
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=${frequency}:duration=1`,
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-qp',
      '0',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      '-y',
      path,
    ])
  const media = {
    png: join(directory, 'image.png'),
    jpg: join(directory, 'image.jpg'),
    webp: join(directory, 'image.webp'),
    clip: join(directory, 'clip.mp4'),
    video: join(directory, 'video.mp4'),
    staticVideo: join(directory, 'static.mp4'),
  }
  const still = ['-f', 'lavfi', '-i', 'testsrc2=s=64x36', '-frames:v', '1']
  run([...still, '-y', media.png])
  run([...still, '-y', media.jpg])
  run([...still, '-c:v', 'libwebp', '-y', media.webp])
  run([
    '-f',
    'lavfi',
    '-i',
    'testsrc=s=64x36:r=25:d=1',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-pix_fmt',
    'yuv420p',
    '-y',
    media.clip,
  ])
  noiseVideo(1, 440, media.video)
  noiseVideo(2, 330, media.staticVideo)
  return media
}

// Los tres proyectos, las gemas y los dos JSON del armador, como datos. Cada
// archivo es un Buffer o el nombre de un medio de `writeBuilderMedia`; los
// casos rotos cambian estos datos antes de escribirlos.
function builderFixture() {
  const words = [
    { word: 'Primera', start: 0.1, end: 0.5, confidence: 0.99 },
    { word: 'frase', start: 0.6, end: 1.0, confidence: 0.98 },
    { word: 'Segunda', start: 1.2, end: 1.7, confidence: 0.97 },
    { word: 'frase', start: 1.8, end: 2.3, confidence: 0.99 },
  ]
  const stages = [
    'voice',
    'transcription',
    'scene-cuts',
    'scene-prompts',
    'images',
  ]
  const options = (extra) => ({
    sceneCount: 0,
    narrationMode: 'tts',
    ...BUILT_VOICE,
    imageProvider: 'evolink',
    useBgm: false,
    useOverlay: false,
    confirmScenes: false,
    videoFormat: '16:9',
    ...extra,
  })
  const scene = (id, prompt, startSeconds, endSeconds) => ({
    id,
    text: `Frase ${id}`,
    startSeconds,
    endSeconds,
    imagePrompt: prompt,
    treatment: 'action',
    contentRejected: false,
    animations: [],
    animationPending: [],
    animationHistory: [],
  })
  const project = ({ id, name, projectOptions, completedStages, scenes }) => ({
    metadata: {
      id,
      name,
      createdAt: '2026-10-14T00:00:00.000Z',
      updatedAt: '2026-10-14T00:00:00.000Z',
      state: 'completed',
      options: projectOptions,
      completedStages,
      audioDurationSeconds: 2.3,
      sceneCount: scenes.length,
      wordCount: words.length,
    },
    script: `${name}. Primera frase. Segunda frase.`,
    words,
    scenes,
  })

  // El bloque de animación trae lo que el pack no lleva: recibos con la URL
  // del proveedor, la tarea, los créditos y un código de error.
  const animated = project({
    id: 'demo-normal',
    name: 'El océano profundo',
    projectOptions: options({
      styleId: 'normal',
      animationMinutes: 1,
      customStyle: {
        styleId: 'normal',
        catalogStyleId: 'normal',
        name: 'Normal',
        character: { mode: 'generic' },
      },
    }),
    completedStages: [...stages, 'animation', 'render'],
    scenes: [
      {
        ...scene(1, 'normal built scene one', 0, 1.1),
        animationRequestedSeconds: 6,
        animations: [
          {
            id: BUILT_CLIP.replace('.mp4', ''),
            clipFile: BUILT_CLIP,
            provider: 'kie',
            model: 'grok-imagine-video-1-5-preview',
            sceneIds: [1, 2],
            startSeconds: 0,
            endSeconds: 2.3,
            slotSeconds: 2.3,
            requestedSeconds: 6,
            strategy: 'merge',
            prompt: 'slow camera push',
            status: 'ready',
            normalizedSeconds: 2.3,
            creditsConsumed: 27,
            errorCode: 'animation_provider_failed',
            task: { provider: 'kie', taskId: 'task-123', hash: 'abc123' },
            attempts: [
              {
                model: 'grok-imagine-video-1-5-preview',
                hash: 'abc123',
                state: 'succeeded',
                taskId: 'task-123',
                videoUrl: 'https://tempfile.example.com/generated_video.mp4',
                creditsConsumed: 27,
              },
            ],
          },
        ],
      },
      {
        ...scene(2, 'normal built scene two', 1.1, 2.3),
        staticTransitionIn: true,
      },
    ],
  })
  animated.files = {
    'scenes/scene_1.jpg': 'png',
    'scenes/scene_2.jpg': 'png',
    [`animations/${BUILT_CLIP}`]: 'clip',
    [`animations/${BUILT_CLIP}.source.mp4`]: 'clip',
    [`animations/${BUILT_CLIP}.reference-0.jpg`]: 'jpg',
    'demo-normal.mp4': 'video',
  }

  // La escena 2 es la aparición del avatar: sin prompt ni imagen, con el
  // recibo de HeyGen y su URL firmada, y un campo con una URL del proveedor
  // que el tipo no declara (cualquier URL se va).
  const presenter = project({
    id: 'demo-jardineria',
    name: 'Mi huerta en el balcón',
    projectOptions: options({
      styleId: 'normal',
      customStyle: {
        styleId: 'demo-jardineria',
        name: 'Jardinería mini',
        sections: { visualStyle: 'Acuarela suave de un jardín.' },
        character: { mode: 'none' },
      },
      avatar: BUILT_AVATAR_OPTIONS,
    }),
    completedStages: [...stages, 'avatar', 'render'],
    scenes: [
      scene(1, 'jardineria built scene one', 0, 1.1),
      {
        id: 2,
        text: 'Frase 2',
        startSeconds: 1.1,
        endSeconds: 2.3,
        animations: [],
        animationPending: [],
        animationHistory: [],
        avatar: {
          lookId: 'look-jardineria',
          lookName: 'Jardineria',
          lookType: 'photo_avatar',
          engine: 'avatar_iv',
          origin: 'auto',
          status: 'ready',
          clipFile: BUILT_AVATAR_CLIP,
          normalizedSeconds: 1.2,
          renderHash: BUILT_RENDER_HASH,
          narrationVersion: 0,
          usdEstimated: 0.05,
          motionPrompt: 'Warm smile.',
          motionSource: 'auto',
          thumbnailUrl: 'https://files2.heygen.ai/avatar_tmp/thumbnail.jpg',
          attempts: [
            {
              hash: '0123abcd'.padEnd(64, '0'),
              state: 'succeeded',
              engine: 'avatar_iv',
              lookId: 'look-jardineria',
              createdAt: '2026-10-14T00:00:00.000Z',
              videoId: 'video-1',
              videoUrl:
                'https://files2.heygen.ai/avatar_tmp/video-1.mp4?Signature=secret',
            },
          ],
        },
      },
    ],
  })
  presenter.files = {
    'scenes/scene_1.jpg': 'png',
    'avatar/look.png': 'png',
    [`avatar/${BUILT_AVATAR_CLIP}`]: 'clip',
    'avatar/scene_2.0123abcd.raw.mp4': 'clip',
    'avatar/scene_2.89abcdef.wav': FAKE_MP3,
    'demo-jardineria.mp4': 'video',
  }

  const short = project({
    id: 'demo-storytelling-short',
    name: 'El último tren a casa',
    projectOptions: options({
      styleId: 'normal',
      videoFormat: '9:16',
      customStyle: {
        styleId: 'demo-storytelling',
        name: 'STORYTELLING mini',
        systemPrompt: 'You write prompts.',
      },
    }),
    completedStages: [...stages, 'render'],
    scenes: [
      scene(1, 'storytelling built scene one', 0, 1.1),
      scene(2, 'storytelling built scene two', 1.1, 2.3),
    ],
  })
  short.files = {
    'scenes/scene_1.jpg': 'png',
    'scenes/scene_2.jpg': 'png',
    'demo-storytelling-short.mp4': 'video',
  }

  return {
    projects: {
      'demo-normal': animated,
      'demo-jardineria': presenter,
      'demo-storytelling-short': short,
    },
    // Rutas relativas a la carpeta de cada JSON, como las acepta el armador.
    stories: [
      {
        format: '16:9',
        id: 'normal',
        kind: 'catalog',
        project: 'demo-normal',
        staticVideo: 'static/demo-normal.mp4',
        title: 'El océano profundo (armado)',
      },
      {
        format: '16:9',
        id: 'jardineria',
        kind: 'gem',
        project: 'demo-jardineria',
        staticVideo: 'static/demo-jardineria.mp4',
      },
      {
        format: '9:16',
        id: 'storytelling',
        kind: 'gem',
        project: 'demo-storytelling-short',
        staticVideo: 'static/demo-storytelling-short.mp4',
      },
    ],
    gems: [
      {
        id: 'storytelling',
        styleId: 'demo-storytelling',
        styleDir: '_styles/demo-storytelling',
      },
      {
        id: 'jardineria',
        styleId: 'demo-jardineria',
        styleDir: '_styles/demo-jardineria',
        avatarPreview: 'avatars/jardineria/preview.webp',
      },
    ],
    // Lo que vive fuera de los proyectos: los videos sin animar (otro render
    // del mismo proyecto), las gemas de la galería (la de jardineria, con lo
    // que el pack no lleva) y la vista del avatar.
    files: {
      'static/demo-normal.mp4': 'staticVideo',
      'static/demo-jardineria.mp4': 'staticVideo',
      'static/demo-storytelling-short.mp4': 'staticVideo',
      '_styles/demo-storytelling/style.json': Buffer.from(
        JSON.stringify(GEMS[0].style),
      ),
      '_styles/demo-storytelling/sample-1.jpg': 'png',
      '_styles/demo-storytelling/sample-2.jpg': 'jpg',
      '_styles/demo-jardineria/style.json': Buffer.from(
        JSON.stringify({ ...GEMS[1].style, ...BUILT_GEM_PRIVATE }),
      ),
      '_styles/demo-jardineria/sample-1.jpg': 'png',
      'avatars/jardineria/preview.webp': 'webp',
    },
  }
}

// Escribe la fixture en `root`; `tweak` la cambia antes (casos rotos).
async function writeBuilderFixture(root, media, tweak) {
  const fixture = builderFixture()
  tweak?.(fixture)
  const put = async (name, value) => {
    const target = join(root, name)
    await mkdir(dirname(target), { recursive: true })
    if (Buffer.isBuffer(value)) return writeFile(target, value)
    return copyFile(media[value], target)
  }
  const json = (value) => Buffer.from(JSON.stringify(value))
  for (const [folder, project] of Object.entries(fixture.projects)) {
    await put(`${folder}/project.json`, json(project.metadata))
    await put(`${folder}/script.txt`, Buffer.from(project.script))
    await put(`${folder}/narration.mp3`, FAKE_MP3)
    await put(`${folder}/words.json`, json(project.words))
    await put(`${folder}/scenes.json`, json(project.scenes))
    for (const [name, value] of Object.entries(project.files))
      await put(`${folder}/${name}`, value)
  }
  for (const [name, value] of Object.entries(fixture.files))
    await put(name, value)
  await put('stories.json', json(fixture.stories))
  await put('gems.json', json(fixture.gems))
}

// Los argumentos del armador para la fixture escrita en `root`.
function builderArguments(root, out) {
  return [
    '--stories',
    join(root, 'stories.json'),
    '--gems',
    join(root, 'gems.json'),
    '--out',
    out,
  ]
}

// Corre el armador y devuelve su salida.
function runBuilder(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BUILDER_SCRIPT, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

// Los nombres de las entradas de un zip, en el orden de su directorio
// central (el armador no escribe comentario de zip).
function zipEntryNames(zip) {
  const end = zip.length - 22
  if (end < 0 || zip.readUInt32LE(end) !== 0x06054b50) return []
  const count = zip.readUInt16LE(end + 10)
  let offset = zip.readUInt32LE(end + 16)
  const names = []
  for (let index = 0; index < count; index++) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) return names
    const nameLength = zip.readUInt16LE(offset + 28)
    const extraLength = zip.readUInt16LE(offset + 30)
    const commentLength = zip.readUInt16LE(offset + 32)
    names.push(zip.toString('utf8', offset + 46, offset + 46 + nameLength))
    offset += 46 + nameLength + extraLength + commentLength
  }
  return names
}

// Extrae las partes con el extractor del sidecar; false si alguna no abre.
async function extractParts(directory, files, destination) {
  try {
    for (const file of files)
      await extractZip(
        join(directory, file),
        destination,
        new AbortController().signal,
      )
    return true
  } catch {
    return false
  }
}

// ── Servidor HTTP local que sirve los zips ───────────────────────────────────
const packZip = buildZip(buildPackEntries())
const brokenZip = buildZip(buildPackEntries({ withManifest: false }))
const landscapeOnlyZip = buildZip(buildPackEntries({ withShort: false }))
const shortIncompleteZip = buildZip(
  buildPackEntries({
    tweak: ({ files }) => files.delete('short/normal/video_final.mp4'),
  }),
)
// El mismo pack en dos partes, como las arma el armador: sin carpeta
// contenedora, la parte 1 con manifest.json, gemas/ y las historias 16:9, y
// la parte 2 con short/ (un tercio del pack: su mitad mueve el porcentaje).
const isShortEntry = ([name]) => name.startsWith('short/')
const partEntries = [...buildPackEntries({ container: '' })]
const firstPartZip = buildZip(
  new Map(partEntries.filter((entry) => !isShortEntry(entry))),
)
const secondPartZip = buildZip(new Map(partEntries.filter(isShortEntry)))
// Otra parte 1 de la misma versión (otra voz en el manifest): otro armado.
const otherFirstPartZip = buildZip(
  new Map(
    [
      ...buildPackEntries({
        container: '',
        tweak: ({ manifest }) => {
          manifest.voz.nombre = 'Abel de otro armado'
        },
      }),
    ].filter((entry) => !isShortEntry(entry)),
  ),
)
const served = new Map([
  ['/pack.zip', packZip],
  ['/broken.zip', brokenZip],
  ['/landscape-only.zip', landscapeOnlyZip],
  ['/short-incomplete.zip', shortIncompleteZip],
])
let hits = 0
// Pedidos por ruta: prueba que una parte terminada no se vuelve a pedir.
const requestsByPath = new Map()
// Cortes a pedido: el próximo pedido de esa ruta recibe las cabeceras (con
// el Content-Length entero) y la mitad del cuerpo. `cut` cierra la conexión
// ahí mismo (el sidecar puede no llegar a leer esa mitad); `stall` la deja
// abierta hasta que la sección decida: cancelar el job, cortarla con
// `cutStalled` cuando el avance muestra la mitad leída o terminarla con
// `finishStalled`. Como tope, STALL_LIMIT_MS, para que un fallo no cuelgue el
// guard. `mute` no contesta nada, ni las cabeceras, también hasta que la
// sección la corte o hasta el tope; `trickle` manda el cuerpo entero en
// TRICKLE_SLICES tandas separadas por TRICKLE_GAP_MS (una conexión lenta pero
// viva).
const interruptions = new Map()
const stalledResponses = new Map()
const STALL_LIMIT_MS = 30_000
const TRICKLE_SLICES = 8
const TRICKLE_GAP_MS = 250
function trickle(response, body) {
  const size = Math.ceil(body.length / TRICKLE_SLICES)
  const send = (offset) => {
    if (response.destroyed) return
    const end = Math.min(body.length, offset + size)
    if (end >= body.length) {
      response.end(body.subarray(offset))
      return
    }
    response.write(body.subarray(offset, end))
    setTimeout(() => send(end), TRICKLE_GAP_MS).unref()
  }
  send(0)
}
const server = createServer((request, response) => {
  hits += 1
  requestsByPath.set(request.url, (requestsByPath.get(request.url) ?? 0) + 1)
  const body = served.get(request.url) ?? null
  if (!body) {
    response.statusCode = 404
    response.end()
    return
  }
  response.setHeader('Content-Type', 'application/zip')
  response.setHeader('Content-Length', String(body.length))
  const interruption = interruptions.get(request.url)
  if (!interruption) {
    response.end(body)
    return
  }
  interruptions.delete(request.url)
  if (interruption === 'trickle') {
    trickle(response, body)
    return
  }
  if (interruption === 'mute') {
    const timer = setTimeout(() => response.destroy(), STALL_LIMIT_MS)
    timer.unref()
    stalledResponses.set(request.url, { response, rest: body, timer })
    return
  }
  const half = Math.floor(body.length / 2)
  if (interruption === 'stall') {
    const timer = setTimeout(() => response.destroy(), STALL_LIMIT_MS)
    timer.unref()
    stalledResponses.set(request.url, {
      response,
      rest: body.subarray(half),
      timer,
    })
  }
  response.write(body.subarray(0, half), () => {
    if (interruption === 'cut') response.destroy()
  })
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const baseUrl = `http://127.0.0.1:${server.address().port}`

// Corta la respuesta colgada de `path`: la red se cae a mitad de la parte.
function cutStalled(path) {
  const stalled = stalledResponses.get(path)
  stalledResponses.delete(path)
  if (!stalled) return
  clearTimeout(stalled.timer)
  stalled.response.destroy()
}

// Termina la respuesta colgada de `path`: la parte llega entera.
function finishStalled(path) {
  const stalled = stalledResponses.get(path)
  stalledResponses.delete(path)
  if (!stalled) return
  clearTimeout(stalled.timer)
  stalled.response.end(stalled.rest)
}

// Una parte del pack servida en `path`: lo que va en config.demo.packParts.
function servedPart(path) {
  const zip = served.get(path) ?? Buffer.alloc(0)
  return { url: `${baseUrl}${path}`, sha256: sha256(zip), bytes: zip.length }
}

// Las partes `zips` servidas bajo un prefijo propio de cada sección, así los
// pedidos de una sección no se mezclan con los de otra.
function serveParts(prefix, zips = [firstPartZip, secondPartZip]) {
  return zips.map((zip, index) => {
    const path = `/${prefix}/part-${index + 1}.zip`
    served.set(path, zip)
    return servedPart(path)
  })
}
const pathOf = (part) => new URL(part.url).pathname
const requestsFor = (part) => requestsByPath.get(pathOf(part)) ?? 0
const bytesOf = (parts) => parts.reduce((total, part) => total + part.bytes, 0)

// ── Corridas del sidecar ─────────────────────────────────────────────────────
// Sin margen de disco: el guard prueba la lógica, no el espacio libre de la
// máquina que lo corre (la sección 26 sube el margen para simular el disco
// lleno).
function demoConfig(overrides = {}) {
  return {
    demo: {
      packVersion: 'mini',
      packParts: [servedPart('/pack.zip')],
      delayScale: 0,
      diskMarginBytes: 0,
      ...overrides,
    },
  }
}

// Lanza `node pipeline/main.ts <subcomando>` con el job por stdin y devuelve
// los eventos NDJSON y cómo terminó el proceso. `onEvent` corre en el momento
// en que cada evento llega (para chequear el disco justo entonces); la
// cancelación se manda una vez, al ver un evento del tipo `cancelOn` o el
// primero que cumpla `cancelWhen`; `preload` es un stub de `writeStub` que el
// proceso carga antes que su código.
function runSidecar(
  subcommand,
  { projectsRoot, payload, config, onEvent, cancelOn, cancelWhen, preload },
) {
  return new Promise((resolve, reject) => {
    const job = {
      jobId: `guard-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      projectsRoot,
      apiKeys: {},
      binaryPaths: {},
      config,
      ...(payload === undefined ? {} : { payload }),
    }
    const preloadArguments = preload
      ? ['--import', pathToFileURL(preload).href]
      : []
    // Con un stub, los avisos a stderr son parte de lo esperado: se guardan
    // en vez de imprimirse.
    const child = spawn(
      process.execPath,
      [...preloadArguments, join(repoRoot, 'pipeline/main.ts'), subcommand],
      {
        stdio: ['pipe', 'pipe', preload ? 'pipe' : 'inherit'],
      },
    )
    let stderr = ''
    child.stderr?.on('data', (chunk) => (stderr += chunk))
    // Un proceso que el stub mata a propósito cierra su stdin: sin esto, el
    // EPIPE tiraría el guard.
    child.stdin.on('error', () => undefined)
    const events = []
    let buffer = ''
    let cancelled = false
    const shouldCancel = (event) =>
      (cancelOn !== undefined && event.type === cancelOn) ||
      cancelWhen?.(event) === true
    child.stdout.on('data', (chunk) => {
      buffer += chunk
      let index = buffer.indexOf('\n')
      while (index >= 0) {
        const line = buffer.slice(0, index).trim()
        buffer = buffer.slice(index + 1)
        if (line) {
          const event = JSON.parse(line)
          events.push(event)
          onEvent?.(event)
          if (!cancelled && shouldCancel(event)) {
            cancelled = true
            child.stdin.write('{"type":"cancel"}\n')
          }
        }
        index = buffer.indexOf('\n')
      }
    })
    child.on('error', reject)
    child.on('close', (code, signal) =>
      resolve({ events, code, signal, stderr }),
    )
    child.stdin.write(`${JSON.stringify(job)}\n`)
  })
}

// Un módulo que el sidecar carga con --import antes que su código: reemplaza
// funciones de `node:fs` y `node:fs/promises` (syncBuiltinESMExports
// actualiza los imports con nombre del pipeline) para simular lo que un guard
// no puede provocar de verdad —un antivirus que traba un archivo, la app que
// muere en un punto exacto, el disco lleno— sin ganchos en el código de
// producción. `body` usa `fs`, `fsPromises`, `Writable` y `sep`.
async function writeStub(name, body) {
  const file = join(workspace, 'stubs', `${name}.mjs`)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(
    file,
    [
      "import fs from 'node:fs'",
      "import fsPromises from 'node:fs/promises'",
      "import { syncBuiltinESMExports } from 'node:module'",
      "import { sep } from 'node:path'",
      "import { Writable } from 'node:stream'",
      'void fs, fsPromises, sep, Writable',
      body,
      'syncBuiltinESMExports()',
      '',
    ].join('\n'),
  )
  return file
}

// El código fuente del error de sistema que tiraría el disco o el antivirus.
function systemErrorSource(code, text) {
  return `Object.assign(new Error('${code}: ${text}'), { code: '${code}' })`
}

const last = (events) => events[events.length - 1]
const codeOf = (events) => last(events)?.code
const resultOf = (events) => last(events)?.result
const outcomeOf = (events) =>
  `${last(events)?.type}: ${last(events)?.code ?? ''} ${last(events)?.message ?? ''}`
const idsOf = (entries) => JSON.stringify(entries?.map((entry) => entry.id))
// La historia `id` de un formato del manifest nativo, del catálogo o de gema.
const storyOf = (stories, id) =>
  [...(stories?.styles ?? []), ...(stories?.gems ?? [])].find(
    (entry) => entry.id === id,
  )

// Un JSON que la corrida tendría que haber escrito, o `fallback` si falta:
// un fallo se informa en su chequeo en vez de cortar el guard a la mitad.
const readJsonIfPresent = async (file, fallback) => {
  if (!existsSync(file)) return fallback
  return JSON.parse(await readFile(file, 'utf8'))
}

// Los zips de una descarga que quedaron en la raíz (`*.download`).
const downloadLeftovers = async (root) => {
  if (!existsSync(root)) return []
  return (await readdir(root)).filter((name) => name.endsWith('.download'))
}

// El avance de demo-prepare: los eventos `progress` con su fase y su parte.
// `progressSteps` los resume en pasos sin repetir seguidos («download 1»,
// «install 1», …).
const progressSteps = (progress) =>
  progress
    .map((event) => `${event.detail?.phase} ${event.detail?.part}`)
    .filter((step, index, steps) => step !== steps[index - 1])
const isNonDecreasing = (values) =>
  values.every((value, index) => index === 0 || value >= values[index - 1])
const percentOf = (bytes, total) => Math.floor((bytes / total) * 100)

// El pid de un proceso que ya terminó: el de un lock que dejó la app al
// morir.
async function exitedProcessPid() {
  const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' })
  await new Promise((resolve) => child.on('exit', resolve))
  return child.pid
}

const workspace = await mkdtemp(join(tmpdir(), 'vimo-demo-guard-'))
const projectsRoot = join(workspace, 'Vimo')
await mkdir(projectsRoot, { recursive: true })
const packRoot = join(projectsRoot, '_demo-pack')
const seededStyleFile = (root, styleId) =>
  join(root, '_styles', styleId, 'style.json')
const readSeededStyle = (root, styleId) =>
  readJsonIfPresent(seededStyleFile(root, styleId), null)

try {
  // 1. demo-status sin pack → no listo.
  section('1. demo-status sin pack')
  {
    const { events } = await runSidecar('demo-status', {
      projectsRoot,
      config: demoConfig(),
    })
    assert(
      last(events)?.type === 'job-completed',
      'demo-status termina en job-completed',
    )
    assert(resultOf(events)?.ready === false, 'sin pack, ready es false')
    assert(
      resultOf(events)?.version === 'mini',
      'la versión viene de la config',
    )
    assert(
      resultOf(events)?.downloadBytes === packZip.length &&
        resultOf(events)?.downloadedBytes === 0,
      `sin pack, downloadBytes es la suma de packParts y downloadedBytes 0 (fue ${resultOf(events)?.downloadBytes} y ${resultOf(events)?.downloadedBytes})`,
    )
    assert(
      resultOf(events)?.requiredFreeBytes === 2 * packZip.length,
      `sin pack, requiredFreeBytes es la parte que falta extraer más su zip (sin margen en el guard) (fue ${resultOf(events)?.requiredFreeBytes})`,
    )
  }

  // 2. demo-prepare: descarga, SHA, raíz anidada, .ok, gemas, manifest v4.
  section('2. demo-prepare instala el pack v4 y siembra las gemas')
  {
    const phases = []
    const { events } = await runSidecar('demo-prepare', {
      projectsRoot,
      config: demoConfig(),
      onEvent(event) {
        if (event.type === 'progress') phases.push(event.detail?.phase)
      },
    })
    assert(
      last(events)?.type === 'job-completed',
      `demo-prepare termina en job-completed (fue ${outcomeOf(events)})`,
    )
    assert(
      phases.includes('download') && phases.includes('install'),
      'emite progress con phase download e install',
    )
    assert(
      phases.indexOf('install') > phases.lastIndexOf('download'),
      'install llega después de download',
    )
    const marker = await readJsonIfPresent(join(packRoot, '.ok'), null)
    assert(
      isDeepStrictEqual(marker, { version: 'mini', parts: [sha256(packZip)] }),
      `el .ok sella la versión y el sha256 de su única parte (fue ${JSON.stringify(marker)})`,
    )
    assert(
      existsSync(join(packRoot, 'manifest.json')),
      'la raíz anidada del zip quedó como raíz del pack',
    )
    assert(
      !existsSync(`${packRoot}.tmp`) &&
        (await downloadLeftovers(projectsRoot)).length === 0,
      'no quedan temporales',
    )
    assert(
      !existsSync(join(packRoot, 'jardineria', 'imagenes', 'imagen_2.jpg')),
      'la aparición del avatar no trae imagen y el pack igual se instala',
    )

    const manifest = resultOf(events)?.manifest
    const landscape = manifest?.stories?.['16:9']
    const short = manifest?.stories?.['9:16']
    assert(manifest?.version === 'v4', 'el manifest es el del formato v4')
    assert(
      idsOf(landscape?.styles) === JSON.stringify(['normal', '2d-mono']),
      `stories[16:9].styles lista normal y 2d-mono en orden (fue ${idsOf(landscape?.styles)})`,
    )
    assert(
      idsOf(landscape?.gems) === JSON.stringify(['storytelling', 'jardineria']),
      `stories[16:9].gems trae storytelling y jardineria (fue ${idsOf(landscape?.gems)})`,
    )
    assert(
      idsOf(short?.styles) === JSON.stringify(['normal']) &&
        idsOf(short?.gems) === JSON.stringify(['storytelling']),
      `stories[9:16] trae solo lo que lista short: sin 2d-mono ni jardineria (fue ${idsOf(short?.styles)} y ${idsOf(short?.gems)})`,
    )
    assert(
      JSON.stringify(manifest?.gems) ===
        JSON.stringify(
          GEMS.map((gem) => ({
            id: gem.id,
            styleId: gem.styleId,
            name: gem.style.name,
          })),
        ),
      `gems trae las dos gemas con su styleId y su nombre (fue ${JSON.stringify(manifest?.gems)})`,
    )
    assert(
      storyOf(landscape, '2d-mono')?.character === 'generic' &&
        storyOf(landscape, 'normal')?.character === 'none' &&
        storyOf(landscape, 'jardineria')?.character === 'none' &&
        storyOf(short, 'storytelling')?.character === 'none',
      'character como en el manifest',
    )
    assert(
      storyOf(landscape, 'normal')?.animated === true &&
        storyOf(landscape, '2d-mono')?.animated === false &&
        storyOf(landscape, 'storytelling')?.animated === false &&
        storyOf(short, 'normal')?.animated === false,
      'animated como en el manifest (solo normal en 16:9)',
    )
    const avatar = storyOf(landscape, 'jardineria')?.avatar
    assert(
      avatar?.name === 'Jardineria' &&
        avatar?.engine === 'avatar_iv' &&
        avatar?.appearances === 5 &&
        avatar?.secondsPerAppearance === 5,
      `jardineria trae su avatar: nombre, motor y apariciones (fue ${JSON.stringify(avatar)})`,
    )
    assert(
      avatar?.previewFile ===
        join(packRoot, 'gemas', 'jardineria', 'avatar.jpg') &&
        existsSync(avatar.previewFile),
      'avatar.previewFile es la ruta absoluta de la vista del look y existe en disco',
    )
    assert(
      [landscape, short]
        .flatMap((stories) => [
          ...(stories?.styles ?? []),
          ...(stories?.gems ?? []),
        ])
        .filter((entry) => entry.avatar !== undefined).length === 1,
      'solo jardineria trae avatar',
    )
    assert(
      storyOf(landscape, 'normal')?.script?.startsWith('El océano profundo') &&
        storyOf(landscape, 'jardineria')?.suggestedName ===
          'Mi huerta en el balcón' &&
        storyOf(landscape, 'normal')?.sceneCount === 2 &&
        storyOf(landscape, 'normal')?.audioDurationSeconds === 2.3,
      'cada entrada trae su guion, su nombre sugerido, sus escenas y su duración',
    )
    assert(
      storyOf(landscape, 'normal')?.audioFile ===
        join(packRoot, 'normal', 'audio.mp3') &&
        existsSync(storyOf(landscape, 'normal').audioFile),
      'cada historia trae la ruta absoluta de su audio.mp3',
    )
    assert(
      storyOf(short, 'normal')?.audioFile ===
        join(packRoot, 'short', 'normal', 'audio.mp3') &&
        storyOf(short, 'normal')?.script?.startsWith('Cómo nace una tormenta'),
      'las historias Short apuntan a short/<id>',
    )
    assert(
      manifest?.voice?.provider === 'ai33' &&
        manifest?.voice?.voiceId === 'voice-mini' &&
        manifest?.voice?.name === 'Abel mini',
      'la voz viene traducida',
    )

    const storytelling = await readSeededStyle(
      projectsRoot,
      'demo-storytelling',
    )
    const jardineria = await readSeededStyle(projectsRoot, 'demo-jardineria')
    assert(
      storytelling?.name === 'STORYTELLING mini' &&
        storytelling?.systemPrompt === 'You write prompts.' &&
        storytelling?.character?.mode === 'none',
      'la gema storytelling se siembra en _styles/demo-storytelling con su style.json nativo',
    )
    assert(
      jardineria?.name === 'Jardinería mini' &&
        jardineria?.sections?.visualStyle === 'Acuarela suave de un jardín.',
      'la gema jardineria se siembra en _styles/demo-jardineria con sus secciones',
    )
    assert(
      [storytelling, jardineria].every(
        (style) =>
          typeof style?.createdAt === 'string' &&
          style.createdAt !== PACK_CREATED_AT &&
          !Number.isNaN(Date.parse(style.createdAt)),
      ) && jardineria?.updatedAt === undefined,
      'la siembra pone un createdAt nuevo y no arrastra el updatedAt del pack',
    )
    assert(
      GEMS.every(
        (gem) =>
          existsSync(
            join(projectsRoot, '_styles', gem.styleId, 'sample-1.jpg'),
          ) &&
          existsSync(
            join(projectsRoot, '_styles', gem.styleId, 'sample-2.jpg'),
          ),
      ),
      'las muestras de cada gema se copian como sample-N.jpg',
    )
  }

  // 3. demo-status con pack → listo con manifest.
  section('3. demo-status con pack')
  {
    const { events } = await runSidecar('demo-status', {
      projectsRoot,
      config: demoConfig(),
    })
    assert(resultOf(events)?.ready === true, 'con pack, ready es true')
    assert(
      resultOf(events)?.manifest?.stories?.['16:9']?.styles?.length === 2 &&
        resultOf(events)?.manifest?.gems?.length === 2,
      'trae el manifest',
    )
    assert(
      resultOf(events)?.downloadBytes === packZip.length &&
        resultOf(events)?.downloadedBytes === packZip.length,
      'con el pack instalado, downloadedBytes es el total',
    )
    assert(
      resultOf(events)?.requiredFreeBytes === 0,
      `con el pack instalado no pide espacio (fue ${resultOf(events)?.requiredFreeBytes})`,
    )
  }

  // 4. Las gemas se siembran solo si no existen y el pack no se re-descarga.
  section('4. segundo demo-prepare: idempotente')
  {
    const edited = await readSeededStyle(projectsRoot, 'demo-storytelling')
    assert(edited !== null, 'la gema storytelling está sembrada para editarla')
    if (edited) {
      edited.name = 'editada por la persona'
      await writeFile(
        seededStyleFile(projectsRoot, 'demo-storytelling'),
        JSON.stringify(edited),
      )
    }
    await rm(join(projectsRoot, '_styles', 'demo-jardineria'), {
      recursive: true,
      force: true,
    })
    const status = await runSidecar('demo-status', {
      projectsRoot,
      config: demoConfig(),
    })
    assert(
      resultOf(status.events)?.ready === false,
      'con una gema borrada de la galería, demo-status no está listo',
    )
    assert(
      resultOf(status.events)?.downloadedBytes === packZip.length,
      'con el pack instalado y una gema borrada, downloadedBytes es el total: la puerta sigue sola (solo falta sembrar)',
    )
    const before = hits
    const { events } = await runSidecar('demo-prepare', {
      projectsRoot,
      config: demoConfig(),
    })
    assert(
      last(events)?.type === 'job-completed',
      `segundo prepare completa (fue ${outcomeOf(events)})`,
    )
    assert(hits === before, 'con el pack instalado no se descarga de nuevo')
    assert(
      (await readSeededStyle(projectsRoot, 'demo-storytelling'))?.name ===
        'editada por la persona',
      'la gema editada no se pisa',
    )
    assert(
      (await readSeededStyle(projectsRoot, 'demo-jardineria'))?.name ===
        'Jardinería mini',
      'la gema borrada se vuelve a sembrar',
    )
    const again = await runSidecar('demo-status', {
      projectsRoot,
      config: demoConfig(),
    })
    assert(
      resultOf(again.events)?.ready === true,
      'con las dos gemas de vuelta, demo-status está listo',
    )
  }

  // 5. Fallos de descarga: SHA distinto, zip sin manifest, sin red, sin
  // partes configuradas.
  section('5. fallos de preparación')
  {
    const otherRoot = join(workspace, 'Vimo-broken')
    await mkdir(otherRoot, { recursive: true })
    const packPart = servedPart('/pack.zip')
    let run = await runSidecar('demo-prepare', {
      projectsRoot: otherRoot,
      config: demoConfig({ packParts: [{ ...packPart, sha256: 'deadbeef' }] }),
    })
    assert(
      codeOf(run.events) === 'demo_pack_corrupt',
      `SHA distinto → demo_pack_corrupt (fue ${codeOf(run.events)})`,
    )
    assert(
      !existsSync(join(otherRoot, '_demo-pack')) &&
        !existsSync(join(otherRoot, '_demo-pack.tmp')) &&
        (await downloadLeftovers(otherRoot)).length === 0,
      'una única parte corrupta no deja _demo-pack, ni staging (no se extrajo nada), ni el zip descargado',
    )
    run = await runSidecar('demo-prepare', {
      projectsRoot: otherRoot,
      config: demoConfig({ packParts: [servedPart('/broken.zip')] }),
    })
    assert(
      codeOf(run.events) === 'demo_pack_incomplete',
      `zip sin manifest → demo_pack_incomplete (fue ${codeOf(run.events)})`,
    )
    run = await runSidecar('demo-prepare', {
      projectsRoot: otherRoot,
      config: demoConfig({
        packParts: [{ ...packPart, url: 'http://127.0.0.1:9/pack.zip' }],
      }),
    })
    assert(
      codeOf(run.events) === 'demo_offline',
      `sin servidor → demo_offline (fue ${codeOf(run.events)})`,
    )
    run = await runSidecar('demo-prepare', {
      projectsRoot: otherRoot,
      config: demoConfig({
        packParts: [{ ...packPart, url: `${baseUrl}/missing.zip` }],
      }),
    })
    assert(
      codeOf(run.events) === 'demo_download_failed',
      `404 → demo_download_failed (fue ${codeOf(run.events)})`,
    )
    // Hasta que se publique el release, la config por defecto no trae
    // partes: no hay qué bajar.
    const noParts = demoConfig({ packParts: [] })
    run = await runSidecar('demo-prepare', {
      projectsRoot: otherRoot,
      config: noParts,
    })
    assert(
      codeOf(run.events) === 'demo_download_failed',
      `sin partes configuradas → demo_download_failed (fue ${outcomeOf(run.events)})`,
    )
    const status = await runSidecar('demo-status', {
      projectsRoot: otherRoot,
      config: noParts,
    })
    assert(
      resultOf(status.events)?.ready === false &&
        resultOf(status.events)?.downloadBytes === 0 &&
        resultOf(status.events)?.downloadedBytes === 0,
      `sin partes configuradas, demo-status no está listo y no hay nada que bajar (fue ${JSON.stringify(resultOf(status.events))})`,
    )
  }

  // 6. _demo-pack es carpeta reservada: no aparece en la biblioteca.
  section('6. _demo-pack no es un proyecto')
  {
    const { events } = await runSidecar('list-video-projects', {
      projectsRoot,
      config: demoConfig(),
    })
    const ids = (resultOf(events)?.projects ?? []).map((project) => project.id)
    assert(
      !ids.includes('_demo-pack'),
      'list-video-projects no lista _demo-pack',
    )
  }

  // Las fases de la corrida real, en orden (pipeline/runner/stage-id.ts): la
  // simulación las recorre todas y, como el corredor, avisa `stage-skipped`
  // de las que no aplican.
  const STAGE_IDS = [
    'voice',
    'transcription',
    'scene-cuts',
    'scene-prompts',
    'images',
    'avatar',
    'animation',
    'render',
  ]
  const KNOWN_EVENTS = new Set([
    'job-started',
    'stage-started',
    'stage-skipped',
    'stage-completed',
    'progress',
    'log',
    'scenes-planned',
    'scene-prompt-ready',
    'scene-prompts-progress',
    'images-recovery-pass',
    'scene-image-started',
    'scene-image-ready',
    'scene-image-failed',
    'scene-image-progress',
    'scene-animation-started',
    'scene-animation-progress',
    'scene-animation-ready',
    'scene-animation-failed',
    'animation-provider-trouble',
    'voice-progress',
    'bgm-progress',
    'render-progress',
    'awaiting-scene-confirmation',
    'avatar-planned',
    'avatar-scene-started',
    'avatar-scene-progress',
    'avatar-scene-ready',
    'avatar-scene-failed',
    'avatar-provider-trouble',
    'job-completed',
    'job-failed',
  ])
  // El recorrido de las fases como lo emite el corredor real
  // (pipeline/runner/run-stages.ts): «started voice», «skipped avatar»… Las
  // imágenes y el avatar corren a la vez y terminan en cualquier orden: sus
  // dos «completed» seguidos se comparan como «images» y después «avatar».
  const STAGE_EVENT_TYPES = new Set([
    'stage-started',
    'stage-skipped',
    'stage-completed',
  ])
  const stageTrace = (events) => {
    const trace = events
      .filter((event) => STAGE_EVENT_TYPES.has(event.type))
      .map((event) => `${event.type.replace('stage-', '')} ${event.stageId}`)
    const images = trace.indexOf('completed images')
    const avatar = trace.indexOf('completed avatar')
    if (avatar >= 0 && avatar === images - 1)
      [trace[avatar], trace[images]] = [trace[images], trace[avatar]]
    return trace
  }
  // El recorrido esperado: el avatar arranca junto con las imágenes y, si la
  // historia no lo trae, se saltea antes de que arranquen (runGroup); la
  // animación corre o se saltea antes del render.
  const expectedTrace = ({ avatar, animation }) => [
    ...['voice', 'transcription', 'scene-cuts', 'scene-prompts'].flatMap(
      (stageId) => [`started ${stageId}`, `completed ${stageId}`],
    ),
    ...(avatar
      ? [
          'started images',
          'started avatar',
          'completed images',
          'completed avatar',
        ]
      : ['skipped avatar', 'started images', 'completed images']),
    ...(animation
      ? ['started animation', 'completed animation']
      : ['skipped animation']),
    'started render',
    'completed render',
  ]
  // completedStages de una corrida real: las fases que corrieron, nunca las
  // salteadas.
  const expectedCompletedStages = ({ avatar, animation }) =>
    STAGE_IDS.filter(
      (stageId) =>
        (stageId !== 'avatar' || avatar) &&
        (stageId !== 'animation' || animation),
    )
  const sameStages = (actual, expected) =>
    JSON.stringify([...(actual ?? [])].sort()) ===
    JSON.stringify([...expected].sort())
  // Ningún rastro de la animación: ni bloques ni marcas del primer minuto.
  const withoutAnimation = (scenes) =>
    scenes.every(
      (scene) =>
        scene.animations === undefined &&
        scene.animationRequestedSeconds === undefined,
    )
  // El mp4 final del proyecto: el del pack que se copió en el render.
  const readVideo = (projectId) =>
    readFile(join(projectsRoot, String(projectId), `${projectId}.mp4`)).catch(
      () => Buffer.alloc(0),
    )
  // El cierre que deja el editor reproduciendo el mp4 (TRANSITION_POLICY_VERSION
  // de pipeline/animation/transitions.ts, y sin la marca de desactualizado).
  const playsFinalVideo = (metadata) =>
    metadata.renderTransitionVersion === 1 && metadata.videoOutdated === false
  // El snapshot que Crear manda con un estilo del catálogo nuevo (plan E2
  // §5.4): el id de la gema en `styleId` y en `catalogStyleId`.
  const catalogStyle = (catalogStyleId) => ({
    styleId: catalogStyleId,
    catalogStyleId,
    name: `Catálogo ${catalogStyleId}`,
    systemPrompt: 'You write prompts.',
    shots: [],
  })
  // Una gema del pack elegida en «Mi estilo».
  const gemStyle = (gem) => ({
    styleId: gem.styleId,
    name: gem.style.name,
    systemPrompt: 'You write prompts.',
    shots: [],
  })
  // Por defecto, el estilo `normal` del catálogo (`options.styleId` es el id
  // heredado de esa gema, plan E2 §5.4).
  const projectPayload = (name, options) => ({
    name,
    script: 'Guion de prueba de la demo.',
    options: {
      styleId: 'normal',
      customStyle: catalogStyle('normal'),
      sceneCount: 0,
      narrationMode: 'tts',
      imageProvider: 'evolink',
      useBgm: false,
      useOverlay: false,
      confirmScenes: false,
      autoRender: true,
      ...options,
    },
  })
  const createProject = async (name, options) => {
    const { events } = await runSidecar('create-video-project', {
      projectsRoot,
      config: demoConfig(),
      payload: projectPayload(name, options),
    })
    return resultOf(events)?.projectId
  }
  // `String()`: un create fallido deja el id en undefined y el chequeo, no
  // `join`, es el que tiene que avisarlo.
  const readMetadata = (projectId, root = projectsRoot) =>
    readJsonIfPresent(join(root, String(projectId), 'project.json'), {})
  const readScenes = (projectId, root = projectsRoot) =>
    readJsonIfPresent(join(root, String(projectId), 'scenes.json'), [])

  // 7. El flag se valida como booleano.
  section('7. options.demo debe ser booleano')
  {
    const { events } = await runSidecar('create-video-project', {
      projectsRoot,
      config: demoConfig(),
      payload: projectPayload('Demo mal', { demo: 'yes' }),
    })
    assert(
      codeOf(events) === 'invalid_payload',
      `demo:"yes" → invalid_payload (fue ${codeOf(events)})`,
    )
  }

  // 8. La simulación completa: orden de fases, archivos antes que eventos,
  // metadata final. Sin animationMinutes, aunque la historia (`normal`) esté
  // animada: avatar y animación salteados y el video sin animar.
  section('8. run-video-pipeline con options.demo')
  {
    const projectId = await createProject('Demo normal', { demo: true })
    assert(
      typeof projectId === 'string',
      'create-video-project acepta demo:true',
    )
    const filesAtEvent = []
    let unknown = 0
    const { events } = await runSidecar('run-video-pipeline', {
      projectsRoot,
      config: demoConfig(),
      payload: { projectId },
      onEvent(event) {
        if (!KNOWN_EVENTS.has(event.type)) unknown += 1
        if (event.type === 'scene-image-ready')
          filesAtEvent.push(
            existsSync(event.imagePath) && statSync(event.imagePath).size > 0,
          )
        if (event.type === 'job-completed')
          filesAtEvent.push(
            existsSync(event.result?.videoPath ?? '') &&
              statSync(event.result.videoPath).size > 0,
          )
      },
    })
    assert(
      last(events)?.type === 'job-completed',
      `la demo termina en job-completed (fue ${outcomeOf(events)})`,
    )
    assert(
      resultOf(events)?.status === 'completed',
      'result.status es completed',
    )
    const trace = stageTrace(events)
    assert(
      JSON.stringify(trace) ===
        JSON.stringify(expectedTrace({ avatar: false, animation: false })),
      `las ocho fases van en el orden real: avatar se saltea antes de las imágenes y animación antes del render (fue ${trace.join(', ')})`,
    )
    assert(unknown === 0, 'ningún evento de tipo desconocido')
    assert(
      !events.some(
        (event) =>
          event.type.startsWith('scene-animation-') ||
          event.type.startsWith('avatar-'),
      ),
      'sin animación ni avatar no hay eventos de clips ni de apariciones',
    )
    assert(
      filesAtEvent.length === 3 && filesAtEvent.every(Boolean),
      'cada imagen y el video existen en disco cuando se emite su evento',
    )
    assert(
      events.filter((event) => event.type === 'voice-progress').length === 4,
      'cuatro voice-progress',
    )
    assert(
      events.some(
        (event) =>
          event.type === 'scenes-planned' &&
          event.scenes.length === 2 &&
          event.audioDurationSeconds > 0,
      ),
      'scenes-planned con las escenas del pack y duración',
    )
    assert(
      events.filter((event) => event.type === 'scene-prompt-ready').length ===
        2,
      'un scene-prompt-ready por escena',
    )
    assert(
      events.filter((event) => event.type === 'scene-image-progress').length ===
        6,
      'tres olas de progreso por imagen',
    )
    assert(
      events.some(
        (event) =>
          event.type === 'render-progress' &&
          event.phase === 'final' &&
          event.percent === 100,
      ),
      'el render llega a final 100',
    )
    assert(
      !events.some((event) => event.type === 'awaiting-scene-confirmation'),
      'nunca pausa a confirmar escenas',
    )
    const metadata = await readMetadata(projectId)
    assert(metadata.state === 'completed', 'project.json queda completed')
    assert(
      JSON.stringify(metadata.completedStages) ===
        JSON.stringify(
          expectedCompletedStages({ avatar: false, animation: false }),
        ),
      `completedStages trae las seis fases que corrieron, sin avatar ni animación (fue ${metadata.completedStages?.join(',')})`,
    )
    assert(
      playsFinalVideo(metadata),
      `al terminar, renderTransitionVersion es 1 y videoOutdated false: el editor reproduce el mp4 (fue ${metadata.renderTransitionVersion} y ${metadata.videoOutdated})`,
    )
    assert(
      (await readVideo(projectId)).equals(FAKE_MP4),
      'sin animationMinutes el mp4 final es el video_final.mp4 de la historia',
    )
    assert(
      metadata.sceneCount === 2 &&
        metadata.wordCount === 4 &&
        metadata.audioDurationSeconds > 0,
      'sceneCount, wordCount y audioDurationSeconds persistidos',
    )
    const words = await readJsonIfPresent(
      join(projectsRoot, String(projectId), 'words.json'),
      [],
    )
    assert(
      words.length === 4 &&
        words.every(
          (word) => !('confidence' in word) && typeof word.start === 'number',
        ),
      'words.json en formato nativo (sin confidence)',
    )
    const scenes = await readScenes(projectId)
    assert(
      scenes.length === 2 &&
        scenes.every(
          (scene) =>
            typeof scene.text === 'string' &&
            typeof scene.imagePrompt === 'string' &&
            typeof scene.startSeconds === 'number',
        ),
      'scenes.json en formato nativo',
    )
    assert(
      scenes[0]?.imagePrompt === 'normal scene one',
      'los prompts salen de la carpeta normal',
    )
    assert(
      withoutAnimation(scenes) &&
        !existsSync(join(projectsRoot, projectId, 'animations')),
      'sin animación, scenes.json no trae bloques ni marcas del primer minuto (aunque la historia esté animada) y no se copia ningún clip',
    )
    assert(
      existsSync(join(projectsRoot, projectId, `${projectId}.mp4`)),
      'el video final lleva el nombre del proyecto',
    )
  }

  // 9. Cancelar a mitad deja paused y no completa.
  section('9. cancelación')
  {
    const projectId = await createProject('Demo cancel', { demo: true })
    const { events } = await runSidecar('run-video-pipeline', {
      projectsRoot,
      config: demoConfig({ delayScale: 0.05 }),
      payload: { projectId },
      cancelOn: 'scene-image-started',
    })
    assert(
      codeOf(events) === 'cancelled',
      `cancelar termina en job-failed cancelled (fue ${codeOf(events)})`,
    )
    assert(
      !events.some((event) => event.type === 'job-completed'),
      'no hay job-completed tras cancelar',
    )
    assert(
      (await readMetadata(projectId)).state === 'paused',
      'project.json queda paused',
    )
  }

  // 10. Estilo sin historia en el pack (o en ese formato): la demo solo
  // mapea `customStyle.catalogStyleId` (catálogo) o el `styleId` de una gema
  // del pack (Mi estilo).
  section('10. estilo sin demo')
  {
    const cases = [
      {
        label: 'fantasia sin customStyle',
        options: { styleId: 'fantasia', customStyle: undefined },
      },
      {
        label: 'cartoon, un estilo del catálogo que el pack no trae',
        options: { styleId: 'cartoon', customStyle: catalogStyle('cartoon') },
      },
      {
        label: '2d-mono en Short (solo tiene historia en 16:9)',
        options: { customStyle: catalogStyle('2d-mono'), videoFormat: '9:16' },
      },
      {
        label: 'jardineria en Short (solo tiene historia en 16:9)',
        options: { customStyle: gemStyle(GEMS[1]), videoFormat: '9:16' },
      },
      {
        label: 'un estilo propio que no es una gema del pack',
        options: {
          customStyle: {
            styleId: 'st-mio',
            name: 'Mi estilo',
            systemPrompt: 'You write prompts.',
            shots: [],
          },
        },
      },
    ]
    for (const [index, { label, options }] of cases.entries()) {
      const projectId = await createProject(`Demo sin historia ${index + 1}`, {
        demo: true,
        ...options,
      })
      const { events } = await runSidecar('run-video-pipeline', {
        projectsRoot,
        config: demoConfig(),
        payload: { projectId },
      })
      assert(
        codeOf(events) === 'demo_style_not_included',
        `${label} → demo_style_not_included (fue ${outcomeOf(events)})`,
      )
      if (index > 0) continue
      const metadata = await readMetadata(projectId)
      assert(
        metadata.state === 'error' &&
          metadata.errorCode === 'demo_style_not_included',
        'el error queda persistido',
      )
    }
  }

  // 11. La historia sale de la gema elegida o del estilo del catálogo.
  section('11. gema del pack y estilo del catálogo')
  {
    const gemId = await createProject('Demo gema', {
      demo: true,
      customStyle: gemStyle(GEMS[0]),
    })
    const gemRun = await runSidecar('run-video-pipeline', {
      projectsRoot,
      config: demoConfig(),
      payload: { projectId: gemId },
    })
    assert(
      resultOf(gemRun.events)?.status === 'completed',
      `con la gema storytelling la demo completa (fue ${outcomeOf(gemRun.events)})`,
    )
    assert(
      (await readScenes(gemId))[0]?.imagePrompt === 'storytelling scene one',
      'los prompts salen de la carpeta storytelling',
    )
    const catalogId = await createProject('Demo 2d mono', {
      demo: true,
      customStyle: catalogStyle('2d-mono'),
    })
    const catalogRun = await runSidecar('run-video-pipeline', {
      projectsRoot,
      config: demoConfig(),
      payload: { projectId: catalogId },
    })
    assert(
      resultOf(catalogRun.events)?.status === 'completed' &&
        (await readScenes(catalogId))[0]?.imagePrompt === '2d-mono scene one',
      `customStyle.catalogStyleId 2d-mono copia la historia 2d-mono, no la de storytelling (fue ${outcomeOf(catalogRun.events)})`,
    )
  }

  // 12. Sin pack instalado.
  section('12. demo_not_ready')
  {
    const bareRoot = join(workspace, 'Vimo-bare')
    await mkdir(bareRoot, { recursive: true })
    const created = await runSidecar('create-video-project', {
      projectsRoot: bareRoot,
      config: demoConfig(),
      payload: projectPayload('Demo sin pack', { demo: true }),
    })
    const projectId = resultOf(created.events)?.projectId
    const { events } = await runSidecar('run-video-pipeline', {
      projectsRoot: bareRoot,
      config: demoConfig(),
      payload: { projectId },
    })
    assert(
      codeOf(events) === 'demo_not_ready',
      `sin pack → demo_not_ready (fue ${codeOf(events)})`,
    )
  }

  // 13. Los jobs del editor rechazan proyectos demo.
  section('13. demo_project en el editor')
  {
    const projectId = await createProject('Demo editor', { demo: true })
    await runSidecar('run-video-pipeline', {
      projectsRoot,
      config: demoConfig(),
      payload: { projectId },
    })
    let run = await runSidecar('regenerate-scene-images', {
      projectsRoot,
      config: demoConfig(),
      payload: { projectId, scenes: [{ id: 1, rewritePrompt: false }] },
    })
    assert(
      codeOf(run.events) === 'demo_project',
      `regenerate-scene-images → demo_project (fue ${codeOf(run.events)})`,
    )
    run = await runSidecar('replace-narration', {
      projectsRoot,
      config: demoConfig(),
      payload: {
        projectId,
        mode: 'upload',
        audioPath: join(workspace, 'nada.mp3'),
      },
    })
    assert(
      codeOf(run.events) === 'demo_project',
      `replace-narration → demo_project (fue ${codeOf(run.events)})`,
    )
  }

  // 14. Historia Short: la carpeta se elige por formato.
  section('14. historia Short (9:16)')
  {
    const projectId = await createProject('Demo short', {
      demo: true,
      videoFormat: '9:16',
    })
    const { events } = await runSidecar('run-video-pipeline', {
      projectsRoot,
      config: demoConfig(),
      payload: { projectId },
    })
    assert(
      resultOf(events)?.status === 'completed',
      `un proyecto 9:16 en demo completa (fue ${outcomeOf(events)})`,
    )
    assert(
      (await readScenes(projectId))[0]?.imagePrompt ===
        'normal short scene one',
      'los prompts salen de short/normal',
    )
    assert(
      (await readMetadata(projectId)).options?.videoFormat === '9:16',
      'project.json conserva videoFormat 9:16',
    )
    const gemId = await createProject('Demo short gema', {
      demo: true,
      videoFormat: '9:16',
      customStyle: gemStyle(GEMS[0]),
    })
    const gemRun = await runSidecar('run-video-pipeline', {
      projectsRoot,
      config: demoConfig(),
      payload: { projectId: gemId },
    })
    assert(
      resultOf(gemRun.events)?.status === 'completed' &&
        (await readScenes(gemId))[0]?.imagePrompt ===
          'storytelling short scene one',
      `la gema en 9:16 sale de short/storytelling (fue ${outcomeOf(gemRun.events)})`,
    )
  }

  // 15. «Subir mi audio» en demo: sin ramp de voz y narración del pack.
  section('15. audio propio en demo')
  {
    const projectId = await createProject('Demo audio propio', {
      demo: true,
      narrationMode: 'own-audio',
    })
    // Lo que upload-narration deja en el proyecto (sin ffmpeg en el guard).
    await writeFile(
      join(projectsRoot, projectId, 'narration.mp3'),
      Buffer.from('audio subido por la persona'),
    )
    const started = []
    const { events } = await runSidecar('run-video-pipeline', {
      projectsRoot,
      config: demoConfig(),
      payload: { projectId },
      onEvent(event) {
        if (event.type === 'stage-started') started.push(event.stageId)
      },
    })
    assert(
      resultOf(events)?.status === 'completed',
      `con own-audio la demo completa (fue ${outcomeOf(events)})`,
    )
    assert(
      started[0] === 'voice' &&
        !events.some((event) => event.type === 'voice-progress'),
      'la fase voice corre sin voice-progress',
    )
    assert(
      (await readFile(join(projectsRoot, projectId, 'narration.mp3'))).equals(
        FAKE_MP3,
      ),
      'narration.mp3 termina siendo el audio del pack',
    )
  }

  // 16. Pack sin Short: válido, sin historias 9:16.
  section('16. pack sin Short')
  {
    const landscapeRoot = join(workspace, 'Vimo-landscape')
    await mkdir(landscapeRoot, { recursive: true })
    const config = demoConfig({
      packParts: [servedPart('/landscape-only.zip')],
    })
    const prepared = await runSidecar('demo-prepare', {
      projectsRoot: landscapeRoot,
      config,
    })
    assert(
      last(prepared.events)?.type === 'job-completed',
      `un pack sin short se instala (fue ${outcomeOf(prepared.events)})`,
    )
    const status = await runSidecar('demo-status', {
      projectsRoot: landscapeRoot,
      config,
    })
    const manifest = resultOf(status.events)?.manifest
    assert(
      resultOf(status.events)?.ready === true &&
        manifest?.stories?.['9:16'] === undefined &&
        manifest?.stories?.['16:9']?.styles?.length === 2,
      'sin short no hay stories[9:16] y sí 16:9',
    )
    const created = await runSidecar('create-video-project', {
      projectsRoot: landscapeRoot,
      config,
      payload: projectPayload('Demo short sin pack', {
        demo: true,
        videoFormat: '9:16',
      }),
    })
    const projectId = resultOf(created.events)?.projectId
    assert(
      typeof projectId === 'string',
      'create-video-project acepta demo:true (pack sin short)',
    )
    const { events } = await runSidecar('run-video-pipeline', {
      projectsRoot: landscapeRoot,
      config,
      payload: { projectId },
    })
    assert(
      codeOf(events) === 'demo_format_not_included',
      `9:16 sin short → demo_format_not_included (fue ${codeOf(events)})`,
    )
    const metadata = await readMetadata(projectId, landscapeRoot)
    assert(
      metadata.state === 'error' &&
        metadata.errorCode === 'demo_format_not_included',
      'el error queda persistido',
    )
  }

  // 17. Short a medias: no se instala.
  section('17. Short incompleto')
  {
    const brokenShortRoot = join(workspace, 'Vimo-short-incomplete')
    await mkdir(brokenShortRoot, { recursive: true })
    const { events } = await runSidecar('demo-prepare', {
      projectsRoot: brokenShortRoot,
      config: demoConfig({
        packParts: [servedPart('/short-incomplete.zip')],
      }),
    })
    assert(
      codeOf(events) === 'demo_pack_incomplete' &&
        last(events)?.message?.includes('short/normal/video_final.mp4'),
      `short/ sin un video → demo_pack_incomplete (fue ${outcomeOf(events)})`,
    )
    assert(
      !existsSync(join(brokenShortRoot, '_demo-pack')),
      'un short incompleto no deja _demo-pack a medias',
    )
    // Con todas sus partes marcadas, un staging que no forma un pack válido
    // se descarta: «Reintentar» vuelve a bajar en vez de chocar siempre con
    // el mismo staging.
    assert(
      !existsSync(join(brokenShortRoot, '_demo-pack.tmp')) &&
        (await downloadLeftovers(brokenShortRoot)).length === 0,
      'el staging completo pero inválido se descarta y no quedan zips',
    )
  }

  // 18. El armador v4 (spec §3): tres proyectos nativos → partes con
  // historias enteras, la primera con el manifest y las gemas, sin recibos
  // ni URLs del proveedor, con las imágenes recomprimidas a JPEG de verdad y
  // que el lector del sidecar acepta. La instalación de las partes con
  // demo-prepare la prueba la sección 27 (Ruling R2).
  section('18. build-demo-pack arma el pack v4 en partes')
  {
    const ffmpeg = pinnedFfmpeg()
    assert(
      ffmpeg !== null,
      'el ffmpeg empaquetado está en src-tauri/binaries (pnpm fetch:binaries)',
    )
    const media = ffmpeg
      ? await writeBuilderMedia(ffmpeg, join(workspace, 'builder-media'))
      : null
    const nativeRoot = join(workspace, BUILDER_NATIVE_FOLDER)
    const outDirectory = join(workspace, 'builder-out')
    if (media) await writeBuilderFixture(nativeRoot, media)

    // Con --part-mb 0.05 ninguna historia entra junto a otra: una por parte.
    // De a un ffmpeg por vez, para compararlo después con varios a la vez.
    const build = media
      ? await runBuilder([
          ...builderArguments(nativeRoot, outDirectory),
          '--part-mb',
          '0.05',
          '--jobs',
          '1',
        ])
      : { code: null, stdout: '', stderr: '' }
    assert(
      build.code === 0,
      `build-demo-pack termina en 0 (fue ${build.code}: ${build.stderr.trim()})`,
    )
    const readParts = async () => {
      const listed = await readJsonIfPresent(join(outDirectory, 'parts.json'))
      return Array.isArray(listed) ? listed : []
    }
    const parts = await readParts()
    assert(
      parts.length >= 2,
      `con --part-mb 0.05, parts.json lista al menos dos partes (fueron ${parts.length})`,
    )
    const zips = []
    for (const [index, part] of parts.entries()) {
      const file = join(outDirectory, String(part?.file))
      const zip = existsSync(file) ? await readFile(file) : Buffer.alloc(0)
      assert(
        part?.file === `${BUILT_PART_PREFIX}${index + 1}.zip` &&
          zip.length > 0 &&
          part?.bytes === zip.length &&
          part?.sha256 === sha256(zip),
        `parts.json trae el archivo, los bytes y el sha256 de la parte ${index + 1}`,
      )
      zips.push(zip)
    }
    assert(
      parts.length > 0 &&
        parts.every((part) => build.stdout.includes(part?.sha256)),
      'imprime parts.json con el sha256 de cada parte',
    )
    assert(
      existsSync(outDirectory) &&
        isDeepStrictEqual(
          (await readdir(outDirectory)).sort(),
          [...parts.map((part) => part?.file), 'parts.json'].sort(),
        ),
      '--out queda con las partes y parts.json, nada más',
    )

    const names = zips.map(zipEntryNames)
    assert(
      names[0]?.[0] === 'manifest.json' && names[0]?.[1]?.startsWith('gemas/'),
      `la parte 1 abre con manifest.json y sigue con gemas/ (fue ${names[0]?.slice(0, 2).join(', ')})`,
    )
    assert(
      names.length >= 2 &&
        names
          .slice(1)
          .every((entries) =>
            entries.every(
              (name) => name !== 'manifest.json' && !name.startsWith('gemas/'),
            ),
          ),
      'manifest.json y gemas/ viajan solo en la parte 1',
    )
    for (const story of BUILT_STORIES) {
      const prefix = `${FORMAT_PREFIXES[story.format]}${story.id}/`
      const holders = names.filter((entries) =>
        entries.some((name) => name.startsWith(prefix)),
      ).length
      assert(
        holders === 1,
        `${prefix} viaja entera en una sola parte (está en ${holders})`,
      )
    }
    const allNames = names.flat()
    assert(
      allNames.length > 0 && allNames.length === new Set(allNames).size,
      'ningún archivo se repite entre partes',
    )
    assert(
      allNames.length > 0 &&
        !allNames.some((name) => BUILT_LEFTOVERS.test(name)),
      'no viajan los .source.mp4, .reference-N.jpg, .raw.mp4 ni .wav del proyecto',
    )

    // Las partes juntas, con el extractor y el lector del sidecar.
    const extractedRoot = join(workspace, 'builder-extracted')
    assert(
      parts.length > 0 &&
        (await extractParts(
          outDirectory,
          parts.map((part) => String(part?.file)),
          extractedRoot,
        )),
      'el extractor del sidecar abre cada parte',
    )
    const problem = await validatePack(extractedRoot)
    assert(
      problem === null,
      `el lector del sidecar acepta el pack armado (validatePack: ${problem})`,
    )
    const packed = (name) => join(extractedRoot, name)
    const manifest = await readJsonIfPresent(packed('manifest.json'), {})
    assert(
      manifest.version === 'v4' &&
        isDeepStrictEqual(manifest.voz, {
          provider: 'ai33',
          voice_id: 'voice-mini',
          nombre: 'Abel mini',
        }),
      `el manifest es v4 con la voz de la primera historia (fue ${JSON.stringify(manifest.voz)})`,
    )
    assert(
      isDeepStrictEqual(manifest.gemas, [
        { id: 'storytelling', styleId: 'demo-storytelling' },
        { id: 'jardineria', styleId: 'demo-jardineria' },
      ]),
      `gemas lista las de gems.json con su styleId (fue ${JSON.stringify(manifest.gemas)})`,
    )
    assert(
      isDeepStrictEqual(manifest.estilos, [
        {
          id: 'normal',
          nombreSugerido: 'El océano profundo (armado)',
          numEscenas: 2,
          duracionAudioSeg: 2.3,
          personaje: 'generic',
          animada: true,
        },
      ]),
      `estilos trae normal con el título de stories.json, personaje generic y animada (fue ${JSON.stringify(manifest.estilos)})`,
    )
    assert(
      isDeepStrictEqual(manifest.historiasGema, [
        {
          id: 'jardineria',
          nombreSugerido: 'Mi huerta en el balcón',
          numEscenas: 2,
          duracionAudioSeg: 2.3,
          personaje: 'none',
          animada: false,
          avatar: {
            nombre: 'Jardineria',
            motor: 'avatar_iv',
            apariciones: 1,
            segundosPorAparicion: 5,
            opciones: BUILT_AVATAR_OPTIONS,
          },
        },
      ]),
      `historiasGema trae jardineria con su avatar y las opciones nativas (fue ${JSON.stringify(manifest.historiasGema)})`,
    )
    assert(
      (manifest.short?.estilos ?? []).length === 0 &&
        isDeepStrictEqual(manifest.short?.historiasGema, [
          {
            id: 'storytelling',
            nombreSugerido: 'El último tren a casa',
            numEscenas: 2,
            duracionAudioSeg: 2.3,
            personaje: 'none',
            animada: false,
          },
        ]),
      `short trae la gema storytelling sin personaje ni animación (fue ${JSON.stringify(manifest.short)})`,
    )

    assert(
      existsSync(packed('normal/video_animado.mp4')) &&
        existsSync(packed(`normal/animaciones/${BUILT_CLIP}`)),
      'la historia animada trae video_animado.mp4 y su clip',
    )
    assert(
      existsSync(packed('jardineria/video_final.mp4')) &&
        existsSync(packed('short/storytelling/video_final.mp4')) &&
        !existsSync(packed('jardineria/video_animado.mp4')) &&
        !existsSync(packed('short/storytelling/video_animado.mp4')) &&
        !existsSync(packed('jardineria/animaciones')),
      'las historias sin animar traen solo el video sin animar, sin clips',
    )
    assert(
      existsSync(packed(`jardineria/avatar/${BUILT_AVATAR_CLIP}`)) &&
        existsSync(packed('jardineria/avatar/look.jpg')),
      'la historia con avatar trae el clip de la aparición y la vista del look',
    )
    assert(
      existsSync(packed('gemas/jardineria/avatar.jpg')) &&
        !existsSync(packed('gemas/storytelling/avatar.jpg')),
      'la vista del avatar va solo en la gema que la trae',
    )
    const packedStyle = await readFile(
      packed('gemas/jardineria/style.json'),
      'utf8',
    ).catch(() => '')
    assert(
      isDeepStrictEqual(
        packedStyle ? JSON.parse(packedStyle) : null,
        GEMS[1].style,
      ) &&
        !packedStyle.includes('youtube') &&
        existsSync(packed('gemas/storytelling/sample-2.jpg')),
      'cada gema lleva su style.json sin origin ni sourcePrompt, y sus muestras',
    )
    const images = allNames.filter((name) => name.endsWith('.jpg'))
    const realJpegs = await Promise.all(
      images.map(async (name) =>
        (await readFile(packed(name)).catch(() => Buffer.alloc(0)))
          .subarray(0, JPEG_MAGIC.length)
          .equals(JPEG_MAGIC),
      ),
    )
    assert(
      images.length === 10 && realJpegs.every(Boolean),
      `las 10 imágenes son JPEG de verdad, aunque el origen sea PNG o WEBP (fueron ${images.length}, JPEG ${realJpegs.filter(Boolean).length})`,
    )
    // Un archivo del pack, o vacío si falta: el chequeo es el que avisa.
    const packedBytes = (name) =>
      readFile(packed(name)).catch(() => Buffer.alloc(0))
    const sameBytes = async (packedName, source) =>
      (await packedBytes(packedName)).equals(await readFile(source))
    assert(
      media !== null &&
        !(await sameBytes('normal/video_final.mp4', media.staticVideo)) &&
        !(await sameBytes(`normal/animaciones/${BUILT_CLIP}`, media.clip)) &&
        (await packedBytes('normal/video_final.mp4'))
          .subarray(4, 8)
          .toString() === 'ftyp',
      'los videos y los clips salen recomprimidos, en mp4',
    )
    assert(
      (await packedBytes('normal/audio.mp3')).equals(FAKE_MP3) &&
        (
          await readFile(packed('short/storytelling/guion.txt'), 'utf8').catch(
            () => '',
          )
        ).startsWith('El último tren a casa'),
      'audio.mp3 es la narración tal cual y guion.txt el script.txt',
    )
    const words = await readJsonIfPresent(packed('normal/palabras.json'), [])
    assert(
      words.length === 4 &&
        words.every(
          (word) => !('confidence' in word) && typeof word.end === 'number',
        ),
      'palabras.json lleva word, start y end',
    )

    const rawScenes = await Promise.all(
      ['normal', 'jardineria', 'short/storytelling'].map((directory) =>
        readFile(packed(`${directory}/escenas.json`), 'utf8').catch(() => ''),
      ),
    )
    assert(
      rawScenes.every(
        (text) =>
          text.length > 0 &&
          BUILT_PRIVATE_KEYS.every((key) => !text.includes(key)) &&
          !/https?:\/\//.test(text),
      ),
      'ningún escenas.json trae attempts, task, videoUrl, creditsConsumed, errorCode ni URLs',
    )
    const parseScenes = (text) => (text ? JSON.parse(text) : [])
    const [normalScenes, presenterScenes] = rawScenes.map(parseScenes)
    assert(
      normalScenes[0]?.texto === 'Frase 1' &&
        normalScenes[0]?.promptImagen === 'normal built scene one' &&
        normalScenes[1]?.tiempoInicioSeg === 1.1 &&
        normalScenes[1]?.tiempoFinSeg === 2.3 &&
        normalScenes[0]?.nativo?.animationRequestedSeconds === 6 &&
        normalScenes[1]?.nativo?.staticTransitionIn === true,
      'escenas.json conserva los campos del v3 y suma animationRequestedSeconds y staticTransitionIn',
    )
    const block = normalScenes[0]?.nativo?.animations?.[0]
    assert(
      block?.clipFile === BUILT_CLIP &&
        block?.status === 'ready' &&
        block?.normalizedSeconds === 2.3 &&
        block?.prompt === 'slow camera push' &&
        isDeepStrictEqual(block?.sceneIds, [1, 2]) &&
        normalScenes[1]?.nativo?.animations === undefined,
      'el bloque de animación viaja en nativo, en su escena, con su forma nativa',
    )
    const avatarBlock = presenterScenes[1]?.nativo?.avatar
    assert(
      avatarBlock?.clipFile === BUILT_AVATAR_CLIP &&
        avatarBlock?.renderHash === BUILT_RENDER_HASH &&
        avatarBlock?.lookId === 'look-jardineria' &&
        avatarBlock?.motionPrompt === 'Warm smile.' &&
        presenterScenes[1]?.promptImagen === undefined,
      'la aparición del avatar viaja en nativo, sin promptImagen',
    )

    // Varios ffmpeg a la vez (--jobs 3) arman exactamente las mismas partes:
    // la recompresión es determinista y el orden no depende de cuál termina
    // primero.
    const jobsDirectory = join(workspace, 'builder-out-jobs')
    const parallel = media
      ? await runBuilder([
          ...builderArguments(nativeRoot, jobsDirectory),
          '--part-mb',
          '0.05',
          '--jobs',
          '3',
        ])
      : { code: null, stdout: '', stderr: '' }
    assert(
      parallel.code === 0 &&
        parts.length > 0 &&
        isDeepStrictEqual(
          await readJsonIfPresent(join(jobsDirectory, 'parts.json')),
          parts,
        ),
      `con --jobs 3, parts.json es idéntico al de --jobs 1: mismos bytes y mismos SHA-256 (fue ${parallel.code}: ${parallel.stderr.trim()})`,
    )
    const zeroJobs = media
      ? await runBuilder([
          ...builderArguments(nativeRoot, join(workspace, 'builder-out-zero')),
          '--jobs',
          '0',
        ])
      : { code: null, stdout: '', stderr: '' }
    assert(
      zeroJobs.code !== 0 && zeroJobs.stderr.includes('--jobs tiene que ser'),
      `--jobs 0 se rechaza (fue ${zeroJobs.code}: ${zeroJobs.stderr.trim()})`,
    )

    // Sin recomprimir y con el tamaño por defecto, sobre la misma carpeta.
    const plain = media
      ? await runBuilder([
          ...builderArguments(nativeRoot, outDirectory),
          '--no-recompress',
        ])
      : { code: null, stdout: '', stderr: '' }
    assert(
      plain.code === 0,
      `build-demo-pack --no-recompress termina en 0 (fue ${plain.code}: ${plain.stderr.trim()})`,
    )
    const plainParts = await readParts()
    assert(
      plainParts.length === 1 &&
        existsSync(outDirectory) &&
        isDeepStrictEqual((await readdir(outDirectory)).sort(), [
          'parts.json',
          `${BUILT_PART_PREFIX}1.zip`,
        ]),
      'con el tamaño por defecto entra todo en una parte y las sobrantes del armado anterior se borran',
    )
    const plainRoot = join(workspace, 'builder-extracted-plain')
    assert(
      plainParts.length === 1 &&
        (await extractParts(outDirectory, [plainParts[0].file], plainRoot)) &&
        (await validatePack(plainRoot)) === null,
      'la parte única también la acepta el lector',
    )
    const plainBytes = async (packedName, source) =>
      (
        await readFile(join(plainRoot, packedName)).catch(() => Buffer.alloc(0))
      ).equals(await readFile(source))
    assert(
      media !== null &&
        (await plainBytes('normal/imagenes/imagen_1.jpg', media.png)) &&
        (await plainBytes(`normal/animaciones/${BUILT_CLIP}`, media.clip)) &&
        existsSync(join(plainRoot, 'jardineria/avatar/look.png')),
      'con --no-recompress las imágenes y los clips se copian tal cual y el look conserva su extensión',
    )
    assert(
      media !== null &&
        (await plainBytes('normal/video_final.mp4', media.staticVideo)) &&
        (await plainBytes('normal/video_animado.mp4', media.video)),
      'video_final.mp4 sale de staticVideo y video_animado.mp4 del mp4 del proyecto',
    )

    // Entradas rotas: el armador falla por SU motivo y no escribe partes.
    const brokenBuilds = [
      {
        label: 'proyecto sin terminar',
        expected: 'no está completed',
        tweak: (fixture) => {
          fixture.projects['demo-normal'].metadata.state = 'paused'
        },
      },
      {
        label: 'formato distinto al del proyecto',
        expected: 'stories.json lo pone en 9:16',
        tweak: (fixture) => {
          fixture.stories[0].format = '9:16'
        },
      },
      {
        label: 'otra voz',
        expected: 'misma voz en todas las historias',
        tweak: (fixture) => {
          fixture.projects['demo-storytelling-short'].metadata.options.voiceId =
            'otra-voz'
        },
      },
      {
        label: 'ids de escena salteados',
        expected: 'ids de escena no contiguos',
        tweak: (fixture) => {
          fixture.projects['demo-storytelling-short'].scenes[1].id = 3
        },
      },
      {
        label: 'escena sin imagen',
        expected: 'falta scenes/scene_2.jpg',
        tweak: (fixture) => {
          delete fixture.projects['demo-storytelling-short'].files[
            'scenes/scene_2.jpg'
          ]
        },
      },
      {
        label: 'animada sin la fase animation',
        expected: '"animation" no está en completedStages',
        tweak: (fixture) => {
          const metadata = fixture.projects['demo-normal'].metadata
          metadata.completedStages = metadata.completedStages.filter(
            (stage) => stage !== 'animation',
          )
        },
      },
      {
        label: 'clip fallido',
        expected: 'no está listo',
        tweak: (fixture) => {
          fixture.projects['demo-normal'].scenes[0].animations[0].status =
            'failed'
        },
      },
      {
        label: 'clip sin normalizar',
        expected: 'normalizedSeconds',
        tweak: (fixture) => {
          delete fixture.projects['demo-normal'].scenes[0].animations[0]
            .normalizedSeconds
        },
      },
      {
        label: 'clip que falta',
        expected: `falta animations/${BUILT_CLIP}`,
        tweak: (fixture) => {
          delete fixture.projects['demo-normal'].files[
            `animations/${BUILT_CLIP}`
          ]
        },
      },
      {
        label: 'aparición sin su clip',
        expected: `falta avatar/${BUILT_AVATAR_CLIP}`,
        tweak: (fixture) => {
          delete fixture.projects['demo-jardineria'].files[
            `avatar/${BUILT_AVATAR_CLIP}`
          ]
        },
      },
      {
        label: 'menos apariciones que las pedidas',
        expected: 'pide 2 apariciones y scenes.json trae 1',
        tweak: (fixture) => {
          fixture.projects['demo-jardineria'].metadata.options.avatar = {
            ...BUILT_AVATAR_OPTIONS,
            appearances: 2,
          }
        },
      },
      {
        label: 'gema con avatar sin su vista',
        expected: 'avatarPreview',
        tweak: (fixture) => {
          delete fixture.gems[1].avatarPreview
        },
      },
      {
        label: 'video sin animar de menos de 100 KB',
        expected: 'pesa menos de',
        tweak: (fixture) => {
          fixture.files['static/demo-storytelling-short.mp4'] = FAKE_MP4
        },
      },
      {
        // Imágenes o clips rehechos después del render: el mp4 ya no es el
        // de escenas.json.
        label: 'video desactualizado',
        expected: 'videoOutdated',
        tweak: (fixture) => {
          fixture.projects['demo-normal'].metadata.videoOutdated = true
        },
      },
      {
        label: 'voz sin nombre',
        expected: 'voiceName',
        tweak: (fixture) => {
          delete fixture.projects['demo-storytelling-short'].metadata.options
            .voiceName
        },
      },
      {
        // Una máquina de la demo no tiene el personaje propio de la gema.
        label: 'gema con personaje propio',
        expected: 'personaje propio',
        tweak: (fixture) => {
          fixture.files['_styles/demo-storytelling/style.json'] = Buffer.from(
            JSON.stringify({
              ...GEMS[0].style,
              character: { mode: 'own', defaultCharacterId: 'mi-personaje' },
            }),
          )
        },
      },
      {
        label: 'clip que no es un mp4',
        expected: 'no es un mp4',
        tweak: (fixture) => {
          fixture.projects['demo-normal'].files[`animations/${BUILT_CLIP}`] =
            FAKE_CLIP_MP4
        },
      },
      // Con recompresión. Lo que se revisa sin tocar los medios falla antes
      // de recomprimir nada, aunque una historia anterior traiga un clip que
      // ffmpeg no puede leer: recomprimiendo primero, fallaría por ese clip.
      {
        label: 'URL anidada en la aparición, con un clip ilegible antes',
        expected: 'conserva una URL',
        recompress: true,
        beforeRecompressing: true,
        tweak: (fixture) => {
          fixture.projects['demo-normal'].files[`animations/${BUILT_CLIP}`] =
            CORRUPT_MP4
          fixture.projects['demo-jardineria'].scenes[1].avatar.extra = {
            link: 'https://provider.example/avatar/clip.mp4',
          }
        },
      },
      {
        label: 'gema que el lector rechaza, con un clip ilegible antes',
        expected: 'lacks name, systemPrompt or sections',
        recompress: true,
        beforeRecompressing: true,
        tweak: (fixture) => {
          fixture.projects['demo-normal'].files[`animations/${BUILT_CLIP}`] =
            CORRUPT_MP4
          fixture.files['_styles/demo-jardineria/style.json'] = Buffer.from(
            JSON.stringify({ name: 'Jardinería mini', shots: [] }),
          )
        },
      },
      {
        label: 'clip que ffmpeg no puede leer',
        expected: 'ffmpeg no pudo recomprimir',
        recompress: true,
        tweak: (fixture) => {
          fixture.projects['demo-normal'].files[`animations/${BUILT_CLIP}`] =
            CORRUPT_MP4
        },
      },
    ]
    for (const [index, broken] of brokenBuilds.entries()) {
      if (!media) break
      const { label, expected } = broken
      const root = join(workspace, `builder-broken-${index + 1}`)
      const out = join(workspace, `builder-broken-out-${index + 1}`)
      await writeBuilderFixture(root, media, broken.tweak)
      const run = await runBuilder([
        ...builderArguments(root, out),
        ...(broken.recompress ? [] : ['--no-recompress']),
      ])
      assert(
        run.code !== 0 && run.stderr.includes(expected),
        `${label} → el armador falla por «${expected}» (fue ${run.code}: ${run.stderr.trim()})`,
      )
      assert(!existsSync(out), `${label}: no escribe partes`)
      if (!broken.beforeRecompressing) continue
      assert(
        !run.stdout.includes('recomprimida'),
        `${label}: falla antes de recomprimir nada`,
      )
    }
  }

  // 19. El .ok de otra versión no basta: re-descarga limpia y reemplaza el pack.
  section('19. .ok de otra versión: re-descarga limpia al cambiar de pack')
  {
    const upgradeRoot = join(workspace, 'Vimo-upgrade')
    await mkdir(upgradeRoot, { recursive: true })

    const first = await runSidecar('demo-prepare', {
      projectsRoot: upgradeRoot,
      config: demoConfig(),
    })
    assert(
      last(first.events)?.type === 'job-completed',
      `instala mini con short/ (fue ${outcomeOf(first.events)})`,
    )
    assert(
      existsSync(
        join(upgradeRoot, '_demo-pack', 'short', 'normal', 'audio.mp3'),
      ),
      'short/ queda instalado tras la primera preparación',
    )

    // mini → mini2: mismo binario, otra versión y otro sha256 (pack sin short).
    const mini2Config = demoConfig({
      packVersion: 'mini2',
      packParts: [servedPart('/landscape-only.zip')],
    })
    const statusMini2 = await runSidecar('demo-status', {
      projectsRoot: upgradeRoot,
      config: mini2Config,
    })
    assert(
      resultOf(statusMini2.events)?.ready === false,
      'con el .ok de mini, la config de mini2 no está lista',
    )
    const hitsBeforeMini2 = hits
    const second = await runSidecar('demo-prepare', {
      projectsRoot: upgradeRoot,
      config: mini2Config,
    })
    assert(
      last(second.events)?.type === 'job-completed',
      `demo-prepare re-instala mini2 (fue ${outcomeOf(second.events)})`,
    )
    assert(
      hits === hitsBeforeMini2 + 1,
      `re-descarga exactamente una vez (hits +${hits - hitsBeforeMini2})`,
    )
    const markerMini2 = await readJsonIfPresent(
      join(upgradeRoot, '_demo-pack', '.ok'),
      null,
    )
    assert(
      isDeepStrictEqual(markerMini2, {
        version: 'mini2',
        parts: [sha256(landscapeOnlyZip)],
      }),
      `.ok sella la versión y el sha256 de mini2 (fue ${JSON.stringify(markerMini2)})`,
    )
    assert(
      !existsSync(join(upgradeRoot, '_demo-pack', 'short')),
      'el árbol short/ del pack viejo no sobrevive al reemplazo',
    )
    assert(
      !existsSync(join(upgradeRoot, '_demo-pack.tmp')) &&
        (await downloadLeftovers(upgradeRoot)).length === 0,
      'no quedan temporales tras el reemplazo',
    )
    const manifestMini2 = resultOf(second.events)?.manifest
    assert(
      manifestMini2?.stories?.['9:16'] === undefined &&
        manifestMini2?.stories?.['16:9']?.styles?.length === 2,
      'el manifest de mini2 manda: sin stories[9:16]',
    )

    // mini2 → mini3: el camino real tras el bump (un pack sin Short instalado
    // en la máquina → uno con short/).
    const mini3Config = demoConfig({ packVersion: 'mini3' })
    const statusMini3 = await runSidecar('demo-status', {
      projectsRoot: upgradeRoot,
      config: mini3Config,
    })
    assert(
      resultOf(statusMini3.events)?.ready === false,
      'con mini2 instalado, la config de mini3 no está lista',
    )
    const third = await runSidecar('demo-prepare', {
      projectsRoot: upgradeRoot,
      config: mini3Config,
    })
    assert(
      last(third.events)?.type === 'job-completed' &&
        resultOf(third.events)?.manifest?.stories?.['9:16']?.styles?.length ===
          1,
      `demo-prepare re-instala mini3 con short/ (fue ${outcomeOf(third.events)})`,
    )
    const markerMini3 = await readJsonIfPresent(
      join(upgradeRoot, '_demo-pack', '.ok'),
      null,
    )
    assert(
      isDeepStrictEqual(markerMini3, {
        version: 'mini3',
        parts: [sha256(packZip)],
      }),
      `.ok sella la versión y el sha256 de mini3 (fue ${JSON.stringify(markerMini3)})`,
    )
    const seeded = await Promise.all(
      GEMS.map((gem) => readSeededStyle(upgradeRoot, gem.styleId)),
    )
    assert(
      seeded.every((style, index) => style?.name === GEMS[index].style.name),
      'las gemas sembradas sobreviven a los dos reemplazos',
    )

    // Un Short own-audio corre sobre el pack recién reemplazado.
    const created = await runSidecar('create-video-project', {
      projectsRoot: upgradeRoot,
      config: mini3Config,
      payload: projectPayload('Demo short tras upgrade', {
        demo: true,
        videoFormat: '9:16',
        narrationMode: 'own-audio',
      }),
    })
    const projectId = resultOf(created.events)?.projectId
    assert(
      typeof projectId === 'string',
      'create-video-project acepta el Short own-audio tras el upgrade',
    )
    const narrationFile = join(upgradeRoot, String(projectId), 'narration.mp3')
    if (projectId)
      await writeFile(narrationFile, Buffer.from('audio subido por la persona'))
    const run = await runSidecar('run-video-pipeline', {
      projectsRoot: upgradeRoot,
      config: mini3Config,
      payload: { projectId },
    })
    const scenes = await readScenes(projectId, upgradeRoot)
    assert(
      resultOf(run.events)?.status === 'completed' &&
        scenes[0]?.imagePrompt === 'normal short scene one',
      `Short own-audio completa desde short/normal (fue ${outcomeOf(run.events)})`,
    )
    assert(
      existsSync(narrationFile) &&
        (await readFile(narrationFile)).equals(FAKE_MP3),
      'narration.mp3 termina siendo el audio del pack',
    )
    assert(
      !run.events.some((event) => event.type === 'voice-progress'),
      'sin voice-progress con own-audio',
    )
  }

  // 20. validatePack: la manda el manifest. Cada pack roto falla con
  // demo_pack_incomplete por SU motivo (el diagnóstico lo nombra) y no deja
  // _demo-pack a medias.
  section('20. un pack v4 incompleto no se instala')
  {
    const brokenPacks = [
      {
        label: 'manifest-v3',
        expected: 'manifest.json is missing or malformed',
        tweak: ({ manifest }) => {
          manifest.version = 'v3'
        },
      },
      {
        label: 'animada-sin-video-animado',
        expected: 'normal/video_animado.mp4 is missing',
        tweak: ({ files }) => files.delete('normal/video_animado.mp4'),
      },
      {
        label: 'clip-que-no-esta',
        expected: `normal/animaciones/${ANIMATION_CLIP} is missing`,
        tweak: ({ files }) =>
          files.delete(`normal/animaciones/${ANIMATION_CLIP}`),
      },
      {
        label: 'avatar-sin-su-clip',
        expected: `jardineria/avatar/${AVATAR_CLIP} is missing`,
        tweak: ({ files }) => files.delete(`jardineria/avatar/${AVATAR_CLIP}`),
      },
      {
        label: 'avatar-sin-su-vista',
        expected: 'gemas/jardineria/avatar.jpg is missing',
        tweak: ({ files }) => files.delete('gemas/jardineria/avatar.jpg'),
      },
      // Ruling R8: la simulación copia `opciones` a options.avatar y la vista
      // del look de la historia al proyecto; sin ellas no hay avatar que
      // mostrar en el editor.
      {
        label: 'avatar-sin-opciones',
        expected: 'jardineria: avatar needs opciones',
        tweak: ({ manifest }) => {
          const withoutOptions = { ...AVATAR_MANIFEST }
          delete withoutOptions.opciones
          storyIn(manifest.historiasGema, 'jardineria').avatar = withoutOptions
        },
      },
      {
        label: 'avatar-con-opciones-que-no-son-un-objeto',
        expected: 'jardineria: avatar needs opciones',
        tweak: ({ manifest }) => {
          storyIn(manifest.historiasGema, 'jardineria').avatar = {
            ...AVATAR_MANIFEST,
            opciones: [AVATAR_MANIFEST.opciones],
          }
        },
      },
      {
        label: 'avatar-con-opciones-sin-look',
        expected: 'jardineria: avatar needs opciones',
        tweak: ({ manifest }) => {
          storyIn(manifest.historiasGema, 'jardineria').avatar = {
            ...AVATAR_MANIFEST,
            opciones: { ...AVATAR_MANIFEST.opciones, lookId: '' },
          }
        },
      },
      {
        label: 'avatar-sin-la-vista-del-look',
        expected: 'jardineria/avatar/look.<jpg|png|webp> is missing',
        tweak: ({ files }) => files.delete('jardineria/avatar/look.jpg'),
      },
      {
        // Dos apariciones: la primera con su clip y la segunda sin él.
        label: 'aparicion-sin-clip',
        expected: 'jardineria/escenas.json names an invalid avatar clip',
        tweak: ({ files }) => {
          const scenes = storyScenes('16:9', 'jardineria')
          const firstClip = 'scene_1.0123abcd.mp4'
          delete scenes[0].promptImagen
          scenes[0].nativo = {
            avatar: { ...scenes[1].nativo.avatar, clipFile: firstClip },
          }
          delete scenes[1].nativo.avatar.clipFile
          files.set(
            'jardineria/escenas.json',
            Buffer.from(JSON.stringify(scenes)),
          )
          files.set(`jardineria/avatar/${firstClip}`, FAKE_CLIP_MP4)
        },
      },
      // La simulación copia cada clip por su nombre: un bloque sin clip, o una
      // historia animada sin ninguno, no tiene qué reproducir.
      {
        label: 'clip-sin-nombre',
        expected: 'normal/escenas.json names an invalid animaciones clip',
        tweak: ({ files }) => {
          const scenes = storyScenes('16:9', 'normal')
          delete scenes[0].nativo.animations[0].clipFile
          files.set('normal/escenas.json', Buffer.from(JSON.stringify(scenes)))
        },
      },
      {
        label: 'animada-sin-clips',
        expected: 'normal/escenas.json has no animation clip',
        tweak: ({ files }) => {
          const scenes = storyScenes('16:9', 'normal')
          delete scenes[0].nativo.animations
          files.set('normal/escenas.json', Buffer.from(JSON.stringify(scenes)))
        },
      },
      {
        label: 'avatar-en-el-catalogo',
        expected: 'normal: only gem stories can carry an avatar',
        tweak: ({ manifest }) => {
          manifest.estilos[0].avatar = AVATAR_MANIFEST
        },
      },
      {
        label: 'historia-repetida',
        expected: 'lists story "normal" twice',
        tweak: ({ manifest }) => {
          manifest.estilos.push(manifest.estilos[0])
        },
      },
      {
        // Una gema `normal` cuya historia caería en la misma carpeta que la
        // del estilo `normal` del catálogo.
        label: 'gema-sobre-la-carpeta-del-catalogo',
        expected: 'lists story "normal" twice',
        tweak: ({ manifest, files }) => {
          manifest.gemas.push({ id: 'normal', styleId: 'demo-normal' })
          files.set(
            'gemas/normal/style.json',
            Buffer.from(JSON.stringify(GEMS[0].style)),
          )
          files.set('gemas/normal/sample-1.jpg', FAKE_JPG)
          manifest.historiasGema.push(manifestStory('16:9', 'normal'))
        },
      },
      {
        label: 'gema-sin-style',
        expected: 'gemas/jardineria/style.json',
        tweak: ({ files }) => files.delete('gemas/jardineria/style.json'),
      },
    ]
    for (const { label, expected, tweak } of brokenPacks) {
      const zip = buildZip(buildPackEntries({ tweak }))
      served.set(`/${label}.zip`, zip)
      const root = join(workspace, `Vimo-${label}`)
      await mkdir(root, { recursive: true })
      const { events } = await runSidecar('demo-prepare', {
        projectsRoot: root,
        config: demoConfig({ packParts: [servedPart(`/${label}.zip`)] }),
      })
      assert(
        codeOf(events) === 'demo_pack_incomplete' &&
          last(events)?.message?.includes(expected),
        `${label} → demo_pack_incomplete por «${expected}» (fue ${outcomeOf(events)})`,
      )
      assert(
        !existsSync(join(root, '_demo-pack')),
        `${label}: no deja _demo-pack a medias`,
      )
    }
  }

  // 21. Instalación por partes (spec v4 §3 «Descarga»): cada parte con su
  // SHA-256, el .ok con los de todas, el rename atómico y el avance total por
  // bytes con «parte X de N».
  section('21. demo-prepare instala el pack en dos partes')
  {
    const root = join(workspace, 'Vimo-parts')
    await mkdir(root, { recursive: true })
    // Zips a medias de una corrida que murió sin limpiar: la parte 9 de otra
    // versión y el zip único de un pack v3.
    const staleDownloads = [
      '_demo-pack.part-9.download',
      '_demo-pack.zip.download',
    ]
    for (const name of staleDownloads)
      await writeFile(join(root, name), 'zip a medias')
    const parts = serveParts('parts')
    const totalBytes = bytesOf(parts)
    const config = demoConfig({ packVersion: 'parts', packParts: parts })
    const progress = []
    const { events } = await runSidecar('demo-prepare', {
      projectsRoot: root,
      config,
      onEvent(event) {
        if (event.type === 'progress') progress.push(event)
      },
    })
    assert(
      last(events)?.type === 'job-completed',
      `instala las dos partes (fue ${outcomeOf(events)})`,
    )
    assert(
      parts.every((part) => requestsFor(part) === 1),
      `pide cada parte una vez (pedidos: ${parts.map(requestsFor).join(' y ')})`,
    )
    const installed = join(root, '_demo-pack')
    const marker = await readJsonIfPresent(join(installed, '.ok'), null)
    assert(
      isDeepStrictEqual(marker, {
        version: 'parts',
        parts: parts.map((part) => part.sha256),
      }),
      `el .ok sella la versión y el sha256 de cada parte, en orden (fue ${JSON.stringify(marker)})`,
    )
    assert(
      existsSync(join(installed, 'manifest.json')) &&
        existsSync(join(installed, 'short', 'normal', 'audio.mp3')),
      'las dos partes quedan juntas en _demo-pack: el manifest de la 1 y short/ de la 2',
    )
    assert(
      !existsSync(`${installed}.tmp`) &&
        (await downloadLeftovers(root)).length === 0,
      `al final no quedan el staging ni zips, tampoco los viejos (quedaron ${JSON.stringify(await downloadLeftovers(root))})`,
    )
    assert(
      existsSync(installed) &&
        (await readdir(installed)).every(
          (name) => name === '.ok' || !name.startsWith('.'),
        ),
      'el estado del staging no queda dentro del pack',
    )

    const percents = progress.map((event) => event.percent)
    assert(
      progress.length > 0 &&
        progress.every(
          (event) =>
            ['download', 'install'].includes(event.detail?.phase) &&
            [1, 2].includes(event.detail?.part) &&
            event.detail?.parts === 2,
        ),
      `cada progress trae phase, part y parts (fue ${JSON.stringify(progress.map((event) => event.detail))})`,
    )
    assert(
      isDeepStrictEqual(progressSteps(progress), [
        'download 1',
        'install 1',
        'download 2',
        'install 2',
      ]),
      `parte por parte, download antes que install (fue ${progressSteps(progress).join(', ')})`,
    )
    assert(
      isNonDecreasing(percents) &&
        percents.at(-1) === 100 &&
        percents.slice(0, -1).every((percent) => percent <= 99),
      `el porcentaje nunca va hacia atrás, se queda en 99 y termina en 100 (fue ${percents.join(',')})`,
    )
    const firstInstall = progress.find(
      (event) => event.detail?.phase === 'install',
    )
    assert(
      firstInstall?.percent === percentOf(parts[0].bytes, totalBytes),
      `el porcentaje es total por bytes: con la parte 1 bajada va en ${percentOf(parts[0].bytes, totalBytes)} (fue ${firstInstall?.percent})`,
    )

    assert(
      !existsSync(join(root, DEMO_LOCK_FILE)),
      'al terminar, demo-prepare suelta el lock',
    )

    const status = await runSidecar('demo-status', {
      projectsRoot: root,
      config,
    })
    const result = resultOf(status.events)
    assert(
      result?.ready === true &&
        result?.manifest?.stories?.['9:16']?.styles?.length === 1 &&
        result?.downloadBytes === totalBytes &&
        result?.downloadedBytes === totalBytes &&
        result?.requiredFreeBytes === 0,
      `demo-status queda listo con el pack entero y sin espacio por pedir (fue ready ${result?.ready}, ${result?.downloadedBytes} de ${result?.downloadBytes} bytes, pide ${result?.requiredFreeBytes})`,
    )
    // La misma versión con otras partes (otro armado): el .ok no las sella.
    const rebuilt = await runSidecar('demo-status', {
      projectsRoot: root,
      config: demoConfig({
        packVersion: 'parts',
        packParts: serveParts('parts-rebuilt', [
          otherFirstPartZip,
          secondPartZip,
        ]),
      }),
    })
    assert(
      resultOf(rebuilt.events)?.ready === false,
      'con otras partes en la misma versión, el pack instalado no cuenta',
    )
  }

  // 22. La red se corta a mitad de la parte 2: falla con
  // demo_download_failed, la parte 1 queda extraída y marcada en el staging,
  // y el próximo intento sigue desde la parte 2 sin volver a pedir la 1.
  section('22. corte a mitad de la parte 2: sigue desde la parte 2')
  {
    const root = join(workspace, 'Vimo-cut')
    await mkdir(root, { recursive: true })
    const staging = join(root, '_demo-pack.tmp')
    const parts = serveParts('cut')
    const totalBytes = bytesOf(parts)
    const config = demoConfig({ packVersion: 'cut', packParts: parts })
    const startPercent = percentOf(parts[0].bytes, totalBytes)
    interruptions.set(pathOf(parts[1]), 'stall')
    const cutProgress = []
    const first = await runSidecar('demo-prepare', {
      projectsRoot: root,
      config,
      onEvent(event) {
        if (event.type !== 'progress') return
        cutProgress.push(event)
        // La red se cae con la mitad de la parte 2 ya leída.
        if (event.detail?.part === 2 && event.percent > startPercent)
          cutStalled(pathOf(parts[1]))
      },
    })
    assert(
      codeOf(first.events) === 'demo_download_failed',
      `el corte → demo_download_failed (fue ${outcomeOf(first.events)})`,
    )
    assert(
      cutProgress.some(
        (event) =>
          event.detail?.phase === 'download' &&
          event.detail?.part === 2 &&
          event.percent > startPercent,
      ),
      `mientras baja la parte 2, el avance sube desde ${startPercent} (fue ${cutProgress.map((event) => `${event.detail?.phase} ${event.detail?.part}: ${event.percent}`).join(', ')})`,
    )
    assert(
      existsSync(join(staging, 'manifest.json')) &&
        !existsSync(join(staging, 'short')),
      'el staging conserva lo extraído de la parte 1 y nada de la 2',
    )
    assert(
      (await downloadLeftovers(root)).length === 0 &&
        !existsSync(join(root, '_demo-pack')),
      'el zip a medias de la parte 2 se borra y _demo-pack no existe',
    )
    const status = await runSidecar('demo-status', {
      projectsRoot: root,
      config,
    })
    const result = resultOf(status.events)
    assert(
      result?.ready === false &&
        result?.downloadBytes === totalBytes &&
        result?.downloadedBytes === parts[0].bytes,
      `tras el corte, demo-status cuenta la parte 1 marcada (fue ready ${result?.ready}, ${result?.downloadedBytes} de ${result?.downloadBytes} bytes; la parte 1 pesa ${parts[0].bytes})`,
    )
    // Lo que falta es la parte 2: extraerla más su zip, aunque la 1 (ya
    // instalada) sea más grande.
    assert(
      parts[0].bytes > parts[1].bytes &&
        result?.requiredFreeBytes === 2 * parts[1].bytes,
      `requiredFreeBytes cuenta solo las partes que faltan (fue ${result?.requiredFreeBytes}; la parte 2 pesa ${parts[1].bytes})`,
    )

    const progress = []
    const second = await runSidecar('demo-prepare', {
      projectsRoot: root,
      config,
      onEvent(event) {
        if (event.type === 'progress') progress.push(event)
      },
    })
    assert(
      last(second.events)?.type === 'job-completed',
      `el segundo intento termina (fue ${outcomeOf(second.events)})`,
    )
    assert(
      requestsFor(parts[0]) === 1 && requestsFor(parts[1]) === 2,
      `el segundo intento pide solo la parte 2 (pedidos: ${parts.map(requestsFor).join(' y ')})`,
    )
    assert(
      isDeepStrictEqual(progressSteps(progress), ['download 2', 'install 2']) &&
        progress[0]?.percent === startPercent &&
        isNonDecreasing(progress.map((event) => event.percent)),
      `el avance sigue en la parte 2 desde ${startPercent} y nunca va hacia atrás (fue ${progress.map((event) => `${event.detail?.phase} ${event.detail?.part}: ${event.percent}`).join(', ')})`,
    )
    const marker = await readJsonIfPresent(
      join(root, '_demo-pack', '.ok'),
      null,
    )
    assert(
      isDeepStrictEqual(
        marker?.parts,
        parts.map((part) => part.sha256),
      ) &&
        existsSync(join(root, '_demo-pack', 'short', 'normal', 'audio.mp3')) &&
        !existsSync(staging),
      'con la parte 2, el pack queda entero, sellado y sin staging',
    )
  }

  // 23. Cancelar a mitad de la parte 2 (la app se cierra): se borra solo el
  // zip en curso; el staging y la marca de la parte 1 quedan para seguir.
  section('23. cancelar a mitad de la parte 2')
  {
    const root = join(workspace, 'Vimo-cancel-parts')
    await mkdir(root, { recursive: true })
    const parts = serveParts('cancel')
    const config = demoConfig({ packVersion: 'cancel', packParts: parts })
    const partialFile = join(root, '_demo-pack.part-2.download')
    let partialBytes = 0
    interruptions.set(pathOf(parts[1]), 'stall')
    const first = await runSidecar('demo-prepare', {
      projectsRoot: root,
      config,
      // Cancela recién con bytes de la parte 2 en disco: así el zip en curso
      // existe y la prueba no pasa en vacío.
      cancelWhen(event) {
        if (event.type !== 'progress' || event.detail?.part !== 2) return false
        partialBytes = existsSync(partialFile) ? statSync(partialFile).size : 0
        return partialBytes > 0
      },
    })
    assert(
      codeOf(first.events) === 'cancelled',
      `cancelar a mitad de la parte 2 → cancelled (fue ${outcomeOf(first.events)})`,
    )
    assert(
      partialBytes > 0,
      'la cancelación llegó con la parte 2 a medias en disco',
    )
    assert(
      !existsSync(partialFile) && (await downloadLeftovers(root)).length === 0,
      'cancelar borra el zip en curso',
    )
    const status = await runSidecar('demo-status', {
      projectsRoot: root,
      config,
    })
    assert(
      resultOf(status.events)?.downloadedBytes === parts[0].bytes,
      `tras cancelar, la parte 1 sigue marcada (fue ${resultOf(status.events)?.downloadedBytes} bytes)`,
    )
    const second = await runSidecar('demo-prepare', {
      projectsRoot: root,
      config,
    })
    assert(
      last(second.events)?.type === 'job-completed' &&
        requestsFor(parts[0]) === 1 &&
        requestsFor(parts[1]) === 2,
      `al volver sigue con la parte 2 (fue ${outcomeOf(second.events)}; pedidos: ${parts.map(requestsFor).join(' y ')})`,
    )
  }

  // 24. Un staging de otra versión, o de otro armado de la misma, no sirve:
  // se borra entero y la instalación empieza de cero.
  section('24. staging de otra versión: se borra y empieza de cero')
  {
    // La versión `old`, cortada en la parte 2, deja la parte 1 marcada (con
    // el mismo SHA que la de ahora); además, un archivo suelto en el staging.
    const root = join(workspace, 'Vimo-stale')
    await mkdir(root, { recursive: true })
    const staging = join(root, '_demo-pack.tmp')
    const parts = serveParts('stale')
    interruptions.set(pathOf(parts[1]), 'cut')
    const old = await runSidecar('demo-prepare', {
      projectsRoot: root,
      config: demoConfig({ packVersion: 'old', packParts: parts }),
    })
    assert(
      codeOf(old.events) === 'demo_download_failed' &&
        existsSync(join(staging, 'manifest.json')),
      `la versión old deja la parte 1 en el staging (fue ${outcomeOf(old.events)})`,
    )
    if (existsSync(staging))
      await writeFile(join(staging, 'resto-de-old.txt'), 'de la versión old')

    const config = demoConfig({ packVersion: 'new', packParts: parts })
    const status = await runSidecar('demo-status', {
      projectsRoot: root,
      config,
    })
    assert(
      resultOf(status.events)?.downloadedBytes === 0,
      `un staging de otra versión no cuenta como bajado (fue ${resultOf(status.events)?.downloadedBytes} bytes)`,
    )
    const run = await runSidecar('demo-prepare', { projectsRoot: root, config })
    assert(
      last(run.events)?.type === 'job-completed',
      `la versión new se instala (fue ${outcomeOf(run.events)})`,
    )
    assert(
      requestsFor(parts[0]) === 2 && requestsFor(parts[1]) === 2,
      `vuelve a pedir las dos partes aunque la 1 tenía marca: era de otra versión (pedidos: ${parts.map(requestsFor).join(' y ')})`,
    )
    assert(
      !existsSync(join(root, '_demo-pack', 'resto-de-old.txt')) &&
        !existsSync(staging),
      'nada del staging viejo llega al pack',
    )

    // Otro armado de la misma versión: la marca de la parte 1 es de otro zip.
    const rebuildRoot = join(workspace, 'Vimo-rebuild')
    await mkdir(rebuildRoot, { recursive: true })
    const rebuildStaging = join(rebuildRoot, '_demo-pack.tmp')
    const firstBuild = serveParts('rebuild-a')
    interruptions.set(pathOf(firstBuild[1]), 'cut')
    const interrupted = await runSidecar('demo-prepare', {
      projectsRoot: rebuildRoot,
      config: demoConfig({ packVersion: 'rebuild', packParts: firstBuild }),
    })
    assert(
      codeOf(interrupted.events) === 'demo_download_failed' &&
        existsSync(join(rebuildStaging, 'manifest.json')),
      `el primer armado deja su parte 1 en el staging (fue ${outcomeOf(interrupted.events)})`,
    )
    const strayFile = 'resto-del-otro-armado.txt'
    if (existsSync(rebuildStaging))
      await writeFile(join(rebuildStaging, strayFile), 'del armado anterior')
    const secondBuild = serveParts('rebuild-b', [
      otherFirstPartZip,
      secondPartZip,
    ])
    const rebuilt = await runSidecar('demo-prepare', {
      projectsRoot: rebuildRoot,
      config: demoConfig({ packVersion: 'rebuild', packParts: secondBuild }),
    })
    assert(
      last(rebuilt.events)?.type === 'job-completed' &&
        secondBuild.every((part) => requestsFor(part) === 1),
      `el armado nuevo se instala pidiendo sus dos partes (fue ${outcomeOf(rebuilt.events)}; pedidos: ${secondBuild.map(requestsFor).join(' y ')})`,
    )
    assert(
      !existsSync(join(rebuildRoot, '_demo-pack', strayFile)) &&
        resultOf(rebuilt.events)?.manifest?.voice?.name ===
          'Abel de otro armado',
      'con la marca de otro zip en la misma versión, el staging se descarta entero y queda el armado nuevo',
    )
  }

  // 25. La parte 2 llega con otro SHA-256: falla con demo_pack_corrupt, su
  // zip se borra y la parte 1 sigue marcada; con la parte 2 buena, sigue.
  section('25. SHA distinto en la parte 2')
  {
    const root = join(workspace, 'Vimo-corrupt-part')
    await mkdir(root, { recursive: true })
    const staging = join(root, '_demo-pack.tmp')
    const parts = serveParts('corrupt')
    const corrupt = demoConfig({
      packVersion: 'corrupt',
      packParts: [parts[0], { ...parts[1], sha256: 'f'.repeat(64) }],
    })
    const run = await runSidecar('demo-prepare', {
      projectsRoot: root,
      config: corrupt,
    })
    assert(
      codeOf(run.events) === 'demo_pack_corrupt',
      `SHA distinto en la parte 2 → demo_pack_corrupt (fue ${outcomeOf(run.events)})`,
    )
    assert(
      (await downloadLeftovers(root)).length === 0 &&
        existsSync(join(staging, 'manifest.json')) &&
        !existsSync(join(staging, 'short')) &&
        !existsSync(join(root, '_demo-pack')),
      'el zip de la parte 2 se borra sin extraerse y el staging conserva la parte 1',
    )
    const status = await runSidecar('demo-status', {
      projectsRoot: root,
      config: corrupt,
    })
    assert(
      resultOf(status.events)?.downloadedBytes === parts[0].bytes,
      `la parte 1 sigue marcada (fue ${resultOf(status.events)?.downloadedBytes} bytes)`,
    )
    const retry = await runSidecar('demo-prepare', {
      projectsRoot: root,
      config: demoConfig({ packVersion: 'corrupt', packParts: parts }),
    })
    assert(
      last(retry.events)?.type === 'job-completed' &&
        requestsFor(parts[0]) === 1 &&
        requestsFor(parts[1]) === 2,
      `con la parte 2 buena, sigue desde ella (fue ${outcomeOf(retry.events)}; pedidos: ${parts.map(requestsFor).join(' y ')})`,
    )
  }

  // 26. Espacio en disco (Foco de revisión 5, Ruling R16): antes de cada
  // parte se exige lo que falta extraer, más la parte más grande de las que
  // faltan (su zip convive con lo extraído), más el margen; demo-status
  // informa ese mismo número. Sin espacio: demo_disk_full sin pedir nada.
  section('26. sin espacio en disco: demo_disk_full')
  {
    const all = [{ bytes: 300 }, { bytes: 500 }, { bytes: 200 }]
    // La de 500 ya instalada: la más grande de las que faltan es la de 300.
    const withoutLargest = [{ bytes: 300 }, { bytes: 200 }]
    assert(
      requiredFreeBytes(all, 1000) === 1000 + 500 + 1000 &&
        requiredFreeBytes(withoutLargest, 0) === 500 + 300 &&
        requiredFreeBytes([], 1000) === 0,
      `exige lo que falta, la más grande de las que faltan y el margen; nada si no falta nada (fue ${requiredFreeBytes(all, 1000)}, ${requiredFreeBytes(withoutLargest, 0)} y ${requiredFreeBytes([], 1000)})`,
    )
    assert(
      DEFAULT_PIPELINE_CONFIG.demo.packVersion === 'v4' &&
        DEFAULT_PIPELINE_CONFIG.demo.diskMarginBytes === 500 * 1024 * 1024,
      'por defecto: pack v4 y 500 MB de margen',
    )

    // El umbral es el espacio libre real del volumen: con el doble no
    // alcanza y con la mitad sí (ninguno de los dos cambia en segundos).
    const root = join(workspace, 'Vimo-disk-full')
    await mkdir(root, { recursive: true })
    const volume = await statfs(root)
    const freeSpace = volume.bavail * volume.bsize
    const parts = serveParts('disk')
    const partsNeed =
      bytesOf(parts) + Math.max(...parts.map((part) => part.bytes))
    const fullConfig = demoConfig({
      packVersion: 'disk',
      packParts: parts,
      diskMarginBytes: 2 * freeSpace,
    })
    const status = await runSidecar('demo-status', {
      projectsRoot: root,
      config: fullConfig,
    })
    const required = resultOf(status.events)?.requiredFreeBytes
    assert(
      required === partsNeed + 2 * freeSpace,
      `demo-status informa lo que falta, la parte más grande y el margen (fue ${required}, se esperaba ${partsNeed + 2 * freeSpace})`,
    )
    const { events } = await runSidecar('demo-prepare', {
      projectsRoot: root,
      config: fullConfig,
    })
    assert(
      codeOf(events) === 'demo_disk_full',
      `sin espacio → demo_disk_full (fue ${outcomeOf(events)})`,
    )
    const [, needs, has] =
      last(events)?.message?.match(/needs (\d+) free bytes .* has (\d+)/) ?? []
    assert(
      Number(needs) === required && Number(has) < Number(needs),
      `falla con el mismo número que informa demo-status y menos espacio libre que eso (fue «${last(events)?.message}»)`,
    )
    assert(
      parts.every((part) => requestsFor(part) === 0),
      `sin espacio no pide ninguna parte (pedidos: ${parts.map(requestsFor).join(' y ')})`,
    )
    assert(
      !existsSync(join(root, '_demo-pack')) &&
        !existsSync(join(root, '_demo-pack.tmp')) &&
        (await downloadLeftovers(root)).length === 0 &&
        !existsSync(join(root, DEMO_LOCK_FILE)),
      'sin espacio no deja nada en disco y suelta el lock',
    )

    const halfConfig = demoConfig({
      packVersion: 'disk',
      packParts: parts,
      diskMarginBytes: Math.max(0, Math.floor(freeSpace / 2) - partsNeed),
    })
    const halfStatus = await runSidecar('demo-status', {
      projectsRoot: root,
      config: halfConfig,
    })
    const halfRequired = resultOf(halfStatus.events)?.requiredFreeBytes
    const installed = await runSidecar('demo-prepare', {
      projectsRoot: root,
      config: halfConfig,
    })
    assert(
      halfRequired < freeSpace &&
        last(installed.events)?.type === 'job-completed',
      `con requiredFreeBytes por debajo del espacio libre (${halfRequired} de ${freeSpace}), instala (fue ${outcomeOf(installed.events)})`,
    )
  }

  // 27. Las partes del armador de punta a punta (Ruling R2): la fixture
  // nativa de la sección 18, armada sin recomprimir y en partes chicas, se
  // sirve por HTTP local; demo-prepare la instala y demo-status queda listo
  // con su manifest.
  section('27. demo-prepare instala las partes del armador')
  {
    const nativeRoot = join(workspace, BUILDER_NATIVE_FOLDER)
    const out = join(workspace, 'builder-out-install')
    const hasFixture = existsSync(join(nativeRoot, 'stories.json'))
    assert(hasFixture, 'la fixture nativa de la sección 18 está escrita')
    const build = hasFixture
      ? await runBuilder([
          ...builderArguments(nativeRoot, out),
          '--part-mb',
          '0.05',
          '--no-recompress',
        ])
      : { code: null, stdout: '', stderr: '' }
    assert(
      build.code === 0,
      `build-demo-pack --part-mb 0.05 --no-recompress termina en 0 (fue ${build.code}: ${build.stderr.trim()})`,
    )
    const listed = await readJsonIfPresent(join(out, 'parts.json'), [])
    const parts = []
    for (const part of Array.isArray(listed) ? listed : []) {
      const path = `/built/${part.file}`
      served.set(path, await readFile(join(out, part.file)))
      parts.push({
        url: `${baseUrl}${path}`,
        sha256: part.sha256,
        bytes: part.bytes,
      })
    }
    assert(
      parts.length >= 2,
      `parts.json lista al menos dos partes (fueron ${parts.length})`,
    )

    const root = join(workspace, 'Vimo-built')
    await mkdir(root, { recursive: true })
    const config = demoConfig({ packVersion: 'built', packParts: parts })
    const prepared = await runSidecar('demo-prepare', {
      projectsRoot: root,
      config,
    })
    assert(
      last(prepared.events)?.type === 'job-completed',
      `demo-prepare instala las partes del armador (fue ${outcomeOf(prepared.events)})`,
    )
    assert(
      parts.length > 0 && parts.every((part) => requestsFor(part) === 1),
      `pide cada parte del armador una vez (pedidos: ${parts.map(requestsFor).join(', ')})`,
    )
    const marker = await readJsonIfPresent(
      join(root, '_demo-pack', '.ok'),
      null,
    )
    assert(
      isDeepStrictEqual(marker, {
        version: 'built',
        parts: parts.map((part) => part.sha256),
      }),
      `el .ok sella los sha256 de parts.json (fue ${JSON.stringify(marker)})`,
    )
    const status = await runSidecar('demo-status', {
      projectsRoot: root,
      config,
    })
    const result = resultOf(status.events)
    const stories = result?.manifest?.stories
    assert(
      result?.ready === true &&
        idsOf(stories?.['16:9']?.styles) === JSON.stringify(['normal']) &&
        idsOf(stories?.['16:9']?.gems) === JSON.stringify(['jardineria']) &&
        idsOf(stories?.['9:16']?.gems) === JSON.stringify(['storytelling']),
      `demo-status queda listo con las historias del armador (fue ready ${result?.ready}: ${idsOf(stories?.['16:9']?.styles)}, ${idsOf(stories?.['16:9']?.gems)}, ${idsOf(stories?.['9:16']?.gems)})`,
    )
    assert(
      result?.downloadBytes === bytesOf(parts) &&
        result?.downloadedBytes === bytesOf(parts),
      `downloadBytes y downloadedBytes son la suma de parts.json (fue ${result?.downloadedBytes} de ${result?.downloadBytes})`,
    )
  }

  // 28. Ruling R15: un staging con todas sus partes que no forma un pack
  // válido se descarta solo si el pack está incompleto (sección 17). Con
  // cualquier otro error al validarlo (acá, no se puede listar: EMFILE) queda,
  // y el próximo intento instala sin volver a bajar.
  section('28. otro error al validar el staging: queda para seguir')
  {
    const root = join(workspace, 'Vimo-keep-staging')
    await mkdir(root, { recursive: true })
    const parts = serveParts('keep-staging', [packZip])
    const config = demoConfig({ packVersion: 'keep', packParts: parts })
    // El pack de prueba trae carpeta contenedora: para encontrarla,
    // demo-prepare lista el staging.
    const unlistable = await writeStub(
      'unlistable-staging',
      [
        'const readdir = fsPromises.readdir',
        'fsPromises.readdir = async (path, options) => {',
        "  if (String(path).endsWith('_demo-pack.tmp'))",
        `    throw ${systemErrorSource('EMFILE', 'too many open files, scandir')}`,
        '  return readdir(path, options)',
        '}',
      ].join('\n'),
    )
    const failed = await runSidecar('demo-prepare', {
      projectsRoot: root,
      config,
      preload: unlistable,
    })
    assert(
      codeOf(failed.events) === 'unknown' &&
        last(failed.events)?.message?.includes('EMFILE'),
      `sin poder listar el staging, demo-prepare falla con ese error (fue ${outcomeOf(failed.events)})`,
    )
    const status = await runSidecar('demo-status', {
      projectsRoot: root,
      config,
    })
    assert(
      existsSync(join(root, '_demo-pack.tmp', 'vimo-demo-pack-mini')) &&
        resultOf(status.events)?.downloadedBytes === packZip.length,
      `el staging y la marca de su única parte quedan (fue ${resultOf(status.events)?.downloadedBytes} bytes)`,
    )
    const retry = await runSidecar('demo-prepare', {
      projectsRoot: root,
      config,
    })
    assert(
      last(retry.events)?.type === 'job-completed' &&
        requestsFor(parts[0]) === 1,
      `el siguiente intento instala sin volver a bajar (fue ${outcomeOf(retry.events)}; pedidos: ${requestsFor(parts[0])})`,
    )
  }

  // 29. Dos demo-prepare a la vez en la misma raíz (cancelar y relanzar, o
  // la descarga en segundo plano que sigue tras recargar la vista): el lock
  // deja un solo instalador; el otro espera y encuentra el pack instalado.
  // Un lock que dejó un proceso muerto se toma.
  section('29. dos demo-prepare a la vez: una sola instalación')
  {
    const root = join(workspace, 'Vimo-concurrent')
    await mkdir(root, { recursive: true })
    const parts = serveParts('concurrent')
    const config = demoConfig({ packVersion: 'concurrent', packParts: parts })
    interruptions.set(pathOf(parts[1]), 'stall')
    let firstReachedPartTwo
    const firstAtPartTwo = new Promise((resolve) => {
      firstReachedPartTwo = resolve
    })
    let firstCompletedAt = Infinity
    const first = runSidecar('demo-prepare', {
      projectsRoot: root,
      config,
      onEvent(event) {
        if (event.type === 'progress' && event.detail?.part === 2)
          firstReachedPartTwo()
        if (event.type === 'job-completed') firstCompletedAt = Date.now()
      },
    })
    await firstAtPartTwo
    let secondStarted
    const secondRunning = new Promise((resolve) => {
      secondStarted = resolve
    })
    let secondStartedAt = Infinity
    const second = runSidecar('demo-prepare', {
      projectsRoot: root,
      config,
      onEvent(event) {
        if (event.type !== 'job-started') return
        secondStartedAt = Date.now()
        secondStarted()
      },
    })
    // El segundo ya corre y espera el lock (se le dan unos turnos) mientras
    // el primero sigue con la parte 2 colgada.
    await secondRunning
    await delay(1000)
    const lockWhileWaiting = await readJsonIfPresent(
      join(root, DEMO_LOCK_FILE),
      null,
    )
    const stagingWhileWaiting = existsSync(
      join(root, '_demo-pack.tmp', 'manifest.json'),
    )
    finishStalled(pathOf(parts[1]))
    const [firstRun, secondRun] = await Promise.all([first, second])
    assert(
      last(firstRun.events)?.type === 'job-completed' &&
        last(secondRun.events)?.type === 'job-completed',
      `los dos terminan (fueron ${outcomeOf(firstRun.events)} y ${outcomeOf(secondRun.events)})`,
    )
    assert(
      secondStartedAt < firstCompletedAt,
      'hubo competencia de verdad: el segundo arrancó antes de que el primero terminara',
    )
    assert(
      typeof lockWhileWaiting?.pid === 'number' && stagingWhileWaiting,
      'mientras el segundo espera, el lock es del primero y su staging sigue entero',
    )
    assert(
      requestsFor(parts[0]) === 1 && requestsFor(parts[1]) === 1,
      `una sola instalación: cada parte se pide una vez (pedidos: ${parts.map(requestsFor).join(' y ')})`,
    )
    assert(
      !secondRun.events.some((event) => event.type === 'progress') &&
        resultOf(secondRun.events)?.manifest?.version === 'v4',
      'el segundo no instala nada: espera y encuentra el pack instalado',
    )
    const marker = await readJsonIfPresent(
      join(root, '_demo-pack', '.ok'),
      null,
    )
    assert(
      isDeepStrictEqual(marker, {
        version: 'concurrent',
        parts: parts.map((part) => part.sha256),
      }) &&
        !existsSync(join(root, '_demo-pack.tmp')) &&
        !existsSync(join(root, DEMO_LOCK_FILE)) &&
        (await downloadLeftovers(root)).length === 0,
      'queda un pack sellado, sin staging, sin lock y sin zips',
    )

    const staleRoot = join(workspace, 'Vimo-stale-lock')
    await mkdir(staleRoot, { recursive: true })
    await writeFile(
      join(staleRoot, DEMO_LOCK_FILE),
      JSON.stringify({
        pid: await exitedProcessPid(),
        token: 'job-muerto',
        startedAt: new Date().toISOString(),
      }),
    )
    const stolen = await runSidecar('demo-prepare', {
      projectsRoot: staleRoot,
      config: demoConfig({
        packVersion: 'stale-lock',
        packParts: serveParts('stale-lock'),
      }),
    })
    assert(
      last(stolen.events)?.type === 'job-completed' &&
        !existsSync(join(staleRoot, DEMO_LOCK_FILE)),
      `un lock con el pid de un proceso muerto se toma y al final se suelta (fue ${outcomeOf(stolen.events)})`,
    )
  }

  // 30. El lock con tiempos cortos (los de producción son de minutos): un
  // dueño vivo que late hace esperar hasta demo_busy; uno muerto o sin
  // latido se toma (este, tras esperar varios latidos); uno que vuelve a
  // latir mientras se espera (despertó de una suspensión) no; un lock de
  // toma abandonado no traba; el dueño late y suelta solo su lock.
  section('30. el lock: espera, toma y latido')
  {
    const timing = {
      pollMs: 25,
      waitMs: 1200,
      heartbeatMs: 100,
      staleMs: 1000,
      staleConfirmMs: 350,
      stealStaleMs: 1000,
    }
    const root = join(workspace, 'Vimo-lock')
    await mkdir(root, { recursive: true })
    const lockFile = join(root, DEMO_LOCK_FILE)
    const writeForeignLock = (pid) =>
      writeFile(
        lockFile,
        JSON.stringify({
          pid,
          token: 'otro-job',
          startedAt: new Date().toISOString(),
        }),
      )
    const foreignToken = async () =>
      (await readJsonIfPresent(lockFile, null))?.token
    const touch = (path, at = new Date()) => utimes(path, at, at)
    const anHourAgo = () => new Date(Date.now() - 60 * 60_000)
    const beat = () => {
      void touch(lockFile).catch(() => undefined)
    }
    // Corre una acción con el lock: si corrió, con qué código falló y cuánto
    // tardó en entrar o en fallar.
    const tryLock = async (action = async () => undefined) => {
      const startedAt = Date.now()
      let ran = false
      try {
        await withDemoInstallLock(
          root,
          new AbortController().signal,
          async (signal) => {
            ran = true
            await action(signal)
          },
          timing,
        )
        return { ran, code: null, elapsed: Date.now() - startedAt }
      } catch (error) {
        return { ran, code: error?.code, elapsed: Date.now() - startedAt }
      }
    }

    await writeForeignLock(process.pid)
    const beating = setInterval(beat, timing.heartbeatMs)
    const busy = await tryLock()
    clearInterval(beating)
    assert(
      busy.code === 'demo_busy' &&
        !busy.ran &&
        busy.elapsed >= timing.waitMs &&
        (await foreignToken()) === 'otro-job',
      `un dueño vivo que late: demo_busy al tope, sin tocar su lock (fue ${JSON.stringify(busy)})`,
    )

    await writeForeignLock(await exitedProcessPid())
    const dead = await tryLock()
    assert(
      dead.ran && dead.elapsed < timing.waitMs && !existsSync(lockFile),
      `un dueño muerto: se toma enseguida y se suelta (fue ${JSON.stringify(dead)})`,
    )

    await writeForeignLock(process.pid)
    await touch(lockFile, anHourAgo())
    const silent = await tryLock()
    assert(
      silent.ran &&
        silent.elapsed >= timing.staleConfirmMs &&
        !existsSync(lockFile),
      `vivo pero sin latir hace una hora (un pid reusado): se toma tras esperar varios latidos (fue ${JSON.stringify(silent)})`,
    )

    await writeForeignLock(process.pid)
    await touch(lockFile, anHourAgo())
    let resumed
    const wakeUp = setTimeout(() => {
      beat()
      resumed = setInterval(beat, timing.heartbeatMs)
    }, 100)
    const woken = await tryLock()
    clearTimeout(wakeUp)
    clearInterval(resumed)
    assert(
      woken.code === 'demo_busy' &&
        !woken.ran &&
        (await foreignToken()) === 'otro-job',
      `sin latir hace una hora pero vuelve a latir mientras se lo mira: no se toma (fue ${JSON.stringify(woken)})`,
    )

    await writeForeignLock(await exitedProcessPid())
    const stealFile = join(root, DEMO_STEAL_LOCK_FILE)
    await writeFile(stealFile, 'un proceso que murió tomando el lock')
    await touch(stealFile, anHourAgo())
    const pastSteal = await tryLock()
    assert(
      pastSteal.ran && !existsSync(stealFile) && !existsSync(lockFile),
      `un lock de toma abandonado no traba la toma (fue ${JSON.stringify(pastSteal)})`,
    )

    let heartbeatAtStart = 0
    let heartbeatAtEnd = 0
    const working = await tryLock(async () => {
      heartbeatAtStart = (await stat(lockFile)).mtimeMs
      await delay(timing.heartbeatMs * 3.5)
      heartbeatAtEnd = (await stat(lockFile)).mtimeMs
    })
    assert(
      working.ran && heartbeatAtEnd > heartbeatAtStart && !existsSync(lockFile),
      'mientras trabaja, el dueño late (la fecha del lock avanza) y al final lo suelta',
    )
    const replaced = await tryLock(() => writeForeignLock(process.pid))
    assert(
      replaced.ran && (await foreignToken()) === 'otro-job',
      'al soltar, no borra un lock que ya no es suyo',
    )
    await rm(lockFile, { force: true })

    // R19 (a): otro job se queda con el lock mientras el dueño trabaja (lo
    // reescribe con su token). El dueño lo nota en el latido, deja de latir
    // sin tocar el lock ajeno (su fecha vieja no cambia) y corta su trabajo
    // con demo_busy.
    const lostWork = timing.heartbeatMs * 10
    const lost = await tryLock(async (signal) => {
      await writeForeignLock(process.pid)
      await touch(lockFile, anHourAgo())
      await delay(lostWork, undefined, { signal })
    })
    const foreignHeartbeat = (await stat(lockFile).catch(() => null))?.mtimeMs
    assert(
      lost.ran &&
        lost.code === 'demo_busy' &&
        lost.elapsed < lostWork &&
        (await foreignToken()) === 'otro-job' &&
        Date.now() - (foreignHeartbeat ?? Date.now()) > 30 * 60_000,
      `si otro job se queda con el lock, el dueño corta con demo_busy y no toca el lock ajeno (fue ${JSON.stringify(lost)})`,
    )
    await rm(lockFile, { force: true })

    // R19 (b): el lock abandonado cambia cada vez que se lo va a tomar (otro
    // job lo reescribe justo antes): la toma no borra nada, así que se espera
    // el turno normal y vale el tope, sin dar vueltas en seco.
    const deadPid = await exitedProcessPid()
    await writeForeignLock(deadPid)
    const realOpen = fsPromises.open
    let takeAttempts = 0
    fsPromises.open = async (path, ...rest) => {
      if (String(path).endsWith(DEMO_STEAL_LOCK_FILE) && takeAttempts < 500) {
        takeAttempts += 1
        await writeFile(
          lockFile,
          JSON.stringify({
            pid: deadPid,
            token: `otro-job-${takeAttempts}`,
            startedAt: new Date().toISOString(),
          }),
        )
      }
      return realOpen(path, ...rest)
    }
    syncBuiltinESMExports()
    let changing
    try {
      changing = await tryLock()
    } finally {
      fsPromises.open = realOpen
      syncBuiltinESMExports()
    }
    const maximumTurns = Math.ceil(timing.waitMs / timing.pollMs) + 5
    assert(
      changing.code === 'demo_busy' &&
        !changing.ran &&
        takeAttempts > 0 &&
        takeAttempts <= maximumTurns,
      `sin poder borrarlo, cada intento espera su turno y vale el tope (fue ${JSON.stringify(changing)}, ${takeAttempts} tomas; tope ${maximumTurns})`,
    )
    await rm(lockFile, { force: true })
  }

  // 31. Ruling R17 (Windows): la marca de una parte va antes de borrar su
  // zip, el borrado no frena la instalación y el .ok se escribe antes del
  // rename, así nada de lo bajado se pierde si la app muere o un antivirus
  // traba un archivo.
  section('31. zip trabado, cierre en seco y .ok antes del rename')
  {
    const killWhenRemoving = (pathEnd) =>
      [
        'const rm = fsPromises.rm',
        'fsPromises.rm = async (path, options) => {',
        `  if (String(path).endsWith(${pathEnd}))`,
        "    process.kill(process.pid, 'SIGKILL')",
        '  return rm(path, options)',
        '}',
      ].join('\n')

    // La app muere al borrar el zip de la parte 1, ya extraída: al volver,
    // la parte 1 no se vuelve a pedir, el zip que quedó se borra y el lock
    // del proceso muerto se toma.
    const crashRoot = join(workspace, 'Vimo-crash-zip')
    await mkdir(crashRoot, { recursive: true })
    const crashParts = serveParts('crash-zip')
    const crashConfig = demoConfig({
      packVersion: 'crash-zip',
      packParts: crashParts,
    })
    const crashed = await runSidecar('demo-prepare', {
      projectsRoot: crashRoot,
      config: crashConfig,
      preload: await writeStub(
        'crash-on-zip-delete',
        killWhenRemoving("'_demo-pack.part-1.download'"),
      ),
    })
    const crashStatus = await runSidecar('demo-status', {
      projectsRoot: crashRoot,
      config: crashConfig,
    })
    assert(
      crashed.signal === 'SIGKILL' &&
        existsSync(join(crashRoot, '_demo-pack.part-1.download')) &&
        existsSync(join(crashRoot, DEMO_LOCK_FILE)) &&
        resultOf(crashStatus.events)?.downloadedBytes === crashParts[0].bytes,
      `muerta al borrar el zip de la parte 1, la parte ya estaba marcada (fue ${crashed.signal}, ${resultOf(crashStatus.events)?.downloadedBytes} bytes)`,
    )
    const resumed = await runSidecar('demo-prepare', {
      projectsRoot: crashRoot,
      config: crashConfig,
    })
    assert(
      last(resumed.events)?.type === 'job-completed' &&
        requestsFor(crashParts[0]) === 1 &&
        requestsFor(crashParts[1]) === 1,
      `al volver toma el lock del proceso muerto y no vuelve a pedir la parte 1 (fue ${outcomeOf(resumed.events)}; pedidos: ${crashParts.map(requestsFor).join(' y ')})`,
    )
    assert(
      (await downloadLeftovers(crashRoot)).length === 0 &&
        !existsSync(join(crashRoot, DEMO_LOCK_FILE)),
      'la limpieza del inicio borra el zip que quedó',
    )

    // Un antivirus traba los zips: la instalación avisa y termina igual; el
    // próximo demo-prepare los borra sin volver a bajar nada.
    const lockedRoot = join(workspace, 'Vimo-locked-zip')
    await mkdir(lockedRoot, { recursive: true })
    const lockedParts = serveParts('locked-zip')
    const lockedConfig = demoConfig({
      packVersion: 'locked-zip',
      packParts: lockedParts,
    })
    const locked = await runSidecar('demo-prepare', {
      projectsRoot: lockedRoot,
      config: lockedConfig,
      preload: await writeStub(
        'locked-zips',
        [
          'const rm = fsPromises.rm',
          'fsPromises.rm = async (path, options) => {',
          "  if (String(path).endsWith('.download'))",
          `    throw ${systemErrorSource('EPERM', 'operation not permitted, unlink')}`,
          '  return rm(path, options)',
          '}',
        ].join('\n'),
      ),
    })
    const warnings = locked.events.filter(
      (event) =>
        event.type === 'log' &&
        event.level === 'warn' &&
        event.message?.includes('.download'),
    )
    assert(
      last(locked.events)?.type === 'job-completed' &&
        warnings.length === 2 &&
        (await downloadLeftovers(lockedRoot)).length === 2 &&
        existsSync(join(lockedRoot, '_demo-pack', '.ok')),
      `con los zips trabados, avisa por cada uno y la instalación termina igual (fue ${outcomeOf(locked.events)}; ${warnings.length} avisos)`,
    )
    const cleaned = await runSidecar('demo-prepare', {
      projectsRoot: lockedRoot,
      config: lockedConfig,
    })
    assert(
      last(cleaned.events)?.type === 'job-completed' &&
        (await downloadLeftovers(lockedRoot)).length === 0 &&
        lockedParts.every((part) => requestsFor(part) === 1),
      'el próximo demo-prepare borra los zips que quedaron sin volver a bajar nada',
    )

    // La app muere justo después del rename (al sacar el estado del staging
    // del pack): el .ok ya viajó con el rename, así que al volver el pack
    // cuenta como instalado y no se vuelve a bajar.
    const renameRoot = join(workspace, 'Vimo-crash-rename')
    await mkdir(renameRoot, { recursive: true })
    const renameParts = serveParts('crash-rename')
    const renameConfig = demoConfig({
      packVersion: 'crash-rename',
      packParts: renameParts,
    })
    const killed = await runSidecar('demo-prepare', {
      projectsRoot: renameRoot,
      config: renameConfig,
      preload: await writeStub(
        'crash-after-rename',
        killWhenRemoving(`['_demo-pack', '${STAGING_STATE_FILE}'].join(sep)`),
      ),
    })
    const sealed = await readJsonIfPresent(
      join(renameRoot, '_demo-pack', '.ok'),
      null,
    )
    assert(
      killed.signal === 'SIGKILL' &&
        !existsSync(join(renameRoot, '_demo-pack.tmp')) &&
        isDeepStrictEqual(sealed, {
          version: 'crash-rename',
          parts: renameParts.map((part) => part.sha256),
        }),
      `muerta tras el rename, el pack ya estaba sellado (fue ${killed.signal}, .ok ${JSON.stringify(sealed)})`,
    )
    const afterRename = await runSidecar('demo-prepare', {
      projectsRoot: renameRoot,
      config: renameConfig,
    })
    assert(
      last(afterRename.events)?.type === 'job-completed' &&
        renameParts.every((part) => requestsFor(part) === 1),
      `al volver, el pack cuenta como instalado y no se baja de nuevo (fue ${outcomeOf(afterRename.events)}; pedidos: ${renameParts.map(requestsFor).join(' y ')})`,
    )
  }

  // 32. Ruling R17 (c): el disco se llena a mitad de la parte 2 (ENOSPC), al
  // bajarla o al extraerla: demo_disk_full, como el chequeo previo, y la
  // parte 1 sigue instalada.
  section('32. disco lleno a mitad de una parte: demo_disk_full')
  {
    const noSpace = systemErrorSource(
      'ENOSPC',
      'no space left on device, write',
    )
    const cases = [
      {
        label: 'al bajar la parte 2',
        stub: [
          'const open = fsPromises.open',
          'fsPromises.open = async (path, ...rest) => {',
          '  const handle = await open(path, ...rest)',
          "  if (String(path).endsWith('_demo-pack.part-2.download'))",
          '    handle.write = async () => {',
          `      throw ${noSpace}`,
          '    }',
          '  return handle',
          '}',
        ],
      },
      {
        label: 'al extraer la parte 2',
        stub: [
          'const createWriteStream = fs.createWriteStream',
          'fs.createWriteStream = (path, options) => {',
          "  if (!String(path).includes(sep + 'short' + sep))",
          '    return createWriteStream(path, options)',
          '  return new Writable({',
          '    write(chunk, encoding, callback) {',
          `      callback(${noSpace})`,
          '    },',
          '  })',
          '}',
        ],
      },
    ]
    for (const [index, { label, stub }] of cases.entries()) {
      const name = `enospc-${index + 1}`
      const root = join(workspace, `Vimo-${name}`)
      await mkdir(root, { recursive: true })
      const parts = serveParts(name)
      const config = demoConfig({ packVersion: name, packParts: parts })
      const run = await runSidecar('demo-prepare', {
        projectsRoot: root,
        config,
        preload: await writeStub(name, stub.join('\n')),
      })
      assert(
        codeOf(run.events) === 'demo_disk_full',
        `ENOSPC ${label} → demo_disk_full (fue ${outcomeOf(run.events)})`,
      )
      const status = await runSidecar('demo-status', {
        projectsRoot: root,
        config,
      })
      assert(
        resultOf(status.events)?.downloadedBytes === parts[0].bytes &&
          (await downloadLeftovers(root)).length === 0 &&
          !existsSync(join(root, DEMO_LOCK_FILE)),
        `ENOSPC ${label}: la parte 1 sigue marcada, el zip se borra y se suelta el lock (fue ${resultOf(status.events)?.downloadedBytes} bytes)`,
      )
    }
  }

  // 33. Ruling R18: si el rename de `_demo-pack.tmp` a `_demo-pack` sigue
  // trabado, el árbol se copia, y la copia no es atómica: el `.ok` va al
  // final, así una copia cortada (la app muere en el último archivo) nunca
  // queda sellada. demo-status no la da por lista y el próximo demo-prepare
  // la repite desde el staging, sin volver a bajar.
  section('33. rename trabado: la copia nunca queda sellada a medias')
  {
    const root = join(workspace, 'Vimo-copy-fallback')
    await mkdir(root, { recursive: true })
    // Las gemas ya sembradas (una máquina que pasa del v3 al v4): así «listo»
    // depende solo del pack.
    for (const gem of GEMS) {
      await mkdir(join(root, '_styles', gem.styleId), { recursive: true })
      await writeFile(
        seededStyleFile(root, gem.styleId),
        JSON.stringify(gem.style),
      )
    }
    const parts = serveParts('copy-fallback')
    const config = demoConfig({
      packVersion: 'copy-fallback',
      packParts: parts,
    })
    const cutFile = ['short', 'normal', 'video_final.mp4']
    const crashed = await runSidecar('demo-prepare', {
      projectsRoot: root,
      config,
      preload: await writeStub(
        'copy-fallback-crash',
        [
          'const rename = fsPromises.rename',
          'fsPromises.rename = async (from, to) => {',
          "  if (String(to).endsWith(sep + '_demo-pack'))",
          `    throw ${systemErrorSource('EPERM', 'operation not permitted, rename')}`,
          '  return rename(from, to)',
          '}',
          'const cp = fsPromises.cp',
          'fsPromises.cp = async (source, destination, options) => {',
          '  await cp(source, destination, options)',
          `  const file = [destination, ...${JSON.stringify(cutFile)}].join(sep)`,
          '  const data = await fsPromises.readFile(file)',
          '  await fsPromises.writeFile(file, data.subarray(0, data.length >> 1))',
          "  process.kill(process.pid, 'SIGKILL')",
          '}',
        ].join('\n'),
      ),
    })
    const copiedFile = join(root, '_demo-pack', ...cutFile)
    assert(
      crashed.signal === 'SIGKILL' &&
        existsSync(copiedFile) &&
        statSync(copiedFile).size < FAKE_MP4.length &&
        !existsSync(join(root, '_demo-pack', '.ok')) &&
        existsSync(join(root, '_demo-pack.tmp', 'short')),
      `muerta en el último archivo de la copia: el pack queda sin .ok y el staging entero (fue ${crashed.signal})`,
    )
    const status = await runSidecar('demo-status', {
      projectsRoot: root,
      config,
    })
    assert(
      resultOf(status.events)?.ready === false &&
        resultOf(status.events)?.downloadedBytes === bytesOf(parts),
      `demo-status no da por lista la copia cortada y sigue viendo las dos partes marcadas (fue ${JSON.stringify(resultOf(status.events))})`,
    )
    const repaired = await runSidecar('demo-prepare', {
      projectsRoot: root,
      config,
    })
    const intact = await Promise.all(
      partEntries.map(async ([name, data]) =>
        (
          await readFile(join(root, '_demo-pack', name)).catch(() =>
            Buffer.alloc(0),
          )
        ).equals(data),
      ),
    )
    assert(
      last(repaired.events)?.type === 'job-completed' &&
        parts.every((part) => requestsFor(part) === 1) &&
        intact.every(Boolean) &&
        existsSync(join(root, '_demo-pack', '.ok')),
      `el próximo demo-prepare repite la copia desde el staging, sin volver a bajar, y cada archivo del pack queda entero (fue ${outcomeOf(repaired.events)}; pedidos: ${parts.map(requestsFor).join(' y ')}; ${intact.filter(Boolean).length} de ${intact.length} archivos enteros)`,
    )
  }

  // Las secciones 34 y 36 corren con cada copyFile del sidecar demorado: si
  // la simulación avisara un clip o una aparición antes de copiar su archivo,
  // el guard lo vería faltar al recibir el evento (sin la demora, la copia
  // ganaría la carrera igual). Con el orden correcto solo tarda un poco más.
  const COPY_DELAY_MS = 150
  const slowCopyStub = await writeStub(
    'slow-copy',
    [
      'const copyFile = fsPromises.copyFile',
      'fsPromises.copyFile = async (...args) => {',
      `  await new Promise((resolve) => setTimeout(resolve, ${COPY_DELAY_MS}))`,
      '  return copyFile(...args)',
      '}',
    ].join('\n'),
  )

  // 34. Animación del primer minuto (spec v4 §4 «Simulación»): con
  // animationMinutes y la historia animada, la fase `animation` corre como la
  // real (stages/animation/animation.ts y animation/generate.ts): el plan con
  // su fin y, por clip y en tandas, started, progress con porcentaje y ready
  // con su vista, con el clip ya en animations/. El render copia
  // video_animado.mp4.
  section('34. animación del primer minuto')
  {
    const projectId = await createProject('Demo animada', {
      demo: true,
      animationMinutes: 1,
    })
    const clipPath = join(
      projectsRoot,
      String(projectId),
      'animations',
      ANIMATION_CLIP,
    )
    const atReady = []
    let unknown = 0
    const { events } = await runSidecar('run-video-pipeline', {
      projectsRoot,
      config: demoConfig(),
      payload: { projectId },
      preload: slowCopyStub,
      onEvent(event) {
        if (!KNOWN_EVENTS.has(event.type)) unknown += 1
        if (event.type !== 'scene-animation-ready') return
        atReady.push(
          event.clipPath === clipPath &&
            existsSync(clipPath) &&
            statSync(clipPath).size > 0 &&
            event.animation?.status === 'ready' &&
            event.animation?.clipPath === clipPath,
        )
      },
    })
    assert(
      resultOf(events)?.status === 'completed',
      `con animationMinutes la demo completa (fue ${outcomeOf(events)})`,
    )
    assert(unknown === 0, 'con animación, ningún evento de tipo desconocido')
    const trace = stageTrace(events)
    assert(
      JSON.stringify(trace) ===
        JSON.stringify(expectedTrace({ avatar: false, animation: true })),
      `la fase animation corre entre las imágenes y el render (fue ${trace.join(', ')})`,
    )
    const stageAt = (type, stageId) =>
      events.findIndex(
        (event) => event.type === type && event.stageId === stageId,
      )
    const animationStarted = stageAt('stage-started', 'animation')
    const animationCompleted = stageAt('stage-completed', 'animation')
    const plan = events.find(
      (event, index) =>
        index > animationStarted && event.type === 'scenes-planned',
    )
    assert(
      plan?.animationEndSeconds === 2.3 &&
        plan.scenes.find((scene) => scene.id === 1)
          ?.animationRequestedSeconds === 6,
      `al arrancar la fase, scenes-planned trae el fin de la animación (el primer minuto, acotado al audio de 2.3 s) y las escenas marcadas (fue ${plan?.animationEndSeconds})`,
    )
    assert(
      !events.some(
        (event, index) =>
          index < animationStarted &&
          event.type === 'scenes-planned' &&
          event.animationEndSeconds !== undefined,
      ),
      'el scenes-planned del corte no trae animationEndSeconds',
    )
    const clipEvents = events
      .map((event, index) => ({ event, index }))
      .filter(({ event }) => event.type.startsWith('scene-animation-'))
    const started = clipEvents.find(
      ({ event }) => event.type === 'scene-animation-started',
    )
    const progress = clipEvents.filter(
      ({ event }) => event.type === 'scene-animation-progress',
    )
    const ready = clipEvents.find(
      ({ event }) => event.type === 'scene-animation-ready',
    )
    assert(
      started?.event.sceneId === 1 &&
        JSON.stringify(started.event.sceneIds) === '[1]' &&
        started.event.attempt === 1 &&
        started.event.animationId === 'anim_1' &&
        started.event.startSeconds === 0 &&
        started.event.endSeconds === 1.1,
      `scene-animation-started trae la escena que encabeza, las que cubre, el intento y el tramo del clip (fue ${JSON.stringify(started?.event)})`,
    )
    assert(
      progress.length > 0 &&
        progress.every(
          ({ event }) =>
            event.sceneId === 1 &&
            typeof event.percent === 'number' &&
            event.percent > 0 &&
            event.percent < 100,
        ) &&
        isNonDecreasing(progress.map(({ event }) => event.percent)),
      `scene-animation-progress trae un porcentaje que sube: la barra no espera la rampa de ~75 s de Kie (fue ${progress.map(({ event }) => event.percent).join(',')})`,
    )
    assert(
      started !== undefined &&
        ready !== undefined &&
        progress.length > 0 &&
        events.indexOf(plan) < started.index &&
        started.index < progress[0].index &&
        progress.at(-1).index < ready.index &&
        started.index > animationStarted &&
        ready.index < animationCompleted,
      'por clip: started, progress y ready, en orden, después del plan y dentro de la fase',
    )
    assert(
      atReady.length === 1 && atReady.every(Boolean),
      'el clip está en animations/ cuando llega su scene-animation-ready, y su vista lo da por listo',
    )
    assert(
      (await readFile(clipPath).catch(() => Buffer.alloc(0))).equals(
        FAKE_CLIP_MP4,
      ),
      'el clip del proyecto es el de animaciones/ de la historia',
    )
    const scenes = await readScenes(projectId)
    const packBlock = storyScenes('16:9', 'normal')[0].nativo.animations[0]
    assert(
      scenes[0]?.animationRequestedSeconds === 6 &&
        isDeepStrictEqual(scenes[0]?.animations, [packBlock]) &&
        scenes[1]?.animations === undefined,
      'scenes.json trae la marca y el bloque de animación del pack en la escena que encabeza el clip',
    )
    assert(
      (await readVideo(projectId)).equals(FAKE_ANIMATED_MP4),
      'con animación, el mp4 final es el video_animado.mp4 de la historia',
    )
    const metadata = await readMetadata(projectId)
    assert(
      JSON.stringify(metadata.completedStages) ===
        JSON.stringify(
          expectedCompletedStages({ avatar: false, animation: true }),
        ),
      `completedStages trae la animación (fue ${metadata.completedStages?.join(',')})`,
    )
    assert(
      metadata.state === 'completed' && playsFinalVideo(metadata),
      `con animación, el proyecto queda completed con renderTransitionVersion 1 y videoOutdated false (fue ${metadata.state}, ${metadata.renderTransitionVersion} y ${metadata.videoOutdated})`,
    )
  }

  // 35. Animación pedida en una historia sin variante animada (Foco de
  // revisión 4 del plan): la fase se saltea, no se restaura nada de la
  // animación y sale el video sin animar.
  section('35. animación pedida en una historia sin variante animada')
  {
    const projectId = await createProject('Demo 2d mono animada', {
      demo: true,
      customStyle: catalogStyle('2d-mono'),
      animationMinutes: 1,
    })
    const { events } = await runSidecar('run-video-pipeline', {
      projectsRoot,
      config: demoConfig(),
      payload: { projectId },
    })
    assert(
      resultOf(events)?.status === 'completed',
      `con animationMinutes y una historia sin variante animada la demo completa (fue ${outcomeOf(events)})`,
    )
    const trace = stageTrace(events)
    assert(
      JSON.stringify(trace) ===
        JSON.stringify(expectedTrace({ avatar: false, animation: false })),
      `la fase animation se saltea (fue ${trace.join(', ')})`,
    )
    assert(
      !events.some(
        (event) =>
          event.type.startsWith('scene-animation-') ||
          (event.type === 'scenes-planned' &&
            event.animationEndSeconds !== undefined),
      ),
      'sin variante animada no hay plan de animación ni eventos de clips',
    )
    assert(
      (await readVideo(projectId)).equals(FAKE_MP4),
      'el mp4 final es el video_final.mp4 de la historia',
    )
    assert(
      withoutAnimation(await readScenes(projectId)) &&
        !existsSync(join(projectsRoot, projectId, 'animations')),
      'scenes.json queda sin bloques ni marcas de animación y no se copia ningún clip',
    )
    const metadata = await readMetadata(projectId)
    assert(
      JSON.stringify(metadata.completedStages) ===
        JSON.stringify(
          expectedCompletedStages({ avatar: false, animation: false }),
        ) && playsFinalVideo(metadata),
      `completedStages sin animación y el editor reproduce el mp4 (fue ${metadata.completedStages?.join(',')}, ${metadata.renderTransitionVersion} y ${metadata.videoOutdated})`,
    )
  }

  // 36. Jardinería (spec v4 §1 y §4, Ruling R8): la fase `avatar` corre junto
  // con las imágenes con los eventos del carril real (avatar/render-scenes.ts y
  // avatar/lane.ts: started, sus fases y ready con la vista); la vista del look
  // y el clip están en avatar/ antes del evento que los nombra; project.json
  // trae options.avatar del pack y scenes.json, el bloque del avatar.
  section('36. Jardinería: el avatar junto con las imágenes')
  {
    const projectId = await createProject('Demo jardineria', {
      demo: true,
      customStyle: gemStyle(GEMS[1]),
    })
    const avatarDirectory = join(projectsRoot, String(projectId), 'avatar')
    const lookFile = join(avatarDirectory, 'look.jpg')
    const clipFile = join(avatarDirectory, AVATAR_CLIP)
    const seen = { planned: [], ready: [] }
    let unknown = 0
    const { events } = await runSidecar('run-video-pipeline', {
      projectsRoot,
      config: demoConfig(),
      payload: { projectId },
      preload: slowCopyStub,
      onEvent(event) {
        if (!KNOWN_EVENTS.has(event.type)) unknown += 1
        if (event.type === 'scenes-planned') {
          const appearance = event.scenes.find((scene) => scene.id === 2)
          seen.planned.push(
            appearance?.avatar?.status === 'planned' &&
              appearance.imagePath === lookFile &&
              appearance.imageStatus === 'ok' &&
              existsSync(lookFile),
          )
        }
        if (event.type === 'avatar-scene-ready') {
          const avatar = event.scene?.avatar
          seen.ready.push(
            avatar?.status === 'ready' &&
              avatar.clipPath === clipFile &&
              existsSync(clipFile) &&
              statSync(clipFile).size > 0 &&
              event.scene.imagePath === lookFile,
          )
        }
      },
    })
    assert(
      resultOf(events)?.status === 'completed',
      `con Jardinería la demo completa (fue ${outcomeOf(events)})`,
    )
    assert(unknown === 0, 'con avatar, ningún evento de tipo desconocido')
    const trace = stageTrace(events)
    assert(
      JSON.stringify(trace) ===
        JSON.stringify(expectedTrace({ avatar: true, animation: false })),
      `el avatar arranca junto con las imágenes y la animación se saltea (fue ${trace.join(', ')})`,
    )
    const stageAt = (type, stageId) =>
      events.findIndex(
        (event) => event.type === type && event.stageId === stageId,
      )
    const avatarEvents = events
      .map((event, index) => ({ event, index }))
      .filter(({ event }) => event.type.startsWith('avatar-scene-'))
    const steps = avatarEvents.map(({ event }) =>
      event.type === 'avatar-scene-progress' ? event.phase : event.type,
    )
    assert(
      JSON.stringify(steps) ===
        JSON.stringify([
          'avatar-scene-started',
          'audio',
          'upload',
          'render',
          'download',
          'normalize',
          'avatar-scene-ready',
        ]) && avatarEvents.every(({ event }) => event.sceneId === 2),
      `la aparición pasa por las fases del carril real, en orden (fue ${steps.join(', ')})`,
    )
    assert(
      avatarEvents.length > 0 &&
        avatarEvents[0].index > stageAt('stage-started', 'avatar') &&
        avatarEvents[0].index < stageAt('stage-completed', 'images') &&
        avatarEvents.at(-1).index < stageAt('stage-completed', 'avatar'),
      'el avatar corre mientras corren las imágenes: su primer evento llega antes de que terminen y todos caen dentro de su fase',
    )
    const planned = events.find((event) => event.type === 'avatar-planned')
    const plannedAt = events.indexOf(planned)
    assert(
      JSON.stringify(planned?.sceneIds) === '[2]' &&
        planned.dropped === AVATAR_MANIFEST.opciones.appearances - 1 &&
        plannedAt >
          events.findIndex((event) => event.type === 'scenes-planned') &&
        plannedAt < stageAt('stage-completed', 'scene-cuts'),
      `el corte anuncia avatar-planned con la escena del avatar y las apariciones pedidas que no están (fue ${JSON.stringify(planned)})`,
    )
    assert(
      seen.planned.length > 0 && seen.planned.every(Boolean),
      'la vista del look ya está en avatar/ cuando scenes-planned nombra la aparición: es su imagen fija',
    )
    assert(
      seen.ready.length === 1 && seen.ready.every(Boolean),
      'el clip de la aparición está en avatar/ cuando llega su avatar-scene-ready, y la vista la da por lista',
    )
    assert(
      !events.some(
        (event) =>
          (event.type === 'scene-prompt-ready' && event.scene?.id === 2) ||
          (event.type.startsWith('scene-image-') && event.sceneId === 2),
      ) &&
        events.some(
          (event) => event.type === 'scene-image-ready' && event.sceneId === 1,
        ),
      'la aparición no tiene prompt ni imagen; la otra escena sí',
    )
    const promptsProgress = events.filter(
      (event) => event.type === 'scene-prompts-progress',
    )
    assert(
      promptsProgress.length === 1 &&
        promptsProgress[0].ready === 2 &&
        promptsProgress[0].total === 2,
      `el avance de los prompts es sobre todas las escenas, con la aparición contada como lista, como el carril real (fue ${promptsProgress.map((event) => `${event.ready}/${event.total}`).join(', ')})`,
    )
    assert(
      (await readFile(lookFile).catch(() => Buffer.alloc(0))).equals(
        FAKE_JPG,
      ) &&
        (await readFile(clipFile).catch(() => Buffer.alloc(0))).equals(
          FAKE_CLIP_MP4,
        ),
      'avatar/ del proyecto trae la vista del look y el clip de la historia',
    )
    const scenes = await readScenes(projectId)
    assert(
      isDeepStrictEqual(
        scenes[1]?.avatar,
        storyScenes('16:9', 'jardineria')[1].nativo.avatar,
      ) &&
        scenes[1]?.imagePrompt === undefined &&
        scenes[0]?.imagePrompt === 'jardineria scene one' &&
        scenes[0]?.avatar === undefined,
      'scenes.json trae el bloque del avatar del pack en la aparición, sin prompt',
    )
    const metadata = await readMetadata(projectId)
    assert(
      isDeepStrictEqual(metadata.options?.avatar, AVATAR_MANIFEST.opciones),
      `project.json trae options.avatar con las opciones del pack (fue ${JSON.stringify(metadata.options?.avatar)})`,
    )
    assert(
      sameStages(
        metadata.completedStages,
        expectedCompletedStages({ avatar: true, animation: false }),
      ),
      `completedStages trae el avatar (fue ${metadata.completedStages?.join(',')})`,
    )
    assert(
      metadata.state === 'completed' &&
        playsFinalVideo(metadata) &&
        (await readVideo(projectId)).equals(FAKE_MP4),
      `con Jardinería sin animación sale el video_final.mp4 y el editor lo reproduce (fue ${metadata.state}, ${metadata.renderTransitionVersion} y ${metadata.videoOutdated})`,
    )
  }

  // 37. Cancelar con el avatar en curso: las dos fases que corren a la vez se
  // frenan, ninguna completa y el proyecto queda en pausa.
  section('37. cancelar con el avatar en curso')
  {
    const projectId = await createProject('Demo jardineria cancel', {
      demo: true,
      customStyle: gemStyle(GEMS[1]),
    })
    const { events } = await runSidecar('run-video-pipeline', {
      projectsRoot,
      config: demoConfig({ delayScale: 0.05 }),
      payload: { projectId },
      cancelOn: 'avatar-scene-started',
    })
    assert(
      codeOf(events) === 'cancelled',
      `cancelar con el avatar en curso termina en job-failed cancelled (fue ${outcomeOf(events)})`,
    )
    assert(
      !events.some(
        (event) =>
          event.type === 'job-completed' ||
          (event.type === 'stage-completed' &&
            (event.stageId === 'images' || event.stageId === 'avatar')),
      ),
      'ni las imágenes ni el avatar completan tras cancelar',
    )
    assert(
      (await readMetadata(projectId)).state === 'paused',
      'project.json queda paused',
    )
  }

  // 38. Un cuelgue de la red (Wi-Fi apagado, una conexión que queda abierta
  // sin datos; spec v4 §3, ADR-0061 «Modos de falla»): sin bytes nuevos por
  // `downloadIdleMs`, la parte falla enseguida con un código de la red y el
  // próximo demo-prepare sigue desde ella. El tope es por pausa, no total: una
  // parte lenta que sigue recibiendo bytes no se corta.
  section('38. la red se cuelga: tope de inactividad por parte')
  {
    const idleMs = 1_000
    // Al menos el tope (se esperó de verdad) y muy por debajo de
    // STALL_LIMIT_MS, que es cuando el servidor cerraría la conexión.
    const withinIdle = (elapsed) =>
      elapsed >= idleMs * 0.8 && elapsed < idleMs + 10_000

    // A mitad de la parte 2 la conexión queda abierta sin mandar nada.
    const root = join(workspace, 'Vimo-idle')
    await mkdir(root, { recursive: true })
    const parts = serveParts('idle')
    const config = demoConfig({
      packVersion: 'idle',
      packParts: parts,
      downloadIdleMs: idleMs,
    })
    const startPercent = percentOf(parts[0].bytes, bytesOf(parts))
    interruptions.set(pathOf(parts[1]), 'stall')
    let lastBytesAt = 0
    let failedAt = 0
    const hung = await runSidecar('demo-prepare', {
      projectsRoot: root,
      config,
      onEvent(event) {
        if (event.type === 'job-failed') failedAt = Date.now()
        if (event.type !== 'progress' || event.detail?.part !== 2) return
        if (event.percent > startPercent) lastBytesAt = Date.now()
      },
    })
    cutStalled(pathOf(parts[1]))
    const hungFor = failedAt - lastBytesAt
    assert(
      codeOf(hung.events) === 'demo_download_failed' &&
        lastBytesAt > 0 &&
        withinIdle(hungFor),
      `sin bytes nuevos por ${idleMs} ms → demo_download_failed en ese tope, sin esperar a que se cierre la conexión (fue ${outcomeOf(hung.events)} a los ${hungFor} ms de los últimos bytes de la parte 2)`,
    )
    assert(
      existsSync(join(root, '_demo-pack.tmp', 'manifest.json')) &&
        !existsSync(join(root, '_demo-pack.tmp', 'short')) &&
        (await downloadLeftovers(root)).length === 0 &&
        !existsSync(join(root, '_demo-pack')) &&
        !existsSync(join(root, DEMO_LOCK_FILE)),
      'tras el cuelgue la parte 1 queda en el staging, el zip a medias se borra y se suelta el lock',
    )
    const status = await runSidecar('demo-status', {
      projectsRoot: root,
      config,
    })
    assert(
      resultOf(status.events)?.downloadedBytes === parts[0].bytes,
      `demo-status cuenta la parte 1 marcada (fue ${resultOf(status.events)?.downloadedBytes} bytes; pesa ${parts[0].bytes})`,
    )
    const resumed = await runSidecar('demo-prepare', {
      projectsRoot: root,
      config,
    })
    assert(
      last(resumed.events)?.type === 'job-completed' &&
        requestsFor(parts[0]) === 1 &&
        requestsFor(parts[1]) === 2,
      `el próximo demo-prepare sigue desde la parte 2 (fue ${outcomeOf(resumed.events)}; pedidos: ${parts.map(requestsFor).join(' y ')})`,
    )

    // Una conexión lenta pero viva: la parte 1 llega en tandas, cada pausa
    // más corta que el tope y todas juntas más largas.
    const slowRoot = join(workspace, 'Vimo-slow')
    await mkdir(slowRoot, { recursive: true })
    const slowParts = serveParts('slow')
    interruptions.set(pathOf(slowParts[0]), 'trickle')
    let firstBytesAt = 0
    let installAt = 0
    const slow = await runSidecar('demo-prepare', {
      projectsRoot: slowRoot,
      config: demoConfig({
        packVersion: 'slow',
        packParts: slowParts,
        downloadIdleMs: idleMs,
      }),
      onEvent(event) {
        if (event.type !== 'progress' || event.detail?.part !== 1) return
        if (event.detail.phase === 'download' && event.percent > 0)
          firstBytesAt ||= Date.now()
        if (event.detail.phase === 'install') installAt ||= Date.now()
      },
    })
    const slowFor = installAt - firstBytesAt
    assert(
      last(slow.events)?.type === 'job-completed' &&
        firstBytesAt > 0 &&
        slowFor > idleMs &&
        slowParts.every((part) => requestsFor(part) === 1),
      `una parte que tarda más que el tope pero sigue recibiendo bytes no se corta (fue ${outcomeOf(slow.events)}; la parte 1 tardó ${slowFor} ms con un tope de ${idleMs})`,
    )

    // Un servidor que acepta el pedido y no contesta nada.
    const muteRoot = join(workspace, 'Vimo-mute')
    await mkdir(muteRoot, { recursive: true })
    const muteParts = serveParts('mute')
    interruptions.set(pathOf(muteParts[0]), 'mute')
    let requestedAt = 0
    let mutedAt = 0
    const muted = await runSidecar('demo-prepare', {
      projectsRoot: muteRoot,
      config: demoConfig({
        packVersion: 'mute',
        packParts: muteParts,
        downloadIdleMs: idleMs,
      }),
      onEvent(event) {
        if (event.type === 'progress') requestedAt ||= Date.now()
        if (event.type === 'job-failed') mutedAt = Date.now()
      },
    })
    cutStalled(pathOf(muteParts[0]))
    const mutedFor = mutedAt - requestedAt
    assert(
      codeOf(muted.events) === 'demo_offline' &&
        requestedAt > 0 &&
        withinIdle(mutedFor),
      `un servidor que no contesta → demo_offline en el tope de inactividad (fue ${outcomeOf(muted.events)} a los ${mutedFor} ms del pedido)`,
    )
    assert(
      (await downloadLeftovers(muteRoot)).length === 0 &&
        !existsSync(join(muteRoot, DEMO_LOCK_FILE)),
      'sin respuesta no quedan zips ni el lock',
    )
  }

  // 39. demo-status dice si un demo-prepare vivo tiene el lock de la
  // instalación: la puerta que espera lo usa para relanzar cuando nadie baja.
  // Sí mientras uno instala; no sin lock, con el pid de un proceso muerto ni
  // con un lock que no late hace rato.
  section('39. demo-status dice si alguien instala')
  {
    const root = join(workspace, 'Vimo-installing')
    await mkdir(root, { recursive: true })
    const parts = serveParts('installing')
    const config = demoConfig({ packVersion: 'installing', packParts: parts })
    const installingNow = async () =>
      resultOf(
        (await runSidecar('demo-status', { projectsRoot: root, config }))
          .events,
      )?.installing

    const before = await installingNow()
    interruptions.set(pathOf(parts[1]), 'stall')
    let reachedPartTwo
    const atPartTwo = new Promise((resolve) => {
      reachedPartTwo = resolve
    })
    const installing = runSidecar('demo-prepare', {
      projectsRoot: root,
      config,
      onEvent(event) {
        if (event.type === 'progress' && event.detail?.part === 2)
          reachedPartTwo()
      },
    })
    await atPartTwo
    const during = await installingNow()
    finishStalled(pathOf(parts[1]))
    const installed = await installing
    const after = await installingNow()
    assert(
      before === false &&
        during === true &&
        last(installed.events)?.type === 'job-completed' &&
        after === false,
      `sin lock nadie instala; mientras demo-prepare trabaja, sí; al terminar, no (fue ${before}, ${during} y ${after})`,
    )

    const lockFile = join(root, DEMO_LOCK_FILE)
    const writeLock = async (pid, heartbeat = new Date()) => {
      await writeFile(
        lockFile,
        JSON.stringify({
          pid,
          token: 'otro-job',
          startedAt: new Date().toISOString(),
        }),
      )
      await utimes(lockFile, heartbeat, heartbeat)
    }
    await writeLock(await exitedProcessPid())
    const dead = await installingNow()
    await writeLock(process.pid)
    const alive = await installingNow()
    await writeLock(process.pid, new Date(Date.now() - 60 * 60_000))
    const silent = await installingNow()
    await rm(lockFile, { force: true })
    assert(
      dead === false && alive === true && silent === false,
      `un lock con su proceso muerto o sin latido hace una hora no cuenta; uno vivo que late, sí (fue ${dead}, ${alive} y ${silent})`,
    )
  }

  // 40. El disco lleno fuera de bajar y extraer: un ENOSPC al copiar el pack
  // a su lugar (con el rename trabado) o al sembrar las gemas también es
  // demo_disk_full, y lo hecho se conserva. Con el pack ya instalado,
  // demo-prepare borra el staging que haya quedado (su borrado falló tras la
  // copia).
  section(
    '40. disco lleno al mover el pack o al sembrar, y el staging que quedó',
  )
  {
    const noSpace = systemErrorSource(
      'ENOSPC',
      'no space left on device, write',
    )

    const copyRoot = join(workspace, 'Vimo-enospc-copy')
    await mkdir(copyRoot, { recursive: true })
    const copyParts = serveParts('enospc-copy')
    const copyConfig = demoConfig({
      packVersion: 'enospc-copy',
      packParts: copyParts,
    })
    const copyFull = await runSidecar('demo-prepare', {
      projectsRoot: copyRoot,
      config: copyConfig,
      preload: await writeStub(
        'enospc-copy',
        [
          'const rename = fsPromises.rename',
          'fsPromises.rename = async (from, to) => {',
          "  if (String(to).endsWith(sep + '_demo-pack'))",
          `    throw ${systemErrorSource('EPERM', 'operation not permitted, rename')}`,
          '  return rename(from, to)',
          '}',
          'fsPromises.cp = async () => {',
          `  throw ${noSpace}`,
          '}',
        ].join('\n'),
      ),
    })
    assert(
      codeOf(copyFull.events) === 'demo_disk_full' &&
        !existsSync(join(copyRoot, '_demo-pack', '.ok')) &&
        existsSync(join(copyRoot, '_demo-pack.tmp', 'short')),
      `ENOSPC al copiar el pack a su lugar → demo_disk_full, sin sellar y con el staging entero (fue ${outcomeOf(copyFull.events)})`,
    )
    const moved = await runSidecar('demo-prepare', {
      projectsRoot: copyRoot,
      config: copyConfig,
    })
    assert(
      last(moved.events)?.type === 'job-completed' &&
        copyParts.every((part) => requestsFor(part) === 1),
      `con espacio, el próximo intento mueve el pack sin volver a bajarlo (fue ${outcomeOf(moved.events)}; pedidos: ${copyParts.map(requestsFor).join(' y ')})`,
    )

    const seedRoot = join(workspace, 'Vimo-enospc-seed')
    await mkdir(seedRoot, { recursive: true })
    const seedParts = serveParts('enospc-seed')
    const seedConfig = demoConfig({
      packVersion: 'enospc-seed',
      packParts: seedParts,
    })
    const seedFull = await runSidecar('demo-prepare', {
      projectsRoot: seedRoot,
      config: seedConfig,
      preload: await writeStub(
        'enospc-seed',
        [
          'const copyFile = fsPromises.copyFile',
          'fsPromises.copyFile = async (source, destination, ...rest) => {',
          "  if (String(destination).includes(sep + '_styles' + sep))",
          `    throw ${noSpace}`,
          '  return copyFile(source, destination, ...rest)',
          '}',
        ].join('\n'),
      ),
    })
    assert(
      codeOf(seedFull.events) === 'demo_disk_full' &&
        existsSync(join(seedRoot, '_demo-pack', '.ok')),
      `ENOSPC al sembrar las gemas → demo_disk_full, con el pack ya instalado (fue ${outcomeOf(seedFull.events)})`,
    )
    const seeded = await runSidecar('demo-prepare', {
      projectsRoot: seedRoot,
      config: seedConfig,
    })
    const seededGems = await Promise.all(
      GEMS.map((gem) => readSeededStyle(seedRoot, gem.styleId)),
    )
    assert(
      last(seeded.events)?.type === 'job-completed' &&
        seededGems.every(Boolean) &&
        seedParts.every((part) => requestsFor(part) === 1),
      `con espacio, el próximo intento siembra las gemas sin volver a bajar el pack (fue ${outcomeOf(seeded.events)})`,
    )

    const leftover = join(seedRoot, '_demo-pack.tmp')
    await mkdir(join(leftover, 'short'), { recursive: true })
    await writeFile(join(leftover, 'short', 'resto.mp4'), FAKE_MP4)
    const cleaned = await runSidecar('demo-prepare', {
      projectsRoot: seedRoot,
      config: seedConfig,
    })
    assert(
      last(cleaned.events)?.type === 'job-completed' &&
        !existsSync(leftover) &&
        seedParts.every((part) => requestsFor(part) === 1),
      `con el pack instalado, demo-prepare borra el staging que quedó sin bajar nada (fue ${outcomeOf(cleaned.events)})`,
    )
  }
} finally {
  server.close()
  // Una respuesta colgada a propósito (`stall`) no frena el cierre.
  server.closeAllConnections()
  await rm(workspace, { recursive: true, force: true })
}

process.stdout.write(
  `\n${checks - failures.length}/${checks} chequeos en verde\n`,
)
if (failures.length > 0) {
  process.stdout.write(
    `FALLARON ${failures.length}:\n${failures.map((item) => `  - ${item}`).join('\n')}\n`,
  )
  process.exit(1)
}
