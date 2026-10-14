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
// escenas EXISTENTES sobre la duración nueva (uniforme; con avatar, escalando
// el corte: redistributeSceneTimes), preservando textos, prompts e imágenes
// (port de la redistribución del origen).
export async function retranscribeAndRedistribute(
  context: CreateVideoContext,
): Promise<void> {
  await rm(context.paths.wordsFile, { force: true })
  context.metadata.audioDurationSeconds = undefined
  context.metadata.wordCount = undefined
  // La narración es otra (ADR-0057, diseño §11.4): sube la versión, así toda
  // escena de avatar renderizada con la anterior se lee desactualizada. Abajo
  // se redistribuyen los tiempos de todas las escenas, pero `scene.avatar` con
  // sus recibos de HeyGen no se toca: siguen pagados (regenerar puede reusar el
  // look y los assets). Este camino reescribe scenes.json entero y corre bajo
  // el lease exclusivo del proyecto (`replace-narration`), que excluye a los
  // generadores de recibos.
  context.metadata.narrationVersion =
    (context.metadata.narrationVersion ?? 0) + 1
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

// Reparto de los tiempos sobre la duración nueva. Sin escenas de avatar, el
// uniforme de siempre (los cortes finos quedan en manos del editor). Con
// avatar (ADR-0057) el corte se escala entero: cada frontera conserva su
// lugar relativo, así una aparición no queda de 2 s entre imágenes; queda
// desactualizada (narrationVersion) y conserva su recibo.
export function redistributeSceneTimes(
  scenes: Scene[],
  durationSeconds: number,
): Scene[] {
  if (!scenes.some((scene) => scene.avatar))
    return uniformSceneTimes(scenes, durationSeconds)

  const previousEnd = Math.max(
    0,
    ...scenes.map((scene) => scene.endSeconds ?? 0),
  )
  const timed = scenes.every(
    (scene) =>
      Number.isFinite(scene.startSeconds) && Number.isFinite(scene.endSeconds),
  )
  // Sin tiempos previos no hay corte que escalar: el reparto de siempre.
  if (!timed || previousEnd <= 0)
    return uniformSceneTimes(scenes, durationSeconds)

  const ratio = durationSeconds / previousEnd
  return scenes.map((scene, index) => {
    const last = index === scenes.length - 1
    return {
      ...scene,
      startSeconds:
        index === 0 ? 0 : roundSeconds((scene.startSeconds ?? 0) * ratio),
      endSeconds: last
        ? roundSeconds(durationSeconds)
        : roundSeconds((scene.endSeconds ?? 0) * ratio),
    }
  })
}

// Reparto uniforme: n escenas sobre la duración total, la última cierra
// exacto en el final.
function uniformSceneTimes(scenes: Scene[], durationSeconds: number): Scene[] {
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
