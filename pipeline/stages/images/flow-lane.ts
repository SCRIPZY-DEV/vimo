import {
  buildCustomStyleReferencePrompt,
  buildReferenceIdentityLineMulti,
} from '../../prompts/character-reference.ts'
import { isValidPrompt } from '../../prompts/prompt-limits.ts'
import { loadPipelineCharacters } from '../../project/characters.ts'
import type { VideoProjectOptions } from '../../types/video-project.ts'
import {
  markVideoOutdated,
  readProjectMetadata,
} from '../../project/metadata.ts'
import { isValidFile, sceneImageFile } from '../../project/paths.ts'
import { readScenes } from '../../project/scenes-file.ts'
import {
  flowReference,
  generateFlowBatch,
} from '../../providers/flow/client.ts'
import {
  imageFileHash,
  importFlowImage,
} from '../../providers/flow/import-image.ts'
import { flowHash } from '../../providers/flow/storage.ts'
import {
  assertFlowPlanProvider,
  flowExecutionRevision,
} from '../../providers/flow/execution-plan.ts'
import type {
  FlowImageRequest,
  FlowSavedRequest,
} from '../../providers/flow/types.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import { FLOW_IMAGE_MODEL } from '../../types/image-provider.ts'
import type { Scene } from '../../types/scenes.ts'
import { videoFormatOf } from '../../types/video-format.ts'
import type { CreateVideoContext } from '../context.ts'
import type { ImageLaneEvents } from './lane.ts'

interface FlowCharacter {
  name: string
  description: string
  imageDataUri?: string
}

// Dev genera una imagen propia por escena, también en silencios. El alias
// visualSourceSceneId sólo lee imágenes heredadas cuando no existe la propia
// (resolveSceneImageSourceId); regenerar nunca pisa la imagen de otra escena.
export function flowTargetSceneId(scene: Scene): number {
  return scene.id
}

function sceneRevision(scene: Scene): string {
  return flowHash(
    JSON.stringify([
      scene.id,
      flowTargetSceneId(scene),
      scene.text,
      scene.imagePrompt,
      scene.userPrompt,
      scene.charactersPresent,
      scene.direction,
    ]),
  )
}

function projectRevision(
  options: VideoProjectOptions,
  characters: FlowCharacter[],
): string {
  return flowHash(
    JSON.stringify([
      videoFormatOf(options),
      options.styleId,
      options.customStyle,
      characters.map((character) => [
        character.name,
        character.description,
        character.imageDataUri ? flowHash(character.imageDataUri) : null,
      ]),
    ]),
  )
}

// Misma revisión para decidir recuperación antes de redactar y para publicar
// el resultado: no basta con comparar el prompt ni el identificador del clic.
export function flowSceneRequestRevision(
  scene: Scene,
  options: VideoProjectOptions,
  characters: FlowCharacter[],
): string {
  const legacyRevision = flowHash(
    sceneRevision(scene) + projectRevision(options, characters),
  )
  return flowExecutionRevision(legacyRevision, options.executionPlan)
}

