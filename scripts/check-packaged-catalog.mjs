// Ejercita el binario SEA entregable, no importa las stages del código fuente.
// Proveedor LLM exclusivamente local; hasta scene-prompts, sin imágenes ni TTS.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { targetTriple, executableSuffix } from './target-triple.mjs'
import { markBible } from '../pipeline/utils/story-era.ts'

const triple = targetTriple()
const binary = resolve(
  process.argv[2] ??
    `src-tauri/binaries/vimo-pipeline-${triple}${executableSuffix(triple)}`,
)
const root = await mkdtemp(join(tmpdir(), 'vimo-catalog-sea-'))
const projectId = 'catalog-smoke'
const project = join(root, projectId)
const fragments = [
  'The astronaut repairs the antenna outside the station.',
  'The astronaut waters plants in the station greenhouse.',
]
let mode = 'success'
const requests = []
const server = createServer(async (request, response) => {
  let body = ''
  for await (const chunk of request) body += chunk
  const input = JSON.parse(body)
  requests.push(input)
  if (mode === 'fail' || input.model.includes('Llama-4-Scout')) {
    response.writeHead(503).end('Model busy')
    return
  }
  const isSecond = input.messages
    .at(-1)
    .content.includes('--- FRAGMENT (audio time 4')
  if (mode === 'cancel' && isSecond) return // El abort del SEA cierra el socket.
  const content = JSON.stringify({
    prompt_imagen: isSecond
      ? 'A close-up of the astronaut watering green plants inside the station greenhouse, blue irrigation pipes and transparent walls.'
      : 'A wide view of the astronaut repairing a red antenna outside the station, holding a silver wrench with Earth far behind.',
  })
  response.writeHead(200, { 'Content-Type': 'text/event-stream' })
  response.end(
    'data: ' +
      JSON.stringify({
        choices: [{ delta: { content }, finish_reason: 'stop' }],
      }) +
      '\n\ndata: [DONE]\n\n',
  )
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const baseUrl = `http://127.0.0.1:${server.address().port}/v1`
async function seed() {
  await mkdir(project, { recursive: true })
  await writeFile(
    join(project, 'project.json'),
    JSON.stringify({
      id: projectId,
      name: 'Catalog packaged smoke',
      state: 'paused',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedStages: ['voice', 'transcription', 'scene-cuts'],
      audioDurationSeconds: 8,
      options: {
        styleId: 'cartoon',
        sceneCount: 2,
        narrationMode: 'own-audio',
        imageProvider: 'fal',
        useBgm: false,
        useOverlay: false,
        confirmScenes: false,
      },
    }),
  )
  await writeFile(
    join(project, 'narration.mp3'),
    'cached audio fixture never decoded',
  )
  await writeFile(join(project, 'words.json'), '[]')
  await writeFile(join(project, 'script.txt'), fragments.join(' '))
  await writeFile(
    join(project, 'visual-context.txt'),
    markBible(
      'ERA: contemporary. An orbital station with exterior antennas and an indoor greenhouse.',
    ),
  )
  await writeFile(
    join(project, 'scenes.json'),
    JSON.stringify(
      fragments.map((text, index) => ({
        id: index + 1,
        text,
        startSeconds: index * 4,
        endSeconds: (index + 1) * 4,
        direction: {
          treatment: 'object',
          place: index === 0 ? 'antenna' : 'greenhouse',
          emotion: 'focused',
        },
      })),
    ),
  )
}
async function run(cancelAfterFirst = false) {
  const child = spawn(binary, ['run-video-pipeline'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let buffered = ''
  let stderr = ''
  const events = []
  let cancelled = false
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })
  child.stdout.on('data', (chunk) => {
    buffered += chunk
    const lines = buffered.split('\n')
    buffered = lines.pop()
    for (const line of lines) {
      if (!line.trim()) continue
      const event = JSON.parse(line)
      events.push(event)
      if (
        cancelAfterFirst &&
        !cancelled &&
        event.type === 'scene-prompt-ready'
      ) {
        cancelled = true
        child.stdin.write('{"type":"cancel"}\n')
      }
    }
  })
  const timer = setTimeout(() => child.kill(), 10000)
  try {
    const closed = new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code) => resolve(code))
    })
    child.stdin.write(
      JSON.stringify({
        jobId: 'catalog-smoke',
        projectsRoot: root,
        apiKeys: { deepinfra: 'local-fixture-only' },
        binaryPaths: {},
        config: { llm: { baseUrl, timeoutMs: 1000 } },
        payload: { projectId, untilStage: 'scene-prompts' },
      }) + '\n',
    )
    await closed
    assert.ok(
      events.some((event) =>
        ['job-completed', 'job-failed'].includes(event.type),
      ),
      stderr || 'SEA did not finish',
    )
    return events
  } finally {
    clearTimeout(timer)
    child.stdin.destroy()
  }
}
try {
  await seed()
  let events = await run()
  assert.ok(events.some((event) => event.type === 'job-completed'))
  assert.ok(requests.some((request) => request.model.includes('Llama-4-Scout')))
  assert.ok(
    requests.some((request) => request.model.includes('gpt-oss-120b-Turbo')),
  )
  let stored = JSON.parse(await readFile(join(project, 'scenes.json'), 'utf8'))
  assert.equal(new Set(stored.map((scene) => scene.imagePrompt)).size, 2)
  assert.ok(
    stored.every(
      (scene) => scene.imagePrompt && scene.promptIsFallback === false,
    ),
  )
  mode = 'fail'
  await seed()
  events = await run()
  assert.ok(
    events.some(
      (event) =>
        event.type === 'job-failed' &&
        event.code === 'catalog_prompts_incomplete',
    ),
  )
  stored = JSON.parse(await readFile(join(project, 'scenes.json'), 'utf8'))
  assert.ok(
    stored.every((scene) => !scene.imagePrompt && !scene.promptIsFallback),
  )
  mode = 'cancel'
  await seed()
  events = await run(true)
  assert.ok(
    events.some(
      (event) => event.type === 'job-failed' && event.code === 'cancelled',
    ),
  )
  stored = JSON.parse(await readFile(join(project, 'scenes.json'), 'utf8'))
  assert.equal(stored.filter((scene) => scene.imagePrompt).length, 1)
  const first = stored[0].imagePrompt
  mode = 'success'
  events = await run()
  assert.ok(events.some((event) => event.type === 'job-completed'))
  stored = JSON.parse(await readFile(join(project, 'scenes.json'), 'utf8'))
  assert.equal(stored[0].imagePrompt, first)
  assert.ok(stored[1].imagePrompt && !stored[1].promptIsFallback)
  process.stdout.write(
    'Catalog SEA: rotation, fail-closed, cancel and resume passed (4/4).\n',
  )
} finally {
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
  await rm(root, { recursive: true, force: true, maxRetries: 3 })
}
