// «Crear personaje con mi estilo» con una gema de plantilla (propuesta P1 del
// plan del sidecar): design-style-character recibe las secciones y usa la
// gema como texto (`composeGemText`), sin la sección `character` y SIN el
// inicio ni el final fijos: el personaje diseñado se teje después en cada
// escena, donde el código ya pega esas frases por su cuenta, y una copia en la
// ficha saldría duplicada en cada prompt. La gema vieja, como siempre. LLM
// simulado.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import { designStyleCharacter } from '../../pipeline/commands/styles/design-style-character.ts'
import {
  FIXED_END_HEADING,
  FIXED_START_HEADING,
  composeGemText,
} from '../../pipeline/prompts/template-frame.ts'

const sections = {
  visualStyle: 'Simple stickman drawings on colorful backgrounds.',
  character:
    'A stickman doll with a round white head. Outfit: white gloves and white shoes.',
  camera: 'Alternate wide shots and close-ups.',
  promptStart: 'Hand-drawn stickman scene,',
  promptEnd: 'bold black outlines on a flat colorful backdrop.',
}
const script =
  'Elena repara una antena roja fuera de la estación y sonríe a las estrellas.'
const sheet = {
  nombre: 'Elena',
  edad: '32 años',
  rol: 'ingeniera',
  descripcion:
    'Shoulder-length curly red hair, round green glasses, a teal work jacket over a grey shirt, dark cargo pants, sturdy brown boots, slim build, freckled light skin.',
}

function context(payload) {
  return {
    job: {
      jobId: 'fixture',
      apiKeys: { deepinfra: 'fixture' },
      binaryPaths: {},
      payload: { script, ...payload },
    },
    config: resolvePipelineConfig(),
    signal: new AbortController().signal,
    emitter: { emit() {} },
  }
}
function llm(t) {
  const requests = []
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    requests.push(JSON.parse(init.body))
    return new Response(
      'data: ' +
        JSON.stringify({
          choices: [
            {
              delta: { content: JSON.stringify(sheet) },
              finish_reason: 'stop',
            },
          ],
        }) +
        '\n\ndata: [DONE]\n\n',
      { headers: { 'content-type': 'text/event-stream' } },
    )
  })
  return requests
}

test('a template gem travels as its text, without the character section', async (t) => {
  const requests = llm(t)
  const result = await designStyleCharacter(context({ sections }))
  assert.equal(result.name, 'Elena')
  assert.equal(requests.length, 1)
  const user = requests[0].messages[1].content
  assert.ok(
    user.includes(
      '"""\n' + composeGemText(sections, { fixedPhrases: false }) + '\n"""',
    ),
  )
  assert.ok(!user.includes('stickman doll with a round white head'))
})

test('the fixed start and end never reach a designed character', async (t) => {
  // Precondición: con las frases por defecto el texto SÍ las llevaría; sin
  // esto el caso pasaría vacío aunque el sidecar llamara a composeGemText a
  // secas.
  assert.ok(composeGemText(sections).includes(sections.promptStart))
  assert.ok(composeGemText(sections).includes(sections.promptEnd))

  const requests = llm(t)
  await designStyleCharacter(context({ sections }))
  const sent = requests[0].messages.map((message) => message.content).join('\n')
  for (const text of [
    sections.promptStart,
    sections.promptEnd,
    FIXED_START_HEADING,
    FIXED_END_HEADING,
  ])
    assert.ok(!sent.includes(text), 'the request carries: ' + text)
})

test('a template gem with only its visual style still designs the character', async (t) => {
  const requests = llm(t)
  const result = await designStyleCharacter(
    context({ sections: { visualStyle: '  Render every scene as clay.  ' } }),
  )
  assert.equal(result.name, 'Elena')
  assert.ok(
    requests[0].messages[1].content.includes(
      '"""\n' +
        composeGemText({ visualStyle: 'Render every scene as clay.' }) +
        '\n"""',
    ),
  )
})

test('an old gem travels as always', async (t) => {
  const requests = llm(t)
  await designStyleCharacter(
    context({ gem: '  Render every scene as a watercolor.  ' }),
  )
  assert.ok(
    requests[0].messages[1].content.includes(
      '"""\nRender every scene as a watercolor.\n"""',
    ),
  )
})

for (const [name, payload, message] of [
  [
    'both kinds of gem',
    { gem: 'Watercolor.', sections },
    'payload.gem and payload.sections are mutually exclusive',
  ],
  ['neither kind of gem', {}, 'payload.gem is required'],
  [
    'an old gem over the limit',
    { gem: 'a'.repeat(100_001) },
    'payload.gem is too long',
  ],
  [
    'broken sections',
    { sections: { visualStyle: ' ' } },
    'payload.sections.visualStyle is required',
  ],
  [
    'a character section over its limit',
    { sections: { visualStyle: 'Watercolor.', character: 'a'.repeat(701) } },
    'payload.sections.character exceeds 700 characters',
  ],
  [
    'sections that are not an object',
    { sections: 'Watercolor.' },
    'payload.sections must be an object',
  ],
]) {
  test(
    'design-style-character rejects ' + name + ' before any request',
    async (t) => {
      const requests = llm(t)
      await assert.rejects(designStyleCharacter(context(payload)), {
        code: 'invalid_payload',
        message,
      })
      assert.equal(requests.length, 0)
    },
  )
}
