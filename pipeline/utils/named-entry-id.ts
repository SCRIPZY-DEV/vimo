import { sanitizeFileName } from './sanitize-file-name.ts'

const ID_NAME_LIMIT = 32

// Id `<slug-del-nombre>-<aleatorio>` para las carpetas de las bibliotecas
// (personajes, historial de voces y de música): legibles al abrir la carpeta
// y estables (el id no cambia si la entrada se renombra). El sufijo aleatorio
// evita que dos entradas con el mismo nombre choquen. Sin nombre útil cae al
// `fallback`.
export function newNamedEntryId(
  name: string | undefined,
  fallback: string,
): string {
  const slug = sanitizeFileName(name ?? '')
    .toLowerCase()
    .slice(0, ID_NAME_LIMIT)
  const random = Math.random().toString(36).slice(2, 8)
  return `${slug || fallback}-${random}`
}
