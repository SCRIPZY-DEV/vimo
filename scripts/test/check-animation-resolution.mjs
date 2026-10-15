// Resolución interna de la animación (demo v4, design.md §5): por defecto
// 480p como siempre; el harness la sube a 720p por el config del job.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import { animationFrame } from '../../pipeline/types/video-provider.ts'
import {
  KIE_GROK_MODEL,
  createKieVideoProvider,
} from '../../pipeline/providers/video/kie.ts'

test('without overrides the animation stays at 480p', () => {
  assert.equal(resolvePipelineConfig().animation.resolution, '480p')
  assert.equal(resolvePipelineConfig({}).animation.resolution, '480p')
})

test('the job config can raise it to 720p', () => {
  const config = resolvePipelineConfig({ animation: { resolution: '720p' } })
  assert.equal(config.animation.resolution, '720p')
  assert.equal(
    config.demo.packVersion,
    resolvePipelineConfig().demo.packVersion,
  )
})

test('the normalization frame follows format and resolution', () => {
  assert.deepEqual(animationFrame('16:9', '480p'), { width: 854, height: 480 })
  assert.deepEqual(animationFrame('9:16', '480p'), { width: 480, height: 854 })
  assert.deepEqual(animationFrame('16:9', '720p'), { width: 1280, height: 720 })
  assert.deepEqual(animationFrame('9:16', '720p'), { width: 720, height: 1280 })
})

test('Kie receives the requested resolution', async (t) => {
  const bodies = []
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    bodies.push(JSON.parse(init.body))
    return new Response(
      JSON.stringify({ code: 200, data: { taskId: 'task-1' } }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    )
  })
  const provider = createKieVideoProvider(KIE_GROK_MODEL)
  const request = {
    prompt: 'a calm river',
    imageUrls: ['https://example.com/a.jpg'],
    durationSeconds: 6,
    aspectRatio: '16:9',
  }
  await provider.createTask(
    { ...request, resolution: '720p' },
    'key',
    AbortSignal.timeout(5000),
  )
  await provider.createTask(
    { ...request, resolution: '480p' },
    'key',
    AbortSignal.timeout(5000),
  )
  assert.deepEqual(
    bodies.map((body) => body.input.resolution),
    ['720p', '480p'],
  )
})
