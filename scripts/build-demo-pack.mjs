// Arma el pack de la demo (ADR-0027, formato v3 en ADR-0028) desde el pack
// instalado más cuatro proyectos NATIVOS en 9:16 — uno por estilo del
// catálogo y uno de «Mi estilo» —, valida los invariantes que la simulación
// asume, escribe el zip sin compresión (los assets ya vienen comprimidos) e
// imprime el SHA-256 para DEFAULT_PIPELINE_CONFIG.demo. Solo dev; no viaja
// en el build.
//
//   pnpm build:demo-pack --base <_demo-pack instalado> \
//     --short pov_stickman=<proyecto> --short normal=<proyecto> \
//     --short cartoon=<proyecto> --short storytelling=<proyecto> \
//     --version v3 --out <ruta del zip>
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { crc32 } from 'node:zlib'

const CATALOG_STYLES = ['pov_stickman', 'normal', 'cartoon']
const GEM_FOLDER = 'storytelling'
const SHORT_FOLDER = 'short'
const STORY_FOLDERS = [...CATALOG_STYLES, GEM_FOLDER]
const ROOT_FILES = [
  'guion.txt',
  'audio.mp3',
  'palabras.json',
  'escenas.json',
  'video_final.mp4',
]
const MIN_VIDEO_BYTES = 100_000
const MAX_ZIP_ENTRY_BYTES = 0xffffffff
const MAX_ZIP_ENTRIES = 0xffff

// `fail()` lanza en vez de terminar el proceso: así el `catch` de más abajo
// puede imprimir el mensaje y dejar que el `finally` limpie el staging antes
// de salir con process.exitCode = 1.
class BuildFailure extends Error {}

function fail(message) {
  throw new BuildFailure(message)
}

// ── Argumentos ───────────────────────────────────────────────────────────────
function parseArguments(argv) {
  const options = { short: {} }
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (!flag?.startsWith('--') || value === undefined)
      fail(`argumento inválido: ${flag}`)
    const name = flag.slice(2)
    if (name === 'short') {
      // Solo el primer «=»: una ruta de proyecto puede traer otros de yapa.
      const separator = value.indexOf('=')
      const folder = separator === -1 ? value : value.slice(0, separator)
      const directory = separator === -1 ? '' : value.slice(separator + 1)
      if (!STORY_FOLDERS.includes(folder) || !directory)
        fail(
          `--short espera <${STORY_FOLDERS.join('|')}>=<carpeta del proyecto>, recibió "${value}"`,
        )
      options.short[folder] = resolve(directory)
      continue
    }
    options[name] = value
  }
  for (const name of ['base', 'version', 'out']) {
    if (!options[name]) fail(`falta --${name}`)
  }
  for (const folder of STORY_FOLDERS) {
    if (!options.short[folder])
      fail(`falta --short ${folder}=<carpeta del proyecto>`)
  }
  return {
    base: resolve(options.base),
    version: options.version,
    out: resolve(options.out),
    short: options.short,
  }
}

async function isValidFile(path) {
  try {
    const info = await stat(path)
    return info.isFile() && info.size > 0
  } catch {
    return false
  }
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
}

// ── El pack base (la raíz v2 se copia tal cual) ──────────────────────────────
async function readBase(base) {
  const manifest = await readJson(join(base, 'manifest.json'))
  if (
    !manifest?.voz?.voice_id ||
    !Array.isArray(manifest.estilos) ||
    !manifest.gema
  )
    fail(`${base}/manifest.json falta o está malformado`)
  for (const folder of STORY_FOLDERS) {
    for (const file of ROOT_FILES) {
      if (!(await isValidFile(join(base, folder, file))))
        fail(`pack base: falta ${folder}/${file}`)
    }
  }
  if (
    !(await isValidFile(join(base, 'gema', 'estilo.json'))) ||
    !(await isValidFile(join(base, 'gema', 'muestra-1.jpg')))
  )
    fail('pack base: falta gema/estilo.json o gema/muestra-1.jpg')
  return manifest
}

