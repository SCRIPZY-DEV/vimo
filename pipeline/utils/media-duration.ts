import { runFfmpeg } from './ffmpeg.ts'

// Medición de duración real de un media con ffmpeg, sin ffprobe (port de
// core/duracion_media.ts — por esto ffprobe no se empaqueta, ADR-0013).
// Devuelve 0 solo si la medición falla: el caller decide el fallback.
//
// Dos estrategias:
//  1. Header (`ffmpeg -i`): rápido, pero un MP3 VBR sin header Xing fiable
//     puede subestimar el largo.
//  2. Decodificación (`-f null -`): lee el último `time=` del progreso.
//     Lenta pero exacta — es la ÚNICA válida para el audio maestro: con el
//     header corto, la cola de la voz se cortaba al final del video.

const HEADER_TIMEOUT_MS = 30_000
const DECODE_TIMEOUT_MS = 120_000

function parseHms(text: string, regex: RegExp, useLast: boolean): number {
  const matches = [...text.matchAll(regex)]
  const match = useLast ? matches[matches.length - 1] : matches[0]
  if (!match) return 0

  return (
    parseInt(match[1], 10) * 3600 +
    parseInt(match[2], 10) * 60 +
    parseFloat(match[3])
  )
}

// Corre la medición sobre runFfmpeg (el único punto de spawn). El probe por
// header (`ffmpeg -i` sin salida) termina con código 1 a propósito: lo que
// importa es el stderr, que se junta línea a línea. Una medición trabada
// jamás cuelga el pipeline: el timeout la aborta y se devuelve 0.
async function measureWithFfmpeg(
  ffmpegPath: string,
  args: string[],
  timeoutMs: number,
  extract: (stderr: string) => number,
): Promise<number> {
  const timeout = AbortSignal.timeout(timeoutMs)
  let stderr = ''
  try {
    await runFfmpeg(ffmpegPath, args, {
      signal: timeout,
      onStderrLine(line) {
        stderr += `${line}\n`
      },
    })
  } catch {
    if (timeout.aborted) return 0
    // Código distinto de 0 (probe por header) o binario ausente: se intenta
    // extraer igual; sin datos, extract devuelve 0.
  }
  return extract(stderr)
}

// Duración por header con fallback a decodificación. Para video mudo CFR el
// header es fiable; para el audio maestro usá measureExactDurationSeconds.
export async function measureDurationSeconds(
  ffmpegPath: string,
  mediaPath: string,
): Promise<number> {
  const byHeader = await measureWithFfmpeg(
    ffmpegPath,
    ['-i', mediaPath],
    HEADER_TIMEOUT_MS,
    (stderr) =>
      parseHms(stderr, /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/g, false),
  )
  if (byHeader > 0) return byHeader

  return measureExactDurationSeconds(ffmpegPath, mediaPath)
}

// Duración EXACTA decodificando el archivo entero (salteando el header).
export async function measureExactDurationSeconds(
  ffmpegPath: string,
  mediaPath: string,
): Promise<number> {
  return measureWithFfmpeg(
    ffmpegPath,
    ['-i', mediaPath, '-f', 'null', '-'],
    DECODE_TIMEOUT_MS,
    (stderr) => parseHms(stderr, /time=\s*(\d+):(\d+):(\d+(?:\.\d+)?)/g, true),
  )
}
