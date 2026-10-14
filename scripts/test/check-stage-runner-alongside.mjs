// Dos fases a la vez en el runner (entrega 2h, diseño §24.1): una fase que
// declara `runsAlongside` arranca junto con la que acompaña. Con fases falsas,
// sin disco ni red: el avatar arranca antes de que terminen las imágenes; los
// `skip()` en orden (las salteadas avisan antes de arrancar) y después los
// `stage-started` de las dos, imágenes primero; cada una avisa que terminó y
// pasa por el gancho apenas termina, en los dos órdenes; las reglas del fallo
// (falla la que manda → la acompañante se corta con SU señal, sin tocar la del
// job, y se la espera antes de salir con el fallo de la que manda; falla la
// acompañante → la que manda termina, avisa y pasa por el gancho, y después
// sale el fallo de la acompañante; fallan las dos → gana la que manda y el
// fallo propio de la otra va como aviso con su código, el eco de una
// cancelación no; un gancho que falla es el fallo de su fase); la cancelación
// del job; la pausa, que espera a la otra (y que un fallo le gana); y una fase
// sin acompañante, o una acompañante sin la suya antes en la lista, como
// siempre. Y project.json en el disco (una carpeta temporal): la fila de
// escrituras, con la marca de video desactualizado del avatar
// (`markStoredVideoOutdated`) cruzada con el gancho que anota
// `completedStages`, en los dos órdenes: ninguna escritura pierde lo de la
// otra. Y el pipeline real (`run-video-pipeline`) con las imágenes y el avatar
// juntos, Fal y HeyGen simulados en un solo `fetch` y el ffmpeg del repo: el
// avatar pide su render mientras las imágenes esperan a Fal (la escritura de
// las imágenes conserva ese recibo), termina después de ellas (su escritura
// conserva lo de las imágenes) y el proyecto queda con todo en disco; y si
// las imágenes fallan con el render del avatar en vuelo, el avatar se corta,
// su recibo queda guardado y el job sale con el fallo de las imágenes.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { videosSubcommands } from '../../pipeline/commands/videos/subcommands.ts'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import {
  markStoredVideoOutdated,
  writeProjectMetadata,
} from '../../pipeline/project/metadata.ts'
import { PipelineFailure } from '../../pipeline/runner/failure.ts'
import { runStages } from '../../pipeline/runner/run-stages.ts'
import { buildCreateVideoContext } from '../../pipeline/stages/context.ts'
import {
  FFMPEG,
  ORIGINAL_FETCH,
  json,
  writeHeyGenClip,
  writeNarration,
} from './avatar-fixture.mjs'

// ─── Fases falsas ───

