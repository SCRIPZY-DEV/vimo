import {
  readProjectMetadata,
  writeProjectMetadata,
} from '../project/metadata.ts'
import {
  projectsRootOf,
  resolveProjectDir,
  resolveProjectPaths,
  type ProjectPaths,
} from '../project/paths.ts'
import type { PipelineContext } from '../runner/context.ts'
import type {
  VideoProjectMetadata,
  VideoProjectOptions,
} from '../types/video-project.ts'

// Contexto compartido por las stages de Create: lo que de verdad cruza
// fases (rutas, opciones, metadata, la biblia). Todo lo demás viaja por
// artefactos en disco — así cada stage es retomable en un job nuevo.
export interface CreateVideoContext extends PipelineContext {
  paths: ProjectPaths
  // Mutable durante el run; saveMetadata() la persiste (write atómico).
  metadata: VideoProjectMetadata
  options: VideoProjectOptions
  saveMetadata(): Promise<void>
  // Hoisting de la biblia visual (port del origen): la stage voice lanza la
  // llamada LLM premium acá para esconder su latencia; scene-prompts la
  // cobra con await. Solo existe si hubo guion desde el arranque.
  visualBible?: Promise<string | undefined>
  // Regeneración selectiva (Library, ADR-0014): ids que se re-generan aunque
  // su imagen exista. Solo lo setea regenerate-scene-images; en Create queda
  // undefined y nada cambia. Además acota la ESCRITURA de scenes.json de las
  // stages a estas escenas (merge por id).
  regenerateSceneIds?: Set<number>
  // Solo lo establece el subcomando de regeneración explícita del editor.
  flowRegenerationScope?: string
  flowRegenerationRequestId?: string
  // Importaciones Flow verificadas, incluido replay que no cambia el mtime.
  flowReadySceneIds?: Set<number>
}

export async function buildCreateVideoContext(
  base: PipelineContext,
  projectId: string,
): Promise<CreateVideoContext> {
  const projectDir = resolveProjectDir(projectsRootOf(base), projectId)
  const paths = resolveProjectPaths(projectDir, projectId)
  const metadata = await readProjectMetadata(paths)

  return {
    ...base,
    paths,
    metadata,
    options: metadata.options,
    async saveMetadata() {
      await writeProjectMetadata(paths, metadata)
    },
  }
}
