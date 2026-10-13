// Mezcla final sin recodificar el video (interruptor FINAL_MIX_VIDEO_COPY): sin
// overlay, subtítulos ni color, el video unido de los chunks se copia tal cual
// y el final congelado sale de un tramo aparte. Con cualquier cosa que dibujar
// encima, o un video más largo que la voz, se recodifica como siempre.
// FFmpeg empaquetado sobre un frame chico para que corra en segundos.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
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
import {
  FINAL_MIX_VIDEO_COPY,
  REENCODE_PROGRESS_SHARES,
  VIDEO_COPY_PROGRESS_SHARES,
} from '../../pipeline/stages/render/constants.ts'
import {
  concatChunks,
  mixCopiesVideo,
  mixFinalVideo,
} from '../../pipeline/stages/render/final-mix.ts'
import { subtitlesFilter } from '../../pipeline/stages/render/subtitles.ts'
import { measureExactDurationSeconds } from '../../pipeline/utils/media-duration.ts'

const FPS = 25
const FRAME = { width: 320, height: 180 }
const SCENE_SECONDS = 0.4
const SCENE_COUNT = 34
const VIDEO_SECONDS = SCENE_COUNT * SCENE_SECONDS
const isWindows = process.platform === 'win32'

const triple = targetTriple()
const ffmpeg = fileURLToPath(
  new URL(
    `../../src-tauri/binaries/ffmpeg-${triple}${executableSuffix(triple)}`,
    import.meta.url,
  ),
)

function run(args) {
  return execFileSync(ffmpeg, ['-v', 'error', ...args], { encoding: 'utf8' })
}

// Video mudo de dos chunks (con un clip animado, como en un proyecto real)
// y su concat: lo mismo que deja el render antes de la mezcla.
async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'vimo-final-mix-'))
  t.after(() => rm(root, { recursive: true, force: true }))

  const image = join(root, 'image.jpg')
  run(['-f', 'lavfi', '-i', 'testsrc2=s=640x360', '-frames:v', '1', image])
  const clip = join(root, 'clip.mp4')
  run([
    '-f',
    'lavfi',
    '-i',
    'testsrc=s=320x240:r=24:d=1.2',
    '-pix_fmt',
    'yuv420p',
    clip,
  ])

  const scenes = Array.from({ length: SCENE_COUNT }, (_, index) => ({
    id: index + 1,
    imagePath: image,
    startSeconds: index * SCENE_SECONDS,
    endSeconds: (index + 1) * SCENE_SECONDS,
    cameraIndex: index,
    ...(index === 31 ? { clipPath: clip, clipSeconds: 1.2 } : {}),
  }))
  const chunksDirectory = join(root, 'chunks')
  await mkdir(chunksDirectory)
  const chunkFiles = await renderAllChunks(
    ffmpeg,
    scenes,
    chunksDirectory,
    FRAME,
    {
      parallelChunks: 1,
      signal: new AbortController().signal,
      onRenderedSeconds() {},
    },
  )
  const silentVideoFile = join(chunksDirectory, 'video_concat_silent.mp4')
  await concatChunks(ffmpeg, chunkFiles, silentVideoFile)

  return { root, chunksDirectory, silentVideoFile }
}

