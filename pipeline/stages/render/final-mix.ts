import { rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'

import { renameAtomic, writeFileAtomic } from '../../utils/atomic-fs.ts'
import {
  measureDurationSeconds,
  measureExactDurationSeconds,
} from '../../utils/media-duration.ts'
import type { FrameSize } from '../../types/video-format.ts'
import { CHUNK_VIDEO_ENCODING_ARGS } from './chunk-renderer.ts'
import { FINAL_MIX_VIDEO_COPY, FPS } from './constants.ts'
import { runRenderFfmpeg, type RenderFfmpegOptions } from './render-ffmpeg.ts'

// Concat de chunks + mezcla final (port de concatenarChunks +
// mezclarAudioYColor): el demuxer concat pega los chunks SIN re-encode; la
// mezcla padea el video a la duración REAL del audio (tpad clonando el
// último frame — la voz jamás se corta), superpone el overlay
// (blend=screen), aplica el filtro de color del estilo y mezcla voz + BGM.
// La duración de salida va EXPLÍCITA con `-t` (NUNCA -shortest: con
// filter_complex es no determinístico y recortaba la voz — bug pagado).
//
// Sin nada que dibujar sobre la imagen (overlay, subtítulos, color) el video
// NO se recodifica: se copia tal cual y solo se codifica el audio. Las uniones
// entre chunks quedan como las dejó el concat (que ya copiaba), y el final
// congelado que hacía tpad sale de un tramo aparte con la codificación de los
// chunks.

// Rutas ABSOLUTAS con / (el demuxer resuelve relativo a la lista; en Windows
// los backslashes lo rompen).
function concatListOf(files: string[]): string {
  return files
    .map(
      (file) =>
        `file '${resolve(file).replace(/\\/g, '/').replace(/'/g, "'\\''")}'`,
    )
    .join('\n')
}

export async function concatChunks(
  ffmpegPath: string,
  chunkFiles: string[],
  outputFile: string,
  options: {
    totalSeconds?: number
    onProgress?(fraction: number): void
    signal?: AbortSignal
  } = {},
): Promise<void> {
  const listFile = join(dirname(outputFile), 'concat_list.txt')
  await writeFileAtomic(listFile, concatListOf(chunkFiles))

  await runRenderFfmpeg(
    ffmpegPath,
    [
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listFile,
      '-c',
      'copy',
      '-y',
      outputFile,
    ],
    'chunk concat',
    options,
  )
}

export interface FinalMixInputs {
  silentVideoFile: string
  narrationFile: string
  // Dimensiones del video (según el formato del proyecto).
  frame: FrameSize
  // Solo si el proyecto los tiene y el archivo es válido.
  musicFile?: string
  overlayFile?: string
  // Cadena de filtros de color del estilo ("" = natural).
  colorFilter: string
  // Filtro `subtitles=` ya armado (pipeline/stages/render/subtitles.ts);
  // ausente = video sin texto, cadena idéntica a la de siempre.
  subtitlesFilter?: string
  voiceVolume?: number
  musicVolume?: number
  // Segundos que se saltean del arranque de la música (Library, ADR-0014).
  musicOffsetSeconds?: number
}

// ¿La mezcla copia el video? Solo sin nada que dibujar encima. La barra de
// progreso lo consulta antes de los chunks para repartir el tiempo real.
export function mixCopiesVideo(
  inputs: Pick<
    FinalMixInputs,
    'overlayFile' | 'subtitlesFilter' | 'colorFilter'
  >,
): boolean {
  return (
    FINAL_MIX_VIDEO_COPY &&
    !inputs.overlayFile &&
    !inputs.subtitlesFilter &&
    inputs.colorFilter.trim().length === 0
  )
}

// Medio cuadro: el header del video y el reloj del audio redondean distinto.
const VIDEO_COPY_TOLERANCE_SECONDS = 0.5 / FPS

function clampVolume(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(0, Math.min(2, value))
}

export async function mixFinalVideo(
  ffmpegPath: string,
  inputs: FinalMixInputs,
  outputFile: string,
  options: {
    totalSeconds?: number
    onProgress?(fraction: number): void
    signal?: AbortSignal
  } = {},
): Promise<void> {
  // La medición decodifica el audio ENTERO y puede tardar: 0% explícito antes
  // para que la barra no quede muda.
  options.onProgress?.(0)

  const ffmpegInputs: string[] = ['-i', inputs.silentVideoFile]
  const colorChain =
    inputs.colorFilter.trim().length > 0 ? inputs.colorFilter : 'null'

  ffmpegInputs.push('-i', inputs.narrationFile)
  const voiceIndex = 1
  let nextIndex = 2

  let overlayIndex = -1
  if (inputs.overlayFile) {
    // Loop a nivel DEMUXER (-stream_loop -1 antes del -i): el filtro loop
    // buffeaba cientos de frames 1080p decodificados en RAM (~2.3 GB).
    ffmpegInputs.push('-stream_loop', '-1', '-i', inputs.overlayFile)
    overlayIndex = nextIndex++
  }

  let musicIndex = -1
  if (inputs.musicFile) {
    // `-ss` como opción de INPUT: la primera pasada arranca en el offset;
    // los loops siguientes vuelven al inicio del archivo.
    const offsetSeconds = inputs.musicOffsetSeconds ?? 0
    if (Number.isFinite(offsetSeconds) && offsetSeconds > 0)
      ffmpegInputs.push('-ss', offsetSeconds.toFixed(3))
    ffmpegInputs.push('-stream_loop', '-1', '-i', inputs.musicFile)
    musicIndex = nextIndex
  }

  // Padear el video a la duración REAL del audio: el audio maestro suele
  // durar más que el último timestamp (cola/silencio del TTS). El audio se
  // mide DECODIFICANDO (header VBR miente); el video mudo es CFR y su header
  // es fiable.
  const audioSeconds = await measureExactDurationSeconds(
    ffmpegPath,
    inputs.narrationFile,
  )
  const measuredVideoSeconds = await measureDurationSeconds(
    ffmpegPath,
    inputs.silentVideoFile,
  )
  const videoSeconds =
    measuredVideoSeconds > 0
      ? measuredVideoSeconds
      : (options.totalSeconds ?? 0)

  // El audio maestro fija el fin: solo se permite el cuadro necesario para
  // representarlo en CFR. No se añade la colita histórica de0,2s ni se
  // compensa una escena moviendo las siguientes.
  const outputSeconds =
    audioSeconds > 0 ? Math.ceil(audioSeconds * FPS - 1e-6) / FPS : videoSeconds
  const padSeconds = Math.max(0, outputSeconds - videoSeconds)

  // Port de filtroOverlay del origen: con 1920×1080 el string queda EXACTO
  // como siempre (byte-idéntico); con otra dimensión, un overlay 16:9
  // escalado a secas saldría deformado → escala cubriendo y recorta.
  const { width, height } = inputs.frame
  const overlayScale =
    width === 1920 && height === 1080
      ? `scale=${width}:${height},setpts=PTS-STARTPTS`
      : `scale=${width}:${height}:force_original_aspect_ratio=increase,` +
        `crop=${width}:${height},setpts=PTS-STARTPTS`

  // Los subtítulos van DESPUÉS del color del estilo: si no, el filtro los
  // tiñe junto con la imagen y el blanco deja de ser blanco.
  const videoChain = inputs.subtitlesFilter
    ? `${colorChain},${inputs.subtitlesFilter}`
    : colorChain

  let filter = `[0:v]tpad=stop_mode=clone:stop_duration=${padSeconds.toFixed(3)}[vpad];`
  if (overlayIndex >= 0) {
    filter +=
      `[${overlayIndex}:v]${overlayScale}[ovl];` +
      `[vpad][ovl]blend=all_mode=screen:shortest=1[blended];` +
      `[blended]${videoChain}[finalvideo];`
  } else {
    filter += `[vpad]${videoChain}[finalvideo];`
  }

  const voiceVolume = clampVolume(inputs.voiceVolume ?? 1.0, 1.0)
  const musicVolume = clampVolume(inputs.musicVolume ?? 0.15, 0.15)

  // `apad` rellena el audio con silencio para que nunca termine antes que el
  // video; `-t` fija la duración exacta.
  const audioFilter =
    musicIndex >= 0
      ? `[${voiceIndex}:a]volume=${voiceVolume}[vozn];` +
        `[${musicIndex}:a]volume=${musicVolume}[bgmlow];` +
        `[vozn][bgmlow]amix=inputs=2:duration=first:dropout_transition=2,apad[finalaudio]`
      : `[${voiceIndex}:a]volume=${voiceVolume},apad[finalaudio]`
  filter += audioFilter

  // Copiar exige que no haya nada que pintar y que el video no dure MÁS que
  // la salida: un recorte por copia no es exacto al cuadro (B-frames).
  const copyVideo =
    mixCopiesVideo(inputs) &&
    videoSeconds <= outputSeconds + VIDEO_COPY_TOLERANCE_SECONDS

  // Se mezcla a un TEMPORAL y rename atómico: ffmpeg con -y TRUNCA el output
  // al abrirlo — sin esto, un render interrumpido dejaba el video anterior
  // (que estaba perfecto) en 0 bytes.
  const temporaryFile = join(
    dirname(outputFile),
    `.${basename(outputFile)}.render-tmp.mp4`,
  )
  try {
    if (copyVideo)
      await mixCopyingVideo(
        ffmpegPath,
        {
          silentVideoFile: inputs.silentVideoFile,
          audioInputs: ffmpegInputs.slice(2),
          audioFilter,
          padFrames: Math.round(padSeconds * FPS),
          outputSeconds,
        },
        temporaryFile,
        options,
      )
    else
      await runRenderFfmpeg(
        ffmpegPath,
        [
          ...ffmpegInputs,
          '-filter_complex',
          filter,
          '-map',
          '[finalvideo]',
          '-map',
          '[finalaudio]',
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '23',
          '-c:a',
          'aac',
          '-b:a',
          '192k',
          '-t',
          outputSeconds.toFixed(3),
          '-y',
          temporaryFile,
        ],
        'final mix',
        options,
      )
    await renameAtomic(temporaryFile, outputFile)
  } catch (error) {
    // El temp parcial se descarta; el video anterior queda intacto.
    await rm(temporaryFile, { force: true })
    throw error
  }
}

// Camino sin recodificar: el video unido de los chunks pasa por copia y solo
// el audio se codifica. Si la voz dura más que las imágenes, el último cuadro
// congelado (lo que hacía tpad) se codifica APARTE con los argumentos de los
// chunks y se suma por el demuxer concat.
async function mixCopyingVideo(
  ffmpegPath: string,
  mix: {
    silentVideoFile: string
    // Entradas de audio en el orden del filtro: voz (1) y música (2).
    audioInputs: string[]
    audioFilter: string
    padFrames: number
    outputSeconds: number
  },
  outputFile: string,
  options: RenderFfmpegOptions,
): Promise<void> {
  const workDirectory = dirname(mix.silentVideoFile)
  const padFile = join(workDirectory, 'video_end_pad.mp4')
  const listFile = join(workDirectory, 'final_concat_list.txt')

  try {
    let videoInput = ['-i', mix.silentVideoFile]
    if (mix.padFrames > 0) {
      await renderEndPad(
        ffmpegPath,
        mix.silentVideoFile,
        mix.padFrames,
        padFile,
        options.signal,
      )
      await writeFileAtomic(
        listFile,
        concatListOf([mix.silentVideoFile, padFile]),
      )
      videoInput = ['-f', 'concat', '-safe', '0', '-i', listFile]
    }

    await runRenderFfmpeg(
      ffmpegPath,
      [
        ...videoInput,
        ...mix.audioInputs,
        '-filter_complex',
        mix.audioFilter,
        '-map',
        '0:v',
        '-map',
        '[finalaudio]',
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-t',
        mix.outputSeconds.toFixed(3),
        '-y',
        outputFile,
      ],
      'final mix (video copy)',
      options,
    )
  } finally {
    await rm(padFile, { force: true })
    await rm(listFile, { force: true })
  }
}

// El último cuadro del video, repetido `padFrames` veces. Se lee desde el
// final (-sseof) para no decodificar el video entero.
async function renderEndPad(
  ffmpegPath: string,
  silentVideoFile: string,
  padFrames: number,
  padFile: string,
  signal?: AbortSignal,
): Promise<void> {
  await runRenderFfmpeg(
    ffmpegPath,
    [
      '-sseof',
      '-1',
      '-i',
      silentVideoFile,
      '-filter_complex',
      `[0:v]reverse,trim=end_frame=1,setpts=PTS-STARTPTS,` +
        `tpad=stop_mode=clone:stop=${padFrames - 1},` +
        `settb=1/${FPS},setpts=N[out]`,
      '-map',
      '[out]',
      '-an',
      '-frames:v',
      String(padFrames),
      ...CHUNK_VIDEO_ENCODING_ARGS,
      '-y',
      padFile,
    ],
    'final pad',
    { signal },
  )
}
