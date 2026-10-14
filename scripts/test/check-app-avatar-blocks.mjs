// Las escenas de avatar en el editor (ADR-0057, spec §10.2–§10.3): qué bloque
// dibuja la pista (planeado, generando, listo, fallido —también un `ready`
// sin archivo— y desactualizado; ninguno si la escena no tiene tramo), que un
// clip de Kie, listo o generándose, nunca pisa a un avatar (pegado a él sí se
// dibuja), qué clip le pasa el visor a ClipPreviewVideo y con qué reglas (el
// del avatar, solo listo y al día, a velocidad 1 y con reajuste de 0,12 s;
// los de Kie como siempre; lo que el componente hace con ellas lo prueba
// check-clip-preview-video.mjs en Chrome), los fundidos en sus bordes y
// `clipAt` con los bordes del tramo. Empaqueta las utilidades reales de
// `src/` con esbuild y los alias de tsconfig.app.json, como
// check-timeline-layout.mjs; solo `videosApi` se simula (el real arrastra el
// cliente de Supabase, que exige variables de entorno al importarse) con lo
// único que llaman estas utilidades: las URLs del medio.
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const VIDEOS_API_FIXTURE =
  'export const videosApi = { videoSource: (path, version) => `media://${path}?v=${version}`, imageSource: (path, version) => `image://${path}?v=${version}` }'

let workdir
let blocks

before(async () => {
  const output = await build({
    stdin: {
      contents: [
        "export * from './src/modules/videos/utilities/avatarClips.ts'",
        "export * from './src/modules/videos/utilities/timelineBlocks.ts'",
        "export * from './src/modules/videos/utilities/timelineTransitionFrames.ts'",
        "export * from './src/modules/videos/utilities/playableClip.ts'",
        "export * from './src/modules/videos/utilities/clipDriftAction.ts'",
        "export * from './src/modules/videos/utilities/clipAt.ts'",
        "export { CLIP_PREVIEW_DRIFT_SECONDS } from './src/modules/videos/constants.ts'",
        "export { AVATAR_PREVIEW_RESYNC_SECONDS } from './pipeline/types/avatar.ts'",
        "export { ANIMATION_TRANSITION_FRAMES } from './pipeline/animation/timing.ts'",
      ].join('\n'),
      resolveDir: repoRoot,
      sourcefile: 'avatar-blocks-entry.ts',
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    tsconfig: join(repoRoot, 'tsconfig.app.json'),
    plugins: [
      {
        name: 'videos-api-fixture',
        setup(plugin) {
          plugin.onResolve({ filter: /^@\/modules\/videos\/api$/ }, () => ({
            path: 'videos-api',
            namespace: 'fixture',
          }))
          plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
            contents: VIDEOS_API_FIXTURE,
            loader: 'js',
          }))
        },
      },
    ],
  })
  workdir = await mkdtemp(join(tmpdir(), 'avatar-blocks-guard-'))
  const file = join(workdir, 'avatar-blocks.mjs')
  await writeFile(file, output.outputFiles[0].contents)
  blocks = await import(pathToFileURL(file).href)
})

after(async () => {
  if (workdir) await rm(workdir, { recursive: true, force: true })
})

// La vista de una escena de avatar tal como la arma el sidecar (tarea 1, §3.3).
const avatarView = (overrides = {}) => ({
  lookId: 'look-ana',
  lookName: 'Ana oficina',
  lookType: 'photo_avatar',
  engine: 'avatar_iii',
  origin: 'auto',
  status: 'ready',
  clipPath: '/p/avatar/scene_2.abcd1234.mp4',
  clipMtimeMs: 11,
  normalizedSeconds: 10,
  ...overrides,
})
const scene = (id, startSeconds, endSeconds, extra = {}) => ({
  id,
  text: `escena ${id}`,
  imageStatus: 'ok',
  imagePath: `/p/scenes/scene_${id}.jpg`,
  startSeconds,
  endSeconds,
  ...extra,
})
const kieClip = (sceneIds, slotSeconds) => ({
  id: 'clip-1',
  provider: 'kie',
  status: 'ready',
  sceneIds,
  slotSeconds,
  normalizedSeconds: slotSeconds,
  clipPath: '/p/clips/clip-1.mp4',
  clipMtimeMs: 5,
})
// Todos los estados del avatar entre escenas normales.
const MIXED = [
  scene(1, 0, 4),
  scene(2, 4, 14, { avatar: avatarView() }),
  scene(3, 14, 18),
  scene(4, 18, 28, {
    avatar: avatarView({ status: 'planned', clipPath: undefined }),
  }),
  scene(5, 28, 38, {
    avatar: avatarView({
      status: 'failed',
      clipPath: undefined,
      errorCode: 'avatar_render_failed',
    }),
  }),
  // Un `ready` cuyo archivo ya no está: se ve como fallido, como los clips.
  scene(6, 38, 48, { avatar: avatarView({ clipPath: undefined }) }),
  scene(7, 48, 58, { avatar: avatarView({ stale: true }) }),
  scene(8, 58, 68, {
    avatar: avatarView({ status: 'planned', clipPath: undefined }),
  }),
]
// El render de la escena 8 corre desde el editor (lo llenará la entrega 3).
const RENDERING = { 8: { startedAt: 1 } }

