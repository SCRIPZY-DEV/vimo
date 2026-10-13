import type { Dirent } from 'node:fs'
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

import type { PipelineContext } from '../runner/context.ts'
import { PipelineFailure } from '../runner/failure.ts'

// Bibliotecas del usuario bajo <projectsRoot> (estilos propios, personajes).
// Una carpeta de proyectos que no existe o no se deja leer NO es una
// biblioteca vacía: es un disco desconectado, una carpeta movida o un permiso
// perdido, y mostrarlo como «no tenés nada» hace creer que se borró. Por eso
// falla con su código; que falte solo la subcarpeta sí es el primer uso.
export const PROJECTS_ROOT_UNAVAILABLE = 'projects_root_unavailable'

function errorCode(error: unknown): string {
  return (error as NodeJS.ErrnoException)?.code ?? 'unknown'
}

/**
 * Las entradas de `<projectsRoot>/<subdirectory>`. Los mensajes llevan el
 * código del sistema y el nombre de la subcarpeta, nunca la ruta del usuario.
 */
export async function readLibraryDirectory(
  projectsRoot: string,
  subdirectory: string,
): Promise<Dirent[]> {
  let info
  try {
    info = await stat(projectsRoot)
  } catch (error) {
    throw new PipelineFailure(
      PROJECTS_ROOT_UNAVAILABLE,
      `the projects folder could not be read (${errorCode(error)})`,
    )
  }
  if (!info.isDirectory())
    throw new PipelineFailure(
      PROJECTS_ROOT_UNAVAILABLE,
      'the projects folder is not a directory',
    )

  try {
    return await readdir(join(projectsRoot, subdirectory), {
      withFileTypes: true,
    })
  } catch (error) {
    // La biblioteca todavía no existe: lista vacía, no error.
    if (errorCode(error) === 'ENOENT') return []
    throw new PipelineFailure(
      PROJECTS_ROOT_UNAVAILABLE,
      `the ${subdirectory} folder could not be read (${errorCode(error)})`,
    )
  }
}

/**
 * Por qué no se pudo usar el JSON de una entrada, para el log: el código del
 * error de lectura, `invalid_json` (p. ej. truncado por un cierre a mitad de
 * escritura) o `invalid_content` (JSON válido sin la forma esperada). Nunca
 * el contenido.
 */
export async function jsonFileProblem(path: string): Promise<string> {
  let raw
  try {
    raw = await readFile(path, 'utf8')
  } catch (error) {
    return errorCode(error)
  }

  try {
    JSON.parse(raw)
  } catch {
    return 'invalid_json'
  }
  return 'invalid_content'
}

/**
 * Una entrada que el listado saltea queda en el log de diagnóstico
 * (ADR-0038) con su id y el porqué: sin esto, para el usuario el estilo o el
 * personaje «desapareció» y en soporte no queda rastro.
 */
export function warnSkippedLibraryEntry(
  context: PipelineContext,
  kind: 'style' | 'character',
  id: string,
  problem: string,
): void {
  context.emitter.emit({
    type: 'log',
    level: 'warn',
    message: `skipped ${kind} "${id}": ${problem}`,
  })
}
