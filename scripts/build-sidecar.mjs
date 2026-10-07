// Empaqueta el sidecar del pipeline como binario único con Node SEA
// (Single Executable Applications): esbuild bundlea pipeline/ a un CJS, se
// genera el blob SEA y se inyecta en una copia del runtime de Node. El
// resultado va a src-tauri/binaries/vimo-pipeline-<target-triple> y Tauri lo
// empaqueta como externalBin (ADR-0010; enfoque del ADR-0019 del origen).
//
// Corre en beforeDevCommand y beforeBuildCommand: dev y producción usan el
// MISMO binario — el sidecar nunca depende del Node del sistema (una app
// lanzada desde Finder no hereda el PATH de la terminal).
//
// La base tiene que ser un runtime oficial de nodejs.org: estático y con el
// fuse de SEA. Si el Node que corre este script no lo es (el de Homebrew es
// un lanzador que enlaza libnode.dylib y no trae el fuse), el script se
// vuelve a correr con un Node oficial: VIMO_SIDECAR_NODE o el pineado abajo.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { inject } from 'postject'
import {
  executableSuffix,
  isHostTriple,
  isMacosTriple,
  targetTriple,
} from './target-triple.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const buildDir = join(repoRoot, 'src-tauri/sidecar-build')
const binariesDir = join(repoRoot, 'src-tauri/binaries')

// Sentinel documentado por Node para SEA; no es un secreto.
const SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'

// Node oficial para cuando el que corre este script no sirve de base. Va
// pineado como los binarios de fetch-binaries.mjs: el SHA-256 sale del
// SHASUMS256.txt oficial de la release; una versión nueva se adopta a mano.
const OFFICIAL_NODE_VERSION = 'v22.23.2'
const OFFICIAL_NODE_PINS = {
  'aarch64-apple-darwin': {
    archive: `node-${OFFICIAL_NODE_VERSION}-darwin-arm64.tar.gz`,
    sha256: '61130f394c1630d211dd50aecc4353d379480f36d3ac913cd85dbba1aed585c6',
  },
  'x86_64-apple-darwin': {
    archive: `node-${OFFICIAL_NODE_VERSION}-darwin-x64.tar.gz`,
    sha256: '58e99022c2ff89395576cc7fd4d98cea24bb68081475d5f88b801ee8729fb026',
  },
}

const triple = targetTriple()

// El sidecar es una copia de un Node del host: solo sirve para el triple del
// host. Con otro triple saldría un instalador que abre pero no renderiza, así
// que se aborta antes (ADR-0034).
if (!isHostTriple(triple)) {
  throw new Error(
    `El sidecar copia el Node del host (${process.platform}-${process.arch}) y no sirve para ${triple}: ` +
      'compilá ese target en un runner de su arquitectura (scripts/release-targets.mjs).',
  )
}

function hasSeaFuse(nodePath) {
  return readFileSync(nodePath).includes(SEA_FUSE)
}

/**
 * Un Node oficial para la base del sidecar: VIMO_SIDECAR_NODE si está
 * definida; si no, el runtime pineado, que se descarga una sola vez a
 * src-tauri/sidecar-build/node-runtime/ (ignorado por git).
 */
