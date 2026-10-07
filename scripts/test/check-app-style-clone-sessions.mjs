// Las sesiones del creador de estilo con IA (ADR-0050, spec §8): cada
// clonación sigue trabajando fuera del modal, paso por paso (material → turno
// del servidor → pruebas dibujadas), se detiene cuando necesita una respuesta,
// se guarda en cada cambio y, tras un fallo o un cierre de la app, retoma solo
// el paso que estaba corriendo. Hasta 3 a la vez. Store puro de src/ corrido
// con Node (type stripping): el sidecar, vimo.click y el almacenamiento llegan
// como dobles.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  STYLE_CLONE_SESSION_LIMIT,
  createStyleCloneSessions,
  styleCloneNeedsAnswer,
} from '../../src/modules/videos/utilities/styleCloneSessions.ts'

const VIDEO = {
  kind: 'youtube',
  url: 'https://www.youtube.com/watch?v=tBBhUn0D0I0',
}
const MATERIAL = [
  {
    kind: 'mosaic',
    file: 'mosaic-1.jpg',
    path: '/r/mosaic-1.jpg',
    mimeType: 'image/jpeg',
    rows: 3,
    columns: 3,
  },
  {
    kind: 'frame',
    file: 'frame-1.jpg',
    path: '/r/frame-1.jpg',
    mimeType: 'image/jpeg',
  },
]
const IDENTITY = {
  name: 'Rubio de Traje',
  description: 'A stick-figure man. Outfit: a grey suit.',
}
const SECTIONS = {
  visualStyle: 'Flat stickman drawings.',
  promptEnd: 'Style: flat stickman.',
}
const designPrompts = (round) =>
  [1, 2, 3].map((index) => `Design ${index} of round ${round}.`)
const scenePrompts = (round) =>
  [1, 2, 3, 4].map((index) => ({
    prompt: `Scene ${index} of round ${round}.`,
    origin: index === 1 ? { kind: 'frame', number: 1 } : { kind: 'new' },
  }))

// Un error con el `code` que traería del sidecar o de vimo.click.
function failure(code) {
  return Object.assign(new Error(code), { code })
}

