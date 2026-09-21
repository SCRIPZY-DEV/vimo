// Un rechazo de la CUENTA del proveedor de imágenes (saldo agotado, clave
// inválida, cuenta bloqueada) tiene que cortar la fase con su código — no
// tragarse escena por escena hasta morir en `images_incomplete`. Proveedores
// HTTP simulados, proyectos temporales; nada de esto gasta créditos.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import { resolveProjectPaths } from '../../pipeline/project/paths.ts'
import { writeScenes } from '../../pipeline/project/scenes-file.ts'
import { buildCreateVideoContext } from '../../pipeline/stages/context.ts'
import { imagesStage } from '../../pipeline/stages/images/images.ts'
import { uploadEvolinkReference } from '../../pipeline/providers/image/evolink.ts'
import {
  isInsufficientCreditsCode,
  isInsufficientCreditsResponse,
  isInsufficientTaskError,
} from '../../pipeline/utils/insufficient-credits.ts'

const EVOLINK_CREATE = 'https://api.evolink.ai/v1/images/generations'
const EVOLINK_CREDITS = 'https://api.evolink.ai/v1/credits'
const EVOLINK_TASKS = 'https://api.evolink.ai/v1/tasks/'
const EVOLINK_UPLOAD = 'https://files-api.evolink.ai/'
const FAL_IMAGE = 'https://fal.run/fal-ai/gpt-image-2'
const FAL_EDIT = 'https://fal.run/openai/gpt-image-2/edit'
const FAL_BILLING = 'https://api.fal.ai/v1/account/billing'

const SCENE_COUNT = 3
const gem =
  'Render every scene as a hand-drawn watercolor illustration with indigo washes and rough paper.'
const bytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFOsAAAAASUVORK5CYII=',
  'base64',
)

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
// Un rechazo que NO dice «saldo» de ninguna forma que el patrón reconozca: el
// caso que antes se leía como clave inválida.
const opaqueForbidden = () =>
  json(403, { error: { code: 'forbidden', message: 'Access denied' } })
const evolinkCredits = (remaining) =>
  json(200, {
    data: { user: { remaining_credits: remaining, used_credits: 9 } },
  })

async function fixture(t, { provider, photo = false }) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-image-account-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const paths = resolveProjectPaths(join(root, 'fixture'), 'fixture')
  await mkdir(paths.scenesDirectory, { recursive: true })
  await mkdir(paths.charactersDirectory, { recursive: true })
  if (photo)
    await writeFile(join(paths.charactersDirectory, 'reference.png'), bytes)

  const metadata = {
    id: 'fixture',
    name: 'Fixture',
    options: {
      styleId: 'normal',
      imageProvider: provider,
      imageQuality: 'low',
      videoFormat: '16:9',
      // Estilo propio: la fase de imágenes no necesita la biblia visual (LLM).
      customStyle: {
        id: 'fixture',
        name: 'Watercolor',
        systemPrompt: gem,
        character: { mode: photo ? 'own' : 'none' },
      },
      ...(photo
        ? {
            characters: [
              {
                name: 'Elena',
                description: 'a young astronaut with brown hair',
                mode: 'photo',
                referenceImageFile: 'reference.png',
              },
            ],
          }
        : {}),
    },
    state: 'generating',
    completedStages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  await writeFile(paths.metadataFile, JSON.stringify(metadata))
  await writeFile(paths.scriptFile, 'Elena repairs a red antenna.')
  await writeScenes(
    paths,
    Array.from({ length: SCENE_COUNT }, (_, index) => ({
      id: index + 1,
      text: `Elena repairs antenna number ${index + 1}.`,
      startSeconds: index * 4,
      endSeconds: (index + 1) * 4,
      ...(photo ? { charactersPresent: [0] } : {}),
      imagePrompt: `Elena repairs red antenna number ${index + 1} beside a greenhouse. Style: watercolor.`,
    })),
  )

  const events = []
  const base = {
    job: {
      jobId: 'fixture',
      projectsRoot: root,
      apiKeys: { deepinfra: 'fixture', fal: 'fixture', evolink: 'fixture' },
      binaryPaths: {},
    },
    config: resolvePipelineConfig(),
    signal: new AbortController().signal,
    emitter: {
      emit(event) {
        events.push(event)
      },
    },
  }
  return { base, events }
}

