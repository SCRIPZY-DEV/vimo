import { stat } from 'node:fs/promises'
import { join } from 'node:path'

import type { PipelineContext } from '../runner/context.ts'
import { PipelineFailure } from '../runner/failure.ts'

// Centraliza las rutas y el layout de cada proyecto de video. Las stages deben
// usar este mapa en lugar de construir rutas de archivos manualmente.
//
// <projectsRoot>/<slug>/
// ├── project.json  script.txt  narration.mp3  music.mp3  overlay.mp4
// ├── words.json  scenes.json  scenes-confirmed.json  visual-context.txt
// ├── subtitles.ass          (derivado de scenes.json; solo si options.subtitles)
// ├── scenes/scene_<id>.jpg      characters/reference_N.jpg
// ├── cache/chunks/              prompts.md
// ├── clips/clip_NN.mp4          (export para editar; regenerable, ADR-0014)
// └── <slug>.mp4

// Carpetas bajo <projectsRoot> que NO son proyectos: un proyecto no puede
// llamarse así (el slug colisionaría con la biblioteca o el historial).
export const RESERVED_ROOT_DIRECTORIES = new Set([
  'characters',
  '_history',
  '_styles',
])

const PROJECT_ID_PATTERN = /^[a-z0-9-]+$/

export interface ProjectPaths {
  root: string
  metadataFile: string
  scriptFile: string
  narrationFile: string
  musicFile: string
  overlayFile: string
  wordsFile: string
  scenesFile: string
  scenesConfirmedFile: string
  visualContextFile: string
  subtitlesFile: string
  scenesDirectory: string
  charactersDirectory: string
  chunksCacheDirectory: string
  clipsDirectory: string
  promptsExportFile: string
  videoFile: string
}

// Guard anti path-traversal: el id viene del webview (mismo criterio que la
// biblioteca de personajes).
export function assertValidProjectId(id: string): void {
  if (!PROJECT_ID_PATTERN.test(id) || RESERVED_ROOT_DIRECTORIES.has(id))
    throw new PipelineFailure('invalid_payload', `invalid project id "${id}"`)
}

// Filtra qué carpetas de la raíz entran al listado por su nombre (minúsculas,
// dígitos y guiones; ni `characters` ni `_history`). No abre la carpeta: si
// de verdad es un proyecto lo dice su project.json. Las carpetas del Vimo
// original (`Mi_Video`) no cumplen el patrón y quedan fuera a propósito
// (ADR-0014).
export function isProjectDirectoryName(name: string): boolean {
  return PROJECT_ID_PATTERN.test(name) && !RESERVED_ROOT_DIRECTORIES.has(name)
}

export function projectsRootOf(context: PipelineContext): string {
  const projectsRoot = context.job.projectsRoot
  if (!projectsRoot)
    throw new PipelineFailure(
      'missing_projects_root',
      'the job did not include projectsRoot',
    )

  return projectsRoot
}

export function resolveProjectDir(
  projectsRoot: string,
  projectId: string,
): string {
  assertValidProjectId(projectId)
  return join(projectsRoot, projectId)
}

export function resolveProjectPaths(
  projectDir: string,
  projectId: string,
): ProjectPaths {
  return {
    root: projectDir,
    metadataFile: join(projectDir, 'project.json'),
    scriptFile: join(projectDir, 'script.txt'),
    narrationFile: join(projectDir, 'narration.mp3'),
    musicFile: join(projectDir, 'music.mp3'),
    overlayFile: join(projectDir, 'overlay.mp4'),
    wordsFile: join(projectDir, 'words.json'),
    scenesFile: join(projectDir, 'scenes.json'),
    scenesConfirmedFile: join(projectDir, 'scenes-confirmed.json'),
    visualContextFile: join(projectDir, 'visual-context.txt'),
    subtitlesFile: join(projectDir, 'subtitles.ass'),
    scenesDirectory: join(projectDir, 'scenes'),
    charactersDirectory: join(projectDir, 'characters'),
    chunksCacheDirectory: join(projectDir, 'cache', 'chunks'),
    clipsDirectory: join(projectDir, 'clips'),
    promptsExportFile: join(projectDir, 'prompts.md'),
    // El video final lleva el nombre del proyecto (ADR-0009).
    videoFile: join(projectDir, `${projectId}.mp4`),
  }
}

export function sceneImageFile(paths: ProjectPaths, sceneId: number): string {
  return join(paths.scenesDirectory, `scene_${sceneId}.jpg`)
}

// «Válido» = existe y no está truncado (el criterio de cache-hit de cada
// stage, port de archivoValido del origen).
export async function isValidFile(path: string): Promise<boolean> {
  try {
    const info = await stat(path)
    return info.isFile() && info.size > 0
  } catch {
    return false
  }
}