// El sidecar y vimo.click de mentira. `fail` dice qué paso falla (una vez) y
// con qué código; `hold` deja un paso esperando hasta que el test lo suelta.
function world({ storage = null } = {}) {
  const calls = {
    prepare: 0,
    turns: [],
    draws: [],
    saves: [],
    discards: [],
    saved: [],
  }
  const state = {
    fail: {},
    hold: {},
    drawErrors: {},
    rejected: [],
    rounds: { designs: 0, scenes: 0 },
    // El modo de personaje que sugiere el servidor con el estilo final.
    characterMode: null,
  }
  const stored = { value: storage }
  const waitIfHeld = async (step) => {
    if (state.hold[step]) await state.hold[step].promise
  }
  const failOnce = (step) => {
    const code = state.fail[step]
    if (!code) return
    delete state.fail[step]
    throw failure(code)
  }

  const steps = {
    async prepare() {
      calls.prepare += 1
      await waitIfHeld('prepare')
      failOnce('prepare')
      if (state.rejected.length > 0)
        return { material: [], title: '', rejectedImages: state.rejected }
      return {
        material: MATERIAL,
        title: 'Video de prueba',
        rejectedImages: [],
      }
    },
    async turn(draft, material) {
      calls.turns.push({ draft, material })
      await waitIfHeld('turn')
      failOnce('turn')
      const turns = [
        { role: 'user', text: `pedido ${draft.accion}` },
        { role: 'model', text: `respuesta ${draft.accion}` },
      ]
      if (draft.accion === 'analizar' && draft.replicarPersonaje) {
        state.rounds.designs += 1
        return {
          turns,
          name: 'Cómic Palo',
          description: 'Figuras de palitos.',
          characterIn: { kind: 'frame', number: 1 },
          designs: designPrompts(state.rounds.designs),
        }
      }
      if (draft.accion === 'analizar') {
        state.rounds.scenes += 1
        return {
          turns,
          name: 'Cómic Palo',
          description: 'Figuras de palitos.',
          scenes: scenePrompts(state.rounds.scenes),
        }
      }
      if (draft.accion === 'ajustar-personaje') {
        state.rounds.designs += 1
        return {
          turns,
          characterIn: null,
          designs: designPrompts(state.rounds.designs),
        }
      }
      if (
        draft.accion === 'elegir-personaje' ||
        draft.accion === 'ajustar-escenas'
      ) {
        state.rounds.scenes += 1
        return {
          turns,
          ...(draft.accion === 'elegir-personaje'
            ? { identity: IDENTITY }
            : {}),
          scenes: scenePrompts(state.rounds.scenes),
        }
      }
      return {
        turns,
        sections: SECTIONS,
        templateVersion: 1,
        ...(state.characterMode ? { characterMode: state.characterMode } : {}),
      }
    },
    async draw(payload, onProgress) {
      calls.draws.push(payload)
      await waitIfHeld('draw')
      const prefix = payload.kind === 'designs' ? 'design' : 'scene'
      const items = []
      for (const item of payload.items) {
        const errorCode = state.drawErrors[item.index]
        if (errorCode) {
          delete state.drawErrors[item.index]
          items.push({ index: item.index, errorCode })
          onProgress({ index: item.index, status: 'failed', errorCode })
          continue
        }
        const file = `${prefix}-r${payload.round}-${item.index}.jpg`
        const drawn = {
          index: item.index,
          file,
          path: `/r/${file}`,
          mtimeMs: 1000 + calls.draws.length,
          ...(item.origin?.kind === 'frame'
            ? { originalPath: '/r/frame-1.jpg' }
            : {}),
        }
        items.push(drawn)
        onProgress({ ...drawn, status: 'completed' })
        // El job se corta después de la primera prueba (saldo agotado).
        if (state.fail.draw) failOnce('draw')
      }
      return { items }
    },
    async save(payload) {
      calls.saves.push(payload)
      await waitIfHeld('save')
      failOnce('save')
      return {
        entry: {
          id: 'st-nuevo',
          name: payload.name,
          sections: payload.sections,
          shots: [],
          samples: [],
          createdAt: '',
        },
        ...(payload.character
          ? { character: { id: 'rubio-1', name: payload.character.name } }
          : {}),
      }
    },
    async discard(sessionId) {
      calls.discards.push(sessionId)
    },
    errorCode: (error) => error?.code ?? 'unknown',
    saved(result, session) {
      calls.saved.push({ styleId: result.entry.id, sessionId: session.id })
    },
  }
  const storageDouble = {
    read: () => stored.value,
    write(value) {
      stored.value = value
    },
  }
  let counter = 0
  const store = createStyleCloneSessions(steps, storageDouble, {
    now: () => 1_700_000_000_000,
    newId: () => `sc-test-${++counter}`,
  })
  return { store, calls, state, stored, steps, storageDouble }
}

// Deja correr las microtareas hasta que la sesión se detiene (o desaparece).
async function settle(store, sessionId) {
  for (let turn = 0; turn < 200; turn++) {
    const session = store.getSnapshot().sessions.get(sessionId)
    if (!session) return undefined
    if (['awaiting', 'failed', 'interrupted'].includes(session.status))
      return session
    await new Promise((resolve) => setImmediate(resolve))
  }
  throw new Error('the session never stopped')
}
function hold() {
  let release
  const promise = new Promise((resolve) => {
    release = resolve
  })
  return { promise, release }
}
const input = (extra = {}) => ({
  target: 'custom',
  source: VIDEO,
  replicateCharacter: true,
  imageProvider: 'evolink',
  fallbackName: 'Estilo clonado',
  ...extra,
})
async function started(extra) {
  const context = world()
  const id = context.store.start(input(extra))
  const session = await settle(context.store, id)
  return { ...context, id, session }
}
const sessionOf = (store, id) => store.getSnapshot().sessions.get(id)

// ── El recorrido ──

test('a clone with a character stops with three designs to choose from', async () => {
  const { session, calls, id } = await started()

  assert.equal(id, 'sc-test-1')
  assert.equal(session.status, 'awaiting')
  assert.equal(session.step, 'character')
  assert.equal(session.action, null)
  assert.equal(session.name, 'Cómic Palo')
  assert.equal(session.description, 'Figuras de palitos.')
  assert.equal(session.title, 'Video de prueba')
  assert.deepEqual(session.material, MATERIAL)
  assert.deepEqual(session.characterIn, { kind: 'frame', number: 1 })
  assert.equal(session.history.length, 2)
  assert.deepEqual(
    session.designs.map((design) => design.path),
    ['/r/design-r1-1.jpg', '/r/design-r1-2.jpg', '/r/design-r1-3.jpg'],
  )
  assert.ok(styleCloneNeedsAnswer(session))

  assert.equal(calls.prepare, 1)
  assert.equal(calls.turns.length, 1)
  assert.equal(calls.turns[0].draft.accion, 'analizar')
  assert.deepEqual(calls.turns[0].material, MATERIAL)
  assert.equal(calls.draws.length, 1)
  assert.equal(calls.draws[0].kind, 'designs')
  assert.equal(calls.draws[0].round, 1)
  assert.equal(calls.draws[0].imageProvider, 'evolink')
  assert.equal(calls.draws[0].character, undefined)
})

