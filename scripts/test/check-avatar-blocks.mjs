// Las escenas de avatar frente a los clips de Kie (ADR-0057, §7.4 y §10.3 del
// diseño) —y, desde la tarea 10, frente al render (§10.1)—. Kie nunca las
// anima: salen de las marcas y su tramo viaja como cubierto, en el sidecar
// (`hasAnimationWork`, `generateSceneAnimations`, la marca del prefijo) y en
// las cuatro utilidades de la UI, aunque una aparición dure más que el máximo
// de Kie (12 s, que el planificador rechaza antes de mirar la cobertura); dos
// imágenes del prefijo separadas por un avatar no forman pareja; sus
// fronteras con clip o recibos no se mueven, tampoco desde la vecina; una
// escena de avatar no admite prompt, descripción ni personajes; y el carril de
// Kie no nombra al proveedor del avatar. El sidecar se importa directo (Node
// quita los tipos); las utilidades de `src/` se empaquetan con esbuild y los
// alias de tsconfig.app.json, como check-timeline-layout.mjs. Sin red.
//
// El render (tarea 10) va al final, en tres capas: `collectRenderScenes` y
// `writeSubtitlesFile` con un FFmpeg simulado (un script de Node que responde
// la duración de una tabla), los mismos con el ffmpeg real del repo y medios
// chicos generados al vuelo (el chunk corre el clip a velocidad 1 de verdad),
// y la fase `render` y el export de clips de punta a punta.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  chmod,
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
import { after, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

import {
  avatarCoveredIntervals,
  withoutAvatarSceneIds,
} from '../../pipeline/animation/avatar-coverage.ts'
import {
  generateSceneAnimations,
  hasAnimationWork,
} from '../../pipeline/animation/generate.ts'
import { normalizeClipToSlot } from '../../pipeline/animation/normalization.ts'
import { planAnimationUnits } from '../../pipeline/animation/planner.ts'
import { planPrefixSceneWindowsWithin } from '../../pipeline/animation/prefix-scenes.ts'
import { animationRangeEnd } from '../../pipeline/animation/scope.ts'
import {
  ANIMATION_TRANSITION_FRAMES,
  frameBoundary,
  slotDurationSeconds,
} from '../../pipeline/animation/timing.ts'
import { transitionFramesFor } from '../../pipeline/animation/transitions.ts'
import { avatarLookPreviewFile } from '../../pipeline/avatar/clip-path.ts'
import { avatarRenderHash } from '../../pipeline/avatar/fingerprint.ts'
import { exportClips } from '../../pipeline/commands/videos/export-clips.ts'
import { updateScenes } from '../../pipeline/commands/videos/update-scenes.ts'
import { resolvePipelineConfig } from '../../pipeline/config/pipeline-config.ts'
import {
  resolveProjectPaths,
  sceneImageFile,
} from '../../pipeline/project/paths.ts'
import { writeScenes } from '../../pipeline/project/scenes-file.ts'
import { animationStage } from '../../pipeline/stages/animation/animation.ts'
import { buildCreateVideoContext } from '../../pipeline/stages/context.ts'
import { collectRenderScenes } from '../../pipeline/stages/render/animated-scenes.ts'
import { renderChunk } from '../../pipeline/stages/render/chunk-renderer.ts'
import { renderStage } from '../../pipeline/stages/render/render.ts'
import { writeSubtitlesFile } from '../../pipeline/stages/render/subtitles.ts'
import { measureDurationSeconds } from '../../pipeline/utils/media-duration.ts'
import {
  FFMPEG,
  isBlue,
  isGreen,
  isRed,
  pixelAt,
  writeHeyGenClip,
  writeNarration,
} from './avatar-fixture.mjs'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

const AVATAR_PLANNED = {
  lookId: 'look-1',
  lookName: 'Ana en la cocina',
  lookType: 'photo_avatar',
  engine: 'avatar_iii',
  origin: 'auto',
  status: 'planned',
}
function kieClip(sceneIds, startSeconds, endSeconds, clipFile) {
  return {
    id: `kie-${sceneIds[0]}`,
    provider: 'kie',
    model: 'fixture-model',
    sceneIds,
    startSeconds,
    endSeconds,
    slotSeconds: endSeconds - startSeconds,
    requestedSeconds: Math.min(
      12,
      Math.max(4, Math.ceil(endSeconds - startSeconds)),
    ),
    normalizedSeconds: endSeconds - startSeconds,
    clipFile,
    prompt: 'fixture',
    strategy: sceneIds.length > 1 ? 'merge' : 'direct',
    status: 'ready',
  }
}
// 33 s con el primer minuto animado: tres escenas de imagen ya animadas y,
// entre ellas, una aparición de 15 s (más que el máximo de Kie, 12 s).
const SCENES = [
  {
    id: 1,
    text: 'Uno.',
    startSeconds: 0,
    endSeconds: 6,
    animationRequestedSeconds: 6,
    animations: [kieClip([1], 0, 6, 'kie_1.mp4')],
  },
  {
    id: 2,
    text: 'Dos.',
    startSeconds: 6,
    endSeconds: 21,
    avatar: AVATAR_PLANNED,
  },
  {
    id: 3,
    text: 'Tres.',
    startSeconds: 21,
    endSeconds: 27,
    animationRequestedSeconds: 6,
    animations: [kieClip([3], 21, 27, 'kie_3.mp4')],
  },
  {
    id: 4,
    text: 'Cuatro.',
    startSeconds: 27,
    endSeconds: 33,
    animationRequestedSeconds: 6,
    animations: [kieClip([4], 27, 33, 'kie_4.mp4')],
  },
]
// Las mismas escenas como las ve el editor (sin clips todavía).
const DETAIL = [
  { id: 1, text: 'Uno.', imageStatus: 'ok', startSeconds: 0, endSeconds: 6 },
  {
    id: 2,
    text: 'Dos.',
    imageStatus: 'ok',
    startSeconds: 6,
    endSeconds: 21,
    avatar: { ...AVATAR_PLANNED },
  },
  { id: 3, text: 'Tres.', imageStatus: 'ok', startSeconds: 21, endSeconds: 27 },
  {
    id: 4,
    text: 'Cuatro.',
    imageStatus: 'ok',
    startSeconds: 27,
    endSeconds: 33,
  },
]
// El prefijo animado alrededor de un avatar, como lo corta la tarea 4: cada
// tramo libre recibe imágenes de 3 s con la marca de 6 s hasta el fin del
// rango animado medido en tiempo de video. 31 s de audio, un minuto animado y
// una aparición de 10 s en 9–19 s: tres imágenes antes (la última queda sola)
// y cuatro después.
const PREFIX_AUDIO_SECONDS = 31
const PREFIX_AVATAR = { startSeconds: 9, endSeconds: 19 }
function prefixScenesAround(audioSeconds, avatar) {
  const rangeEnd = animationRangeEnd(1, audioSeconds)
  const free = [
    { startSeconds: 0, endSeconds: avatar.startSeconds },
    { startSeconds: avatar.endSeconds, endSeconds: audioSeconds },
  ]
  const windows = free.flatMap((span) =>
    planPrefixSceneWindowsWithin({
      totalSeconds: span.endSeconds - span.startSeconds,
      prefixSeconds: Math.max(0, rangeEnd - span.startSeconds),
    }).map((window) => ({
      startSeconds: span.startSeconds + window.startSeconds,
      endSeconds: span.startSeconds + window.endSeconds,
      animationRequestedSeconds: window.animationRequestedSeconds,
    })),
  )
  return [...windows, { ...avatar, avatar: { ...AVATAR_PLANNED } }]
    .sort((left, right) => left.startSeconds - right.startSeconds)
    .map((scene, index) => ({
      id: index + 1,
      text: `Escena ${index + 1}.`,
      imageStatus: 'ok',
      ...scene,
    }))
}
function prefixScenesAroundAvatar() {
  return prefixScenesAround(PREFIX_AUDIO_SECONDS, PREFIX_AVATAR)
}

let workdir
let ui

before(async () => {
  const output = await build({
    stdin: {
      contents: [
        "export { animationRangePlan } from './src/modules/videos/utilities/animationRangePlan.ts'",
        "export { galleryAnimationPlan } from './src/modules/videos/utilities/galleryAnimationPlan.ts'",
        "export { animationPlanPreview } from './src/modules/videos/utilities/animationPlanPreview.ts'",
        "export { pipelineAnimationCards } from './src/modules/videos/utilities/pipelineAnimationCards.ts'",
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
  })
  workdir = await mkdtemp(join(tmpdir(), 'avatar-blocks-guard-'))
  const file = join(workdir, 'avatar-blocks.mjs')
  await writeFile(file, output.outputFiles[0].contents)
  ui = await import(pathToFileURL(file).href)
})

after(async () => {
  if (workdir) await rm(workdir, { recursive: true, force: true })
})

// Un proyecto en disco para los tests de Kie y del editor. No trae
// `binaryPaths.ffmpeg` ni claves: toda unidad que el planificador le diera a
// Kie rechazaría con `ffmpeg_missing` antes de crear el proveedor (y lanzaría
// la fase). Por eso, que la animación resuelva vacía y sin
// `scene-animation-failed` prueba que no se planificó ninguna unidad, que es
// lo que garantiza que Kie no se llama.
async function project(t, scenes = SCENES) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-avatar-blocks-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const projectDir = join(root, 'fixture')
  await mkdir(join(projectDir, 'animations'), { recursive: true })
  await mkdir(join(projectDir, 'scenes'), { recursive: true })
  await writeFile(
    join(projectDir, 'project.json'),
    JSON.stringify({
      id: 'fixture',
      name: 'Fixture',
      state: 'draft',
      completedStages: [],
      createdAt: '2026-10-10T00:00:00.000Z',
      updatedAt: '2026-10-10T00:00:00.000Z',
      audioDurationSeconds: 33,
      options: {
        styleId: 'cartoon',
        sceneCount: 0,
        narrationMode: 'tts',
        imageProvider: 'fal',
        videoFormat: '16:9',
        useBgm: false,
        useOverlay: false,
        confirmScenes: false,
        animationMinutes: 1,
      },
    }),
  )
  for (const scene of scenes)
    for (const animation of scene.animations ?? [])
      await writeFile(
        join(projectDir, 'animations', animation.clipFile),
        'clip',
      )
  const events = []
  const base = {
    job: {
      jobId: 'avatar-blocks',
      projectsRoot: root,
      apiKeys: {},
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
  const context = await buildCreateVideoContext(base, 'fixture')
  await writeScenes(context.paths, structuredClone(scenes))
  return { root, context, events }
}
function editorJob(context, changes) {
  return {
    ...context,
    job: { ...context.job, payload: { projectId: 'fixture', changes } },
  }
}

// ─── Kie (tarea 9) ───

test('kie: las escenas de avatar salen de las marcas y viajan como tramo cubierto', () => {
  assert.deepEqual(withoutAvatarSceneIds([1, 2, 3, 4], SCENES), [1, 3, 4])
  assert.deepEqual(avatarCoveredIntervals(SCENES), [
    { startSeconds: 6, endSeconds: 21 },
  ])
  // Cuenta en cualquier estado; sin tiempos no cubre nada.
  const failed = {
    ...SCENES[1],
    avatar: { ...AVATAR_PLANNED, status: 'failed' },
  }
  assert.deepEqual(avatarCoveredIntervals([failed]), [
    { startSeconds: 6, endSeconds: 21 },
  ])
  assert.deepEqual(
    avatarCoveredIntervals([{ id: 9, avatar: AVATAR_PLANNED }]),
    [],
  )
})

test('kie: una aparición de 15 s dentro del minuto animado no deja trabajo pendiente', async (t) => {
  const { context } = await project(t)
  assert.equal(await hasAnimationWork(context), false)
})

test('kie: animar el prefijo con un avatar no falla, no planifica ninguna unidad para Kie ni toca scenes.json', async (t) => {
  const { context, events } = await project(t)
  const before = await readFile(context.paths.scenesFile, 'utf8')
  const empty = { animated: [], failed: [], rejected: [], creditsConsumed: 0 }

  assert.deepEqual(
    await generateSceneAnimations(context, {
      minutes: 1,
      pairPrefixScenes: true,
      retryFailed: true,
    }),
    empty,
  )
  // Una selección del editor que trae al avatar lo deja afuera sin error.
  assert.deepEqual(
    await generateSceneAnimations(context, { sceneIds: [2] }),
    empty,
  )
  assert.equal(
    events.some((event) => event.type === 'scene-animation-failed'),
    false,
  )
  assert.equal(await readFile(context.paths.scenesFile, 'utf8'), before)
})

test('kie: la fase de animación se saltea y no le pone la marca del prefijo al avatar', async (t) => {
  const { context, events } = await project(t)
  const before = await readFile(context.paths.scenesFile, 'utf8')

  assert.equal(await animationStage.skip(context), true)
  assert.equal(await readFile(context.paths.scenesFile, 'utf8'), before)
  assert.ok(
    events.some((event) => event.type === 'scenes-planned'),
    'el cache-hit comunica el rango',
  )
})

test('kie: la fase de animación corre con un avatar en el minuto animado sin marcarlo ni terminar en animation_incomplete', async (t) => {
  const { context, events } = await project(t)
  const before = await readFile(context.paths.scenesFile, 'utf8')

  await animationStage.run(context)
  assert.equal(await readFile(context.paths.scenesFile, 'utf8'), before)
  assert.equal(
    events.some((event) => event.type === 'scene-animation-failed'),
    false,
  )
})

test('kie: dos imágenes del prefijo separadas por un avatar no forman pareja (planificador, reanudación y progreso)', () => {
  const scenes = prefixScenesAroundAvatar()
  assert.deepEqual(
    scenes.map((scene) => [scene.id, scene.startSeconds, scene.endSeconds]),
    [
      [1, 0, 3],
      [2, 3, 6],
      [3, 6, 9],
      [4, 9, 19],
      [5, 19, 22],
      [6, 22, 25],
      [7, 25, 28],
      [8, 28, 31],
    ],
  )
  const expected = [[1, 2], [3], [5, 6], [7, 8]]

  // Como lo llama el sidecar (`generateSceneAnimations` con el prefijo).
  const plan = planAnimationUnits(
    scenes,
    withoutAvatarSceneIds(
      scenes.map((scene) => scene.id),
      scenes,
    ),
    [],
    {
      endSeconds: animationRangeEnd(1, PREFIX_AUDIO_SECONDS),
      mergeShortScenes: true,
      pairPrefixScenes: true,
      coveredIntervals: avatarCoveredIntervals(scenes),
    },
  )
  assert.deepEqual(plan.rejected, [])
  assert.deepEqual(
    plan.units.map((unit) => unit.sceneIds),
    expected,
  )

  // La reanudación del editor y su costo (`estimateResumeCost`).
  const resume = ui.animationRangePlan(scenes, 1, {
    durationSeconds: PREFIX_AUDIO_SECONDS,
    videoFormat: '16:9',
    pairPrefixScenes: true,
  })
  assert.deepEqual(resume.rejected, [])
  assert.deepEqual(
    resume.units.map((unit) => unit.sceneIds),
    expected,
  )

  // Las tarjetas de la pantalla de progreso.
  assert.deepEqual(
    ui
      .pipelineAnimationCards(scenes, PREFIX_AUDIO_SECONDS)
      .map((card) => card.unit.sceneIds),
    expected,
  )
})

test('editor: las fronteras de un avatar con clip o recibos no se mueven, tampoco desde la vecina; las de uno planeado sí', async (t) => {
  const editable = [
    { id: 1, text: 'Uno.', startSeconds: 0, endSeconds: 6 },
    {
      id: 2,
      text: 'Dos.',
      startSeconds: 6,
      endSeconds: 21,
      avatar: AVATAR_PLANNED,
    },
    { id: 3, text: 'Tres.', startSeconds: 21, endSeconds: 27 },
  ]
  const withAvatar = (avatar) =>
    editable.map((scene) => (scene.id === 2 ? { ...scene, avatar } : scene))
  const attempt = {
    hash: 'fixture-hash',
    state: 'pending',
    engine: 'avatar_iii',
    lookId: 'look-1',
    videoId: 'video-1',
    createdAt: '2026-10-10T00:00:00.000Z',
  }
  const lockedAvatars = [
    { ...AVATAR_PLANNED, status: 'ready', clipFile: 'scene_2.ab12cd34.mp4' },
    { ...AVATAR_PLANNED, attempts: [attempt] },
  ]
  const moves = [
    // La frontera entera, la vecina de la izquierda sola y la de la derecha sola.
    [
      { id: 1, endSeconds: 7 },
      { id: 2, startSeconds: 7 },
    ],
    [{ id: 1, endSeconds: 7 }],
    [{ id: 3, startSeconds: 22 }],
    // Y las dos fronteras del propio avatar, cada una sola.
    [{ id: 2, startSeconds: 7 }],
    [{ id: 2, endSeconds: 20 }],
  ]
  for (const avatar of lockedAvatars)
    for (const changes of moves) {
      const { context } = await project(t, withAvatar(avatar))
      const before = await readFile(context.paths.scenesFile, 'utf8')
      await assert.rejects(updateScenes(editorJob(context, changes)), {
        code: 'avatar_timing_locked',
      })
      assert.equal(await readFile(context.paths.scenesFile, 'utf8'), before)
    }

  // Una frontera que no toca al avatar se mueve igual.
  const locked = await project(t, withAvatar(lockedAvatars[0]))
  assert.deepEqual(
    await updateScenes(editorJob(locked.context, [{ id: 3, endSeconds: 26 }])),
    { applied: 1 },
  )

  const planned = await project(t, editable)
  assert.deepEqual(await updateScenes(editorJob(planned.context, moves[0])), {
    applied: 2,
  })
})

test('editor: una escena de avatar no admite prompt, descripción, personajes, modelo ni calidad de imagen, y el lote se rechaza entero (avatar_scene_without_image)', async (t) => {
  const scenes = [
    { id: 1, text: 'Uno.', startSeconds: 0, endSeconds: 6 },
    {
      id: 2,
      text: 'Dos.',
      startSeconds: 6,
      endSeconds: 21,
      avatar: AVATAR_PLANNED,
    },
    { id: 3, text: 'Tres.', startSeconds: 21, endSeconds: 27 },
  ]
  // El prompt de la imagen, la descripción del editor (también vaciarla), los
  // personajes presentes y el modelo y la calidad de la imagen: lo que el
  // panel de una escena de imagen edita.
  const edits = [
    { imagePrompt: 'A kitchen.' },
    { userPrompt: 'Una cocina.' },
    { userPrompt: '' },
    { charactersPresent: [0] },
    { imageModel: 'fal-ai/flux/schnell' },
    { imageQuality: '1024x576_low' },
  ]
  for (const edit of edits) {
    const { context } = await project(t, scenes)
    const before = await readFile(context.paths.scenesFile, 'utf8')
    const message = JSON.stringify(edit)
    await assert.rejects(
      updateScenes(editorJob(context, [{ id: 2, ...edit }])),
      { code: 'avatar_scene_without_image' },
      message,
    )
    // Una sola escena de avatar en el lote tira el lote: la vecina no aplica.
    await assert.rejects(
      updateScenes(
        editorJob(context, [
          { id: 1, userPrompt: 'Una calle.' },
          { id: 2, ...edit },
        ]),
      ),
      { code: 'avatar_scene_without_image' },
      message,
    )
    assert.equal(
      await readFile(context.paths.scenesFile, 'utf8'),
      before,
      message,
    )
  }

  // La transición estática la manda el interruptor global a todas las
  // escenas, también a la de avatar; y las de imagen siguen editándose.
  const { context } = await project(t, scenes)
  assert.deepEqual(
    await updateScenes(
      editorJob(context, [{ id: 2, staticTransitionIn: true }]),
    ),
    { applied: 1 },
  )
  assert.deepEqual(
    await updateScenes(
      editorJob(context, [
        { id: 1, userPrompt: 'Una calle.' },
        { id: 3, charactersPresent: [0] },
      ]),
    ),
    { applied: 2 },
  )
})

test('kie: toda escena de avatar cubre su tramo sin importar su estado (la regla del visor y del render)', () => {
  // Kie nunca cubre un avatar: ni planeado, ni con el pedido en curso, ni
  // fallido, ni listo, ni con el clip desactualizado (el estado guardado no
  // cambia; la vista lo marca).
  const states = [
    { status: 'planned' },
    { status: 'planned', attempts: [{ state: 'pending' }] },
    { status: 'failed', errorCode: 'avatar_download_failed' },
    { status: 'ready', clipFile: 'scene_2.ab12cd34.mp4' },
    { status: 'ready', clipFile: 'scene_2.ab12cd34.mp4', stale: true },
  ]
  for (const state of states) {
    const scene = { ...SCENES[1], avatar: { ...AVATAR_PLANNED, ...state } }
    const message = JSON.stringify(state)
    assert.deepEqual(
      avatarCoveredIntervals([scene]),
      [{ startSeconds: 6, endSeconds: 21 }],
      message,
    )
    assert.deepEqual(withoutAvatarSceneIds([2], [scene]), [], message)
  }
  // Una escena de imagen no se cubre ni sale de las marcas; una sin largo
  // (o sin tiempos, o que no llega a un cuadro de 25 fps: la regla única de
  // `avatarSceneSpan`, la del carril) no tapa nada.
  assert.deepEqual(avatarCoveredIntervals(SCENES.filter((s) => !s.avatar)), [])
  assert.deepEqual(withoutAvatarSceneIds(new Set([1, 3]), SCENES), [1, 3])
  for (const times of [
    { startSeconds: 5, endSeconds: 5 },
    { startSeconds: 5, endSeconds: 4 },
    { startSeconds: 5, endSeconds: Number.NaN },
    { startSeconds: 5 },
    { startSeconds: 5, endSeconds: 5.01 },
    { startSeconds: 1.04, endSeconds: 1.05 },
  ])
    assert.deepEqual(
      avatarCoveredIntervals([{ id: 9, ...times, avatar: AVATAR_PLANNED }]),
      [],
      JSON.stringify(times),
    )
  // Un cuadro ya cubre, con los segundos tal cual.
  assert.deepEqual(
    avatarCoveredIntervals([
      { id: 9, startSeconds: 5, endSeconds: 5.03, avatar: AVATAR_PLANNED },
    ]),
    [{ startSeconds: 5, endSeconds: 5.03 }],
  )
})

test('kie: el tramo del avatar manda sobre una escena vecina que lo pisa y ningún clip de Kie lo invade (sidecar y UI)', async (t) => {
  // La imagen anterior termina 2 s adentro de la aparición (datos viejos): su
  // clip ya cubre 0–6 s, y lo que queda de ella (6–8 s) es del avatar.
  const overlapping = SCENES.map((scene) =>
    scene.id === 1 ? { ...scene, endSeconds: 8 } : scene,
  )
  const { context } = await project(t, overlapping)
  assert.equal(await hasAnimationWork(context), false)
  assert.deepEqual(
    await generateSceneAnimations(context, {
      minutes: 1,
      pairPrefixScenes: true,
      retryFailed: true,
    }),
    { animated: [], failed: [], rejected: [], creditsConsumed: 0 },
  )

  // Sin clips todavía, el clip de esa imagen se corta donde empieza el avatar.
  const detail = DETAIL.map((scene) =>
    scene.id === 1 ? { ...scene, endSeconds: 8 } : scene,
  )
  const options = { durationSeconds: 33, videoFormat: '16:9' }
  assert.equal(ui.animationRangePlan(detail, 1, options).units[0].endSeconds, 6)
  assert.equal(ui.galleryAnimationPlan(detail, [1], options).unit.endSeconds, 6)
  assert.equal(
    ui.animationPlanPreview(detail, detail[0], options).unit.endSeconds,
    6,
  )
  const marked = detail.map((scene) => ({
    ...scene,
    animationRequestedSeconds: 6,
  }))
  assert.equal(ui.pipelineAnimationCards(marked, 33)[0].unit.endSeconds, 6)
})

test('kie: ninguna pareja del prefijo cruza un avatar, sea cual sea el lugar y el largo de la aparición', () => {
  // La imagen sobrante antes de cada aparición (la grilla de 3 s no cae justo
  // en el avance del avatar) y la de después nunca se unen a través de ella.
  let placements = 0
  for (const audioSeconds of [31, 70])
    for (const startSeconds of [0, 3, 5, 7, 9, 12, 20])
      for (const duration of [7, 10, 15]) {
        const avatar = { startSeconds, endSeconds: startSeconds + duration }
        if (avatar.endSeconds > audioSeconds) continue
        placements++
        const message = JSON.stringify({ audioSeconds, ...avatar })
        const scenes = prefixScenesAround(audioSeconds, avatar)
        const avatarId = scenes.find((scene) => scene.avatar).id
        const rangeEnd = animationRangeEnd(1, audioSeconds)

        const plan = planAnimationUnits(
          scenes,
          withoutAvatarSceneIds(
            scenes.map((scene) => scene.id),
            scenes,
          ),
          [],
          {
            endSeconds: rangeEnd,
            mergeShortScenes: true,
            pairPrefixScenes: true,
            coveredIntervals: avatarCoveredIntervals(scenes),
          },
        )
        assert.deepEqual(plan.rejected, [], message)
        for (const unit of plan.units) {
          assert.ok(!unit.sceneIds.includes(avatarId), message)
          assert.ok(
            unit.endSeconds <= avatar.startSeconds ||
              unit.startSeconds >= avatar.endSeconds,
            `${message} unidad ${unit.startSeconds}-${unit.endSeconds}`,
          )
        }
        const expected = plan.units.map((unit) => unit.sceneIds)

        const resume = ui.animationRangePlan(scenes, 1, {
          durationSeconds: audioSeconds,
          videoFormat: '16:9',
          pairPrefixScenes: true,
        })
        assert.deepEqual(resume.rejected, [], message)
        assert.deepEqual(
          resume.units.map((unit) => unit.sceneIds),
          expected,
          message,
        )
        assert.deepEqual(
          ui
            .pipelineAnimationCards(scenes, rangeEnd)
            .map((card) => card.unit.sceneIds),
          expected,
          message,
        )
      }
  assert.ok(placements > 20, 'el barrido ejercitó lugares suficientes')
})

test('ui: el rango animado del editor no marca ni cobra la aparición', () => {
  const plan = ui.animationRangePlan(DETAIL, 1, {
    durationSeconds: 33,
    videoFormat: '16:9',
  })
  assert.deepEqual(plan.rejected, [])
  assert.deepEqual(plan.sceneIds, [1, 3, 4])
  assert.equal(plan.newClipCount, 3)
  assert.equal(plan.requestedSeconds, 18)
})

test('ui: la galería no anima una escena de avatar y la saca de una selección mixta', () => {
  const onlyAvatar = ui.galleryAnimationPlan(DETAIL, [2], {
    videoFormat: '16:9',
    durationSeconds: 33,
  })
  assert.deepEqual(onlyAvatar.units, [])
  assert.equal(onlyAvatar.rejection, undefined)
  assert.equal(onlyAvatar.requestedSeconds, 0)
  const mixed = ui.galleryAnimationPlan(DETAIL, [1, 2], {
    videoFormat: '16:9',
    durationSeconds: 33,
  })
  assert.deepEqual(mixed.sceneIds, [1])
})

test('ui: el panel de una escena de avatar no ofrece animarla', () => {
  const preview = ui.animationPlanPreview(DETAIL, DETAIL[1], {
    durationSeconds: 33,
    videoFormat: '16:9',
  })
  assert.equal(preview.unit, undefined)
  assert.equal(preview.rejection, undefined)
  assert.deepEqual(preview.sceneIds, [])
})

test('ui: la pantalla de progreso no muestra un clip del prefijo sobre el avatar', () => {
  const progress = [
    {
      id: 1,
      text: 'Uno.',
      imageStatus: 'ok',
      startSeconds: 0,
      endSeconds: 6,
      animationRequestedSeconds: 6,
    },
    // Marca vieja del prefijo sobre el avatar, como la dejaba `needsPrefixMarker`.
    {
      id: 2,
      text: 'Dos.',
      imageStatus: 'ok',
      startSeconds: 6,
      endSeconds: 16,
      animationRequestedSeconds: 6,
      avatar: { ...AVATAR_PLANNED },
    },
    {
      id: 3,
      text: 'Tres.',
      imageStatus: 'ok',
      startSeconds: 16,
      endSeconds: 22,
      animationRequestedSeconds: 6,
    },
  ]
  assert.deepEqual(
    ui
      .pipelineAnimationCards(progress, 22)
      .map((card) => card.unit.leadSceneId),
    [1, 3],
  )
})

test('kie: el carril de Kie no nombra al proveedor del avatar (grep de la ADR-0057)', async () => {
  // Recorre también las subcarpetas (y solo lee archivos).
  const directory = fileURLToPath(
    new URL('../../pipeline/animation/', import.meta.url),
  )
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  })
  const files = entries.filter((entry) => entry.isFile())
  assert.ok(files.length > 0, 'el grep tiene archivos que leer')
  for (const entry of files) {
    const file = join(entry.parentPath, entry.name)
    assert.doesNotMatch(await readFile(file, 'utf8'), /heygen/i, file)
  }
})

// ─── Render (tarea 10, §10.1 con la decisión del dueño del 2026-10-10) ───

const IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFOsAAAAASUVORK5CYII=',
  'base64',
)
const FRAME = { width: 1920, height: 1080 }
const AVATAR_CLIP = 'scene_2.ab12cd34.mp4'
const READY = {
  ...AVATAR_PLANNED,
  status: 'ready',
  clipFile: AVATAR_CLIP,
  normalizedSeconds: 10,
  narrationVersion: 0,
}
const RENDER_OPTIONS = {
  styleId: 'cartoon',
  sceneCount: 0,
  narrationMode: 'tts',
  imageProvider: 'fal',
  videoFormat: '16:9',
  useBgm: false,
  useOverlay: false,
  confirmScenes: false,
}
// Las tres escenas del render: imagen, avatar en medio e imagen.
const TIMES = [
  [0, 6],
  [6, 16],
  [16, 22],
]
function renderScenes(avatar, times = TIMES) {
  return [
    { id: 1, text: 'Uno.', startSeconds: times[0][0], endSeconds: times[0][1] },
    {
      id: 2,
      text: 'Dos frases. Que dice el avatar.',
      startSeconds: times[1][0],
      endSeconds: times[1][1],
      ...(avatar ? { avatar } : {}),
    },
    {
      id: 3,
      text: 'Tres.',
      startSeconds: times[2][0],
      endSeconds: times[2][1],
    },
  ]
}
// La huella vigente del tramo: la que el carril guarda en `renderHash` al
// dejar la escena lista (tarea 7; sin fondo por la decisión del dueño).
function freshRenderHash(scene) {
  return avatarRenderHash({
    lookId: scene.avatar.lookId,
    engine: scene.avatar.engine,
    startFrame: frameBoundary(scene.startSeconds),
    endFrame: frameBoundary(scene.endSeconds),
    narrationVersion: scene.avatar.narrationVersion ?? 0,
  })
}
// FFmpeg simulado (un script de Node con shebang, como el yt-dlp simulado de
// check-style-clone-material.mjs): `-i <archivo>` responde por stderr la
// duración de la tabla, como el probe por cabecera del ffmpeg real, que
// termina con código 1. Un archivo que no está en la tabla no tiene duración:
// el clip cuenta como ilegible.
async function fakeFfmpeg(root, durations) {
  const script = join(root, 'fake-ffmpeg.mjs')
  await writeFile(
    script,
    `#!${process.execPath}
const durations = ${JSON.stringify(durations)}
const input = process.argv[process.argv.indexOf('-i') + 1] ?? ''
const seconds = durations[input.split(/[\\\\/]/).pop()]
if (seconds !== undefined) {
  const whole = Math.floor(seconds)
  const hundredths = String(Math.round((seconds - whole) * 100)).padStart(2, '0')
  process.stderr.write('  Duration: 00:00:' + String(whole).padStart(2, '0') + '.' + hundredths + ', start: 0.000000, bitrate: 900 kb/s\\n')
}
process.exitCode = 1
`,
  )
  await chmod(script, 0o755)
  return script
}
// Un proyecto en disco para el render: las imágenes de las escenas con imagen
// (por defecto la 1 y la 3), la vista previa del look (la imagen fija de una
// escena de avatar), el clip del avatar y FFmpeg simulado. Con `fresh`, toda
// escena de avatar lleva la huella vigente de su tramo.
async function renderFixture(
  t,
  {
    avatar,
    scenes: given,
    times,
    images = [1, 3],
    fresh = true,
    look = true,
    durations = { [AVATAR_CLIP]: 10 },
  } = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-avatar-render-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const paths = resolveProjectPaths(join(root, 'fixture'), 'fixture')
  await mkdir(paths.scenesDirectory, { recursive: true })
  await mkdir(paths.animationsDirectory, { recursive: true })
  await mkdir(paths.avatarDirectory, { recursive: true })
  for (const id of images) await writeFile(sceneImageFile(paths, id), IMAGE)
  if (look) await writeFile(avatarLookPreviewFile(paths, 'png'), IMAGE)
  await writeFile(join(paths.avatarDirectory, AVATAR_CLIP), 'clip')
  const scenes = (given ?? renderScenes(avatar, times)).map((scene) =>
    scene.avatar && fresh
      ? {
          ...scene,
          avatar: { ...scene.avatar, renderHash: freshRenderHash(scene) },
        }
      : scene,
  )
  return {
    root,
    paths,
    project: { options: RENDER_OPTIONS, narrationVersion: 0 },
    scenes,
    ffmpeg: await fakeFfmpeg(root, durations),
  }
}
async function collect(fixture) {
  const warnings = []
  const result = await collectRenderScenes(
    fixture.paths,
    fixture.ffmpeg,
    fixture.scenes,
    fixture.project,
    (message) => warnings.push(message),
  )
  return { ...result, warnings }
}
function staticScene(paths, id, startSeconds, endSeconds, cameraIndex) {
  return {
    id,
    imagePath: sceneImageFile(paths, id),
    startSeconds,
    endSeconds,
    cameraIndex,
    staticTransitionIn: undefined,
  }
}
function staticAvatar(
  paths,
  startSeconds,
  endSeconds,
  id = 2,
  cameraIndex = 1,
) {
  return {
    id,
    imagePath: avatarLookPreviewFile(paths, 'png'),
    startSeconds,
    endSeconds,
    cameraIndex,
    staticTransitionIn: undefined,
  }
}
function lookStaticWarning(reason, id = 2) {
  return `scene ${id}: rendering the avatar look static (${reason})`
}

test('render: el clip del avatar listo y vigente cubre su escena entera, a velocidad 1 y con el fundido de siempre', async (t) => {
  const fixture = await renderFixture(t, { avatar: READY })
  const {
    renderScenes: rendered,
    missingImages,
    missingAvatarLooks,
    warnings,
  } = await collect(fixture)

  assert.deepEqual(missingImages, [])
  assert.deepEqual(missingAvatarLooks, [])
  assert.deepEqual(warnings, [])
  assert.deepEqual(rendered, [
    staticScene(fixture.paths, 1, 0, 6, 0),
    {
      id: 2,
      imagePath: avatarLookPreviewFile(fixture.paths, 'png'),
      startSeconds: 6,
      endSeconds: 16,
      clipPath: join(fixture.paths.avatarDirectory, AVATAR_CLIP),
      clipSeconds: 10,
      cameraIndex: 1,
    },
    staticScene(fixture.paths, 3, 16, 22, 2),
  ])
  assert.equal(
    normalizeClipToSlot(rendered[1].clipSeconds, slotDurationSeconds(6, 16))
      .rate,
    1,
  )
  const block = (scene) => ({
    ...scene,
    animated: Boolean(scene.clipPath && scene.clipSeconds),
  })
  assert.equal(
    transitionFramesFor(block(rendered[0]), block(rendered[1])),
    ANIMATION_TRANSITION_FRAMES,
  )
  assert.equal(
    transitionFramesFor(block(rendered[1]), block(rendered[2])),
    ANIMATION_TRANSITION_FRAMES,
  )
})

test('render: el avatar gana su tramo; un clip de Kie que lo pisa se descarta con aviso', async (t) => {
  const fixture = await renderFixture(t, {
    avatar: READY,
    durations: { [AVATAR_CLIP]: 10, 'kie_1.mp4': 16 },
  })
  fixture.scenes[0] = {
    ...fixture.scenes[0],
    animations: [kieClip([1, 2], 0, 16, 'kie_1.mp4')],
  }
  await writeFile(join(fixture.paths.animationsDirectory, 'kie_1.mp4'), 'clip')
  const { renderScenes: rendered, warnings } = await collect(fixture)

  assert.deepEqual(
    rendered.map((scene) => [
      scene.id,
      scene.startSeconds,
      scene.endSeconds,
      scene.clipPath,
    ]),
    [
      [1, 0, 6, undefined],
      [2, 6, 16, join(fixture.paths.avatarDirectory, AVATAR_CLIP)],
      [3, 16, 22, undefined],
    ],
  )
  assert.deepEqual(warnings, [
    'scene 1: animation overlaps an avatar scene, ignored',
  ])
})

test('render: un clip de Kie sobre un avatar sin clip también se descarta: el tramo muestra el look', async (t) => {
  const failed = {
    ...READY,
    status: 'failed',
    errorCode: 'avatar_render_failed',
  }
  const fixture = await renderFixture(t, {
    avatar: failed,
    durations: { 'kie_1.mp4': 16 },
  })
  fixture.scenes[0] = {
    ...fixture.scenes[0],
    animations: [kieClip([1, 2], 0, 16, 'kie_1.mp4')],
  }
  await writeFile(join(fixture.paths.animationsDirectory, 'kie_1.mp4'), 'clip')
  const { renderScenes: rendered, warnings } = await collect(fixture)

  assert.deepEqual(rendered, [
    staticScene(fixture.paths, 1, 0, 6, 0),
    staticAvatar(fixture.paths, 6, 16),
    staticScene(fixture.paths, 3, 16, 22, 2),
  ])
  assert.deepEqual(warnings, [
    lookStaticWarning('avatar clip failed: avatar_render_failed'),
    'scene 1: animation overlaps an avatar scene, ignored',
  ])
})

for (const [label, avatar, narrationVersion, reason] of [
  [
    'planeado',
    { ...READY, status: 'planned', clipFile: undefined },
    0,
    'avatar clip is not ready',
  ],
  ['listo pero de otra narración', READY, 1, 'avatar clip is outdated'],
]) {
  test(`render: un clip de Kie sobre un avatar ${label} también se descarta (el avatar cubre su tramo en cualquier estado)`, async (t) => {
    const fixture = await renderFixture(t, {
      avatar,
      durations: { [AVATAR_CLIP]: 10, 'kie_1.mp4': 16 },
    })
    fixture.project = { ...fixture.project, narrationVersion }
    fixture.scenes[0] = {
      ...fixture.scenes[0],
      animations: [kieClip([1, 2], 0, 16, 'kie_1.mp4')],
    }
    await writeFile(
      join(fixture.paths.animationsDirectory, 'kie_1.mp4'),
      'clip',
    )
    const { renderScenes: rendered, warnings } = await collect(fixture)

    assert.deepEqual(rendered, [
      staticScene(fixture.paths, 1, 0, 6, 0),
      staticAvatar(fixture.paths, 6, 16),
      staticScene(fixture.paths, 3, 16, 22, 2),
    ])
    assert.deepEqual(warnings, [
      lookStaticWarning(reason),
      'scene 1: animation overlaps an avatar scene, ignored',
    ])
  })
}

for (const [label, avatar, durations, reason] of [
  [
    'planeado, sin clip',
    { ...READY, status: 'planned', clipFile: undefined },
    undefined,
    'avatar clip is not ready',
  ],
  [
    'fallido',
    { ...READY, status: 'failed', errorCode: 'avatar_render_failed' },
    undefined,
    'avatar clip failed: avatar_render_failed',
  ],
  [
    'con un nombre de clip que no es de Vimo',
    { ...READY, clipFile: '../scene_2.ab12cd34.mp4' },
    undefined,
    'avatar clip failed: avatar_download_failed',
  ],
  [
    'sin el archivo del clip',
    { ...READY, clipFile: 'scene_2.ffffffff.mp4' },
    undefined,
    'avatar clip failed: avatar_download_failed',
  ],
  ['con un clip ilegible', READY, {}, 'avatar clip is unreadable'],
]) {
  test(`render: un avatar ${label} sale estático con la vista previa del look y un aviso`, async (t) => {
    const fixture = await renderFixture(t, {
      avatar,
      ...(durations ? { durations } : {}),
    })
    const {
      renderScenes: rendered,
      missingImages,
      missingAvatarLooks,
      warnings,
    } = await collect(fixture)

    assert.deepEqual(missingImages, [])
    assert.deepEqual(missingAvatarLooks, [])
    assert.deepEqual(rendered, [
      staticScene(fixture.paths, 1, 0, 6, 0),
      staticAvatar(fixture.paths, 6, 16),
      staticScene(fixture.paths, 3, 16, 22, 2),
    ])
    assert.deepEqual(warnings, [lookStaticWarning(reason)])
  })
}

test('render: tras reemplazar la narración, el avatar sale estático hasta regenerarlo', async (t) => {
  const fixture = await renderFixture(t, { avatar: READY })
  fixture.project = { ...fixture.project, narrationVersion: 1 }
  const { renderScenes: rendered, warnings } = await collect(fixture)

  assert.deepEqual(rendered[1], staticAvatar(fixture.paths, 6, 16))
  assert.deepEqual(warnings, [lookStaticWarning('avatar clip is outdated')])
})

test('render: un tramo movido deja el clip desactualizado', async (t) => {
  const fixture = await renderFixture(t, { avatar: READY })
  fixture.scenes[1] = { ...fixture.scenes[1], endSeconds: 17 }
  fixture.scenes[2] = { ...fixture.scenes[2], startSeconds: 17 }
  const { renderScenes: rendered, warnings } = await collect(fixture)

  assert.deepEqual(rendered[1], staticAvatar(fixture.paths, 6, 17))
  assert.deepEqual(warnings, [lookStaticWarning('avatar clip is outdated')])
})

test('render: sin clip que sirva y sin vista previa del look, la escena de avatar no se cuenta como imagen faltante (avatar_render_look_unavailable)', async (t) => {
  const fixture = await renderFixture(t, {
    avatar: { ...READY, status: 'failed', errorCode: 'avatar_render_failed' },
    look: false,
  })
  const {
    renderScenes: rendered,
    missingImages,
    missingAvatarLooks,
  } = await collect(fixture)

  assert.deepEqual(missingImages, [])
  assert.deepEqual(missingAvatarLooks, [2])
  assert.deepEqual(
    rendered.map((scene) => scene.id),
    [1, 3],
  )

  // Una imagen común que falta sigue siendo una imagen faltante, aparte.
  await rm(sceneImageFile(fixture.paths, 1))
  const both = await collect(fixture)
  assert.deepEqual(both.missingImages, [1])
  assert.deepEqual(both.missingAvatarLooks, [2])
})

test('render: un clip que dura 0,6 s más que el tramo entra igual, recortado y sin retimar', async (t) => {
  const fixture = await renderFixture(t, {
    avatar: READY,
    durations: { [AVATAR_CLIP]: 10.6 },
  })
  const { renderScenes: rendered } = await collect(fixture)

  assert.equal(rendered[1].clipSeconds, slotDurationSeconds(6, 16))
  assert.equal(
    normalizeClipToSlot(rendered[1].clipSeconds, slotDurationSeconds(6, 16))
      .rate,
    1,
  )
})

test('render: un clip más corto que su tramo por más del relleno del chunk sale estático con el look y un aviso; hasta ese margen entra', async (t) => {
  // El chunk rellena un clip con su último cuadro durante
  // ANIMATION_CLIP_PAD_SECONDS (1 s): en un tramo de 10 s, uno de 9 s entra
  // justo; uno de 8,99 s dejaría el chunk corto y correría el resto del video.
  const justEnough = await renderFixture(t, {
    avatar: READY,
    durations: { [AVATAR_CLIP]: 9 },
  })
  const fits = await collect(justEnough)
  assert.deepEqual(fits.warnings, [])
  assert.equal(
    fits.renderScenes[1].clipPath,
    join(justEnough.paths.avatarDirectory, AVATAR_CLIP),
  )
  assert.equal(fits.renderScenes[1].clipSeconds, 10)

  const truncated = await renderFixture(t, {
    avatar: READY,
    durations: { [AVATAR_CLIP]: 8.99 },
  })
  const short = await collect(truncated)
  assert.deepEqual(short.missingAvatarLooks, [])
  assert.deepEqual(short.renderScenes, [
    staticScene(truncated.paths, 1, 0, 6, 0),
    staticAvatar(truncated.paths, 6, 16),
    staticScene(truncated.paths, 3, 16, 22, 2),
  ])
  assert.deepEqual(short.warnings, [
    lookStaticWarning('avatar clip is too short'),
  ])
})

test('render: la imagen de la candidata con clip nunca es el video, aunque falte la vista previa del look', async (t) => {
  // El chunk dibuja el clip; `imagePath` queda como la imagen fija de la
  // escena: la vista previa del look o el lugar donde iría.
  const fixture = await renderFixture(t, { avatar: READY, look: false })
  const { renderScenes: rendered, warnings } = await collect(fixture)

  assert.deepEqual(warnings, [])
  assert.equal(
    rendered[1].clipPath,
    join(fixture.paths.avatarDirectory, AVATAR_CLIP),
  )
  assert.equal(
    rendered[1].imagePath,
    avatarLookPreviewFile(fixture.paths, 'jpg'),
  )
  for (const scene of rendered)
    assert.doesNotMatch(scene.imagePath, /\.mp4$/, JSON.stringify(scene))
})

test('render: con las fronteras fuera de la grilla de cuadros, el clip se declara con el hueco cuantizado y sigue a velocidad 1', async (t) => {
  // Tras reemplazar la narración las fronteras quedan al milisegundo y no en
  // cuadros de 25 fps: 6,013 s es el cuadro 150 y 16,019 s el 400, así que el
  // hueco es de 10 s aunque la resta cruda dé 10,006 y la huella siga vigente.
  const times = [
    [0, 6.013],
    [6.013, 16.019],
    [16.019, 22],
  ]
  const fixture = await renderFixture(t, { avatar: READY, times })
  const { renderScenes: rendered, warnings } = await collect(fixture)

  assert.deepEqual(warnings, [])
  assert.equal(
    rendered[1].clipPath,
    join(fixture.paths.avatarDirectory, AVATAR_CLIP),
  )
  assert.notEqual(rendered[1].endSeconds - rendered[1].startSeconds, 10)
  assert.equal(rendered[1].clipSeconds, 10)
  assert.equal(
    normalizeClipToSlot(
      rendered[1].clipSeconds,
      slotDurationSeconds(rendered[1].startSeconds, rendered[1].endSeconds),
    ).rate,
    1,
  )
})

test('render: con dos apariciones, cada una con lo suyo, y un clip de Kie entre ellas que no se toca', async (t) => {
  const second = {
    ...READY,
    status: 'failed',
    errorCode: 'avatar_render_failed',
    clipFile: undefined,
  }
  const fixture = await renderFixture(t, {
    scenes: [
      { id: 1, text: 'Uno.', startSeconds: 0, endSeconds: 4 },
      {
        id: 2,
        text: 'Dos.',
        startSeconds: 4,
        endSeconds: 10,
        avatar: { ...READY, normalizedSeconds: 6 },
      },
      {
        id: 3,
        text: 'Tres.',
        startSeconds: 10,
        endSeconds: 14,
        animations: [kieClip([3], 10, 14, 'kie_3.mp4')],
      },
      {
        id: 4,
        text: 'Cuatro.',
        startSeconds: 14,
        endSeconds: 20,
        avatar: second,
      },
      { id: 5, text: 'Cinco.', startSeconds: 20, endSeconds: 24 },
    ],
    images: [1, 3, 5],
    durations: { [AVATAR_CLIP]: 6, 'kie_3.mp4': 4 },
  })
  await writeFile(join(fixture.paths.animationsDirectory, 'kie_3.mp4'), 'clip')
  const { renderScenes: rendered, warnings } = await collect(fixture)

  assert.deepEqual(rendered, [
    staticScene(fixture.paths, 1, 0, 4, 0),
    {
      id: 2,
      imagePath: avatarLookPreviewFile(fixture.paths, 'png'),
      startSeconds: 4,
      endSeconds: 10,
      clipPath: join(fixture.paths.avatarDirectory, AVATAR_CLIP),
      clipSeconds: 6,
      cameraIndex: 1,
    },
    {
      id: 3,
      imagePath: sceneImageFile(fixture.paths, 3),
      startSeconds: 10,
      endSeconds: 14,
      clipPath: join(fixture.paths.animationsDirectory, 'kie_3.mp4'),
      clipSeconds: 4,
      cameraIndex: 2,
    },
    staticAvatar(fixture.paths, 14, 20, 4, 3),
    staticScene(fixture.paths, 5, 20, 24, 4),
  ])
  assert.deepEqual(warnings, [
    lookStaticWarning('avatar clip failed: avatar_render_failed', 4),
  ])
})

test('render: un proyecto sin avatar arma exactamente las mismas escenas que antes', async (t) => {
  const fixture = await renderFixture(t, { durations: { 'kie_1.mp4': 6 } })
  fixture.scenes[0] = {
    ...fixture.scenes[0],
    animations: [kieClip([1], 0, 6, 'kie_1.mp4')],
  }
  // Sin avatar, la escena 2 es una escena de imagen como las demás.
  await writeFile(sceneImageFile(fixture.paths, 2), IMAGE)
  await writeFile(join(fixture.paths.animationsDirectory, 'kie_1.mp4'), 'clip')
  const {
    renderScenes: rendered,
    missingAvatarLooks,
    warnings,
  } = await collect(fixture)

  assert.deepEqual(warnings, [])
  assert.deepEqual(missingAvatarLooks, [])
  assert.deepEqual(rendered, [
    {
      id: 1,
      imagePath: sceneImageFile(fixture.paths, 1),
      startSeconds: 0,
      endSeconds: 6,
      clipPath: join(fixture.paths.animationsDirectory, 'kie_1.mp4'),
      clipSeconds: 6,
      cameraIndex: 0,
    },
    staticScene(fixture.paths, 2, 6, 16, 1),
    staticScene(fixture.paths, 3, 16, 22, 2),
  ])
})

const SENTENCES = [
  {
    index: 0,
    text: 'uno',
    startSeconds: 0,
    endSeconds: 6,
    wordFrom: 0,
    wordTo: 0,
  },
  {
    index: 1,
    text: 'dos frases',
    startSeconds: 6.04,
    endSeconds: 11.2,
    wordFrom: 1,
    wordTo: 2,
  },
  {
    index: 2,
    text: 'que dice el avatar',
    startSeconds: 11.2,
    endSeconds: 16,
    wordFrom: 3,
    wordTo: 6,
  },
  {
    index: 3,
    text: 'tres',
    startSeconds: 16,
    endSeconds: 22,
    wordFrom: 7,
    wordTo: 7,
  },
]
async function subtitleFile(t, scenes, sentences) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-avatar-subtitles-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const paths = resolveProjectPaths(join(root, 'fixture'), 'fixture')
  await mkdir(paths.root, { recursive: true })
  await writeSubtitlesFile(paths, scenes, FRAME, sentences)
  return readFile(paths.subtitlesFile, 'utf8')
}

