// Inicio y final fijos de una gema de plantilla (spec §5.4): después de tejer
// `[subject]`, el código arma inicio + escena + final; con final fijo no corre
// la cola de estilo restaurada; el recorte final cede primero el núcleo de la
// escena, después el final fijo y la identidad al último, y nunca corta el
// inicio. Las frases viajan tal cual aunque estén en otro idioma. También el
// fallback de imágenes las lleva.
//
// Sobre dev (PR #91, ADR-0043) el carril sanea cada prompt y se lo pasa al
// juez de correspondencia antes de guardarlo: los casos de punta a punta le
// contestan al juez con una aprobación y miran que revise exactamente el
// prompt que se guarda, ya con las frases y recortado con ellas.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import { resolveProjectPaths } from '../../pipeline/project/paths.ts'
import { readScenes, writeScenes } from '../../pipeline/project/scenes-file.ts'
import { PipelineFailure } from '../../pipeline/runner/failure.ts'
import { buildCreateVideoContext } from '../../pipeline/stages/context.ts'
import { imagesStage } from '../../pipeline/stages/images/images.ts'
import { scenePromptsStage } from '../../pipeline/stages/scene-prompts/scene-prompts.ts'
import {
  applyFixedPhrases,
  stripFixedPhrases,
} from '../../pipeline/prompts/template-frame.ts'
import { DESCRIPTION_HEADER } from '../../pipeline/prompts/verbatim-identity.ts'
import { MAX_PROMPT_CHARS } from '../../pipeline/prompts/prompt-limits.ts'
import { ANONYMITY_CLAUSE } from '../../pipeline/prompts/scene-prompt-blocks.ts'
import { applySafetyReplacements } from '../../pipeline/utils/content-safety.ts'
import {
  bodyWithoutFinalClauses,
  FINAL_PROMPT_BODY_BUDGET,
  sanitizeFinalPrompt,
} from '../../pipeline/stages/shared/prompt-safety.ts'
import { protagonistFromSection } from '../../pipeline/stages/scene-prompts/verbatim/subject-weaver.ts'
import {
  generateVerbatimPrompts,
  readBatchPrompts,
} from '../../pipeline/stages/scene-prompts/verbatim/verbatim-writer.ts'

const promptStart = 'A simple stickman doll drawing with a round white head:'
const promptEnd =
  'Clean black lines, colorful softly shaded background, no text.'
const phrases = { promptStart, promptEnd }
const sections = {
  visualStyle: 'Simple stickman drawings on colorful backgrounds.',
  ...phrases,
}
const fragments = [1, 2, 3, 4, 5].map((n) => ({ n, text: 'Fragment ' + n }))
const sharedTail =
  'Style: simple stickman drawing, colorful background with soft shading everywhere.'

function fakeClient(answer) {
  const requests = []
  return {
    requests,
    async call(request) {
      requests.push(request)
      const ids = [
        ...request.messages.at(-1).content.matchAll(/^(\d+)\. /gm),
      ].map((match) => Number(match[1]))
      return {
        content: ids.map((id) => `((${id})) ${answer(id)}`).join('\n\n'),
        inputTokens: 1,
        outputTokens: 1,
      }
    },
  }
}
function write(answer, extra = {}) {
  return generateVerbatimPrompts(fragments, 'A short story.', {
    gem: 'unused',
    sections,
    client: fakeClient(answer),
    character: { mode: 'none' },
    ...extra,
  })
}

// ── Pegar y quitar ──

test('the phrases wrap the woven scene, and a copy the model wrote is dropped', () => {
  assert.equal(
    applyFixedPhrases('  The girl runs. ', phrases),
    promptStart + ' The girl runs. ' + promptEnd,
  )
  assert.equal(applyFixedPhrases('The girl runs.', {}), 'The girl runs.')
  assert.equal(
    applyFixedPhrases('The girl runs.', { promptEnd }),
    'The girl runs. ' + promptEnd,
  )
  assert.equal(
    stripFixedPhrases(
      promptStart.toUpperCase() + ' The girl runs. ' + promptEnd.slice(0, -1),
      phrases,
    ),
    'The girl runs.',
  )
  assert.equal(stripFixedPhrases('The girl runs.', phrases), 'The girl runs.')
  assert.equal(
    stripFixedPhrases(promptEnd, phrases),
    promptEnd,
    'nada que salvar',
  )
})