test('a clone without a character goes straight to the four test scenes', async () => {
  const { session, calls } = await started({ replicateCharacter: false })

  assert.equal(session.step, 'scenes')
  assert.equal(session.scenes.length, 4)
  assert.equal(session.scenes[0].originalPath, '/r/frame-1.jpg')
  assert.equal(session.scenes[1].originalPath, undefined)
  assert.equal(calls.draws[0].kind, 'scenes')
  assert.deepEqual(calls.draws[0].items[0].origin, { kind: 'frame', number: 1 })
})

test('a comment on the designs redraws the three of them in a new round', async () => {
  const { store, id, calls } = await started()

  store.respond(id, { kind: 'adjust-character', comment: 'Sin lentes.' })
  assert.equal(sessionOf(store, id).status, 'analyzing')
  const session = await settle(store, id)

  assert.equal(calls.turns[1].draft.accion, 'ajustar-personaje')
  assert.equal(calls.turns[1].draft.comentario, 'Sin lentes.')
  assert.equal(calls.turns[1].draft.historial.length, 2)
  assert.equal(session.designsRound, 2)
  assert.equal(session.designs[0].prompt, 'Design 1 of round 2.')
  assert.equal(session.designs[0].path, '/r/design-r2-1.jpg')
  assert.equal(session.history.length, 4)
  assert.equal(session.step, 'character')
  assert.equal(calls.prepare, 1)
})

test('choosing a design draws the scenes with the character the way the user picked', async () => {
  const { store, id, calls } = await started()

  store.respond(id, { kind: 'choose-character', option: 2, travel: 'photo' })
  const session = await settle(store, id)

  assert.deepEqual(calls.turns[1].draft.eleccion, {
    opcion: 2,
    prompt: 'Design 2 of round 1.',
  })
  assert.deepEqual(session.choice, { option: 2, travel: 'photo' })
  assert.deepEqual(session.identity, IDENTITY)
  assert.equal(session.step, 'scenes')
  assert.equal(session.scenes.length, 4)
  assert.deepEqual(calls.draws[1].character, {
    travel: 'photo',
    name: 'Rubio de Traje',
    description: IDENTITY.description,
    designFile: 'design-r1-2.jpg',
  })
})

test('a comment on the scenes redraws them and keeps the character', async () => {
  const { store, id, calls } = await started()
  store.respond(id, { kind: 'choose-character', option: 1, travel: 'text' })
  await settle(store, id)

  store.respond(id, { kind: 'adjust-scenes', comment: 'Fondos más oscuros.' })
  const session = await settle(store, id)

  assert.equal(calls.turns[2].draft.accion, 'ajustar-escenas')
  assert.equal(session.scenesRound, 2)
  assert.equal(session.scenes[0].path, '/r/scene-r2-1.jpg')
  assert.deepEqual(session.identity, IDENTITY)
  assert.equal(calls.draws[2].character.travel, 'text')
  assert.equal(calls.draws[2].character.designFile, 'design-r1-1.jpg')
})

