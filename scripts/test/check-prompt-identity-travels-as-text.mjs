// Cómo viaja un personaje (2026-10-02): con identidad de prompt viaja SIEMPRE
// como texto, tenga o no retrato en el estilo del video; solo un personaje
// «con foto» viaja como imagen de referencia. El retrato de un personaje de
// texto queda para verlo en la biblioteca, nunca como referencia.
import assert from 'node:assert/strict'
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createVideoProject } from '../../pipeline/commands/videos/create-video-project.ts'
import { loadPipelineCharacters } from '../../pipeline/project/characters.ts'
import { resolveProjectPaths } from '../../pipeline/project/paths.ts'

const imageBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFOsAAAAASUVORK5CYII=',
  'base64',
)
const STYLE_ID = 'st-fixture'
const DESCRIPTION =
  'A woman in her thirties with curly red hair, green eyes, freckles across her nose and a mustard yellow raincoat.'

function context(root, payload, events = []) {
  return {
    job: {
      jobId: 'fixture',
      apiKeys: {},
      binaryPaths: {},
      projectsRoot: root,
      payload,
    },
    signal: new AbortController().signal,
    emitter: {
      emit(event) {
        events.push(event)
      },
    },
  }
}

// Personaje de la biblioteca: retrato hecho en el estilo del video y, si se
// pide, una foto.
async function libraryCharacter(root, { photo = false } = {}) {
  const folder = join(root, 'characters', 'lucia')
  await mkdir(folder, { recursive: true })
  await writeFile(join(folder, 'preview.png'), imageBytes)
  if (photo) await writeFile(join(folder, 'photo.png'), imageBytes)
  await writeFile(
    join(folder, 'metadata.json'),
    JSON.stringify({
      name: 'Lucía',
      description: DESCRIPTION,
      createdAt: '2026-10-02T00:00:00.000Z',
      previews: [{ styleId: STYLE_ID, file: 'preview.png' }],
      ...(photo ? { photoFile: 'photo.png' } : {}),
    }),
  )
}

function projectPayload(mode) {
  return {
    name: 'Fixture',
    options: {
      styleId: 'normal',
      narrationMode: 'own-audio',
      imageProvider: 'fal',
      sceneCount: 0,
      customStyle: {
        styleId: STYLE_ID,
        name: 'Watercolor',
        systemPrompt: 'Illustrate every scene as a soft watercolor.',
        character: { mode: 'own', defaultCharacterId: 'lucia' },
      },
    },
    characters: [
      { characterId: 'lucia', name: 'Lucía', description: DESCRIPTION, mode },
    ],
  }
}

async function createdProject(t, mode, library) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-identity-travel-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await libraryCharacter(root, library)

  const { projectDir } = await createVideoProject(
    context(root, projectPayload(mode)),
  )
  const metadata = JSON.parse(
    await readFile(join(projectDir, 'project.json'), 'utf8'),
  )
  const files = await readdir(join(projectDir, 'characters')).catch(() => [])
  return { character: metadata.options.characters[0], files }
}

test('create-video-project: a text character with a portrait in the video style travels without a reference', async (t) => {
  const { character, files } = await createdProject(t, 'text')

  assert.equal(character.mode, 'text')
  assert.equal(character.referenceImageFile, undefined)
  assert.deepEqual(files, [])
})

test('create-video-project: a photo character still travels with its photo', async (t) => {
  const { character, files } = await createdProject(t, 'photo', {
    photo: true,
  })

  assert.equal(character.mode, 'photo')
  assert.equal(character.referenceImageFile, 'reference_1.png')
  assert.deepEqual(files, ['reference_1.png'])
})

// Aunque un personaje de texto ya no busque nada en la biblioteca, su id se
// guarda en project.json: uno inválido sigue siendo un payload roto.
test('create-video-project: a text character with an invalid library id is rejected', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'vimo-identity-travel-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const payload = projectPayload('text')
  payload.characters[0].characterId = '../outside'

  await assert.rejects(createVideoProject(context(root, payload)), {
    code: 'invalid_payload',
  })
})

// Proyectos creados antes de la regla: ya tienen el retrato copiado como
// referencia de un personaje de texto. Al regenerar, ese archivo no viaja.
async function loadedCharacter(t, character, { writeFile: write = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-identity-load-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const paths = resolveProjectPaths(root, 'fixture')
  await mkdir(paths.charactersDirectory, { recursive: true })
  if (write && character.referenceImageFile)
    await writeFile(
      join(paths.charactersDirectory, character.referenceImageFile),
      imageBytes,
    )

  const [loaded] = await loadPipelineCharacters(paths, [character])
  return loaded
}

test('project characters: a text character from an older project ignores its copied portrait', async (t) => {
  const loaded = await loadedCharacter(t, {
    name: 'Lucía',
    description: DESCRIPTION,
    mode: 'text',
    referenceImageFile: 'reference_1.png',
  })

  assert.equal(loaded.description, DESCRIPTION)
  assert.equal(loaded.imageDataUri, undefined)
})

test('project characters: a photo character loads its reference image', async (t) => {
  const loaded = await loadedCharacter(t, {
    name: 'Lucía',
    description: DESCRIPTION,
    mode: 'photo',
    referenceImageFile: 'reference_1.png',
  })

  assert.ok(loaded.imageDataUri?.startsWith('data:image/png;base64,'))
})

test('project characters: a photo character whose file is gone travels as text', async (t) => {
  const loaded = await loadedCharacter(
    t,
    {
      name: 'Lucía',
      description: DESCRIPTION,
      mode: 'photo',
      referenceImageFile: 'reference_1.png',
    },
    { writeFile: false },
  )

  assert.equal(loaded.imageDataUri, undefined)
})
