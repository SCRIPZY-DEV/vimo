// Estilos y personajes que «desaparecen»: la biblioteca nunca confunde una
// carpeta de proyectos ilegible con una vacía (falla con
// projects_root_unavailable), el primer uso sigue siendo una lista vacía, cada
// entrada salteada deja en el log su id y el porqué (sin contenido del
// usuario), y la metadata del personaje se escribe atómica. Sin HTTP: solo
// disco temporal.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import { stylesList } from '../../pipeline/commands/styles/styles-list.ts'
import { styleSave } from '../../pipeline/commands/styles/style-save.ts'
import { charactersList } from '../../pipeline/commands/characters/characters-list.ts'
import { characterCreate } from '../../pipeline/commands/characters/character-create.ts'
import { characterUpdate } from '../../pipeline/commands/characters/character-update.ts'

const PRIVATE_TEXT = 'Secret gem text the user wrote'

function context(root, payload) {
  const events = []
  return {
    events,
    job: {
      jobId: 'fixture',
      projectsRoot: root,
      apiKeys: {},
      binaryPaths: {},
      payload,
    },
    config: resolvePipelineConfig(),
    signal: new AbortController().signal,
    emitter: { emit: (event) => events.push(event) },
  }
}

async function projectsRoot(t) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-library-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

function warnings(ctx) {
  return ctx.events.filter(
    (event) => event.type === 'log' && event.level === 'warn',
  )
}

async function saveStyle(root, id) {
  await styleSave(
    context(root, { id, name: 'Watercolor', systemPrompt: PRIVATE_TEXT }),
  )
}

async function createCharacter(root) {
  const { entry } = await characterCreate(
    context(root, {
      name: 'Ana',
      description: 'A tall woman with short black hair and a red coat.',
    }),
  )
  return entry
}

test('una carpeta de proyectos que no existe falla, no lista vacío', async (t) => {
  const root = join(await projectsRoot(t), 'disconnected-drive')

  for (const list of [stylesList, charactersList])
    await assert.rejects(list(context(root)), {
      code: 'projects_root_unavailable',
    })
})

test('una carpeta de proyectos que es un archivo falla', async (t) => {
  const root = join(await projectsRoot(t), 'not-a-folder')
  await writeFile(root, 'x')

  for (const list of [stylesList, charactersList])
    await assert.rejects(list(context(root)), {
      code: 'projects_root_unavailable',
    })
})

test('el mensaje del fallo no lleva la ruta del usuario', async (t) => {
  const root = join(await projectsRoot(t), 'UserName-folder')

  await assert.rejects(stylesList(context(root)), (error) => {
    assert.ok(!error.message.includes('UserName-folder'))
    return true
  })
})

test('primer uso: sin _styles ni characters la lista está vacía y sin avisos', async (t) => {
  const root = await projectsRoot(t)

  const stylesContext = context(root)
  assert.deepEqual((await stylesList(stylesContext)).entries, [])
  const charactersContext = context(root)
  assert.deepEqual((await charactersList(charactersContext)).entries, [])
  assert.deepEqual(warnings(stylesContext), [])
  assert.deepEqual(warnings(charactersContext), [])
})

test('un style.json truncado se saltea y deja id y motivo en el log', async (t) => {
  const root = await projectsRoot(t)
  await saveStyle(root, 'st-good')
  await mkdir(join(root, '_styles', 'st-broken'))
  await writeFile(
    join(root, '_styles', 'st-broken', 'style.json'),
    `{"name":"Watercolor","systemPrompt":"${PRIVATE_TEXT}`,
  )
  await mkdir(join(root, '_styles', 'st-empty'))

  const ctx = context(root)
  const { entries } = await stylesList(ctx)

  assert.deepEqual(
    entries.map((style) => style.id),
    ['st-good'],
  )
  const messages = warnings(ctx).map((event) => event.message)
  assert.deepEqual(messages.sort(), [
    'skipped style "st-broken": invalid_json',
    'skipped style "st-empty": ENOENT',
  ])
  assert.ok(messages.every((message) => !message.includes(PRIVATE_TEXT)))
})

test('un style.json válido sin la forma esperada se reporta como invalid_content', async (t) => {
  const root = await projectsRoot(t)
  await mkdir(join(root, '_styles', 'st-odd'), { recursive: true })
  await writeFile(join(root, '_styles', 'st-odd', 'style.json'), '[1, 2]')

  const ctx = context(root)
  await stylesList(ctx)

  assert.deepEqual(
    warnings(ctx).map((event) => event.message),
    ['skipped style "st-odd": invalid_content'],
  )
})

test('una metadata de personaje truncada se saltea con su id y motivo', async (t) => {
  const root = await projectsRoot(t)
  const good = await createCharacter(root)
  await mkdir(join(root, 'characters', 'ana-broken'))
  await writeFile(
    join(root, 'characters', 'ana-broken', 'metadata.json'),
    '{"name":"Ana","description":"A tall',
  )

  const ctx = context(root)
  const { entries } = await charactersList(ctx)

  assert.deepEqual(
    entries.map((entry) => entry.id),
    [good.id],
  )
  assert.deepEqual(
    warnings(ctx).map((event) => event.message),
    ['skipped character "ana-broken": invalid_json'],
  )
})

test('un personaje con foto que perdió su archivo se reporta como photo_missing', async (t) => {
  const root = await projectsRoot(t)
  await mkdir(join(root, 'characters', 'ana-photo'), { recursive: true })
  await writeFile(
    join(root, 'characters', 'ana-photo', 'metadata.json'),
    JSON.stringify({
      name: 'Ana',
      description: '',
      createdAt: '2026-10-13T00:00:00.000Z',
      previews: [],
      photoFile: 'photo.abc123.jpg',
    }),
  )

  const ctx = context(root)
  assert.deepEqual((await charactersList(ctx)).entries, [])
  assert.deepEqual(
    warnings(ctx).map((event) => event.message),
    ['skipped character "ana-photo": photo_missing'],
  )
})

test('carpetas ajenas y archivos sueltos no se reportan', async (t) => {
  const root = await projectsRoot(t)
  await mkdir(join(root, '_styles', 'Not A Style'), { recursive: true })
  await writeFile(join(root, '_styles', 'st-file'), 'x')
  await mkdir(join(root, 'characters', 'not valid!'), { recursive: true })
  await writeFile(join(root, 'characters', 'loose-file'), 'x')

  const stylesContext = context(root)
  await stylesList(stylesContext)
  const charactersContext = context(root)
  await charactersList(charactersContext)

  assert.deepEqual(warnings(stylesContext), [])
  assert.deepEqual(warnings(charactersContext), [])
})

test('crear y editar un personaje no deja temporales y la metadata se relee', async (t) => {
  const root = await projectsRoot(t)
  const created = await createCharacter(root)

  await characterUpdate(context(root, { id: created.id, name: 'Ana María' }))

  const files = await readdir(join(root, 'characters', created.id))
  assert.ok(files.every((file) => !file.endsWith('.tmp')))
  const ctx = context(root)
  const { entries } = await charactersList(ctx)
  assert.deepEqual(
    entries.map((entry) => entry.name),
    ['Ana María'],
  )
  assert.deepEqual(warnings(ctx), [])
})
