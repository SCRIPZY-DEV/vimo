// Empaqueta el sidecar del pipeline como binario único con Node SEA
// (Single Executable Applications): esbuild bundlea pipeline/ a un CJS, se
// genera el blob SEA y se inyecta en una copia del runtime de Node. El
// resultado va a src-tauri/binaries/vimo-pipeline-<target-triple> y Tauri lo
// empaqueta como externalBin (ADR-0010; enfoque del ADR-0019 del origen).
//
// Corre en beforeDevCommand y beforeBuildCommand: dev y producción usan el
// MISMO binario — el sidecar nunca depende del Node del sistema (una app
// lanzada desde Finder no hereda el PATH de la terminal).
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { inject } from 'postject'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const buildDir = join(repoRoot, 'src-tauri/sidecar-build')
const binariesDir = join(repoRoot, 'src-tauri/binaries')

// Sentinel documentado por Node para SEA; no es un secreto.
const SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'

function targetTriple() {
  // Tauri lo exporta en sus hooks de build; fuera de ellos, el host de rustc.
  if (process.env.TAURI_ENV_TARGET_TRIPLE) {
    return process.env.TAURI_ENV_TARGET_TRIPLE
  }
  const output = execFileSync('rustc', ['-Vv'], { encoding: 'utf8' })
  const match = output.match(/host: (\S+)/)
  if (!match)
    throw new Error('No se pudo determinar el target triple (rustc -Vv)')
  return match[1]
}

const triple = targetTriple()
const isWindows = triple.includes('windows')
const isMacos = triple.includes('apple-darwin')
const binaryPath = join(
  binariesDir,
  `vimo-pipeline-${triple}${isWindows ? '.exe' : ''}`,
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

// 3. Copia del runtime de Node que está corriendo este script + inyección.
copyFileSync(process.execPath, binaryPath)
chmodSync(binaryPath, 0o755)
if (isMacos) {
  // La copia hereda la firma de Node; hay que quitarla antes de inyectar.
  execFileSync('codesign', ['--remove-signature', binaryPath])
}
await inject(binaryPath, 'NODE_SEA_BLOB', readFileSync(blobPath), {
  sentinelFuse: SEA_FUSE,
  ...(isMacos ? { machoSegmentName: 'NODE_SEA' } : {}),
})
if (isMacos) {
  // Firma ad-hoc; la firma real de distribución la aplica el bundling.
  execFileSync('codesign', ['--sign', '-', binaryPath])
}

process.stdout.write(`sidecar listo: ${binaryPath}\n`)
