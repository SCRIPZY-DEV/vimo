// Regresiones herméticas del candado de identidad del Catálogo: el tono de
// piel del personaje no puede perderse entre escenas (estilo realista).
// Stages y helpers reales, HTTP simulado; todo vive en un mkdtemp.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import {
  buildReferenceIdentityLine,
  buildReferenceIdentityLineMulti,
} from '../../pipeline/prompts/character-reference.ts'
import { buildCharacterBibleBlock } from '../../pipeline/prompts/reference-characters.ts'
import { buildMandatoryCharactersBlock } from '../../pipeline/prompts/scene-prompt-blocks.ts'
import { MAX_PROMPT_CHARS } from '../../pipeline/prompts/prompt-limits.ts'
import { VISUAL_STYLES } from '../../pipeline/prompts/visual-styles.ts'
import { resolveProjectPaths } from '../../pipeline/project/paths.ts'
import { writeScenes } from '../../pipeline/project/scenes-file.ts'
import { imagesStage } from '../../pipeline/stages/images/images.ts'
import {
  lockCharacterComplexion,
  lockCharacterPresence,
  missingCharacterMention,
  missingComplexion,
  promptDepictsPerson,
  promptDepictsStandIn,
} from '../../pipeline/stages/scene-prompts/identity-lock.ts'
import { guaranteePrompts } from '../../pipeline/stages/scene-prompts/prompt-writer.ts'
import { bodyWithoutFinalClauses } from '../../pipeline/stages/shared/prompt-safety.ts'
import { finalizeSceneImagePrompt } from '../../pipeline/stages/shared/scene-prompt-finalization.ts'
import { createCatalogSceneLlm } from '../../pipeline/stages/shared/catalog-llm.ts'
import {
  extractComplexionClause,
  promptMentionsComplexion,
} from '../../pipeline/utils/character-complexion.ts'

const REALISM_ANCHOR = VISUAL_STYLES.normal.template.styleSuffix
const LUIS = {
  name: 'Luis',
  description:
    'short curly black hair, dark-skinned man in his 30s, red hoodie and jeans',
}
const PHOTO_ONLY = { name: 'Ana', description: '' }
const fragment = 'Luis pedalea por la avenida vacía al amanecer.'
const scene = {
  id: 1,
  text: fragment,
  startSeconds: 0,
  endSeconds: 4,
  direction: { treatment: 'action', place: 'avenue', emotion: 'determined' },
  charactersPresent: [0],
}
// Lo que el redactor devuelve cuando suelta la tez: pelo sí, piel no.
const promptWithoutSkin = `Medium shot of Luis, a man with short curly black hair in a red hoodie, pedaling hard down an empty avenue. Quiet city street at dawn, wet asphalt. Warm low sunlight from the left. Slight motion blur on the wheels. ${REALISM_ANCHOR}`
const promptWithSkin = promptWithoutSkin.replace(
  'a man with',
  'a dark-skinned man with',
)
const imageBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFOsAAAAASUVORK5CYII=',
  'base64',
)