test('subtítulos: la escena de avatar va por frase, recortada a su tramo; las demás, enteras', async (t) => {
  const file = await subtitleFile(t, renderScenes(READY), SENTENCES)
  assert.deepEqual(
    file.split('\n').filter((line) => line.startsWith('Dialogue:')),
    [
      'Dialogue: 0,0:00:00.00,0:00:06.00,Default,,0,0,0,,Uno.',
      'Dialogue: 0,0:00:06.00,0:00:11.20,Default,,0,0,0,,dos frases',
      'Dialogue: 0,0:00:11.20,0:00:16.00,Default,,0,0,0,,que dice el avatar',
      'Dialogue: 0,0:00:16.00,0:00:22.00,Default,,0,0,0,,Tres.',
    ],
  )
})

test('subtítulos: sin avatar, o sin frases, nada cambia', async (t) => {
  const plain = await subtitleFile(t, renderScenes(), [])
  assert.equal(await subtitleFile(t, renderScenes(), SENTENCES), plain)
  const withoutSentences = await subtitleFile(t, renderScenes(READY), [])
  assert.ok(
    withoutSentences.includes(
      'Dialogue: 0,0:00:06.00,0:00:16.00,Default,,0,0,0,,Dos frases. Que dice el avatar.',
    ),
  )
})