test('approving saves the style with its samples and its character, and the session ends', async () => {
  const { store, id, calls } = await started()
  store.respond(id, { kind: 'choose-character', option: 3, travel: 'text' })
  await settle(store, id)
  store.rename(id, '  Cocinero del cartel  ')

  store.respond(id, { kind: 'approve' })
  assert.equal(sessionOf(store, id).status, 'saving')
  assert.equal(await settle(store, id), undefined)

  assert.equal(calls.turns.at(-1).draft.accion, 'aprobar')
  assert.deepEqual(calls.saves, [
    {
      sessionId: id,
      name: 'Cocinero del cartel',
      sections: SECTIONS,
      templateVersion: 1,
      samples: [
        'scene-r1-1.jpg',
        'scene-r1-2.jpg',
        'scene-r1-3.jpg',
        'scene-r1-4.jpg',
      ],
      character: {
        travel: 'text',
        name: 'Rubio de Traje',
        description: IDENTITY.description,
        designFile: 'design-r1-3.jpg',
      },
    },
  ])
  assert.deepEqual(calls.saved, [{ styleId: 'st-nuevo', sessionId: id }])
  // Lo recién guardado queda a la vista hasta que la galería lo descarta.
  const { finished } = store.getSnapshot()
  assert.equal(finished.length, 1)
  assert.equal(finished[0].sessionId, id)
  assert.equal(finished[0].entry.id, 'st-nuevo')
  store.dismissFinished(id)
  assert.equal(store.getSnapshot().finished.length, 0)
})

test('a clone for the catalog ends as a draft for the admin: nothing is saved to disk and the session folder goes', async () => {
  const { store, id, calls, state } = await started({
    target: 'catalog',
    replicateCharacter: false,
  })
  state.characterMode = 'none'
  store.rename(id, 'Garabatos Mono')

  store.respond(id, { kind: 'approve' })
  assert.equal(sessionOf(store, id).status, 'saving')
  assert.equal(await settle(store, id), undefined)

  assert.equal(calls.turns.at(-1).draft.accion, 'aprobar')
  assert.deepEqual(calls.saves, [])
  assert.deepEqual(calls.saved, [])
  assert.deepEqual(calls.discards, [id])
  assert.deepEqual(store.getSnapshot().finished, [
    {
      sessionId: id,
      target: 'catalog',
      style: {
        name: 'Garabatos Mono',
        sections: SECTIONS,
        templateVersion: 1,
        characterMode: 'none',
        character: null,
      },
    },
  ])
  store.dismissFinished(id)
  assert.equal(store.getSnapshot().finished.length, 0)
})

test('a catalog clone with a character hands its identity over as the fixed character of the gem', async () => {
  const { store, id, calls } = await started({ target: 'catalog' })
  store.respond(id, { kind: 'choose-character', option: 3, travel: 'text' })
  await settle(store, id)

  store.respond(id, { kind: 'approve' })
  assert.equal(await settle(store, id), undefined)

  assert.deepEqual(calls.saves, [])
  assert.deepEqual(calls.discards, [id])
  const [finished] = store.getSnapshot().finished
  assert.equal(finished.target, 'catalog')
  assert.deepEqual(finished.style.character, {
    name: 'Rubio de Traje',
    description: IDENTITY.description,
  })
  assert.equal(finished.style.characterMode, null)
})

test('a catalog clone whose folder cannot be removed still ends as a draft', async () => {
  const { store, id, state } = await started({
    target: 'catalog',
    replicateCharacter: false,
  })
  state.fail.discard = 'style_clone_session_missing'
  store.respond(id, { kind: 'approve' })
  assert.equal(await settle(store, id), undefined)
  const { finished } = store.getSnapshot()
  assert.equal(finished.length, 1)
  assert.equal(finished[0].target, 'catalog')
})

test('a session stored before clones had a destination comes back bound for Mi estilo', async () => {
  const first = await started()
  const stored = JSON.parse(first.stored.value)
  for (const session of stored.sessions) delete session.target

  const second = world({ storage: JSON.stringify(stored) })
  assert.equal(sessionOf(second.store, first.id).target, 'custom')
  const third = await started({ target: 'catalog' })
  assert.equal(sessionOf(third.store, third.id).target, 'catalog')
})

test('a style without a character is saved without one', async () => {
  const { store, id, calls } = await started({ replicateCharacter: false })

  store.respond(id, { kind: 'approve' })
  await settle(store, id)

  assert.equal(calls.saves[0].character, undefined)
  // Sin sugerencia del servidor no viaja ningún modo: queda en genérico.
  assert.equal('characterMode' in calls.saves[0], false)
  assert.equal(calls.saves[0].name, 'Cómic Palo')
})

test('a style whose original shows no characters is saved without one', async () => {
  const { store, calls, state, id } = await started({
    replicateCharacter: false,
  })
  state.characterMode = 'none'

  store.respond(id, { kind: 'approve' })
  await settle(store, id)

  assert.equal(calls.saves[0].characterMode, 'none')
  assert.equal(calls.saves[0].character, undefined)
})

