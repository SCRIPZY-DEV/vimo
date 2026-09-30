import { rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'

import { renameAtomic, writeFileAtomic } from '../../utils/atomic-fs.ts'
import {
  measureDurationSeconds,
  measureExactDurationSeconds,
} from '../../utils/media-duration.ts'
import type { FrameSize } from '../../types/video-format.ts'
import { FPS } from './constants.ts'
import { runRenderFfmpeg } from './render-ffmpeg.ts'

// Concat de chunks + mezcla final (port de concatenarChunks +
// mezclarAudioYColor): el demuxer concat pega los chunks SIN re-encode; la
// mezcla padea el video a la duración REAL del audio (tpad clonando el
// último frame — la voz jamás se corta), superpone el overlay
// (blend=screen), aplica el filtro de color del estilo y mezcla voz + BGM.
// La duración de salida va EXPLÍCITA con `-t` (NUNCA -shortest: con
// filter_complex es no determinístico y recortaba la voz — bug pagado).

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
  // Rutas ABSOLUTAS con / (el demuxer resuelve relativo a la lista; en
  // Windows los backslashes lo rompen).
  const concatList = chunkFiles
    .map(
      (chunk) =>
        `file '${resolve(chunk).replace(/\\/g, '/').replace(/'/g, "'\\''")}'`,
    )
    .join('\n')
  const listFile = join(dirname(outputFile), 'concat_list.txt')
  await writeFileAtomic(listFile, concatList)

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
  if (musicIndex >= 0) {
    filter +=
      `[${voiceIndex}:a]volume=${voiceVolume}[vozn];` +
      `[${musicIndex}:a]volume=${musicVolume}[bgmlow];` +
      `[vozn][bgmlow]amix=inputs=2:duration=first:dropout_transition=2,apad[finalaudio]`
  } else {
    filter += `[${voiceIndex}:a]volume=${voiceVolume},apad[finalaudio]`
  }

  // Se mezcla a un TEMPORAL y rename atómico: ffmpeg con -y TRUNCA el output
  // al abrirlo — sin esto, un render interrumpido dejaba el video anterior
  // (que estaba perfecto) en 0 bytes.
  const temporaryFile = join(
    dirname(outputFile),
    `.${basename(outputFile)}.render-tmp.mp4`,
  )
  try {
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