test('subtítulos: una frase es de la escena de avatar por su punto medio, y las líneas llenan el tramo sin huecos', async (t) => {
  const sentence = (index, text, startSeconds, endSeconds) => ({
    index,
    text,
    startSeconds,
    endSeconds,
    wordFrom: index,
    wordTo: index,
  })
  const file = await subtitleFile(t, renderScenes(READY), [
    // Termina antes del tramo (6–16 s): de la escena anterior.
    sentence(0, 'cero', 0, 3),
    // Empieza antes del tramo, pero su punto medio (6,5 s) cae adentro.
    sentence(1, 'uno dos', 3, 10),
    // Termina 1 s antes del fin del tramo: la línea se estira hasta él.
    sentence(2, 'tres cuatro', 10, 15),
    // Empieza adentro, pero su punto medio (18,5 s) es de la escena siguiente.
    sentence(3, 'cinco', 15, 22),
  ])
  assert.deepEqual(
    file.split('\n').filter((line) => line.startsWith('Dialogue:')),
    [
      'Dialogue: 0,0:00:00.00,0:00:06.00,Default,,0,0,0,,Uno.',
      'Dialogue: 0,0:00:06.00,0:00:10.00,Default,,0,0,0,,uno dos',
      'Dialogue: 0,0:00:10.00,0:00:16.00,Default,,0,0,0,,tres cuatro',
      'Dialogue: 0,0:00:16.00,0:00:22.00,Default,,0,0,0,,Tres.',
    ],
  )
})

