// Crear en la demo (spec demo v4 §2; ADR-0029 y ADR-0030): qué estilos ofrece
// cada galería en cada formato (los del catálogo en el orden del pack, las
// gemas del pack sin Jardinería en Short), qué tarjeta usa la pestaña Catálogo
// sin una elegida (la primera de la lista que el pack trae: un id del pack que
// la lista no trae se omite), qué historia sigue al formulario, qué formatos
// quedan en «Próximamente», y qué hacen el switch de avatar y los pedidos de
// estilo con él encendido (pedido del dueño del 2026-10-14: con el switch
// encendido solo vale Jardinería, en Mi estilo y en 16:9; otro pedido vuelve a
// ella y avisa; elegir Jardinería con el switch apagado lo enciende; apagarlo
// con Jardinería vuelve a la pestaña Catálogo sin tarjeta). Además: el modo de
// personaje sale de la historia y la sección de personajes solo se ve con un
// estilo con personaje fijo; el switch de animación solo con una historia
// animada; el payload lleva la animación como fuera de la demo y nunca el
// avatar; formBlockers no frena por la clave de Kie, los modelos bloqueados ni
// los personajes; y una corrida de la demo no anota apariciones del avatar
// cobradas (ruling R28). demoForm.ts es un módulo puro de src/ corrido con
// Node (type stripping), sin bundler; formPayload.ts y avatarTaskEvents.ts
// usan `@/` (las constantes de videos y voces), así que se empaquetan con
// esbuild y los alias de tsconfig.app.json, como check-app-catalog-payload.mjs:
// es el código real, sin fixtures.
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { FRAME_SIZES } from '../../pipeline/types/video-format.ts'
import {
  demoAnimationAvailable,
  demoAudioFileLabel,
  demoAvatar,
  demoAvatarGem,
  demoAvatarToggle,
  demoCatalogCharacter,
  demoCatalogIds,
  demoComingSoonFormats,
  demoDefaultCatalogGem,
  demoEntryFor,
  demoFollowStyle,
  demoFormValue,
  demoGemStyleIds,
  demoShowsCharacterSection,
  demoStyleRequest,
  demoVisibleCatalogGems,
  withDemoAnimation,
} from '../../src/modules/videos/utilities/demoForm.ts'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

let workdir
let app

