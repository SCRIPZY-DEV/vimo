import { useDiagnosticsUpload } from '../hooks/useDiagnosticsUpload'

// Sin markup: existe para montar la subida de logs de diagnóstico una sola
// vez, en App, sin filtrarle esa responsabilidad a un layout o a una vista.
export function DiagnosticsUploader() {
  useDiagnosticsUpload()

  return null
}
