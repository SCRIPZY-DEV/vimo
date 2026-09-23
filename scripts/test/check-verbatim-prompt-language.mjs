// Idioma de salida en «Mi estilo» (detrás de VERBATIM_OUTPUT_LANGUAGE_RULE) y
// el fallo `llm_prompt_language`: con la regla apagada todo es byte-idéntico a
// antes; encendida, el system y el turno del lote exigen inglés; y si el
// modelo igual escribe en otro idioma, la corrida se corta en UNA ronda (dos
// pedidos) sin culpar al modelo ni llegar al rescate. Sin HTTP: el escritor
// recibe un cliente LLM simulado; el caso del carril simula fetch como los
// guards vecinos.

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
import { runVerbatimLane } from '../../pipeline/stages/scene-prompts/verbatim/verbatim-lane.ts'
import {
  generateVerbatimPrompts,
  LLM_PROMPT_LANGUAGE,
  LLM_RESCUE_NEEDED,
  readBatchPrompts,
} from '../../pipeline/stages/scene-prompts/verbatim/verbatim-writer.ts'
import { LANGUAGE_CONTAMINATION } from '../../pipeline/stages/scene-prompts/verbatim/parser.ts'
import {
  buildCharacterDesignMessage,
  buildFragmentsMessage,
  buildVerbatimSystem,
  FRAGMENTS_LANGUAGE_REMINDER,
  OUTPUT_LANGUAGE_RULE,
  PROMPT_ARCHITECTURE_RULE,
  PROMPT_ARCHITECTURE_RULE_NO_SUBJECT,
  PROMPT_ARCHITECTURE_RULE_REFERENCE,
  SCENE_ID_RULE,
  SCENE_WARDROBE_RULE,
  USER_PROTAGONIST_RULE,
  VERBATIM_OUTPUT_LANGUAGE_RULE,
} from '../../pipeline/prompts/verbatim-messages.ts'

// La gema de test-12: en español, con cola en español y pidiendo español.
const gem =
  'Eres un director de arte que describe imágenes para un documental ilustrado. ' +
  'Cada escena cierra siempre con la frase de estilo: acuarela editorial, tinta suelta, papel texturado. ' +
  'Escribe cada descripción en español.'
const fragments = [
  'Antes de que salga el sol, el puerto ya está despierto.',
  'Los pescadores revisan las redes bajo la luz de los faroles.',
  'Una grúa levanta cajas de hielo hacia el muelle.',
  'El mercado abre sus puertas y el olor a café se mezcla con el del mar.',
  'A las nueve, las calles se llenan de bicicletas.',
  'Cuando el último barco zarpa, la ciudad recién empieza su día.',
  'Y el faro se apaga con la primera luz.',
].map((text, index) => ({ n: index + 1, text }))
const script = fragments.map((fragment) => fragment.text).join(' ')
// Veinticinco fragmentos = un lote de 20 (VERBATIM_BATCH_SIZE) y otro de 5.
const manyFragments = Array.from({ length: 25 }, (_, index) => ({
  n: index + 1,
  text: `Momento ${index + 1} del relato.`,
}))

const spanishPrompt = (id) =>
  `((${id})) Plano general del puerto al amanecer, redes y faroles sobre el muelle, acuarela editorial, tinta suelta, papel texturado.`
const englishPrompt = (id) =>
  `((${id})) Wide shot of the harbor at dawn, nets and lanterns over the pier, editorial watercolor, loose ink, textured paper.`
const answerWith = (make) => (ids) => ids.map(make).join('\n\n')

function fragmentsOf(request) {
  return [...request.messages.at(-1).content.matchAll(/^(\d+)\. /gm)].map(
    (match) => Number(match[1]),
  )
}
// Cliente simulado: `answer(ids, attempt)` decide la respuesta de cada pedido;
// `attempt` cuenta los pedidos que ya recibió ESE mismo lote (los reintentos
// de withVerbatimRetry y las rondas de la escalera repiten los ids).
function fakeClient(answer) {
  const requests = []
  const attempts = new Map()
  return {
    requests,
    async call(request) {
      requests.push(request)
      const ids = fragmentsOf(request)
      const key = ids.join(',')
      const attempt = (attempts.get(key) ?? 0) + 1
      attempts.set(key, attempt)
      return { content: answer(ids, attempt), inputTokens: 1, outputTokens: 1 }
    },
  }
}
// Devuelve la promesa SIN esperarla: los casos que fallan la afirman con
// assert.rejects y los demás la esperan.
function write(answer, { fragments: which = fragments, ...options } = {}) {
  const client = fakeClient(answer)
  const logs = []
  const trouble = []
  const batches = []
  const run = generateVerbatimPrompts(which, script, {
    gem,
    client,
    character: { mode: 'none' },
    onLog: (message) => logs.push(message),
    onWarn: (message) => logs.push('warn: ' + message),
    onModelTrouble: (modelId, code, sceneIds) =>
      trouble.push({ modelId, code, sceneIds }),
    onBatchReady: async (batch) => {
      batches.push([...batch.prompts.keys()].sort((a, b) => a - b))
    },
    ...options,
  })
  return { run, requests: client.requests, logs, trouble, batches }
}
const isLanguageFailure = (error) =>
  error instanceof PipelineFailure && error.code === LLM_PROMPT_LANGUAGE

