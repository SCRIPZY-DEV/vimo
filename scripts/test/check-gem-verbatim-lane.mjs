// El carril verbatim con gemas por secciones (ADR-0048, spec §5.2): el marco
// arma el system en los cuatro modos, la sección `character` es el
// protagonista del modo genérico sin Fase 1 y no viaja en «Mi personaje» ni
// en cinemático, y la recuperación por política de contenido y el editor usan
// el mismo marco. Una gema vieja sale byte a byte igual que antes: las huellas
// de abajo se tomaron con el código previo a este cambio. Proveedores HTTP
// simulados (el redactor, el juez de correspondencia de ADR-0043 y fal) y
// proyectos temporales.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import { regenerateSceneImages } from '../../pipeline/commands/videos/regenerate-scene-images.ts'
import {
  resolveProjectPaths,
  sceneImageFile,
} from '../../pipeline/project/paths.ts'
import { readScenes, writeScenes } from '../../pipeline/project/scenes-file.ts'
import { buildCreateVideoContext } from '../../pipeline/stages/context.ts'
import { imagesStage } from '../../pipeline/stages/images/images.ts'
import {
  CONTENT_POLICY_RETRY_NOTE,
  runVerbatimLane,
} from '../../pipeline/stages/scene-prompts/verbatim/verbatim-lane.ts'
import { protagonistFromSection } from '../../pipeline/stages/scene-prompts/verbatim/subject-weaver.ts'
import {
  buildTemplateSystem,
  composeGemText,
} from '../../pipeline/prompts/template-frame.ts'
import {
  buildAssistantCharacterTurn,
  CHARACTER_DESIGN_INSTRUCTION,
  USER_PROTAGONIST_RULE,
} from '../../pipeline/prompts/verbatim-messages.ts'
import { PROTAGONIST_DESIGN_REQUEST } from '../../pipeline/prompts/protagonist-request.ts'
import { DESCRIPTION_HEADER } from '../../pipeline/prompts/verbatim-identity.ts'

const legacyGem =
  'Render every scene as a hand-drawn watercolor illustration with indigo washes and rough paper. Keep the story action and setting.'
const script =
  'Mila repairs a red antenna outside the station. The greenhouse glows at night. She smiles at the stars.'
const sceneTexts = [
  'Mila repairs the red antenna.',
  'The greenhouse glows at night.',
  'She smiles at the stars.',
]
const sheet =
  'A curious red-haired girl, slender build, freckles across the nose, round green glasses. Outfit: a green hoodie, blue jeans and white sneakers.'
const tail = 'Style: hand-drawn watercolor illustration, indigo washes.'
const bytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFOsAAAAASUVORK5CYII=',
  'base64',
)
const library = {
  name: 'Elena',
  description:
    'a young astronaut with brown hair, green eyes, a blue jacket and silver boots',
}
const sectionCharacter =
  'A stickman doll with a round white head, two black dot eyes and thin black line limbs. Outfit: white gloves and white rounded shoes.'
const sections = {
  visualStyle:
    'Simple stickman drawings with clean black lines on a colorful, softly shaded background.',
  character: sectionCharacter,
  dynamism:
    'Show the protagonist in about half of the scenes; in the rest, a metaphor, a key object or the place.',
  camera: 'Alternate wide shots and close-ups.',
  rules: 'Never draw readable text.',
}
const fixedStart = 'Hand-drawn stickman storyboard frame:'
const fixedEnd = 'Clean black ink lines on a flat pastel background.'
const fallbackDescription =
  'A tall lighthouse keeper with a grey beard, a knitted blue cap, a yellow raincoat and black rubber boots, carrying a brass lantern.'