function stream(content) {
  return new Response(
    'data: ' +
      JSON.stringify({
        choices: [{ delta: { content }, finish_reason: 'stop' }],
      }) +
      '\n\ndata: [DONE]\n\n',
    { headers: { 'content-type': 'text/event-stream' } },
  )
}
function baseContext() {
  const events = []
  return {
    job: {
      jobId: 'identity-lock-fixture',
      apiKeys: { deepinfra: 'fake', fal: 'fake', evolink: 'fake' },
      binaryPaths: {},
    },
    config: resolvePipelineConfig({ llm: { timeoutMs: 1000 } }),
    signal: new AbortController().signal,
    emitter: {
      emit(event) {
        events.push(event)
      },
    },
    events,
  }
}
async function fixture(t, initialScenes, character) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-identity-lock-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const paths = resolveProjectPaths(root, 'fixture')
  await mkdir(paths.scenesDirectory, { recursive: true })
  await writeScenes(paths, structuredClone(initialScenes))
  await writeFile(paths.scriptFile, fragment)
  if (character.referenceImageFile) {
    await mkdir(paths.charactersDirectory, { recursive: true })
    await writeFile(
      join(paths.charactersDirectory, character.referenceImageFile),
      imageBytes,
    )
  }
  return {
    ...baseContext(),
    paths,
    options: {
      styleId: 'normal',
      imageProvider: 'fal',
      characters: [character],
      characterFrequency: 'always',
    },
    visualBible: Promise.resolve('ERA: contemporary. A quiet modern city.'),
  }
}
// Esta suite aísla identidad, no juzga calidad semántica: un revisor separado
// aprueba explícitamente cada candidato y mantiene el transporte del redactor
// disponible para contar sus reintentos reales de personaje/tez.
const identityReviewFixture = {
  async generate(request) {
    const { candidates } = JSON.parse(request.userPrompt)
    return JSON.stringify({
      scenes: candidates.map((candidate) => ({
        sceneId: candidate.sceneId,
        checks: { focus: true, events: true, setting: true, causality: true },
        aligned: true,
        sourceEvidenceId: candidate.sourceEvidence[0]?.id ?? null,
        promptEvidenceId: candidate.promptEvidence[0].id,
        reason: 'Explicit approval fixture for identity regression only.',
      })),
    })
  },
}
function writerOptions(context, overrides = {}) {
  return {
    llm: createCatalogSceneLlm(context),
    reviewLlm: identityReviewFixture,
    style: VISUAL_STYLES.normal,
    fullScript: fragment,
    visualBible: 'ERA: contemporary. A quiet modern city.',
    characters: [LUIS],
    imageTextLanguage: 'Spanish',
    signal: context.signal,
    ...overrides,
  }
}

test('complexion clause: a bare color never counts as skin', () => {
  for (const description of [
    'black jacket and white shirt',
    'short dark hair, brown eyes',
    'a black-haired woman in a red coat',
    'hombre de pelo moreno y barba negra',
    'camisa blanca, skinny jeans',
    'a snakeskin belt, skin-tight suit',
    'big afro, round glasses',
  ])
    assert.equal(extractComplexionClause(description), '', description)
})

test('complexion clause: returned verbatim in EN, ES and PT', () => {
  const cases = [
    [LUIS.description, 'dark-skinned man in his 30s'],
    ['mujer morena de pelo largo', 'mujer morena de pelo largo'],
    ['Homem negro, cabelo curto', 'Homem negro'],
    ['a young black man with a beard', 'a young black man'],
    ['tez trigueña, ojos cafés', 'tez trigueña'],
    ['es muy moreno, alto', 'es muy moreno'],
    ['Afro-Colombian fisherman, straw hat', 'Afro-Colombian fisherman'],
    ['"warm brown skin" and short hair', 'warm brown skin'],
  ]
  for (const [description, clause] of cases)
    assert.equal(extractComplexionClause(description), clause)
})

test('prompt mentions complexion only when it talks about the skin', () => {
  assert.equal(promptMentionsComplexion(promptWithSkin, 'x'), true)
  assert.equal(promptMentionsComplexion(promptWithoutSkin, 'x'), false)
})

test('lock goes after the first sentence, before the realism anchor, once', () => {
  const locked = lockCharacterComplexion(
    promptWithoutSkin,
    [LUIS],
    [0],
    VISUAL_STYLES.normal,
  )
  const lockAt = locked.indexOf('Identity lock — Luis: dark-skinned man')
  assert.ok(lockAt > 0)
  assert.ok(lockAt < locked.indexOf('Quiet city street'))
  assert.ok(locked.endsWith(REALISM_ANCHOR))
  assert.ok(!locked.includes('"'), 'quoted words would be drawn as text')
  assert.equal(
    lockCharacterComplexion(locked, [LUIS], [0], VISUAL_STYLES.normal),
    locked,
    'idempotent',
  )
})

test('a long first sentence preserves the identity through review and image finalization', () => {
  const longPrompt =
    'Wide shot of Luis, a man watching green auroras through a space station window with ' +
    'delicate lighting and pristine surfaces '.repeat(58) +
    '. Clear green auroras beneath Earth.'
  const localScene = { ...scene, text: 'Luis observa auroras verdes.' }
  for (const style of [VISUAL_STYLES.normal, VISUAL_STYLES.cartoon]) {
    const locked = lockCharacterComplexion(longPrompt, [LUIS], [0], style)
    const reviewed = finalizeSceneImagePrompt(
      localScene,
      [localScene],
      locked,
      style.id,
    )
    const sent = finalizeSceneImagePrompt(
      localScene,
      [localScene],
      lockCharacterComplexion(reviewed, [LUIS], [0], style, {
        requirePersonMention: true,
      }),
      style.id,
    )
    assert.match(reviewed, /Identity lock — Luis: dark-skinned man/)
    assert.match(reviewed, /green auroras/)
    assert.ok(reviewed.length <= MAX_PROMPT_CHARS)
    assert.equal(sent, reviewed, `${style.id}: send exactly the reviewed text`)
    assert.equal((sent.match(/Identity lock/g) ?? []).length, 1)
  }
})

