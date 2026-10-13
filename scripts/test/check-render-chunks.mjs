// Velocidad de exportación sin volver al temblor: la imagen estática se
// decodifica UNA vez (sin `-loop 1` ni `-filter_complex_threads 1`) y los
// chunks se renderizan en paralelo solo si el equipo del usuario lo aguanta.
// Usa el FFmpeg empaquetado sobre un frame chico para que corra en segundos.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { executableSuffix, targetTriple } from '../target-triple.mjs'
import { renderAllChunks } from '../../pipeline/stages/render/chunk-queue.ts'
import { CHUNK_SIZE } from '../../pipeline/stages/render/constants.ts'
import { parallelChunksFor } from '../../pipeline/stages/render/render-concurrency.ts'

const GIGABYTE = 1024 ** 3
const FRAME = { width: 320, height: 180 }
const SCENE_SECONDS = 0.4
const isWindows = process.platform === 'win32'

const triple = targetTriple()
const ffmpeg = fileURLToPath(
  new URL(
    `../../src-tauri/binaries/ffmpeg-${triple}${executableSuffix(triple)}`,
    import.meta.url,
  ),
)

async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-render-chunks-'))
  t.after(() => rm(root, { recursive: true, force: true }))

  const images = []
  for (const [index, source] of [
    'testsrc2=s=640x360',
    'smptebars=s=480x480',
  ].entries()) {
    const image = join(root, `image-${index}.jpg`)
    execFileSync(ffmpeg, [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      source,
      '-frames:v',
      '1',
      '-y',
      image,
    ])
    images.push(image)
  }
  return { root, images }
}

// Escenas contiguas: con CHUNK_SIZE 30, 65 escenas son 3 chunks (30/30/5).
function timeline(images, count) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    imagePath: images[index % images.length],
    startSeconds: index * SCENE_SECONDS,
    endSeconds: (index + 1) * SCENE_SECONDS,
    cameraIndex: index,
    staticTransitionIn: index % 7 === 3,
  }))
}

// Envoltorio POSIX que anota cada corrida (args, inicio y fin) y delega en el
// FFmpeg real: así se ven los argumentos y cuántos procesos hubo a la vez.
async function recordingFfmpeg(root) {
  const log = join(root, 'ffmpeg-runs.log')
  const wrapper = join(root, 'ffmpeg-recording.sh')
  await writeFile(
    wrapper,
    `#!/bin/sh\n` +
      `echo "start $$" >> '${log}'\n` +
      `printf '%s\\n' "$@" > '${root}/args-$$.txt'\n` +
      `'${ffmpeg}' "$@"\n` +
      `status=$?\n` +
      `echo "end $$" >> '${log}'\n` +
      `exit $status\n`,
  )
  await chmod(wrapper, 0o755)
  return { wrapper, log }
}

async function maxSimultaneousRuns(log) {
  let running = 0
  let peak = 0
  for (const line of (await readFile(log, 'utf8')).split('\n')) {
    if (line.startsWith('start ')) peak = Math.max(peak, ++running)
    if (line.startsWith('end ')) running--
  }
  return peak
}

function frameHashes(file) {
  return execFileSync(
    ffmpeg,
    ['-v', 'error', '-i', file, '-f', 'framemd5', '-'],
    {
      encoding: 'utf8',
    },
  )
    .split('\n')
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split(',').at(-1).trim())
}

async function renderInto(directory, scenes, options) {
  await mkdir(directory, { recursive: true })
  const progress = []
  const files = await renderAllChunks(
    options.ffmpegPath ?? ffmpeg,
    scenes,
    directory,
    FRAME,
    {
      parallelChunks: options.parallelChunks,
      signal: options.signal ?? new AbortController().signal,
      onRenderedSeconds: (seconds) => progress.push(seconds),
    },
  )
  return { files, progress }
}

test('the concurrency follows the user machine, never the one it was measured on', () => {
  const machine = (logicalCores, memoryGigabytes) => ({
    logicalCores,
    totalMemoryBytes: memoryGigabytes * GIGABYTE,
  })

  // Gama baja y portátiles comunes: el render secuencial de siempre.
  assert.equal(parallelChunksFor(10, machine(2, 4)), 1)
  assert.equal(parallelChunksFor(10, machine(4, 8)), 1)
  assert.equal(parallelChunksFor(10, machine(8, 8)), 1)
  // Un M4 de 10 núcleos: un FFmpeg ya los llena (medido), sigue en 1.
  assert.equal(parallelChunksFor(10, machine(10, 16)), 1)
  // Escritorios con hilos de sobra.
  assert.equal(parallelChunksFor(10, machine(16, 16)), 2)
  assert.equal(parallelChunksFor(10, machine(32, 64)), 3)
  // La memoria manda aunque sobren núcleos.
  assert.equal(parallelChunksFor(10, machine(32, 8)), 2)
  assert.equal(parallelChunksFor(10, machine(32, 4)), 1)
  // Nunca más procesos que chunks.
  assert.equal(parallelChunksFor(1, machine(32, 64)), 1)
})