function stream(content, finishReason = 'stop') {
  return new Response(
    'data: ' +
      JSON.stringify({
        choices: [{ delta: { content }, finish_reason: finishReason }],
      }) +
      '\n\ndata: [DONE]\n\n',
    { headers: { 'content-type': 'text/event-stream' } },
  )
}
function lastUserMessage(request) {
  return request.messages.at(-1).content
}
function fragmentsOf(request) {
  return [...lastUserMessage(request).matchAll(/^(\d+)\. /gm)].map((match) =>
    Number(match[1]),
  )
}
function isPhaseOne(request) {
  return lastUserMessage(request).includes(CHARACTER_DESIGN_INSTRUCTION)
}
function isFallbackRequest(request) {
  return lastUserMessage(request).includes(PROTAGONIST_DESIGN_REQUEST)
}
const scenePrompt = (id) =>
  id === 2
    ? `((${id})) Wide shot of an orbital greenhouse glowing at night, silver panels. ${tail}`
    : `((${id})) [subject] (wearing: a white space suit) repairs a red antenna beside an orbital greenhouse, warm light. ${tail}`

// El juez de correspondencia temporal (ADR-0043) revisa cada lote antes de
// persistirlo: se le contesta con una aprobación, como narrativeReviewResponse
// en check-verbatim-prompt-persistence, y queda FUERA de la conversación del
// redactor, que es lo que miden las huellas y las aserciones.
function isNarrativeReview(request) {
  return request.messages[0].content.startsWith(
    'You audit the FULL narrative meaning',
  )
}
function narrativeApproval(request) {
  const { candidates } = JSON.parse(lastUserMessage(request))
  return Response.json({
    choices: [
      {
        message: {
          content: JSON.stringify({
            scenes: candidates.map((candidate) => ({
              sceneId: candidate.sceneId,
              checks: {
                focus: true,
                events: true,
                setting: true,
                causality: true,
              },
              aligned: true,
              sourceEvidenceId: candidate.sourceEvidence[0]?.id ?? null,
              promptEvidenceId: candidate.promptEvidence[0].id,
              reason: 'Explicit approval fixture.',
            })),
          }),
        },
      },
    ],
  })
}
function reviewedPrompts(reviews) {
  return new Map(
    reviews.flatMap((review) =>
      JSON.parse(lastUserMessage(review)).candidates.map((candidate) => [
        candidate.sceneId,
        candidate.prompt,
      ]),
    ),
  )
}

// El LLM de siempre: Fase 1 → la ficha (o lo que devuelva `phaseOne`); el
// pedido de último recurso → una descripción; Fase 2 → un prompt por
// fragmento.
function llm(t, { onImage, phaseOne } = {}) {
  const requests = []
  const reviews = []
  const images = []
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const target = String(url)
    if (target.includes('chat/completions')) {
      const request = JSON.parse(init.body)
      if (isNarrativeReview(request)) {
        reviews.push(request)
        return narrativeApproval(request)
      }
      requests.push(request)
      if (isPhaseOne(request))
        return phaseOne?.() ?? stream('```text\n' + sheet + '\n```')
      if (isFallbackRequest(request))
        return stream(JSON.stringify({ description: fallbackDescription }))
      return stream(fragmentsOf(request).map(scenePrompt).join('\n\n'))
    }
    if (target.startsWith('https://fal.run/')) {
      const body = JSON.parse(init.body)
      images.push(body)
      const rejected = onImage?.(body, images.length)
      if (rejected) return rejected
      return Response.json({
        images: [{ url: 'https://fixture.invalid/image.png' }],
      })
    }
    assert.equal(target, 'https://fixture.invalid/image.png')
    return new Response(bytes, { headers: { 'content-type': 'image/png' } })
  })
  return { requests, reviews, images }
}

