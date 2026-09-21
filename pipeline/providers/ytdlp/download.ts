import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'

import { PipelineFailure } from '../../runner/failure.ts'

// Descarga de BGM y overlay desde YouTube con yt-dlp (port de
// assets_downloader/downloader.ts). Único punto de spawn de yt-dlp en todo
// pipeline/ (guard por grep de ADR-0013). El soporte de cookies del origen
// (env YT_DLP_COOKIES_*) quedó diferido: si un video las exige, el error
// clasificado lo dice (ytdlp_needs_login).

// Solo https y hosts de YouTube: aunque el spawn usa array-args (sin shell),
// restringir el origen evita usar yt-dlp contra hosts arbitrarios (SSRF).
const ALLOWED_YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
])
// Id del proveedor en los fallos (ADR-0038). yt-dlp es un binario local:
// nunca hay status HTTP a mano.
const FAILURE_PROVIDER = 'ytdlp'

export interface YtDlpOptions {
  ytDlpPath: string
  // yt-dlp necesita ffmpeg para extraer/mergear; la ruta viaja explícita.
  ffmpegPath: string
  signal?: AbortSignal
}

export function requireYtDlpPath(ytDlpPath: string | undefined): string {
  if (!ytDlpPath)
    throw new PipelineFailure(
      'ytdlp_missing',
      'the job did not include binaryPaths.ytDlp',
      { provider: FAILURE_PROVIDER },
    )
  return ytDlpPath
}

// Normaliza ANTES de validar: muchos usuarios pegan el link sin esquema o
// con http://. La seguridad no cambia: al final se exige https + allowlist.
function normalizeUrl(raw: string): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return trimmed
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed))
    return `https://${trimmed}`
  return trimmed.replace(/^http:\/\//i, 'https://')
}

export function validateYouTubeUrl(rawUrl: string): string {
  const normalized = normalizeUrl(rawUrl)

  let url: URL
  try {
    url = new URL(normalized)
  } catch {
    throw new PipelineFailure(
      'ytdlp_invalid_url',
      `not a valid URL: "${rawUrl}"`,
      { provider: FAILURE_PROVIDER },
    )
  }

  if (url.protocol !== 'https:')
    throw new PipelineFailure(
      'ytdlp_invalid_url',
      'only https URLs are allowed',
      { provider: FAILURE_PROVIDER },
    )
  if (!ALLOWED_YOUTUBE_HOSTS.has(url.hostname.toLowerCase()))
    throw new PipelineFailure(
      'ytdlp_invalid_url',
      `host "${url.hostname}" is not YouTube`,
      { provider: FAILURE_PROVIDER },
    )

  return normalized
}

// Traduce el stderr crudo de yt-dlp a un code accionable (port de
// diagnosticarYtDlp, ~10 familias). El texto user-facing vive en i18n.
export function classifyYtDlpError(stderr: string): string {
  const text = stderr.toLowerCase()

  if (
    text.includes("sign in to confirm you're not a bot") ||
    text.includes('sign in to confirm your age') ||
    text.includes('login required') ||
    text.includes('cookies are no longer valid') ||
    text.includes('http error 403')
  )
    return 'ytdlp_needs_login'
  if (
    text.includes('not available in your country') ||
    text.includes('geo restriction') ||
    text.includes('video is not available in') ||
    text.includes('video is geo restricted')
  )
    return 'ytdlp_geo_restricted'
  if (text.includes('private video')) return 'ytdlp_private_video'
  if (
    text.includes('video unavailable') ||
    text.includes('video is unavailable')
  )
    return 'ytdlp_video_unavailable'
  if (
    text.includes('age-restricted') ||
    text.includes('age restricted') ||
    text.includes('inappropriate for some users')
  )
    return 'ytdlp_age_restricted'
  if (text.includes('members-only') || text.includes('join this channel'))
    return 'ytdlp_members_only'
  if (
    text.includes('removed for violating') ||
    text.includes('copyright') ||
    text.includes('dmca')
  )
    return 'ytdlp_copyright_removed'
  if (
    text.includes('getaddrinfo') ||
    text.includes('name resolution') ||
    text.includes('network is unreachable')
  )
    return 'ytdlp_network'
  if (text.includes('timed out')) return 'ytdlp_timeout'
  if (text.includes('ffmpeg not found') || text.includes('ffprobe not found'))
    return 'ffmpeg_missing'
  if (
    text.includes('unsupported url') ||
    text.includes('no video formats found') ||
    text.includes('unable to extract')
  )
    return 'ytdlp_unsupported_url'

  return 'ytdlp_failed'
}

async function runYtDlp(args: string[], options: YtDlpOptions): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    options.signal?.throwIfAborted()

    const child = spawn(options.ytDlpPath, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
    })

    // Cancelación cooperativa: si otra tarea paralela falla (la voz es
    // esencial), no dejamos un yt-dlp huérfano consumiendo red.
    const onAbort = () => {
      try {
        child.kill('SIGTERM')
      } catch {
        // Ya terminó.
      }
    }
    options.signal?.addEventListener('abort', onAbort, { once: true })

    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      options.signal?.removeEventListener('abort', onAbort)
      reject(
        new PipelineFailure(
          'ytdlp_failed',
          `could not run yt-dlp: ${error.message}`,
          { provider: FAILURE_PROVIDER },
        ),
      )
    })

    child.on('close', (code) => {
      options.signal?.removeEventListener('abort', onAbort)
      if (options.signal?.aborted) {
        reject(
          new PipelineFailure('cancelled', 'yt-dlp killed by cancellation', {
            provider: FAILURE_PROVIDER,
          }),
        )
        return
      }
      if (code === 0) {
        resolve()
        return
      }
      reject(
        new PipelineFailure(
          classifyYtDlpError(stderr),
          `yt-dlp exited with code ${code}: ${stderr.slice(-2000).trim()}`,
          { provider: FAILURE_PROVIDER },
        ),
      )
    })
  })
}

// Audio de un video de YouTube como mp3 (la vía BGM del formulario).
export async function downloadYouTubeAudio(
  rawUrl: string,
  outputPath: string,
  options: YtDlpOptions,
): Promise<void> {
  const url = validateYouTubeUrl(rawUrl)
  await runYtDlp(
    [
      url,
      '--extract-audio',
      '--audio-format',
      'mp3',
      '--output',
      outputPath,
      '--no-warnings',
      '--ffmpeg-location',
      options.ffmpegPath,
    ],
    options,
  )
  await assertDownloaded(outputPath)
}

// Video mp4 (overlay que el render mezcla con blend=screen).
export async function downloadYouTubeVideo(
  rawUrl: string,
  outputPath: string,
  options: YtDlpOptions,
): Promise<void> {
  const url = validateYouTubeUrl(rawUrl)
  await runYtDlp(
    [
      url,
      '--format',
      'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--output',
      outputPath,
      '--no-warnings',
      '--ffmpeg-location',
      options.ffmpegPath,
    ],
    options,
  )
  await assertDownloaded(outputPath)
}

async function assertDownloaded(outputPath: string): Promise<void> {
  try {
    const info = await stat(outputPath)
    if (info.isFile() && info.size > 0) return
  } catch {
    // Cae al throw de abajo.
  }
  throw new PipelineFailure(
    'ytdlp_failed',
    `yt-dlp finished without error but ${outputPath} is missing or empty`,
    { provider: FAILURE_PROVIDER },
  )
}
