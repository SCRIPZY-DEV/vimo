import { flowVideoIsOutdated } from './flow-video-outdated.ts'
import { withProjectMetadataLease } from '../animation/coordination.ts'
import { PipelineFailure } from '../runner/failure.ts'
import type { VideoProjectMetadata } from '../types/video-project.ts'
import { readTextWithRetry, writeFileAtomicStrict } from '../utils/atomic-fs.ts'
import { isValidFile, type ProjectPaths } from './paths.ts'

// Lectura/escritura de project.json. La metadata es la fuente de verdad del
// estado del proyecto entre jobs (el sidecar es un proceso por job: todo lo
// que debe sobrevivir vive en disco).

// Las escrituras de project.json del proceso, en fila por archivo (entrega 2h,
// diseño §24.1): con el avatar corriendo junto con las imágenes, las dos
// fases y el gancho del pipeline que anota `completedStages` escriben el mismo
// archivo a la vez, y dos escrituras atómicas a la vez dejan la última que
// renombra: la otra se pierde. En fila, cada una corre cuando terminó la
// anterior y toma lo que escribe en ese momento, no cuando se pidió: así la
// copia en memoria que se escribe última lleva todo lo que se le anotó antes.
// Sin otra escritura en curso corre en el acto. Entre procesos, los jobs de
// imágenes comparten proyecto: sus cambios parciales toman además el lease
// de metadata antes de entrar en esta cola.
const metadataWrites = new Map<string, Promise<void>>()

function inMetadataQueue(
  paths: ProjectPaths,
  operation: () => Promise<void>,
): Promise<void> {
  const file = paths.metadataFile
  const previous = metadataWrites.get(file)
  const result = previous ? previous.then(operation) : operation()
  const tail = result.catch(() => undefined)
  metadataWrites.set(file, tail)
  // La fila vacía no queda en el mapa: la próxima escritura corre en el acto.
  void tail.then(() => {
    if (metadataWrites.get(file) === tail) metadataWrites.delete(file)
  })
  return result
}

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
// mano, así todo write queda fechado. Va en la fila de escrituras del archivo.
export function writeProjectMetadata(
  paths: ProjectPaths,
  metadata: VideoProjectMetadata,
): Promise<void> {
  return inMetadataQueue(paths, () => writeMetadataNow(paths, metadata))
}

// La escritura en sí, sin pasar por la fila: solo desde adentro de ella.
async function writeMetadataNow(
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

  await markStoredVideoOutdated(paths, metadata)
}

// Lo mismo, sobre lo que hay EN DISCO (entrega 2h, diseño §24.1), para quien no
// es dueño de project.json: el carril del avatar, que corre junto con las
// imágenes y con el gancho del pipeline que anota `completedStages`, o como
// comando del editor junto a otros jobs. Dentro de la fila de escrituras
// relee el archivo y le cambia solo `videoOutdated` (no pisa lo que otra
// escritura acaba de guardar), y antes de soltar la fila copia la marca en
// `metadata`, la copia en memoria del job: la próxima escritura de esa copia ya
// la lleva y no la deshace.
export function markStoredVideoOutdated(
  paths: ProjectPaths,
  metadata: VideoProjectMetadata,
): Promise<void> {
  // El orden es siempre lease entre procesos → cola local. La relectura
  // ocurre dentro de ambos: ni otro sidecar ni completedStages del avatar
  // paralelo pueden quedar pisados por una copia tomada antes de esperar.
  return withProjectMetadataLease(
    paths.root,
    new AbortController().signal,
    () =>
      inMetadataQueue(paths, async () => {
        const latest = await readProjectMetadata(paths)
        if (!latest.videoOutdated && (await isValidFile(paths.videoFile))) {
          latest.videoOutdated = true
          await writeMetadataNow(paths, latest)
        }
        metadata.videoOutdated = latest.videoOutdated
        metadata.updatedAt = latest.updatedAt
      }),
  )
}
