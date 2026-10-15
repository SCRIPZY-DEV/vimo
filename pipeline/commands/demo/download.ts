import { createHash } from 'node:crypto'
import { open } from 'node:fs/promises'

import { PipelineFailure } from '../../runner/failure.ts'
import { diskFullFailure } from './staging.ts'

// Descarga de una parte del pack por streaming (ADR-0029; partes en
// docs/handoff/2026-10-14-demo-v4/design.md §3): el archivo se escribe a
// medida que llega y el SHA-256 se calcula al vuelo — cientos de MB no pasan
// por memoria. fetch sigue los redirects de GitHub solo. Sin resume dentro de
// una parte a propósito: cada parte se baja entera o se reintenta de cero (la
// instalación sigue por partes, en demo-prepare); el SHA es la verdad final.
// Sin tope total: una conexión lenta pero viva baja la parte entera. Lo que
// corta un cuelgue (el Wi-Fi apagado, una conexión que queda abierta sin
// datos) es el tope de inactividad `idleMs`: sin respuesta o sin bytes nuevos
// por ese tiempo, la parte falla enseguida y el próximo intento sigue desde
// ella.

export interface DownloadProgress {
  receivedBytes: number
  // null cuando el servidor no manda content-length.
  totalBytes: number | null
}

// El tope de inactividad: `arm` (re)empieza la cuenta y, si vence antes del
// próximo `arm` o de `disarm`, corta su señal.
interface InactivityLimit {
  signal: AbortSignal
  arm(): void
  disarm(): void
}

// Devuelve el SHA-256 (hex minúscula) de lo descargado.
export async function downloadFile(
  url: string,
  destination: string,
  signal: AbortSignal,
  idleMs: number,
  onProgress: (progress: DownloadProgress) => void,
): Promise<string> {
  const idle = inactivityLimit(idleMs)
  try {
    return await receive(url, destination, signal, idle, onProgress)
  } finally {
    idle.disarm()
  }
}

async function receive(
  url: string,
  destination: string,
  signal: AbortSignal,
  idle: InactivityLimit,
  onProgress: (progress: DownloadProgress) => void,
): Promise<string> {
  // La cancelación del job o el tope de inactividad cortan el pedido.
  const requestSignal = AbortSignal.any([signal, idle.signal])
  idle.arm()
  const response = await fetch(url, { signal: requestSignal }).catch(
    (error: unknown) => {
      if (signal.aborted) throw error
      // Sin red, DNS caído, conexión rechazada o un servidor que no contesta:
      // fetch rechaza antes de tener respuesta.
      throw new PipelineFailure(
        'demo_offline',
        idle.signal.aborted
          ? 'demo pack request got no response in time'
          : 'demo pack request failed',
      )
    },
  )
  idle.disarm()
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
      // Solo cuenta la espera de la red: escribir en el disco no es estar
      // inactivo.
      idle.arm()
      const { done, value } = await reader.read()
      idle.disarm()
      if (done) break
      hash.update(value)
      await file.write(value)
      receivedBytes += value.length
      onProgress({ receivedBytes, totalBytes })
    }
  } catch (error) {
    if (signal.aborted) throw error
    // El disco se llenó al escribir la parte: no es un problema de la red.
    const diskFull = diskFullFailure(error)
    if (diskFull) throw diskFull
    throw new PipelineFailure(
      'demo_download_failed',
      idle.signal.aborted
        ? `demo pack download stalled after ${receivedBytes} bytes`
        : `demo pack download interrupted after ${receivedBytes} bytes`,
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

function inactivityLimit(limitMs: number): InactivityLimit {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  return {
    signal: controller.signal,
    arm() {
      clearTimeout(timer)
      timer = setTimeout(() => controller.abort(), limitMs)
    },
    disarm() {
      clearTimeout(timer)
    },
  }
}
