// Guardar y descartar una clonación de estilo (`style-clone-save` y
// `style-clone-discard`, ADR-0050). El estilo clonado es un estilo normal de
// Mi estilo: secciones, versión, las clonaciones aprobadas como muestras y el
// origen `ai-clone`. Si la clonación replicó al personaje, se crea en la
// biblioteca —con el diseño como foto, o sin foto y con el diseño como su
// retrato del estilo nuevo— y el estilo lo trae por defecto en «Mi
// personaje»; sin personaje replicado queda en «Personaje genérico», o en
// «Sin personaje» si el original no muestra ninguno. Todo se valida antes de
// tocar el disco y un guardado que falla no deja ni un estilo ni un personaje
// a medias. Sin red: disco temporal.

import assert from 'node:assert/strict'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { charactersList } from '../../pipeline/commands/characters/characters-list.ts'
import { styleCloneDiscard } from '../../pipeline/commands/styles/style-clone-discard.ts'
import { styleCloneSave } from '../../pipeline/commands/styles/style-clone-save.ts'
import { stylesList } from '../../pipeline/commands/styles/styles-list.ts'
import { stylesSubcommands } from '../../pipeline/commands/styles/subcommands.ts'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'

const SESSION = 'sc-fixture-1'
const VIDEO_URL = 'https://www.youtube.com/watch?v=tBBhUn0D0I0'
const PNG_HEAD = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFOsAAAAASUVORK5CYII=',
  'base64',
)
// Imágenes válidas y distintas entre sí: los bytes de un PNG más una marca.
const picture = (label) => Buffer.concat([PNG_HEAD, Buffer.from(label)])
const SCENES = [1, 2, 3, 4].map((index) => `scene-r2-${index}.jpg`)
const DESIGN = 'design-r1-2.jpg'
const IDENTITY =
  'A stickman cook with a large round white head and thin black limbs. Outfit: a white apron and a tall chef hat.'
const sections = {
  visualStyle:
    'Flat stickman drawings with thick black outlines on muted backgrounds.',
  rules: 'No text unless the scene quotes it.',
  camera: 'Mostly wide shots; close-ups for objects.',
  promptEnd:
    'Style: ' +
    'flat 2D stickman drawing, thick black outlines, '.repeat(18).trim() +
    ' If any text appears in the image, it must be written in [IDIOMA DEL GUION].',
}

async function session(t, { source = 'youtube' } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-style-clone-save-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const directory = join(root, '_style-clones', SESSION)
  await mkdir(directory, { recursive: true })
  await writeFile(
    join(directory, 'material.json'),
    JSON.stringify({
      source,
      ...(source === 'youtube' ? { videoUrl: VIDEO_URL } : {}),
      title: 'Fixture',
      items: [],
    }),
  )
  for (const file of [...SCENES, DESIGN])
    await writeFile(join(directory, file), picture(file))
  return { root, directory }
}
function context(root, payload) {
  return {
    job: {
      jobId: 'fixture',
      projectsRoot: root,
      apiKeys: {},
      binaryPaths: {},
      payload,
    },
    config: resolvePipelineConfig(),
    signal: new AbortController().signal,
    emitter: { emit() {} },
  }
}
function payload(extra = {}) {
  return {
    sessionId: SESSION,
    name: 'Cocinero del cartel',
    sections,
    templateVersion: 1,
    samples: SCENES,
    ...extra,
  }
}
const character = (travel, extra = {}) => ({
  travel,
  name: 'El Cocinero',
  description: IDENTITY,
  designFile: DESIGN,
  ...extra,
})
const save = (root, extra) => styleCloneSave(context(root, payload(extra)))
async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}
async function storedStyle(root, id) {
  return JSON.parse(
    await readFile(join(root, '_styles', id, 'style.json'), 'utf8'),
  )
}
async function storedCharacter(root, id) {
  return JSON.parse(
    await readFile(join(root, 'characters', id, 'metadata.json'), 'utf8'),
  )
}

// ── El estilo ──

