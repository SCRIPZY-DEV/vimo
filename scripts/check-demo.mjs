// Guard ejecutable del modo demo (ADR-0027). Sin app y sin red: genera un
// pack mínimo en una carpeta temporal (formato v2 del origen más el árbol
// `short/` del v3 —ADR-0028—, 2 escenas por estilo, archivos diminutos), lo
// empaqueta en un zip en memoria, lo sirve por HTTP local y corre los
// subcomandos del sidecar contra una carpeta raíz temporal. Cada sección
// asserta un invariante de la ADR.
//
//   pnpm check:demo
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32 } from 'node:zlib'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
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

// ── Fixture: el pack mínimo (formato v2 del origen) ──────────────────────────
const CATALOG_STYLES = ['pov_stickman', 'normal', 'cartoon']
const GEM_FOLDER = 'storytelling'
const STORIES = {
  pov_stickman: 'Vida en el espacio',
  normal: 'El océano profundo',
  cartoon: 'Un día siendo abeja',
  storytelling: 'La luz del farero',
}
const SHORT_STORIES = {
  pov_stickman: 'Tu primer día en Marte',
  normal: 'Cómo nace una tormenta',
  cartoon: 'El gato que quería ser panadero',
  storytelling: 'El último tren a casa',
}
const FAKE_JPG = Buffer.from(
  'ffd8ffe000104a46494600010100000100010000ffd9',
  'hex',
)
const FAKE_MP3 = Buffer.from('not-a-real-mp3-but-enough-for-the-guard')
const FAKE_MP4 = Buffer.from('not-a-real-mp4-but-enough-for-the-guard')

// Los archivos de una historia. `prefix` vacío = la raíz (16:9); 'short/' =
// el árbol 9:16 del pack v3, con su propio guion y sus propios prompts para
// que el guard distinga de qué carpeta salió cada copia.
function storyFiles(folder, prefix = '') {
  const short = prefix !== ''
  const title = short ? SHORT_STORIES[folder] : STORIES[folder]
  const script = `${title}. Primera frase de la historia. Segunda frase.`
  const words = [
    { word: 'Primera', start: 0.1, end: 0.5, confidence: 0.99 },
    { word: 'frase', start: 0.6, end: 1.0, confidence: 0.98 },
    { word: 'Segunda', start: 1.2, end: 1.7, confidence: 0.97 },
    { word: 'frase', start: 1.8, end: 2.3, confidence: 0.99 },
  ]
  const kind = short ? 'short scene' : 'scene'
  const scenes = [
    {
      id: 1,
      texto: 'Primera frase',
      promptImagen: `${folder} ${kind} one`,
      tiempoInicioSeg: 0,
      tiempoFinSeg: 1.1,
    },
    {
      id: 2,
      texto: 'Segunda frase',
      promptImagen: `${folder} ${kind} two`,
      tiempoInicioSeg: 1.1,
      tiempoFinSeg: 2.3,
    },
  ]
  return new Map([
    [`${prefix}${folder}/guion.txt`, Buffer.from(script)],
    [`${prefix}${folder}/audio.mp3`, FAKE_MP3],
    [`${prefix}${folder}/palabras.json`, Buffer.from(JSON.stringify(words))],
    [`${prefix}${folder}/escenas.json`, Buffer.from(JSON.stringify(scenes))],
    [`${prefix}${folder}/imagenes/imagen_1.jpg`, FAKE_JPG],
    [`${prefix}${folder}/imagenes/imagen_2.jpg`, FAKE_JPG],
    [`${prefix}${folder}/video_final.mp4`, FAKE_MP4],
  ])
}

