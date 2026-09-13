// SEA real: update-scenes y regenerate-scene-images, LLM local y cero claves de imagen.
// El final missing_api_key es intencional: verifica prompts persistidos sin gastar.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { targetTriple, executableSuffix } from './target-triple.mjs'

const triple = targetTriple()
const binary = resolve(
  process.argv[2] ??
    'src-tauri/binaries/vimo-pipeline-' + triple + executableSuffix(triple),
)
const root = await mkdtemp(join(tmpdir(), 'vimo-editor-sea-'))
const projectId = 'editor-smoke'
const project = join(root, projectId)
const gem =
  'Watercolor illustration in indigo washes, rough paper and warm light.'
let contradict = false
const requests = []
const server = createServer(async (request, response) => {
  let body = ''
  for await (const chunk of request) body += chunk
  const input = JSON.parse(body)
  requests.push(input)
  assert.ok(input.messages[0].content.startsWith(gem))
  const absent = input.messages[0].content.includes(
    'ESTE PEDIDO VA SIN PROTAGONISTA',
  )
  const content =
    '((1)) ' +
    (absent && !contradict
      ? 'An empty greenhouse frames a repaired red antenna, silver tools resting on a bench and warm light through the glass.'
      : '[subject] repairs the red antenna beside the greenhouse, silver tools reflecting warm light through the glass.') +
    ' Style: watercolor illustration in indigo washes on rough paper.'
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
const baseUrl = 'http://127.0.0.1:' + server.address().port + '/v1'
async function run(subcommand, payload) {
  const child = spawn(binary, [subcommand], { stdio: ['pipe', 'pipe', 'pipe'] })
  let output = ''
  let diagnostics = ''
  child.stdout.on('data', (chunk) => {
    output += chunk
  })
  child.stderr.on('data', (chunk) => {
    diagnostics += chunk
  })
  const timer = setTimeout(() => child.kill(), 15000)
  try {
    const closed = new Promise((resolve, reject) => {
      child.once('close', resolve)
      child.once('error', reject)
    })
    child.stdin.write(
      JSON.stringify({
        jobId: 'editor-smoke',
        projectsRoot: root,
        apiKeys: { deepinfra: 'local-fixture-only' },
        binaryPaths: {},
        config: { llm: { baseUrl } },
        payload: { projectId, ...payload },
      }) + '\n',
    )
    await closed
    const events = output
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
    assert.ok(
      events.some(
        (event) =>
          event.type === 'job-completed' || event.type === 'job-failed',
      ),
      diagnostics || 'SEA did not finish',
    )
    return events
  } finally {
    clearTimeout(timer)
    child.stdin.destroy()
  }
}
const scenes = async () =>
  JSON.parse(await readFile(join(project, 'scenes.json'), 'utf8'))
try {
  await mkdir(join(project, 'scenes'), { recursive: true })
  await writeFile(
    join(project, 'scenes', 'scene_1.jpg'),
    'previous paid image fixture',
  )
  await writeFile(
    join(project, 'project.json'),
    JSON.stringify({
      id: projectId,
      name: 'Editor smoke',
      state: 'draft',
      completedStages: [],
      options: {
        styleId: 'normal',
        imageProvider: 'fal',
        customStyle: {
          id: 'fixture',
          name: 'Watercolor',
          systemPrompt: gem,
          character: { mode: 'own' },
        },
        characters: [
          {
            name: 'Elena',
            description:
              'a young astronaut with brown hair, green eyes, a blue jacket and silver boots',
            mode: 'text',
          },
        ],
      },
    }),
  )
  await writeFile(
    join(project, 'script.txt'),
    'Elena repairs a red antenna beside a greenhouse.',
  )
  await writeFile(
    join(project, 'scenes.json'),
    JSON.stringify([
      {
        id: 1,
        text: 'Elena repairs the red antenna.',
        charactersPresent: [0],
        imagePrompt:
          'Elena repairs the red antenna. Watercolor illustration in indigo washes.',
      },
    ]),
  )
  for (const include of [false, true]) {
    let events = await run('update-scenes', {
      changes: [{ id: 1, charactersPresent: include ? [0] : [] }],
    })
    assert.ok(events.some((event) => event.type === 'job-completed'))
    assert.equal(
      (await scenes())[0].imagePrompt,
      undefined,
      'invalida prompt al cambiar selección',
    )
    const before = requests.length
    events = await run('regenerate-scene-images', {
      scenes: [{ id: 1, rewritePrompt: false }],
    })
    assert.ok(events.some((event) => event.type === 'scene-prompt-ready'))
    assert.ok(
      events.some(
        (event) =>
          event.type === 'job-failed' && event.code === 'missing_api_key',
      ),
      'sin clave de imagen: no se envía un POST pago',
    )
    assert.equal(requests.length, before + 1)
    const stored = (await scenes())[0]
    assert.deepEqual(stored.charactersPresent, include ? [0] : [])
    assert.match(stored.imagePrompt, /indigo washes/)
    if (include) assert.match(stored.imagePrompt, /blue jacket/)
    else
      assert.doesNotMatch(
        stored.imagePrompt,
        /Elena|main character|attached reference|\[subject\]/i,
      )
  }
  await run('update-scenes', { changes: [{ id: 1, charactersPresent: [] }] })
  contradict = true
  const failed = await run('regenerate-scene-images', {
    scenes: [{ id: 1, rewritePrompt: false }],
  })
  assert.ok(
    failed.some(
      (event) =>
        event.type === 'job-failed' && event.code === 'llm_empty_response',
    ),
  )
  assert.ok(
    !failed.some(
      (event) => event.type === 'stage-started' && event.stageId === 'images',
    ),
  )
  assert.equal((await scenes())[0].imagePrompt, undefined)
  assert.equal(
    await readFile(join(project, 'scenes', 'scene_1.jpg'), 'utf8'),
    'previous paid image fixture',
  )
  process.stdout.write(
    'Editor SEA: unchecked, checked and persistent contradiction passed (3/3).\n',
  )
} finally {
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
  await rm(root, { recursive: true, force: true, maxRetries: 3 })
}