test('a clone without a character becomes a normal style of Mi estilo', async (t) => {
  const { root, directory } = await session(t)

  const { entry, character: created } = await save(root)

  assert.match(entry.id, /^st-[a-z0-9]+-[a-z0-9]+$/)
  assert.equal(entry.name, 'Cocinero del cartel')
  assert.deepEqual(entry.sections, sections)
  assert.equal(entry.templateVersion, 1)
  assert.deepEqual(entry.shots, [])
  assert.deepEqual(entry.character, { mode: 'generic' })
  assert.deepEqual(entry.origin, {
    kind: 'ai-clone',
    source: 'youtube',
    videoUrl: VIDEO_URL,
  })
  assert.equal(created, undefined)

  // Las clonaciones aprobadas son las muestras, en su orden.
  assert.deepEqual(
    entry.samples.map((sample) => sample.file),
    ['sample-1.jpg', 'sample-2.jpg', 'sample-3.jpg', 'sample-4.jpg'],
  )
  for (const [index, sample] of entry.samples.entries())
    assert.deepEqual(await readFile(sample.path), picture(SCENES[index]))

  const stored = await storedStyle(root, entry.id)
  assert.equal(stored.systemPrompt, undefined)
  assert.equal(stored.createdAt, stored.updatedAt)
  const listed = await stylesList(context(root))
  assert.deepEqual(
    listed.entries.map((style) => style.id),
    [entry.id],
  )
  // La carpeta de la sesión se borra al guardar.
  assert.equal(await exists(directory), false)
  assert.equal(await exists(join(root, 'characters')), false)
})

test('a clone made from images says so in its origin', async (t) => {
  const { root } = await session(t, { source: 'images' })

  const { entry } = await save(root)

  assert.deepEqual(entry.origin, { kind: 'ai-clone', source: 'images' })
})

test('the approved samples can be fewer than four and keep their order', async (t) => {
  const { root } = await session(t)

  const { entry } = await save(root, { samples: [SCENES[2], SCENES[0]] })

  assert.equal(entry.samples.length, 2)
  assert.deepEqual(await readFile(entry.samples[0].path), picture(SCENES[2]))
  assert.deepEqual(await readFile(entry.samples[1].path), picture(SCENES[0]))
})

test('the character section never travels in a cloned style', async (t) => {
  const { root } = await session(t)

  const { entry } = await save(root, {
    sections: { ...sections, character: 'A stickman cook.' },
  })

  assert.equal(entry.sections.character, undefined)
  assert.equal(entry.sections.visualStyle, sections.visualStyle)
})

test('a clone of an original that shows no characters is saved as a style without a character', async (t) => {
  const { root } = await session(t)

  const { entry, character: created } = await save(root, {
    characterMode: 'none',
  })

  assert.deepEqual(entry.character, { mode: 'none' })
  assert.equal(created, undefined)
  assert.deepEqual((await storedStyle(root, entry.id)).character, {
    mode: 'none',
  })
  assert.equal(await exists(join(root, 'characters')), false)
})

test('a clone can say out loud that it keeps the generic character', async (t) => {
  const { root } = await session(t)

  const { entry } = await save(root, { characterMode: 'generic' })

  assert.deepEqual(entry.character, { mode: 'generic' })
})

// ── El personaje ──

test('a photo character is created with the design as its photo and set as the default', async (t) => {
  const { root } = await session(t)

  const { entry, character: created } = await save(root, {
    character: character('photo'),
  })

  assert.equal(created.name, 'El Cocinero')
  assert.equal(created.description, IDENTITY)
  assert.deepEqual(await readFile(created.photoPath), picture(DESIGN))
  assert.deepEqual(created.previews, [])
  assert.deepEqual(entry.character, {
    mode: 'own',
    defaultCharacterId: created.id,
  })

  const metadata = await storedCharacter(root, created.id)
  assert.match(metadata.photoFile, /^photo\.[a-z0-9]+\.png$/)
  const library = await charactersList(context(root))
  assert.deepEqual(
    library.entries.map((item) => item.id),
    [created.id],
  )
})

test('a prompt-identity character has no photo and keeps the design as its portrait in the new style', async (t) => {
  const { root } = await session(t)

  const { entry, character: created } = await save(root, {
    character: character('text'),
  })

  assert.equal(created.photoPath, undefined)
  assert.equal(created.description, IDENTITY)
  assert.equal(created.previews.length, 1)
  assert.equal(created.previews[0].styleId, entry.id)
  assert.deepEqual(
    await readFile(created.previews[0].imagePath),
    picture(DESIGN),
  )
  assert.deepEqual(entry.character, {
    mode: 'own',
    defaultCharacterId: created.id,
  })

  const metadata = await storedCharacter(root, created.id)
  assert.equal(metadata.photoFile, undefined)
  assert.deepEqual(metadata.previews, [
    { styleId: entry.id, file: `preview.${entry.id}.png` },
  ])
})

test('a cloned character is the default of its style whatever mode was suggested', async (t) => {
  const { root } = await session(t)

  const { entry, character: created } = await save(root, {
    character: character('text'),
    characterMode: 'none',
  })

  assert.deepEqual(entry.character, {
    mode: 'own',
    defaultCharacterId: created.id,
  })
})