// `withShort` agrega el bloque `short` del manifest y el árbol short/ (pack
// v3); `shortComplete: false` omite un archivo del árbol para probar que un
// short a medias no se instala.
function buildPackEntries({
  withManifest = true,
  withShort = true,
  shortComplete = true,
  container = 'vimo-demo-pack-mini',
} = {}) {
  const storiesBlock = (names) => ({
    estilos: CATALOG_STYLES.map((id) => ({
      id,
      nombreSugerido: names[id],
      numEscenas: 2,
      duracionAudioSeg: 2.3,
    })),
    gema: {
      id: GEM_FOLDER,
      nombreSugerido: names[GEM_FOLDER],
      numEscenas: 2,
      duracionAudioSeg: 2.3,
    },
  })
  const manifest = {
    version: 'mini',
    voz: {
      provider: 'elevenlabs',
      voice_id: 'voice-mini',
      nombre: 'Abel mini',
    },
    ...storiesBlock(STORIES),
    ...(withShort ? { short: storiesBlock(SHORT_STORIES) } : {}),
  }
  const gem = {
    nombre: 'STORYTELLING mini',
    systemPrompt: 'You write prompts.',
    planos: '',
    personaje: { modo: 'generico' },
  }
  const entries = new Map()
  const prefix = container ? `${container}/` : ''
  if (withManifest)
    entries.set(`${prefix}manifest.json`, Buffer.from(JSON.stringify(manifest)))
  entries.set(`${prefix}gema/estilo.json`, Buffer.from(JSON.stringify(gem)))
  entries.set(`${prefix}gema/muestra-1.jpg`, FAKE_JPG)
  entries.set(`${prefix}gema/muestra-2.jpg`, FAKE_JPG)
  for (const folder of [...CATALOG_STYLES, GEM_FOLDER]) {
    for (const [name, data] of storyFiles(folder))
      entries.set(`${prefix}${name}`, data)
    if (!withShort) continue
    for (const [name, data] of storyFiles(folder, 'short/')) {
      if (!shortComplete && name === 'short/normal/video_final.mp4') continue
      entries.set(`${prefix}${name}`, data)
    }
  }
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
const shortIncompleteZip = buildZip(buildPackEntries({ shortComplete: false }))
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

const workspace = await mkdtemp(join(tmpdir(), 'vimo-demo-guard-'))
const projectsRoot = join(workspace, 'Vimo')
await mkdir(projectsRoot, { recursive: true })
const packRoot = join(projectsRoot, '_demo-pack')
const gemFile = join(projectsRoot, '_styles', 'demo-storytelling', 'style.json')

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

  // 2. demo-prepare: descarga, SHA, raíz anidada, .ok, gema, manifest.
  section('2. demo-prepare instala el pack y siembra la gema')
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
      `demo-prepare termina en job-completed (fue ${last(events)?.type}: ${last(events)?.message ?? ''})`,
    )
    assert(
      phases.includes('download') && phases.includes('install'),
      'emite progress con phase download e install',
    )
    assert(
      phases.indexOf('install') > phases.lastIndexOf('download'),
      'install llega después de download',
    )
    const marker = JSON.parse(await readFile(join(packRoot, '.ok'), 'utf8'))
    assert(
      marker.version === 'mini' && marker.sha256 === sha256(packZip),
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
    const manifest = resultOf(events)?.manifest
    assert(
      manifest?.customStyleId === 'demo-storytelling',
      'manifest.customStyleId es demo-storytelling',
    )
    const landscape = manifest?.stories?.['16:9']
    const short = manifest?.stories?.['9:16']
    assert(
      JSON.stringify(landscape?.styles?.map((style) => style.id)) ===
        JSON.stringify(CATALOG_STYLES),
      'stories[16:9].styles trae los tres estilos del catálogo en orden',
    )
    assert(
      landscape?.styles?.[0]?.script?.startsWith('Vida en el espacio'),
      'cada entrada trae su guion',
    )
    assert(
      landscape?.customStyle?.suggestedName === 'La luz del farero',
      'stories[16:9].customStyle es la gema',
    )
    assert(
      landscape?.styles?.[0]?.audioFile ===
        join(packRoot, 'pov_stickman', 'audio.mp3') &&
        existsSync(landscape.styles[0].audioFile),
      'cada historia trae la ruta absoluta de su audio.mp3',
    )
    assert(
      JSON.stringify(short?.styles?.map((style) => style.id)) ===
        JSON.stringify(CATALOG_STYLES) &&
        short?.customStyle?.suggestedName === 'El último tren a casa',
      'stories[9:16] trae las historias de short/',
    )
    assert(
      short?.styles?.[0]?.audioFile ===
        join(packRoot, 'short', 'pov_stickman', 'audio.mp3') &&
        short?.styles?.[0]?.script?.startsWith('Tu primer día en Marte'),
      'las historias Short apuntan a short/<estilo>',
    )
    assert(
      manifest?.voice?.provider === 'elevenlabs' &&
        manifest?.voice?.voiceId === 'voice-mini',
      'la voz viene traducida',
    )
    const gem = JSON.parse(await readFile(gemFile, 'utf8'))
    assert(
      gem.name === 'STORYTELLING mini' &&
        gem.systemPrompt === 'You write prompts.',
      'style.json de la gema en formato nativo',
    )
    assert(
      Array.isArray(gem.shots) &&
        gem.shots.length === 0 &&
        gem.character?.mode === 'generic',
      'shots vacíos y personaje genérico',
    )
    assert(
      existsSync(
        join(projectsRoot, '_styles', 'demo-storytelling', 'sample-1.jpg'),
      ),
      'las muestras se copian como sample-N.jpg',
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
      resultOf(events)?.manifest?.stories?.['16:9']?.styles?.length === 3,
      'trae el manifest',
    )
  }

  // 4. La gema no se pisa y el pack no se re-descarga.
  section('4. segundo demo-prepare: idempotente')
  {
    const edited = JSON.parse(await readFile(gemFile, 'utf8'))
    edited.name = 'editada por la persona'
    await writeFile(gemFile, JSON.stringify(edited))
    const before = hits
    const { events } = await runSidecar('demo-prepare', {
      projectsRoot,
      config: demoConfig(),
    })
    assert(last(events)?.type === 'job-completed', 'segundo prepare completa')
    assert(hits === before, 'con el pack instalado no se descarga de nuevo')
    assert(
      JSON.parse(await readFile(gemFile, 'utf8')).name ===
        'editada por la persona',
      'la gema editada no se pisa',
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
  const projectPayload = (name, options) => ({
    name,
    script: 'Guion de prueba de la demo.',
    options: {
      styleId: 'normal',
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
  const readMetadata = async (projectId) =>
    JSON.parse(
      await readFile(join(projectsRoot, projectId, 'project.json'), 'utf8'),
    )

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
      `la demo termina en job-completed (fue ${last(events)?.type}: ${last(events)?.message ?? ''})`,
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
    const words = JSON.parse(
      await readFile(join(projectsRoot, projectId, 'words.json'), 'utf8'),
    )
    assert(
      words.every(
        (word) => !('confidence' in word) && typeof word.start === 'number',
      ),
      'words.json en formato nativo (sin confidence)',
    )
    const scenes = JSON.parse(
      await readFile(join(projectsRoot, projectId, 'scenes.json'), 'utf8'),
    )
    assert(
      scenes.every(
        (scene) =>
          typeof scene.text === 'string' &&
          typeof scene.imagePrompt === 'string' &&
          typeof scene.startSeconds === 'number',
      ),
      'scenes.json en formato nativo',
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

  // 10. Estilo fuera del pack.
  section('10. estilo sin demo')
  {
    const projectId = await createProject('Demo fantasia', {
      demo: true,
      styleId: 'fantasia',
    })
    const { events } = await runSidecar('run-video-pipeline', {
      projectsRoot,
      config: demoConfig(),
      payload: { projectId },
    })
    assert(
      codeOf(events) === 'demo_style_not_included',
      `fantasia → demo_style_not_included (fue ${codeOf(events)})`,
    )
    const metadata = await readMetadata(projectId)
    assert(
      metadata.state === 'error' &&
        metadata.errorCode === 'demo_style_not_included',
      'el error queda persistido',
    )
  }

  // 11. La gema: customStyle presente → carpeta storytelling.
  section('11. gema del pack')
  {
    const projectId = await createProject('Demo gema', {
      demo: true,
      customStyle: {
        styleId: 'demo-storytelling',
        name: 'STORYTELLING mini',
        systemPrompt: 'You write prompts.',
        shots: [],
      },
    })
    const { events } = await runSidecar('run-video-pipeline', {
      projectsRoot,
      config: demoConfig(),
      payload: { projectId },
    })
    assert(
      resultOf(events)?.status === 'completed',
      'con customStyle la demo usa la carpeta de la gema y completa',
    )
    const scenes = JSON.parse(
      await readFile(join(projectsRoot, projectId, 'scenes.json'), 'utf8'),
    )
    assert(
      scenes[0]?.imagePrompt === 'storytelling scene one',
      'los prompts salen de la carpeta storytelling',
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
      styleId: 'cartoon',
      videoFormat: '9:16',
    })
    const { events } = await runSidecar('run-video-pipeline', {
      projectsRoot,
      config: demoConfig(),
      payload: { projectId },
    })
    assert(
      resultOf(events)?.status === 'completed',
      `un proyecto 9:16 en demo completa (fue ${last(events)?.type}: ${last(events)?.message ?? ''})`,
    )
    const scenes = JSON.parse(
      await readFile(join(projectsRoot, projectId, 'scenes.json'), 'utf8'),
    )
    assert(
      scenes[0]?.imagePrompt === 'cartoon short scene one',
      'los prompts salen de short/cartoon',
    )
    assert(
      (await readMetadata(projectId)).options?.videoFormat === '9:16',
      'project.json conserva videoFormat 9:16',
    )
    const gemId = await createProject('Demo short gema', {
      demo: true,
      videoFormat: '9:16',
      customStyle: {
        styleId: 'demo-storytelling',
        name: 'STORYTELLING mini',
        systemPrompt: 'You write prompts.',
        shots: [],
      },
    })
    const gemRun = await runSidecar('run-video-pipeline', {
      projectsRoot,
      config: demoConfig(),
      payload: { projectId: gemId },
    })
    const gemScenes = JSON.parse(
      await readFile(join(projectsRoot, gemId, 'scenes.json'), 'utf8'),
    )
    assert(
      resultOf(gemRun.events)?.status === 'completed' &&
        gemScenes[0]?.imagePrompt === 'storytelling short scene one',
      'la gema en 9:16 sale de short/storytelling',
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
      `con own-audio la demo completa (fue ${last(events)?.type}: ${last(events)?.message ?? ''})`,
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

  // 16. Pack v2 (sin short): válido, sin historias 9:16.
  section('16. pack sin Short')
  {
    const v2Root = join(workspace, 'Vimo-v2')
    await mkdir(v2Root, { recursive: true })
    const config = demoConfig({
      packUrl: `${baseUrl}/landscape-only.zip`,
      packSha256: sha256(landscapeOnlyZip),
    })
    const prepared = await runSidecar('demo-prepare', {
      projectsRoot: v2Root,
      config,
    })
    assert(
      last(prepared.events)?.type === 'job-completed',
      `un pack sin short se instala (fue ${last(prepared.events)?.type}: ${last(prepared.events)?.message ?? ''})`,
    )
    const status = await runSidecar('demo-status', {
      projectsRoot: v2Root,
      config,
    })
    assert(
      resultOf(status.events)?.ready === true &&
        resultOf(status.events)?.manifest?.stories?.['9:16'] === undefined &&
        resultOf(status.events)?.manifest?.stories?.['16:9']?.styles?.length ===
          3,
      'sin short no hay stories[9:16] y sí 16:9',
    )
    const created = await runSidecar('create-video-project', {
      projectsRoot: v2Root,
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
      projectsRoot: v2Root,
      config,
      payload: { projectId },
    })
    assert(
      codeOf(events) === 'demo_format_not_included',
      `9:16 sin short → demo_format_not_included (fue ${codeOf(events)})`,
    )
    const metadata = JSON.parse(
      await readFile(join(v2Root, projectId, 'project.json'), 'utf8'),
    )
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
      codeOf(events) === 'demo_pack_incomplete',
      `short/ sin un video → demo_pack_incomplete (fue ${codeOf(events)})`,
    )
    assert(
      !existsSync(join(brokenShortRoot, '_demo-pack')),
      'un short incompleto no deja _demo-pack a medias',
    )
  }

  // 18. El armador: pack base + 4 proyectos nativos → zip que se instala.
  section('18. build-demo-pack arma un pack instalable')
  {
    const basePack = join(workspace, 'base-pack')
    for (const [name, data] of buildPackEntries({
      withShort: false,
      container: '',
    })) {
      await mkdir(join(basePack, name, '..'), { recursive: true })
      await writeFile(join(basePack, name), data)
    }
    const nativeRoot = join(workspace, 'native')
    const nativeProject = async (folder) => {
      const id = `demo-short-${folder.replace('_', '-')}`
      const directory = join(nativeRoot, id)
      await mkdir(join(directory, 'scenes'), { recursive: true })
      const options = {
        styleId: folder === GEM_FOLDER ? 'normal' : folder,
        sceneCount: 0,
        narrationMode: 'tts',
        voiceProvider: 'elevenlabs',
        voiceId: 'voice-mini',
        voiceName: 'Abel mini',
        imageProvider: 'fal',
        videoFormat: '9:16',
        useBgm: false,
        useOverlay: false,
        confirmScenes: false,
        ...(folder === GEM_FOLDER
          ? {
              customStyle: {
                styleId: 'demo-storytelling',
                name: 'STORYTELLING mini',
                systemPrompt: 'You write prompts.',
              },
            }
          : {}),
      }
      await writeFile(
        join(directory, 'project.json'),
        JSON.stringify({
          id,
          name: `${SHORT_STORIES[folder]} (armado)`,
          createdAt: '2026-09-11T00:00:00.000Z',
          updatedAt: '2026-09-11T00:00:00.000Z',
          state: 'completed',
          options,
          completedStages: STAGE_IDS,
          audioDurationSeconds: 2.3,
          sceneCount: 2,
          wordCount: 4,
        }),
      )
      await writeFile(
        join(directory, 'script.txt'),
        `${SHORT_STORIES[folder]}. Guion armado.`,
      )
      await writeFile(join(directory, 'narration.mp3'), FAKE_MP3)
      await writeFile(
        join(directory, 'words.json'),
        JSON.stringify([
          { word: 'Guion', start: 0.1, end: 0.5 },
          { word: 'armado', start: 0.6, end: 1.0 },
        ]),
      )
      await writeFile(
        join(directory, 'scenes.json'),
        JSON.stringify([
          {
            id: 1,
            text: 'Guion',
            imagePrompt: `${folder} built scene one`,
            startSeconds: 0,
            endSeconds: 1.1,
          },
          {
            id: 2,
            text: 'armado',
            imagePrompt: `${folder} built scene two`,
            startSeconds: 1.1,
            endSeconds: 2.3,
          },
        ]),
      )
      await writeFile(join(directory, 'scenes', 'scene_1.jpg'), FAKE_JPG)
      await writeFile(join(directory, 'scenes', 'scene_2.jpg'), FAKE_JPG)
      await writeFile(join(directory, `${id}.mp4`), Buffer.alloc(100_001, 1))
      return directory
    }
    const shortArguments = []
    for (const folder of [...CATALOG_STYLES, GEM_FOLDER])
      shortArguments.push('--short', `${folder}=${await nativeProject(folder)}`)
    const builtZip = join(workspace, 'built.zip')
    const builder = await new Promise((resolve) => {
      const child = spawn(
        process.execPath,
        [
          join(repoRoot, 'scripts/build-demo-pack.mjs'),
          '--base',
          basePack,
          ...shortArguments,
          '--version',
          'built',
          '--out',
          builtZip,
        ],
        { stdio: ['ignore', 'pipe', 'inherit'] },
      )
      let stdout = ''
      child.stdout.on('data', (chunk) => (stdout += chunk))
      child.on('close', (code) => resolve({ code, stdout }))
    })
    assert(
      builder.code === 0,
      `build-demo-pack termina en 0 (fue ${builder.code})`,
    )
    const printedSha = builder.stdout.trim().split('\n').pop()
    const builtBytes = await readFile(builtZip)
    assert(
      /^[0-9a-f]{64}$/.test(printedSha) && printedSha === sha256(builtBytes),
      'imprime el SHA-256 real del zip en la última línea',
    )
    served.set('/built.zip', builtBytes)
    const builtRoot = join(workspace, 'Vimo-built')
    await mkdir(builtRoot, { recursive: true })
    const config = demoConfig({
      packVersion: 'built',
      packUrl: `${baseUrl}/built.zip`,
      packSha256: printedSha,
    })
    const prepared = await runSidecar('demo-prepare', {
      projectsRoot: builtRoot,
      config,
    })
    assert(
      last(prepared.events)?.type === 'job-completed',
      `el pack armado se instala (fue ${last(prepared.events)?.type}: ${last(prepared.events)?.message ?? ''})`,
    )
    const manifest = resultOf(prepared.events)?.manifest
    assert(
      manifest?.version === 'built' &&
        manifest?.stories?.['9:16']?.styles?.[0]?.suggestedName ===
          'Tu primer día en Marte (armado)' &&
        manifest?.stories?.['9:16']?.customStyle?.script ===
          'El último tren a casa. Guion armado.' &&
        manifest?.stories?.['16:9']?.styles?.length === 3,
      'el manifest armado trae la raíz base y las historias short',
    )
    const created = await runSidecar('create-video-project', {
      projectsRoot: builtRoot,
      config,
      payload: projectPayload('Demo armado', {
        demo: true,
        styleId: 'cartoon',
        videoFormat: '9:16',
      }),
    })
    const projectId = resultOf(created.events)?.projectId
    const { events } = await runSidecar('run-video-pipeline', {
      projectsRoot: builtRoot,
      config,
      payload: { projectId },
    })
    const scenes = JSON.parse(
      await readFile(join(builtRoot, projectId, 'scenes.json'), 'utf8'),
    )
    assert(
      resultOf(events)?.status === 'completed' &&
        scenes[0]?.imagePrompt === 'cartoon built scene one' &&
        scenes[0]?.startSeconds === 0 &&
        scenes[1]?.endSeconds === 2.3,
      'una historia del pack armado completa con las escenas traducidas',
    )
    assert(
      (await readFile(join(builtRoot, projectId, 'narration.mp3'))).equals(
        FAKE_MP3,
      ) &&
        (await stat(join(builtRoot, projectId, `${projectId}.mp4`))).size ===
          100_001,
      'audio y video llegan desde el proyecto nativo',
    )
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
