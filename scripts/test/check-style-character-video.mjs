// El personaje ESCRITO DENTRO del estilo tiene que salir, y ser el mismo, en
// todo el video: creación, reanudación, reescritura por política de contenido
// y «Regenerar imagen». Proveedores HTTP simulados, proyectos temporales.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import {
  resolveProjectPaths,
  sceneImageFile,
} from '../../pipeline/project/paths.ts'
import { readScenes, writeScenes } from '../../pipeline/project/scenes-file.ts'
import { buildCreateVideoContext } from '../../pipeline/stages/context.ts'
import { imagesStage } from '../../pipeline/stages/images/images.ts'
import {
  buildCustomStyleReferencePrompt,
  buildCustomStyleReferencePromptMulti,
} from '../../pipeline/prompts/character-reference.ts'
import { regenerateSceneImages } from '../../pipeline/commands/videos/regenerate-scene-images.ts'
import {
  runVerbatimLane,
  CONTENT_POLICY_RETRY_NOTE,
} from '../../pipeline/stages/scene-prompts/verbatim/verbatim-lane.ts'
import {
  recoverProtagonistFromScenes,
  MAX_WOVEN_IDENTITY_CHARS,
  capWovenIdentity,
  fallbackUserDescription,
  rescueReferencePrompt,
} from '../../pipeline/stages/scene-prompts/verbatim/subject-weaver.ts'
import {
  buildCharacterDesignMessage,
  CHARACTER_DESIGN_INSTRUCTION,
  gemWithCharacterPhase,
  PLATFORM_CHARACTER_PHASE,
  PLATFORM_CHARACTER_PHASE_STYLE_PRECEDENCE,
  STYLE_CHARACTER_PRECEDENCE_RULE,
  USER_PROTAGONIST_RULE,
} from '../../pipeline/prompts/verbatim-messages.ts'
import { PROTAGONIST_DESIGN_REQUEST } from '../../pipeline/prompts/protagonist-request.ts'
import { DESCRIPTION_HEADER } from '../../pipeline/prompts/verbatim-identity.ts'
import { MAX_PROMPT_CHARS } from '../../pipeline/prompts/prompt-limits.ts'
import {
  bodyWithoutFinalClauses,
  sanitizeFinalPrompt,
} from '../../pipeline/stages/shared/prompt-safety.ts'

// Una gema que trae a su personaje ESCRITO, sin fase de diseño de personaje.
const gem =
  'Render every scene as a hand-drawn watercolor illustration with indigo washes and rough paper. ' +
  'The recurring character is Mila, a red-haired girl with freckles, round green glasses and a green hoodie. ' +
  'Keep the story action and setting.'
const tail =
  'Style: hand-drawn watercolor illustration, indigo washes on rough paper.'
const sheet =
  'A curious red-haired girl, slender build, long wavy red hair tied with a yellow ribbon, freckles across the nose, round green glasses, wearing a green hoodie, blue jeans and white sneakers.'
const withSubject =
  '[subject] repairs a red antenna beside an orbital greenhouse, silver tools reflect a warm light.'
const script =
  'Mila repairs a red antenna outside the station. The greenhouse glows at night. She smiles at the stars.'
