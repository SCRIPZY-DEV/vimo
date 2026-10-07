// El retrato de un personaje con un estilo propio (Mi estilo, un estilo
// clonado con IA o una gema del catálogo nuevo) se arma como una escena del
// video (enmienda del 2026-10-04 a la ADR-0021): la gema escribe solo la
// escena del retrato con `[subject]`, con DeepSeek V4.1 Flash y V3.2 de
// respaldo, y la descripción guardada del personaje se pega palabra por
// palabra al final, antes del cierre fijo del estilo. El sujeto se nombra
// «the character»: una sola figura, y el rol que el video saca de la primera
// frase a veces es un rasgo («Long», de «Long, dark brown hair…»). Antes la
// escribía el tier balanced (Qwen3 235B: de 40 a 57 s, y 2 de 6 pedidos con
// `llm_rate_limited` el 2026-10-04) y reescribía la descripción a su manera.
// HTTP interceptado: sin red.

import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { generateCharacterPreview } from '../../pipeline/commands/characters/generate-character-preview.ts'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import { applyFixedPhrases } from '../../pipeline/prompts/template-frame.ts'
import { DESCRIPTION_HEADER } from '../../pipeline/prompts/verbatim-identity.ts'

const PORTRAIT_MODEL = 'deepseek-ai/DeepSeek-V4.1-Flash'
const BACKUP_MODEL = 'deepseek-ai/DeepSeek-V3.2'
const bytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFOsAAAAASUVORK5CYII=',
  'base64',
)
const identityPrompt =
  'A tall woman with short silver hair, round glasses and a green raincoat.'
const portraitScene =
  'Full-body view of [subject] standing, facing the camera, on a plain neutral background.'
const sections = {
  visualStyle: 'Hand-drawn watercolor with indigo washes.',
  promptStart: 'A watercolor illustration:',
  promptEnd: 'Indigo washes on rough paper.',
}

// La escena con el sujeto neutro y la descripción pegada con el encabezado de
// las escenas del video (las escenas de estos casos terminan en punto).
function woven(scene, identity = identityPrompt) {
  return `${scene.replaceAll('[subject]', 'the character')} ${DESCRIPTION_HEADER} ${identity}`
}

// Una galería con una gema de plantilla y una de texto.
async function gallery(t) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-custom-portrait-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const styles = {
    'st-acuarela': { name: 'Acuarela', sections, templateVersion: 1 },
    'st-arcilla': {
      name: 'Arcilla',
      systemPrompt:
        'You write claymation image prompts. End each one with: Style: claymation, soft clay textures.',
      shots: [],
    },
  }
  for (const [styleId, style] of Object.entries(styles)) {
    const directory = join(root, '_styles', styleId)
    await mkdir(directory, { recursive: true })
    await writeFile(
      join(directory, 'style.json'),
      JSON.stringify({ ...style, createdAt: '2026-10-04T00:00:00.000Z' }),
    )
  }
  return root
}
function context(
  root,
  styleId,
  { signal = new AbortController().signal, identity = identityPrompt } = {},
) {
  return {
    job: {
      jobId: 'fixture',
      projectsRoot: root,
      apiKeys: { deepinfra: 'fixture', fal: 'fixture' },
      binaryPaths: {},
      payload: { styleId, identityPrompt: identity, provider: 'fal' },
    },
    config: resolvePipelineConfig(),
    signal,
    emitter: { emit() {} },
  }
}
function sceneAnswer(scene) {
  return Response.json({
    choices: [
      { message: { content: JSON.stringify({ prompt_imagen: scene }) } },
    ],
  })
}
// Cada pedido de texto lo contesta `answer` (recibe el cuerpo y el número de
// pedido); Fal devuelve una imagen. Se guardan los pedidos.
function mockProviders(t, answer) {
  const requests = { text: [], images: [] }
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    const target = String(url)
    if (target.includes('chat/completions')) {
      const body = JSON.parse(init.body)
      requests.text.push(body)
      return answer(body, requests.text.length)
    }
    if (target.startsWith('https://fal.run/')) {
      requests.images.push(JSON.parse(init.body))
      return Response.json({ images: [{ url: 'https://fixture.invalid/x' }] })
    }
    return new Response(bytes, { headers: { 'content-type': 'image/png' } })
  })
  return requests
}

test('a custom style asks DeepSeek V4.1 Flash for the portrait scene, without the description', async (t) => {
  const root = await gallery(t)
  const requests = mockProviders(t, () => sceneAnswer(portraitScene))
  await generateCharacterPreview(context(root, 'st-acuarela'))

  assert.equal(requests.text.length, 1)
  assert.equal(requests.text[0].model, PORTRAIT_MODEL)
  const user = requests.text[0].messages.at(-1).content
  assert.ok(
    !user.includes('silver hair'),
    'the model never sees the description',
  )
  assert.match(user, /\[subject\]/)
})

