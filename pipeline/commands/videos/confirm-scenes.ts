import { rm } from 'node:fs/promises'

import {
  readProjectMetadata,
  writeProjectMetadata,
} from '../../project/metadata.ts'
import {
  projectsRootOf,
  resolveProjectDir,
  resolveProjectPaths,
} from '../../project/paths.ts'
import { readScenes } from '../../project/scenes-file.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { ConfirmScenesPayload } from '../../types/video-project.ts'
import { writeFileAtomic } from '../../utils/atomic-fs.ts'
import {
  MAX_SECONDS_PER_SCENE,
  MIN_SECONDS_PER_SCENE,
} from '../../stages/scene-cuts/by-seconds.ts'
import { MAX_SCENE_COUNT } from './create-video-project.ts'

// Confirma la cantidad de escenas de la pausa awaiting-scene-confirmation
// (ADR-0013). Solo escribe scenes-confirmed.json y deja el proyecto listo:
// la UI relanza run-video-pipeline como job nuevo y las fases 1-2 son
// cache-hit (semántica del origen).
export async function confirmScenes(context: PipelineContext): Promise<null> {
  const payload = context.job.payload as ConfirmScenesPayload | undefined
  if (!payload?.projectId)
    throw new PipelineFailure(
      'invalid_payload',
      'payload.projectId is required',
    )

  // Exactamente UNO de los dos: el conteo clásico o los segundos del carril
  // de estilo propio. Los dos a la vez es un llamador confundido y ninguno
  // es una confirmación vacía.
  const sceneCount = payload.sceneCount
  const secondsPerScene = payload.secondsPerScene
  if ((sceneCount === undefined) === (secondsPerScene === undefined))
    throw new PipelineFailure(
      'invalid_payload',
      'payload must carry exactly one of sceneCount or secondsPerScene',
    )
  if (
    sceneCount !== undefined &&
    (!Number.isInteger(sceneCount) ||
      sceneCount < 1 ||
      sceneCount > MAX_SCENE_COUNT)
  )
    throw new PipelineFailure(
      'invalid_payload',
      `payload.sceneCount must be an integer between 1 and ${MAX_SCENE_COUNT}`,
    )
  if (
    secondsPerScene !== undefined &&
    (!Number.isInteger(secondsPerScene) ||
      secondsPerScene < MIN_SECONDS_PER_SCENE ||
      secondsPerScene > MAX_SECONDS_PER_SCENE)
  )
    throw new PipelineFailure(
      'invalid_payload',
      `payload.secondsPerScene must be an integer between ${MIN_SECONDS_PER_SCENE} and ${MAX_SECONDS_PER_SCENE}`,
    )

  const projectDir = resolveProjectDir(
    projectsRootOf(context),
    payload.projectId,
  )
  const paths = resolveProjectPaths(projectDir, payload.projectId)
  const metadata = await readProjectMetadata(paths)

  await writeFileAtomic(
    paths.scenesConfirmedFile,
    `${JSON.stringify(
      {
        ...(sceneCount !== undefined ? { sceneCount } : {}),
        ...(secondsPerScene !== undefined ? { secondsPerScene } : {}),
        confirmedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  )

  // Si el corte provisional tiene otra cantidad, se descarta: la Fase 3 lo
  // rehace con la cantidad confirmada (mismo comportamiento del origen). En
  // el carril de segundos el conteo resultante no se conoce acá: se descarta
  // siempre — el corte es determinístico y la Fase 3 lo rehace al instante
  // (en la pausa todavía no hay prompts que conservar).
  const provisionalScenes = await readScenes(paths)
  if (
    provisionalScenes &&
    (secondsPerScene !== undefined || provisionalScenes.length !== sceneCount)
  )
    await rm(paths.scenesFile, { force: true })

  metadata.state = 'generating'
  await writeProjectMetadata(paths, metadata)

  return null
}