// ── La constante y los mensajes ──

test('the output-language rule is switched on and written without accents (it is a message to the model)', () => {
  assert.equal(VERBATIM_OUTPUT_LANGUAGE_RULE, true)
  assert.doesNotMatch(OUTPUT_LANGUAGE_RULE, /[áéíóúÁÉÍÓÚ]/)
  assert.doesNotMatch(FRAGMENTS_LANGUAGE_REMINDER, /[áéíóúÁÉÍÓÚ]/)
  assert.match(OUTPUT_LANGUAGE_RULE, /INGLES/)
  assert.match(FRAGMENTS_LANGUAGE_REMINDER, /INGLES/)
})

test('switched off explicitly, the system and the batch turn are byte-identical to before the rule', () => {
  const off = { outputLanguageRule: false, sceneWardrobe: false }
  const architecture = {
    generic: PROMPT_ARCHITECTURE_RULE,
    text: PROMPT_ARCHITECTURE_RULE,
    reference: PROMPT_ARCHITECTURE_RULE_REFERENCE,
    none: PROMPT_ARCHITECTURE_RULE_NO_SUBJECT,
  }
  for (const mode of ['generic', 'text', 'reference', 'none']) {
    const userProtagonist =
      mode === 'text' || mode === 'reference'
        ? '\n\n' + USER_PROTAGONIST_RULE
        : ''
    assert.equal(
      buildVerbatimSystem(gem, mode, off),
      gem +
        '\n\n' +
        SCENE_ID_RULE +
        '\n\n' +
        architecture[mode] +
        userProtagonist,
    )
    const batch = buildFragmentsMessage(fragments, mode, off)
    assert.ok(
      batch.endsWith(
        'Son 7 fragmentos: devuelve EXACTAMENTE 7 prompts, uno por fragmento y en el mismo orden. Ni uno mas, ni uno menos.',
      ),
    )
    assert.ok(!batch.includes(FRAGMENTS_LANGUAGE_REMINDER))
  }
})

test('switched on, every mode carries the rule after the architecture and the batch turn ends with the reminder', () => {
  for (const mode of ['generic', 'text', 'reference', 'none']) {
    const system = buildVerbatimSystem(gem, mode)
    assert.ok(system.includes('\n\n' + OUTPUT_LANGUAGE_RULE))
    assert.ok(
      system.indexOf(OUTPUT_LANGUAGE_RULE) > system.indexOf(SCENE_ID_RULE),
    )
    // El vestuario sigue cerrando el system (hay checks sobre eso); sin
    // protagonista la regla de idioma es la última.
    if (mode === 'none') assert.ok(system.endsWith(OUTPUT_LANGUAGE_RULE))
    else assert.ok(system.endsWith(SCENE_WARDROBE_RULE))
    const batch = buildFragmentsMessage(fragments, mode)
    assert.ok(
      batch.includes(
        'Ni uno mas, ni uno menos. ' + FRAGMENTS_LANGUAGE_REMINDER,
      ),
    )
    assert.ok(batch.endsWith(FRAGMENTS_LANGUAGE_REMINDER))
  }
  // La Fase 1 ya pedía «en INGLES»: no se toca.
  assert.ok(!buildCharacterDesignMessage(script).includes(OUTPUT_LANGUAGE_RULE))
})

// ── La red de seguridad ──

test('Spanish in every attempt stops after one round: two requests, the language code, no model blamed, no rescue', async () => {
  const { run, requests, logs, trouble } = write(answerWith(spanishPrompt))
  await assert.rejects(run, isLanguageFailure)
  assert.equal(requests.length, 2)
  assert.equal(trouble.length, 0)
  assert.ok(
    logs.some(
      (line) =>
        line.startsWith('warn: ') && line.includes(LANGUAGE_CONTAMINATION),
    ),
  )
  assert.ok(
    logs.some((line) =>
      line.includes('stopping before the retry ladder and the rescue'),
    ),
  )
  assert.ok(!logs.some((line) => line.includes(' go to ')))
})

test('one Spanish answer is a fluke, not a verdict: the retry of the same batch in English completes the run', async () => {
  const { run, requests } = write((ids, attempt) =>
    attempt === 1
      ? answerWith(spanishPrompt)(ids)
      : answerWith(englishPrompt)(ids),
  )
  const result = await run
  assert.equal(result.prompts.size, 7)
  assert.deepEqual(result.missing, [])
  assert.equal(requests.length, 2)
})

test('a mixed round keeps the ladder: the good batch is harvested and persisted, the Spanish one gets its own round before the run stops', async () => {
  const { run, requests, trouble, batches } = write(
    (ids) =>
      ids.includes(1)
        ? answerWith(englishPrompt)(ids)
        : answerWith(spanishPrompt)(ids),
    { fragments: manyFragments },
  )
  await assert.rejects(run, isLanguageFailure)
  // Ronda 1: el lote de 20 sale a la primera y el de 5 cae dos veces; ronda
  // 2: los 5 solos, dos veces más — y ahí se corta.
  assert.equal(requests.length, 5)
  assert.deepEqual(batches, [
    Array.from({ length: 20 }, (_, index) => index + 1),
  ])
  assert.ok(!trouble.some((entry) => entry.code === LLM_RESCUE_NEEDED))
  assert.equal(trouble.length, 0)
})

