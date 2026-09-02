import { readdir } from 'node:fs/promises'

import type { PipelineContext } from '../../runner/context.ts'
import type {
  CustomStyleSummary,
  StylesListResult,
} from '../../types/styles.ts'
import { STYLE_ID_PATTERN, readStyleEntry, stylesRoot } from './style-store.ts'

// Listado de la galería de estilos propios, ordenado por creación (la
// tarjeta «Crear estilo» de la UI va siempre al final, no viene de acá).
export async function stylesList(
  context: PipelineContext,
): Promise<StylesListResult> {
  let entries
  try {
    entries = await readdir(stylesRoot(context), { withFileTypes: true })
  } catch {
    // La carpeta todavía no existe: galería vacía (primer uso).
    return { entries: [] }
  }

  const styles: CustomStyleSummary[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (!STYLE_ID_PATTERN.test(entry.name)) continue
    const style = await readStyleEntry(context, entry.name)
    if (style) styles.push(style)
  }

  styles.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return { entries: styles }
}
