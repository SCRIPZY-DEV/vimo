import { rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import type { FrameSize } from '../types/video-format.ts'
import { PipelineFailure } from '../runner/failure.ts'
import { ensureDirectory, renameAtomic } from '../utils/atomic-fs.ts'
import { runFfmpeg } from '../utils/ffmpeg.ts'
import { ANIMATION_FPS, slotFrames } from './timing.ts'
import { normalizeClipToSlot } from './normalization.ts'

interface MediaProbe {
  frames: number
  seconds: number
  audioStreams: number
}

// Decodifica video únicamente: el largo del audio remoto no puede decidir
// cuánto se acelera la imagen. El mismo probe certifica cero pistas de audio.
export async function inspectAnimationFile(
  ffmpegPath: string,
  path: string,
  signal?: AbortSignal,
): Promise<MediaProbe> {
  let frames = 0
  let seconds = 0
  let firstTimestamp: number | undefined
  let lastTimestamp: number | undefined
  let frameSeconds = 1 / ANIMATION_FPS
  const audioStreams = new Set<string>()
  await runFfmpeg(
    ffmpegPath,
    [
      '-hide_banner',
      '-progress',
      'pipe:1',
      '-nostats',
      '-i',
      path,
      '-map',
      '0:v:0',
      '-vf',
      'showinfo',
      '-fps_mode',
      'passthrough',
      '-f',
      'null',
      '-',
    ],
    {
      signal,
      onStdoutLine(line) {
        const frameMatch = line.match(/^frame=(\d+)/)
        if (frameMatch) frames = Number(frameMatch[1])
        const timeMatch = line.match(/^out_time_us=(\d+)/)
        if (timeMatch) seconds = Number(timeMatch[1]) / 1_000_000
      },
      onStderrLine(line) {
        const match = line.match(/Stream #(0:\d+).*: Audio:/)
        if (match) audioStreams.add(match[1])
        const rate = line.match(/frame_rate:\s*(\d+)\/(\d+)/)
        if (rate && Number(rate[1]) > 0)
          frameSeconds = Number(rate[2]) / Number(rate[1])
        const timestamp = line.match(/\bpts_time:([\d.e+-]+)/)
        if (!timestamp) return
        const current = Number(timestamp[1])
        if (!Number.isFinite(current)) return
        if (firstTimestamp === undefined) firstTimestamp = current
        if (lastTimestamp !== undefined && current > lastTimestamp)
          frameSeconds = current - lastTimestamp
        lastTimestamp = current
      },
    },
  )
  // En FFmpeg6 out_time informa el PTS del último cuadro, no su extremo
  // derecho: sumarle su intervalo evita medir4s como3,96s a25FPS.
  if (firstTimestamp !== undefined && lastTimestamp !== undefined)
    seconds = lastTimestamp - firstTimestamp + frameSeconds
  if (frames <= 0 || seconds <= 0)
    throw new PipelineFailure(
      'animation_media_invalid',
      'the animation has no decodable video frames',
    )
  return { frames, seconds, audioStreams: audioStreams.size }
}

function frameFilter(frame: FrameSize): string {
  return (
    `scale=${frame.width}:${frame.height}:force_original_aspect_ratio=increase,` +
    `crop=${frame.width}:${frame.height},setsar=1`
  )
}

interface ReferenceOptions {
  frame: FrameSize
  signal?: AbortSignal
}

export async function normalizeAnimationReference(
  ffmpegPath: string,
  inputPath: string,
  outputPath: string,
  options: ReferenceOptions,
): Promise<void> {
  options.signal?.throwIfAborted()
  await ensureDirectory(dirname(outputPath))
  const temporaryPath = join(
    dirname(outputPath),
    `.${basename(outputPath)}.reference-tmp.jpg`,
  )
  try {
    await runFfmpeg(
      ffmpegPath,
      [
        '-i',
        inputPath,
        '-map',
        '0:v:0',
        '-vf',
        frameFilter(options.frame),
        '-frames:v',
        '1',
        '-an',
        '-q:v',
        '2',
        '-y',
        temporaryPath,
      ],
      { signal: options.signal },
    )
    await renameAtomic(temporaryPath, outputPath)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}

interface NormalizationOptions extends ReferenceOptions {
  startSeconds: number
  endSeconds: number
}

export async function normalizeAnimationFile(
  ffmpegPath: string,
  inputPath: string,
  outputPath: string,
  options: NormalizationOptions,
): Promise<{ normalizedSeconds: number; frames: number }> {
  options.signal?.throwIfAborted()
  const frames = slotFrames(options.startSeconds, options.endSeconds)
  if (!Number.isFinite(frames) || frames < 1)
    throw new PipelineFailure(
      'animation_media_invalid',
      'animation interval must contain at least one frame',
    )
  const source = await inspectAnimationFile(
    ffmpegPath,
    inputPath,
    options.signal,
  )
  const normalizedSeconds = frames / ANIMATION_FPS
  const stretch =
    1 / normalizeClipToSlot(source.seconds, normalizedSeconds).rate
  await ensureDirectory(dirname(outputPath))
  const temporaryPath = join(
    dirname(outputPath),
    `.${basename(outputPath)}.normalize-tmp.mp4`,
  )
  try {
    await runFfmpeg(
      ffmpegPath,
      [
        '-i',
        inputPath,
        '-map',
        '0:v:0',
        '-vf',
        `${frameFilter(options.frame)},setpts=${stretch}*(PTS-STARTPTS),fps=${ANIMATION_FPS},` +
          `tpad=stop_mode=clone:stop_duration=1,trim=end_frame=${frames},setpts=N/(${ANIMATION_FPS}*TB)`,
        '-frames:v',
        String(frames),
        '-an',
        '-sn',
        '-dn',
        '-map_metadata',
        '-1',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '20',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        '-y',
        temporaryPath,
      ],
      { signal: options.signal },
    )
    const result = await inspectAnimationFile(
      ffmpegPath,
      temporaryPath,
      options.signal,
    )
    if (
      result.audioStreams !== 0 ||
      result.frames !== frames ||
      Math.abs(result.seconds - normalizedSeconds) > 0.001
    )
      throw new PipelineFailure(
        'animation_media_invalid',
        'normalized animation failed duration, frame or silence validation',
      )
    await renameAtomic(temporaryPath, outputPath)
    return { normalizedSeconds, frames }
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}
