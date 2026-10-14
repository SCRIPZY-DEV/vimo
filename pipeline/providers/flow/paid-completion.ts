import { join } from 'node:path'
import { loadPipelineCharacters } from '../../project/characters.ts'
import { readProjectMetadata } from '../../project/metadata.ts'
import { isValidFile, sceneImageFile } from '../../project/paths.ts'
import { readScenes } from '../../project/scenes-file.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { CreateVideoContext } from '../../stages/context.ts'
import { flowSceneRequestRevision } from '../../stages/images/flow-lane.ts'
import type { FlowPaidCompletionRequest } from '../../types/flow-paid-completion.ts'
import { assertReceipt, flowCommand, readReadyBytes } from './client.ts'
import { importFlowImage } from './import-image.ts'
import { flowIntentDirectory, readFlowBatch, withFlowLock } from './storage.ts'
import type { FlowStatus } from './types.ts'

// La autorización sobrevive al reinicio. El proveedor gratuito y sus recibos
// conservan su identidad; la vía paga sólo recibe las escenas que faltaban.
export async function prepareFlowPaidCompletion(
  context: CreateVideoContext,
  request?: FlowPaidCompletionRequest,
): Promise<void> {
  const previous = context.metadata.flowPaidCompletion
  if (request === undefined && !previous) return
  const consent = request ?? previous
  if (
    !consent ||
    typeof consent.requestId !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      consent.requestId,
    ) ||
    !['evolink', 'fal'].includes(consent.provider) ||
    context.options.imageProvider !== 'flow' ||
    context.options.demo
  )
    throw new PipelineFailure(
      'invalid_payload',
      'Paid completion requires explicit valid consent for a Flow project',
    )
  if (
    previous &&
    (previous.requestId !== consent.requestId ||
      previous.provider !== consent.provider)
  )
    throw new PipelineFailure(
      'flow_intent_conflict',
      'Paid completion already has a durable provider and request',
    )
  if (!context.job.apiKeys[consent.provider])
    throw new PipelineFailure(
      'missing_api_key',
      'The selected paid image provider is not configured',
    )
  if (context.signal.aborted) context.signal.throwIfAborted()
  const scope = `scenes:${context.paths.root}`
  const directory = flowIntentDirectory(context, scope)
  await withFlowLock(join(directory, 'operation.lock'), async () => {
    const scenes = await readScenes(context.paths)
    if (!scenes?.length)
      throw new PipelineFailure(
        'scenes_missing',
        'Paid completion requires existing scenes',
      )
    const batch = await readFlowBatch(context, scope)
    if (previous && previous.batchId !== (batch?.batchId ?? null))
      throw new PipelineFailure(
        'flow_intent_conflict',
        'The free generation intent changed after paid consent',
      )
    // Recoger primero todo resultado ya listo. Si la verificación falla no
    // gastamos para sustituir a ciegas una imagen que puede ser recuperable.
    if (batch && !previous) {
      const snapshot = await flowCommand<FlowStatus>(context, {
        type: 'status',
      })
      if (snapshot.type !== 'bridge.status' || !Array.isArray(snapshot.jobs))
        throw new PipelineFailure(
          'flow_result_invalid',
          'Flow status is invalid',
        )
      for (const saved of batch.requests) {
        const scene = scenes.find((value) => String(value.id) === saved.key)
        if (!scene || scene.avatar) continue
        const destination = sceneImageFile(context.paths, scene.id)
        if (await isValidFile(destination)) continue
        const job = snapshot.jobs.find(
          (value) => value.imageJobId === saved.imageJobId,
        )
        if (!job || job.state !== 'ready') continue
        assertReceipt(saved, job)
        if (saved.destination !== destination)
          throw new PipelineFailure(
            'flow_result_invalid',
            'Flow destination changed',
          )
        const bytes = await readReadyBytes(context, saved)
        await importFlowImage(context, {
          destination,
          bytes,
          previousHash: saved.previousHash ?? null,
          async isCurrent() {
            const latest = (await readScenes(context.paths))?.find(
              (value) => value.id === scene.id,
            )
            const metadata = await readProjectMetadata(context.paths)
            return (
              !!latest &&
              !latest.avatar &&
              flowSceneRequestRevision(
                latest,
                { ...metadata.options, executionPlan: saved.executionPlan },
                await loadPipelineCharacters(
                  context.paths,
                  metadata.options.characters,
                ),
              ) === saved.revision
            )
          },
        })
      }
    }
    if (!previous) {
      const sceneIds: number[] = []
      for (const scene of scenes)
        if (
          !scene.avatar &&
          !(await isValidFile(sceneImageFile(context.paths, scene.id)))
        )
          sceneIds.push(scene.id)
      context.metadata.flowPaidCompletion = {
        ...consent,
        confirmedAt: new Date().toISOString(),
        sceneIds,
        batchId: batch?.batchId ?? null,
      }
      // El importador observa esta barrera bajo el mismo operation.lock. Un
      // recibo gratuito tardío permanece en la galería, sin pisar la imagen paga.
      await context.saveMetadata()
    }
    if (batch) {
      await flowCommand(context, {
        type: 'batch.cancel',
        batchId: batch.batchId,
      })
      const snapshot = await flowCommand<FlowStatus>(context, {
        type: 'status',
      })
      for (const saved of batch.requests.filter(
        (value) =>
          !value.imported &&
          snapshot.jobs.some((job) => job.imageJobId === value.imageJobId),
      )) {
        await flowCommand(context, {
          type: 'cancel',
          imageJobId: saved.imageJobId,
        })
      }
    }
  })
  context.options = { ...context.options, imageProvider: consent.provider }
  delete context.options.executionPlan
  delete context.options.imageQuality
}