async function fixture(
  t,
  customStyle,
  { characters, photo = false, prompts } = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-gem-lane-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const paths = resolveProjectPaths(join(root, 'fixture'), 'fixture')
  await mkdir(paths.scenesDirectory, { recursive: true })
  await mkdir(paths.charactersDirectory, { recursive: true })
  if (photo)
    await writeFile(join(paths.charactersDirectory, 'reference.png'), bytes)
  await writeFile(
    paths.metadataFile,
    JSON.stringify({
      id: 'fixture',
      name: 'Fixture',
      options: {
        styleId: 'normal',
        imageProvider: 'fal',
        imageQuality: 'low',
        videoFormat: '16:9',
        ...(characters ? { characters } : {}),
        customStyle,
      },
      state: 'draft',
      completedStages: [],
      createdAt: '2026-09-30T00:00:00.000Z',
      updatedAt: '2026-09-30T00:00:00.000Z',
    }),
  )
  await writeFile(paths.scriptFile, script)
  await writeScenes(
    paths,
    sceneTexts.map((text, index) => ({
      id: index + 1,
      text,
      startSeconds: index * 4,
      endSeconds: (index + 1) * 4,
      ...(prompts ? { imagePrompt: prompts[index] } : {}),
    })),
  )
  const events = []
  const base = {
    job: {
      jobId: 'fixture',
      projectsRoot: root,
      apiKeys: { deepinfra: 'fixture', fal: 'fixture' },
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
  return { paths, base, events }
}

async function runLane(t, customStyle, extra, llmOptions) {
  const { paths, base, events } = await fixture(t, customStyle, extra)
  const { requests, reviews } = llm(t, llmOptions)
  const context = await buildCreateVideoContext(base, 'fixture')
  const lane = await runVerbatimLane(context, await readScenes(paths), script)
  await writeScenes(paths, lane.scenes)
  return { requests, reviews, lane, paths, events }
}
async function storedMetadata(paths) {
  return JSON.parse(await readFile(paths.metadataFile, 'utf8'))
}
function template(mode, extra = {}) {
  return {
    styleId: 'st-template',
    name: 'Stickman',
    sections,
    templateVersion: 1,
    character: { mode },
    ...extra,
  }
}
function everyMessage(requests) {
  return requests.flatMap((request) =>
    request.messages.map((message) => message.content),
  )
}

// ── La gema vieja, byte a byte ──

const LEGACY_MODES = {
  generic: { style: { mode: 'generic' } },
  text: {
    style: { mode: 'own' },
    characters: [{ ...library, mode: 'text' }],
  },
  reference: {
    style: { mode: 'own' },
    photo: true,
    characters: [
      { ...library, mode: 'photo', referenceImageFile: 'reference.png' },
    ],
  },
  none: { style: { mode: 'none' } },
}
// Huellas de la conversación del redactor (system, guion, retrato y lote) y
// de los prompts finales, tomadas con el código anterior al marco. Son las de
// dev (c007e008, igual en el árbol previo a esta tarea): el PR #91 suma la
// correspondencia temporal al turno del lote y sanea los prompts finales
// antes del juez (ADR-0043), así que no son las de e50be2a1 del plan.
const LEGACY_FINGERPRINTS = {
  generic: '77fe810ab8f656fa850015506435befe372bda0ef2c109a9039991a553faa512',
  text: '790b11fbda43d4b41729770faa1ff3e8ebe246bbf7aecfbee4e861f061e20965',
  reference: '0c139fd3d4289defb5e49ed01a97429230399fb6eafb74afafa1322d593cdb79',
  none: '36de39384f4e0def5abaee93b6b5efc34ecacca5ba08a7f654205492a492b7a0',
}
function fingerprint(requests, lane) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        messages: requests.map((request) => request.messages),
        scenes: lane.scenes.map((scene) => ({
          id: scene.id,
          imagePrompt: scene.imagePrompt,
          charactersPresent: scene.charactersPresent,
        })),
      }),
    )
    .digest('hex')
}

for (const [mode, setup] of Object.entries(LEGACY_MODES)) {
  test(
    'an old gem in mode ' + mode + ' is byte-identical to before',
    async (t) => {
      const { requests, lane } = await runLane(
        t,
        {
          styleId: 'st-legacy',
          name: 'Watercolor',
          systemPrompt: legacyGem,
          character: setup.style,
        },
        setup,
      )
      assert.ok(
        requests[0].messages[0].content.startsWith(legacyGem),
        'gema intacta',
      )
      assert.equal(
        fingerprint(requests, lane),
        LEGACY_FINGERPRINTS[mode],
        'la conversación o los prompts finales de una gema vieja cambiaron',
      )
    },
  )
}