test('a cloned character is saved without the mode the server suggested', async () => {
  const { store, calls, state, id } = await started()
  store.respond(id, { kind: 'choose-character', option: 1, travel: 'text' })
  await settle(store, id)
  state.characterMode = 'none'

  store.respond(id, { kind: 'approve' })
  await settle(store, id)

  assert.equal(calls.saves[0].character.travel, 'text')
  assert.equal('characterMode' in calls.saves[0], false)
})

test('a save that fails is retried with the mode the server suggested', async () => {
  const context = await started({ replicateCharacter: false })
  const { id } = context
  context.state.characterMode = 'none'
  context.state.fail.save = 'style_save_failed'

  context.store.respond(id, { kind: 'approve' })
  const failed = await settle(context.store, id)
  assert.equal(failed.characterMode, 'none')

  context.store.retry(id)
  await settle(context.store, id)

  assert.equal(context.calls.saves.length, 2)
  assert.equal(context.calls.saves[1].characterMode, 'none')
})

test('a character the AI left unnamed takes the name of the style', async () => {
  const context = world()
  const turn = context.steps.turn
  context.steps.turn = async (draft, material) => {
    const result = await turn(draft, material)
    return result.identity
      ? { ...result, identity: { ...IDENTITY, name: '' } }
      : result
  }
  const id = context.store.start(input())
  await settle(context.store, id)
  context.store.respond(id, {
    kind: 'choose-character',
    option: 1,
    travel: 'photo',
  })
  await settle(context.store, id)

  context.store.respond(id, { kind: 'approve' })
  await settle(context.store, id)

  assert.equal(context.calls.saves[0].character.name, 'Cómic Palo')
})

test('a style the AI left unnamed takes the fallback name', async () => {
  const context = world()
  const turn = context.steps.turn
  context.steps.turn = async (draft, material) => ({
    ...(await turn(draft, material)),
    name: '',
  })

  const id = context.store.start(input({ replicateCharacter: false }))
  const session = await settle(context.store, id)

  assert.equal(session.name, 'Estilo clonado')
})

// ── Fallos y reintentos ──

test('a failed turn stops the session and retrying repeats only that turn', async () => {
  const context = world()
  context.state.fail.turn = 'modelo-timeout'
  const id = context.store.start(input())
  const failed = await settle(context.store, id)

  assert.equal(failed.status, 'failed')
  assert.equal(failed.errorCode, 'modelo-timeout')
  assert.deepEqual(failed.material, MATERIAL)
  assert.ok(!styleCloneNeedsAnswer(failed))

  context.store.retry(id)
  const session = await settle(context.store, id)

  assert.equal(session.status, 'awaiting')
  assert.equal(session.errorCode, null)
  assert.equal(context.calls.prepare, 1)
  assert.equal(context.calls.turns.length, 2)
})

test('running out of credits keeps the drawn tests and retrying draws only the rest', async () => {
  const context = world()
  context.state.fail.draw = 'image_insufficient_credits'
  const id = context.store.start(input({ replicateCharacter: false }))
  const failed = await settle(context.store, id)

  assert.equal(failed.status, 'failed')
  assert.equal(failed.errorCode, 'image_insufficient_credits')
  assert.equal(failed.scenes[0].path, '/r/scene-r1-1.jpg')
  assert.equal(failed.scenes[1].path, undefined)

  context.store.retry(id)
  const session = await settle(context.store, id)

  assert.equal(session.status, 'awaiting')
  // El turno ya estaba pago: no se repite. Solo se dibujan las que faltaban.
  assert.equal(context.calls.turns.length, 1)
  assert.deepEqual(
    context.calls.draws[1].items.map((item) => item.index),
    [2, 3, 4],
  )
  assert.ok(session.scenes.every((scene) => scene.path))
})

test('one test that failed is retried alone, without another turn', async () => {
  const context = world()
  context.state.drawErrors[3] = 'image_content_policy'
  const id = context.store.start(input({ replicateCharacter: false }))
  const session = await settle(context.store, id)

  assert.equal(session.status, 'awaiting')
  assert.equal(session.scenes[2].errorCode, 'image_content_policy')
  assert.equal(session.scenes[2].path, undefined)

  context.store.respond(id, { kind: 'redraw', target: 'scenes', indexes: [3] })
  assert.equal(sessionOf(context.store, id).status, 'drawing')
  const redrawn = await settle(context.store, id)

  assert.equal(context.calls.turns.length, 1)
  assert.deepEqual(
    context.calls.draws[1].items.map((item) => item.index),
    [3],
  )
  assert.equal(context.calls.draws[1].round, 1)
  assert.equal(redrawn.scenes[2].path, '/r/scene-r1-3.jpg')
  assert.equal(redrawn.scenes[2].errorCode, undefined)
})