test(
  'a static image is decoded once and the filter graph is not pinned to one thread',
  { skip: isWindows },
  async (t) => {
    const { root, images } = await workspace(t)
    const { wrapper } = await recordingFfmpeg(root)

    await renderInto(join(root, 'chunks'), timeline(images, 3), {
      ffmpegPath: wrapper,
      parallelChunks: 1,
    })

    const argsFile = (await readdir(root)).find((name) =>
      name.startsWith('args-'),
    )
    const args = (await readFile(join(root, argsFile), 'utf8')).split('\n')
    assert.ok(
      !args.includes('-loop'),
      'the image must not be re-decoded every frame',
    )
    assert.ok(!args.includes('-filter_complex_threads'))
    const graph = args[args.indexOf('-filter_complex') + 1]
    assert.match(graph, /loop=loop=\d+:size=1:start=0/)
    assert.match(
      graph,
      /perspective=.*interpolation=cubic/,
      'the subpixel Ken Burns stays',
    )
  },
)

test(
  'parallel chunks produce the same frames as the sequential render, in timeline order',
  { skip: isWindows },
  async (t) => {
    const { root, images } = await workspace(t)
    const scenes = timeline(images, 2 * CHUNK_SIZE + 5)
    const { wrapper, log } = await recordingFfmpeg(root)

    const sequential = await renderInto(join(root, 'sequential'), scenes, {
      parallelChunks: 1,
    })
    const parallel = await renderInto(join(root, 'parallel'), scenes, {
      ffmpegPath: wrapper,
      parallelChunks: 2,
    })

    assert.equal(parallel.files.length, 3)
    assert.deepEqual(
      parallel.files.map((file) => file.split(/[\\/]/).at(-1)),
      ['chunk_001.mp4', 'chunk_002.mp4', 'chunk_003.mp4'],
    )
    for (const [index, file] of parallel.files.entries())
      assert.deepEqual(frameHashes(file), frameHashes(sequential.files[index]))

    assert.equal(
      await maxSimultaneousRuns(log),
      2,
      'never more processes than allowed',
    )

    const totalSeconds = scenes.length * SCENE_SECONDS
    for (const { progress } of [sequential, parallel]) {
      for (let index = 1; index < progress.length; index++)
        assert.ok(
          progress[index] >= progress[index - 1] - 1e-9,
          'progress never goes back',
        )
      assert.ok(Math.abs(progress.at(-1) - totalSeconds) < 1e-6)
    }

    // Segunda corrida: todo sale del cache, ningún FFmpeg nuevo.
    const runsBefore = (await readFile(log, 'utf8')).split('\n').length
    await renderInto(join(root, 'parallel'), scenes, {
      ffmpegPath: wrapper,
      parallelChunks: 2,
    })
    assert.equal((await readFile(log, 'utf8')).split('\n').length, runsBefore)
  },
)

test('a failing chunk stops its siblings and reports its own error, leaving no partial files', async (t) => {
  const { root, images } = await workspace(t)
  const scenes = timeline(images, 2 * CHUNK_SIZE + 5)
  scenes[CHUNK_SIZE + 2].imagePath = join(root, 'missing.jpg')
  const directory = join(root, 'chunks')

  await assert.rejects(
    renderInto(directory, scenes, { parallelChunks: 3 }),
    (error) => error.code === 'ffmpeg_failed',
  )
  const leftovers = (await readdir(directory)).filter((name) =>
    name.includes('render-tmp'),
  )
  assert.deepEqual(leftovers, [])
})

test('a cancelled export does not start any chunk', async (t) => {
  const { root, images } = await workspace(t)
  const controller = new AbortController()
  controller.abort()

  await assert.rejects(
    renderInto(join(root, 'chunks'), timeline(images, 3), {
      parallelChunks: 2,
      signal: controller.signal,
    }),
  )
})
