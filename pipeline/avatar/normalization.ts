import { readdir, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import { inspectAnimationFile } from '../animation/normalize-file.ts'
import {
  ANIMATION_FPS,
  frameBoundary,
  slotFrames,
} from '../animation/timing.ts'
import { PipelineFailure } from '../runner/failure.ts'
import type { FrameSize } from '../types/video-format.ts'
import { ensureDirectory, renameAtomic } from '../utils/atomic-fs.ts'
import { runFfmpeg } from '../utils/ffmpeg.ts'

// Preparación local del avatar de una escena (diseño §7.2, pasos 1 y 6). La
// narración manda (§7.3): el audio que viaja a HeyGen sale del tramo exacto en
// cuadros de 25 fps, y el clip que vuelve se ajusta a ese mismo tramo cuadro
// por cuadro —cortando el final o repitiendo el último cuadro—, sin cambiar
// nunca su velocidad y sin su audio. El render y el visor reproducen un clip a
// `clipSeconds / hueco` (diseño §10.1 y §10.2): el render toma `clipSeconds`
// del tramo (`slotDurationSeconds`, pipeline/stages/render/animated-scenes.ts),
// que por construcción es igual a `normalizedSeconds`, así que con el clip
// exacto esa razón es 1.

// Diferencia entre el video de HeyGen y el tramo a partir de la cual se avisa
// con un `log warn`. El clip se ajusta igual.
export const AVATAR_DURATION_TOLERANCE_SECONDS = 0.5
// WAV PCM mono a 44,1 kHz (diseño §7.2, paso 1).
const AUDIO_SAMPLE_RATE = 44_100
// Margen de la verificación del clip normalizado (el de los clips animados).
const DURATION_EPSILON_SECONDS = 0.001
// Un cuadro clave por segundo: el visor reajusta el clip cuando se desfasa
// 0,12 s (AVATAR_PREVIEW_RESYNC_SECONDS) y un GOP largo (x264 pone uno cada
// 250 cuadros) haría que cada reajuste decodifique segundos de video.
const KEYFRAME_INTERVAL_FRAMES = ANIMATION_FPS
// Los temporales de un corte y de una normalización: `.<archivo final><sufijo>`
// al lado del archivo final, que se renombra recién cuando salió bien.
const CUT_TEMPORARY_SUFFIX = '.cut-tmp.wav'
const NORMALIZE_TEMPORARY_SUFFIX = '.normalize-tmp.mp4'

// El tramo que se corta del audio y al que se ajusta el clip, en segundos (se
// cuantiza a cuadros de 25 fps acá). No es `AvatarSpan` del planificador
// (pipeline/avatar/planner.ts, con sus frases) y no se publica: solo los
// segundos y la cancelación.
interface AvatarCutSpan {
  startSeconds: number
  endSeconds: number
  signal?: AbortSignal
}

export interface AvatarClipNormalization {
  normalizedSeconds: number
  frames: number
  // Lo que duraba el video de HeyGen (solo la imagen: su audio se descarta).
  sourceSeconds: number
}

function temporaryPathOf(outputPath: string, suffix: string): string {
  return join(dirname(outputPath), `.${basename(outputPath)}${suffix}`)
}

// Borra los temporales de corte y de normalización que dejó un job matado (un
// SIGKILL no pasa por el `catch` que los borra; el `-y` siguiente los pisa,
// pero quedan si el pedido cambió). Solo los de los archivos que empiezan con
// `filePrefix` (los de una escena): otra escena puede estar cortando o
// normalizando a la vez. Quien llama tiene la escena tomada (el lease de
// escena). Best-effort: una carpeta que no existe o un archivo que no se puede
// borrar no frenan nada.
export async function removeStaleTemporaries(
  directory: string,
  filePrefix: string,
): Promise<void> {
  let names: string[]
  try {
    names = await readdir(directory)
  } catch {
    return
  }

  const stale = names.filter(
    (name) =>
      name.startsWith(`.${filePrefix}`) &&
      (name.endsWith(CUT_TEMPORARY_SUFFIX) ||
        name.endsWith(NORMALIZE_TEMPORARY_SUFFIX)),
  )
  await Promise.all(
    stale.map((name) =>
      rm(join(directory, name), { force: true }).catch(() => undefined),
    ),
  )
}

function spanFrames(span: AvatarCutSpan): number {
  const frames = slotFrames(span.startSeconds, span.endSeconds)
  if (!Number.isFinite(frames) || frames < 1)
    throw new PipelineFailure(
      'invalid_payload',
      'the avatar span must contain at least one frame',
    )

  return frames
}

// Corta la narración al tramo, con inicio y largo cuantizados a 25 fps (el
// reloj del render). Escribe a un temporal y lo renombra: un corte a medias
// nunca queda con el nombre final.
export async function cutAvatarAudio(
  ffmpegPath: string,
  narrationFile: string,
  outputPath: string,
  span: AvatarCutSpan,
): Promise<void> {
  span.signal?.throwIfAborted()
  const frames = spanFrames(span)
  const startSeconds = frameBoundary(span.startSeconds) / ANIMATION_FPS
  await ensureDirectory(dirname(outputPath))
  const temporaryPath = temporaryPathOf(outputPath, CUT_TEMPORARY_SUFFIX)
  try {
    await runFfmpeg(
      ffmpegPath,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-ss',
        startSeconds.toFixed(3),
        '-t',
        (frames / ANIMATION_FPS).toFixed(3),
        '-i',
        narrationFile,
        '-map',
        '0:a:0',
        '-vn',
        '-ar',
        String(AUDIO_SAMPLE_RATE),
        '-ac',
        '1',
        '-c:a',
        'pcm_s16le',
        '-f',
        'wav',
        '-y',
        temporaryPath,
      ],
      { signal: span.signal },
    )
    await renameAtomic(temporaryPath, outputPath)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}

// Ajusta el video de HeyGen al cuadro del render (escala y recorta al centro,
// sin deformar), a 25 fps contados desde el instante 0, y al tramo exacto: si
// es más largo se corta el final; si es más corto se repite el último cuadro.
// Nunca se acelera ni se frena: cada cuadro de HeyGen cae en el instante de su
// sílaba. Sin audio, subtítulos ni metadatos, y con un cuadro clave por segundo.
export async function normalizeAvatarClip(
  ffmpegPath: string,
  inputPath: string,
  outputPath: string,
  options: AvatarCutSpan & { frame: FrameSize },
): Promise<AvatarClipNormalization> {
  options.signal?.throwIfAborted()
  const frames = spanFrames(options)
  const normalizedSeconds = frames / ANIMATION_FPS
  const source = await inspectAnimationFile(
    ffmpegPath,
    inputPath,
    options.signal,
  )
  // El relleno alcanza para cubrir un video más corto que el tramo; lo que
  // sobra lo descarta el recorte por cuadros.
  const padSeconds = Math.max(
    1,
    Math.ceil(normalizedSeconds - source.seconds) + 1,
  )
  const { width, height } = options.frame
  await ensureDirectory(dirname(outputPath))
  const temporaryPath = temporaryPathOf(outputPath, NORMALIZE_TEMPORARY_SUFFIX)
  try {
    await runFfmpeg(
      ffmpegPath,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        inputPath,
        '-map',
        '0:v:0',
        '-vf',
        `scale=${width}:${height}:force_original_aspect_ratio=increase,` +
          `crop=${width}:${height},setsar=1,` +
          `fps=fps=${ANIMATION_FPS}:start_time=0,` +
          `tpad=stop_mode=clone:stop_duration=${padSeconds},trim=end_frame=${frames}`,
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
        '18',
        '-g',
        String(KEYFRAME_INTERVAL_FRAMES),
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
      Math.abs(result.seconds - normalizedSeconds) > DURATION_EPSILON_SECONDS
    )
      throw new PipelineFailure(
        'avatar_download_failed',
        'the normalized avatar clip failed the frame, duration or silence check',
      )

    await renameAtomic(temporaryPath, outputPath)
    return { normalizedSeconds, frames, sourceSeconds: source.seconds }
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}
