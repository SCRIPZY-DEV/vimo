import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { readProjectMetadata } from '../../project/metadata.ts'
import {
  isProjectDirectoryName,
  isValidFile,
  projectsRootOf,
  resolveProjectPaths,
  type ProjectPaths,
} from '../../project/paths.ts'
import type { PipelineContext } from '../../runner/context.ts'
import type {
  ListVideoProjectsResult,
  VideoProjectListItem,
  VideoProjectMetadata,
} from '../../types/video-project.ts'

// Listado de la biblioteca: escanea <projectsRoot> y arma una tarjeta por
// carpeta con project.json válido. Lo derivable del disco se deriva acá
// (hasVideo, imageCount, thumbnail) — la metadata puede quedar atrás tras un
// job interrumpido, el filesystem no. Una carpeta ajena o corrupta se salta
// sin romper el listado (patrón de music-history).

const SCENE_IMAGE_PATTERN = /^scene_(\d+)\.jpg$/

export async function listVideoProjects(
  context: PipelineContext,
): Promise<ListVideoProjectsResult> {
  const projectsRoot = projectsRootOf(context)

  let entries
  try {
    entries = await readdir(projectsRoot, { withFileTypes: true })
  } catch {
    // La raíz todavía no existe: biblioteca vacía, no error.
    return { projects: [] }
  }

  const projects: VideoProjectListItem[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (!isProjectDirectoryName(entry.name)) continue

    const item = await readListItem(projectsRoot, entry.name)
    if (item) projects.push(item)
  }

  projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return { projects }
}

async function readListItem(
  projectsRoot: string,
  projectId: string,
): Promise<VideoProjectListItem | null> {
  const paths = resolveProjectPaths(join(projectsRoot, projectId), projectId)

  let metadata: VideoProjectMetadata
  try {
    metadata = await readProjectMetadata(paths)
  } catch {
    return null
  }
  if (!hasListableShape(metadata)) return null

  const item: VideoProjectListItem = {
    id: projectId,
    name: metadata.name,
    createdAt: metadata.createdAt ?? '',
    updatedAt: metadata.updatedAt ?? '',
    state: metadata.state,
    hasVideo: await isValidFile(paths.videoFile),
    videoOutdated: metadata.videoOutdated === true,
    imageCount: 0,
  }
  if (metadata.errorCode) item.errorCode = metadata.errorCode
  if (metadata.options?.videoFormat)
    item.videoFormat = metadata.options.videoFormat
  if (metadata.sceneCount !== undefined) item.sceneCount = metadata.sceneCount

  await attachSceneImages(paths, item)
  return item
}

// Forma mínima para ser listable: los proyectos del Vimo original (metadata
// en español) o un project.json ajeno no la cumplen y se saltan.
function hasListableShape(metadata: VideoProjectMetadata): boolean {
  if (typeof metadata.id !== 'string' || metadata.id.length === 0) return false
  if (typeof metadata.name !== 'string' || metadata.name.length === 0)
    return false
  return typeof metadata.state === 'string'
}

// Cuenta las imágenes de escena y elige la de menor id como portada, con su
// mtime como cache-buster (la ruta no cambia al regenerar).
async function attachSceneImages(
  paths: ProjectPaths,
  item: VideoProjectListItem,
): Promise<void> {
  let fileNames: string[]
  try {
    fileNames = await readdir(paths.scenesDirectory)
  } catch {
    return
  }

  let thumbnailSceneId: number | null = null
  for (const fileName of fileNames) {
    const match = SCENE_IMAGE_PATTERN.exec(fileName)
    if (!match) continue
    item.imageCount += 1
    const sceneId = Number(match[1])
    if (thumbnailSceneId === null || sceneId < thumbnailSceneId)
      thumbnailSceneId = sceneId
  }
  if (thumbnailSceneId === null) return

  const thumbnailPath = join(
    paths.scenesDirectory,
    `scene_${thumbnailSceneId}.jpg`,
  )
  try {
    const info = await stat(thumbnailPath)
    if (!info.isFile() || info.size === 0) return
    item.thumbnailPath = thumbnailPath
    item.thumbnailMtimeMs = Math.round(info.mtimeMs)
  } catch {
    // Sin portada: la tarjeta muestra su placeholder.
  }
}
