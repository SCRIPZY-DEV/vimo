import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type {
  StyleCloneMaterialItem,
  StyleCloneMaterialKind,
} from '../../types/style-clone.ts'
import { writeFileAtomic } from '../../utils/atomic-fs.ts'

// Carpeta de trabajo de las clonaciones de estilo (ADR-0050):
// `<projectsRoot>/_style-clones/<sesión>/` con el material (mosaicos,
// fotogramas, miniatura o imágenes del usuario), su índice (`material.json`)
// y las pruebas dibujadas. Vive dentro de la carpeta raíz porque la app
// muestra sus imágenes por el protocolo de assets y la borra al guardar o al
// descartar.
export const STYLE_CLONES_SUBDIRECTORY = '_style-clones'
export const CLONE_MATERIAL_FILE = 'material.json'

// El id de la sesión lo arma la app (`sc-<timestamp36>-<rand>`) y es el nombre
// de la carpeta: el patrón es el guard anti path-traversal.
const CLONE_SESSION_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/

export function assertValidCloneSessionId(
  sessionId: unknown,
): asserts sessionId is string {
  if (
    typeof sessionId !== 'string' ||
    !CLONE_SESSION_ID_PATTERN.test(sessionId)
  )
    throw new PipelineFailure(
      'invalid_payload',
      'payload.sessionId is not a valid style clone session id',
    )
}

// Archivos de una sesión que nombra el webview (el diseño elegido, las
// muestras aprobadas): solo un nombre de archivo de imagen, sin carpetas.
const CLONE_FILE_PATTERN = /^[a-z0-9][a-z0-9-]{0,59}\.jpg$/

export function assertValidCloneFile(
  file: unknown,
  field: string,
): asserts file is string {
  if (typeof file !== 'string' || !CLONE_FILE_PATTERN.test(file))
    throw new PipelineFailure(
      'invalid_payload',
      `${field} is not a file of the style clone session`,
    )
}

export function cloneSessionDirectory(
  context: PipelineContext,
  sessionId: string,
): string {
  const projectsRoot = context.job.projectsRoot
  if (!projectsRoot)
    throw new PipelineFailure(
      'missing_projects_root',
      'the job did not include projectsRoot',
    )

  return join(projectsRoot, STYLE_CLONES_SUBDIRECTORY, sessionId)
}

// Lo persistido de cada imagen del material: sin la ruta absoluta, que se
// deriva al leer para que la carpeta raíz pueda moverse.
export type StoredCloneMaterialItem = Omit<StyleCloneMaterialItem, 'path'>

export interface StoredCloneMaterial {
  source: 'youtube' | 'images'
  // Solo con un video: el link ya validado.
  videoUrl?: string
  title: string
  items: StoredCloneMaterialItem[]
}

export async function writeCloneMaterial(
  directory: string,
  material: StoredCloneMaterial,
): Promise<void> {
  await writeFileAtomic(
    join(directory, CLONE_MATERIAL_FILE),
    `${JSON.stringify(material, null, 2)}\n`,
  )
}

// null = la sesión no tiene material (nunca se preparó, o ya se borró).
export async function readCloneMaterial(
  directory: string,
): Promise<StoredCloneMaterial | null> {
  let stored: StoredCloneMaterial | null
  try {
    stored = JSON.parse(
      await readFile(join(directory, CLONE_MATERIAL_FILE), 'utf8'),
    ) as StoredCloneMaterial | null
  } catch {
    return null
  }
  if (!stored || typeof stored !== 'object' || !Array.isArray(stored.items))
    return null
  return stored
}

export function toMaterialItem(
  directory: string,
  item: StoredCloneMaterialItem,
): StyleCloneMaterialItem {
  return { ...item, path: join(directory, item.file) }
}

// La imagen número `number` (desde 1) de un tipo, en el orden del material:
// así cuenta el modelo cuando dice qué imagen recrea una prueba.
export function findMaterialItem(
  material: StoredCloneMaterial,
  kind: StyleCloneMaterialKind,
  number: number,
): StoredCloneMaterialItem | undefined {
  return material.items.filter((item) => item.kind === kind)[number - 1]
}
