import { rm } from 'node:fs/promises'

import { markVideoOutdated } from '../../project/metadata.ts'
import { readScenes, writeScenes } from '../../project/scenes-file.ts'
import { runStages } from '../../runner/run-stages.ts'
import type { CreateVideoContext } from '../../stages/context.ts'
import { transcriptionStage } from '../../stages/transcription/transcription.ts'
import type { Scene } from '../../types/scenes.ts'

// Post-paso común de todo reemplazo de narración (ADR-0014): re-transcribir
// el audio nuevo (el runner corre SOLO la stage transcription — su skip da
// false porque words.json se borró antes) y redistribuir los tiempos de las
// escenas EXISTENTES de manera uniforme sobre la duración nueva, preservando
// textos, prompts e imágenes (port de la redistribución del origen).
export async function retranscribeAndRedistribute(
  context: CreateVideoContext,
): Promise<void> {
  await rm(context.paths.wordsFile, { force: true })
  context.metadata.audioDurationSeconds = undefined
  context.metadata.wordCount = undefined
  await context.saveMetadata()

  await runStages([transcriptionStage], context)

  const durationSeconds = context.metadata.audioDurationSeconds ?? 0
  const scenes = await readScenes(context.paths)
  if (scenes && durationSeconds > 0)
    await writeScenes(
      context.paths,
      redistributeSceneTimes(scenes, durationSeconds),
    )

  await markVideoOutdated(context.paths, context.metadata)
}

// Reparto uniforme: n escenas sobre la duración total, la última cierra
// exacto en el final. Los cortes finos quedan en manos del editor.
export function redistributeSceneTimes(
  scenes: Scene[],
  durationSeconds: number,
): Scene[] {
  const step = durationSeconds / scenes.length
  return scenes.map((scene, index) => ({
    ...scene,
    startSeconds: roundSeconds(index * step),
    endSeconds:
      index === scenes.length - 1
        ? roundSeconds(durationSeconds)
        : roundSeconds((index + 1) * step),
  }))
}

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000
}