test('lock is a no-op when nothing was dropped or nobody is in frame', () => {
  const normal = VISUAL_STYLES.normal
  assert.equal(
    lockCharacterComplexion(promptWithSkin, [LUIS], [0], normal),
    promptWithSkin,
  )
  assert.equal(
    lockCharacterComplexion(promptWithoutSkin, [LUIS], [], normal),
    promptWithoutSkin,
  )
  assert.equal(
    lockCharacterComplexion(promptWithoutSkin, [PHOTO_ONLY], [0], normal),
    promptWithoutSkin,
  )
  const landscape = `Wide shot of an empty avenue at dawn, wet asphalt. ${REALISM_ANCHOR}`
  assert.equal(
    lockCharacterComplexion(landscape, [LUIS], [0], normal, {
      requirePersonMention: true,
    }),
    landscape,
  )
})

test('stickman and own styles never receive skin wording', () => {
  for (const style of [
    VISUAL_STYLES.pov_stickman,
    { ...VISUAL_STYLES.normal, id: 'custom' },
  ]) {
    assert.deepEqual(
      missingComplexion(promptWithoutSkin, [LUIS], [0], style),
      [],
    )
    assert.equal(
      lockCharacterComplexion(promptWithoutSkin, [LUIS], [0], style),
      promptWithoutSkin,
    )
  }
  assert.ok(
    !buildMandatoryCharactersBlock([LUIS], [0], false, true).includes(
      'SKIN TONE IS MANDATORY',
    ),
  )
})

test("a fixed STYLE block that says 'skin' does not hide a dropped skin tone", () => {
  const cartoon = VISUAL_STYLES.cartoon
  assert.match(cartoon.template.styleSuffix, /skin/i)
  const prompt = `${cartoon.template.prologue} SCENE: Luis, a man with short curly black hair in a red hoodie, rides a bike. Empty avenue at dawn. ${cartoon.template.styleSuffix}`
  assert.equal(missingComplexion(prompt, [LUIS], [0], cartoon).length, 1)
  const locked = lockCharacterComplexion(prompt, [LUIS], [0], cartoon)
  assert.ok(locked.startsWith(cartoon.template.prologue))
  assert.ok(locked.endsWith(cartoon.template.styleSuffix))
  assert.ok(
    locked.indexOf('Identity lock') < locked.indexOf('Empty avenue at dawn'),
  )
})

test('character block: skin tone is reinforced like the hair', () => {
  const block = buildMandatoryCharactersBlock(
    [LUIS],
    [0],
    false,
    false,
    'Spanish',
    true,
  )
  assert.match(block, /SKIN TONE IS MANDATORY IN EVERY SCENE/)
  assert.match(block, /dark-skinned man in his 30s/)
})

test('photo character without description: the writer may not invent traits', () => {
  const block = buildMandatoryCharactersBlock(
    [PHOTO_ONLY],
    [0],
    false,
    false,
    'Spanish',
    true,
  )
  assert.match(block, /Ana \(the person from the attached reference image\)/)
  assert.match(block, /NEVER write any physical trait for Ana/)
  assert.ok(!block.includes('established design exactly'))

  const together = buildMandatoryCharactersBlock(
    [LUIS, PHOTO_ONLY],
    [0, 1],
    false,
    false,
    'Spanish',
    true,
  )
  assert.match(together, /EXCEPTION — Ana: their look comes from/)

  assert.match(
    buildCharacterBibleBlock('Ana', ''),
    /never invent or describe Ana's skin tone/,
  )
  assert.ok(
    !buildCharacterBibleBlock('Luis', LUIS.description).includes(
      'never invent',
    ),
  )
})

