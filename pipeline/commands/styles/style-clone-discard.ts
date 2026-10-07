import { rm } from 'node:fs/promises'

import type { PipelineContext } from '../../runner/context.ts'
import type { StyleCloneDiscardPayload } from '../../types/style-clone.ts'
import {
  assertValidCloneSessionId,
  cloneSessionDirectory,
} from './style-clone-store.ts'

// Descarta una clonación de estilo: borra la carpeta de la sesión con su
// material y sus pruebas. Idempotente: descartar una que ya no está no es un
// error. Lo que ya se guardó (el estilo, el personaje) no vive ahí.
export async function styleCloneDiscard(
  context: PipelineContext,
): Promise<null> {
  const payload = context.job.payload as StyleCloneDiscardPayload | undefined
  assertValidCloneSessionId(payload?.sessionId)

  await rm(cloneSessionDirectory(context, payload.sessionId), {
    recursive: true,
    force: true,
  })

  return null
}