function deferred() {
  let resolve
  let reject
  const promise = new Promise((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

// Un contexto mínimo: el runner solo usa la señal y el emisor.
function runnerContext() {
  const events = []
  const controller = new AbortController()
  const context = {
    job: { jobId: 'runner-fixture', apiKeys: {}, binaryPaths: {} },
    config: resolvePipelineConfig(),
    signal: controller.signal,
    emitter: { emit: (event) => events.push(event) },
  }
  return { context, events, controller }
}

// Una fase falsa que anota con qué contexto corrió, si su señal estaba
// cancelada al terminar y cuándo terminó (`settledAt`, un contador global de
// pasos). `run` hace lo que pide el test con ese contexto.
let step = 0
function fakeStage(id, { runsAlongside, skip = false, run, skips } = {}) {
  const record = {
    runs: 0,
    context: undefined,
    abortedWhenSettled: undefined,
    settledAt: undefined,
  }
  const stage = {
    id,
    async skip() {
      skips?.push(id)
      return skip
    },
    async run(context) {
      record.runs++
      record.context = context
      try {
        return await run?.(context)
      } finally {
        record.abortedWhenSettled = context.signal.aborted
        record.settledAt = ++step
      }
    },
  }
  if (runsAlongside) stage.runsAlongside = runsAlongside
  return { stage, record }
}

// Una promesa que rechaza cuando la señal se cancela, como una fase real que
// espera a un proveedor. `cleanupMs`: lo que tarda en soltar (guardar recibos).
function untilAborted(signal, cleanupMs = 0) {
  return new Promise((_resolve, reject) => {
    const abort = () => {
      setTimeout(() => reject(signal.reason), cleanupMs)
    }
    if (signal.aborted) return abort()
    signal.addEventListener('abort', abort, { once: true })
  })
}

// Falla si `promise` no resuelve en `ms`: un runner que no corre las dos a la
// vez da rojo en vez de colgar el guard.
function within(promise, ms, label) {
  let timer
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout: ${label}`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

// Cede hasta que corran todas las microtareas pendientes (registro de errores
// conocidos: una aserción de ausencia necesita un turno de macrotarea).
const settleMicrotasks = () => new Promise((done) => setImmediate(done))

const stageEvents = (events) =>
  events
    .filter((event) => event.type.startsWith('stage-'))
    .map((event) => `${event.type.slice('stage-'.length)}:${event.stageId}`)
const warnings = (events) =>
  events.filter((event) => event.type === 'log' && event.level === 'warn')

// Un gancho que anota y avisa cuando corre para una fase.
function recordingHooks() {
  const completed = []
  const waiters = new Map()
  return {
    completed,
    // Resuelve cuando el gancho corrió para esa fase.
    reached(stageId) {
      if (completed.includes(stageId)) return Promise.resolve()
      const waiter = deferred()
      waiters.set(stageId, waiter)
      return waiter.promise
    },
    hooks: {
      onStageCompleted(stageId) {
        completed.push(stageId)
        waiters.get(stageId)?.resolve()
      },
    },
  }
}

// ─── El grupo: arranque y terminación ───

test('el avatar arranca antes de que terminen las imágenes: los dos `stage-started` (imágenes primero) antes de cualquier terminación', async () => {
  const { context, events } = runnerContext()
  const avatarStarted = deferred()
  const imagesSawAvatar = deferred()
  const images = fakeStage('images', {
    async run() {
      // Las imágenes no terminan hasta ver arrancar al avatar.
      await within(avatarStarted.promise, 2000, 'the avatar never started')
      imagesSawAvatar.resolve()
    },
  })
  const avatar = fakeStage('avatar', {
    runsAlongside: 'images',
    async run() {
      avatarStarted.resolve()
      await imagesSawAvatar.promise
    },
  })

  assert.deepEqual(await runStages([images.stage, avatar.stage], context), {
    paused: false,
  })
  assert.deepEqual(stageEvents(events).slice(0, 2), [
    'started:images',
    'started:avatar',
  ])
  assert.deepEqual(stageEvents(events).slice(2).sort(), [
    'completed:avatar',
    'completed:images',
  ])
})

test('imágenes terminan primero: avisan y pasan por el gancho mientras el avatar sigue; después, el avatar', async () => {
  const { context, events } = runnerContext()
  const recording = recordingHooks()
  const releaseAvatar = deferred()
  const images = fakeStage('images')
  const avatar = fakeStage('avatar', {
    runsAlongside: 'images',
    run: () => releaseAvatar.promise,
  })

  const running = runStages(
    [images.stage, avatar.stage],
    context,
    recording.hooks,
  )
  await within(recording.reached('images'), 2000, 'images hook')
  assert.deepEqual(stageEvents(events), [
    'started:images',
    'started:avatar',
    'completed:images',
  ])
  assert.deepEqual(recording.completed, ['images'])
  assert.equal(avatar.record.settledAt, undefined)

  releaseAvatar.resolve()
  assert.deepEqual(await running, { paused: false })
  assert.deepEqual(stageEvents(events), [
    'started:images',
    'started:avatar',
    'completed:images',
    'completed:avatar',
  ])
  assert.deepEqual(recording.completed, ['images', 'avatar'])
})

test('el avatar termina primero: avisa y pasa por el gancho mientras las imágenes siguen (`completedStages` puede quedar con el avatar antes)', async () => {
  const { context, events } = runnerContext()
  const recording = recordingHooks()
  const releaseImages = deferred()
  const images = fakeStage('images', { run: () => releaseImages.promise })
  const avatar = fakeStage('avatar', { runsAlongside: 'images' })

  const running = runStages(
    [images.stage, avatar.stage],
    context,
    recording.hooks,
  )
  await within(recording.reached('avatar'), 2000, 'avatar hook')
  assert.deepEqual(stageEvents(events), [
    'started:images',
    'started:avatar',
    'completed:avatar',
  ])
  assert.deepEqual(recording.completed, ['avatar'])
  assert.equal(images.record.settledAt, undefined)

  releaseImages.resolve()
  assert.deepEqual(await running, { paused: false })
  assert.deepEqual(recording.completed, ['avatar', 'images'])
  assert.deepEqual(stageEvents(events).at(-1), 'completed:images')
})

test('la que manda corre con la señal del job y la acompañante con la suya, en una copia que solo cambia la señal', async () => {
  const { context } = runnerContext()
  context.shared = { metadata: true }
  const images = fakeStage('images')
  const avatar = fakeStage('avatar', { runsAlongside: 'images' })
  await runStages([images.stage, avatar.stage], context)

  assert.equal(images.record.context, context)
  const copy = avatar.record.context
  assert.notEqual(copy, context)
  assert.notEqual(copy.signal, context.signal)
  assert.deepEqual(
    Object.keys(copy).filter((key) => copy[key] !== context[key]),
    ['signal'],
  )
  // Lo de adentro se comparte por referencia (la metadata del proyecto).
  assert.equal(copy.shared, context.shared)
})

// ─── El grupo: `skip()` ───

test('skip: en orden (imágenes primero) y antes de arrancar; las salteadas avisan `stage-skipped` antes del `stage-started` de las que corren', async () => {
  const cases = [
    {
      skips: [true, false],
      expected: ['skipped:images', 'started:avatar', 'completed:avatar'],
      ran: ['avatar'],
    },
    {
      skips: [false, true],
      expected: ['skipped:avatar', 'started:images', 'completed:images'],
      ran: ['images'],
    },
    {
      skips: [true, true],
      expected: ['skipped:images', 'skipped:avatar'],
      ran: [],
    },
    {
      // Las imágenes tardan un poco: con las dos corriendo, el avatar termina
      // primero solo si el runner no las corre una detrás de la otra.
      skips: [false, false],
      expected: [
        'started:images',
        'started:avatar',
        'completed:avatar',
        'completed:images',
      ],
      ran: ['images', 'avatar'],
    },
  ]
  for (const { skips, expected, ran } of cases) {
    const { context, events } = runnerContext()
    const order = []
    const recording = recordingHooks()
    const images = fakeStage('images', {
      skip: skips[0],
      skips: order,
      run: () => new Promise((done) => setTimeout(done, 20)),
    })
    const avatar = fakeStage('avatar', {
      runsAlongside: 'images',
      skip: skips[1],
      skips: order,
    })
    await runStages([images.stage, avatar.stage], context, recording.hooks)

    assert.deepEqual(order, ['images', 'avatar'], JSON.stringify(skips))
    assert.deepEqual(stageEvents(events), expected, JSON.stringify(skips))
    assert.deepEqual(
      [images, avatar]
        .filter((fake) => fake.record.runs > 0)
        .map((fake) => fake.stage.id),
      ran,
    )
    assert.deepEqual([...recording.completed].sort(), [...ran].sort())
  }
})

test('skip: con las imágenes salteadas el avatar corre solo, como cualquier fase, con la señal del job', async () => {
  const { context } = runnerContext()
  const images = fakeStage('images', { skip: true })
  const avatar = fakeStage('avatar', { runsAlongside: 'images' })
  await runStages([images.stage, avatar.stage], context)

  assert.equal(avatar.record.context, context)
})

// ─── Las reglas del fallo ───

test('falla la que manda (imágenes): el avatar se corta con SU señal (la del job no), se lo espera y sale el fallo de las imágenes, sin avisar el eco del corte', async () => {
  const { context, events, controller } = runnerContext()
  const recording = recordingHooks()
  const avatarStarted = deferred()
  const images = fakeStage('images', {
    async run() {
      await avatarStarted.promise
      throw new PipelineFailure('images_incomplete', 'scenes without image')
    },
  })
  // El avatar tarda en soltar (guarda sus recibos) después del corte.
  const avatar = fakeStage('avatar', {
    runsAlongside: 'images',
    run(stageContext) {
      avatarStarted.resolve()
      return untilAborted(stageContext.signal, 30)
    },
  })

  let rejectedAt
  await assert.rejects(
    runStages([images.stage, avatar.stage], context, recording.hooks).catch(
      (error) => {
        rejectedAt = ++step
        throw error
      },
    ),
    { code: 'images_incomplete' },
  )
  assert.equal(avatar.record.abortedWhenSettled, true)
  assert.equal(avatar.record.context.signal.aborted, true)
  assert.equal(controller.signal.aborted, false)
  // Se esperó a que el avatar terminara antes de salir.
  assert.ok(avatar.record.settledAt < rejectedAt)
  assert.deepEqual(stageEvents(events), ['started:images', 'started:avatar'])
  assert.deepEqual(recording.completed, [])
  assert.deepEqual(warnings(events), [])
})

test('falla la acompañante (avatar): las imágenes siguen hasta el final con su señal intacta, avisan y pasan por el gancho; después sale el fallo del avatar', async () => {
  const { context, events } = runnerContext()
  const recording = recordingHooks()
  const avatarFailed = deferred()
  let imagesSignalAfterFailure
  const images = fakeStage('images', {
    async run(stageContext) {
      await avatarFailed.promise
      await settleMicrotasks()
      imagesSignalAfterFailure = stageContext.signal.aborted
    },
  })
  const avatar = fakeStage('avatar', {
    runsAlongside: 'images',
    async run() {
      avatarFailed.resolve()
      throw new PipelineFailure(
        'avatar_insufficient_credits',
        'HeyGen balance is too low',
      )
    },
  })

  let imagesCompletedFirst = false
  await assert.rejects(
    runStages([images.stage, avatar.stage], context, recording.hooks).catch(
      (error) => {
        imagesCompletedFirst = recording.completed.includes('images')
        throw error
      },
    ),
    { code: 'avatar_insufficient_credits' },
  )
  assert.equal(imagesSignalAfterFailure, false)
  assert.equal(images.record.abortedWhenSettled, false)
  assert.equal(imagesCompletedFirst, true)
  assert.deepEqual(stageEvents(events), [
    'started:images',
    'started:avatar',
    'completed:images',
  ])
  assert.deepEqual(recording.completed, ['images'])
  assert.deepEqual(warnings(events), [])
})

test('fallan las dos: gana el de las imágenes y el del avatar va al log como aviso con su código (una sola vez)', async () => {
  const { context, events } = runnerContext()
  const avatarFailed = deferred()
  const images = fakeStage('images', {
    async run() {
      await avatarFailed.promise
      throw new PipelineFailure('images_incomplete', 'scenes without image')
    },
  })
  const avatar = fakeStage('avatar', {
    runsAlongside: 'images',
    async run() {
      // El avatar falla por su cuenta, antes que las imágenes.
      setImmediate(() => avatarFailed.resolve())
      throw new PipelineFailure('avatar_invalid_key', 'HeyGen rejected the key')
    },
  })

  await assert.rejects(runStages([images.stage, avatar.stage], context), {
    code: 'images_incomplete',
  })
  const logged = warnings(events)
  assert.equal(logged.length, 1)
  assert.match(logged[0].message, /\bavatar\b/)
  assert.match(logged[0].message, /avatar_invalid_key/)
  assert.doesNotMatch(logged[0].message, /images_incomplete/)
})

test('fallan las dos, pero el avatar falló por el corte (aunque con un código propio): no se avisa como un fallo suyo', async () => {
  const { context, events } = runnerContext()
  const avatarStarted = deferred()
  const images = fakeStage('images', {
    async run() {
      await avatarStarted.promise
      throw new PipelineFailure('images_incomplete', 'scenes without image')
    },
  })
  const avatar = fakeStage('avatar', {
    runsAlongside: 'images',
    async run(stageContext) {
      avatarStarted.resolve()
      await untilAborted(stageContext.signal).catch(() => undefined)
      // Lo que sale de un proveedor cortado a mitad de un pedido.
      throw new PipelineFailure('avatar_network', 'request aborted')
    },
  })

  await assert.rejects(runStages([images.stage, avatar.stage], context), {
    code: 'images_incomplete',
  })
  assert.deepEqual(warnings(events), [])
})

test('un gancho que falla es el fallo de su fase: el del avatar no frena a las imágenes', async () => {
  const { context, events } = runnerContext()
  const releaseImages = deferred()
  const images = fakeStage('images', { run: () => releaseImages.promise })
  const avatar = fakeStage('avatar', { runsAlongside: 'images' })
  const completed = []
  const hooks = {
    async onStageCompleted(stageId) {
      completed.push(stageId)
      if (stageId !== 'avatar') return
      setImmediate(() => releaseImages.resolve())
      throw new PipelineFailure('project_write_failed', 'disk full')
    },
  }

  await assert.rejects(
    runStages([images.stage, avatar.stage], context, hooks),
    {
      code: 'project_write_failed',
    },
  )
  assert.deepEqual(completed, ['avatar', 'images'])
  assert.equal(images.record.abortedWhenSettled, false)
  assert.deepEqual(stageEvents(events).slice(-2), [
    'completed:avatar',
    'completed:images',
  ])
})

test('cancelar el job frena a las dos y sale la cancelación, sin avisos', async () => {
  const { context, events, controller } = runnerContext()
  const started = deferred()
  let running = 0
  const waitForCancel = (stageContext) => {
    running++
    if (running === 2) started.resolve()
    return untilAborted(stageContext.signal)
  }
  const images = fakeStage('images', { run: waitForCancel })
  const avatar = fakeStage('avatar', {
    runsAlongside: 'images',
    run: waitForCancel,
  })

  const run = runStages([images.stage, avatar.stage], context)
  await within(started.promise, 2000, 'both stages running')
  controller.abort()
  await assert.rejects(run, { name: 'AbortError' })
  assert.equal(images.record.abortedWhenSettled, true)
  assert.equal(avatar.record.abortedWhenSettled, true)
  assert.deepEqual(stageEvents(events), ['started:images', 'started:avatar'])
  assert.deepEqual(warnings(events), [])
})

test('con el job ya cancelado, el grupo ni evalúa sus `skip()`', async () => {
  const { context, events, controller } = runnerContext()
  const order = []
  const images = fakeStage('images', { skips: order })
  const avatar = fakeStage('avatar', { runsAlongside: 'images', skips: order })
  controller.abort()

  await assert.rejects(runStages([images.stage, avatar.stage], context), {
    name: 'AbortError',
  })
  assert.deepEqual(order, [])
  assert.deepEqual(events, [])
})

// ─── La pausa ───

test('una fase del grupo que pide pausa: se espera a la otra (que avisa y pasa por el gancho) y el runner devuelve la pausa', async () => {
  for (const pausing of ['images', 'avatar']) {
    const { context, events } = runnerContext()
    const recording = recordingHooks()
    const otherRelease = deferred()
    const run = (id) => async () => {
      if (id === pausing) {
        setImmediate(() => otherRelease.resolve())
        return { pause: true }
      }
      await otherRelease.promise
      return undefined
    }
    const images = fakeStage('images', { run: run('images') })
    const avatar = fakeStage('avatar', {
      runsAlongside: 'images',
      run: run('avatar'),
    })
    const render = fakeStage('render')

    assert.deepEqual(
      await runStages(
        [images.stage, avatar.stage, render.stage],
        context,
        recording.hooks,
      ),
      { paused: true },
    )
    const other = pausing === 'images' ? 'avatar' : 'images'
    assert.deepEqual(recording.completed, [other], pausing)
    assert.ok(stageEvents(events).includes(`completed:${other}`), pausing)
    assert.ok(!stageEvents(events).includes(`completed:${pausing}`), pausing)
    // Lo que sigue al grupo no corre.
    assert.equal(render.record.runs, 0, pausing)
  }
})

test('una pausa no tapa un fallo: las imágenes piden pausa y el avatar falla → sale el fallo del avatar', async () => {
  const { context } = runnerContext()
  const images = fakeStage('images', {
    async run() {
      await settleMicrotasks()
      return { pause: true }
    },
  })
  const avatar = fakeStage('avatar', {
    runsAlongside: 'images',
    async run() {
      throw new PipelineFailure('avatar_invalid_key', 'HeyGen rejected the key')
    },
  })

  await assert.rejects(runStages([images.stage, avatar.stage], context), {
    code: 'avatar_invalid_key',
  })
})

// ─── Sin grupo, como siempre ───

test('sin acompañante, una detrás de otra como siempre: `skip`, arranque, fin y gancho por fase, en orden', async () => {
  const { context, events } = runnerContext()
  const recording = recordingHooks()
  const order = []
  const voice = fakeStage('voice', { skips: order })
  const transcription = fakeStage('transcription', { skip: true, skips: order })
  const images = fakeStage('images', {
    skips: order,
    run: () => new Promise((done) => setTimeout(done, 10)),
  })
  const render = fakeStage('render', { skips: order })

  await runStages(
    [voice.stage, transcription.stage, images.stage, render.stage],
    context,
    recording.hooks,
  )
  assert.deepEqual(stageEvents(events), [
    'started:voice',
    'completed:voice',
    'skipped:transcription',
    'started:images',
    'completed:images',
    'started:render',
    'completed:render',
  ])
  assert.deepEqual(order, ['voice', 'transcription', 'images', 'render'])
  assert.deepEqual(recording.completed, ['voice', 'images', 'render'])
  assert.equal(images.record.context, context)
})

test('una acompañante sin la suya antes en la lista corre sola, en su lugar (`untilStage` que corta antes de imágenes, o el orden al revés)', async () => {
  const alone = runnerContext()
  const avatar = fakeStage('avatar', { runsAlongside: 'images' })
  const render = fakeStage('render', {
    run: () => new Promise((done) => setTimeout(done, 10)),
  })
  await runStages([avatar.stage, render.stage], alone.context)
  assert.deepEqual(stageEvents(alone.events), [
    'started:avatar',
    'completed:avatar',
    'started:render',
    'completed:render',
  ])
  assert.equal(avatar.record.context, alone.context)

  const reversed = runnerContext()
  const first = fakeStage('avatar', {
    runsAlongside: 'images',
    run: () => new Promise((done) => setTimeout(done, 10)),
  })
  const images = fakeStage('images')
  await runStages([first.stage, images.stage], reversed.context)
  assert.deepEqual(stageEvents(reversed.events), [
    'started:avatar',
    'completed:avatar',
    'started:images',
    'completed:images',
  ])
})

test('sin acompañante, un fallo o una pausa cortan el recorrido como siempre', async () => {
  const failing = runnerContext()
  const broken = fakeStage('images', {
    async run() {
      throw new PipelineFailure('images_incomplete', 'scenes without image')
    },
  })
  const after = fakeStage('render')
  await assert.rejects(
    runStages([broken.stage, after.stage], failing.context),
    { code: 'images_incomplete' },
  )
  assert.equal(after.record.runs, 0)
  assert.deepEqual(stageEvents(failing.events), ['started:images'])

  const pausing = runnerContext()
  const prompts = fakeStage('scene-prompts', {
    run: async () => ({ pause: true }),
  })
  const next = fakeStage('images')
  assert.deepEqual(
    await runStages([prompts.stage, next.stage], pausing.context),
    { paused: true },
  )
  assert.equal(next.record.runs, 0)
  assert.deepEqual(stageEvents(pausing.events), ['started:scene-prompts'])
})

// ─── project.json: la fila de escrituras ───

const PROJECT_ID = 'mi-video'
const BEFORE_IMAGES = ['voice', 'transcription', 'scene-cuts', 'scene-prompts']

// Un proyecto en disco con project.json y, si se pide, un mp4 ya renderizado
// (sin él no hay video que desactualizar).
async function metadataProject(t, { video = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-runner-alongside-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const projectDir = join(root, PROJECT_ID)
  await mkdir(projectDir, { recursive: true })
  await writeFile(
    join(projectDir, 'project.json'),
    JSON.stringify(
      {
        id: PROJECT_ID,
        name: 'Mi video',
        createdAt: '2026-10-13T15:00:00.000Z',
        updatedAt: '2026-10-13T15:00:00.000Z',
        state: 'generating',
        options: { styleId: 'normal', videoFormat: '16:9' },
        completedStages: BEFORE_IMAGES,
      },
      null,
      2,
    ),
  )
  if (video)
    await writeFile(join(projectDir, `${PROJECT_ID}.mp4`), 'previous render')
  const { context } = runnerContext()
  const videoContext = await buildCreateVideoContext(
    { ...context, job: { ...context.job, projectsRoot: root } },
    PROJECT_ID,
  )
  return { projectDir, context: videoContext }
}

const readMetadata = async (projectDir) =>
  JSON.parse(await readFile(join(projectDir, 'project.json'), 'utf8'))

// Lo que hace el gancho de run-video-pipeline al terminar una fase.
function completeStage(context, stageId) {
  if (!context.metadata.completedStages.includes(stageId))
    context.metadata.completedStages.push(stageId)
  return context.saveMetadata()
}

test('project.json: la marca de video desactualizado del avatar cruzada con el gancho que anota `completedStages`, en los dos órdenes: no se pierde ninguna', async (t) => {
  for (const order of ['mark-first', 'hook-first']) {
    const { projectDir, context } = await metadataProject(t)
    const writes =
      order === 'mark-first'
        ? [
            markStoredVideoOutdated(context.paths, context.metadata),
            completeStage(context, 'images'),
          ]
        : [
            completeStage(context, 'images'),
            markStoredVideoOutdated(context.paths, context.metadata),
          ]
    await Promise.all(writes)

    const stored = await readMetadata(projectDir)
    assert.deepEqual(
      stored.completedStages,
      [...BEFORE_IMAGES, 'images'],
      order,
    )
    assert.equal(stored.videoOutdated, true, order)
    // La copia en memoria también la tiene: la próxima escritura no la deshace.
    assert.equal(context.metadata.videoOutdated, true, order)
    await completeStage(context, 'avatar')
    const after = await readMetadata(projectDir)
    assert.deepEqual(
      after.completedStages,
      [...BEFORE_IMAGES, 'images', 'avatar'],
      order,
    )
    assert.equal(after.videoOutdated, true, order)
  }
})

test('project.json: dos fases que terminan a la vez y la marca del avatar en el medio, muchas veces: siempre quedan las dos fases y la marca', async (t) => {
  for (let round = 0; round < 20; round++) {
    const { projectDir, context } = await metadataProject(t)
    const writes = [
      completeStage(context, 'avatar'),
      markStoredVideoOutdated(context.paths, context.metadata),
      completeStage(context, 'images'),
    ]
    if (round % 2 === 1) writes.reverse()
    await Promise.all(writes)

    const stored = await readMetadata(projectDir)
    assert.deepEqual(
      [...stored.completedStages].sort(),
      [...BEFORE_IMAGES, 'avatar', 'images'].sort(),
      `round ${round}`,
    )
    assert.equal(stored.videoOutdated, true, `round ${round}`)
  }
})

test('project.json: una escritura en fila toma la copia en memoria al escribir, no al pedirla; sin otra en curso escribe en el acto', async (t) => {
  const { projectDir, context } = await metadataProject(t)
  // Sin nada en la fila: lo que se pidió es lo que queda (en el acto).
  context.metadata.completedStages.push('images')
  const first = writeProjectMetadata(context.paths, context.metadata)
  // En fila detrás de la primera: escribe lo que hay cuando le toca.
  const second = writeProjectMetadata(context.paths, context.metadata)
  context.metadata.completedStages.push('avatar')
  await Promise.all([first, second])

  assert.deepEqual((await readMetadata(projectDir)).completedStages, [
    ...BEFORE_IMAGES,
    'images',
    'avatar',
  ])
})

test('project.json: sin un video que desactualizar, la marca no escribe nada y la copia en memoria queda como el disco', async (t) => {
  const { projectDir, context } = await metadataProject(t, { video: false })
  const before = await readFile(join(projectDir, 'project.json'), 'utf8')
  await markStoredVideoOutdated(context.paths, context.metadata)

  assert.equal(await readFile(join(projectDir, 'project.json'), 'utf8'), before)
  assert.equal(context.metadata.videoOutdated, undefined)
})

// ─── El pipeline real: imágenes y avatar a la vez ───

// Un JPEG mínimo: lo único que mira la descarga son los magic bytes.
const IMAGE_BYTES = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  Buffer.from('JFIF fixture'),
])
const PIPELINE_OPTIONS = {
  styleId: 'normal',
  sceneCount: 3,
  narrationMode: 'tts',
  imageProvider: 'fal',
  useBgm: false,
  useOverlay: false,
  confirmScenes: false,
  videoFormat: '16:9',
}
// Prompts de catálogo ya escritos: la fase de prompts se saltea.
const IMAGE_PROMPTS = {
  1: 'A red antenna blinks outside an orbital station, Earth glowing behind it, a wide shot at dawn.',
  3: 'Green plants grow under violet lamps inside the station greenhouse, droplets on the leaves, a close-up.',
}

// Un proyecto que el pipeline lleva directo a las imágenes: la narración y
// `words.json` (voz y transcripción listas), el corte (con `sceneCount`) y los
// prompts de las dos escenas de imagen, sin sus imágenes; en el medio, una
// aparición del avatar planeada. Con un mp4 ya renderizado: el clip nuevo
// del avatar lo deja desactualizado.
async function alongsideProject(t) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-runner-pipeline-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const projectDir = join(root, PROJECT_ID)
  await mkdir(join(projectDir, 'scenes'), { recursive: true })
  writeNarration(join(projectDir, 'narration.mp3'), 6)
  await writeFile(
    join(projectDir, 'words.json'),
    JSON.stringify([{ word: 'hola', start: 0, end: 0.5 }]),
  )
  const scenes = [
    {
      id: 1,
      text: 'La antena roja parpadea afuera de la estación.',
      startSeconds: 0,
      endSeconds: 2,
      imagePrompt: IMAGE_PROMPTS[1],
      promptIsFallback: false,
    },
    {
      id: 2,
      text: 'Hoy les cuento cómo se cultiva comida en el espacio.',
      startSeconds: 2,
      endSeconds: 3,
      avatar: {
        lookId: 'look-1',
        lookName: 'Ana',
        lookType: 'photo_avatar',
        engine: 'avatar_iii',
        origin: 'auto',
        status: 'planned',
      },
    },
    {
      id: 3,
      text: 'Las plantas crecen bajo la luz violeta del invernadero.',
      startSeconds: 3,
      endSeconds: 6,
      imagePrompt: IMAGE_PROMPTS[3],
      promptIsFallback: false,
    },
  ]
  await writeFile(
    join(projectDir, 'scenes.json'),
    JSON.stringify(scenes, null, 2),
  )
  await writeFile(
    join(projectDir, 'project.json'),
    JSON.stringify(
      {
        id: PROJECT_ID,
        name: 'Mi video',
        createdAt: '2026-10-13T15:00:00.000Z',
        updatedAt: '2026-10-13T15:00:00.000Z',
        state: 'generating',
        options: PIPELINE_OPTIONS,
        completedStages: BEFORE_IMAGES,
        audioDurationSeconds: 6,
      },
      null,
      2,
    ),
  )
  await writeFile(join(projectDir, `${PROJECT_ID}.mp4`), 'previous render')
  const clipPath = join(root, 'heygen-source.mp4')
  writeHeyGenClip(clipPath, { seconds: 1 })
  return { root, projectDir, clip: await readFile(clipPath) }
}

const readStoredScenes = async (projectDir) =>
  JSON.parse(await readFile(join(projectDir, 'scenes.json'), 'utf8'))

// Espera (hasta `ms`) a que scenes.json cumpla `matches`; dice si lo cumplió.
async function waitForScenes(projectDir, matches, ms) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    const scenes = await readStoredScenes(projectDir).catch(() => null)
    if (scenes && matches(scenes)) return true
    await new Promise((done) => setTimeout(done, 20))
  }
  return false
}
const avatarReceiptState = (scenes) =>
  scenes.find((scene) => scene.id === 2)?.avatar?.attempts?.at(-1)?.state

// Fal y HeyGen simulados en un solo `fetch` (uno por test, registro de errores
// conocidos `node-test-doble-mock-del-mismo-metodo-deja-el-global-sucio`).
// `onFal` responde el pedido de una imagen; `onPoll`, la consulta del render;
// `balance` es la billetera de HeyGen (10 USD si falta) y `onBalance` corre al
// leerla. Las opciones se leen en cada pedido: la «corrida siguiente» de un
// test las cambia sin montar otro `fetch`.
function fakeProviders(t, providers) {
  const calls = []
  globalThis.fetch.mock?.restore()
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    init.signal?.throwIfAborted()
    const target = new URL(String(url))
    const method = init.method ?? 'GET'
    calls.push(`${method} ${target.hostname}${target.pathname}`)
    if (target.hostname === 'fal.run') return providers.onFal()
    if (target.hostname === 'fixture.invalid')
      return new Response(IMAGE_BYTES, {
        headers: { 'content-type': 'image/jpeg' },
      })
    if (target.hostname === 'cdn.example')
      return new Response(providers.clip, {
        headers: { 'content-type': 'video/mp4' },
      })
    if (target.pathname === '/v3/users/me') {
      providers.onBalance?.()
      return json({
        data: {
          wallet: {
            currency: 'usd',
            remaining_balance: providers.balance ?? 10,
          },
        },
      })
    }
    if (target.pathname === '/v3/assets' && method === 'POST')
      return json({ data: { asset_id: 'asset-audio' } })
    if (target.pathname === '/v3/videos' && method === 'POST')
      return json({ data: { video_id: 'video-2-1', status: 'waiting' } })
    if (target.pathname === '/v3/videos/video-2-1')
      return providers.onPoll(init)
    return new Response('unexpected', { status: 418 })
  })
  return calls
}

const FAL_IMAGE = () =>
  json({ images: [{ url: 'https://fixture.invalid/image.jpg' }] })
const RENDER_COMPLETED = () =>
  json({
    data: {
      id: 'video-2-1',
      status: 'completed',
      video_url: 'https://cdn.example/video-2-1.mp4',
      duration: 1,
    },
  })

// El job del pipeline hasta el avatar, con un emisor que anota y avisa cuando
// terminan las imágenes.
function pipelineJob(root, events, onEvent = () => {}) {
  return videosSubcommands['run-video-pipeline']({
    job: {
      jobId: 'runner-pipeline-fixture',
      projectsRoot: root,
      apiKeys: { heygen: 'key-123', fal: 'fal-key' },
      binaryPaths: { ffmpeg: FFMPEG },
      payload: { projectId: PROJECT_ID, untilStage: 'avatar' },
    },
    config: resolvePipelineConfig(),
    signal: new AbortController().signal,
    emitter: {
      emit(event) {
        events.push(event)
        onEvent(event)
      },
    },
  })
}

test('pipeline real: imágenes y avatar a la vez; la escritura de las imágenes conserva el recibo del avatar, la del avatar lo de las imágenes, y todo queda en disco', async (t) => {
  const project = await alongsideProject(t)
  const events = []
  const imagesCompleted = deferred()
  let receiptWhenImagesCompleted
  let pendingWhileImagesWaited
  let falRequests = 0
  fakeProviders(t, {
    clip: project.clip,
    async onFal() {
      falRequests++
      // La primera imagen no sale hasta que el avatar guardó su render
      // pedido: las dos fases corren a la vez.
      if (falRequests === 1)
        pendingWhileImagesWaited = await waitForScenes(
          project.projectDir,
          (scenes) => avatarReceiptState(scenes) === 'pending',
          10_000,
        )
      return FAL_IMAGE()
    },
    async onPoll() {
      // El render termina recién cuando terminaron las imágenes: las
      // escrituras del avatar que siguen van después de las de ellas.
      await within(imagesCompleted.promise, 10_000, 'images never completed')
      return RENDER_COMPLETED()
    },
  })

  const result = await pipelineJob(project.root, events, (event) => {
    if (event.type !== 'stage-completed' || event.stageId !== 'images') return

    // Lo último que escribieron las imágenes (el avatar espera su render).
    receiptWhenImagesCompleted = readStoredScenes(project.projectDir).then(
      avatarReceiptState,
    )
    imagesCompleted.resolve()
  })

  assert.equal(result.status, 'completed')
  assert.equal(pendingWhileImagesWaited, true)
  assert.equal(await receiptWhenImagesCompleted, 'pending')
  // Las cuatro primeras fases se saltean (sus artefactos están en disco).
  assert.deepEqual(stageEvents(events).slice(4), [
    'started:images',
    'started:avatar',
    'completed:images',
    'completed:avatar',
  ])

  const stored = await readMetadata(project.projectDir)
  assert.deepEqual(stored.completedStages, [
    ...BEFORE_IMAGES,
    'images',
    'avatar',
  ])
  assert.equal(stored.videoOutdated, true)
  const scenes = await readStoredScenes(project.projectDir)
  for (const id of [1, 3]) {
    const scene = scenes.find((candidate) => candidate.id === id)
    assert.ok(scene.imageModel, `scene ${id}`)
    // El prompt que guardó la fase (con las cláusulas del cierre).
    assert.ok(scene.imagePrompt.startsWith(IMAGE_PROMPTS[id]), `scene ${id}`)
    await readFile(join(project.projectDir, 'scenes', `scene_${id}.jpg`))
  }
  const avatar = scenes.find((scene) => scene.id === 2).avatar
  assert.equal(avatar.status, 'ready')
  assert.deepEqual(
    avatar.attempts.map((attempt) => attempt.state),
    ['succeeded'],
  )
  await readFile(join(project.projectDir, 'avatar', avatar.clipFile))
})

test('pipeline real: las imágenes fallan (sin saldo) con el render del avatar en vuelo → el avatar se corta, su recibo queda guardado y el job pausa con el código de las imágenes', async (t) => {
  const project = await alongsideProject(t)
  const events = []
  let pollAborted = false
  fakeProviders(t, {
    clip: project.clip,
    async onFal() {
      await waitForScenes(
        project.projectDir,
        (scenes) => avatarReceiptState(scenes) === 'pending',
        10_000,
      )
      return json({ detail: 'Exhausted balance' }, 402)
    },
    async onPoll(init) {
      // HeyGen sigue renderizando: la consulta espera hasta que la corten.
      await untilAborted(init.signal).catch((error) => {
        pollAborted = true
        throw error
      })
    },
  })

  await assert.rejects(pipelineJob(project.root, events), {
    code: 'image_insufficient_credits',
  })
  assert.equal(pollAborted, true)
  const stored = await readMetadata(project.projectDir)
  assert.equal(stored.state, 'paused')
  assert.equal(stored.pauseReason, 'insufficient-credits')
  assert.equal(stored.errorCode, 'image_insufficient_credits')
  assert.deepEqual(stored.completedStages, BEFORE_IMAGES)
  // El render pedido quedó en su recibo: la próxima corrida lo cosecha.
  const avatar = (await readStoredScenes(project.projectDir)).find(
    (scene) => scene.id === 2,
  ).avatar
  assert.deepEqual(
    avatar.attempts.map((attempt) => [attempt.state, attempt.videoId]),
    [['pending', 'video-2-1']],
  )
  assert.deepEqual(stageEvents(events).slice(-2), [
    'started:images',
    'started:avatar',
  ])
  // El corte del avatar no se avisa como un fallo suyo.
  assert.deepEqual(
    warnings(events).filter((event) =>
      / stage also failed /.test(event.message),
    ),
    [],
  )
})

test('pipeline real (regla 2, ronda 1): el avatar pausa por el saldo de HeyGen mientras las imágenes siguen → las imágenes terminan y se anotan, y el job pausa con el código del avatar; al reanudar con saldo, se saltean las imágenes y solo se habla con HeyGen', async (t) => {
  const project = await alongsideProject(t)
  const events = []
  let balanceWasRead
  const balanceRead = new Promise((resolve) => {
    balanceWasRead = resolve
  })
  const providers = {
    clip: project.clip,
    // Sin saldo: el avatar no paga nada y sale con el código de la cuenta.
    balance: 0,
    onBalance: () => balanceWasRead(),
    async onFal() {
      // Las imágenes no terminan hasta que el avatar miró el saldo y falló.
      await within(balanceRead, 10_000, 'the avatar never read the balance')
      await new Promise((done) => setTimeout(done, 100))
      return FAL_IMAGE()
    },
    onPoll: RENDER_COMPLETED,
  }
  const calls = fakeProviders(t, providers)

  let imagesCompletedFirst = false
  await assert.rejects(
    pipelineJob(project.root, events).catch((error) => {
      imagesCompletedFirst = stageEvents(events).includes('completed:images')
      throw error
    }),
    { code: 'avatar_insufficient_credits' },
  )
  assert.equal(imagesCompletedFirst, true)
  // El avatar ya había fallado (leyó el saldo) cuando bajó la primera imagen.
  assert.ok(
    calls.indexOf('GET api.heygen.com/v3/users/me') <
      calls.indexOf('GET fixture.invalid/image.jpg'),
  )
  assert.deepEqual(stageEvents(events).slice(4), [
    'started:images',
    'started:avatar',
    'completed:images',
  ])
  // Sin saldo no se subió ni se pidió nada.
  assert.ok(!calls.some((call) => call.startsWith('POST api.heygen.com')))
  const paused = await readMetadata(project.projectDir)
  assert.equal(paused.state, 'paused')
  assert.equal(paused.pauseReason, 'insufficient-credits')
  assert.equal(paused.errorCode, 'avatar_insufficient_credits')
  assert.deepEqual(paused.completedStages, [...BEFORE_IMAGES, 'images'])
  for (const id of [1, 3])
    await readFile(join(project.projectDir, 'scenes', `scene_${id}.jpg`))

  // Recargó: reanudar saltea las imágenes y solo habla con HeyGen.
  providers.balance = 10
  providers.onFal = () => {
    throw new Error('the images stage should be skipped')
  }
  calls.length = 0
  const resumed = []
  const result = await pipelineJob(project.root, resumed)

  assert.equal(result.status, 'completed')
  assert.ok(calls.length > 0)
  assert.deepEqual(
    [...new Set(calls.map((call) => call.split(' ')[1].split('/')[0]))].sort(),
    ['api.heygen.com', 'cdn.example'],
  )
  assert.deepEqual(stageEvents(resumed).slice(4), [
    'skipped:images',
    'started:avatar',
    'completed:avatar',
  ])
  const stored = await readMetadata(project.projectDir)
  assert.deepEqual(stored.completedStages, [
    ...BEFORE_IMAGES,
    'images',
    'avatar',
  ])
  const avatar = (await readStoredScenes(project.projectDir)).find(
    (scene) => scene.id === 2,
  ).avatar
  assert.equal(avatar.status, 'ready')
})

test('centinela: ningún test dejó el `fetch` simulado puesto', () => {
  assert.equal(globalThis.fetch, ORIGINAL_FETCH)
})