test('reference lane anchors the skin tone of the photo', () => {
  for (const line of [
    buildReferenceIdentityLine('Ana'),
    buildReferenceIdentityLineMulti(['Ana', 'Luis']),
  ]) {
    assert.match(line, /\(face, skin tone, hair, distinctive features\)/)
    assert.match(line, /never lighter or darker/)
  }
})

test('realistic writer prompt tells the writer who the main subject is', () => {
  assert.match(VISUAL_STYLES.normal.systemPrompt, /RECURRING CHARACTER/)
  assert.match(VISUAL_STYLES.normal.systemPrompt, /SKIN TONE first/)
})

test('writer: a dropped skin tone is retried with a correction, then locked by code', async (t) => {
  const context = baseContext()
  const userPrompts = []
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const request = JSON.parse(init.body)
    userPrompts.push(request.messages.at(-1).content)
    return stream(JSON.stringify({ prompt_imagen: promptWithoutSkin }))
  })
  const [written] = await guaranteePrompts([scene], writerOptions(context))

  assert.equal(userPrompts.length, 3)
  assert.ok(!userPrompts[0].includes('DROPPED A CANONICAL SKIN TONE'))
  assert.match(
    userPrompts[1],
    /DROPPED A CANONICAL SKIN TONE[^\n]*Luis: dark-skinned man in his 30s/,
  )
  assert.match(written.imagePrompt, /Identity lock — Luis: dark-skinned man/)
  assert.ok(
    bodyWithoutFinalClauses(written.imagePrompt).endsWith(REALISM_ANCHOR),
  )
})

test('writer: a prompt that keeps the skin tone is accepted untouched', async (t) => {
  const context = baseContext()
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => {
    calls++
    return stream(JSON.stringify({ prompt_imagen: promptWithSkin }))
  })
  const [written] = await guaranteePrompts([scene], writerOptions(context))
  assert.equal(calls, 1)
  assert.equal(bodyWithoutFinalClauses(written.imagePrompt), promptWithSkin)
})

test('images: a stored prompt from before the fix is locked on its way out', async (t) => {
  const context = await fixture(
    t,
    [{ ...scene, imagePrompt: promptWithoutSkin }],
    { ...LUIS, mode: 'text' },
  )
  const sent = []
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (String(url).startsWith('https://fal.run/')) {
      sent.push(JSON.parse(init.body).prompt)
      return Response.json({
        images: [{ url: 'https://fixture.invalid/image.png' }],
      })
    }
    return new Response(imageBytes, {
      headers: { 'content-type': 'image/png' },
    })
  })
  await imagesStage.run(context)
  assert.equal(sent.length, 1)
  assert.match(sent[0], /Identity lock — Luis: dark-skinned man/)
})

test('images: a scene that loses its reference is announced, never silent', async (t) => {
  const context = await fixture(
    t,
    [{ ...scene, imagePrompt: promptWithSkin }],
    {
      name: 'Luis',
      description: LUIS.description,
      mode: 'photo',
      referenceImageFile: 'reference_1.png',
    },
  )
  const calls = { edit: 0, plain: 0 }
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const target = String(url)
    if (target.includes('gpt-image-2/edit')) {
      calls.edit++
      assert.match(JSON.parse(init.body).prompt, /skin tone/)
      return new Response('', { status: 500 })
    }
    if (target.startsWith('https://fal.run/')) {
      calls.plain++
      return Response.json({
        images: [{ url: 'https://fixture.invalid/image.png' }],
      })
    }
    return new Response(imageBytes, {
      headers: { 'content-type': 'image/png' },
    })
  })
  await imagesStage.run(context)
  assert.ok(calls.edit >= 1)
  assert.equal(calls.plain, 1)
  const warning = context.events.find(
    (event) =>
      event.type === 'log' &&
      event.level === 'warn' &&
      event.message.includes('character reference lost'),
  )
  assert.ok(warning, 'the rescue must leave a warning in the project log')
  assert.match(warning.message, /provider or upload failure \[1\]/)
})

// ─── Escenas SIN personaje (frecuencia parcial) ───

const unmarkedScene = { ...scene, charactersPresent: [] }
const strangerPrompt = `Close-up of a young man with dark hair, looking hopeful, in a small kitchen at dawn. Soft morning light from the window. ${REALISM_ANCHOR}`
const emptyPrompt = `Close-up of a steaming coffee pot on a small stove at dawn, no people anywhere in the frame. Soft morning light from the window. ${REALISM_ANCHOR}`