const bytes = Buffer.from(
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
function lastUserMessage(request) {
  return request.messages.at(-1).content
}
function isPhaseOne(request) {
  return lastUserMessage(request).includes(CHARACTER_DESIGN_INSTRUCTION)
}
function isFallbackRequest(request) {
  return lastUserMessage(request).includes(PROTAGONIST_DESIGN_REQUEST)
}
function fragmentsOf(request) {
  return [...lastUserMessage(request).matchAll(/^(\d+)\. /gm)].map((match) =>
    Number(match[1]),
  )
}
function scenesResponse(request) {
  return stream(
    fragmentsOf(request)
      .map((id) => '((' + id + ')) ' + withSubject + ' ' + tail)
      .join('\n\n'),
  )
}
function sheetResponse() {
  return stream('```text\n' + sheet + '\n```\n\nAquí tienes el prompt.')
}
// El LLM de siempre: Fase 1 → la ficha; Fase 2 → un prompt por fragmento.
function defaultLlm(request) {
  return isPhaseOne(request) ? sheetResponse() : scenesResponse(request)
}
function identityOf(prompt) {
  const body = bodyWithoutFinalClauses(prompt)
  const index = body.lastIndexOf(DESCRIPTION_HEADER)
  return index < 0
    ? undefined
    : body.slice(index + DESCRIPTION_HEADER.length).trim()
}

async function fixture(
  t,
  {
    mode = 'generic',
    characters,
    prompts = false,
    photo = false,
    images = true,
  } = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-style-character-'))
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
      imageProvider: 'fal',
      imageQuality: 'low',
      videoFormat: '16:9',
      ...(characters ? { characters } : {}),
      customStyle: {
        id: 'fixture',
        name: 'Watercolor',
        systemPrompt: gem,
        character: { mode },
      },
    },
    state: 'draft',
    completedStages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  await writeFile(paths.metadataFile, JSON.stringify(metadata))
  await writeFile(paths.scriptFile, script)
  const texts = [
    'Mila repairs the red antenna.',
    'The greenhouse glows at night.',
    'She smiles at the stars.',
  ]
  await writeScenes(
    paths,
    texts.map((text, index) => ({
      id: index + 1,
      text,
      startSeconds: index * 4,
      endSeconds: (index + 1) * 4,
      ...(characters ? { charactersPresent: [0] } : {}),
      ...(prompts ? { imagePrompt: prompts[index] } : {}),
    })),
  )
  if (images)
    for (const id of [1, 2, 3])
      await writeFile(sceneImageFile(paths, id), bytes)
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
function providers(t, llm) {
  const requests = { text: [], image: [] }
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (String(url).includes('chat/completions')) {
      const request = JSON.parse(init.body)
      requests.text.push(request)
      return llm(request, requests.text.length)
    }
    if (String(url).startsWith('https://fal.run/')) {
      requests.image.push({ url: String(url), ...JSON.parse(init.body) })
      return Response.json({
        images: [{ url: 'https://fixture.invalid/image.png' }],
      })
    }
    assert.equal(String(url), 'https://fixture.invalid/image.png')
    return new Response(bytes, { headers: { 'content-type': 'image/png' } })
  })
  return requests
}
async function storedMetadata(paths) {
  return JSON.parse(await readFile(paths.metadataFile, 'utf8'))
}
async function runLane(base, paths, options) {
  const context = await buildCreateVideoContext(base, 'fixture')
  const result = await runVerbatimLane(
    context,
    await readScenes(paths),
    script,
    options,
  )
  await writeScenes(paths, result.scenes)
  return result
}

// ── La consigna ──

test('phase 1 asks for the style character first and keeps the ported instruction byte-identical', () => {
  assert.equal(
    CHARACTER_DESIGN_INSTRUCTION,
    'Diseña ahora el protagonista de este guion: la lectura mas obvia y directa, interpretacion literal y clasica. ' +
      'Si tu estilo define una fase de diseño de personaje, ejecutala tal como la define. ' +
      'Si tu estilo NO define ninguna, devuelve igual la FICHA del protagonista tal como se veria en tu estilo. ' +
      'En los dos casos devuelve el prompt COMPLETO del personaje, en INGLES, dentro de un bloque de codigo, empezando por su rol — ' +
      'con el material segun tu estilo, proporciones, pelo, rasgos fisicos y la ropa con colores concretos. ' +
      "La ficha describe SOLO al personaje: sin escena, sin lugar, sin momento del dia, sin accion y sin encabezados como 'Prompt:'.",
  )
  assert.ok(
    buildCharacterDesignMessage(script).endsWith(
      STYLE_CHARACTER_PRECEDENCE_RULE + '\n\n' + CHARACTER_DESIGN_INSTRUCTION,
    ),
  )
})

