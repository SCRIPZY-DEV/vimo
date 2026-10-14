// Nombre del archivo de una ruta del diálogo nativo (separador de macOS o de
// Windows), para mostrarlo sin la carpeta.
export function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}