test('a person is detected, a defensive no-people phrase is not', () => {
  const normal = VISUAL_STYLES.normal
  assert.equal(promptDepictsPerson(strangerPrompt, normal, [LUIS]), true)
  assert.equal(promptDepictsPerson(emptyPrompt, normal, [LUIS]), false)
  assert.equal(
    promptDepictsPerson(
      `Wide shot of the bike Luis left by the door. ${REALISM_ANCHOR}`,
      normal,
      [LUIS],
    ),
    true,
    "the character's name counts as a person",
  )
  for (const subject of [
    'a lone figure seen from behind on a hill',
    'a bicycle repairman at his bench',
    'the silhouette of someone against the sunset',
    // El nombre de la narración no es el del personaje del proyecto.
    "Mateo's face by the window. Mateo has dark hair and is wearing a white t-shirt",
  ])
    assert.equal(
      promptDepictsPerson(
        `Wide shot of ${subject}. ${REALISM_ANCHOR}`,
        normal,
        [LUIS],
      ),
      true,
      subject,
    )
  assert.equal(
    promptDepictsPerson(
      `Wide shot of an empty workshop, no figures, no silhouettes, without any people. ${REALISM_ANCHOR}`,
      normal,
      [LUIS],
    ),
    false,
  )
  assert.equal(
    promptDepictsPerson(strangerPrompt, VISUAL_STYLES.pov_stickman, [LUIS]),
    false,
  )
})

test('writer: a scene without the character that draws a stranger is retried empty', async (t) => {
  const context = baseContext()
  const userPrompts = []
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const request = JSON.parse(init.body)
    userPrompts.push(request.messages.at(-1).content)
    const prompt = userPrompts.length === 1 ? strangerPrompt : emptyPrompt
    return stream(JSON.stringify({ prompt_imagen: prompt }))
  })
  const [written] = await guaranteePrompts(
    [unmarkedScene],
    writerOptions(context, { promoteUnmarkedProtagonist: true }),
  )
  assert.equal(userPrompts.length, 2)
  assert.match(
    userPrompts[1],
    /DREW AN UNIDENTIFIED PERSON IN A SCENE WITHOUT THE CHARACTER/,
  )
  // Sellada contra gente de fondo, tras la primera frase y antes del ancla.
  assert.match(
    written.imagePrompt,
    /in the frame\. No people anywhere in the frame — not in the background/,
  )
  assert.ok(
    bodyWithoutFinalClauses(written.imagePrompt).endsWith(REALISM_ANCHOR),
  )
  assert.deepEqual(written.charactersPresent, [])
})

test('writer: if the writer insists, the scene is promoted to the protagonist', async (t) => {
  const context = baseContext()
  const userPrompts = []
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const user = JSON.parse(init.body).messages.at(-1).content
    userPrompts.push(user)
    const prompt = user.includes('MANDATORY CHARACTER')
      ? promptWithSkin
      : strangerPrompt
    return stream(JSON.stringify({ prompt_imagen: prompt }))
  })
  const [written] = await guaranteePrompts(
    [unmarkedScene],
    writerOptions(context, { promoteUnmarkedProtagonist: true }),
  )
  assert.equal(
    userPrompts.length,
    4,
    '3 attempts without + 1 with the character',
  )
  assert.deepEqual(written.charactersPresent, [0])
  assert.equal(bodyWithoutFinalClauses(written.imagePrompt), promptWithSkin)
})

test('writer: from the editor the unmarked scene is never promoted', async (t) => {
  const context = baseContext()
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => {
    calls++
    return stream(JSON.stringify({ prompt_imagen: strangerPrompt }))
  })
  const [written] = await guaranteePrompts(
    [unmarkedScene],
    writerOptions(context),
  )
  assert.equal(calls, 3)
  assert.deepEqual(written.charactersPresent, [])
})

// ─── Escenas CON personaje: tiene que estar de verdad («always» = todas) ───

const genericPrompt = `Wide shot of a cyclist pedaling down an empty avenue at dawn. Wet asphalt, warm low sunlight. ${REALISM_ANCHOR}`