test('una escena de avatar es un bloque propio del largo de la escena, con su estado', () => {
  const result = blocks.timelineBlocks(MIXED, {}, RENDERING)
  assert.deepEqual(
    result.map((block) => [
      block.kind,
      block.startSeconds,
      block.endSeconds,
      block.state ?? null,
    ]),
    [
      ['scene', 0, 4, null],
      ['avatar', 4, 14, 'ready'],
      ['scene', 14, 18, null],
      ['avatar', 18, 28, 'planned'],
      ['avatar', 28, 38, 'failed'],
      ['avatar', 38, 48, 'failed'],
      ['avatar', 48, 58, 'stale'],
      ['avatar', 58, 68, 'generating'],
    ],
  )
  assert.equal(result[1].id, 'avatar-2')
  assert.equal(result[1].scene.id, 2)
  assert.equal(result[1].avatar.lookName, 'Ana oficina')
})

test('los bloques cubren la pista sin huecos ni claves repetidas', () => {
  const result = blocks.timelineBlocks(MIXED, {}, RENDERING)
  for (let index = 1; index < result.length; index++)
    assert.equal(result[index].startSeconds, result[index - 1].endSeconds)
  const keys = result.map(blocks.timelineBlockKey)
  assert.equal(new Set(keys).size, keys.length)
  assert.equal(keys[1], 'avatar-2')
})

test('sin avatar la pista sale como antes: el clip de Kie y el resto estático', () => {
  const kie = [
    scene(1, 0, 3, { animation: kieClip([1, 2], 6) }),
    scene(2, 3, 6),
    scene(3, 6, 9),
  ]
  assert.deepEqual(
    blocks
      .timelineBlocks(kie, {})
      .map((block) => [block.kind, block.startSeconds, block.endSeconds]),
    [
      ['clip', 0, 6],
      ['scene', 6, 9],
    ],
  )
})

test('un clip de Kie que pisa una escena de avatar no se dibuja: manda el avatar', () => {
  const legacy = [
    scene(1, 0, 3, { animation: kieClip([1, 2], 13) }),
    scene(2, 3, 13, { avatar: avatarView() }),
  ]
  assert.deepEqual(
    blocks
      .timelineBlocks(legacy, {})
      .map((block) => [block.kind, block.startSeconds, block.endSeconds]),
    [
      ['scene', 0, 3],
      ['avatar', 3, 13],
    ],
  )
})

test('un clip de Kie pegado a un avatar sí se dibuja: tocar el borde no es pisarlo', () => {
  const touching = [
    scene(1, 0, 6, { animation: kieClip([1], 6) }),
    scene(2, 6, 16, { avatar: avatarView() }),
    scene(3, 16, 22, {
      animation: {
        ...kieClip([3], 6),
        id: 'clip-2',
        clipPath: '/p/clips/clip-2.mp4',
      },
    }),
  ]
  assert.deepEqual(
    blocks
      .timelineBlocks(touching, {})
      .map((block) => [block.kind, block.startSeconds, block.endSeconds]),
    [
      ['clip', 0, 6],
      ['avatar', 6, 16],
      ['clip', 16, 22],
    ],
  )
})

