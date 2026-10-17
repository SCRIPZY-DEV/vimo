import { lstat } from 'node:fs/promises'
import { withAnimationCheckpointLease } from '../../animation/coordination.ts'
import { join } from 'node:path'
import { PipelineFailure } from '../../runner/failure.ts'
import type { PipelineContext } from '../../runner/context.ts'
import {
  flowIntentDirectory,
  readFlowBatch,
  withFlowLock,
  assertFreshFlowRegenerationRequest,
} from './storage.ts'

// Un ámbito estable por escena mantiene la recuperación incluso sin memoria de UI.
// Los recibos anteriores del proyecto nunca se migran ni se descartan.
export async function flowRegenerationScope(
  context: PipelineContext,
  projectRoot: string,
  sceneIds: number[],
  requestId?: string,
): Promise<string> {
  const legacyScope = `scenes:${projectRoot}`
  if (!requestId || sceneIds.length !== 1) {
    await assertNoPendingSceneFlow(context, projectRoot, sceneIds)
    return legacyScope
  }
  const directory = flowIntentDirectory(context, legacyScope)
  const hasLegacy = await lstat(directory).then(
    () => true,
    (error) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
      throw error
    },
  )
  if (!hasLegacy) return `scene:${sceneIds[0]}:${projectRoot}`
  return withAnimationCheckpointLease(projectRoot, context.signal, () =>
    withFlowLock(join(directory, 'operation.lock'), async () => {
      const previous = await readFlowBatch(context, legacyScope)
      if (previous?.regenerationRequestIds?.includes(requestId))
        return legacyScope
      const overlap = previous?.requests.some((request) =>
        sceneIds.includes(Number(request.key)),
      )
      if (previous && !previous.completed && overlap) {
        if (previous.requests.length === 1) return legacyScope
        throw new PipelineFailure(
          'flow_review_required',
          'A historical batch still owns this scene; recover that batch before regenerating',
        )
      }
      await assertFreshFlowRegenerationRequest(context, legacyScope, requestId)
      return `scene:${sceneIds[0]}:${projectRoot}`
    }),
  )
}

export function flowSceneScopeTarget(scope: string): number | undefined {
  const match = /^scene:([1-9][0-9]*):/.exec(scope)
  if (!match) return undefined
  const id = Number(match[1])
  return Number.isSafeInteger(id) ? id : undefined
}

export function flowScopeProject(scope: string): string | undefined {
  if (scope.startsWith('scenes:')) return scope.slice('scenes:'.length)
  const target = flowSceneScopeTarget(scope)
  if (target === undefined) return undefined
  return scope.slice(`scene:${target}:`.length)
}

// Un relanzamiento del pipeline o un cliente antiguo no puede saltarse una
// intención de escena todavía pendiente y volver a comprarla en el scope global.
export async function assertNoPendingSceneFlow(
  context: PipelineContext,
  projectRoot: string,
  sceneIds: number[],
): Promise<void> {
  for (const id of sceneIds) {
    const scope = `scene:${id}:${projectRoot}`
    const directory = flowIntentDirectory(context, scope)
    const exists = await lstat(directory).then(
      () => true,
      (error) => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
        throw error
      },
    )
    if (!exists) continue
    await withFlowLock(join(directory, 'operation.lock'), async () => {
      const previous = await readFlowBatch(context, scope)
      if (previous && !previous.completed)
        throw new PipelineFailure(
          'flow_review_required',
          'A scene regeneration is still pending; preserve its receipt before creating another batch',
        )
    })
  }
}