test('the platform character phase retry also keeps the style character', () => {
  assert.ok(
    gemWithCharacterPhase(gem).endsWith(
      PLATFORM_CHARACTER_PHASE + PLATFORM_CHARACTER_PHASE_STYLE_PRECEDENCE,
    ),
  )
  assert.ok(gemWithCharacterPhase(gem).startsWith(gem), 'gema intacta')
})

// ── Creación, reanudación, política de contenido, editor ──

test('the protagonist is stored before the first batch and woven identical in every scene', async (t) => {
  const { base, paths } = await fixture(t)
  let storedBeforeFirstBatch
  const requests = providers(t, async (request) => {
    if (isPhaseOne(request)) return sheetResponse()
    storedBeforeFirstBatch ??= (await storedMetadata(paths)).styleProtagonist
    return scenesResponse(request)
  })
  await runLane(base, paths)

  assert.ok(isPhaseOne(requests.text[0]), 'la Fase 1 va primero')
  assert.ok(
    lastUserMessage(requests.text[0]).includes(STYLE_CHARACTER_PRECEDENCE_RULE),
  )
  assert.equal(storedBeforeFirstBatch?.source, 'style-phase')
  assert.match(storedBeforeFirstBatch.description, /green hoodie/)

  const identities = (await readScenes(paths)).map((scene) =>
    identityOf(scene.imagePrompt),
  )
  assert.equal(new Set(identities).size, 1, 'una sola identidad')
  assert.equal(identities[0], storedBeforeFirstBatch.description)
})

test('a partial resume and a content-policy rewrite reuse the stored protagonist without phase 1', async (t) => {
  const { base, paths } = await fixture(t)
  providers(t, defaultLlm)
  await runLane(base, paths)
  const original = identityOf((await readScenes(paths))[0].imagePrompt)
  t.mock.restoreAll()

  // Reanudación parcial: a la escena 2 le falta el prompt.
  await writeScenes(
    paths,
    (await readScenes(paths)).map((scene) =>
      scene.id === 2 ? { ...scene, imagePrompt: undefined } : scene,
    ),
  )
  const resume = providers(t, (request) => {
    // Otra ficha, para probar que NO se usa aunque el modelo la ofrezca.
    if (isPhaseOne(request))
      return stream(
        '```text\nA tall bearded sailor in a yellow raincoat and black boots, grey beard, weathered skin.\n```',
      )
    return scenesResponse(request)
  })
  await runLane(base, paths)
  assert.equal(resume.text.filter(isPhaseOne).length, 0, 'sin Fase 1')
  assert.deepEqual(fragmentsOf(resume.text[0]), [2])
  assert.equal(identityOf((await readScenes(paths))[1].imagePrompt), original)
  t.mock.restoreAll()

  // Reescritura por política de contenido: mismo carril, con nota.
  await writeScenes(
    paths,
    (await readScenes(paths)).map((scene) =>
      scene.id === 3 ? { ...scene, imagePrompt: undefined } : scene,
    ),
  )
  const rewrite = providers(t, defaultLlm)
  await runLane(base, paths, {
    retryNotes: new Map([[3, CONTENT_POLICY_RETRY_NOTE]]),
  })
  assert.equal(rewrite.text.filter(isPhaseOne).length, 0, 'sin Fase 1')
  assert.equal(identityOf((await readScenes(paths))[2].imagePrompt), original)
})

test('editor regenerate with a rewritten prompt keeps the same protagonist', async (t) => {
  const { base, paths } = await fixture(t)
  providers(t, defaultLlm)
  await runLane(base, paths)
  const original = identityOf((await readScenes(paths))[0].imagePrompt)
  t.mock.restoreAll()

  const requests = providers(t, defaultLlm)
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
  assert.equal(requests.text.filter(isPhaseOne).length, 0, 'sin Fase 1')
  assert.equal(requests.image.length, 1)
  assert.equal(identityOf((await readScenes(paths))[0].imagePrompt), original)
  assert.match(requests.image[0].prompt, /green hoodie/)
})

