import {
  mkdir,
  mkdtemp,
  open,
  readFile,
  rm,
  writeFile,
  type FileHandle,
} from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { renameAtomic } from '../utils/atomic-fs.ts'
import { runFfmpeg } from '../utils/ffmpeg.ts'
import { PipelineFailure } from '../runner/failure.ts'
import type { SoundEffectInstance } from '../types/sound-effects.ts'
import { CLICK_EFFECT_BASE64 } from './click-effect.ts'

const SAMPLE_RATE = 48000
const CHANNELS = 2
const FLOAT_FRAME_BYTES = CHANNELS * 4
const PCM_FRAME_BYTES = CHANNELS * 2
const WAVE_HEADER_BYTES = 44
const MAX_WAVE_DATA_BYTES = 0xffffffff - WAVE_HEADER_BYTES

// Una decodificación del efecto y escrituras por posición: cientos de clicks
// no abren cientos de ffmpeg ni procesan minutos de silencio por cada efecto.
// Los temporales son dispersos; la memoria sólo contiene los tramos sonoros.
// Se suman en float sin recortar antes de aplicar el límite de picos una vez.
export async function renderSoundEffectsTrack(
  ffmpegPath: string,
  instances: SoundEffectInstance[],
  durationSeconds: number,
  outputFile: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  if (instances.length === 0) return undefined
  signal?.throwIfAborted()
  const totalFrames = Math.ceil(durationSeconds * SAMPLE_RATE)
  const dataBytes = totalFrames * PCM_FRAME_BYTES
  if (
    !Number.isSafeInteger(dataBytes) ||
    dataBytes <= 0 ||
    dataBytes > MAX_WAVE_DATA_BYTES
  )
    throw new PipelineFailure(
      'invalid_payload',
      'Sound effects timeline is too long for a WAV file',
    )

  await mkdir(dirname(outputFile), { recursive: true })
  const work = await mkdtemp(join(dirname(outputFile), '.sound-effects-'))
  let mixed: FileHandle | undefined
  let output: FileHandle | undefined
  try {
    const sourceFile = join(work, 'click.mp3')
    const decodedFile = join(work, 'click.f32')
    await writeFile(sourceFile, Buffer.from(CLICK_EFFECT_BASE64, 'base64'))
    await runFfmpeg(
      ffmpegPath,
      [
        '-i',
        sourceFile,
        '-vn',
        '-ar',
        String(SAMPLE_RATE),
        '-ac',
        String(CHANNELS),
        '-f',
        'f32le',
        '-y',
        decodedFile,
      ],
      { signal },
    )
    const decoded = await readFile(decodedFile)
    const effectFrames = decoded.length / FLOAT_FRAME_BYTES
    if (!Number.isInteger(effectFrames) || effectFrames <= 0)
      throw new PipelineFailure(
        'invalid_payload',
        'The built-in sound effect is unreadable',
      )
    mixed = await open(join(work, 'mix.f32'), 'wx+')
    await mixed.truncate(totalFrames * FLOAT_FRAME_BYTES)
    const ranges: { start: number; end: number }[] = []
    for (const instance of instances) {
      signal?.throwIfAborted()
      const start = Math.round(instance.startSeconds * SAMPLE_RATE)
      const anchored = instance.transitionSceneId !== undefined
      const end = Math.min(start + effectFrames, totalFrames)
      if (start < 0 || (!anchored && start + effectFrames > totalFrames))
        throw new PipelineFailure(
          'invalid_payload',
          'A sound effect would extend beyond the timeline',
        )
      // El último cambio también suena si su escena es más corta que el
      // efecto. Sólo la salida termina con el video; no se recorta la fuente.
      if (start >= totalFrames) continue
      const volume = instance.volume ?? 1
      if (volume === 0) continue
      const sampleBytes = (end - start) * FLOAT_FRAME_BYTES
      const samples = await readBlock(
        mixed,
        sampleBytes,
        start * FLOAT_FRAME_BYTES,
      )
      for (let index = 0; index < sampleBytes; index += 4)
        samples.writeFloatLE(
          samples.readFloatLE(index) + decoded.readFloatLE(index) * volume,
          index,
        )
      await writeBlock(mixed, samples, start * FLOAT_FRAME_BYTES)
      ranges.push({ start, end })
    }

    // Uniones solapadas se codifican una sola vez. El silencio permanece
    // disperso en disco, pero cualquier editor lo lee como PCM normal.
    const merged: { start: number; end: number }[] = []
    for (const range of ranges.sort(
      (left, right) => left.start - right.start,
    )) {
      const previous = merged.at(-1)
      if (previous && range.start <= previous.end)
        previous.end = Math.max(previous.end, range.end)
      else merged.push({ ...range })
    }
    const temporaryFile = join(work, 'effects.wav')
    output = await open(temporaryFile, 'wx+')
    await output.truncate(WAVE_HEADER_BYTES + dataBytes)
    await writeBlock(output, waveHeader(dataBytes), 0)
    for (const range of merged) {
      // Incluso miles de solapamientos contiguos no necesitan el tramo entero
      // en memoria: convertir en bloques de un segundo.
      for (let start = range.start; start < range.end; start += SAMPLE_RATE) {
        signal?.throwIfAborted()
        const frames = Math.min(SAMPLE_RATE, range.end - start)
        const floating = await readBlock(
          mixed,
          frames * FLOAT_FRAME_BYTES,
          start * FLOAT_FRAME_BYTES,
        )
        const pcm = Buffer.alloc(frames * PCM_FRAME_BYTES)
        for (let sample = 0; sample < frames * CHANNELS; sample++) {
          const value = limitPeak(floating.readFloatLE(sample * 4))
          pcm.writeInt16LE(Math.round(value * 32767), sample * 2)
        }
        await writeBlock(
          output,
          pcm,
          WAVE_HEADER_BYTES + start * PCM_FRAME_BYTES,
        )
      }
    }
    await output.sync()
    await output.close()
    output = undefined
    signal?.throwIfAborted()
    await renameAtomic(temporaryFile, outputFile)
    return outputFile
  } finally {
    await output?.close()
    await mixed?.close()
    await rm(work, { recursive: true, force: true })
  }
}