async function narration(root, seconds) {
  const file = join(root, `narration-${seconds}.wav`)
  run(['-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`, file])
  return file
}

// Envoltorio POSIX que guarda los argumentos de cada corrida de FFmpeg.
async function recordingFfmpeg(root) {
  const log = join(root, 'ffmpeg-args.log')
  const wrapper = join(root, 'ffmpeg-recording.sh')
  await writeFile(
    wrapper,
    `#!/bin/sh\nprintf '%s ' "$@" >> '${log}'\necho >> '${log}'\nexec '${ffmpeg}' "$@"\n`,
  )
  await chmod(wrapper, 0o755)
  return {
    wrapper,
    async finalMixArgs() {
      const runs = (await readFile(log, 'utf8')).trim().split('\n')
      return runs.find((line) => line.includes('[finalaudio]'))
    },
  }
}

function frameHashes(file) {
  return run(['-i', file, '-map', '0:v', '-f', 'framemd5', '-'])
    .split('\n')
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split(',').at(-1).trim())
}

// PSNR de un cuadro contra otro del mismo archivo (inf = idénticos).
function psnrBetween(file, frame, referenceFrame) {
  const { stderr } = spawnSync(
    ffmpeg,
    [
      '-hide_banner',
      '-i',
      file,
      '-i',
      file,
      '-lavfi',
      `[0:v]select=eq(n\\,${frame})[a];[1:v]select=eq(n\\,${referenceFrame})[b];[a][b]psnr`,
      '-frames:v',
      '1',
      '-f',
      'null',
      '-',
    ],
    { encoding: 'utf8' },
  )
  const average = stderr.match(/average:([\d.]+|inf)/)[1]
  return average === 'inf' ? Infinity : Number(average)
}

async function mix(t, overrides = {}) {
  const context = await workspace(t)
  const recorder = await recordingFfmpeg(context.root)
  const narrationFile = await narration(
    context.root,
    overrides.audioSeconds ?? VIDEO_SECONDS + 0.17,
  )
  const outputFile = join(context.root, 'final.mp4')
  await mixFinalVideo(
    recorder.wrapper,
    {
      silentVideoFile: context.silentVideoFile,
      narrationFile,
      frame: FRAME,
      colorFilter: overrides.colorFilter ?? '',
      musicFile: overrides.withMusic
        ? await narration(context.root, 3)
        : undefined,
      subtitlesFilter: overrides.subtitlesFile
        ? subtitlesFilter(await overrides.subtitlesFile(context.root))
        : undefined,
    },
    outputFile,
  )
  // Cuadros que debe tener la salida: la voz medida decodificando (como la
  // mezcla), redondeada hacia arriba a cuadro entero.
  const expectedFrames = Math.ceil(
    (await measureExactDurationSeconds(ffmpeg, narrationFile)) * FPS - 1e-6,
  )
  return {
    ...context,
    outputFile,
    expectedFrames,
    finalMixArgs: await recorder.finalMixArgs(),
  }
}

test('the switch ships on', () => {
  assert.equal(FINAL_MIX_VIDEO_COPY, true)
})

test('the progress bar is split by the mix that will actually run', () => {
  assert.equal(mixCopiesVideo({ colorFilter: '' }), true)
  assert.equal(mixCopiesVideo({ colorFilter: '  ' }), true)
  assert.equal(mixCopiesVideo({ colorFilter: 'eq=saturation=1.25' }), false)
  assert.equal(
    mixCopiesVideo({ colorFilter: '', overlayFile: 'overlay.mp4' }),
    false,
  )
  assert.equal(
    mixCopiesVideo({
      colorFilter: '',
      subtitlesFilter: "subtitles=filename='a.ass'",
    }),
    false,
  )

  // Copiando, la mezcla dura segundos: casi toda la barra es de los chunks.
  assert.ok(VIDEO_COPY_PROGRESS_SHARES.chunks > REENCODE_PROGRESS_SHARES.chunks)
  for (const shares of [REENCODE_PROGRESS_SHARES, VIDEO_COPY_PROGRESS_SHARES])
    assert.ok(
      shares.chunks > 0 &&
        shares.concat >= 0 &&
        shares.chunks + shares.concat < 1,
    )
})

test(
  'without overlays the video is copied, joins intact and the frozen ending added',
  { skip: isWindows },
  async (t) => {
    const {
      silentVideoFile,
      outputFile,
      expectedFrames,
      finalMixArgs,
      chunksDirectory,
    } = await mix(t)

    assert.match(finalMixArgs, /-c:v copy/)
    assert.doesNotMatch(finalMixArgs, /libx264/)

    const silent = frameHashes(silentVideoFile)
    const final = frameHashes(outputFile)
    // La voz dura más que las imágenes: el final lleva cuadros congelados.
    assert.equal(final.length, expectedFrames)
    assert.ok(final.length > silent.length, 'the ending needs padding')
    assert.deepEqual(
      final.slice(0, silent.length),
      silent,
      'every original frame is copied bit for bit',
    )

    const last = silent.length - 1
    for (let frame = silent.length; frame < final.length; frame++) {
      const average = psnrBetween(outputFile, frame, last)
      assert.ok(
        average >= 40,
        `padding frame ${frame} repeats the last frame (PSNR ${average})`,
      )
    }

    assert.equal(
      run(['-v', 'warning', '-i', outputFile, '-f', 'null', '-']),
      '',
    )
    const leftovers = (await readdir(chunksDirectory)).filter((name) =>
      /video_end_pad|final_concat_list/.test(name),
    )
    assert.deepEqual(leftovers, [])
  },
)

test(
  'background music is mixed into the audio and the video is still copied',
  { skip: isWindows },
  async (t) => {
    const { finalMixArgs } = await mix(t, { withMusic: true })

    assert.match(finalMixArgs, /-c:v copy/)
    assert.match(finalMixArgs, /amix=inputs=2/)
  },
)

test(
  'burned subtitles, a style color or a longer video keep the re-encoding mix',
  { skip: isWindows },
  async (t) => {
    const subtitles = await mix(t, {
      async subtitlesFile(root) {
        const file = join(root, 'subtitles.ass')
        await writeFile(
          file,
          '[Script Info]\nScriptType: v4.00+\nPlayResX: 320\nPlayResY: 180\n\n' +
            '[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, Alignment\n' +
            'Style: Default,Arial,12,&H00FFFFFF,2\n\n' +
            '[Events]\nFormat: Layer, Start, End, Style, Text\n' +
            'Dialogue: 0,0:00:00.00,0:00:02.00,Default,Hola\n',
        )
        return file
      },
    })
    assert.match(subtitles.finalMixArgs, /libx264/)

    const color = await mix(t, { colorFilter: 'eq=saturation=1.25' })
    assert.match(color.finalMixArgs, /libx264/)

    const longerVideo = await mix(t, { audioSeconds: VIDEO_SECONDS - 1 })
    assert.match(longerVideo.finalMixArgs, /libx264/)
    assert.equal(
      frameHashes(longerVideo.outputFile).length,
      longerVideo.expectedFrames,
    )
  },
)
