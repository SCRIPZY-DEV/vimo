// Harness del sidecar para verificar el pipeline por CLI, sin la app
// (ADR-0010: hasta el render, nada depende de Tauri). Arma el PipelineJob a
// mano —claves desde un JSON gitignored, binarios desde src-tauri/binaries— y
// se lo pasa por stdin a `node pipeline/main.ts <subcomando>`.
//
//   node scripts/run-pipeline-harness.mjs <subcomando> [--payload '<json>']
//        [--root <projectsRoot>] [--keys <archivo.json>]
//
// Ejemplos:
//   node scripts/run-pipeline-harness.mjs video-project-status --payload '{"projectId":"mi-video"}'
//   node scripts/run-pipeline-harness.mjs run-video-pipeline --payload '{"projectId":"mi-video","untilStage":"scene-cuts"}'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { executableSuffix, targetTriple } from './target-triple.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

function readFlag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  if (index < 0 || index + 1 >= process.argv.length) return fallback
  return process.argv[index + 1]
}

const subcommand = process.argv[2]
if (!subcommand || subcommand.startsWith('--')) {
  process.stdout.write(
    'uso: node scripts/run-pipeline-harness.mjs <subcomando> [--payload <json>] [--root <dir>] [--keys <archivo>]\n',
  )
  process.exit(1)
}

// Claves: un JSON { "deepinfra": "...", "fal": "...", … } fuera del repo o
// gitignored. Sin él, el harness igual sirve para los caminos offline.
const keysFile = readFlag('keys', join(repoRoot, '.harness-keys.json'))
const apiKeys = existsSync(keysFile)
  ? JSON.parse(readFileSync(keysFile, 'utf8'))
  : {}

// Los mismos binarios que empaqueta Tauri: nunca los del PATH.
const binariesDirectory = join(repoRoot, 'src-tauri/binaries')
const binaryPaths = {}
const triple = targetTriple()
const suffix = executableSuffix(triple)
for (const [field, name] of [
  ['ffmpeg', `ffmpeg-${triple}${suffix}`],
  ['ytDlp', `yt-dlp-${triple}${suffix}`],
]) {
  const path = join(binariesDirectory, name)
  if (existsSync(path)) binaryPaths[field] = path
}

const job = {
  jobId: `harness-${Date.now()}`,
  projectsRoot: readFlag('root', join(homedir(), 'Documents', 'Vimo')),
  apiKeys,
  binaryPaths,
}
const payload = readFlag('payload', null)
if (payload) job.payload = JSON.parse(payload)

const child = spawn('node', [join(repoRoot, 'pipeline/main.ts'), subcommand], {
  stdio: ['pipe', 'inherit', 'inherit'],
})
child.stdin.write(`${JSON.stringify(job)}\n`)
child.on('close', (code) => {
  process.exitCode = code ?? 1
})