// Desde la entrega 2b (ruling del 2026-10-11, diseño §10.1) cuenta el punto
// medio de la parte hablada de cada frase, de su inicio a su última palabra:
// con el tope de silencio (planner.ts) la última frase de una aparición puede
// terminar mucho después de la escena. El test de arriba, con frases sin
// `lastWordEndSeconds`, cubre que sin ese dato se mide la frase entera.
test('subtítulos: la frase que el tope de silencio deja con su cola afuera es de la escena de avatar por el punto medio de su parte hablada', async (t) => {
  const sentences = [
    // Adentro por su punto medio (6,5 s).
    {
      index: 0,
      text: 'uno dos',
      startSeconds: 3,
      endSeconds: 10,
      lastWordEndSeconds: 10,
      wordFrom: 0,
      wordTo: 0,
    },
    // Su última palabra termina a los 13,9 s, adentro del tramo (6–16 s), y
    // la sigue un silencio hasta los 30: entera, su punto medio (20 s) caería
    // afuera y sus palabras no saldrían en ningún subtítulo (el texto de la
    // escena siguiente no las tiene); el de su parte hablada, 11,95 s, cae
    // adentro.
    {
      index: 1,
      text: 'tres cuatro',
      startSeconds: 10,
      endSeconds: 30,
      lastWordEndSeconds: 13.9,
      wordFrom: 1,
      wordTo: 1,
    },
  ]
  const file = await subtitleFile(t, renderScenes(READY), sentences)
  assert.deepEqual(
    file.split('\n').filter((line) => line.startsWith('Dialogue:')),
    [
      'Dialogue: 0,0:00:00.00,0:00:06.00,Default,,0,0,0,,Uno.',
      'Dialogue: 0,0:00:06.00,0:00:10.00,Default,,0,0,0,,uno dos',
      'Dialogue: 0,0:00:10.00,0:00:16.00,Default,,0,0,0,,tres cuatro',
      'Dialogue: 0,0:00:16.00,0:00:22.00,Default,,0,0,0,,Tres.',
    ],
  )
  // Sin avatar, las mismas frases no cambian ni un byte.
  assert.equal(
    await subtitleFile(t, renderScenes(), sentences),
    await subtitleFile(t, renderScenes(), []),
  )
  // La parte hablada nunca pasa el fin de la frase: una última palabra que
  // dice terminar a los 40 s (un words.json roto) no saca a «uno dos» de la
  // escena.
  const broken = [{ ...sentences[0], lastWordEndSeconds: 40 }, sentences[1]]
  assert.equal(await subtitleFile(t, renderScenes(READY), broken), file)
})