before(async () => {
  const output = await build({
    stdin: {
      contents: [
        "export * from './src/modules/videos/utilities/formPayload.ts'",
        "export * from './src/modules/videos/utilities/avatarTaskEvents.ts'",
        "export { ANIMATION_MINUTES_DEFAULT } from './src/modules/videos/constants.ts'",
      ].join('\n'),
      resolveDir: repoRoot,
      sourcefile: 'demo-form-entry.ts',
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    tsconfig: join(repoRoot, 'tsconfig.app.json'),
  })
  workdir = await mkdtemp(join(tmpdir(), 'demo-form-guard-'))
  const file = join(workdir, 'demo-form.mjs')
  await writeFile(file, output.outputFiles[0].contents)
  app = await import(pathToFileURL(file).href)
})

after(async () => {
  if (workdir) await rm(workdir, { recursive: true, force: true })
})

// Una historia del pack con la forma de DemoStyleEntry. El audio de cada
// historia vive en su carpeta: la raíz para 16:9, `short/` para 9:16.
function story(id, format, extra = {}) {
  const folder = format === '9:16' ? `short/${id}` : id
  return {
    id,
    suggestedName: `Historia ${id} ${format}`,
    script: `Guion de ${id} en ${format}`,
    sceneCount: format === '9:16' ? 18 : 21,
    audioDurationSeconds: 64,
    audioFile: `/pack/${folder}/audio.mp3`,
    character: 'none',
    animated: true,
    ...extra,
  }
}

const AVATAR = {
  name: 'Jardineria',
  engine: 'avatar_iv',
  appearances: 5,
  secondsPerAppearance: 5,
  previewFile: '/pack/gemas/jardineria/avatar.jpg',
  options: {
    avatarId: 'jardineria-z2l3du',
    lookId: 'look-jardineria',
    lookName: 'Jardineria',
    lookType: 'photo_avatar',
    engine: 'avatar_iv',
    appearances: 5,
    secondsPerAppearance: 5,
    startWithAvatar: true,
    placement: 'auto',
  },
}

const STORYTELLING_GEM = {
  id: 'storytelling',
  styleId: 'demo-storytelling',
  name: 'STORYTELLING2',
}
const JARDINERIA_GEM = {
  id: 'jardineria',
  styleId: 'demo-jardineria',
  name: 'JARDINERIA',
}

// El pack v4 en chico: el orden del manifest no es el alfabético, Short no
// trae 2D Mono ni Jardinería, solo Jardinería trae avatar (en 16:9) y la
// historia Short de cosmos no trae su variante animada (en el pack publicado
// todas la traen; la regla tiene que valer igual).
const MANIFEST = {
  version: 'v4',
  voice: {
    provider: 'ai33',
    voiceId: 'elevenlabs_452WrNT9o8dphaYW5YGU',
    name: 'Abel',
  },
  gems: [STORYTELLING_GEM, JARDINERIA_GEM],
  stories: {
    '16:9': {
      styles: [
        story('normal', '16:9'),
        story('2d-mono', '16:9', { character: 'generic' }),
        story('cosmos', '16:9'),
      ],
      gems: [
        story('storytelling', '16:9', { character: 'generic' }),
        story('jardineria', '16:9', { avatar: AVATAR }),
      ],
    },
    '9:16': {
      styles: [
        story('cosmos', '9:16', { animated: false }),
        story('normal', '9:16'),
      ],
      gems: [story('storytelling', '9:16', { character: 'generic' })],
    },
  },
}

// Un pack sin bloque Short ni avatar.
const LANDSCAPE_ONLY = {
  ...MANIFEST,
  gems: [STORYTELLING_GEM],
  stories: {
    '16:9': {
      styles: [story('normal', '16:9'), story('cosmos', '16:9')],
      gems: [story('storytelling', '16:9', { character: 'generic' })],
    },
  },
}

// Las selecciones del formulario: un estilo del catálogo (con su id de
// catálogo, como lo arma selectedCatalogStyleFrom) o una gema de Mi estilo
// (por el `styleId` sembrado, como selectedCustomStyleFrom).
function catalogStyle(id, overrides = {}) {
  return {
    styleId: id,
    catalogStyleId: id,
    name: `Estilo ${id}`,
    systemPrompt: '',
    shots: [],
    sections: { visualStyle: `Visual de ${id}` },
    templateVersion: 1,
    colorFilter: 'none',
    character: { mode: 'none' },
    ...overrides,
  }
}

// 2D Mono como lo trae el catálogo: con su personaje escrito (la sección
// `character`), en el modo con que se generó su historia.
const MONO_WITH_CHARACTER = catalogStyle('2d-mono', {
  sections: {
    visualStyle: 'Visual de 2d-mono',
    character: 'Un mono gris dibujado a mano alzada',
  },
  character: { mode: 'generic' },
})

function gemStyle(styleId) {
  return { styleId, name: styleId, systemPrompt: 'Prompt', shots: [] }
}

const JARDINERIA = gemStyle('demo-jardineria')
const STORYTELLING = gemStyle('demo-storytelling')

// El formulario de Crear con la forma de CreateFormValue.
const BASE_FORM = {
  name: '',
  narrationMode: 'own-audio',
  script: '',
  narrationFilePath: null,
  styleId: 'normal',
  styleSource: 'custom',
  customStyle: STORYTELLING,
  promptModel: null,
  sceneCount: 0,
  secondsPerScene: 5,
  animateScenes: false,
  animateWholeVideo: false,
  animationMinutes: 1,
  useAvatar: false,
  avatar: null,
  avatarAppearances: 3,
  avatarSecondsPerAppearance: 6,
  avatarStartsVideo: true,
  avatarThreeInTwoMinutes: false,
  avatarEngine: 'avatar_iii',
  avatarExpressive: false,
  imageProvider: 'evolink',
  imageQuality: 'calidad-16-9',
  voice: null,
  voiceSettings: {},
  characters: [],
  withdrawnCharacters: [],
  characterFrequency: 'auto',
  useBgm: true,
  bgmMode: 'youtube',
  bgmUrl: '',
  bgmPrompt: '',
  bgmInstrumental: true,
  useOverlay: true,
  overlayUrl: '',
  confirmScenes: true,
  confirmSceneDuration: true,
  subtitles: false,
  autoRender: false,
  videoFormat: '16:9',
}

function form(overrides = {}) {
  return { ...BASE_FORM, ...overrides }
}

// Una tarjeta de la lista del catálogo (la galería usa CatalogGem; acá basta
// el id).
function listed(...ids) {
  return ids.map((id) => ({ id, name: { es: `Estilo ${id}` } }))
}

test('la galería del Catálogo ofrece los estilos con historia en el formato, en el orden del manifest', () => {
  assert.deepEqual(demoCatalogIds(MANIFEST, '16:9'), [
    'normal',
    '2d-mono',
    'cosmos',
  ])
  assert.deepEqual(demoCatalogIds(MANIFEST, '9:16'), ['cosmos', 'normal'])
  // Un formato que el pack no trae no ofrece nada (queda en «Próximamente»).
  assert.deepEqual(demoCatalogIds(LANDSCAPE_ONLY, '9:16'), [])
})

test('Mi estilo ofrece solo las gemas del pack del formato, por su id sembrado: en Short no está Jardinería', () => {
  assert.deepEqual(demoGemStyleIds(MANIFEST, '16:9'), [
    'demo-storytelling',
    'demo-jardineria',
  ])
  assert.deepEqual(demoGemStyleIds(MANIFEST, '9:16'), ['demo-storytelling'])
  // Una historia de gema sin su gema en `gems` no se ofrece.
  const orphan = {
    ...MANIFEST,
    gems: [JARDINERIA_GEM],
  }
  assert.deepEqual(demoGemStyleIds(orphan, '16:9'), ['demo-jardineria'])
  assert.deepEqual(demoGemStyleIds(LANDSCAPE_ONLY, '9:16'), [])
})

test('el avatar de la demo es el de la gema cuya historia lo trae; sin ninguna, no hay', () => {
  assert.deepEqual(demoAvatarGem(MANIFEST), JARDINERIA_GEM)
  assert.deepEqual(demoAvatar(MANIFEST), AVATAR)
  assert.equal(demoAvatarGem(LANDSCAPE_ONLY), null)
  assert.equal(demoAvatar(LANDSCAPE_ONLY), null)
})

test('encender el avatar desde Catálogo en Short lleva a Mi estilo con Jardinería y a 16:9 (foco 2)', () => {
  const short = form({
    styleSource: 'catalog',
    customStyle: catalogStyle('cosmos'),
    videoFormat: '9:16',
  })
  assert.deepEqual(demoAvatarToggle(MANIFEST, short, true, JARDINERIA), {
    useAvatar: true,
    styleSource: 'custom',
    customStyle: JARDINERIA,
    videoFormat: '16:9',
  })
  // En 16:9 se queda en 16:9; desde Mi estilo, también cambia la gema.
  const landscape = form({ styleSource: 'custom', customStyle: STORYTELLING })
  assert.deepEqual(demoAvatarToggle(MANIFEST, landscape, true, JARDINERIA), {
    useAvatar: true,
    styleSource: 'custom',
    customStyle: JARDINERIA,
    videoFormat: '16:9',
  })
})

test('sin avatar en el pack, el switch no cambia nada', () => {
  assert.deepEqual(
    demoAvatarToggle(LANDSCAPE_ONLY, form(), true, JARDINERIA),
    {},
  )
})

test('con el avatar encendido, pedir otro estilo vuelve a Jardinería en Mi estilo y avisa', () => {
  const on = form({
    useAvatar: true,
    styleSource: 'custom',
    customStyle: JARDINERIA,
  })
  const redirected = {
    patch: {
      useAvatar: true,
      styleSource: 'custom',
      customStyle: JARDINERIA,
      videoFormat: '16:9',
    },
    redirected: true,
  }
  // Una tarjeta del catálogo (la que la pestaña Catálogo tenía guardada).
  assert.deepEqual(
    demoStyleRequest(
      MANIFEST,
      on,
      { styleSource: 'catalog', customStyle: catalogStyle('2d-mono') },
      JARDINERIA,
    ),
    redirected,
  )
  // La pestaña Catálogo sin nada guardado.
  assert.deepEqual(
    demoStyleRequest(
      MANIFEST,
      on,
      { styleSource: 'catalog', customStyle: null },
      JARDINERIA,
    ),
    redirected,
  )
  // La otra gema de Mi estilo.
  assert.deepEqual(
    demoStyleRequest(
      MANIFEST,
      on,
      { styleSource: 'custom', customStyle: STORYTELLING },
      JARDINERIA,
    ),
    redirected,
  )
})

test('con el avatar encendido, pedir Jardinería pasa tal cual y sin aviso', () => {
  const on = form({
    useAvatar: true,
    styleSource: 'custom',
    customStyle: JARDINERIA,
  })
  const clicked = gemStyle('demo-jardineria')
  const request = demoStyleRequest(
    MANIFEST,
    on,
    { styleSource: 'custom', customStyle: clicked },
    JARDINERIA,
  )
  assert.equal(request.redirected, false)
  assert.equal(request.patch.customStyle, clicked)
  assert.equal(request.patch.styleSource, 'custom')
})

test('con el avatar apagado, elegir Jardinería lo enciende; otro estilo pasa tal cual', () => {
  const off = form({
    styleSource: 'custom',
    customStyle: STORYTELLING,
  })
  const clicked = gemStyle('demo-jardineria')
  const jardineria = demoStyleRequest(
    MANIFEST,
    off,
    { styleSource: 'custom', customStyle: clicked },
    JARDINERIA,
  )
  assert.equal(jardineria.redirected, false)
  assert.deepEqual(jardineria.patch, {
    useAvatar: true,
    styleSource: 'custom',
    customStyle: clicked,
    videoFormat: '16:9',
  })
  // Lo pedido manda: el snapshot de la tarjeta tocada, no el de la lista.
  assert.equal(jardineria.patch.customStyle, clicked)

  const catalog = {
    styleSource: 'catalog',
    customStyle: catalogStyle('2d-mono'),
  }
  assert.deepEqual(demoStyleRequest(MANIFEST, off, catalog, JARDINERIA), {
    patch: catalog,
    redirected: false,
  })
  const storytelling = { styleSource: 'custom', customStyle: STORYTELLING }
  assert.deepEqual(demoStyleRequest(MANIFEST, off, storytelling, JARDINERIA), {
    patch: storytelling,
    redirected: false,
  })
  // Sin avatar en el pack, nada enciende el switch.
  assert.deepEqual(
    demoStyleRequest(
      LANDSCAPE_ONLY,
      off,
      { styleSource: 'custom', customStyle: null },
      null,
    ),
    { patch: { styleSource: 'custom', customStyle: null }, redirected: false },
  )
})

test('apagar el avatar con Jardinería vuelve a la pestaña Catálogo sin tarjeta; con otra cosa, solo lo apaga', () => {
  const on = form({
    useAvatar: true,
    styleSource: 'custom',
    customStyle: JARDINERIA,
  })
  assert.deepEqual(demoAvatarToggle(MANIFEST, on, false, JARDINERIA), {
    useAvatar: false,
    styleSource: 'catalog',
    customStyle: null,
  })
  // Encendido con otra cosa elegida (un estado al que los pedidos de la demo
  // ya no llevan): solo se apaga.
  const withoutGem = form({
    useAvatar: true,
    styleSource: 'custom',
    customStyle: null,
  })
  assert.deepEqual(demoAvatarToggle(MANIFEST, withoutGem, false, JARDINERIA), {
    useAvatar: false,
  })
})

test('sin la gema del avatar en Mi estilo, encender el switch no hace nada', () => {
  // La lista de Mi estilo todavía no la trae, o la persona la borró en esta
  // visita: no hay historia con avatar que elegir y el formulario sigue como
  // estaba.
  assert.deepEqual(
    demoAvatarToggle(
      MANIFEST,
      form({ styleSource: 'catalog', customStyle: catalogStyle('cosmos') }),
      true,
      null,
    ),
    {},
  )
})

test('con el avatar encendido y sin gema a la que volver, el pedido pasa y el switch se apaga, sin aviso', () => {
  const on = form({
    useAvatar: true,
    styleSource: 'custom',
    customStyle: JARDINERIA,
  })
  assert.deepEqual(
    demoStyleRequest(
      MANIFEST,
      on,
      { styleSource: 'custom', customStyle: STORYTELLING },
      null,
    ),
    {
      patch: {
        styleSource: 'custom',
        customStyle: STORYTELLING,
        useAvatar: false,
      },
      redirected: false,
    },
  )
  assert.deepEqual(
    demoStyleRequest(
      MANIFEST,
      on,
      { styleSource: 'catalog', customStyle: null },
      null,
    ),
    {
      patch: { styleSource: 'catalog', customStyle: null, useAvatar: false },
      redirected: false,
    },
  )
})

test('quitar la tarjeta en uso con el avatar encendido (se borró la gema) apaga el switch, sin aviso', () => {
  // Borrar la gema en uso la deselecciona en la misma pestaña; la lista
  // todavía puede traerla (la relectura no llegó): no se vuelve a ella.
  const on = form({
    useAvatar: true,
    styleSource: 'custom',
    customStyle: JARDINERIA,
  })
  assert.deepEqual(
    demoStyleRequest(
      MANIFEST,
      on,
      { styleSource: 'custom', customStyle: null },
      JARDINERIA,
    ),
    {
      patch: { styleSource: 'custom', customStyle: null, useAvatar: false },
      redirected: false,
    },
  )
})

test('una tarjeta guardada sin historia en el formato actual no se elige: la pestaña queda sin tarjeta', () => {
  // 2D Mono elegido en 16:9, guardado al pasar a Mi estilo; ya en Short, se
  // vuelve a Catálogo: 2D Mono no tiene Short. La pestaña queda sin tarjeta y
  // Crear usa la primera de la galería.
  const short = form({
    styleSource: 'custom',
    customStyle: STORYTELLING,
    videoFormat: '9:16',
  })
  assert.deepEqual(
    demoStyleRequest(
      MANIFEST,
      short,
      { styleSource: 'catalog', customStyle: catalogStyle('2d-mono') },
      JARDINERIA,
    ),
    { patch: { styleSource: 'catalog', customStyle: null }, redirected: false },
  )
  // Una con historia en el formato pasa tal cual.
  const cosmos = { styleSource: 'catalog', customStyle: catalogStyle('cosmos') }
  assert.deepEqual(demoStyleRequest(MANIFEST, short, cosmos, JARDINERIA), {
    patch: cosmos,
    redirected: false,
  })
  // Con el switch apagado en 16:9, pasar a Catálogo con 2D Mono sigue igual.
  const landscape = form({ styleSource: 'custom', customStyle: STORYTELLING })
  const mono = { styleSource: 'catalog', customStyle: catalogStyle('2d-mono') }
  assert.deepEqual(demoStyleRequest(MANIFEST, landscape, mono, JARDINERIA), {
    patch: mono,
    redirected: false,
  })
})

test('«Próximamente»: el formato donde la historia elegida no existe', () => {
  // Jardinería (con el switch como esté) y el switch encendido: Short.
  assert.deepEqual(
    demoComingSoonFormats(
      MANIFEST,
      form({ styleSource: 'custom', customStyle: JARDINERIA }),
    ),
    ['9:16'],
  )
  assert.deepEqual(
    demoComingSoonFormats(
      MANIFEST,
      form({ styleSource: 'custom', customStyle: JARDINERIA, useAvatar: true }),
    ),
    ['9:16'],
  )
  assert.deepEqual(
    demoComingSoonFormats(
      MANIFEST,
      form({ styleSource: 'custom', customStyle: null, useAvatar: true }),
    ),
    ['9:16'],
  )
  // Un estilo con historia en los dos formatos: ninguno.
  assert.deepEqual(
    demoComingSoonFormats(
      MANIFEST,
      form({ styleSource: 'catalog', customStyle: catalogStyle('normal') }),
    ),
    [],
  )
  assert.deepEqual(
    demoComingSoonFormats(
      MANIFEST,
      form({ styleSource: 'custom', customStyle: STORYTELLING }),
    ),
    [],
  )
  // Uno sin historia en Short (2D Mono), o un pack sin Short.
  assert.deepEqual(
    demoComingSoonFormats(
      MANIFEST,
      form({ styleSource: 'catalog', customStyle: catalogStyle('2d-mono') }),
    ),
    ['9:16'],
  )
  assert.deepEqual(
    demoComingSoonFormats(
      LANDSCAPE_ONLY,
      form({ styleSource: 'catalog', customStyle: catalogStyle('normal') }),
    ),
    ['9:16'],
  )
  // Sin tarjeta elegida (la galería todavía carga): los formatos que traen
  // historias de la pestaña.
  assert.deepEqual(
    demoComingSoonFormats(
      MANIFEST,
      form({ styleSource: 'catalog', customStyle: null }),
    ),
    [],
  )
  assert.deepEqual(
    demoComingSoonFormats(
      LANDSCAPE_ONLY,
      form({ styleSource: 'custom', customStyle: null }),
    ),
    ['9:16'],
  )
})

test('«Próximamente» recorre todos los formatos del contrato', () => {
  // Un pack sin historias deja todos los formatos en «Próximamente»: la lista
  // de la demo no se separa de los formatos que existen.
  const empty = { ...MANIFEST, gems: [], stories: {} }
  assert.deepEqual(
    [
      ...demoComingSoonFormats(
        empty,
        form({ styleSource: 'catalog', customStyle: null }),
      ),
    ].sort(),
    Object.keys(FRAME_SIZES).sort(),
  )
})

test('la historia de lo elegido: la del estilo del catálogo o la de la gema, en el formato del formulario', () => {
  assert.equal(
    demoEntryFor(
      MANIFEST,
      form({ styleSource: 'catalog', customStyle: catalogStyle('cosmos') }),
    ),
    MANIFEST.stories['16:9'].styles[2],
  )
  assert.equal(
    demoEntryFor(
      MANIFEST,
      form({
        styleSource: 'catalog',
        customStyle: catalogStyle('cosmos'),
        videoFormat: '9:16',
      }),
    ),
    MANIFEST.stories['9:16'].styles[0],
  )
  assert.equal(
    demoEntryFor(
      MANIFEST,
      form({ styleSource: 'custom', customStyle: JARDINERIA }),
    ),
    MANIFEST.stories['16:9'].gems[1],
  )
})

test('sin historia para lo elegido no hay entrada: un estilo que el pack no trae, otro formato o nada elegido (foco 3)', () => {
  // Un estilo del catálogo que el manifest no trae (sumado al catálogo
  // después de armar el pack): la galería no lo ofrece.
  assert.equal(
    demoEntryFor(
      MANIFEST,
      form({ styleSource: 'catalog', customStyle: catalogStyle('nuevo') }),
    ),
    null,
  )
  // Uno que el pack trae, pero no en este formato.
  assert.equal(
    demoEntryFor(
      MANIFEST,
      form({
        styleSource: 'catalog',
        customStyle: catalogStyle('2d-mono'),
        videoFormat: '9:16',
      }),
    ),
    null,
  )
  assert.equal(
    demoEntryFor(
      MANIFEST,
      form({
        styleSource: 'custom',
        customStyle: JARDINERIA,
        videoFormat: '9:16',
      }),
    ),
    null,
  )
  // Una gema propia que no es del pack.
  assert.equal(
    demoEntryFor(
      MANIFEST,
      form({ styleSource: 'custom', customStyle: gemStyle('st-mia') }),
    ),
    null,
  )
  // Nada elegido, o una selección en la pestaña equivocada.
  assert.equal(
    demoEntryFor(MANIFEST, form({ styleSource: 'catalog', customStyle: null })),
    null,
  )
  assert.equal(
    demoEntryFor(
      MANIFEST,
      form({ styleSource: 'catalog', customStyle: JARDINERIA }),
    ),
    null,
  )
  assert.equal(
    demoEntryFor(
      MANIFEST,
      form({ styleSource: 'custom', customStyle: catalogStyle('normal') }),
    ),
    null,
  )
})

test('la galería del Catálogo muestra los de la lista con historia en el formato, en el orden de la lista: eso cuenta el texto de la pestaña (foco 3)', () => {
  const ids = (gems) => gems.map((gem) => gem.id)
  // La lista trae todo: los 3 del pack, en el orden de la lista.
  assert.deepEqual(
    ids(
      demoVisibleCatalogGems(
        MANIFEST,
        '16:9',
        listed('cosmos', 'normal', '2d-mono'),
      ),
    ),
    ['cosmos', 'normal', '2d-mono'],
  )
  // Un id del pack que la lista no trae (2d-mono) no está, y uno de la lista
  // sin historia (nuevo), tampoco: el texto dice 2, no 3.
  assert.deepEqual(
    ids(
      demoVisibleCatalogGems(
        MANIFEST,
        '16:9',
        listed('normal', 'nuevo', 'cosmos'),
      ),
    ),
    ['normal', 'cosmos'],
  )
  // En Short, solo los que tienen historia en Short.
  assert.deepEqual(
    ids(
      demoVisibleCatalogGems(
        MANIFEST,
        '9:16',
        listed('normal', '2d-mono', 'cosmos'),
      ),
    ),
    ['normal', 'cosmos'],
  )
  // Con la lista cargando, ninguno.
  assert.deepEqual(demoVisibleCatalogGems(MANIFEST, '16:9', []), [])
})

test('la pestaña Catálogo sin tarjeta usa la primera de la galería: un id del pack que la lista no trae se omite (foco 3)', () => {
  const unselected = form({ styleSource: 'catalog', customStyle: null })
  // La lista trae todo: el primero del pack.
  assert.deepEqual(
    demoDefaultCatalogGem(
      MANIFEST,
      unselected,
      listed('normal', '2d-mono', 'cosmos'),
    )?.id,
    'normal',
  )
  // La lista no trae el primero del pack (se ocultó del catálogo) y sí uno
  // nuevo que el pack no trae: queda el primero que la galería muestra.
  assert.deepEqual(
    demoDefaultCatalogGem(
      MANIFEST,
      unselected,
      listed('nuevo', '2d-mono', 'cosmos'),
    )?.id,
    '2d-mono',
  )
  // En el orden de la lista, que es el de la galería.
  assert.deepEqual(
    demoDefaultCatalogGem(MANIFEST, unselected, listed('cosmos', 'normal'))?.id,
    'cosmos',
  )
  // En Short, solo los que tienen historia en Short.
  assert.deepEqual(
    demoDefaultCatalogGem(
      MANIFEST,
      form({ styleSource: 'catalog', customStyle: null, videoFormat: '9:16' }),
      listed('2d-mono', 'normal'),
    )?.id,
    'normal',
  )
})

test('sin lista, con una tarjeta elegida o en Mi estilo no se deriva ninguna', () => {
  const unselected = form({ styleSource: 'catalog', customStyle: null })
  // La lista todavía carga: nada elegido (el envío se frena).
  assert.equal(demoDefaultCatalogGem(MANIFEST, unselected, []), null)
  // Ningún estilo de la lista tiene historia.
  assert.equal(
    demoDefaultCatalogGem(MANIFEST, unselected, listed('nuevo')),
    null,
  )
  assert.equal(
    demoDefaultCatalogGem(
      MANIFEST,
      form({ styleSource: 'catalog', customStyle: catalogStyle('cosmos') }),
      listed('normal', 'cosmos'),
    ),
    null,
  )
  assert.equal(
    demoDefaultCatalogGem(
      MANIFEST,
      form({ styleSource: 'custom', customStyle: null }),
      listed('normal', 'cosmos'),
    ),
    null,
  )
})

test('nombre, guion, escenas y audio siguen a la historia elegida', () => {
  const current = form({
    styleSource: 'catalog',
    customStyle: catalogStyle('normal'),
    name: 'Mi nombre',
  })
  const cosmos = MANIFEST.stories['16:9'].styles[2]
  const expected = {
    name: cosmos.suggestedName,
    script: cosmos.script,
    sceneCount: cosmos.sceneCount,
    narrationFilePath: cosmos.audioFile,
  }
  assert.deepEqual(
    demoFollowStyle(MANIFEST, current, { customStyle: catalogStyle('cosmos') }),
    expected,
  )
  // Cambiar de formato con el mismo estilo trae la historia de ese formato.
  const shortCosmos = MANIFEST.stories['9:16'].styles[0]
  assert.deepEqual(
    demoFollowStyle(
      MANIFEST,
      form({ styleSource: 'catalog', customStyle: catalogStyle('cosmos') }),
      { videoFormat: '9:16' },
    ),
    {
      name: shortCosmos.suggestedName,
      script: shortCosmos.script,
      sceneCount: shortCosmos.sceneCount,
      narrationFilePath: shortCosmos.audioFile,
    },
  )
  // Pasar a Mi estilo con Jardinería.
  const jardineria = MANIFEST.stories['16:9'].gems[1]
  assert.equal(
    demoFollowStyle(MANIFEST, current, {
      styleSource: 'custom',
      customStyle: JARDINERIA,
    }).narrationFilePath,
    jardineria.audioFile,
  )
})

test('sin historia, o con un cambio que no es de estilo, pestaña ni formato, la historia no se toca', () => {
  const current = form({
    styleSource: 'catalog',
    customStyle: catalogStyle('normal'),
  })
  assert.deepEqual(demoFollowStyle(MANIFEST, current, { name: 'Otro' }), {})
  assert.deepEqual(
    demoFollowStyle(MANIFEST, current, { customStyle: catalogStyle('nuevo') }),
    {},
  )
  // Apagar el avatar con Jardinería: la pestaña Catálogo sin tarjeta no trae
  // historia (Crear la deriva con la primera de la galería).
  assert.deepEqual(
    demoFollowStyle(
      MANIFEST,
      form({ useAvatar: true, styleSource: 'custom', customStyle: JARDINERIA }),
      { useAvatar: false, styleSource: 'catalog', customStyle: null },
    ),
    {},
  )
})

test('la misma historia otra vez no pisa lo que la persona escribió', () => {
  // La misma tarjeta elegida de nuevo (otro snapshot del mismo estilo).
  const edited = form({
    styleSource: 'catalog',
    customStyle: catalogStyle('normal'),
    name: 'Mi propio nombre',
  })
  assert.deepEqual(
    demoFollowStyle(MANIFEST, edited, { customStyle: catalogStyle('normal') }),
    {},
  )
  // Un pedido que la demo rechaza con el avatar encendido vuelve a
  // Jardinería, que ya estaba: el nombre y el guion se quedan.
  const on = form({
    useAvatar: true,
    styleSource: 'custom',
    customStyle: JARDINERIA,
    name: 'Mi huerta',
  })
  const { patch } = demoStyleRequest(
    MANIFEST,
    on,
    { styleSource: 'custom', customStyle: STORYTELLING },
    JARDINERIA,
  )
  assert.deepEqual(demoFollowStyle(MANIFEST, on, patch), {})
})

test('el formulario inicial: la voz del pack, pestaña Catálogo sin tarjeta y la historia del primer estilo del formato', () => {
  const value = demoFormValue(form(), MANIFEST)
  const first = MANIFEST.stories['16:9'].styles[0]
  assert.equal(value.styleSource, 'catalog')
  assert.equal(value.customStyle, null)
  assert.deepEqual(value.voice, {
    provider: 'ai33',
    voiceId: 'elevenlabs_452WrNT9o8dphaYW5YGU',
    name: 'Abel',
  })
  assert.equal(value.narrationMode, 'tts')
  assert.equal(value.name, first.suggestedName)
  assert.equal(value.script, first.script)
  assert.equal(value.sceneCount, first.sceneCount)
  assert.equal(value.narrationFilePath, first.audioFile)
  // Sin pausas, sin música, sin capa ni personajes, exportando solo.
  assert.equal(value.confirmScenes, false)
  assert.equal(value.autoRender, true)
  assert.equal(value.useBgm, false)
  assert.equal(value.useOverlay, false)
  assert.deepEqual(value.characters, [])
  // El formato y su calidad los pone Create (la demo arranca en 16:9).
  assert.equal(value.videoFormat, '16:9')
  assert.equal(value.imageQuality, 'calidad-16-9')
  assert.equal(value.useAvatar, false)

  // En el formato de la base, con su primera historia.
  const short = demoFormValue(form({ videoFormat: '9:16' }), MANIFEST)
  assert.equal(short.name, MANIFEST.stories['9:16'].styles[0].suggestedName)

  // El modelo de prompts es el predeterminado de la casa (la única tarjeta
  // que muestra la demo), no el que la persona eligió en Ajustes: lo que se
  // ve es lo que viaja.
  assert.equal(
    demoFormValue(form({ promptModel: 'modelo-de-ajustes' }), MANIFEST)
      .promptModel,
    null,
  )
})

test('el audio de «Subir mi audio» se nombra con la historia que lo trae', () => {
  const jardineria = MANIFEST.stories['16:9'].gems[1]
  assert.equal(
    demoAudioFileLabel(
      MANIFEST,
      form({ narrationFilePath: jardineria.audioFile }),
    ),
    `${jardineria.suggestedName}.mp3`,
  )
  const shortNormal = MANIFEST.stories['9:16'].styles[1]
  assert.equal(
    demoAudioFileLabel(
      MANIFEST,
      form({ narrationFilePath: shortNormal.audioFile }),
    ),
    `${shortNormal.suggestedName}.mp3`,
  )
  // Un audio que no es del pack: sin nombre (se muestra el del archivo).
  assert.equal(
    demoAudioFileLabel(MANIFEST, form({ narrationFilePath: '/otro.mp3' })),
    undefined,
  )
})

test('el modo de personaje de un estilo del catálogo es el de su historia, en el formato', () => {
  // Spec demo v4 §1: el personaje del estilo en los que tienen personaje
  // fijo (2D Mono) y ninguno en el resto, nunca el recordado ni el de las
  // muestras: la historia ya se generó así.
  assert.deepEqual(demoCatalogCharacter(MANIFEST, '16:9', '2d-mono'), {
    mode: 'generic',
  })
  assert.deepEqual(demoCatalogCharacter(MANIFEST, '16:9', 'cosmos'), {
    mode: 'none',
  })
  assert.deepEqual(demoCatalogCharacter(MANIFEST, '9:16', 'normal'), {
    mode: 'none',
  })
  // Sin historia en el formato (la galería no lo ofrece): sin personaje.
  assert.deepEqual(demoCatalogCharacter(MANIFEST, '9:16', '2d-mono'), {
    mode: 'none',
  })
  assert.deepEqual(demoCatalogCharacter(MANIFEST, '16:9', 'nuevo'), {
    mode: 'none',
  })
})

test('la sección de personajes solo se ve con la historia de un estilo con personaje fijo', () => {
  // 2D Mono con su personaje escrito y su historia generada con él: el chip.
  assert.equal(
    demoShowsCharacterSection(
      MANIFEST,
      form({ styleSource: 'catalog', customStyle: MONO_WITH_CHARACTER }),
    ),
    true,
  )
  // Una historia sin personaje (cosmos), aunque la gema dijera otra cosa.
  assert.equal(
    demoShowsCharacterSection(
      MANIFEST,
      form({
        styleSource: 'catalog',
        customStyle: catalogStyle('cosmos', {
          sections: { visualStyle: 'Visual', character: 'Alguien' },
          character: { mode: 'generic' },
        }),
      }),
    ),
    false,
  )
  // Una historia con personaje y una gema que no lo trae escrito: la gema
  // vieja del pack (Storytelling, sin secciones) o un estilo sin la sección.
  assert.equal(
    demoShowsCharacterSection(
      MANIFEST,
      form({ styleSource: 'custom', customStyle: STORYTELLING }),
    ),
    false,
  )
  assert.equal(
    demoShowsCharacterSection(
      MANIFEST,
      form({
        styleSource: 'catalog',
        customStyle: catalogStyle('2d-mono', {
          character: { mode: 'generic' },
        }),
      }),
    ),
    false,
  )
  // Jardinería (sin personaje), nada elegido o sin historia en el formato.
  assert.equal(
    demoShowsCharacterSection(
      MANIFEST,
      form({ styleSource: 'custom', customStyle: JARDINERIA }),
    ),
    false,
  )
  assert.equal(
    demoShowsCharacterSection(
      MANIFEST,
      form({ styleSource: 'catalog', customStyle: null }),
    ),
    false,
  )
  assert.equal(
    demoShowsCharacterSection(
      MANIFEST,
      form({
        styleSource: 'catalog',
        customStyle: MONO_WITH_CHARACTER,
        videoFormat: '9:16',
      }),
    ),
    false,
  )
})

test('el switch de animación se ofrece solo con una historia animada', () => {
  assert.equal(
    demoAnimationAvailable(
      MANIFEST,
      form({ styleSource: 'catalog', customStyle: catalogStyle('cosmos') }),
    ),
    true,
  )
  assert.equal(
    demoAnimationAvailable(
      MANIFEST,
      form({ styleSource: 'custom', customStyle: JARDINERIA }),
    ),
    true,
  )
  // La historia Short de cosmos no trae su variante animada.
  assert.equal(
    demoAnimationAvailable(
      MANIFEST,
      form({
        styleSource: 'catalog',
        customStyle: catalogStyle('cosmos'),
        videoFormat: '9:16',
      }),
    ),
    false,
  )
  // Una tarjeta sin historia en el formato, tampoco.
  assert.equal(
    demoAnimationAvailable(
      MANIFEST,
      form({
        styleSource: 'catalog',
        customStyle: catalogStyle('2d-mono'),
        videoFormat: '9:16',
      }),
    ),
    false,
  )
  // Sin tarjeta (la galería todavía carga), como los formatos: si la pestaña
  // trae alguna historia animada en el formato, sin parpadear «Próximamente».
  assert.equal(
    demoAnimationAvailable(
      MANIFEST,
      form({ styleSource: 'catalog', customStyle: null, videoFormat: '9:16' }),
    ),
    true,
  )
  const stillShort = {
    ...MANIFEST,
    stories: {
      ...MANIFEST.stories,
      '9:16': {
        styles: [story('cosmos', '9:16', { animated: false })],
        gems: [],
      },
    },
  }
  assert.equal(
    demoAnimationAvailable(
      stillShort,
      form({ styleSource: 'catalog', customStyle: null, videoFormat: '9:16' }),
    ),
    false,
  )
  assert.equal(
    demoAnimationAvailable(
      stillShort,
      form({ styleSource: 'custom', customStyle: null, videoFormat: '9:16' }),
    ),
    false,
  )
})

test('sin historia animada, la animación se valida y se envía apagada y la elección queda', () => {
  // Encendida con cosmos en 16:9 (animada): el mismo formulario.
  const landscape = form({
    styleSource: 'catalog',
    customStyle: catalogStyle('cosmos'),
    animateScenes: true,
  })
  assert.equal(withDemoAnimation(MANIFEST, landscape), landscape)
  // En Short (sin variante animada): apagada en lo que se valida y se envía.
  const short = { ...landscape, videoFormat: '9:16' }
  const shown = withDemoAnimation(MANIFEST, short)
  assert.equal(shown.animateScenes, false)
  assert.deepEqual({ ...shown, animateScenes: true }, short)
  // El formulario guardado no cambia: de vuelta en 16:9 sigue encendida.
  assert.equal(short.animateScenes, true)
  // Apagada, nada que apagar: el mismo objeto.
  const off = { ...short, animateScenes: false }
  assert.equal(withDemoAnimation(MANIFEST, off), off)
})

// Un formulario de la demo que se puede enviar: nombre, guion, voz, la
// tarjeta del catálogo y nada de música ni capa.
function sendableDemoForm(overrides = {}) {
  return form({
    name: 'Historia de la demo',
    narrationMode: 'tts',
    script: 'Había una vez un mono.',
    voice: { provider: 'ai33', voiceId: 'voz-abel', name: 'Abel' },
    styleSource: 'catalog',
    customStyle: MONO_WITH_CHARACTER,
    useBgm: false,
    useOverlay: false,
    ...overrides,
  })
}

const pickAnimation = (options) => ({
  animationMinutes: options.animationMinutes,
  animateWholeVideo: options.animateWholeVideo,
})

test('en la demo la animación encendida viaja con el primer minuto, igual que fuera de ella', () => {
  // Un borrador viejo con N minutos o el video completo: el formulario solo
  // encarga el primer minuto, también en la demo.
  const animated = sendableDemoForm({
    animateScenes: true,
    animationMinutes: 4,
    animateWholeVideo: true,
  })
  const demo = app.createProjectPayload(animated, { demo: true })
  assert.equal(demo.options.demo, true)
  assert.equal(app.ANIMATION_MINUTES_DEFAULT, 1)
  assert.deepEqual(pickAnimation(demo.options), {
    animationMinutes: app.ANIMATION_MINUTES_DEFAULT,
    animateWholeVideo: false,
  })
  assert.deepEqual(
    pickAnimation(demo.options),
    pickAnimation(app.createProjectPayload(animated).options),
  )
  // Apagada no viaja.
  const still = app.createProjectPayload(
    sendableDemoForm({ animateScenes: false }),
    { demo: true },
  )
  assert.equal('animationMinutes' in still.options, false)
  assert.equal('animateWholeVideo' in still.options, false)
})

test('en la demo el avatar encendido no viaja: lo trae la historia', () => {
  const withAvatar = sendableDemoForm({
    styleSource: 'custom',
    customStyle: JARDINERIA,
    useAvatar: true,
    avatar: {
      id: 'ana-1',
      name: 'Ana',
      lookId: 'look-ana',
      lookName: 'Ana oficina',
      lookType: 'photo_avatar',
      supportedEngines: ['avatar_iii', 'avatar_iv'],
      motionReference: false,
    },
  })
  const payload = app.createProjectPayload(withAvatar, { demo: true })
  assert.equal(payload.options.demo, true)
  assert.equal(payload.options.avatar, undefined)
})

test('en la demo formBlockers no frena por la clave de Kie, los modelos bloqueados ni los personajes', () => {
  // Spec demo v4 §2 y ruling R27: la historia ya está hecha y la simulación
  // no escribe prompts, no anima con Kie ni usa personajes.
  const context = {
    newCatalog: true,
    animationKeyMissing: true,
    promptModelsBlocked: true,
    fixedCharacterMissing: true,
  }
  const animated = sendableDemoForm({ animateScenes: true })
  assert.deepEqual(app.formBlockers(animated, { ...context, demo: true }), [])
  // Fuera de la demo los tres frenan: el contexto no es inocuo.
  assert.deepEqual(app.formBlockers(animated, context), [
    'create.validation.animationKeyRequired',
    'create.validation.promptModelsBlocked',
    'create.validation.fixedCharacterMissing',
  ])
  // «Mi personaje» sin ninguno elegido: fuera de la demo pide uno.
  const ownWithout = sendableDemoForm({
    customStyle: { ...MONO_WITH_CHARACTER, character: { mode: 'own' } },
    characters: [],
  })
  assert.deepEqual(app.formBlockers(ownWithout, { newCatalog: true }), [
    'create.validation.characterRequired',
  ])
  assert.deepEqual(
    app.formBlockers(ownWithout, { newCatalog: true, demo: true }),
    [],
  )
  // Lo que la demo sí pide sigue: sin tarjeta no hay historia.
  assert.deepEqual(
    app.formBlockers(sendableDemoForm({ customStyle: null }), {
      ...context,
      demo: true,
    }),
    ['create.validation.catalogStyleRequired'],
  )
})

test('una corrida de la demo no anota apariciones del avatar cobradas: ni «Cancelar» ni «Crear otro» avisan (R28)', () => {
  // La simulación imita las fases del render de HeyGen (render, download,
  // normalize), pero el avatar sale del pack y nadie lo cobra.
  const progress = (sceneId, phase) => ({
    type: 'avatar-scene-progress',
    sceneId,
    phase,
    elapsedSeconds: 3,
  })
  const ready = (sceneId) => ({
    type: 'avatar-scene-ready',
    sceneId,
    scene: { id: sceneId, text: '', imageStatus: 'ok' },
  })
  const events = [
    { type: 'avatar-scene-started', sceneId: 2 },
    progress(2, 'audio'),
    progress(2, 'upload'),
    progress(2, 'render'),
    progress(2, 'download'),
    progress(2, 'normalize'),
    ready(2),
  ]
  const charged = (task) =>
    events.reduce(
      (sceneIds, event) =>
        app.chargedSceneIdsForTask(
          { ...task, avatarChargedSceneIds: sceneIds },
          event,
        ),
      [],
    )
  assert.deepEqual(charged({ demo: true }), [])
  // Fuera de la demo, la misma corrida sí cobra la aparición.
  assert.deepEqual(charged({}), [2])
  assert.deepEqual(charged({ demo: false }), [2])
  // Sin cobradas, el aviso de «Cancelar» y de «Crear otro» no se abre.
  const generating = {
    id: 2,
    text: '',
    imageStatus: 'ok',
    avatarActivity: {
      status: 'generating',
      phase: 'render',
      elapsedSeconds: 3,
      receivedAt: 1,
    },
  }
  const inFlight = (task) =>
    app.chargedAvatarScenesInFlight({
      scenes: [generating],
      avatarChargedSceneIds: app.chargedSceneIdsForTask(
        { ...task, avatarChargedSceneIds: [] },
        progress(2, 'render'),
      ),
    })
  assert.equal(inFlight({ demo: true }), 0)
  assert.equal(inFlight({}), 1)
})
