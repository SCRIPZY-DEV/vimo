import type { Scene, SceneSummary } from '../types/scenes.ts'
import { readTextWithRetry, writeFileAtomic } from '../utils/atomic-fs.ts'
import { isValidFile, sceneImageFile, type ProjectPaths } from './paths.ts'

// Lectura/escritura de scenes.json (port de leerEscenasNormalizadas +
// persistencia incremental del origen). El pipeline completo escribe el
// archivo ENTERO tras cada escena procesada — es dueño de todas; el merge
// por id de la regeneración selectiva llega con Library (paso 7) y vivirá
// en este archivo.

// null = no hay escenas todavía (o el archivo no es utilizable): las fases
// que dependen de él lo regeneran.
export async function readScenes(paths: ProjectPaths): Promise<Scene[] | null> {
  if (!(await isValidFile(paths.scenesFile))) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(await readTextWithRetry(paths.scenesFile))
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null

  // Normalización defensiva: solo entradas con id numérico y texto string;
  // una corrupción parcial no debe tumbar el pipeline.
  const scenes: Scene[] = []
  for (const item of parsed as Scene[]) {
    if (typeof item?.id !== 'number' || typeof item.text !== 'string') continue
    scenes.push(item)
  }

  return scenes.length > 0 ? scenes : null
}

export async function writeScenes(
  paths: ProjectPaths,
  scenes: Scene[],
): Promise<void> {
  const ordered = [...scenes].sort((a, b) => a.id - b.id)
  await writeFileAtomic(
    paths.scenesFile,
    `${JSON.stringify(ordered, null, 2)}\n`,
  )
}

// Vista para la UI: deriva el estado de la imagen de la EXISTENCIA del
// archivo (la ruta no se persiste en scenes.json, ver types/scenes.ts).
export async function toSceneSummary(
  paths: ProjectPaths,
  scene: Scene,
): Promise<SceneSummary> {
  const summary: SceneSummary = {
    id: scene.id,
    text: scene.text,
    imageStatus: 'pending',
  }
  if (scene.imagePrompt) summary.imagePrompt = scene.imagePrompt
  if (scene.startSeconds !== undefined)
    summary.startSeconds = scene.startSeconds
  if (scene.endSeconds !== undefined) summary.endSeconds = scene.endSeconds

  const imagePath = sceneImageFile(paths, scene.id)
  if (await isValidFile(imagePath)) {
    summary.imagePath = imagePath
    summary.imageStatus = 'ok'
  }

  return summary
}

export async function toSceneSummaries(
  paths: ProjectPaths,
  scenes: Scene[],
): Promise<SceneSummary[]> {
  const summaries: SceneSummary[] = []
  for (const scene of scenes) {
    summaries.push(await toSceneSummary(paths, scene))
  }
  return summaries
}
