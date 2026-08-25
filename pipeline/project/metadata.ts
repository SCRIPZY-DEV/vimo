import { PipelineFailure } from '../runner/failure.ts'
import type { VideoProjectMetadata } from '../types/video-project.ts'
import { readTextWithRetry, writeFileAtomic } from '../utils/atomic-fs.ts'
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
    return JSON.parse(raw) as VideoProjectMetadata
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
  await writeFileAtomic(
    paths.metadataFile,
    `${JSON.stringify(metadata, null, 2)}\n`,
  )
}
