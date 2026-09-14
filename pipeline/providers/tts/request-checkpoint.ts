import { readdir, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { PipelineFailure } from '../../runner/failure.ts'
import { readTextWithRetry, writeFileAtomic } from '../../utils/atomic-fs.ts'

// Un recibo por parte del proyecto, escrito ANTES del POST. No contiene
// claves ni texto: la huella identifica todos los parámetros del pedido.
export interface VoiceRequestReceipt {
  providerId?: string
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
  providerId: string,
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
    receipt = {
      providerId,
      fingerprint,
      startedAt: Date.now(),
      state: 'submitting',
    }
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

// Localiza el carril que aceptó el encargo ANTES de empezar el troceo:
// puede ser un fallback y su recibo puede corresponder a la segunda parte.
export async function pendingVoiceProvider(
  outputFile: string,
): Promise<string | null> {
  const prefix = `${basename(outputFile)}.request-`
  try {
    const names = await readdir(dirname(outputFile))
    const providers = new Set<string>()
    for (const name of names) {
      if (
        !name.startsWith(prefix) ||
        !/^\d+\.json$/.test(name.slice(prefix.length))
      )
        continue
      const receipt = JSON.parse(
        await readTextWithRetry(join(dirname(outputFile), name)),
      ) as VoiceRequestReceipt
      if (receipt.state === 'failed') continue
      if (receipt.state !== 'pending' && receipt.state !== 'submitting')
        throw new Error('invalid receipt state')
      if (typeof receipt.providerId !== 'string' || !receipt.providerId)
        throw new Error('pending receipt has no provider')
      providers.add(receipt.providerId)
    }
    if (providers.size > 1)
      throw new Error('conflicting pending voice providers')
    return providers.values().next().value ?? null
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    )
      return null
    throw new PipelineFailure(
      'voice_request_unresolved',
      'pending voice provider cannot be safely determined',
    )
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
