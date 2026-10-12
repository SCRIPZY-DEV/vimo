import { flowVideoIsOutdated } from './flow-video-outdated.ts'
import { PipelineFailure } from '../runner/failure.ts'
import type { VideoProjectMetadata } from '../types/video-project.ts'
import { readTextWithRetry, writeFileAtomicStrict } from '../utils/atomic-fs.ts'
import { isValidFile, type ProjectPaths } from './paths.ts'

// Lectura/escritura de project.json. La metadata es la fuente de verdad del
// estado del proyecto entre jobs (el sidecar es un proceso por job: todo lo
// que debe sobrevivir vive en disco).

export async function readProjectMetadata(
  paths: ProjectPaths,
): Promise<VideoProjectMetadata> {
  if (!(await isValidFile(paths.metadataFile)))
    throw new PipelineFailure(
      'project_not_found',
      `no project.json in ${paths.root}`,
    )

  try {
    const raw = await readTextWithRetry(paths.metadataFile)
    const metadata = JSON.parse(raw) as VideoProjectMetadata
    // A background image import never rewrites project.json. Its separate
    // marker only adds invalidation for the exact video that it observed.
    if (await flowVideoIsOutdated(paths)) metadata.videoOutdated = true
    return metadata
  } catch (error) {
    throw new PipelineFailure(
      'project_metadata_corrupt',
      `project.json unreadable: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

// Escritura atómica con updatedAt sellado acá: ningún caller lo estampa a
// mano, así todo write queda fechado.
export async function writeProjectMetadata(
  paths: ProjectPaths,
  metadata: VideoProjectMetadata,
): Promise<void> {
  metadata.updatedAt = new Date().toISOString()
  await writeFileAtomicStrict(
    paths.metadataFile,
    `${JSON.stringify(metadata, null, 2)}\n`,
  )
}

// Marca el video como desactualizado tras una edición — solo si HAY un video
// que desactualizar (paridad con marcarVideoDesactualizado del origen: el
// mp4 jamás se borra, solo se avisa). Lo limpian los jobs de render.
export async function markVideoOutdated(
  paths: ProjectPaths,
  metadata: VideoProjectMetadata,
): Promise<void> {
  if (metadata.videoOutdated) return
  if (!(await isValidFile(paths.videoFile))) return

  const next = { ...metadata, videoOutdated: true }
  await writeProjectMetadata(paths, next)
  metadata.videoOutdated = true
  metadata.updatedAt = next.updatedAt
}
