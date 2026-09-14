// Fichas reales del sidecar, con HTTP interceptado: ninguna clave ni cargo real.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { suggestCharacterProfile } from '../../pipeline/commands/characters/suggest-character-profile.ts'
import { designStyleCharacter } from '../../pipeline/commands/styles/design-style-character.ts'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'

const identity =
  'Bald astronaut with thick round glasses, a white and blue space suit, broad shoulders, a round face and brown eyes.'
for (const mode of ['catalog', 'style']) {
  for (const scenario of [
    'complete',
    'numeric-age',
    'missing-age',
    'missing-name',
    'missing-role',
    'still-incomplete',
    'preserve-input',
    'stripped-description',
    'provider-error',
    'auth',
    'credits',
    'cancel',
  ]) {
    test(mode + ': complete identity sheet / ' + scenario, async (t) => {
      const controller = new AbortController()
      const input = {
        script:
          'An astronaut named Ana explores the station. She is seventy years old and commands the mission.',
        ...(mode === 'style'
          ? { gem: 'A bright minimal space adventure.' }
          : {}),
        ...(scenario === 'preserve-input'
          ? { name: 'Elena', age: '52 años', role: 'Piloto' }
          : {}),
      }
      const context = {
        job: {
          jobId: 'fixture',
          apiKeys: { deepinfra: 'fake' },
          binaryPaths: {},
          payload: input,
        },
        config: resolvePipelineConfig(),
        signal: controller.signal,
        emitter: { emit() {} },
      }
      let calls = 0
      t.mock.method(globalThis, 'fetch', async (_url, init) => {
        calls++
        const request = JSON.parse(init.body)
        if (calls === 2) {
          assert.ok(
            request.messages.some(
              (message) =>
                message.content.includes('BORRADOR INCOMPLETO') ||
                message.content.includes('PREVIOUS INCOMPLETE DRAFT'),
            ),
          )
          assert.ok(
            request.messages.some(
              (message) =>
                message.content.includes(identity) ||
                message.content.includes('cartoon'),
            ),
          )
        }
        if (scenario === 'provider-error')
          return new Response('', { status: 503 })
        if (scenario === 'auth')
          return new Response('invalid key', { status: 401 })
        if (scenario === 'credits')
          return new Response('insufficient balance', { status: 402 })
        if (scenario === 'cancel') controller.abort()
        const fields = {
          name: 'Ana',
          age: scenario === 'numeric-age' ? 0 : '70 años',
          role: 'Astronauta',
          prompt: identity,
        }
        if (scenario.startsWith('missing-') && calls === 1)
          delete fields[scenario.slice('missing-'.length)]
        if (scenario === 'still-incomplete') fields.age = '   '
        if (scenario === 'stripped-description')
          fields.prompt = 'cartoon '.repeat(20)
        const data =
          mode === 'catalog'
            ? fields
            : {
                nombre: fields.name,
                edad: fields.age,
                rol: fields.role,
                descripcion: fields.prompt,
              }
        const text = JSON.stringify(data)
        if (request.stream)
          return new Response(
            'data: ' +
              JSON.stringify({
                choices: [{ delta: { content: text }, finish_reason: 'stop' }],
              }) +
              '\n\ndata: [DONE]\n\n',
            { headers: { 'content-type': 'text/event-stream' } },
          )
        return Response.json({ choices: [{ message: { content: text } }] })
      })
      const run =
        mode === 'catalog' ? suggestCharacterProfile : designStyleCharacter
      if (
        [
          'still-incomplete',
          'stripped-description',
          'provider-error',
          'auth',
          'credits',
          'cancel',
        ].includes(scenario)
      ) {
        await assert.rejects(run(context))
        assert.equal(
          calls,
          ['still-incomplete', 'stripped-description'].includes(scenario)
            ? 2
            : 1,
        )
        return
      }
      const result = await run(context)
      for (const key of ['name', 'age', 'role', 'prompt'])
        assert.ok(
          typeof result[key] === 'string' && result[key].trim(),
          key + ' must be filled',
        )
      assert.equal(
        result.age,
        scenario === 'numeric-age'
          ? '0'
          : scenario === 'preserve-input'
            ? '52 años'
            : '70 años',
      )
      if (scenario === 'preserve-input') {
        assert.equal(result.name, 'Elena')
        assert.equal(result.role, 'Piloto')
      }
      assert.equal(calls, scenario.startsWith('missing-') ? 2 : 1)
    })
  }
}