test('a save that fails is retried without paying another turn', async () => {
  const context = world()
  const id = context.store.start(input({ replicateCharacter: false }))
  await settle(context.store, id)
  context.state.fail.save = 'style_save_failed'

  context.store.respond(id, { kind: 'approve' })
  const failed = await settle(context.store, id)
  assert.equal(failed.status, 'failed')
  assert.equal(failed.errorCode, 'style_save_failed')
  assert.deepEqual(failed.sections, SECTIONS)

  context.store.retry(id)
  assert.equal(await settle(context.store, id), undefined)
  assert.equal(
    context.calls.turns.filter((turn) => turn.draft.accion === 'aprobar')
      .length,
    1,
  )
  assert.equal(context.calls.saves.length, 2)
})

test('images that are not images send the session back with the list of them', async () => {
  const context = world()
  context.state.rejected = [2, 5]
  const id = context.store.start(
    input({
      source: {
        kind: 'images',
        paths: ['/a.png', '/b.png', '/c.png', '/d.png', '/e.png'],
      },
    }),
  )
  const session = await settle(context.store, id)

  assert.equal(session.status, 'failed')
  assert.equal(session.errorCode, 'style_clone_invalid_images')
  assert.deepEqual(session.rejectedImages, [2, 5])
  assert.equal(context.calls.turns.length, 0)
})

// ── Lo que la persona puede hacer ──

test('answers are taken only while the session waits', async () => {
  const context = world()
  context.state.hold.turn = hold()
  const id = context.store.start(input())
  await new Promise((resolve) => setImmediate(resolve))

  context.store.respond(id, { kind: 'approve' })
  context.store.respond(id, { kind: 'adjust-character', comment: 'x' })
  assert.equal(sessionOf(context.store, id).action.kind, 'analyze')

  context.state.hold.turn.release()
  delete context.state.hold.turn
  const session = await settle(context.store, id)
  assert.equal(session.step, 'character')
  assert.equal(context.calls.turns.length, 1)

  // Con la sesión otra vez trabajando, una respuesta que SÍ corresponde a su
  // paso tampoco entra: ya hay una acción en curso.
  context.state.hold.turn = hold()
  context.store.respond(id, {
    kind: 'adjust-character',
    comment: 'Sin lentes.',
  })
  context.store.respond(id, {
    kind: 'choose-character',
    option: 1,
    travel: 'text',
  })
  assert.equal(sessionOf(context.store, id).action.kind, 'adjust-character')
  context.state.hold.turn.release()
  delete context.state.hold.turn
  const adjusted = await settle(context.store, id)
  assert.equal(adjusted.choice, null)
  assert.equal(context.calls.turns.length, 2)
})

test('an answer that does not fit the step is ignored', async () => {
  const { store, id, calls } = await started()

  store.respond(id, { kind: 'choose-character', option: 7, travel: 'text' })
  store.respond(id, { kind: 'adjust-character', comment: '   ' })
  store.respond(id, {
    kind: 'adjust-scenes',
    comment: 'todavía no hay escenas',
  })
  store.respond(id, { kind: 'approve' })
  store.respond(id, { kind: 'redraw', target: 'designs', indexes: [] })

  assert.equal(sessionOf(store, id).status, 'awaiting')
  assert.equal(calls.turns.length, 1)
})

test('a style is not approved without at least one drawn scene', async () => {
  const context = world()
  for (const index of [1, 2, 3, 4])
    context.state.drawErrors[index] = 'image_provider_error'
  const id = context.store.start(input({ replicateCharacter: false }))
  const session = await settle(context.store, id)
  assert.ok(session.scenes.every((scene) => scene.errorCode && !scene.path))

  context.store.respond(id, { kind: 'approve' })

  assert.equal(sessionOf(context.store, id).status, 'awaiting')
  assert.equal(context.calls.turns.length, 1)
})