export async function generateFlowScenes(
  context: CreateVideoContext,
  scenes: Scene[],
  characters: FlowCharacter[],
  forceRegenerate: Set<number>,
  events: ImageLaneEvents,
): Promise<Scene[]> {
  const executionPlan = assertFlowPlanProvider(
    context.options.executionPlan,
    context.options.imageProvider,
  )
  const persisted = await readScenes(context.paths)
  if (!persisted)
    throw new PipelineFailure(
      'scenes_missing',
      'Flow needs the saved scene revision',
    )
  const currentById = new Map(persisted.map((scene) => [scene.id, scene]))
  const targets = new Map<number, Scene>()
  const only = context.regenerateSceneIds
  for (const scene of scenes) {
    if (only?.size && !only.has(scene.id)) continue
    const target = flowTargetSceneId(scene)
    if (!targets.has(target))
      targets.set(
        target,
        scenes.find((candidate) => candidate.id === target) ?? scene,
      )
  }
  const format = videoFormatOf(context.options)
  const project = projectRevision(context.options, characters)
  for (const [index, character] of (context.options.characters ?? [])
    .filter((character) => character.name?.trim())
    .entries()) {
    if (
      character.mode === 'photo' &&
      character.referenceImageFile &&
      !characters[index]?.imageDataUri
    )
      throw new PipelineFailure(
        'flow_result_invalid',
        'The saved character reference is missing or invalid',
      )
  }
  // Una sola intención pendiente por proyecto: pasar de Crear al editor o
  // cambiar la selección no puede ocultar un intento remoto incierto.
  const scope = `scenes:${context.paths.root}`
  const legacyRevision = flowHash(
    JSON.stringify(
      [...targets].map(([target, scene]) => [
        target,
        scene.imagePrompt,
        scene.userPrompt,
        scene.charactersPresent,
        project,
      ]),
    ),
  )
  const revision = flowExecutionRevision(legacyRevision, executionPlan)
  const requests: FlowImageRequest[] = []
  for (const [target, scene] of targets) {
    const destination = sceneImageFile(context.paths, target)
    const forced = [...forceRegenerate].some(
      (id) =>
        flowTargetSceneId(
          scenes.find((candidate) => candidate.id === id) ?? scene,
        ) === target,
    )
    if (!forced && (await isValidFile(destination))) {
      for (const dependent of scenes.filter(
        (candidate) => flowTargetSceneId(candidate) === target,
      ))
        events.onReady(dependent.id, destination)
      continue
    }
    if (!isValidPrompt(scene.imagePrompt))
      throw new PipelineFailure(
        'catalog_prompts_incomplete',
        'Flow requires the existing scene prompt',
      )
    const references = (scene.charactersPresent ?? []).flatMap((index) => {
      const character = characters[index]
      if (!character?.imageDataUri) return []
      return [
        flowReference(
          `character-${index}`,
          character.name,
          character.imageDataUri,
        ),
      ]
    })
    const prompt =
      references.length === 0
        ? scene.imagePrompt
        : context.options.customStyle
          ? buildCustomStyleReferencePrompt(
              references[0].name,
              scene.imagePrompt,
            )
          : buildReferenceIdentityLineMulti(
              references.map((reference) => reference.name),
              format,
            ) + scene.imagePrompt
    const savedScene = currentById.get(scene.id)
    if (!savedScene)
      throw new PipelineFailure(
        'flow_result_obsolete',
        'The target scene no longer exists',
      )
    requests.push({
      key: String(target),
      prompt,
      aspectRatio: format,
      references,
      destination,
      revision: flowSceneRequestRevision(
        savedScene,
        context.options,
        characters,
      ),
      previousHash: await imageFileHash(destination),
    })
  }
  if (requests.length === 0) return scenes
  const observed = new Set<number>()
  const started = new Set<number>()
  const succeeded = new Set<number>()
  const failed = new Set<number>()
  const lastState = new Map<number, string>()
  context.flowReadySceneIds ??= new Set<number>()
  async function isCurrentRequest(request: FlowSavedRequest) {
    const source = targets.get(Number(request.key))
    if (!source) return false
    const latest = (await readScenes(context.paths))?.find(
      (scene) => scene.id === source.id,
    )
    if (!latest) return false
    const metadata = await readProjectMetadata(context.paths)
    const latestCharacters = await loadPipelineCharacters(
      context.paths,
      metadata.options.characters,
    )
    return (
      // El editor puede elegir Tools/RPC sin reescribir las opciones del
      // proyecto. El contenido actual se compara con el plan del recibo.
      flowSceneRequestRevision(
        latest,
        { ...metadata.options, executionPlan: request.executionPlan },
        latestCharacters,
      ) === request.revision
    )
  }
  function markReady(target: number, destination: string) {
    for (const scene of scenes.filter(
      (candidate) => flowTargetSceneId(candidate) === target,
    )) {
      succeeded.add(scene.id)
      context.flowReadySceneIds?.add(scene.id)
      events.onReady(scene.id, destination)
    }
  }
  try {
    await generateFlowBatch(context, {
      scope,
      revision,
      requests,
      ...(executionPlan ? { executionPlan } : {}),
      explicitRegenerationRequestId: context.flowRegenerationRequestId,
      async restoreImported(request) {
        const target = Number(request.key)
        const destination = sceneImageFile(context.paths, target)
        if (
          !targets.has(target) ||
          request.destination !== destination ||
          typeof request.importedHash !== 'string' ||
          !/^[a-f0-9]{64}$/.test(request.importedHash)
        )
          return false
        if (!(await isCurrentRequest(request))) return false
        if ((await imageFileHash(destination)) !== request.importedHash)
          return false
        markReady(target, destination)
        return true
      },
      onState(request, state) {
        const target = Number(request.key)
        const active = ['uploading', 'generating', 'downloading'].includes(
          state,
        )
        for (const scene of scenes.filter(
          (candidate) => flowTargetSceneId(candidate) === target,
        )) {
          observed.add(scene.id)
          // Una recuperación explícita en la extensión puede reabrir la misma
          // solicitud. Un ready repetido no resuelve un fallo local de importación.
          if (
            failed.has(scene.id) &&
            ![
              'failed',
              'unknown',
              'canceled',
              'deleted',
              'download_failed',
            ].includes(state) &&
            (state !== 'ready' || lastState.get(scene.id) !== 'ready')
          ) {
            failed.delete(scene.id)
            started.delete(scene.id)
          }
          lastState.set(scene.id, state)
          if (active && !started.has(scene.id)) {
            started.add(scene.id)
            events.onStarted(scene.id, 1)
          }
          events.onProgress(
            scene.id,
            state === 'ready' || state === 'downloading' ? 95 : 0,
            state,
          )
        }
      },
      onFailed(request, code) {
        const target = Number(request.key)
        for (const scene of scenes.filter(
          (candidate) => flowTargetSceneId(candidate) === target,
        )) {
          if (succeeded.has(scene.id) || failed.has(scene.id)) continue
          failed.add(scene.id)
          events.onFailed(scene.id, code)
        }
      },
      async onReady(request, bytes) {
        const target = Number(request.key)
        const destination = sceneImageFile(context.paths, target)
        if (request.destination !== destination)
          throw new PipelineFailure(
            'flow_result_invalid',
            'Flow destination does not match the project',
          )
        const source = targets.get(target)
        if (!source)
          throw new PipelineFailure(
            'flow_result_obsolete',
            'Flow target is no longer part of this operation',
          )
        const importedHash = await importFlowImage(context, {
          destination,
          bytes,
          previousHash: request.previousHash ?? null,
          isCurrent() {
            return isCurrentRequest(request)
          },
        })
        // Guardar invalidación ANTES del evento: también sobrevive a un lote
        // parcial o a una caída antes de que el subcomando termine.
        const metadata = await readProjectMetadata(context.paths)
        await markVideoOutdated(context.paths, metadata)
        context.metadata.videoOutdated = metadata.videoOutdated
        markReady(target, destination)
        return importedHash
      },
    })
  } catch (error) {
    // El fallo del observador no demuestra que fallaron los demás trabajos:
    // pueden seguir en Flow. Conservarlos pendientes de sincronización sin
    // inventar otra admisión ni dejar un spinner de un job local ya cerrado.
    for (const sceneId of observed) {
      if (succeeded.has(sceneId) || failed.has(sceneId)) continue
      events.onProgress(sceneId, 0, 'awaiting_sync')
    }
    throw error
  }
  return scenes.map((scene) =>
    succeeded.has(scene.id)
      ? { ...scene, imageModel: FLOW_IMAGE_MODEL, contentRejected: false }
      : scene,
  )
}
