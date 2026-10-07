// El proyecto que arma Crear con la pestaña Catálogo nueva (plan E2 §5.4): una
// gema del catálogo sale por el carril de Mi estilo con su `catalogStyleId`, y
// el catálogo viejo (sin el interruptor o en la demo) y Mi estilo mandan
// exactamente lo de hoy. createProjectPayload y formBlockers usan `@/` (las
// constantes de videos y voces), así que no corren con Node pelado: se
// empaquetan con esbuild y los alias de tsconfig.app.json, como
// check-app-vimo-server.mjs. Es el código real, sin fixtures.
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { projectCustomStyleFrom } from '../../src/modules/videos/utilities/projectCustomStyle.ts'
import { selectedCatalogStyleFrom } from '../../src/modules/videos/utilities/selectedCatalogStyle.ts'
import { selectedCustomStyleFrom } from '../../src/modules/videos/utilities/selectedCustomStyle.ts'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

let workdir
let payloadModule

before(async () => {
  const output = await build({
    stdin: {
      contents: [
        "export * from './src/modules/videos/utilities/formPayload.ts'",
        "export { characterPatchForStyle } from './src/modules/videos/utilities/characterPatchForStyle.ts'",
      ].join('\n'),
      resolveDir: repoRoot,
      sourcefile: 'catalog-payload-entry.ts',
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    tsconfig: join(repoRoot, 'tsconfig.app.json'),
  })
  workdir = await mkdtemp(join(tmpdir(), 'catalog-payload-guard-'))
  const file = join(workdir, 'catalog-payload.mjs')
  await writeFile(file, output.outputFiles[0].contents)
  payloadModule = await import(pathToFileURL(file).href)
})

after(async () => {
  await rm(workdir, { recursive: true, force: true })
})

// El formulario de Crear completo, con la forma de CreateFormValue. Cada carril
// se distingue: `confirmScenes` (la casilla del catálogo viejo) y
// `confirmSceneDuration` (la preferencia de Ajustes) valen distinto, igual que
// la cantidad de escenas y los segundos por escena.
const BASE_FORM = {
  name: '  Mi video  ',
  narrationMode: 'tts',
  script: '  Había una vez un faro.  ',
  narrationFilePath: null,
  styleId: 'cartoon',
  styleSource: 'catalog',
  customStyle: null,
  promptModel: 'gpt-5.4-nano',
  sceneCount: 12,
  secondsPerScene: 6,
  animateScenes: false,
  animateWholeVideo: false,
  animationMinutes: 1,
  imageProvider: 'evolink',
  imageQuality: '1024x576_low',
  voice: { provider: 'minimax', voiceId: 'voz-1', name: 'Lucía' },
  voiceSettings: {
    speed: 1,
    pitch: 0,
    volume: 1,
    volumeEdge: 100,
    emotion: '',
    stability: 0.5,
    similarity: 0.75,
    style: 0,
    speakerBoost: true,
  },
  characters: [
    {
      characterId: 'ana',
      name: 'Ana',
      description: 'Una mujer alta.',
      mode: 'photo',
      portraitPath: '/biblioteca/ana.png',
    },
  ],
  withdrawnCharacters: [],
  characterFrequency: 'always',
  useBgm: true,
  bgmMode: 'evolink-ai',
  bgmUrl: '',
  bgmPrompt: '  piano suave  ',
  bgmInstrumental: true,
  useOverlay: false,
  overlayUrl: '',
  confirmScenes: true,
  confirmSceneDuration: false,
  subtitles: true,
  autoRender: false,
  videoFormat: '16:9',
}

// Lo que no depende del carril: voz, música, guion y personajes.
const VOICE_OPTIONS = {
  voiceProvider: 'minimax',
  voiceId: 'voz-1',
  voiceName: 'Lucía',
  voiceSettings: { speed: 1, pitch: 0, volume: 1 },
}
const BGM_OPTIONS = {
  bgmMode: 'evolink-ai',
  bgmMusic: { prompt: 'piano suave', instrumental: true },
}
const PAYLOAD_CHARACTERS = [
  {
    characterId: 'ana',
    name: 'Ana',
    description: 'Una mujer alta.',
    mode: 'photo',
  },
]

// El proyecto del catálogo viejo como lo arma Crear HOY (copia literal de la
// salida antes de la Entrega 2): mismas claves, mismo orden.
const LEGACY_PAYLOAD = {
  name: 'Mi video',
  options: {
    styleId: 'cartoon',
    sceneCount: 12,
    narrationMode: 'tts',
    imageProvider: 'evolink',
    imageQuality: '1024x576_low',
    useBgm: true,
    useOverlay: false,
    confirmScenes: true,
    subtitles: true,
    autoRender: false,
    videoFormat: '16:9',
    ...VOICE_OPTIONS,
    ...BGM_OPTIONS,
    characterFrequency: 'always',
  },
  script: 'Había una vez un faro.',
  characters: PAYLOAD_CHARACTERS,
}

// La gema de plantilla de Mi estilo y el proyecto que arma HOY (copia literal).
const TEMPLATE_STYLE = {
  styleId: 'st-plantilla',
  name: 'Plantilla',
  systemPrompt: '',
  shots: [],
  character: { mode: 'own' },
  sections: { visualStyle: 'Acuarela editorial con tinta suelta.' },
  templateVersion: 1,
  colorFilter: 'none',
}

const CUSTOM_PAYLOAD = {
  name: 'Mi video',
  options: {
    styleId: 'normal',
    sceneCount: 0,
    narrationMode: 'tts',
    imageProvider: 'evolink',
    imageQuality: '1024x576_low',
    useBgm: true,
    useOverlay: false,
    confirmScenes: false,
    subtitles: true,
    autoRender: false,
    videoFormat: '16:9',
    customStyle: {
      styleId: 'st-plantilla',
      name: 'Plantilla',
      sections: { visualStyle: 'Acuarela editorial con tinta suelta.' },
      templateVersion: 1,
      colorFilter: 'none',
      character: { mode: 'own' },
    },
    secondsPerScene: 6,
    promptModel: 'gpt-5.4-nano',
    ...VOICE_OPTIONS,
    ...BGM_OPTIONS,
  },
  script: 'Había una vez un faro.',
  characters: PAYLOAD_CHARACTERS,
}

// Gemas del catálogo con la forma completa de CatalogGem: Fantasía es uno de
// los 5 ids heredados; Anime Storytime, uno de Imperio Pro.
const FANTASIA = {
  id: 'fantasia',
  name: { es: 'Fantasía mágica', en: 'Magic fantasy', pt: 'Fantasia mágica' },
  tags: [{ es: 'Fantasía', en: 'Fantasy', pt: 'Fantasia' }],
  sections: {
    visualStyle: 'Epic fantasy illustration, painterly, golden rim light.',
    dynamism: 'Alternar escenas explicativas y alusivas.',
  },
  templateVersion: 1,
  allowedModes: ['generic', 'own', 'none'],
  sampleMode: 'generic',
  colorFilter: 'fantasy',
  sampleCount: 4,
}

const ANIME = {
  ...FANTASIA,
  id: 'anime-storytime',
  name: {
    es: 'Anime Storytime',
    en: 'Anime Storytime',
    pt: 'Anime Storytime',
  },
  sections: { visualStyle: 'High-quality 2D anime illustration.' },
  sampleMode: 'none',
  colorFilter: 'none',
}

const OWN_ANA = { mode: 'own', defaultCharacterId: 'ana' }

// El formulario con una gema del catálogo elegida en su pestaña.
function catalogGemForm(gem, character, patch = {}) {
  return {
    ...BASE_FORM,
    styleSource: 'catalog',
    customStyle: selectedCatalogStyleFrom(gem, 'es', character),
    ...patch,
  }
}

// ─── El catálogo viejo y Mi estilo: lo de hoy, byte por byte ───

test('el catálogo viejo manda el proyecto de hoy, byte por byte', () => {
  assert.equal(
    JSON.stringify(payloadModule.createProjectPayload(BASE_FORM)),
    JSON.stringify(LEGACY_PAYLOAD),
  )
})

test('la demo sigue en el catálogo viejo, sin pausas y con su marca', () => {
  // Copia literal de la salida de hoy: `demo` va después de las opciones
  // fijas, y la pausa y el auto-export se pisan en su lugar.
  const expected = {
    name: 'Mi video',
    options: {
      styleId: 'cartoon',
      sceneCount: 12,
      narrationMode: 'tts',
      imageProvider: 'evolink',
      imageQuality: '1024x576_low',
      useBgm: true,
      useOverlay: false,
      confirmScenes: false,
      subtitles: true,
      autoRender: true,
      videoFormat: '16:9',
      demo: true,
      ...VOICE_OPTIONS,
      ...BGM_OPTIONS,
      characterFrequency: 'always',
    },
    script: 'Había una vez un faro.',
    characters: PAYLOAD_CHARACTERS,
  }

  assert.equal(
    JSON.stringify(
      payloadModule.createProjectPayload(BASE_FORM, { demo: true }),
    ),
    JSON.stringify(expected),
  )
})

test('la gema de Mi estilo que quedó al pasar al catálogo viejo no viaja', () => {
  // Sin el interruptor la pestaña Catálogo elige por `styleId` y la selección
  // de Mi estilo sigue guardada para cuando se vuelva (como hoy).
  assert.equal(
    JSON.stringify(
      payloadModule.createProjectPayload({
        ...BASE_FORM,
        customStyle: TEMPLATE_STYLE,
      }),
    ),
    JSON.stringify(LEGACY_PAYLOAD),
  )
})

test('Mi estilo manda el proyecto de hoy, byte por byte', () => {
  assert.equal(
    JSON.stringify(
      payloadModule.createProjectPayload({
        ...BASE_FORM,
        styleSource: 'custom',
        customStyle: TEMPLATE_STYLE,
      }),
    ),
    JSON.stringify(CUSTOM_PAYLOAD),
  )
})

test('una copia de «Pasar a mi estilo» viaja como cualquier gema de Mi estilo', () => {
  // El camino real de «Ir a Mi estilo»: la tarjeta que devolvió
  // catalog-style-copy pasa por selectedCustomStyleFrom y de ahí al proyecto.
  // La copia lleva su `st-…` y su origen es solo un dato de la tarjeta: ni el
  // snapshot ni el proyecto traen `catalogStyleId`.
  const copy = {
    id: 'st-copia',
    name: 'Fantasía mágica',
    shots: [],
    character: { mode: 'generic' },
    createdAt: '2026-10-02T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
    samples: [],
    sections: FANTASIA.sections,
    templateVersion: 1,
    colorFilter: 'fantasy',
    origin: {
      kind: 'catalog',
      catalogStyleId: 'fantasia',
      name: 'Fantasía mágica',
    },
  }
  const customStyle = selectedCustomStyleFrom(copy)
  assert.equal('catalogStyleId' in customStyle, false)
  assert.equal('origin' in customStyle, false)
  assert.equal('catalogStyleId' in projectCustomStyleFrom(customStyle), false)

  const payload = payloadModule.createProjectPayload({
    ...BASE_FORM,
    styleSource: 'custom',
    customStyle,
  })
  assert.equal(payload.options.styleId, 'normal')
  assert.equal(payload.options.customStyle.styleId, 'st-copia')
  assert.equal('catalogStyleId' in payload.options.customStyle, false)
})

// ─── Una gema del catálogo nuevo (plan E2 §5.4) ───

test('una gema heredada del catálogo arma exactamente la sección 5.4', () => {
  const payload = payloadModule.createProjectPayload(
    catalogGemForm(FANTASIA, OWN_ANA),
  )
  assert.deepEqual(payload, {
    name: 'Mi video',
    options: {
      // Heredada: su propio id, que create-video-project exige.
      styleId: 'fantasia',
      // Corte por duración de escena, como Mi estilo.
      sceneCount: 0,
      narrationMode: 'tts',
      imageProvider: 'evolink',
      imageQuality: '1024x576_low',
      useBgm: true,
      useOverlay: false,
      // La preferencia de Ajustes, no la casilla del catálogo viejo.
      confirmScenes: false,
      subtitles: true,
      autoRender: false,
      videoFormat: '16:9',
      customStyle: {
        styleId: 'fantasia',
        catalogStyleId: 'fantasia',
        name: 'Fantasía mágica',
        sections: FANTASIA.sections,
        templateVersion: 1,
        colorFilter: 'fantasy',
        character: OWN_ANA,
      },
      secondsPerScene: 6,
      promptModel: 'gpt-5.4-nano',
      ...VOICE_OPTIONS,
      ...BGM_OPTIONS,
    },
    script: 'Había una vez un faro.',
    characters: PAYLOAD_CHARACTERS,
  })
  // Sin frecuencia: el carril de las gemas no la aplica (ADR-0019).
  assert.equal('characterFrequency' in payload.options, false)
})

test('una gema nueva del catálogo viaja con styleId normal', () => {
  const payload = payloadModule.createProjectPayload(
    catalogGemForm(ANIME, { mode: 'none' }, { promptModel: null }),
  )
  assert.equal(payload.options.styleId, 'normal')
  assert.deepEqual(payload.options.customStyle, {
    styleId: 'anime-storytime',
    catalogStyleId: 'anime-storytime',
    name: 'Anime Storytime',
    sections: ANIME.sections,
    templateVersion: 1,
    colorFilter: 'none',
    character: { mode: 'none' },
  })
  assert.equal(payload.options.sceneCount, 0)
  assert.equal(payload.options.secondsPerScene, 6)
  // Sin modelo elegido no viaja ninguno: el sidecar usa el de la casa.
  assert.equal('promptModel' in payload.options, false)
  assert.equal('characterFrequency' in payload.options, false)
})

test('un estilo del catálogo nunca viaja con un styleId que el sidecar rechace', () => {
  // Si un snapshot del catálogo llegara a la pestaña Mi estilo, el proyecto
  // igual lleva el id que exige create-video-project (heredado = su id).
  const stray = payloadModule.createProjectPayload({
    ...BASE_FORM,
    styleSource: 'custom',
    customStyle: selectedCatalogStyleFrom(FANTASIA, 'es', OWN_ANA),
  })
  assert.equal(stray.options.styleId, 'fantasia')
  assert.equal(stray.options.customStyle.catalogStyleId, 'fantasia')

  const strayNew = payloadModule.createProjectPayload({
    ...BASE_FORM,
    styleSource: 'custom',
    customStyle: selectedCatalogStyleFrom(ANIME, 'es', { mode: 'generic' }),
  })
  assert.equal(strayNew.options.styleId, 'normal')
})

// ─── Lo que frena el envío ───

// Los pasos que dependen del estilo, de la lista completa de formBlockers.
const STYLE_BLOCKERS = [
  'create.validation.styleRequired',
  'create.validation.catalogStyleRequired',
  'create.validation.promptModelsBlocked',
]

function styleBlockers(form, context) {
  return payloadModule
    .formBlockers(form, context)
    .filter((key) => STYLE_BLOCKERS.includes(key))
}

test('sin el catálogo nuevo, la pestaña Catálogo no pide tarjeta ni modelo', () => {
  assert.deepEqual(payloadModule.formBlockers(BASE_FORM), [])
  assert.deepEqual(
    styleBlockers(BASE_FORM, {
      newCatalog: false,
      promptModelsBlocked: true,
    }),
    [],
  )
})

test('con el catálogo nuevo, sin tarjeta elegida el video no sale', () => {
  // Arranca sin selección, como Mi estilo (plan E2, P4).
  assert.deepEqual(styleBlockers(BASE_FORM, { newCatalog: true }), [
    'create.validation.catalogStyleRequired',
  ])
  assert.deepEqual(
    styleBlockers(catalogGemForm(ANIME, { mode: 'none' }), {
      newCatalog: true,
    }),
    [],
  )
})

test('sin modelos de prompts no sale ni Mi estilo ni un estilo del catálogo', () => {
  const blocked = { newCatalog: true, promptModelsBlocked: true }
  assert.deepEqual(
    styleBlockers(catalogGemForm(ANIME, { mode: 'none' }), blocked),
    ['create.validation.promptModelsBlocked'],
  )
  assert.deepEqual(styleBlockers(BASE_FORM, blocked), [
    'create.validation.catalogStyleRequired',
    'create.validation.promptModelsBlocked',
  ])
  assert.deepEqual(
    styleBlockers(
      { ...BASE_FORM, styleSource: 'custom', customStyle: TEMPLATE_STYLE },
      blocked,
    ),
    ['create.validation.promptModelsBlocked'],
  )
  // Mi estilo sin tarjeta: el mismo aviso de siempre.
  assert.deepEqual(
    styleBlockers(
      { ...BASE_FORM, styleSource: 'custom', customStyle: null },
      blocked,
    ),
    [
      'create.validation.styleRequired',
      'create.validation.promptModelsBlocked',
    ],
  )
})

test('un estilo del catálogo con «Mi personaje» pide un personaje', () => {
  const form = catalogGemForm(ANIME, { mode: 'own' }, { characters: [] })
  assert.equal(payloadModule.styleCharacterModeOf(form), 'own')
  assert.ok(
    payloadModule
      .formBlockers(form, { newCatalog: true })
      .includes('create.validation.characterRequired'),
  )
  // El catálogo viejo no tiene modo de personaje.
  assert.equal(payloadModule.styleCharacterModeOf(BASE_FORM), null)
})

test('elegir un estilo del catálogo que escribe el protagonista retira los personajes', () => {
  const form = { ...BASE_FORM, styleSource: 'catalog', customStyle: null }
  const customStyle = selectedCatalogStyleFrom(ANIME, 'es', {
    mode: 'generic',
  })
  assert.deepEqual(
    payloadModule.characterPatchForStyle(form, {
      styleSource: 'catalog',
      customStyle,
    }),
    { characters: [], withdrawnCharacters: BASE_FORM.characters },
  )
})

// ─── Un personaje como máximo con un estilo del catálogo (spec §8) ───

const ANA = BASE_FORM.characters[0]
const BETO = {
  characterId: 'beto',
  name: 'Beto',
  description: 'Un hombre bajo con barba.',
  mode: 'text',
  portraitPath: null,
}

test('al entrar a un estilo del catálogo con dos personajes queda el primero y el otro se retira', () => {
  // Venían de Mi estilo (o del catálogo viejo), que aceptan dos.
  const form = {
    ...BASE_FORM,
    styleSource: 'custom',
    customStyle: TEMPLATE_STYLE,
    characters: [ANA, BETO],
  }
  const customStyle = selectedCatalogStyleFrom(ANIME, 'es', { mode: 'own' })
  const patch = payloadModule.characterPatchForStyle(form, {
    styleSource: 'catalog',
    customStyle,
  })
  assert.deepEqual(patch, { characters: [ANA], withdrawnCharacters: [BETO] })

  // Al proyecto viaja uno solo.
  const payload = payloadModule.createProjectPayload({
    ...form,
    styleSource: 'catalog',
    customStyle,
    ...patch,
  })
  assert.deepEqual(
    payload.characters.map((character) => character.characterId),
    ['ana'],
  )
})

test('con un personaje fijo elegido, el fijo es el que queda', () => {
  const form = {
    ...BASE_FORM,
    styleSource: 'catalog',
    customStyle: null,
    characters: [BETO, ANA],
  }
  assert.deepEqual(
    payloadModule.characterPatchForStyle(form, {
      styleSource: 'catalog',
      customStyle: selectedCatalogStyleFrom(ANIME, 'es', OWN_ANA),
    }),
    { characters: [ANA], withdrawnCharacters: [BETO] },
  )
})

test('los retirados que vuelven a un estilo del catálogo vuelven de a uno', () => {
  // Un estilo genérico los había retirado; «Mi personaje» los devuelve, pero
  // solo entra uno.
  const form = {
    ...BASE_FORM,
    styleSource: 'catalog',
    customStyle: selectedCatalogStyleFrom(ANIME, 'es', { mode: 'generic' }),
    characters: [],
    withdrawnCharacters: [ANA, BETO],
  }
  assert.deepEqual(
    payloadModule.characterPatchForStyle(form, {
      styleSource: 'catalog',
      customStyle: selectedCatalogStyleFrom(ANIME, 'es', { mode: 'own' }),
    }),
    { characters: [ANA], withdrawnCharacters: [BETO] },
  )
})

test('el catálogo viejo y Mi estilo siguen aceptando dos personajes', () => {
  const form = { ...BASE_FORM, characters: [ANA, BETO] }
  // Al catálogo viejo (sin tarjeta del catálogo nuevo).
  assert.deepEqual(
    payloadModule.characterPatchForStyle(
      { ...form, styleSource: 'custom', customStyle: TEMPLATE_STYLE },
      { styleSource: 'catalog', customStyle: null },
    ),
    {},
  )
  // A una gema de Mi estilo con «Mi personaje», sin fijo.
  assert.deepEqual(
    payloadModule.characterPatchForStyle(form, {
      styleSource: 'custom',
      customStyle: TEMPLATE_STYLE,
    }),
    {},
  )
  // Y los retirados vuelven los dos a Mi estilo.
  assert.deepEqual(
    payloadModule.characterPatchForStyle(
      { ...form, characters: [], withdrawnCharacters: [ANA, BETO] },
      { styleSource: 'custom', customStyle: TEMPLATE_STYLE },
    ),
    { characters: [ANA, BETO], withdrawnCharacters: [] },
  )
})
