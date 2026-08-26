import type { Scene, SceneSummary } from '../types/scenes.ts'
import { readTextWithRetry, writeFileAtomic } from '../utils/atomic-fs.ts'
import { isValidFile, sceneImageFile, type ProjectPaths } from './paths.ts'

// Lectura/escritura de scenes.json (port de leerEscenasNormalizadas +
// persistencia incremental del origen). El pipeline completo escribe el
// archivo ENTERO tras cada escena procesada — es dueño de todas. La
// regeneración selectiva de Library es dueña SOLO de sus escenas: persiste
// con merge por id sobre lo que haya en disco (ADR-0014), así una edición
// del usuario hecha durante el job no se pisa.

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

// Merge por id: re-lee el disco y reemplaza SOLO las escenas de `ownedIds`
// por su versión de `changes`. El read-modify-write pegado al write achica
// la ventana de carrera con otras escrituras (la UI garantiza un solo job
// de regen por proyecto; esto cubre las ediciones del usuario en paralelo).
export async function mergeScenesById(
  paths: ProjectPaths,
  ownedIds: Set<number>,
  changes: Scene[],
): Promise<Scene[]> {
  const changesById = new Map<number, Scene>()
  for (const scene of changes) {
    if (ownedIds.has(scene.id)) changesById.set(scene.id, scene)
  }

  const onDisk = (await readScenes(paths)) ?? []
  const merged = onDisk.map((scene) => changesById.get(scene.id) ?? scene)
  await writeScenes(paths, merged)
  return merged
}

// La escritura de las stages: sin `ownedIds` (pipeline completo) escribe el
// archivo entero como siempre; con ellos (regeneración selectiva) persiste
// solo lo propio vía merge.
export async function writeScenesOwned(
  paths: ProjectPaths,
  scenes: Scene[],
  ownedIds?: Set<number>,
): Promise<void> {
  if (!ownedIds || ownedIds.size === 0) {
    await writeScenes(paths, scenes)
    return
  }
  await mergeScenesById(paths, ownedIds, scenes)
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
