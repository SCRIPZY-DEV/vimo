import { writeFile } from 'node:fs/promises'

import { PipelineFailure } from '../runner/failure.ts'

// Descarga de un audio desde una URL arbitraria con tope de tamaño (la vía
// "elegir variación Suno" y "URL directa" de la música del editor). El tope
// corta ANTES de escribir a disco; el content-length, cuando viene, corta
// antes de descargar.

const DOWNLOAD_TIMEOUT_MS = 120_000

export async function downloadCappedAudio(
  rawUrl: string,
  destinationPath: string,
  maxBytes: number,
  signal: AbortSignal,
): Promise<void> {
  const url = assertHttpUrl(rawUrl)

  const requestSignal = AbortSignal.any([
    signal,
    AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  ])
  const response = await fetch(url, { signal: requestSignal }).catch(
    (error: unknown) => {
      if (signal.aborted) throw error
      throw new PipelineFailure(
        'music_download_failed',
        'audio download request failed',
      )
    },
  )
  if (!response.ok)
    throw new PipelineFailure(
      'music_download_failed',
      `audio download failed (status=${response.status})`,
    )

  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes)
    throw new PipelineFailure(
      'audio_too_large',
      `audio is ${declaredLength} bytes (max ${maxBytes})`,
    )

  const audio = Buffer.from(await response.arrayBuffer())
  if (audio.length === 0)
    throw new PipelineFailure(
      'music_download_failed',
      'audio download returned 0 bytes',
    )
  if (audio.length > maxBytes)
    throw new PipelineFailure(
      'audio_too_large',
      `audio is ${audio.length} bytes (max ${maxBytes})`,
    )

  await writeFile(destinationPath, audio)
}

function assertHttpUrl(rawUrl: string): string {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new PipelineFailure('invalid_audio_url', `not a URL: "${rawUrl}"`)
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
    throw new PipelineFailure(
      'invalid_audio_url',
      `unsupported protocol "${parsed.protocol}"`,
    )
  return parsed.toString()
}
