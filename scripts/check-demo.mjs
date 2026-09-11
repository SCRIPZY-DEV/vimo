// Guard ejecutable del modo demo (ADR-0027). Sin app y sin red: genera un
// pack mínimo en una carpeta temporal (mismo formato v2 del origen, 2 escenas
// por estilo, archivos diminutos), lo empaqueta en un zip en memoria, lo
// sirve por HTTP local y corre los subcomandos del sidecar contra una carpeta
// raíz temporal. Cada sección asserta un invariante de la ADR.
//
//   pnpm check:demo
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
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
const FAKE_JPG = Buffer.from(
  'ffd8ffe000104a46494600010100000100010000ffd9',
  'hex',
)
const FAKE_MP3 = Buffer.from('not-a-real-mp3-but-enough-for-the-guard')
const FAKE_MP4 = Buffer.from('not-a-real-mp4-but-enough-for-the-guard')

function storyFiles(folder) {
  const script = `${STORIES[folder]}. Primera frase de la historia. Segunda frase.`
  const words = [
    { word: 'Primera', start: 0.1, end: 0.5, confidence: 0.99 },
    { word: 'frase', start: 0.6, end: 1.0, confidence: 0.98 },
    { word: 'Segunda', start: 1.2, end: 1.7, confidence: 0.97 },
    { word: 'frase', start: 1.8, end: 2.3, confidence: 0.99 },
  ]
  const scenes = [
    {
      id: 1,
      texto: 'Primera frase',
      promptImagen: `${folder} scene one`,
      tiempoInicioSeg: 0,
      tiempoFinSeg: 1.1,
    },
    {
      id: 2,
      texto: 'Segunda frase',
      promptImagen: `${folder} scene two`,
      tiempoInicioSeg: 1.1,
      tiempoFinSeg: 2.3,
    },
  ]
  return new Map([
    [`${folder}/guion.txt`, Buffer.from(script)],
    [`${folder}/audio.mp3`, FAKE_MP3],
    [`${folder}/palabras.json`, Buffer.from(JSON.stringify(words))],
    [`${folder}/escenas.json`, Buffer.from(JSON.stringify(scenes))],
    [`${folder}/imagenes/imagen_1.jpg`, FAKE_JPG],
    [`${folder}/imagenes/imagen_2.jpg`, FAKE_JPG],
    [`${folder}/video_final.mp4`, FAKE_MP4],
  ])
}

function buildPackEntries({
  withManifest = true,
  container = 'vimo-demo-pack-mini',
} = {}) {
  const manifest = {
    version: 'mini',
    voz: {
      provider: 'elevenlabs',
      voice_id: 'voice-mini',
      nombre: 'Abel mini',
    },
    estilos: CATALOG_STYLES.map((id) => ({
      id,
      nombreSugerido: STORIES[id],
      numEscenas: 2,
      duracionAudioSeg: 2.3,
    })),
    gema: {
      id: GEM_FOLDER,
      nombreSugerido: STORIES[GEM_FOLDER],
      numEscenas: 2,
      duracionAudioSeg: 2.3,
    },
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
let hits = 0
const server = createServer((request, response) => {
  hits += 1
  const body =
    request.url === '/pack.zip'
      ? packZip
      : request.url === '/broken.zip'
        ? brokenZip
        : null
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
    assert(
      JSON.stringify(manifest?.styles?.map((style) => style.id)) ===
        JSON.stringify(CATALOG_STYLES),
      'manifest.styles trae los tres estilos del catálogo en orden',
    )
    assert(
      manifest?.styles?.[0]?.script?.startsWith('Vida en el espacio'),
      'cada entrada trae su guion',
    )
    assert(
      manifest?.customStyle?.suggestedName === 'La luz del farero',
      'manifest.customStyle es la gema',
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
    assert(resultOf(events)?.manifest?.styles?.length === 3, 'trae el manifest')
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

  // GUARD-SECCIONES-7-13
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