test('every final prompt is start + woven scene + end, with no duplicated phrase', async () => {
  const result = await write((id) =>
    id === 1
      ? `${promptStart} A park with a red kite over the trees. ${promptEnd}`
      : `A park with a red kite over the trees, moment ${id}.`,
  )
  for (const [id, prompt] of result.prompts) {
    assert.ok(prompt.startsWith(promptStart + ' '), String(id))
    assert.ok(prompt.endsWith(' ' + promptEnd), String(id))
    assert.equal(prompt.split(promptStart).length, 2, 'un solo inicio')
    assert.equal(prompt.split(promptEnd).length, 2, 'un solo final')
  }
})

test('with a fixed end the style tail is not restored; without it, it is', async () => {
  // Cuatro de cinco cierran con la misma cola: la restauración se la
  // devolvería a la quinta.
  const answer = (id) =>
    id === 5
      ? 'A quiet street at dusk with a lone lamp post and wet cobblestones.'
      : `A quiet street at dusk, lamp number ${id} glowing warmly. ${sharedTail}`
  const batch = fragments.map((fragment) => ({ ...fragment }))
  const raw = batch
    .map((fragment) => `((${fragment.n})) ${answer(fragment.n)}`)
    .join('\n\n')
  assert.equal(readBatchPrompts(raw, batch).styleRestored.length, 1)
  assert.deepEqual(
    readBatchPrompts(raw, batch, { restoreTail: false }).styleRestored,
    [],
  )

  const withEnd = await write(answer)
  assert.ok(!withEnd.prompts.get(5).includes(sharedTail))
  const onlyStart = await write(answer, {
    sections: { visualStyle: sections.visualStyle, promptStart },
  })
  assert.ok(onlyStart.prompts.get(5).includes(sharedTail))
})

test('the phrases and the character section travel as written, even in Spanish', async () => {
  const spanishEnd = 'Acuarela suelta sobre papel rugoso, sin texto.'
  const spanishCharacter =
    'Una nena pelirroja con pecas y anteojos verdes. Outfit: un buzo verde y zapatillas blancas.'
  const result = await write(() => '[subject] flies a red kite in a park.', {
    sections: {
      visualStyle: sections.visualStyle,
      character: spanishCharacter,
      promptEnd: spanishEnd,
    },
    character: {
      mode: 'generic',
      designed: protagonistFromSection(spanishCharacter),
    },
  })
  assert.deepEqual(result.missing, [])
  for (const prompt of result.prompts.values()) {
    assert.ok(prompt.endsWith(' ' + spanishEnd))
    assert.ok(prompt.includes(DESCRIPTION_HEADER + ' ' + spanishCharacter))
  }
})

// ── El recorte final ──

const identity =
  'A stickman doll with a round white head, two black dot eyes and thin black line limbs. Outfit: white gloves and white rounded shoes.'
function longScene(sentences) {
  return Array.from(
    { length: sentences },
    (_, index) =>
      `The doll climbs step number ${index} of a long spiral staircase under a warm light.`,
  ).join(' ')
}

test('a long prompt keeps the start whole and cuts the scene core first', () => {
  const prompt = `${promptStart} ${longScene(40)} ${DESCRIPTION_HEADER} ${identity} ${promptEnd}`
  assert.ok(prompt.length > MAX_PROMPT_CHARS)
  const final = sanitizeFinalPrompt(prompt, undefined, phrases)
  assert.ok(final.length <= MAX_PROMPT_CHARS)
  assert.ok(final.startsWith(promptStart + ' The doll climbs step number 0'))
  assert.ok(final.includes(DESCRIPTION_HEADER + ' ' + identity))
  assert.ok(final.includes(promptEnd), 'el final fijo sigue entero')
  assert.ok(!final.includes('step number 39'), 'cedió el núcleo de la escena')
  assert.ok(final.includes('the narration is spoken, not written'))
})