// ── La precedencia que NO cambia ──

test('a library character still wins over the style character', async (t) => {
  const { base, paths } = await fixture(t, {
    mode: 'own',
    characters: [
      {
        name: 'Elena',
        description:
          'a young astronaut with brown hair, green eyes, a blue jacket and silver boots',
        mode: 'text',
      },
    ],
  })
  const requests = providers(t, defaultLlm)
  await runLane(base, paths)

  assert.equal(requests.text.filter(isPhaseOne).length, 0, 'sin Fase 1')
  assert.ok(
    requests.text[0].messages[0].content.includes(USER_PROTAGONIST_RULE),
  )
  assert.equal((await storedMetadata(paths)).styleProtagonist, undefined)
  const prompt = (await readScenes(paths))[0].imagePrompt
  assert.match(prompt, /blue jacket/)
  assert.doesNotMatch(prompt, /green hoodie/)
})

test('a style without protagonist stays without protagonist', async (t) => {
  const { base, paths } = await fixture(t, { mode: 'none' })
  const requests = providers(t, defaultLlm)
  await runLane(base, paths)

  assert.equal(requests.text.filter(isPhaseOne).length, 0)
  assert.equal((await storedMetadata(paths)).styleProtagonist, undefined)
  assert.equal(identityOf((await readScenes(paths))[0].imagePrompt), undefined)
})

// ── El último recurso ──

test('when phase 1 leaves nothing, the fallback request still gives the video an identity', async (t) => {
  const { base, paths } = await fixture(t)
  const description =
    'Mila, a red-haired girl with long wavy red hair, freckles, round green glasses, wearing a green hoodie, blue jeans and white sneakers.'
  const requests = providers(t, (request) => {
    if (isPhaseOne(request))
      return stream('Aquí tienes el prompt de tu personaje.')
    if (isFallbackRequest(request))
      return stream(JSON.stringify({ description }))
    return scenesResponse(request)
  })
  await runLane(base, paths)

  assert.equal(requests.text.filter(isFallbackRequest).length, 1)
  assert.ok(requests.text.find(isFallbackRequest).messages[0].content === gem)
  assert.equal(
    (await storedMetadata(paths)).styleProtagonist.source,
    'fallback-request',
  )
  assert.match(
    identityOf((await readScenes(paths))[0].imagePrompt),
    /green hoodie/,
  )
})

// ── Proyectos anteriores al campo ──

test('an older project recovers the protagonist from its sanitized scene prompts', async (t) => {
  const woven = (identity) =>
    sanitizeFinalPrompt(
      'The girl repairs a red antenna. ' +
        tail +
        ' ' +
        DESCRIPTION_HEADER +
        ' ' +
        identity,
    )
  const truncated = woven(sheet).replace(
    'blue jeans and white sneakers.',
    'blue je',
  )
  const { base, paths } = await fixture(t, {
    prompts: [woven(sheet), truncated, undefined],
  })
  assert.equal(
    recoverProtagonistFromScenes(await readScenes(paths)),
    sheet,
    'el candidato truncado no gana',
  )

  const requests = providers(t, defaultLlm)
  await runLane(base, paths)
  assert.equal(requests.text.filter(isPhaseOne).length, 0, 'sin Fase 1')
  assert.deepEqual(fragmentsOf(requests.text[0]), [3])
  assert.equal(
    (await storedMetadata(paths)).styleProtagonist.source,
    'recovered',
  )
  assert.equal(identityOf((await readScenes(paths))[2].imagePrompt), sheet)
})

// ── El recorte ──

