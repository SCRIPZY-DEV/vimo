import { join } from 'node:path'

import { projectsRootOf } from '../../project/paths.ts'
import type { PipelineContext } from '../../runner/context.ts'
import type {
  CustomStyleSummary,
  StylesListResult,
} from '../../types/styles.ts'
import {
  jsonFileProblem,
  readLibraryDirectory,
  warnSkippedLibraryEntry,
} from '../../utils/library-directory.ts'
import {
  STYLES_SUBDIRECTORY,
  STYLE_FILE,
  STYLE_ID_PATTERN,
  readStyleEntry,
  styleDirectory,
} from './style-store.ts'

// Listado de la galería de estilos propios, ordenado por creación (la
// tarjeta «Crear estilo» de la UI va siempre al final, no viene de acá).
// Sin `_styles/` todavía la galería está vacía (primer uso); sin carpeta de
// proyectos legible, falla con `projects_root_unavailable`.
export async function stylesList(
  context: PipelineContext,
): Promise<StylesListResult> {
  const entries = await readLibraryDirectory(
    projectsRootOf(context),
    STYLES_SUBDIRECTORY,
  )

  const styles: CustomStyleSummary[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (!STYLE_ID_PATTERN.test(entry.name)) continue
    const style = await readStyleEntry(context, entry.name)
    if (style) {
      styles.push(style)
      continue
    }

    const problem = await jsonFileProblem(
      join(styleDirectory(context, entry.name), STYLE_FILE),
    )
    warnSkippedLibraryEntry(context, 'style', entry.name, problem)
  }

  styles.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return { entries: styles }
}