test('when even the floor does not fit, the fixed end yields before the identity', () => {
  const hugeStart = 'S'.repeat(599) + ':'
  const hugeEnd = 'E '.repeat(299) + 'end.'
  const hugeIdentity =
    DESCRIPTION_HEADER +
    ' ' +
    Array.from(
      { length: 20 },
      (_, index) => `Trait number ${index} of the doll stays fixed.`,
    ).join(' ')
  const prompt = `${hugeStart} ${longScene(20)} ${hugeIdentity} ${hugeEnd}`
  const final = sanitizeFinalPrompt(prompt, undefined, {
    promptStart: hugeStart,
    promptEnd: hugeEnd,
  })
  assert.ok(final.length <= MAX_PROMPT_CHARS)
  assert.ok(final.startsWith(hugeStart), 'el inicio no se corta')
  assert.ok(final.includes(hugeIdentity), 'la identidad entera')
  assert.ok(!final.includes('end.'), 'el final fijo cedió')
})

test('without phrases the cut is the one of always', () => {
  const prompt = `${promptStart} ${longScene(40)} ${DESCRIPTION_HEADER} ${identity} ${promptEnd}`
  assert.equal(
    sanitizeFinalPrompt(prompt, undefined, undefined),
    sanitizeFinalPrompt(prompt),
  )
  const plain = 'A quiet harbor at dawn. '.repeat(200).trim()
  assert.equal(
    sanitizeFinalPrompt(plain, undefined, phrases),
    sanitizeFinalPrompt(plain),
  )
})

// ── La fase de imágenes ──

const bytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFOsAAAAASUVORK5CYII=',
  'base64',
)
test('the image fallback and the final request carry both phrases', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'vimo-gem-phrases-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const paths = resolveProjectPaths(join(root, 'fixture'), 'fixture')
  await mkdir(paths.scenesDirectory, { recursive: true })
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
        customStyle: {
          styleId: 'st-template',
          name: 'Stickman',
          sections,
          templateVersion: 1,
          character: { mode: 'none' },
        },
      },
      state: 'draft',
      completedStages: [],
      createdAt: '2026-09-30T00:00:00.000Z',
      updatedAt: '2026-09-30T00:00:00.000Z',
    }),
  )
  await writeFile(paths.scriptFile, 'The doll flies a kite in the park.')
  // Sin prompt: la Capa 4 lo arma con el fallback determinístico.
  await writeScenes(paths, [
    {
      id: 1,
      text: 'The doll flies a kite in the park.',
      startSeconds: 0,
      endSeconds: 4,
    },
  ])
  const posts = []
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (String(url).startsWith('https://fal.run/')) {
      posts.push(JSON.parse(init.body).prompt)
      return Response.json({
        images: [{ url: 'https://fixture.invalid/image.png' }],
      })
    }
    return new Response(bytes, { headers: { 'content-type': 'image/png' } })
  })
  const context = await buildCreateVideoContext(
    {
      job: {
        jobId: 'fixture',
        projectsRoot: root,
        apiKeys: { fal: 'fixture' },
        binaryPaths: {},
      },
      config: resolvePipelineConfig(),
      signal: new AbortController().signal,
      emitter: { emit() {} },
    },
    'fixture',
  )
  await imagesStage.run(context)
  assert.equal(posts.length, 1)
  // El fallback trae su propia cláusula de texto: el final fijo va después
  // de todo el cuerpo y antes de la cláusula de anonimato.
  assert.ok(posts[0].startsWith(promptStart + ' Show the best single visual'))
  assert.ok(
    posts[0].indexOf(' ' + promptEnd) >
      posts[0].indexOf('Depict it faithfully'),
  )
})

// ── Caminos de dev (PR #91) y bordes que el plan no fija ──

