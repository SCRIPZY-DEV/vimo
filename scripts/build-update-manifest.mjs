// Arma el manifiesto latest.json que consulta tauri-plugin-updater (ADR-0027)
// a partir de los artefactos firmados que dejan los jobs de build-desktop.yml:
// el setup NSIS de Windows con su .sig y el Vimo.app.tar.gz de macOS con el
// suyo. Copia los binarios a --output con la versión en el nombre (inmutables
// en el hosting) y escribe latest.json al lado.
//
// Aborta ante cualquier hueco (tag ≠ package.json, artefacto o firma
// faltante): un manifiesto incompleto dejaría a una plataforma sin poder
// actualizarse en silencio.
//
//   node scripts/build-update-manifest.mjs --tag v0.2.0 --input artifacts \
//     --output release --base-url https://vimo.click/releases/ \
//     [--notes-file release-notes.txt]
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

// Un artefacto por plataforma del updater. `find` reconoce el archivo
// producido por Tauri; `publishedName` es cómo se llama en el hosting.
const PLATFORM_ARTIFACTS = [
  {
    platform: 'windows-x86_64',
    find: (name) => name.endsWith('-setup.exe'),
    publishedName: (version) => `Vimo_${version}_x64-setup.exe`,
  },
  {
    platform: 'darwin-aarch64',
    find: (name) => name.endsWith('.app.tar.gz'),
    publishedName: (version) => `Vimo_${version}_aarch64.app.tar.gz`,
  },
]

// Extras que van al hosting para la página de descargas pero no al manifiesto.
const EXTRA_ARTIFACTS = [
  {
    find: (name) => name.endsWith('.dmg'),
    publishedName: (version) => `Vimo_${version}_aarch64.dmg`,
  },
]

const { values: options } = parseArgs({
  options: {
    tag: { type: 'string' },
    input: { type: 'string' },
    output: { type: 'string' },
    'base-url': { type: 'string' },
    'notes-file': { type: 'string' },
  },
})

function fail(message) {
  console.error(`build-update-manifest: ${message}`)
  process.exit(1)
}

function listFilesRecursively(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return listFilesRecursively(path)
    return [path]
  })
}

function findSingle(files, predicate, label) {
  const matches = files.filter((path) => predicate(basename(path)))
  if (matches.length === 0) fail(`no se encontró ${label} en ${options.input}`)
  if (matches.length > 1) fail(`hay más de un ${label}: ${matches.join(', ')}`)
  return matches[0]
}

function readSignature(artifactPath) {
  const signaturePath = `${artifactPath}.sig`
  try {
    return readFileSync(signaturePath, 'utf8').trim()
  } catch {
    return fail(
      `falta la firma ${basename(signaturePath)}: ¿el build corrió con TAURI_SIGNING_PRIVATE_KEY y --config src-tauri/tauri.updater.conf.json?`,
    )
  }
}

function readNotes(notesFile) {
  if (!notesFile) return ''
  try {
    return readFileSync(notesFile, 'utf8').trim()
  } catch {
    return ''
  }
}

if (!options.input || !options.output || !options['base-url']) {
  fail('faltan argumentos: --input, --output y --base-url son obligatorios')
}

const packageJson = JSON.parse(
  readFileSync(join(repoRoot, 'package.json'), 'utf8'),
)
const version = packageJson.version

if (options.tag && options.tag !== `v${version}`) {
  fail(
    `el tag ${options.tag} no coincide con package.json (${version}): actualizá la versión antes de taggear`,
  )
}

const baseUrl = options['base-url'].endsWith('/')
  ? options['base-url']
  : `${options['base-url']}/`
const files = listFilesRecursively(options.input)
mkdirSync(options.output, { recursive: true })

const platforms = {}
for (const artifact of PLATFORM_ARTIFACTS) {
  const source = findSingle(
    files,
    artifact.find,
    `el artefacto ${artifact.platform}`,
  )
  const signature = readSignature(source)
  const publishedName = artifact.publishedName(version)
  copyFileSync(source, join(options.output, publishedName))
  platforms[artifact.platform] = {
    url: new URL(publishedName, baseUrl).href,
    signature,
  }
  console.log(`${artifact.platform}: ${basename(source)} → ${publishedName}`)
}

for (const extra of EXTRA_ARTIFACTS) {
  const matches = files.filter((path) => extra.find(basename(path)))
  if (matches.length !== 1) continue
  const publishedName = extra.publishedName(version)
  copyFileSync(matches[0], join(options.output, publishedName))
  console.log(`extra: ${basename(matches[0])} → ${publishedName}`)
}

const manifest = {
  version,
  notes: readNotes(options['notes-file']),
  pub_date: new Date().toISOString(),
  platforms,
}

writeFileSync(
  join(options.output, 'latest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
)
console.log(`latest.json escrito para la versión ${version}`)
