import { createHash } from 'node:crypto'
import { open } from 'node:fs/promises'

import { PipelineFailure } from '../../runner/failure.ts'

// Descarga del pack por streaming (ADR-0029): el archivo se escribe a medida
// que llega y el SHA-256 se calcula al vuelo — 209 MB no pasan por memoria.
// fetch sigue los redirects de GitHub solo. Sin resume a propósito: el pack
// se baja entero o se reintenta de cero; el SHA es la verdad final.

// Tope generoso: en una conexión lenta el pack tarda minutos, no segundos.
const DOWNLOAD_TIMEOUT_MS = 30 * 60_000

export interface DownloadProgress {
  receivedBytes: number
  // null cuando el servidor no manda content-length.
  totalBytes: number | null
}

// Devuelve el SHA-256 (hex minúscula) de lo descargado.
export async function downloadFile(
  url: string,
  destination: string,
  signal: AbortSignal,
  onProgress: (progress: DownloadProgress) => void,
): Promise<string> {
  const requestSignal = AbortSignal.any([
    signal,
    AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  ])
  const response = await fetch(url, { signal: requestSignal }).catch(
    (error: unknown) => {
      if (signal.aborted) throw error
      // Sin red, DNS caído o conexión rechazada: fetch rechaza antes de
      // tener respuesta.
      throw new PipelineFailure('demo_offline', 'demo pack request failed')
    },
  )
  if (!response.ok || !response.body)
    throw new PipelineFailure(
      'demo_download_failed',
      `demo pack download failed (status=${response.status})`,
    )

  const declaredLength = Number(response.headers.get('content-length'))
  const totalBytes =
    Number.isFinite(declaredLength) && declaredLength > 0
      ? declaredLength
      : null

  const hash = createHash('sha256')
  const reader = response.body.getReader()
  const file = await open(destination, 'w')
  let receivedBytes = 0
  try {
    while (true) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      if (done) break
      hash.update(value)
      await file.write(value)
      receivedBytes += value.length
      onProgress({ receivedBytes, totalBytes })
    }
  } catch (error) {
    if (signal.aborted) throw error
    throw new PipelineFailure(
      'demo_download_failed',
      `demo pack download interrupted after ${receivedBytes} bytes`,
    )
  } finally {
    await file.close()
    await reader.cancel().catch(() => undefined)
  }

  if (receivedBytes === 0)
    throw new PipelineFailure(
      'demo_download_failed',
      'demo pack download returned 0 bytes',
    )
  return hash.digest('hex')
}