test('a copy is only dropped when it ends where a word ends', () => {
  // «Pixel art of» no es una copia del arranque de «Pixel art often…», ni
  // «art.» del cierre de «…a dart.»: quitarlas partía una palabra.
  assert.equal(
    stripFixedPhrases('Pixel art often hides tiny details.', {
      promptStart: 'Pixel art of',
    }),
    'Pixel art often hides tiny details.',
  )
  assert.equal(
    stripFixedPhrases('A boy throws a dart.', { promptEnd: 'art.' }),
    'A boy throws a dart.',
  )
  // Una copia de verdad se quita igual, con o sin espacio después de una
  // frase que ya cierra con puntuación.
  assert.equal(
    stripFixedPhrases('Pixel art of a cat on a roof. Pop art.', {
      promptStart: 'Pixel art of',
      promptEnd: 'Pop art.',
    }),
    'a cat on a roof.',
  )
  assert.equal(
    stripFixedPhrases('Pixel art:a cat on a roof.', {
      promptStart: 'Pixel art:',
    }),
    'a cat on a roof.',
  )
})

test('an interrupted answer with a fixed end does not restore the style tail either', async () => {
  // El rescate del stream cortado (PR #91) lee el lote con la misma opción
  // que la respuesta entera: la cuarta, sin cola, no la recibe.
  const tailed = (id) =>
    `((${id})) A quiet street at dusk, lamp number ${id} glowing warmly. ${sharedTail}`
  const asked = []
  const client = {
    async call(request) {
      const ids = [
        ...request.messages.at(-1).content.matchAll(/^(\d+)\. /gm),
      ].map((match) => Number(match[1]))
      asked.push(ids)
      if (asked.length === 1) {
        request.onProgress?.(
          [1, 2, 3].map(tailed).join('\n\n') +
            '\n\n((4)) A quiet street at dusk with a lone lamp post and wet cobblestones.\n\n((5)) A qu',
        )
        throw new PipelineFailure('llm_timeout', 'the provider stopped')
      }
      return {
        content: ids.map(tailed).join('\n\n'),
        inputTokens: 1,
        outputTokens: 1,
      }
    },
  }
  const result = await generateVerbatimPrompts(fragments, 'A short story.', {
    gem: 'unused',
    sections,
    client,
    character: { mode: 'none' },
  })
  assert.deepEqual(asked, [[1, 2, 3, 4, 5], [5]])
  assert.ok(!result.prompts.get(4).includes(sharedTail))
  assert.ok(result.prompts.get(4).endsWith(' ' + promptEnd))
})

test('the reading by order also leaves the tail alone when told so', () => {
  // Sin ids (previews sin contexto temporal) la lectura va por orden.
  const answer = (id) =>
    id === 5
      ? 'A quiet street at dusk with a lone lamp post and wet cobblestones.'
      : `A quiet street at dusk, lamp number ${id} glowing warmly. ${sharedTail}`
  const raw = fragments.map((fragment) => answer(fragment.n)).join('\n\n')
  assert.equal(readBatchPrompts(raw, fragments).styleRestored.length, 1)
  assert.deepEqual(
    readBatchPrompts(raw, fragments, { restoreTail: false }).styleRestored,
    [],
  )
})

test('without a reviewer, each batch also hands start + woven scene + end to the disk', async () => {
  const handed = []
  await write((id) => `A park with a red kite over the trees, moment ${id}.`, {
    onBatchReady: async (batch) => {
      handed.push(...batch.prompts.values())
    },
  })
  assert.equal(handed.length, 5)
  for (const prompt of handed) {
    assert.ok(prompt.startsWith(promptStart + ' '))
    assert.ok(prompt.endsWith(' ' + promptEnd))
  }
})