// ── Genérico con sección `character` ──

test('the character section is the portrait, and its Outfit sentence is the base outfit', () => {
  assert.deepEqual(protagonistFromSection(sectionCharacter), {
    portrait: sectionCharacter,
    description: sectionCharacter,
    outfit: 'white gloves and white rounded shoes',
    source: 'style-section',
  })
  // Sin la oración «Outfit:» no hay ropa base que separar: viaja entera.
  const withoutOutfit = 'A stickman doll with a round white head and dot eyes.'
  assert.deepEqual(protagonistFromSection('  ' + withoutOutfit + '  '), {
    portrait: withoutOutfit,
    description: withoutOutfit,
    source: 'style-section',
  })
})

test('generic with a character section: no phase 1, the section is the portrait and the woven identity', async (t) => {
  const { requests, reviews, lane, paths, events } = await runLane(
    t,
    template('generic'),
    {
      characters: [{ ...library, mode: 'text' }],
    },
  )

  assert.equal(requests.filter(isPhaseOne).length, 0, 'sin Fase 1')
  const [system, scriptTurn, portraitTurn] = requests[0].messages
  assert.equal(system.content, buildTemplateSystem(sections, 'generic'))
  assert.equal(scriptTurn.role, 'user')
  assert.equal(portraitTurn.role, 'assistant')
  assert.equal(
    portraitTurn.content,
    buildAssistantCharacterTurn(sectionCharacter),
  )
  // La sección viaja SOLO como turno del retrato: nunca en un system, ni en
  // el guion, ni en el lote.
  for (const request of requests)
    for (const message of request.messages)
      if (message.role !== 'assistant')
        assert.ok(!message.content.includes('stickman doll'))

  const stored = (await storedMetadata(paths)).styleProtagonist
  assert.equal(stored.source, 'style-section')
  assert.equal(stored.portrait, sectionCharacter)
  assert.equal(stored.outfit, 'white gloves and white rounded shoes')

  const woven = lane.scenes[0].imagePrompt
  assert.match(woven, /white space suit/, 'la ropa de la escena')
  assert.ok(woven.includes(DESCRIPTION_HEADER + ' A stickman doll'))
  assert.match(woven, /Their usual look, for reference: white gloves/)
  assert.doesNotMatch(
    woven,
    /blue jacket/,
    'el personaje del proyecto no viaja',
  )
  assert.ok(
    events.some((event) =>
      event.message?.includes('character section of the style'),
    ),
  )
  // La revisión de correspondencia (PR #91) sigue en el camino del marco: el
  // juez recibe exactamente los prompts finales, con la identidad tejida.
  assert.deepEqual(
    reviewedPrompts(reviews),
    new Map(lane.scenes.map((scene) => [scene.id, scene.imagePrompt])),
  )
})

test('without a declared mode or project characters, the section is the protagonist too', async (t) => {
  const { requests, paths } = await runLane(t, {
    styleId: 'st-template',
    name: 'Stickman',
    sections,
    templateVersion: 1,
  })
  assert.equal(requests.filter(isPhaseOne).length, 0)
  assert.equal(
    requests[0].messages[0].content,
    buildTemplateSystem(sections, 'generic'),
  )
  assert.equal(
    requests[0].messages[2].content,
    buildAssistantCharacterTurn(sectionCharacter),
  )
  assert.equal(
    (await storedMetadata(paths)).styleProtagonist.source,
    'style-section',
  )
})

