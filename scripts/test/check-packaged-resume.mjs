// Smoke sobre el sidecar SEA REAL; fixtures locales y ninguna clave de proveedor.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { targetTriple, executableSuffix } from '../target-triple.mjs'

const triple = targetTriple()
const binary = resolve(
  process.argv[2] ??
    `src-tauri/binaries/vimo-pipeline-${triple}${executableSuffix(triple)}`,
)
const root = await mkdtemp(join(tmpdir(), 'vimo-sea-regression-'))
const projectId = 'resume-smoke'
const project = join(root, projectId)
// Lanza el sidecar y devuelve sus eventos NDJSON. Mantiene stdin abierto hasta
// que el sidecar emitió su evento terminal y salió: con el job en marcha, el
// sidecar toma un stdin cerrado por «la app se cerró» y cancela el job (PR #98
// de dev, `readJob` en pipeline/main.ts). Por eso no sirve `spawnSync` con
// `input`, que cierra stdin apenas escribe la línea del job.
async function run(command, payload, apiKeys = {}) {
  const child = spawn(binary, [command], { stdio: ['pipe', 'pipe', 'pipe'] })
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => {
    stdout += chunk
  })
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })
  // El mismo plazo que tenía el spawnSync (timeout: 10000): un sidecar
  // colgado es un fallo del guard, no una salida a medias.
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    child.kill()
  }, 10000)
  try {
    const closed = new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('close', resolve)
    })
    child.stdin.write(
      JSON.stringify({
        jobId: 'smoke',
        projectsRoot: root,
        apiKeys,
        binaryPaths: {},
        payload,
      }) + '\n',
    )
    await closed
    assert.equal(
      timedOut,
      false,
      `the sidecar did not finish within 10 s\n${stderr}`,
    )
    const events = stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
    assert.ok(events.length > 0, stderr)
    return events
  } finally {
    clearTimeout(timer)
    child.stdin.destroy()
  }
}
try {
  const ping = await run('ping', { fixture: true })
  assert.ok(
    ping.some(
      (event) =>
        event.type === 'job-completed' && event.result.fixture === true,
    ),
  )
  await mkdir(project)
  await writeFile(
    join(project, 'project.json'),
    JSON.stringify({
      id: projectId,
      name: 'Offline smoke',
      state: 'paused',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedStages: [],
      options: {
        styleId: 'normal',
        imageProvider: 'fal',
        narrationMode: 'tts',
        voiceProvider: 'elevenlabs',
        voiceId: 'fixture',
        useBgm: false,
        useOverlay: false,
        customStyle: {
          name: 'Offline',
          systemPrompt: 'fixture avoids speculative visual-bible generation',
        },
      },
    }),
  )
  await writeFile(
    join(project, 'script.txt'),
    'A sufficiently long narration for the offline recovery smoke.',
  )
  // Recibo no confirmable: debe frenar ANTES de cualquier POST.
  await writeFile(
    join(project, 'narration.mp3.request-0.json'),
    JSON.stringify({
      fingerprint: 'unknown',
      startedAt: Date.now(),
      state: 'submitting',
    }),
  )
  const failed = await run(
    'run-video-pipeline',
    { projectId, untilStage: 'voice' },
    { dubvoice: 'fixture-not-a-real-key' },
  )
  assert.ok(
    failed.some(
      (event) =>
        event.type === 'job-failed' &&
        event.code === 'voice_request_unresolved',
    ),
    JSON.stringify(failed),
  )
  const metadata = JSON.parse(
    await readFile(join(project, 'project.json'), 'utf8'),
  )
  assert.equal(metadata.errorCode, 'voice_request_unresolved')
  // Cache-hit: sin claves, reutiliza el artefacto y completa la stage.
  await writeFile(
    join(project, 'narration.mp3'),
    Buffer.from('ID3 cached fixture audio'),
  )
  const cached = await run('run-video-pipeline', {
    projectId,
    untilStage: 'voice',
  })
  assert.ok(
    cached.some((event) => event.type === 'job-completed'),
    JSON.stringify(cached),
  )
  assert.ok(
    cached.some(
      (event) => event.type === 'stage-skipped' && event.stageId === 'voice',
    ),
  )
  process.stdout.write(
    'SEA: ping, unresolved receipt and cached narration passed (3/3).\n',
  )
} finally {
  await rm(root, { recursive: true, force: true })
}