// ─── Render con FFmpeg real (medios chicos generados al vuelo, sin red) ───

const CHUNK_FRAME = { width: 320, height: 180 }
// Un segundo de imagen, cuatro de avatar y un segundo de imagen: 150
// cuadros. El tramo del avatar dura 3 s o más (MIN_ANIMATION_SLOT_SECONDS):
// con uno más corto el chunk toma la rama `cut` y no retima aunque el clip se
// declare mal, así que los píxeles no verían un retimado.
const SHORT_TIMES = [
  [0, 1],
  [1, 5],
  [5, 6],
]
const isYellow = ([r, g, b]) => r > 180 && g > 180 && b < 90
function ffmpegRun(args) {
  execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', ...args])
}
function writeSolidImage(path, color) {
  ffmpegRun([
    '-f',
    'lavfi',
    '-i',
    `color=c=${color}:size=320x180`,
    '-frames:v',
    '1',
    '-y',
    path,
  ])
}
// El proyecto del render con medios reales: imágenes verdes, el look amarillo
// y un clip «de HeyGen» de `clipSeconds` que pasa del rojo al azul en el
// cuadro 50 (a 2 s): si el chunk lo retimara, el cambio de color se correría.
async function realFixture(t, { clipSeconds = 4, clip = true } = {}) {
  const fixture = await renderFixture(t, { avatar: READY, times: SHORT_TIMES })
  for (const id of [1, 3])
    writeSolidImage(sceneImageFile(fixture.paths, id), 'green')
  writeSolidImage(avatarLookPreviewFile(fixture.paths, 'png'), 'yellow')
  const clipFile = join(fixture.paths.avatarDirectory, AVATAR_CLIP)
  if (clip)
    writeHeyGenClip(clipFile, {
      seconds: clipSeconds,
      switchSeconds: 2,
      size: '320x180',
    })
  else await rm(clipFile)
  return { ...fixture, ffmpeg: FFMPEG }
}

