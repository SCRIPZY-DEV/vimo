import { rm } from 'node:fs/promises'

import { projectsRootOf, resolveProjectDir } from '../../project/paths.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type {
  DeleteVideoProjectsPayload,
  DeleteVideoProjectsResult,
} from '../../types/video-project.ts'

// Borrado (en lote) de proyectos: la carpeta entera, sin papelera — la UI
// confirma antes. Los ids se validan TODOS antes de borrar el primero: un id
// inválido cancela el lote completo, nunca deja un borrado a medias.
export async function deleteVideoProjects(
  context: PipelineContext,
): Promise<DeleteVideoProjectsResult> {
  const payload = context.job.payload as DeleteVideoProjectsPayload | undefined
  const projectIds = payload?.projectIds
  if (!Array.isArray(projectIds) || projectIds.length === 0)
    throw new PipelineFailure(
      'invalid_payload',
      'payload.projectIds must be a non-empty array',
    )

  const projectsRoot = projectsRootOf(context)
  // resolveProjectDir valida cada id (anti path-traversal y reservados).
  const directories = projectIds.map((projectId) =>
    resolveProjectDir(projectsRoot, projectId),
  )

  for (const directory of directories) {
    context.signal.throwIfAborted()
    await rm(directory, { recursive: true, force: true })
  }

  return { deleted: directories.length }
}