// Cuenta los pedidos por destino y delega la respuesta en `respond`.
function providers(t, respond) {
  const calls = {
    create: 0,
    credits: 0,
    poll: 0,
    fal: 0,
    falEdit: 0,
    billing: 0,
  }
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = String(input)
    if (url === EVOLINK_CREATE) calls.create++
    else if (url === EVOLINK_CREDITS) calls.credits++
    else if (url.startsWith(EVOLINK_TASKS)) calls.poll++
    else if (url === FAL_IMAGE) calls.fal++
    else if (url === FAL_EDIT) calls.falEdit++
    else if (url.startsWith(FAL_BILLING)) calls.billing++
    else assert.fail(`unexpected request to ${url}`)
    return respond(url)
  })
  return calls
}

async function runImages(base) {
  const context = await buildCreateVideoContext(base, 'fixture')
  return imagesStage.run(context)
}
function rejectsWith(code) {
  return (error) => {
    assert.equal(error.code, code, error.message)
    return true
  }
}

// ── La detección por texto ──

test('gateway wordings of an empty balance are recognized, a rate limit never is', () => {
  for (const body of [
    'insufficient user quota',
    'Insufficient account balance',
    'Your balance is not enough',
    'User is locked. Reason: Exhausted balance. Top up your balance at fal.ai/dashboard/billing.',
    'pre_consume_token_quota_failed',
    '用户余额不足',
  ])
    assert.ok(isInsufficientCreditsResponse(403, body), body)

  for (const body of ['Access denied', 'invalid api key', 'model not found'])
    assert.equal(isInsufficientCreditsResponse(403, body), false, body)

  assert.equal(isInsufficientCreditsResponse(429, 'insufficient quota'), false)
  assert.ok(isInsufficientTaskError('insufficient_user_quota', ''))
})

// ── Evolink ──

test('evolink: an opaque 403 with an empty balance pauses the job for credits, asking the balance once', async (t) => {
  const { base } = await fixture(t, { provider: 'evolink' })
  const calls = providers(t, (url) =>
    url === EVOLINK_CREDITS ? evolinkCredits(0) : opaqueForbidden(),
  )

  await assert.rejects(
    runImages(base),
    rejectsWith('image_insufficient_credits'),
  )
  assert.ok(isInsufficientCreditsCode('image_insufficient_credits'))
  assert.equal(
    calls.credits,
    1,
    'una sola lectura de saldo para todas las escenas',
  )
  assert.ok(
    calls.create <= SCENE_COUNT,
    'sin reintentos ni pasadas de recuperación',
  )
})

test('evolink: an opaque 403 whose key also fails the balance check is an invalid key, terminal', async (t) => {
  const { base, events } = await fixture(t, { provider: 'evolink' })
  const calls = providers(t, (url) =>
    url === EVOLINK_CREDITS
      ? json(401, { error: 'unauthorized' })
      : opaqueForbidden(),
  )

  await assert.rejects(runImages(base), rejectsWith('image_invalid_api_key'))
  assert.ok(calls.create <= SCENE_COUNT, 'sin pasadas de recuperación')
  assert.equal(
    events.filter((event) => event.type === 'scene-image-failed').length,
    0,
    'ya no se traga escena por escena',
  )
})

test('evolink: an opaque 403 with balance left is the account being refused, not credits', async (t) => {
  const { base } = await fixture(t, { provider: 'evolink' })
  providers(t, (url) =>
    url === EVOLINK_CREDITS ? evolinkCredits(1200) : opaqueForbidden(),
  )
  await assert.rejects(runImages(base), rejectsWith('image_account_rejected'))
})

test('evolink: a balance answer without the balance field is not read as zero', async (t) => {
  const { base } = await fixture(t, { provider: 'evolink' })
  providers(t, (url) =>
    url === EVOLINK_CREDITS ? json(200, { data: {} }) : opaqueForbidden(),
  )
  await assert.rejects(runImages(base), rejectsWith('image_account_rejected'))
})

test('evolink: a recognized wording is classified by its text, without asking the balance', async (t) => {
  const { base } = await fixture(t, { provider: 'evolink' })
  const calls = providers(t, () =>
    json(403, { error: { message: 'insufficient user quota' } }),
  )
  await assert.rejects(
    runImages(base),
    rejectsWith('image_insufficient_credits'),
  )
  assert.equal(calls.credits, 0)
})

test('evolink: an opaque 400 with an empty balance is credits too, before any retry wait', async (t) => {
  const { base } = await fixture(t, { provider: 'evolink' })
  const calls = providers(t, (url) =>
    url === EVOLINK_CREDITS
      ? evolinkCredits(0)
      : json(400, { error: { message: 'request could not be processed' } }),
  )
  await assert.rejects(
    runImages(base),
    rejectsWith('image_insufficient_credits'),
  )
  assert.equal(calls.credits, 1)
  assert.ok(calls.create <= SCENE_COUNT)
})

