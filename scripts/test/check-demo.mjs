// Guard ejecutable del modo demo (ADR-0029, ADR-0030; pack v4 en
// docs/handoff/2026-10-14-demo-v4/design.md §3). Sin app y sin red: genera un
// pack mínimo v4 en una carpeta temporal (las historias que lista el
// manifest: dos estilos del catálogo y dos gemas, una historia animada con un
// clip y una con avatar, 2 escenas por historia, archivos diminutos), lo
// empaqueta en un zip en memoria, lo sirve por HTTP local y corre los
// subcomandos del sidecar contra una carpeta raíz temporal. Cada sección
// asserta un invariante de la ADR o de la spec.
//
//   pnpm check:demo
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32 } from 'node:zlib'

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
  return files
}

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

// ── Servidor HTTP local que sirve los zips ───────────────────────────────────
const packZip = buildZip(buildPackEntries())
const brokenZip = buildZip(buildPackEntries({ withManifest: false }))
const landscapeOnlyZip = buildZip(buildPackEntries({ withShort: false }))
const shortIncompleteZip = buildZip(
  buildPackEntries({
    tweak: ({ files }) => files.delete('short/normal/video_final.mp4'),
  }),
)
const served = new Map([
  ['/pack.zip', packZip],
  ['/broken.zip', brokenZip],
  ['/landscape-only.zip', landscapeOnlyZip],
  ['/short-incomplete.zip', shortIncompleteZip],
])
let hits = 0
const server = createServer((request, response) => {
  hits += 1
  const body = served.get(request.url) ?? null
  if (!body) {
    response.statusCode = 404
    response.end()
    return
  }
  response.setHeader('Content-Type', 'application/zip')
  response.setHeader('Content-Length', String(body.length))
  response.end(body)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const baseUrl = `http://127.0.0.1:${server.address().port}`

// ── Corridas del sidecar ─────────────────────────────────────────────────────
function demoConfig(overrides = {}) {
  return {
    demo: {
      packVersion: 'mini',
      packUrl: `${baseUrl}/pack.zip`,
      packSha256: sha256(packZip),
      delayScale: 0,
      ...overrides,
    },
  }
}

// Lanza `node pipeline/main.ts <subcomando>` con el job por stdin y devuelve
// los eventos NDJSON. `onEvent` corre en el momento en que cada evento llega
// (para chequear el disco justo entonces); `cancelOn` manda la cancelación
// al ver ese tipo de evento.
function runSidecar(
  subcommand,
  { projectsRoot, payload, config, onEvent, cancelOn },
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
    const child = spawn(
      process.execPath,
      [join(repoRoot, 'pipeline/main.ts'), subcommand],
      {
        stdio: ['pipe', 'pipe', 'inherit'],
      },
    )
    const events = []
    let buffer = ''
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
          if (cancelOn && event.type === cancelOn)
            child.stdin.write('{"type":"cancel"}\n')
        }
        index = buffer.indexOf('\n')
      }
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ events, code }))
    child.stdin.write(`${JSON.stringify(job)}\n`)
  })
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
      marker?.version === 'mini' && marker?.sha256 === sha256(packZip),
      'el .ok sella versión y sha256',
    )
    assert(
      existsSync(join(packRoot, 'manifest.json')),
      'la raíz anidada del zip quedó como raíz del pack',
    )
    assert(
      !existsSync(`${packRoot}.tmp`) &&
        !existsSync(join(projectsRoot, '_demo-pack.zip.download')),
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

  // 5. Fallos de descarga: SHA distinto, zip sin manifest, sin red.
  section('5. fallos de preparación')
  {
    const otherRoot = join(workspace, 'Vimo-broken')
    await mkdir(otherRoot, { recursive: true })
    let run = await runSidecar('demo-prepare', {
      projectsRoot: otherRoot,
      config: demoConfig({ packSha256: 'deadbeef' }),
    })
    assert(
      codeOf(run.events) === 'demo_pack_corrupt',
      `SHA distinto → demo_pack_corrupt (fue ${codeOf(run.events)})`,
    )
    assert(
      !existsSync(join(otherRoot, '_demo-pack')) &&
        !existsSync(join(otherRoot, '_demo-pack.tmp')),
      'un pack corrupto no deja rastros',
    )
    run = await runSidecar('demo-prepare', {
      projectsRoot: otherRoot,
      config: demoConfig({
        packUrl: `${baseUrl}/broken.zip`,
        packSha256: sha256(brokenZip),
      }),
    })
    assert(
      codeOf(run.events) === 'demo_pack_incomplete',
      `zip sin manifest → demo_pack_incomplete (fue ${codeOf(run.events)})`,
    )
    run = await runSidecar('demo-prepare', {
      projectsRoot: otherRoot,
      config: demoConfig({ packUrl: 'http://127.0.0.1:9/pack.zip' }),
    })
    assert(
      codeOf(run.events) === 'demo_offline',
      `sin servidor → demo_offline (fue ${codeOf(run.events)})`,
    )
    run = await runSidecar('demo-prepare', {
      projectsRoot: otherRoot,
      config: demoConfig({ packUrl: `${baseUrl}/missing.zip` }),
    })
    assert(
      codeOf(run.events) === 'demo_download_failed',
      `404 → demo_download_failed (fue ${codeOf(run.events)})`,
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

  const STAGE_IDS = [
    'voice',
    'transcription',
    'scene-cuts',
    'scene-prompts',
    'images',
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
    'voice-progress',
    'bgm-progress',
    'render-progress',
    'awaiting-scene-confirmation',
    'job-completed',
    'job-failed',
  ])
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

  // 8. La simulación completa: orden de fases, archivos antes que eventos, metadata final.
  section('8. run-video-pipeline con options.demo')
  {
    const projectId = await createProject('Demo normal', { demo: true })
    assert(
      typeof projectId === 'string',
      'create-video-project acepta demo:true',
    )
    const started = []
    const filesAtEvent = []
    let unknown = 0
    const { events } = await runSidecar('run-video-pipeline', {
      projectsRoot,
      config: demoConfig(),
      payload: { projectId },
      onEvent(event) {
        if (!KNOWN_EVENTS.has(event.type)) unknown += 1
        if (event.type === 'stage-started') started.push(event.stageId)
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
    assert(
      JSON.stringify(started) === JSON.stringify(STAGE_IDS),
      `las fases arrancan en el orden de STAGE_IDS (fue ${started.join(',')})`,
    )
    assert(
      events.filter((event) => event.type === 'stage-completed').length === 6,
      'las seis fases completan',
    )
    assert(unknown === 0, 'ningún evento de tipo desconocido')
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
      JSON.stringify(metadata.completedStages) === JSON.stringify(STAGE_IDS),
      'completedStages trae las seis fases',
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
      `customStyle.catalogStyleId 2d-mono copia la historia 2d-mono (fue ${outcomeOf(catalogRun.events)})`,
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
      packUrl: `${baseUrl}/landscape-only.zip`,
      packSha256: sha256(landscapeOnlyZip),
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
        packUrl: `${baseUrl}/short-incomplete.zip`,
        packSha256: sha256(shortIncompleteZip),
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
  }

  // (La 18, el armador del pack, vuelve reescrita para el formato v4 junto
  // con el armador.)

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
      packUrl: `${baseUrl}/landscape-only.zip`,
      packSha256: sha256(landscapeOnlyZip),
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
      markerMini2?.version === 'mini2' &&
        markerMini2?.sha256 === sha256(landscapeOnlyZip),
      '.ok sella la versión y el sha256 de mini2',
    )
    assert(
      !existsSync(join(upgradeRoot, '_demo-pack', 'short')),
      'el árbol short/ del pack viejo no sobrevive al reemplazo',
    )
    assert(
      !existsSync(join(upgradeRoot, '_demo-pack.tmp')) &&
        !existsSync(join(upgradeRoot, '_demo-pack.zip.download')),
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
      markerMini3?.version === 'mini3' &&
        markerMini3?.sha256 === sha256(packZip),
      '.ok sella la versión y el sha256 de mini3',
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
        config: demoConfig({
          packUrl: `${baseUrl}/${label}.zip`,
          packSha256: sha256(zip),
        }),
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
} finally {
  server.close()
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
