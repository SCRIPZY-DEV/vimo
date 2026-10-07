import { useSyncExternalStore } from 'react'

// Qué estilo del catálogo está abierto en «Ver»; null = cerrado. Vive fuera
// de React (patrón de useCustomStyleEditor) para que la sección de personaje
// del formulario abra «Ver» del estilo en uso desde su chip, y la galería del
// catálogo, que es su hermana en el formulario, lo dibuje.
export interface CatalogStyleViewerRequest {
  catalogStyleId: string
}

let request: CatalogStyleViewerRequest | null = null
const subscribers = new Set<() => void>()

function notify() {
  for (const subscriber of subscribers) subscriber()
}

// Regla de modales del origen: nunca dos abiertos a la vez. Con uno abierto
// el pedido se ignora y devuelve false.
export function openCatalogStyleViewer(
  next: CatalogStyleViewerRequest,
): boolean {
  if (request !== null) return false
  request = next
  notify()
  return true
}

// Idempotente: cerrar lo que ya está cerrado no notifica a nadie. Con un id,
// cierra solo si «Ver» muestra ese estilo: una copia que termina tarde no
// cierra el de otro.
export function closeCatalogStyleViewer(catalogStyleId?: string) {
  if (request === null) return
  if (catalogStyleId !== undefined && request.catalogStyleId !== catalogStyleId)
    return
  request = null
  notify()
}

function subscribe(listener: () => void): () => void {
  subscribers.add(listener)
  return () => {
    subscribers.delete(listener)
  }
}

function getSnapshot(): CatalogStyleViewerRequest | null {
  return request
}

export function useCatalogStyleViewer(): CatalogStyleViewerRequest | null {
  return useSyncExternalStore(subscribe, getSnapshot)
}