test('a marked scene must feature its character, by name or canonical wording', () => {
  const normal = VISUAL_STYLES.normal
  assert.deepEqual(
    missingCharacterMention(genericPrompt, [LUIS], [0], normal),
    [0],
  )
  assert.deepEqual(
    missingCharacterMention(promptWithSkin, [LUIS], [0], normal),
    [],
  )
  // El redactor tradujo el rótulo, pero citó la descripción canónica.
  const messenger = { name: 'el mensajero', description: LUIS.description }
  assert.deepEqual(
    missingCharacterMention(
      `Medium shot of the messenger, short curly black hair, riding. ${REALISM_ANCHOR}`,
      [messenger],
      [0],
      normal,
    ),
    [],
  )
  assert.deepEqual(
    missingCharacterMention(
      genericPrompt,
      [LUIS],
      [0],
      VISUAL_STYLES.pov_stickman,
    ),
    [],
    'stickman names the doll, not the person',
  )
})

test('presence lock writes the character in, with identity or the photo anchor', () => {
  const normal = VISUAL_STYLES.normal
  const locked = lockCharacterPresence(genericPrompt, [LUIS], [0], normal)
  assert.match(
    locked,
    /at dawn\. The main subject of this shot is Luis, short curly black hair, dark-skinned man/,
  )
  assert.ok(locked.endsWith(REALISM_ANCHOR))
  assert.equal(lockCharacterPresence(locked, [LUIS], [0], normal), locked)
  assert.match(
    lockCharacterPresence(genericPrompt, [PHOTO_ONLY], [0], normal),
    /is Ana \(the person from the attached reference image\)/,
  )
})

test('writer: a marked scene written without the character is retried, then repaired', async (t) => {
  const context = baseContext()
  const userPrompts = []
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    userPrompts.push(JSON.parse(init.body).messages.at(-1).content)
    return stream(JSON.stringify({ prompt_imagen: genericPrompt }))
  })
  const [written] = await guaranteePrompts([scene], writerOptions(context))
  assert.equal(userPrompts.length, 3)
  assert.match(userPrompts[1], /LEFT OUT THE MANDATORY CHARACTER[^\n]*Luis/)
  assert.match(written.imagePrompt, /The main subject of this shot is Luis/)
  assert.ok(
    !written.imagePrompt.includes('Identity lock'),
    'the canonical identity already carries the skin tone',
  )
})

// ─── Sin el personaje, pero con la gente que la narración describe ───

const crowdPrompt = `Wide shot of an anonymous crowd of fishermen on the pier, looking at the lit lighthouse, all in dark oilskins. Cold blue dusk light. ${REALISM_ANCHOR}`

test('narration-described people are legitimate; an unlabelled person is a stand-in', () => {
  const normal = VISUAL_STYLES.normal
  assert.equal(promptDepictsStandIn(crowdPrompt, normal, [LUIS]), false)
  assert.equal(promptDepictsStandIn(strangerPrompt, normal, [LUIS]), true)
  assert.equal(promptDepictsStandIn(emptyPrompt, normal, [LUIS]), false)
  // El rótulo vale solo para la persona que tiene cerca.
  assert.equal(
    promptDepictsStandIn(
      `High-angle shot of a lone figure at the edge of an old street, looking down with a nostalgic expression. A few distant figures of anonymous people walk in the background. ${REALISM_ANCHOR}`,
      normal,
      [LUIS],
    ),
    true,
  )
  assert.equal(
    promptDepictsStandIn(
      `Wide shot of a street market. A lively crowd of anonymous people fills the street. ${REALISM_ANCHOR}`,
      normal,
      [LUIS],
    ),
    false,
  )
  assert.equal(
    promptDepictsStandIn(
      `Wide shot of an anonymous crowd around Luis on the pier. ${REALISM_ANCHOR}`,
      normal,
      [LUIS],
    ),
    true,
    'the character himself never belongs in an unmarked scene',
  )
})

test('writer: an unmarked scene keeps the people its narration describes', async (t) => {
  const context = baseContext()
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => {
    calls++
    return stream(JSON.stringify({ prompt_imagen: crowdPrompt }))
  })
  const [written] = await guaranteePrompts(
    [unmarkedScene],
    writerOptions(context, { promoteUnmarkedProtagonist: true }),
  )
  assert.equal(calls, 1, 'no retry, no promotion')
  assert.equal(
    bodyWithoutFinalClauses(written.imagePrompt),
    crowdPrompt,
    'and no no-people seal',
  )
  assert.deepEqual(written.charactersPresent, [])
})