// ── Un proyecto nativo en 9:16 → una carpeta short/<estilo> ─────────────────
async function readNativeStory(folder, directory, baseVoiceId) {
  const metadata = await readJson(join(directory, 'project.json'))
  if (!metadata?.id)
    fail(`${folder}: ${directory}/project.json falta o no tiene id`)
  const options = metadata.options ?? {}
  if (metadata.state !== 'completed')
    fail(`${folder}: el proyecto no está completed (está ${metadata.state})`)
  if (options.videoFormat !== '9:16')
    fail(
      `${folder}: el proyecto no es 9:16 (es ${options.videoFormat ?? '16:9'})`,
    )
  if (options.narrationMode !== 'tts')
    fail(`${folder}: el proyecto tiene que narrar con tts`)
  if (options.voiceId !== baseVoiceId)
    fail(
      `${folder}: la voz (${options.voiceId}) no es la del pack base (${baseVoiceId}); misma voz en todas las historias`,
    )
  if (folder === GEM_FOLDER && !options.customStyle)
    fail(`${folder}: el proyecto de «Mi estilo» tiene que llevar customStyle`)
  if (
    folder !== GEM_FOLDER &&
    (options.customStyle || options.styleId !== folder)
  )
    fail(
      `${folder}: el proyecto tiene que ser del estilo de catálogo "${folder}" sin customStyle`,
    )
  if (!(metadata.audioDurationSeconds > 0))
    fail(`${folder}: project.json sin audioDurationSeconds`)

  const script = (
    await readFile(join(directory, 'script.txt'), 'utf8').catch(() => '')
  ).trim()
  if (!script) fail(`${folder}: script.txt vacío`)
  if (!(await isValidFile(join(directory, 'narration.mp3'))))
    fail(`${folder}: falta narration.mp3`)
  const words = await readJson(join(directory, 'words.json'))
  if (!Array.isArray(words) || words.length === 0)
    fail(`${folder}: words.json vacío`)
  const scenes = await readJson(join(directory, 'scenes.json'))
  if (!Array.isArray(scenes) || scenes.length === 0)
    fail(`${folder}: scenes.json vacío`)
  for (const [index, scene] of scenes.entries()) {
    if (scene.id !== index + 1)
      fail(
        `${folder}: ids no contiguos (posición ${index} tiene id ${scene.id})`,
      )
    if (typeof scene.imagePrompt !== 'string' || !scene.imagePrompt.trim())
      fail(`${folder}: la escena ${scene.id} no tiene imagePrompt`)
    if (
      typeof scene.startSeconds !== 'number' ||
      typeof scene.endSeconds !== 'number'
    )
      fail(`${folder}: la escena ${scene.id} no tiene tiempos`)
    if (
      !(await isValidFile(join(directory, 'scenes', `scene_${scene.id}.jpg`)))
    )
      fail(`${folder}: falta scenes/scene_${scene.id}.jpg`)
  }
  const video = join(directory, `${metadata.id}.mp4`)
  const videoInfo = await stat(video).catch(() => null)
  if (!videoInfo || videoInfo.size < MIN_VIDEO_BYTES)
    fail(
      `${folder}: ${metadata.id}.mp4 falta o pesa menos de ${MIN_VIDEO_BYTES} bytes`,
    )

  return { metadata, directory, script, words, scenes, video }
}

async function copyInto(source, target) {
  await mkdir(dirname(target), { recursive: true })
  await copyFile(source, target)
}

async function copyTree(source, target, { skip = () => false } = {}) {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    // Un `.DS_Store` (o cualquier punto-archivo/punto-carpeta) que Finder deja
    // en el pack base no puede colarse en el zip: cambiaría el SHA-256 que
    // queda pineado en DEFAULT_PIPELINE_CONFIG.demo de una máquina a otra.
    if (entry.name.startsWith('.')) continue
    const from = join(source, entry.name)
    const to = join(target, entry.name)
    if (skip(relative(source, from))) continue
    if (entry.isDirectory()) {
      await copyTree(from, to)
      continue
    }
    await copyInto(from, to)
  }
}

// Traducción nativo → pack (la inversa de la tabla de ADR-0027).
async function writeShortStory(staging, folder, story) {
  const target = join(staging, SHORT_FOLDER, folder)
  await mkdir(join(target, 'imagenes'), { recursive: true })
  await writeFile(join(target, 'guion.txt'), `${story.script}\n`)
  await copyFile(
    join(story.directory, 'narration.mp3'),
    join(target, 'audio.mp3'),
  )
  await writeFile(
    join(target, 'palabras.json'),
    JSON.stringify(
      story.words.map((word) => ({
        word: word.word,
        start: word.start,
        end: word.end,
      })),
    ),
  )
  await writeFile(
    join(target, 'escenas.json'),
    JSON.stringify(
      story.scenes.map((scene) => ({
        id: scene.id,
        texto: scene.text ?? '',
        promptImagen: scene.imagePrompt,
        tiempoInicioSeg: scene.startSeconds,
        tiempoFinSeg: scene.endSeconds,
      })),
      null,
      2,
    ),
  )
  for (const scene of story.scenes) {
    await copyFile(
      join(story.directory, 'scenes', `scene_${scene.id}.jpg`),
      join(target, 'imagenes', `imagen_${scene.id}.jpg`),
    )
  }
  await copyFile(story.video, join(target, 'video_final.mp4'))
}