// El juez de correspondencia temporal (ADR-0043) revisa cada lote antes de
// persistirlo: se le contesta una aprobación, como narrativeReviewResponse
// en check-verbatim-prompt-persistence, y se guarda lo que vio.
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
function isNarrativeReview(request) {
  return request.messages[0].content.startsWith(
    'You audit the FULL narrative meaning',
  )
}
function narrativeApproval(request) {
  const { candidates } = JSON.parse(request.messages.at(-1).content)
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
function judgedPrompts(reviews) {
  return new Map(
    reviews.flatMap((review) =>
      JSON.parse(review.messages.at(-1).content).candidates.map((candidate) => [
        candidate.sceneId,
        candidate.prompt,
      ]),
    ),
  )
}

const laneScenes = [
  'The doll flies a red kite over the park.',
  'The doll runs along the river path.',
  'The doll waves at the moon.',
]
async function project(t, customStyle, scenes) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-gem-phrases-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const paths = resolveProjectPaths(join(root, 'fixture'), 'fixture')
  await mkdir(paths.scenesDirectory, { recursive: true })
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
        customStyle,
      },
      state: 'draft',
      completedStages: [],
      createdAt: '2026-09-30T00:00:00.000Z',
      updatedAt: '2026-09-30T00:00:00.000Z',
    }),
  )
  await writeFile(paths.scriptFile, scenes.join(' '))
  await writeScenes(
    paths,
    scenes.map((text, index) => ({
      id: index + 1,
      text,
      startSeconds: index * 4,
      endSeconds: (index + 1) * 4,
    })),
  )
  const base = {
    job: {
      jobId: 'fixture',
      projectsRoot: root,
      apiKeys: { deepinfra: 'fixture', fal: 'fixture' },
      binaryPaths: {},
    },
    config: resolvePipelineConfig(),
    signal: new AbortController().signal,
    emitter: { emit() {} },
  }
  return { paths, base }
}
async function writeThroughTheLane(t, customStyle, answer) {
  const { paths, base } = await project(t, customStyle, laneScenes)
  const asked = []
  const reviews = []
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const request = JSON.parse(init.body)
    if (isNarrativeReview(request)) {
      reviews.push(request)
      return narrativeApproval(request)
    }
    const ids = [
      ...request.messages.at(-1).content.matchAll(/^(\d+)\. /gm),
    ].map((match) => Number(match[1]))
    asked.push(ids)
    return stream(ids.map((id) => `((${id})) ${answer(id)}`).join('\n\n'))
  })
  await scenePromptsStage.run(await buildCreateVideoContext(base, 'fixture'))
  return { scenes: await readScenes(paths), asked, reviews }
}
function templateGem(gemSections, mode) {
  return {
    styleId: 'st-template',
    name: 'Stickman',
    sections: gemSections,
    templateVersion: 1,
    character: { mode },
  }
}

test('through the lane, the judge reviews exactly the stored prompt: start + woven scene + end', async (t) => {
  const { scenes, asked, reviews } = await writeThroughTheLane(
    t,
    templateGem({ ...sections, character: identity }, 'generic'),
    (id) =>
      id === 1
        ? `${promptStart} [subject] flies a red kite over the park. ${promptEnd}`
        : `[subject] runs along the river path, moment ${id}.`,
  )
  assert.deepEqual(asked, [[1, 2, 3]], 'sin Fase 1 y sin re-pedidos')
  // Lo que el juez aprobó es, byte por byte, lo que quedó en disco.
  assert.deepEqual(
    judgedPrompts(reviews),
    new Map(scenes.map((scene) => [scene.id, scene.imagePrompt])),
  )
  for (const scene of scenes) {
    const body = bodyWithoutFinalClauses(scene.imagePrompt)
    assert.ok(body.startsWith(promptStart + ' '), String(scene.id))
    assert.ok(body.endsWith(' ' + promptEnd), String(scene.id))
    assert.equal(scene.imagePrompt.split(promptStart).length, 2)
    assert.equal(scene.imagePrompt.split(promptEnd).length, 2)
    // La identidad tejida va entre la escena y el final fijo.
    assert.ok(body.includes(DESCRIPTION_HEADER + ' ' + identity))
    assert.ok(
      scene.imagePrompt.indexOf(DESCRIPTION_HEADER) <
        scene.imagePrompt.indexOf(promptEnd),
    )
    assert.ok(
      scene.imagePrompt.includes('the narration is spoken, not written'),
    )
  }
})

test('through the lane, a long scene is cut before the judge with the phrases protected', async (t) => {
  const { scenes, reviews } = await writeThroughTheLane(
    t,
    templateGem(sections, 'none'),
    () => longScene(40),
  )
  assert.deepEqual(
    judgedPrompts(reviews),
    new Map(scenes.map((scene) => [scene.id, scene.imagePrompt])),
  )
  for (const scene of scenes) {
    const prompt = scene.imagePrompt
    assert.ok(prompt.length <= MAX_PROMPT_CHARS)
    assert.ok(prompt.startsWith(promptStart + ' The doll climbs step number 0'))
    assert.ok(
      bodyWithoutFinalClauses(prompt).endsWith(' ' + promptEnd),
      'el final fijo sigue entero',
    )
    assert.ok(
      !prompt.includes('step number 39'),
      'cedió el núcleo de la escena',
    )
    assert.ok(prompt.includes('the narration is spoken, not written'))
  }
})