test('the name can be edited while the session waits, within its limit', async () => {
  const { store, id } = await started()

  store.rename(id, '  Mi estilo de palitos  ')
  assert.equal(sessionOf(store, id).name, 'Mi estilo de palitos')
  store.rename(id, 'x'.repeat(200))
  assert.equal(sessionOf(store, id).name.length, 80)
})

test('up to three clones run at once', async () => {
  const context = world()
  assert.equal(STYLE_CLONE_SESSION_LIMIT, 3)
  const ids = [1, 2, 3].map(() => context.store.start(input()))
  assert.ok(ids.every(Boolean))
  assert.equal(context.store.canStart(), false)
  assert.equal(context.store.start(input()), null)

  await Promise.all(ids.map((id) => settle(context.store, id)))
  // Esperando una respuesta siguen contando: son tres clonaciones abiertas.
  assert.equal(context.store.canStart(), false)
  await context.store.discard(ids[0])
  assert.equal(context.store.canStart(), true)
})

test('discarding removes the session and its folder, even mid-run', async () => {
  const context = world()
  context.state.hold.turn = hold()
  const id = context.store.start(input())
  await new Promise((resolve) => setImmediate(resolve))

  await context.store.discard(id)
  assert.equal(sessionOf(context.store, id), undefined)
  assert.deepEqual(context.calls.discards, [id])

  // La respuesta que llega después no revive la sesión ni dibuja nada.
  context.state.hold.turn.release()
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(sessionOf(context.store, id), undefined)
  assert.equal(context.calls.draws.length, 0)
  assert.equal(JSON.parse(context.stored.value).sessions.length, 0)
})

// ── Lo que sobrevive a cerrar la app ──

test('every change is stored and a waiting session comes back waiting', async () => {
  const first = await started()
  const stored = first.stored.value
  assert.equal(JSON.parse(stored).version, 1)

  const second = world({ storage: stored })
  const session = sessionOf(second.store, first.id)

  assert.equal(session.status, 'awaiting')
  assert.equal(session.designs.length, 3)
  assert.equal(second.calls.prepare, 0)
  second.store.respond(first.id, {
    kind: 'choose-character',
    option: 1,
    travel: 'text',
  })
  assert.equal((await settle(second.store, first.id)).step, 'scenes')
})

test('a session caught working comes back interrupted and resumes only its step', async () => {
  const first = world()
  first.state.hold.draw = hold()
  const id = first.store.start(input({ replicateCharacter: false }))
  for (
    let turn = 0;
    turn < 20 && sessionOf(first.store, id).status !== 'drawing';
    turn++
  )
    await new Promise((resolve) => setImmediate(resolve))
  assert.equal(sessionOf(first.store, id).status, 'drawing')

  // La app se cierra acá: lo guardado dice «dibujando».
  const second = world({ storage: first.stored.value })
  const interrupted = sessionOf(second.store, id)
  assert.equal(interrupted.status, 'interrupted')
  assert.equal(interrupted.phase, 'draw')
  assert.equal(second.calls.draws.length, 0)

  second.store.retry(id)
  const session = await settle(second.store, id)
  assert.equal(session.status, 'awaiting')
  assert.equal(second.calls.prepare, 0)
  assert.equal(second.calls.turns.length, 0)
  assert.equal(second.calls.draws.length, 1)
})

test('a storage that cannot be read starts empty', () => {
  for (const storage of [
    'no es json',
    '{"version":2,"sessions":[{}]}',
    '{"sessions":"x"}',
    '[]',
  ]) {
    const { store } = world({ storage })
    assert.equal(store.getSnapshot().sessions.size, 0)
  }
  // Una sesión rota no arrastra a las demás.
  const { store } = world({
    storage: JSON.stringify({
      version: 1,
      sessions: [{ id: 'sin forma' }, null],
    }),
  })
  assert.equal(store.getSnapshot().sessions.size, 0)
})

test('subscribers hear every change and the snapshot only changes with them', async () => {
  const context = world()
  let changes = 0
  const unsubscribe = context.store.subscribe(() => {
    changes += 1
  })
  const before = context.store.getSnapshot()
  assert.equal(context.store.getSnapshot(), before)

  const id = context.store.start(input())
  await settle(context.store, id)
  assert.ok(changes >= 4)
  assert.notEqual(context.store.getSnapshot(), before)

  unsubscribe()
  const seen = changes
  context.store.rename(id, 'Otro nombre')
  assert.equal(changes, seen)
})