test('render con ffmpeg real: el clip del avatar corre a velocidad 1 en el chunk, dure lo que dure, y sin clip (o muy corto) sale el look', async (t) => {
  for (const [label, clipSeconds] of [
    ['del largo del tramo', 4],
    ['0,6 s más largo', 4.6],
    ['0,5 s más corto', 3.5],
  ]) {
    const fixture = await realFixture(t, { clipSeconds })
    const { renderScenes: rendered, warnings } = await collect(fixture)
    assert.deepEqual(warnings, [], label)
    assert.equal(rendered[1].clipSeconds, 4, label)

    const chunk = join(fixture.root, 'chunk.mp4')
    await renderChunk(FFMPEG, rendered, 0, chunk, CHUNK_FRAME)
    assert.ok(
      Math.abs((await measureDurationSeconds(FFMPEG, chunk)) - 6) < 0.05,
      `${label}: el chunk dura lo que la línea de tiempo`,
    )
    // Cuadros 0–24 imagen, 25–124 avatar (rojo hasta el 74, azul desde el 75:
    // un clip retimado correría ese cambio en las dos direcciones) y 125–149
    // imagen.
    assert.ok(isGreen(pixelAt(chunk, 10, 160, 90)), `${label}: imagen 1`)
    assert.ok(isRed(pixelAt(chunk, 74, 160, 90)), `${label}: cuadro 74`)
    assert.ok(isBlue(pixelAt(chunk, 75, 160, 90)), `${label}: cuadro 75`)
    assert.ok(isBlue(pixelAt(chunk, 124, 160, 90)), `${label}: cuadro 124`)
    assert.ok(isGreen(pixelAt(chunk, 140, 160, 90)), `${label}: imagen 3`)
  }

  // Sin el clip, o con uno 1,1 s más corto que el tramo (el relleno del chunk
  // es de 1 s), el tramo sale con el look.
  for (const [label, options, reason] of [
    ['sin clip', { clip: false }, 'avatar clip failed: avatar_download_failed'],
    ['muy corto', { clipSeconds: 2.9 }, 'avatar clip is too short'],
  ]) {
    const fixture = await realFixture(t, options)
    const { renderScenes: rendered, warnings } = await collect(fixture)
    assert.deepEqual(warnings, [lookStaticWarning(reason)], label)
    const chunk = join(fixture.root, 'chunk.mp4')
    await renderChunk(FFMPEG, rendered, 0, chunk, CHUNK_FRAME)
    assert.ok(
      Math.abs((await measureDurationSeconds(FFMPEG, chunk)) - 6) < 0.05,
      `${label}: el chunk dura lo que la línea de tiempo`,
    )
    assert.ok(isGreen(pixelAt(chunk, 10, 160, 90)), `${label}: imagen 1`)
    assert.ok(isYellow(pixelAt(chunk, 75, 160, 90)), `${label}: el look`)
    assert.ok(isGreen(pixelAt(chunk, 140, 160, 90)), `${label}: imagen 3`)
  }
})