test('a long style tail no longer deletes the identity', () => {
  const longTail =
    'Style: ' +
    Array.from(
      { length: 30 },
      (_, index) =>
        `layered indigo watercolor wash number ${index} on rough cold paper`,
    ).join(', ') +
    '.'
  const scene = Array.from(
    { length: 12 },
    (_, index) =>
      `The girl tightens bolt ${index} on the red antenna under a warm light.`,
  ).join(' ')
  assert.ok(longTail.length > 1500)
  const final = sanitizeFinalPrompt(
    `${scene} ${longTail} ${DESCRIPTION_HEADER} ${sheet}`,
  )

  assert.ok(final.length <= MAX_PROMPT_CHARS)
  assert.equal(identityOf(final), sheet, 'identidad entera')
  assert.ok(final.includes('Style: layered indigo'), 'la cola de estilo sigue')
  assert.ok(final.includes('The girl tightens bolt 0'), 'la escena sigue')
  assert.ok(final.includes('the narration is spoken, not written'))
})

test('a prompt without woven identity is trimmed exactly as before', () => {
  const body = 'A quiet harbor at dawn. '.repeat(200).trim()
  const final = sanitizeFinalPrompt(body)
  assert.ok(final.length <= MAX_PROMPT_CHARS)
  assert.ok(final.startsWith(body.slice(0, 2000)))
})

test('the woven identity is capped once, at a sentence boundary', () => {
  const long = Array.from(
    { length: 20 },
    (_, index) => `She wears charm number ${index} on a thin silver chain.`,
  ).join(' ')
  const capped = capWovenIdentity(long)
  assert.ok(capped.length <= MAX_WOVEN_IDENTITY_CHARS)
  assert.match(capped, /\.$/)
  assert.ok(long.startsWith(capped))
  assert.equal(capWovenIdentity(sheet), sheet)
})

// ── El personaje de biblioteca en estilos propios ──

const libraryCharacter = {
  name: 'Elena',
  description:
    'a young astronaut with brown hair, green eyes, a blue jacket and silver boots',
}

test('a scene that loses its reference image is rescued with the library description, and the stored prompt keeps the anchor', async (t) => {
  const anchored =
    'Wide shot of Elena (the person from the attached reference image) fixing the red antenna. ' +
    tail
  const { base, paths, events } = await fixture(t, {
    mode: 'own',
    photo: true,
    images: false,
    characters: [
      {
        ...libraryCharacter,
        mode: 'photo',
        referenceImageFile: 'reference.png',
      },
    ],
    prompts: [anchored, anchored, anchored],
  })
  const requests = { edit: [], normal: [] }
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const target = String(url)
    if (target.endsWith('/edit')) {
      requests.edit.push(JSON.parse(init.body))
      // Rechazo terminal del carril de referencia: la escena cae al normal.
      return Response.json(
        { type: 'content_policy_violation', detail: 'flagged' },
        { status: 400 },
      )
    }
    if (target.startsWith('https://fal.run/')) {
      requests.normal.push(JSON.parse(init.body))
      return Response.json({
        images: [{ url: 'https://fixture.invalid/image.png' }],
      })
    }
    return new Response(bytes, { headers: { 'content-type': 'image/png' } })
  })

  const context = await buildCreateVideoContext(base, 'fixture')
  await imagesStage.run(context)

  assert.equal(requests.edit.length, 3, 'primero con la foto')
  assert.equal(requests.normal.length, 3, 'rescatadas por el carril normal')
  for (const request of requests.normal) {
    assert.match(request.prompt, /blue jacket/, 'la identidad viaja en texto')
    assert.match(request.prompt, /must look exactly like this: Elena:/)
    assert.doesNotMatch(request.prompt, /attached reference image/)
    assert.match(request.prompt, /the narration is spoken, not written/)
  }
  // El guardado es el saneado de siempre (con sus cláusulas), sin la
  // descripción tejida y con el ancla intacta: la próxima pasada vuelve a
  // intentar con la foto.
  for (const scene of await readScenes(paths)) {
    assert.ok(scene.imagePrompt.startsWith(anchored), 'el ancla sigue')
    assert.doesNotMatch(scene.imagePrompt, /blue jacket/)
  }
  assert.ok(
    events.some(
      (event) =>
        event.level === 'warn' &&
        event.message.includes('character reference lost'),
    ),
  )
})

