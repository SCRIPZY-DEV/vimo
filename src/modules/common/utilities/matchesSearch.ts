// Búsqueda de texto libre sobre los campos que cada dominio considere
// buscables. Insensible a mayúsculas; una búsqueda vacía coincide con todo.
export function matchesSearch(
  fields: Array<string | undefined | null>,
  search: string,
): boolean {
  const term = search.trim().toLowerCase()
  if (!term) return true

  return fields.some((field) => field?.toLowerCase().includes(term) ?? false)
}