async function fallbackPosts(t, gemSections, text) {
  const { base } = await project(t, templateGem(gemSections, 'none'), [text])
  const posts = []
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (String(url).startsWith('https://fal.run/')) {
      posts.push(JSON.parse(init.body).prompt)
      return Response.json({
        images: [{ url: 'https://fixture.invalid/image.png' }],
      })
    }
    return new Response(bytes, { headers: { 'content-type': 'image/png' } })
  })
  await imagesStage.run(await buildCreateVideoContext(base, 'fixture'))
  return posts
}

test('the image fallback never carries a fixed phrase twice', async (t) => {
  // Defensivo: el fallback no trae la gema como texto, pero si su borde
  // coincide con una frase fija, la frase va una sola vez.
  const coincident = 'Show the best single visual'
  const posts = await fallbackPosts(
    t,
    { visualStyle: sections.visualStyle, promptStart: coincident, promptEnd },
    'The doll flies a kite in the park.',
  )
  assert.equal(posts.length, 1)
  assert.ok(posts[0].startsWith(coincident + ' that explains'))
  assert.equal(posts[0].split(coincident).length, 2, 'un solo inicio')
  assert.equal(posts[0].split(promptEnd).length, 2, 'un solo final')
})

test('a long image fallback keeps both phrases whole and its own text clause', async (t) => {
  // Frases del largo máximo (600) y una narración larga: el fallback con las
  // frases no entra, y el recorte final de la fase cede la escena del
  // fallback, nunca el inicio ni el final fijo.
  const bigStart =
    Array.from(
      { length: 20 },
      (_, index) => `Hand-drawn stickman storyboard panel layer ${index}`,
    )
      .join(', ')
      .slice(0, 599) + ':'
  const bigEnd =
    Array.from(
      { length: 20 },
      (_, index) => `soft pastel wash number ${index} on rough paper`,
    )
      .join(', ')
      .slice(0, 590) + ', no text.'
  assert.equal(bigStart.length, 600)
  assert.equal(bigEnd.length, 600)
  const narration = Array.from(
    { length: 12 },
    (_, index) => `The doll climbs step ${index} of the spiral staircase.`,
  ).join(' ')
  const posts = await fallbackPosts(
    t,
    {
      visualStyle: sections.visualStyle,
      promptStart: bigStart,
      promptEnd: bigEnd,
    },
    narration,
  )
  assert.equal(posts.length, 1)
  const prompt = posts[0]
  assert.ok(prompt.length <= MAX_PROMPT_CHARS)
  assert.ok(prompt.startsWith(bigStart + ' Show the best single visual'))
  assert.ok(prompt.includes(' ' + bigEnd), 'el final fijo entero')
  assert.ok(prompt.indexOf(bigEnd) > prompt.indexOf('Depict it faithfully'))
  assert.ok(
    !prompt.includes('The ONLY exception is text'),
    'cedió la última oración del fallback',
  )
  assert.ok(prompt.includes('the narration is spoken, not written'))
})

// ── El saneado de las frases, el rescate sin foto y la cláusula de texto ──

test('a phrase with a flagged word or extra spaces keeps its protection', () => {
  // El saneado cambia los términos marcables y colapsa los espacios de todo
  // el prompt, también los de las frases: el recorte las busca saneadas.
  const bloodEnd = 'Clean black lines with blood-red accents, no text.'
  const spacedEnd =
    'Clean black  lines,\n\ncolorful softly shaded background, no text.'
  assert.notEqual(applySafetyReplacements(bloodEnd), bloodEnd)
  for (const end of [bloodEnd, spacedEnd]) {
    const final = sanitizeFinalPrompt(
      `${promptStart} ${longScene(40)} ${end}`,
      undefined,
      { promptStart, promptEnd: end },
    )
    assert.ok(final.length <= MAX_PROMPT_CHARS)
    assert.ok(final.startsWith(promptStart + ' The doll climbs step number 0'))
    assert.ok(
      bodyWithoutFinalClauses(final).endsWith(
        ' ' + applySafetyReplacements(end),
      ),
      'el final fijo, saneado y entero',
    )
    assert.ok(!final.includes('step number 39'), 'cedió el núcleo de la escena')
  }
})