// ── Zip «store» por streaming (sin ZIP64: < 4 GiB y < 65535 entradas) ────────
async function listFiles(root, directory = root) {
  const files = []
  // Orden binario, no localeCompare: el SHA-256 del zip queda pineado en
  // DEFAULT_PIPELINE_CONFIG.demo, así que los mismos insumos tienen que dar
  // el mismo zip byte a byte sin importar el locale/ICU de la máquina.
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort(
    (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  )) {
    if (entry.name.startsWith('.')) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await listFiles(root, path)))
    else
      files.push({
        name: relative(root, path).split('\\').join('/'),
        path,
        size: (await stat(path)).size,
      })
  }
  return files
}

async function fileCrc32(path) {
  let crc = 0
  for await (const chunk of createReadStream(path)) crc = crc32(chunk, crc)
  return crc >>> 0
}

function localHeader(nameBytes, crc, size) {
  const header = Buffer.alloc(30)
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
  const header = Buffer.alloc(46)
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

async function writeStoreZip(staging, out) {
  const files = await listFiles(staging)
  if (files.length > MAX_ZIP_ENTRIES)
    fail(`demasiadas entradas para un zip sin ZIP64: ${files.length}`)
  await mkdir(dirname(out), { recursive: true })
  await rm(out, { force: true })
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
  // no dejamos un `--out` truncado: se cierra el stream y se borra el archivo
  // antes de volver a lanzar.
  try {
    for (const file of files) {
      if (file.size > MAX_ZIP_ENTRY_BYTES)
        fail(`${file.name} supera los 4 GiB de un zip sin ZIP64`)
      const nameBytes = Buffer.from(file.name, 'utf8')
      const nextOffset = offset + 30 + nameBytes.length + file.size
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
    const end = Buffer.alloc(22)
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
  return files.length
}

async function fileSha256(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

// ── Main ────────────────────────────────────────────────────────────────────
try {
  const options = parseArguments(process.argv.slice(2))
  // Antes de tocar nada: si --out ya es un directorio, ni se crea el staging
  // (nunca hacemos `rm` de un directorio existente).
  const outInfo = await stat(options.out).catch(() => null)
  if (outInfo?.isDirectory())
    fail(`--out ya existe y es un directorio: ${options.out}`)
  const baseManifest = await readBase(options.base)
  process.stdout.write(
    `Pack base: ${options.base} (${baseManifest.version ?? '?'}, voz ${baseManifest.voz.nombre ?? baseManifest.voz.voice_id})\n`,
  )

  const stories = {}
  for (const folder of STORY_FOLDERS) {
    stories[folder] = await readNativeStory(
      folder,
      options.short[folder],
      baseManifest.voz.voice_id,
    )
    process.stdout.write(
      `  ✓ short/${folder}: «${stories[folder].metadata.name}» · ${stories[folder].scenes.length} escenas · ${stories[folder].metadata.audioDurationSeconds}s\n`,
    )
  }

  const staging = await mkdtemp(join(tmpdir(), 'vimo-demo-pack-'))
  try {
    // La raíz v2 viaja tal cual, sin el sello ni un short/ de un pack anterior.
    await copyTree(options.base, staging, {
      skip: (path) =>
        path === '.ok' || path === SHORT_FOLDER || path === 'manifest.json',
    })
    for (const folder of STORY_FOLDERS)
      await writeShortStory(staging, folder, stories[folder])

    const entry = (folder) => ({
      id: folder,
      nombreSugerido: stories[folder].metadata.name,
      numEscenas: stories[folder].scenes.length,
      duracionAudioSeg: stories[folder].metadata.audioDurationSeconds,
    })
    const manifest = {
      ...baseManifest,
      version: options.version,
      short: {
        estilos: CATALOG_STYLES.map(entry),
        gema: entry(GEM_FOLDER),
      },
    }
    await writeFile(
      join(staging, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
    )

    const entries = await writeStoreZip(staging, options.out)
    const size = (await stat(options.out)).size
    process.stdout.write(
      `\n✅ Pack listo: ${options.out} (${(size / 1024 / 1024).toFixed(1)} MB, ${entries} archivos)\n`,
    )
    process.stdout.write(`   packVersion: '${options.version}'\n`)
    process.stdout.write(`   asset: ${basename(options.out)}\n`)
    process.stdout.write('   packSha256 (última línea):\n')
    process.stdout.write(`${await fileSha256(options.out)}\n`)
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
} catch (error) {
  if (!(error instanceof BuildFailure)) throw error
  process.stderr.write(`✗ ${error.message}\n`)
  process.exitCode = 1
}