test('render con ffmpeg real: un clip corrupto sale estático con el look y el aviso de ilegible', async (t) => {
  const fixture = await realFixture(t, { clip: false })
  await writeFile(
    join(fixture.paths.avatarDirectory, AVATAR_CLIP),
    'esto no es un mp4',
  )
  const { renderScenes: rendered, warnings } = await collect(fixture)

  assert.deepEqual(rendered[1], staticAvatar(fixture.paths, 1, 5))
  assert.deepEqual(warnings, [lookStaticWarning('avatar clip is unreadable')])
})

// ─── Fase de render y export de clips con FFmpeg real ───

const STAGE_WORDS = [
  { word: 'Uno', start: 0.1, end: 0.8, sentenceEnd: true },
  { word: 'Hola', start: 1.1, end: 1.4 },
  { word: 'a', start: 1.4, end: 1.5 },
  { word: 'todos', start: 1.5, end: 1.9, sentenceEnd: true },
  { word: 'Esto', start: 2, end: 2.2 },
  { word: 'es', start: 2.2, end: 2.3 },
  { word: 'una', start: 2.3, end: 2.5 },
  { word: 'prueba', start: 2.5, end: 2.9, sentenceEnd: true },
  { word: 'Tres', start: 3.1, end: 3.8, sentenceEnd: true },
]
// Un proyecto completo de 4 s con narración real, palabras con puntuación, un
// avatar de 2 s en el medio y, según se pida, sin su clip o sin su look.
async function stageProject(
  t,
  { clip = true, look = true, images = [1, 3] } = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-avatar-stage-render-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'fixture'), { recursive: true })
  await writeFile(
    join(root, 'fixture', 'project.json'),
    JSON.stringify({
      id: 'fixture',
      name: 'Fixture',
      state: 'draft',
      completedStages: [],
      createdAt: '2026-10-10T00:00:00.000Z',
      updatedAt: '2026-10-10T00:00:00.000Z',
      audioDurationSeconds: 4,
      options: { ...RENDER_OPTIONS, subtitles: true },
    }),
  )
  const events = []
  const context = await buildCreateVideoContext(
    {
      job: {
        jobId: 'avatar-render',
        projectsRoot: root,
        apiKeys: {},
        binaryPaths: { ffmpeg: FFMPEG },
      },
      config: resolvePipelineConfig(),
      signal: new AbortController().signal,
      emitter: {
        emit(event) {
          events.push(event)
        },
      },
    },
    'fixture',
  )
  const { paths } = context
  await mkdir(paths.scenesDirectory, { recursive: true })
  await mkdir(paths.avatarDirectory, { recursive: true })
  for (const id of images) writeSolidImage(sceneImageFile(paths, id), 'green')
  if (look) writeSolidImage(avatarLookPreviewFile(paths, 'png'), 'yellow')
  if (clip)
    writeHeyGenClip(join(paths.avatarDirectory, AVATAR_CLIP), {
      seconds: 2,
      switchSeconds: 1,
      size: '640x360',
    })
  writeNarration(paths.narrationFile, 4)
  await writeFile(paths.wordsFile, JSON.stringify(STAGE_WORDS))
  const avatarScene = {
    id: 2,
    text: 'Hola a todos. Esto es una prueba.',
    startSeconds: 1,
    endSeconds: 3,
    avatar: { ...READY, normalizedSeconds: 2 },
  }
  avatarScene.avatar.renderHash = freshRenderHash(avatarScene)
  await writeScenes(paths, [
    { id: 1, text: 'Uno.', startSeconds: 0, endSeconds: 1 },
    avatarScene,
    { id: 3, text: 'Tres.', startSeconds: 3, endSeconds: 4 },
  ])
  return { context, events, paths }
}
function warningsOf(events) {
  return events
    .filter((event) => event.type === 'log' && event.level === 'warn')
    .map((event) => event.message)
}