const astronaut =
  'a young astronaut with short brown hair tied in a ponytail, green eyes, a few freckles across the nose, a blue padded jacket with a red mission patch on the left shoulder, grey cargo trousers with many pockets, silver boots with white laces, fingerless leather gloves, a dented silver helmet clipped to her belt and a small brass compass hanging on a thin cord around her neck'

// Un proyecto con «Mi personaje» y una sola escena que lo trae. La foto de
// referencia (si la hay) se rechaza siempre: la escena cae al rescate por el
// carril normal, cuyo cambio revisa el juez antes de comprar la imagen.
async function castProject(t, { gemSections, character, photo, scene }) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-gem-phrases-'))
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
        characters: [character],
        customStyle: templateGem(gemSections, 'own'),
      },
      state: 'draft',
      completedStages: [],
      createdAt: '2026-09-30T00:00:00.000Z',
      updatedAt: '2026-09-30T00:00:00.000Z',
    }),
  )
  await writeFile(paths.scriptFile, scene.text)
  await writeScenes(paths, [
    {
      id: 1,
      startSeconds: 0,
      endSeconds: 4,
      charactersPresent: [0],
      ...scene,
    },
  ])
  const requests = { edit: [], normal: [], reviews: [] }
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const target = String(url)
    if (target.endsWith('/edit')) {
      requests.edit.push(JSON.parse(init.body))
      return Response.json(
        { type: 'content_policy_violation', detail: 'flagged' },
        { status: 400 },
      )
    }
    if (target.startsWith('https://fal.run/')) {
      requests.normal.push(JSON.parse(init.body).prompt)
      return Response.json({
        images: [{ url: 'https://fixture.invalid/image.png' }],
      })
    }
    if (target.includes('chat/completions')) {
      const request = JSON.parse(init.body)
      assert.ok(isNarrativeReview(request), 'solo el juez habla con el LLM')
      requests.reviews.push(request)
      return narrativeApproval(request)
    }
    return new Response(bytes, { headers: { 'content-type': 'image/png' } })
  })
  await imagesStage.run(
    await buildCreateVideoContext(
      {
        job: {
          jobId: 'fixture',
          projectsRoot: root,
          apiKeys: { deepinfra: 'fixture', fal: 'fixture' },
          binaryPaths: {},
        },
        config: resolvePipelineConfig(),
        signal: new AbortController().signal,
        emitter: { emit() {} },
      },
      'fixture',
    ),
  )
  return { paths, requests }
}