async function officialSeaNode() {
  const override = process.env.VIMO_SIDECAR_NODE
  if (override) {
    if (!hasSeaFuse(override))
      throw new Error(
        `VIMO_SIDECAR_NODE (${override}) no sirve: no es un Node oficial con el fuse de SEA.`,
      )
    return override
  }

  const pin = OFFICIAL_NODE_PINS[triple]
  if (!pin)
    throw new Error(
      `El Node que corre este script (${process.execPath}) no tiene el fuse de SEA y no hay un Node ` +
        `oficial pineado para ${triple}: corré el build con el Node de nodejs.org o definí VIMO_SIDECAR_NODE.`,
    )

  const runtimeDir = join(buildDir, 'node-runtime')
  const folder = pin.archive.replace(/\.tar\.gz$/, '')
  const nodePath = join(runtimeDir, folder, 'bin', 'node')
  const markerPath = join(runtimeDir, `${folder}.sha256`)
  const installed =
    existsSync(nodePath) &&
    existsSync(markerPath) &&
    readFileSync(markerPath, 'utf8').trim() === pin.sha256
  if (installed) return nodePath

  const url = `https://nodejs.org/dist/${OFFICIAL_NODE_VERSION}/${pin.archive}`
  process.stdout.write(`sidecar: descargando el Node oficial ${url}\n`)
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok)
    throw new Error(`Descarga del Node oficial falló: HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  const actualHash = createHash('sha256').update(bytes).digest('hex')
  if (actualHash !== pin.sha256)
    throw new Error(
      `SHA-256 del Node oficial no coincide con el pin.\n` +
        `  esperado: ${pin.sha256}\n  obtenido: ${actualHash}`,
    )

  mkdirSync(runtimeDir, { recursive: true })
  const archivePath = join(runtimeDir, pin.archive)
  writeFileSync(archivePath, bytes)
  execFileSync('tar', [
    '-xzf',
    archivePath,
    '-C',
    runtimeDir,
    `${folder}/bin/node`,
  ])
  rmSync(archivePath)
  if (!hasSeaFuse(nodePath))
    throw new Error(
      `El Node oficial descargado (${nodePath}) no trae el fuse de SEA.`,
    )
  writeFileSync(markerPath, `${pin.sha256}\n`)
  return nodePath
}

if (!hasSeaFuse(process.execPath)) {
  const nodePath = await officialSeaNode()
  process.stdout.write(
    `sidecar: ${process.execPath} no sirve de base (sin el fuse de SEA); se compila con ${nodePath}\n`,
  )
  execFileSync(nodePath, [fileURLToPath(import.meta.url)], { stdio: 'inherit' })
  process.exit(0)
}

const isMacos = isMacosTriple(triple)
const binaryPath = join(
  binariesDir,
  `vimo-pipeline-${triple}${executableSuffix(triple)}`,
)

mkdirSync(buildDir, { recursive: true })
mkdirSync(binariesDir, { recursive: true })

// 1. Bundle CJS autocontenido (solo builtins de Node como externals).
const bundlePath = join(buildDir, 'vimo-pipeline.cjs')
await build({
  entryPoints: [join(repoRoot, 'pipeline/main.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  outfile: bundlePath,
  minify: true,
  sourcemap: false,
  logLevel: 'warning',
})

// 2. Blob SEA a partir del bundle.
const blobPath = join(buildDir, 'vimo-pipeline.blob')
const seaConfigPath = join(buildDir, 'sea-config.json')
writeFileSync(
  seaConfigPath,
  JSON.stringify({
    main: bundlePath,
    output: blobPath,
    disableExperimentalSEAWarning: true,
  }),
)
execFileSync(process.execPath, ['--experimental-sea-config', seaConfigPath], {
  stdio: 'inherit',
})

// 3. Copia del runtime de Node que está corriendo este script + inyección, en
// un archivo aparte: si algo falla, el sidecar anterior queda intacto.
const stagedPath = join(buildDir, `vimo-pipeline${executableSuffix(triple)}`)
copyFileSync(process.execPath, stagedPath)
chmodSync(stagedPath, 0o755)
if (isMacos) {
  // La copia hereda la firma de Node; hay que quitarla antes de inyectar.
  execFileSync('codesign', ['--remove-signature', stagedPath])
}
// En Windows la copia de node.exe conserva la firma Authenticode de OpenJS,
// que queda inválida tras inyectar el blob. Se deja así a propósito: Windows
// ejecuta un binario con firma inválida igual que uno sin firma, NSIS no la
// exige y quitarla requeriría signtool (Windows SDK). Ver ADR-0026.
await inject(stagedPath, 'NODE_SEA_BLOB', readFileSync(blobPath), {
  sentinelFuse: SEA_FUSE,
  ...(isMacos ? { machoSegmentName: 'NODE_SEA' } : {}),
})
if (isMacos) {
  // Firma ad-hoc; la firma real de distribución la aplica el bundling.
  execFileSync('codesign', ['--sign', '-', stagedPath])
}
renameSync(stagedPath, binaryPath)

process.stdout.write(`sidecar listo: ${binaryPath}\n`)