test('fase render con ffmpeg real: el avatar entra al video con sus subtítulos por frase y, tras reemplazar la narración, sale el look con un aviso', async (t) => {
  const { context, events, paths } = await stageProject(t)
  await renderStage.run(context)

  const dialogues = async () =>
    (await readFile(paths.subtitlesFile, 'utf8'))
      .split('\n')
      .filter((line) => line.startsWith('Dialogue:'))
  assert.deepEqual(await dialogues(), [
    'Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,Uno.',
    'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Hola a todos',
    'Dialogue: 0,0:00:02.00,0:00:03.00,Default,,0,0,0,,Esto es una prueba',
    'Dialogue: 0,0:00:03.00,0:00:04.00,Default,,0,0,0,,Tres.',
  ])
  assert.deepEqual(warningsOf(events), [])
  assert.ok(
    Math.abs((await measureDurationSeconds(FFMPEG, paths.videoFile)) - 4) <
      0.15,
  )

  // Se reemplazó la narración (versión 1) y el clip es de la versión 0: el
  // video se vuelve a armar completo, con el look en su tramo, y lo avisa.
  context.metadata.narrationVersion = 1
  await renderStage.run(context)
  assert.deepEqual(warningsOf(events), [
    lookStaticWarning('avatar clip is outdated'),
  ])
  assert.deepEqual(await dialogues(), [
    'Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,Uno.',
    'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Hola a todos',
    'Dialogue: 0,0:00:02.00,0:00:03.00,Default,,0,0,0,,Esto es una prueba',
    'Dialogue: 0,0:00:03.00,0:00:04.00,Default,,0,0,0,,Tres.',
  ])
  assert.ok(
    Math.abs((await measureDurationSeconds(FFMPEG, paths.videoFile)) - 4) <
      0.15,
  )
})

test('fase render: sin clip ni vista previa del look falla con avatar_render_look_unavailable, no con render_missing_images', async (t) => {
  const { context, paths } = await stageProject(t, {
    clip: false,
    look: false,
  })
  await assert.rejects(renderStage.run(context), (error) => {
    assert.equal(error.code, 'avatar_render_look_unavailable')
    assert.match(error.message, /: 2$/)
    return true
  })
  await assert.rejects(stat(paths.videoFile))

  // Una imagen común que falta sigue siendo render_missing_images y no
  // nombra a la escena de avatar.
  const missing = await stageProject(t, {
    clip: false,
    look: false,
    images: [3],
  })
  await assert.rejects(renderStage.run(missing.context), (error) => {
    assert.equal(error.code, 'render_missing_images')
    assert.match(error.message, /: 1$/)
    return true
  })
})

test('export de clips con ffmpeg real: la escena de avatar sale con su clip a velocidad 1; sin clip ni look se rechaza con avatar_render_look_unavailable', async (t) => {
  const exportJob = ({ context }) => ({
    ...context,
    job: { ...context.job, payload: { projectId: 'fixture' } },
  })
  const project = await stageProject(t)
  const result = await exportClips(exportJob(project))

  assert.equal(result.clipCount, 3)
  assert.deepEqual((await readdir(project.paths.clipsDirectory)).sort(), [
    'clip_01.mp4',
    'clip_02.mp4',
    'clip_03.mp4',
    'narration.mp3',
  ])
  const avatarClip = join(project.paths.clipsDirectory, 'clip_02.mp4')
  assert.ok(isRed(pixelAt(avatarClip, 24, 960, 540)))
  assert.ok(isBlue(pixelAt(avatarClip, 25, 960, 540)))

  const missing = await stageProject(t, { clip: false, look: false })
  await assert.rejects(exportClips(exportJob(missing)), {
    code: 'avatar_render_look_unavailable',
  })
})