const flaggedEnd = 'Clean black lines with blood-red accents.'
for (const [kind, end, sentences, overBudget] of [
  ['a plain end, over the budget', promptEnd, 24, true],
  ['an end with a flagged word, over the budget', flaggedEnd, 24, true],
  ['an end with a flagged word, within the budget', flaggedEnd, 4, false],
]) {
  test(
    'a scene that loses its reference photo keeps start + scene + identity + end (' +
      kind +
      ')',
    async (t) => {
      // Lo guardado es lo que dejó el carril: saneado, con las frases y la
      // referencia a la foto. El rescate le teje la identidad de biblioteca
      // (~400 caracteres): con escena larga, el cuerpo ya no entra.
      const anchored = [
        'Wide shot of Elena (the person from the attached reference image) at the foot of a long spiral staircase.',
        ...Array.from(
          { length: sentences },
          (_, index) =>
            `Elena climbs step number ${index} of the spiral staircase under a warm light.`,
        ),
      ].join(' ')
      const stored = sanitizeFinalPrompt(
        `${promptStart} ${anchored} ${end}`,
        undefined,
        { promptStart, promptEnd: end },
      )
      const lastSentence = `step number ${sentences - 1} `
      assert.ok(stored.includes(lastSentence), 'guardado entero')
      assert.equal(
        bodyWithoutFinalClauses(stored).length + astronaut.length >
          FINAL_PROMPT_BODY_BUDGET,
        overBudget,
      )
      const { paths, requests } = await castProject(t, {
        gemSections: {
          visualStyle: sections.visualStyle,
          promptStart,
          promptEnd: end,
        },
        character: {
          name: 'Elena',
          description: astronaut,
          mode: 'photo',
          referenceImageFile: 'reference.png',
        },
        photo: true,
        scene: {
          text: 'Elena climbs the spiral staircase.',
          imagePrompt: stored,
        },
      })

      assert.equal(requests.edit.length, 1, 'primero con la foto')
      assert.equal(requests.normal.length, 1, 'rescatada por el carril normal')
      const sent = requests.normal[0]
      const body = bodyWithoutFinalClauses(sent)
      const safeEnd = applySafetyReplacements(end)
      assert.ok(sent.length <= MAX_PROMPT_CHARS)
      assert.ok(
        body.startsWith(promptStart + ' Wide shot of Elena at the foot'),
      )
      // spec §5.4 también en el rescate: inicio → escena → identidad → final,
      // y el recorte cede primero el núcleo de la escena.
      assert.ok(
        body.endsWith(' ' + safeEnd),
        'el final fijo, al final y entero',
      )
      assert.equal(sent.split(promptStart).length, 2, 'un solo inicio')
      assert.equal(sent.split(safeEnd).length, 2, 'un solo final')
      assert.ok(body.includes(DESCRIPTION_HEADER + ' Elena: ' + astronaut))
      assert.ok(body.indexOf(DESCRIPTION_HEADER) < body.indexOf(safeEnd))
      assert.ok(body.includes('step number 0 '), 'la escena arranca entera')
      assert.equal(
        body.includes(lastSentence),
        !overBudget,
        overBudget ? 'cedió el núcleo de la escena' : 'la escena entera',
      )
      assert.doesNotMatch(sent, /attached reference image/)
      assert.ok(sent.includes('the narration is spoken, not written'))
      // El juez revisó exactamente lo que se compró; lo guardado no cambia.
      assert.deepEqual([...judgedPrompts(requests.reviews).values()], [sent])
      assert.equal((await readScenes(paths))[0].imagePrompt, stored)
    },
  )
}

for (const [taken, sentences] of [
  ['all of it', 8],
  ['part of it', 4],
]) {
  test(
    'a fallback with a character present keeps the no-text clause when the cut takes ' +
      taken,
    async (t) => {
      // Con un personaje presente el fallback es largo y trae su propia
      // cláusula de texto al final: con las frases no entra, y el recorte se
      // la llevaba después de que el paso de la cláusula la diera por puesta.
      const text = Array.from(
        { length: sentences },
        (_, index) => `Elena climbs step ${index} of the spiral staircase.`,
      ).join(' ')
      const { requests } = await castProject(t, {
        gemSections: sections,
        character: {
          name: 'Elena',
          description:
            'a young astronaut in a blue padded jacket and silver boots',
          mode: 'text',
        },
        scene: { text },
      })

      assert.equal(requests.normal.length, 1)
      const sent = requests.normal[0]
      assert.ok(sent.length <= MAX_PROMPT_CHARS)
      assert.ok(sent.startsWith(promptStart + ' World facts'))
      assert.equal(sent.split(promptEnd).length, 2, 'un solo final')
      for (const guarantee of [
        'Do NOT print the narration',
        'NO readable text',
        'the narration is spoken, not written',
      ])
        assert.ok(sent.includes(guarantee), guarantee)
      assert.equal(
        sent.split('Do NOT print the narration').length,
        2,
        'una sola cláusula de texto',
      )
      assert.ok(
        sent.indexOf('Do NOT print the narration') > sent.indexOf(promptEnd),
        'la de la plataforma, después del final fijo',
      )
      assert.ok(sent.endsWith(ANONYMITY_CLAUSE))
    },
  )
}