test('a resume reuses the stored section protagonist and still skips phase 1', async (t) => {
  const { paths, base } = await fixture(t, template('generic'))
  llm(t)
  const first = await buildCreateVideoContext(base, 'fixture')
  const lane = await runVerbatimLane(first, await readScenes(paths), script)
  await writeScenes(
    paths,
    lane.scenes.map((scene) =>
      scene.id === 3 ? { ...scene, imagePrompt: undefined } : scene,
    ),
  )
  t.mock.restoreAll()

  const { requests } = llm(t)
  const again = await buildCreateVideoContext(base, 'fixture')
  await runVerbatimLane(again, await readScenes(paths), script)
  assert.equal(requests.filter(isPhaseOne).length, 0)
  assert.deepEqual(fragmentsOf(requests[0]), [3])
  assert.equal(
    requests[0].messages[2].content,
    buildAssistantCharacterTurn(sectionCharacter),
  )
})

// ── Genérico sin sección: la Fase 1 con la gema como texto ──

test('generic without a character section designs the protagonist from the gem text', async (t) => {
  const withoutCharacter = { ...sections, character: undefined }
  const { requests } = await runLane(
    t,
    template('generic', { sections: withoutCharacter }),
  )
  const phaseOne = requests.filter(isPhaseOne)
  assert.equal(phaseOne.length, 1)
  assert.equal(
    phaseOne[0].messages[0].content,
    composeGemText(withoutCharacter, { fixedPhrases: false }),
  )
  const batch = requests.find((request) => !isPhaseOne(request))
  assert.equal(
    batch.messages[0].content,
    buildTemplateSystem(withoutCharacter, 'generic'),
  )
})

// Las frases fijas las pega el código (spec §5.4): la ficha de la Fase 1 no
// es un prompt de escena y no las lleva, o se tejerían con la identidad.
const withPhrases = {
  ...sections,
  character: undefined,
  promptStart: fixedStart,
  promptEnd: fixedEnd,
}

test('phase 1 takes the gem as text without its fixed phrases, and no turn carries them', async (t) => {
  const gemText = composeGemText(withPhrases, { fixedPhrases: false })
  assert.notEqual(gemText, composeGemText(withPhrases))

  const { requests } = await runLane(
    t,
    template('generic', { sections: withPhrases }),
  )
  const phaseOne = requests.filter(isPhaseOne)
  assert.equal(phaseOne.length, 1)
  assert.equal(phaseOne[0].messages[0].content, gemText)
  const batch = requests.find((request) => !isPhaseOne(request))
  assert.equal(
    batch.messages[0].content,
    buildTemplateSystem(withPhrases, 'generic'),
  )
  for (const content of everyMessage(requests)) {
    assert.ok(!content.includes(fixedStart))
    assert.ok(!content.includes(fixedEnd))
  }
})

test('when phase 1 leaves nothing, the last-resort request takes the same gem text', async (t) => {
  const { requests, paths } = await runLane(
    t,
    template('generic', { sections: withPhrases }),
    undefined,
    // Un corte por tokens no se reintenta: la Fase 1 cae sin esperas.
    { phaseOne: () => stream('```text\nA tall lighthouse', 'length') },
  )
  const fallback = requests.filter(isFallbackRequest)
  assert.equal(fallback.length, 1)
  assert.equal(
    fallback[0].messages[0].content,
    composeGemText(withPhrases, { fixedPhrases: false }),
  )
  assert.equal(
    (await storedMetadata(paths)).styleProtagonist.source,
    'fallback-request',
  )
})

// ── «Mi personaje» y cinemático: la sección no viaja ──

for (const [name, extra, mode] of [
  [
    'own with a text character',
    { characters: [{ ...library, mode: 'text' }] },
    'text',
  ],
  [
    'own with a photo',
    {
      photo: true,
      characters: [
        { ...library, mode: 'photo', referenceImageFile: 'reference.png' },
      ],
    },
    'reference',
  ],
]) {
  test(
    name + ': the frame carries the user protagonist and never the section',
    async (t) => {
      const { requests, lane } = await runLane(t, template('own'), extra)
      assert.equal(requests.filter(isPhaseOne).length, 0)
      const system = requests[0].messages[0].content
      assert.equal(system, buildTemplateSystem(sections, mode))
      assert.ok(system.includes(USER_PROTAGONIST_RULE))
      for (const content of everyMessage(requests))
        assert.ok(!content.includes('stickman doll'), 'la sección no viaja')
      assert.doesNotMatch(lane.scenes[0].imagePrompt, /stickman doll/)
    },
  )
}