// ── Rechazos ──

for (const [name, extra] of [
  ['a session id that leaves the folder', { sessionId: '../outside' }],
  ['an empty name', { name: '   ' }],
  ['a name over 80', { name: 'x'.repeat(81) }],
  ['sections without a visual style', { sections: { rules: 'x' } }],
  [
    'a fixed end over 1 000',
    { sections: { ...sections, promptEnd: 'x'.repeat(1_001) } },
  ],
  ['a template version from the future', { templateVersion: 2 }],
  ['no template version', { templateVersion: undefined }],
  ['no samples', { samples: [] }],
  ['more than four samples', { samples: [...SCENES, DESIGN] }],
  ['a repeated sample', { samples: [SCENES[0], SCENES[0]] }],
  ['a sample outside the session', { samples: ['../../secret.jpg'] }],
  ['a character mode that is not one of a clone', { characterMode: 'own' }],
  ['a character mode that does not exist', { characterMode: 'nobody' }],
  ['a travel mode that does not exist', { character: character('video') }],
  [
    'a character without a name',
    { character: character('text', { name: ' ' }) },
  ],
  [
    'a prompt identity too short to be one',
    { character: character('text', { description: 'A cook.' }) },
  ],
  [
    'a design outside the session',
    { character: character('photo', { designFile: '../design.jpg' }) },
  ],
]) {
  test(`style-clone-save rejects ${name} and writes nothing`, async (t) => {
    const { root, directory } = await session(t)

    await assert.rejects(save(root, extra), { code: 'invalid_payload' })

    assert.equal(await exists(join(root, '_styles')), false)
    assert.equal(await exists(join(root, 'characters')), false)
    assert.equal(await exists(directory), true)
  })
}

for (const [name, extra] of [
  ['a sample that was never drawn', { samples: ['scene-r9-1.jpg'] }],
  [
    'a design that was never drawn',
    { character: character('photo', { designFile: 'design-r9-1.jpg' }) },
  ],
]) {
  test(`style-clone-save fails on ${name} and writes nothing`, async (t) => {
    const { root, directory } = await session(t)

    await assert.rejects(save(root, extra), {
      code: 'style_clone_file_missing',
    })

    assert.equal(await exists(join(root, '_styles')), false)
    assert.equal(await exists(join(root, 'characters')), false)
    assert.equal(await exists(directory), true)
  })
}

test('a sample that is not an image is not saved as one', async (t) => {
  const { root, directory } = await session(t)
  await writeFile(join(directory, SCENES[1]), 'not an image')

  await assert.rejects(save(root), { code: 'style_clone_file_missing' })
  assert.equal(await exists(join(root, '_styles')), false)
})

test('a session that is gone cannot be saved', async (t) => {
  const { root, directory } = await session(t)
  await rm(directory, { recursive: true })

  await assert.rejects(save(root), { code: 'style_clone_session_missing' })
  assert.equal(await exists(join(root, '_styles')), false)
})

test('a save that fails halfway leaves no style and no character behind', async (t) => {
  const { root, directory } = await session(t)
  // La biblioteca no se puede crear: `characters` es un archivo.
  await writeFile(join(root, 'characters'), 'in the way')

  await assert.rejects(save(root, { character: character('photo') }))

  assert.deepEqual(await readdir(join(root, '_styles')), [])
  // La sesión sigue ahí: se puede volver a intentar.
  assert.equal(await exists(join(directory, DESIGN)), true)
})

// ── Descartar ──

test('discarding removes only the folder of that session', async (t) => {
  const { root, directory } = await session(t)
  const other = join(root, '_style-clones', 'sc-other')
  await mkdir(other, { recursive: true })

  const result = await styleCloneDiscard(context(root, { sessionId: SESSION }))

  assert.equal(result, null)
  assert.equal(await exists(directory), false)
  assert.equal(await exists(other), true)
  // Idempotente: descartar una sesión que ya no está no es un error.
  await styleCloneDiscard(context(root, { sessionId: SESSION }))
})

test('discarding rejects a session id that leaves the folder', async (t) => {
  const { root, directory } = await session(t)

  for (const sessionId of ['..', '../_styles', '', undefined])
    await assert.rejects(styleCloneDiscard(context(root, { sessionId })), {
      code: 'invalid_payload',
    })
  assert.equal(await exists(directory), true)
})

test('the subcommands are registered', () => {
  assert.equal(stylesSubcommands['style-clone-save'], styleCloneSave)
  assert.equal(stylesSubcommands['style-clone-discard'], styleCloneDiscard)
})
