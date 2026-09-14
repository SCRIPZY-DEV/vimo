// Smoke sobre el sidecar SEA REAL; fixtures locales y ninguna clave de proveedor.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
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
function run(command, payload, apiKeys = {}) {
  const execution = spawnSync(binary, [command], {
    input:
      JSON.stringify({
        jobId: 'smoke',
        projectsRoot: root,
        apiKeys,
        binaryPaths: {},
        payload,
      }) + '\n',
    encoding: 'utf8',
    timeout: 10000,
  })
  assert.ifError(execution.error)
  const events = execution.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  assert.ok(events.length > 0, execution.stderr)
  return events
}
try {
  const ping = run('ping', { fixture: true })
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
  const failed = run(
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
  const cached = run('run-video-pipeline', { projectId, untilStage: 'voice' })
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
