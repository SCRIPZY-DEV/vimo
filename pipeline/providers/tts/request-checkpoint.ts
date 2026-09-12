import { rm } from 'node:fs/promises'
import { PipelineFailure } from '../../runner/failure.ts'
import { readTextWithRetry, writeFileAtomic } from '../../utils/atomic-fs.ts'

// Un recibo por parte del proyecto, escrito ANTES del POST. No contiene
// claves ni texto: la huella identifica todos los parámetros del pedido.
export interface VoiceRequestReceipt {
  fingerprint: string
  startedAt: number
  state: 'submitting' | 'pending' | 'failed'
  taskId?: string
  resultUrl?: string
  percent?: number
}

export interface VoiceRequestCheckpoint {
  readonly receipt: VoiceRequestReceipt
  update(patch: Partial<VoiceRequestReceipt>): Promise<void>
}

export function voiceRequestFile(outputFile: string, index: number): string {
  return `${outputFile}.request-${index}.json`
}

export async function openVoiceRequest(
  path: string,
  fingerprint: string,
): Promise<VoiceRequestCheckpoint> {
  let receipt: VoiceRequestReceipt | null = null
  try {
    const parsed = JSON.parse(
      await readTextWithRetry(path),
    ) as VoiceRequestReceipt
    if (
      typeof parsed.fingerprint !== 'string' ||
      !Number.isFinite(parsed.startedAt) ||
      !['submitting', 'pending', 'failed'].includes(parsed.state) ||
      (parsed.taskId !== undefined &&
        (typeof parsed.taskId !== 'string' || !parsed.taskId)) ||
      (parsed.resultUrl !== undefined &&
        (typeof parsed.resultUrl !== 'string' ||
          !/^https?:\/\//.test(parsed.resultUrl))) ||
      (parsed.percent !== undefined &&
        (!Number.isFinite(parsed.percent) ||
          parsed.percent < 0 ||
          parsed.percent > 100))
    )
      throw new Error('invalid voice receipt')
    receipt = parsed
  } catch (error) {
    if (!(
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ))
      throw new PipelineFailure(
        'voice_request_unresolved',
        'voice receipt could not be read; refusing another submission',
      )
  }

  if (receipt && receipt.state !== 'failed') {
    if (
      receipt.fingerprint !== fingerprint ||
      (!receipt.taskId && !receipt.resultUrl)
    )
      throw new PipelineFailure(
        'voice_request_unresolved',
        'previous voice submission has no recoverable matching receipt',
      )
  } else {
    receipt = { fingerprint, startedAt: Date.now(), state: 'submitting' }
    await writeFileAtomic(path, JSON.stringify(receipt))
  }

  let current = receipt
  return {
    get receipt() {
      return current
    },
    async update(patch) {
      const next = { ...current, ...patch }
      // Primero disco: nunca confirmar en memoria algo que no sobrevivirá.
      await writeFileAtomic(path, JSON.stringify(next))
      current = next
    },
  }
}

// Se borra solo DESPUÉS de guardar el audio y su manifest.
export async function clearVoiceRequest(
  outputFile: string,
  index: number,
): Promise<void> {
  await rm(voiceRequestFile(outputFile, index), { force: true })
}

export function isUnsettledVoiceRequest(error: unknown): boolean {
  return (
    error instanceof PipelineFailure &&
    (error.code === 'voice_request_pending' ||
      error.code === 'voice_request_unresolved')
  )
}