test('un clip de Kie que se genera sobre un avatar no se dibuja; uno pegado sí', () => {
  // El avance viaja bajo cada escena que el clip cubre (SceneAnimationProgress).
  const pending = (leadId, startSeconds, endSeconds) => ({
    leadId,
    startedAt: 1,
    reportedPercent: null,
    startSeconds,
    endSeconds,
  })
  const scenes = [
    scene(1, 0, 3),
    scene(2, 3, 13, { avatar: avatarView() }),
    scene(3, 13, 16),
  ]
  const draw = (progress) =>
    blocks
      .timelineBlocks(scenes, progress)
      .map((block) => [
        block.kind,
        block.startSeconds,
        block.endSeconds,
        block.state ?? null,
      ])
  assert.deepEqual(draw({ 1: pending(1, 0, 13), 2: pending(1, 0, 13) }), [
    ['scene', 0, 3, null],
    ['avatar', 3, 13, 'ready'],
    ['scene', 13, 16, null],
  ])
  assert.deepEqual(draw({ 1: pending(1, 0, 3), 3: pending(3, 13, 16) }), [
    ['clip', 0, 3, 'generating'],
    ['avatar', 3, 13, 'ready'],
    ['clip', 13, 16, 'generating'],
  ])
})

test('el visor reproduce solo el avatar listo y al día', () => {
  const clips = blocks.readyAvatarClips(MIXED)
  assert.deepEqual(
    clips.map((clip) => [
      clip.id,
      clip.clipPath,
      clip.startSeconds,
      clip.endSeconds,
    ]),
    [['avatar-2', '/p/avatar/scene_2.abcd1234.mp4', 4, 14]],
  )
  assert.deepEqual(
    clips[0].scenes.map((item) => item.id),
    [2],
  )
})

test('una escena de avatar sin tramo (de largo cero, sin un cuadro entero o sin tiempos) no tiene bloque ni clip', () => {
  // La regla es la única del carril y la cobertura de Kie (avatarSceneSpan de
  // pipeline/types/avatar.ts): cuadros de 25 fps, no segundos. 8 → 8,01 s cae
  // en el mismo cuadro.
  const spanless = [
    scene(1, 0, 4),
    scene(2, 4, 4, { avatar: avatarView() }),
    scene(3, 4, 8),
    scene(4, undefined, undefined, { avatar: avatarView() }),
    scene(5, 8, 8.01, { avatar: avatarView() }),
  ]
  const result = blocks.timelineBlocks(spanless, {})
  assert.deepEqual(
    result.map((block) => [block.kind, block.startSeconds, block.endSeconds]),
    [
      ['scene', 0, 4],
      ['scene', 4, 8],
    ],
  )
  assert.deepEqual(blocks.readyAvatarClips(spanless), [])
  assert.deepEqual(blocks.avatarSpansOf(spanless), [])
  assert.equal(blocks.clipAt(spanless, 4), undefined)
  assert.equal(blocks.clipAt(spanless, 8), undefined)
})

test('una escena de avatar sin tramo no le quita su lugar a un clip de Kie', () => {
  // Sin tramo no hay nada que pisar: el clip que cubre las escenas 1 a 3 se
  // dibuja y se reproduce, aunque una escena de avatar degenerada caiga
  // adentro (datos viejos o rotos; el corte nunca la deja así).
  const degenerate = [
    scene(1, 0, 3, { animation: kieClip([1, 2, 3], 6) }),
    scene(2, 3, 3, { avatar: avatarView() }),
    scene(3, 3, 6),
  ]
  assert.deepEqual(
    blocks
      .timelineBlocks(degenerate, {})
      .map((block) => [block.kind, block.startSeconds, block.endSeconds]),
    [['clip', 0, 6]],
  )
  assert.equal(
    blocks.clipAt(degenerate, 4)?.clipSrc,
    'media:///p/clips/clip-1.mp4?v=5',
  )
})

test('clipAt no reproduce un clip de Kie heredado bajo un avatar que no está listo, igual que la pista', () => {
  // El clip de Kie cubre las escenas 1 y 2, y la 2 es un avatar planeado,
  // fallido o desactualizado: la pista no lo dibuja (manda el avatar) y el
  // visor tampoco lo reproduce, ni en el tramo del avatar ni antes.
  for (const avatar of [
    avatarView({ status: 'planned', clipPath: undefined }),
    avatarView({ status: 'failed', clipPath: undefined }),
    avatarView({ stale: true }),
  ]) {
    const legacy = [
      scene(1, 0, 3, { animation: kieClip([1, 2], 13) }),
      scene(2, 3, 13, { avatar }),
    ]
    assert.deepEqual(
      blocks
        .timelineBlocks(legacy, {})
        .map((block) => [block.kind, block.startSeconds, block.endSeconds]),
      [
        ['scene', 0, 3],
        ['avatar', 3, 13],
      ],
    )
    assert.equal(blocks.clipAt(legacy, 1), undefined, avatar.status)
    assert.equal(blocks.clipAt(legacy, 8), undefined, avatar.status)
  }
  // Un clip de Kie pegado al avatar sí se reproduce.
  const touching = [
    scene(1, 0, 3, { animation: kieClip([1], 3) }),
    scene(2, 3, 13, {
      avatar: avatarView({ status: 'planned', clipPath: undefined }),
    }),
  ]
  assert.equal(blocks.clipAt(touching, 1)?.offsetSeconds, 1)
  assert.equal(blocks.clipAt(touching, 8), undefined)
})