test('a library description that the trims empty still weaves an identity', async (t) => {
  const description =
    'Portrait of Elena, full-body, a tall woman with silver hair and a red scarf. Style: watercolor.'
  const { base, paths, events } = await fixture(t, {
    mode: 'own',
    characters: [{ name: 'Elena', description, mode: 'text' }],
  })
  providers(t, defaultLlm)
  await runLane(base, paths)

  const identity = identityOf((await readScenes(paths))[0].imagePrompt)
  assert.match(identity, /silver hair and a red scarf/)
  assert.doesNotMatch(identity, /full-body|Style:/)
  assert.ok(
    events.some((event) =>
      event.message?.includes('lightly cleaned user description'),
    ),
  )
})

test('the fallback description keeps the identity and drops what freezes the pose', () => {
  assert.equal(
    fallbackUserDescription(
      '**Elena** — a tall woman with silver hair, standing in a neutral pose on a white background.',
    ),
    'Elena — a tall woman with silver hair.',
  )
  assert.equal(fallbackUserDescription('Style: watercolor only'), '')
  assert.equal(fallbackUserDescription('a.'), '')
})

test('the rescue prompt drops the anchor and appends the description before the final clauses', () => {
  const rescued = rescueReferencePrompt(
    'Wide shot of Elena (the person from the attached reference image) fixing an antenna. Style: watercolor. Do NOT print the narration onto the image and do NOT add any caption',
    [libraryCharacter],
  )
  assert.equal(
    rescued,
    'Wide shot of Elena fixing an antenna. Style: watercolor. ' +
      DESCRIPTION_HEADER +
      ' Elena: ' +
      libraryCharacter.description +
      '.',
  )
  assert.equal(
    rescueReferencePrompt(
      'Wide shot of Elena (the person from the attached reference image).',
      [{ name: 'Elena', description: 'x' }],
    ),
    'Wide shot of Elena.',
  )
})

test('the custom style reference lock anchors skin tone and accessories, for one and for two names', () => {
  const single = buildCustomStyleReferencePrompt('Elena', 'Wide shot.')
  assert.match(
    single,
    /same face, same skin tone, same hair, same distinctive accessories, same outfit, in EVERY shot/,
  )
  assert.match(single, /Apply the scene's art style only to the surroundings/)
  assert.equal(
    buildCustomStyleReferencePromptMulti(['Elena'], 'Wide shot.'),
    single,
  )

  const both = buildCustomStyleReferencePromptMulti(
    ['Elena', 'Bruno'],
    'Wide shot.',
  )
  assert.match(both, /attached image 1 is "Elena"; attached image 2 is "Bruno"/)
  assert.match(
    both,
    /Elena and Bruno must each look exactly like the person in their OWN attached reference image: same face, same skin tone/,
  )
  assert.match(both, /never to Elena and Bruno/)
})

test('two library characters in Create with a custom style: only the first travels, with a warning', async (t) => {
  const { base, paths, events } = await fixture(t, {
    mode: 'own',
    characters: [
      { ...libraryCharacter, mode: 'text' },
      {
        name: 'Bruno',
        description: 'an old sailor with a grey beard and a yellow raincoat',
        mode: 'text',
      },
    ],
  })
  providers(t, defaultLlm)
  await runLane(base, paths)

  const prompt = (await readScenes(paths))[0].imagePrompt
  assert.match(prompt, /blue jacket/)
  assert.doesNotMatch(prompt, /yellow raincoat/)
  assert.ok(
    events.some(
      (event) =>
        event.level === 'warn' &&
        event.message.includes('carries one protagonist: only "Elena" travels'),
    ),
  )
})
