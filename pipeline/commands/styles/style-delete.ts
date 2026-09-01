import { rm } from 'node:fs/promises'

import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { StyleDeletePayload } from '../../types/styles.ts'
import { assertValidStyleId, styleDirectory } from './style-store.ts'

// Elimina un estilo propio (carpeta completa: style.json y muestras).
// Idempotente: borrar uno que ya no existe no es un error. Un proyecto que lo
// usó no se ve afectado — el estilo viaja como snapshot en su project.json.
export async function styleDelete(context: PipelineContext): Promise<null> {
  const payload = context.job.payload as StyleDeletePayload | undefined
  if (!payload?.id)
    throw new PipelineFailure('invalid_payload', 'payload.id is required')
  assertValidStyleId(payload.id)

  await rm(styleDirectory(context, payload.id), {
    recursive: true,
    force: true,
  })

  return null
}