test('a provider failure in the same round is not a language verdict: the model trouble is still reported and the ladder goes on', async () => {
  const { run, requests, trouble } = write(
    (ids, attempt) => {
      if (ids.includes(1)) {
        if (attempt <= 2)
          throw new PipelineFailure('llm_timeout', 'the model took too long')
        return answerWith(englishPrompt)(ids)
      }
      return answerWith(spanishPrompt)(ids)
    },
    { fragments: manyFragments },
  )
  await assert.rejects(run, isLanguageFailure)
  assert.deepEqual(
    trouble.map((entry) => entry.code),
    ['llm_timeout'],
  )
  // Ronda 1: 2 timeouts + 2 en español (sigue: hubo otro motivo); ronda 2: el
  // de 20 en inglés + 2 en español (sigue: hubo un lote leído); ronda 3: los
  // 5 solos, 2 en español → corte.
  assert.equal(requests.length, 9)
})

test('a piece that is only its ((n)) marker is a format problem, not a language one: retried and completed', async () => {
  assert.throws(
    () =>
      readBatchPrompts(
        [englishPrompt(1), '((2))', englishPrompt(3)].join('\n\n'),
        fragments.slice(0, 3),
      ),
    (error) =>
      !(error instanceof PipelineFailure) && /came empty/.test(error.message),
  )
  // El reintento interno de withVerbatimRetry no deja log cuando el segundo
  // intento sale bien: lo que se ve es la corrida completa en dos pedidos.
  const { run, requests, logs } = write((ids, attempt) =>
    ids
      .map((id) => (attempt === 1 && id === 3 ? '((3))' : englishPrompt(id)))
      .join('\n\n'),
  )
  const result = await run
  assert.equal(result.prompts.size, 7)
  assert.equal(requests.length, 2)
  assert.ok(!logs.some((line) => line.includes(LANGUAGE_CONTAMINATION)))
})

test("readBatchPrompts tells the gem's fault from the model's: language is the typed failure, leaked reasoning a plain error", () => {
  const batch = [{ n: 1, text: 'x' }]
  assert.throws(
    () =>
      readBatchPrompts(
        '{"prompts":[{"id":1,"prompt":"Plano general del puerto al amanecer, acuarela editorial."}]}',
        batch,
      ),
    isLanguageFailure,
  )
  assert.throws(
    () => readBatchPrompts(spanishPrompt(1), batch),
    isLanguageFailure,
  )
  assert.throws(
    () =>
      readBatchPrompts(
        '((1)) Wide shot of the harbor. He generado hasta el fragmento 1.',
        batch,
      ),
    (error) =>
      !(error instanceof PipelineFailure) &&
      /leaked its reasoning/.test(error.message),
  )
})

// ── El carril ──

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
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-prompt-language-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const paths = resolveProjectPaths(join(root, 'fixture'), 'fixture')
  await mkdir(paths.scenesDirectory, { recursive: true })
  const metadata = {
    id: 'fixture',
    name: 'Fixture',
    options: {
      styleId: 'normal',
      imageProvider: 'fal',
      imageQuality: 'low',
      videoFormat: '16:9',
      customStyle: {
        id: 'fixture',
        name: 'Acuarela',
        systemPrompt: gem,
        character: { mode: 'none' },
      },
    },
    state: 'draft',
    completedStages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  await writeFile(paths.metadataFile, JSON.stringify(metadata))
  await writeFile(paths.scriptFile, script)
  await writeScenes(
    paths,
    fragments.slice(0, 3).map((fragment, index) => ({
      id: fragment.n,
      text: fragment.text,
      startSeconds: index * 4,
      endSeconds: (index + 1) * 4,
    })),
  )
  const events = []
  const base = {
    job: {
      jobId: 'fixture',
      projectsRoot: root,
      apiKeys: { deepinfra: 'fixture' },
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

test('through the lane the failure keeps its code, nothing is persisted and no model trouble is emitted', async (t) => {
  const { paths, base, events } = await fixture(t)
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.ok(String(url).includes('chat/completions'))
    const request = JSON.parse(init.body)
    calls.push(request)
    return stream(fragmentsOf(request).map(spanishPrompt).join('\n\n'))
  })
  const context = await buildCreateVideoContext(base, 'fixture')
  const persisted = []
  await assert.rejects(
    runVerbatimLane(context, await readScenes(paths), script, {
      onPrompts: async (prompts) => {
        persisted.push(...prompts)
      },
    }),
    isLanguageFailure,
  )
  assert.equal(calls.length, 2)
  assert.deepEqual(persisted, [])
  assert.ok((await readScenes(paths)).every((scene) => !scene.imagePrompt))
  assert.ok(!events.some((event) => event.type === 'prompt-model-trouble'))
})
