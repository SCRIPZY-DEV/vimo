import { isValidFile, type ProjectPaths } from '../project/paths.ts'
import { PipelineFailure } from '../runner/failure.ts'
import type { Scene, TranscriptWord } from '../types/scenes.ts'
import { readTextWithRetry } from '../utils/atomic-fs.ts'
import {
  avatarResizeAudioEnd,
  avatarResizePlan,
  avatarResizeScenesOf,
  type AvatarResizePlan,
} from './resize-plan.ts'

// Lo que el plan de la duración de una aparición (resize-plan.ts, puro) toma
// del disco y cómo falla en un comando (entrega 2g, diseño §23.3): las palabras
// de words.json y el plan sobre scenes.json con su código como PipelineFailure.
// Lo comparten `avatar-render-scenes` con `durations` (render-scenes.ts) y el
// recorte (`avatar-trim-scene`), que así no depende de la orquestación de los
// renders: nunca habla con el proveedor.

// Las palabras de la narración (words.json): el corte de una duración nueva
// las necesita. Sin ellas no hay dónde cortar.
export async function readAvatarResizeWords(
  paths: ProjectPaths,
): Promise<TranscriptWord[]> {
  const missing = new PipelineFailure(
    'words_missing',
    'changing an avatar length needs words.json',
  )
  if (!(await isValidFile(paths.wordsFile))) throw missing

  let words: unknown
  try {
    words = JSON.parse(await readTextWithRetry(paths.wordsFile))
  } catch {
    throw missing
  }
  if (!Array.isArray(words) || words.length === 0) throw missing

  return words as TranscriptWord[]
}

// El plan para que la escena `sceneId` dure `seconds` sobre `scenes` (lo que
// hay en disco), o el fallo con su código (`avatar_resize_out_of_range` o
// `avatar_resize_locked`).
export function avatarResizePlanOrFail(
  scenes: readonly Scene[],
  words: readonly TranscriptWord[],
  sceneId: number,
  seconds: number,
): AvatarResizePlan {
  const resizeScenes = avatarResizeScenesOf(scenes)
  const outcome = avatarResizePlan(
    resizeScenes,
    words,
    sceneId,
    seconds,
    avatarResizeAudioEnd(resizeScenes),
  )
  if ('errorCode' in outcome)
    throw new PipelineFailure(
      outcome.errorCode,
      `avatar scene ${sceneId} cannot last ${seconds} s in its place`,
    )

  return outcome.plan
}