test('the description is woven word for word before the fixed end, as in a video scene', async (t) => {
  const root = await gallery(t)
  const requests = mockProviders(t, () => sceneAnswer(portraitScene))
  const result = await generateCharacterPreview(context(root, 'st-acuarela'))

  assert.equal(
    result.finalPrompt,
    applyFixedPhrases(woven(portraitScene), sections),
  )
  assert.doesNotMatch(result.finalPrompt, /\[subject\]/i)
  assert.equal(requests.images[0].prompt, result.finalPrompt)
})

test('a text gem gets the description after the scene it wrote, with no fixed phrases', async (t) => {
  const root = await gallery(t)
  const scene = `${portraitScene} Style: claymation, soft clay textures.`
  mockProviders(t, () => sceneAnswer(scene))
  const result = await generateCharacterPreview(context(root, 'st-arcilla'))

  assert.equal(result.finalPrompt, woven(scene))
})

test('the portrait names the character neutrally, never with a feature taken for a role', async (t) => {
  const root = await gallery(t)
  const identity =
    'Long, dark brown hair in a braid, round glasses and a khaki field vest.'
  mockProviders(t, () => sceneAnswer(portraitScene))
  const result = await generateCharacterPreview(
    context(root, 'st-acuarela', { identity }),
  )

  assert.equal(
    result.finalPrompt,
    applyFixedPhrases(woven(portraitScene, identity), sections),
  )
  assert.doesNotMatch(result.finalPrompt, /view of Long/)
})

// Medido el 2026-10-04 con CLAYMATION: «character model of a [subject]»
// quedaba «of a the character».
test('an article the model wrote before [subject] is not doubled', async (t) => {
  const root = await gallery(t)
  mockProviders(t, () =>
    sceneAnswer(
      'Full body claymation model of a [subject], standing on a plain neutral background.',
    ),
  )
  const result = await generateCharacterPreview(context(root, 'st-arcilla'))

  assert.ok(
    result.finalPrompt.startsWith(
      'Full body claymation model of the character, standing',
    ),
    result.finalPrompt,
  )
})

test('a scene that forgets [subject] still carries the description', async (t) => {
  const root = await gallery(t)
  const scene =
    'Full-body view of a woman standing, facing the camera, on a plain neutral background.'
  mockProviders(t, () => sceneAnswer(scene))
  const result = await generateCharacterPreview(context(root, 'st-acuarela'))

  assert.ok(
    result.finalPrompt.includes(`${DESCRIPTION_HEADER} ${identityPrompt}`),
    result.finalPrompt,
  )
  assert.ok(result.finalPrompt.endsWith(sections.promptEnd))
})

test('if V4.1 Flash fails or answers empty, V3.2 writes the scene', async (t) => {
  const root = await gallery(t)
  for (const failure of [
    () => new Response('upstream down', { status: 500 }),
    () => Response.json({ choices: [{ message: { content: '' } }] }),
  ]) {
    const requests = mockProviders(t, (body, count) =>
      count === 1 ? failure() : sceneAnswer(portraitScene),
    )
    const result = await generateCharacterPreview(context(root, 'st-acuarela'))

    assert.deepEqual(
      requests.text.map((request) => request.model),
      [PORTRAIT_MODEL, BACKUP_MODEL],
    )
    assert.ok(result.finalPrompt.includes(identityPrompt))
    t.mock.restoreAll()
  }
})

test('a key problem stops without asking the backup or buying the image', async (t) => {
  const root = await gallery(t)
  const requests = mockProviders(
    t,
    () => new Response('unauthorized', { status: 401 }),
  )

  await assert.rejects(generateCharacterPreview(context(root, 'st-acuarela')), {
    code: 'llm_auth',
  })
  assert.equal(requests.text.length, 1)
  assert.equal(requests.images.length, 0)
})

test('when both models fail the preview fails with the provider error before buying the image', async (t) => {
  const root = await gallery(t)
  const requests = mockProviders(
    t,
    () => new Response('upstream down', { status: 500 }),
  )

  await assert.rejects(generateCharacterPreview(context(root, 'st-acuarela')), {
    code: 'llm_provider_error',
  })
  assert.deepEqual(
    requests.text.map((request) => request.model),
    [PORTRAIT_MODEL, BACKUP_MODEL],
  )
  assert.equal(requests.images.length, 0)
})

test('a cancelled preview does not ask the backup', async (t) => {
  const root = await gallery(t)
  const controller = new AbortController()
  const requests = mockProviders(t, () => {
    controller.abort()
    throw new DOMException('The operation was aborted.', 'AbortError')
  })

  await assert.rejects(
    generateCharacterPreview(
      context(root, 'st-acuarela', { signal: controller.signal }),
    ),
  )
  assert.equal(requests.text.length, 1)
  assert.equal(requests.images.length, 0)
})