function limitPeak(sample: number): number {
  const absolute = Math.abs(sample)
  if (absolute <= 0.98) return sample
  return (
    Math.sign(sample) *
    (0.98 + 0.02 * (1 - Math.exp(-(absolute - 0.98) / 0.02)))
  )
}

function waveHeader(dataBytes: number): Buffer {
  const header = Buffer.alloc(WAVE_HEADER_BYTES)
  header.write('RIFF', 0)
  header.writeUInt32LE(dataBytes + 36, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(CHANNELS, 22)
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(SAMPLE_RATE * PCM_FRAME_BYTES, 28)
  header.writeUInt16LE(PCM_FRAME_BYTES, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(dataBytes, 40)
  return header
}

async function readBlock(
  file: FileHandle,
  length: number,
  position: number,
): Promise<Buffer> {
  const bytes = Buffer.alloc(length)
  let offset = 0
  while (offset < length) {
    const { bytesRead } = await file.read(
      bytes,
      offset,
      length - offset,
      position + offset,
    )
    if (bytesRead === 0) break
    offset += bytesRead
  }
  return bytes
}

async function writeBlock(
  file: FileHandle,
  bytes: Buffer,
  position: number,
): Promise<void> {
  let offset = 0
  while (offset < bytes.length) {
    const { bytesWritten } = await file.write(
      bytes,
      offset,
      bytes.length - offset,
      position + offset,
    )
    if (bytesWritten === 0)
      throw new Error('Sound effect file write made no progress')
    offset += bytesWritten
  }
}