test('el visor recibe el clip del avatar con retime=false y 0,12 s; el de Kie, como siempre', () => {
  // Lo que el componente hace con estas reglas (velocidad 1, un solo seek al
  // pasar 0,12 s, esperar adelantado) lo prueba check-clip-preview-video.mjs
  // en Chrome; acá se fija lo que el visor recibe.
  const result = blocks.timelineBlocks(MIXED, {}, RENDERING)
  assert.equal(blocks.AVATAR_PREVIEW_RESYNC_SECONDS, 0.12)
  assert.deepEqual(blocks.playableClip(result[1]), {
    path: '/p/avatar/scene_2.abcd1234.mp4',
    mtimeMs: 11,
    slotSeconds: 10,
    resyncSeconds: 0.12,
    retime: false,
  })
  for (const index of [0, 3, 4, 5, 6, 7])
    assert.equal(blocks.playableClip(result[index]), null, `bloque ${index}`)
  const kie = blocks.timelineBlocks(
    [scene(1, 0, 3, { animation: kieClip([1, 2], 6) }), scene(2, 3, 6)],
    {},
  )
  assert.equal(blocks.CLIP_PREVIEW_DRIFT_SECONDS, 0.3)
  assert.deepEqual(blocks.playableClip(kie[0]), {
    path: '/p/clips/clip-1.mp4',
    mtimeMs: 5,
    slotSeconds: 6,
    resyncSeconds: 0.3,
    retime: true,
  })
})

test('el reajuste: 0,2 s de desfase pasa con 0,3 s y se corrige con 0,12 s', () => {
  assert.equal(blocks.clipDriftAction(0.2, 0.3), 'keep')
  assert.equal(blocks.clipDriftAction(0.2, 0.12), 'seek')
  assert.equal(blocks.clipDriftAction(-0.2, 0.12), 'hold')
  assert.equal(blocks.clipDriftAction(-0.2, 0.3), 'keep')
  assert.equal(blocks.clipDriftAction(0.12, 0.12), 'keep')
})

test('fundidos: un avatar listo los conserva y uno desactualizado se funde como una imagen', () => {
  const result = blocks.timelineBlocks(MIXED, {}, RENDERING)
  const frames = blocks.ANIMATION_TRANSITION_FRAMES
  assert.equal(blocks.timelineTransitionFrames(result[0], result[1]), frames)
  assert.equal(blocks.timelineTransitionFrames(result[1], result[2]), frames)
  assert.equal(blocks.timelineTransitionFrames(result[5], result[6]), 0)
  const fading = MIXED.map((item) =>
    item.id === 7 ? { ...item, staticTransitionIn: true } : item,
  )
  const withFade = blocks.timelineBlocks(fading, {}, RENDERING)
  assert.equal(
    blocks.timelineTransitionFrames(withFade[5], withFade[6]),
    frames,
  )
})

test('clipAt: en un avatar listo devuelve su clip; en uno desactualizado o en una imagen, nada', () => {
  assert.deepEqual(blocks.clipAt(MIXED, 5), {
    lead: MIXED[1],
    clipSrc: 'media:///p/avatar/scene_2.abcd1234.mp4?v=11',
    offsetSeconds: 1,
    slotSeconds: 10,
  })
  assert.equal(blocks.clipAt(MIXED, 50), undefined)
  assert.equal(blocks.clipAt(MIXED, 2), undefined)
})

test('clipAt: el tramo del avatar empieza en su primer segundo y termina antes del último', () => {
  assert.equal(blocks.clipAt(MIXED, 4)?.offsetSeconds, 0)
  assert.equal(blocks.clipAt(MIXED, 4)?.lead.id, 2)
  assert.equal(blocks.clipAt(MIXED, 14), undefined)
})