test('own without characters falls back to phase 1 without the section', async (t) => {
  const { requests } = await runLane(t, template('own'))
  const phaseOne = requests.filter(isPhaseOne)
  assert.equal(phaseOne.length, 1)
  assert.equal(
    phaseOne[0].messages[0].content,
    composeGemText(sections, { fixedPhrases: false }),
  )
  for (const content of everyMessage(requests))
    assert.ok(!content.includes('stickman doll'), 'la sección no viaja')
})

test('none: the cinematic frame, no phase 1, no portrait and never the section', async (t) => {
  const { requests, lane } = await runLane(t, template('none'))
  assert.equal(requests.length, 1)
  assert.equal(
    requests[0].messages[0].content,
    buildTemplateSystem(sections, 'none'),
  )
  assert.ok(
    !requests[0].messages.some((message) => message.role === 'assistant'),
  )
  for (const content of everyMessage(requests))
    assert.ok(!content.includes('stickman doll'))
  for (const scene of lane.scenes) {
    assert.doesNotMatch(scene.imagePrompt, /\[subject\]/)
    assert.ok(!scene.imagePrompt.includes(DESCRIPTION_HEADER))
  }
})

// ── E34 y el editor, con el mismo marco ──

test('a content-policy rewrite goes through the same frame, with the retry note', async (t) => {
  const stored = sceneTexts.map(
    (_, index) =>
      `Scene number ${index + 1}, a stickman doll outdoors. ${tail}`,
  )
  const { paths, base } = await fixture(t, template('none'), {
    prompts: stored,
  })
  const { requests, images } = llm(t, {
    onImage: (body) =>
      body.prompt.startsWith('Scene number 1,')
        ? Response.json(
            { type: 'content_policy_violation', detail: 'flagged' },
            { status: 400 },
          )
        : undefined,
  })
  const context = await buildCreateVideoContext(base, 'fixture')
  await imagesStage.run(context)

  assert.equal(requests.length, 1, 'solo la escena rechazada se reescribe')
  assert.equal(
    requests[0].messages[0].content,
    buildTemplateSystem(sections, 'none'),
  )
  assert.deepEqual(fragmentsOf(requests[0]), [1])
  assert.ok(lastUserMessage(requests[0]).includes(CONTENT_POLICY_RETRY_NOTE))
  assert.equal(images.length, 4, 'tres a la primera y la reescrita')
  assert.match((await readScenes(paths))[0].imagePrompt, /orbital greenhouse/)
})

test('the editor rewrite goes through the same frame and reuses the section protagonist', async (t) => {
  const { paths, base } = await fixture(t, template('generic'))
  llm(t)
  const context = await buildCreateVideoContext(base, 'fixture')
  const lane = await runVerbatimLane(context, await readScenes(paths), script)
  await writeScenes(paths, lane.scenes)
  for (const id of [1, 2, 3]) await writeFile(sceneImageFile(paths, id), bytes)
  t.mock.restoreAll()

  const { requests } = llm(t)
  await regenerateSceneImages({
    ...base,
    job: {
      ...base.job,
      payload: {
        projectId: 'fixture',
        scenes: [{ id: 1, rewritePrompt: true }],
      },
    },
  })
  assert.equal(requests.filter(isPhaseOne).length, 0)
  assert.equal(requests.length, 1)
  assert.equal(
    requests[0].messages[0].content,
    buildTemplateSystem(sections, 'generic'),
  )
  assert.equal(
    requests[0].messages[2].content,
    buildAssistantCharacterTurn(sectionCharacter),
  )
})