test('evolink: a 2xx that carries the balance error instead of a task id is credits', async (t) => {
  const { base } = await fixture(t, { provider: 'evolink' })
  providers(t, () =>
    json(200, { error: { message: 'Insufficient account balance' } }),
  )
  await assert.rejects(
    runImages(base),
    rejectsWith('image_insufficient_credits'),
  )
})

test('evolink: a balance rejection that only shows up while polling is credits', async (t) => {
  const { base } = await fixture(t, { provider: 'evolink' })
  const calls = providers(t, (url) =>
    url === EVOLINK_CREATE
      ? json(200, { id: 'task-1' })
      : json(403, { error: { message: 'balance is not enough' } }),
  )
  await assert.rejects(
    runImages(base),
    rejectsWith('image_insufficient_credits'),
  )
  assert.ok(calls.poll >= 1)
})

test('evolink: a reference upload rejected for balance surfaces, other upload failures still degrade', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input) => {
    assert.ok(String(input).startsWith(EVOLINK_UPLOAD))
    return json(403, { message: 'insufficient user quota' })
  })
  await assert.rejects(
    uploadEvolinkReference('data:image/png;base64,AAAA', 'fixture'),
    rejectsWith('image_insufficient_credits'),
  )
  t.mock.restoreAll()

  t.mock.method(globalThis, 'fetch', async () => json(500, { message: 'oops' }))
  assert.equal(
    await uploadEvolinkReference('data:image/png;base64,AAAA', 'fixture'),
    null,
  )
})

// ── Fal ──

// El cuerpo de abajo es el texto ESPERADO de Fal con la cuenta bloqueada, no
// uno capturado: reemplazarlo por el literal cuando se pruebe con una clave
// real sin saldo.
test('fal: the expected locked-account wording is credits by its text', async (t) => {
  const { base } = await fixture(t, { provider: 'fal' })
  const calls = providers(t, () =>
    json(403, {
      detail:
        'User is locked. Reason: Exhausted balance. Top up your balance at fal.ai/dashboard/billing.',
    }),
  )
  await assert.rejects(
    runImages(base),
    rejectsWith('image_insufficient_credits'),
  )
  assert.equal(calls.billing, 0)
})

test('fal: an opaque 403 with an empty balance is credits', async (t) => {
  const { base } = await fixture(t, { provider: 'fal' })
  const calls = providers(t, (url) =>
    url.startsWith(FAL_BILLING)
      ? json(200, { credits: { current_balance: 0, currency: 'USD' } })
      : json(403, { detail: 'Forbidden' }),
  )
  await assert.rejects(
    runImages(base),
    rejectsWith('image_insufficient_credits'),
  )
  assert.equal(calls.billing, 1)
})

test('fal: a rejected key is terminal instead of burning the recovery passes', async (t) => {
  const { base, events } = await fixture(t, { provider: 'fal' })
  const calls = providers(t, () => json(401, { detail: 'Invalid key' }))

  await assert.rejects(runImages(base), rejectsWith('image_invalid_api_key'))
  assert.ok(calls.fal <= SCENE_COUNT, 'sin pasadas de recuperación')
  assert.equal(
    events.filter((event) => event.type === 'scene-image-failed').length,
    0,
  )
})

test('fal: a 403 with a non-admin key cannot read the balance and is reported as the account being refused', async (t) => {
  const { base } = await fixture(t, { provider: 'fal' })
  providers(t, (url) =>
    url.startsWith(FAL_BILLING)
      ? json(403, { detail: 'admin key required' })
      : json(403, { detail: 'Forbidden' }),
  )
  await assert.rejects(runImages(base), rejectsWith('image_account_rejected'))
})

test('fal: the reference lane surfaces the account rejection instead of falling back to the normal lane', async (t) => {
  const { base } = await fixture(t, { provider: 'fal', photo: true })
  const calls = providers(t, (url) =>
    url.startsWith(FAL_BILLING)
      ? json(200, { credits: { current_balance: 0, currency: 'USD' } })
      : json(403, { detail: 'Forbidden' }),
  )
  await assert.rejects(
    runImages(base),
    rejectsWith('image_insufficient_credits'),
  )
  assert.ok(calls.falEdit >= 1)
  assert.equal(calls.fal, 0, 'no cae al carril normal a repetir el rechazo')
})
