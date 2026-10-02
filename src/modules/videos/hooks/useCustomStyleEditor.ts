import { useSyncExternalStore } from 'react'

// Qué gema está abierta en el editor de «Mi estilo» y desde dónde; null =
// cerrado. Vive fuera de React (patrón de useCreateTask) para que el chip de
// personaje (CharacterSection) y la galería (CustomStyleGallery), que son
// hermanas en el formulario, lo compartan sin refs imperativas (origen:
// `galeriaEstilos.current?.editarEnUso()`).
export interface CustomStyleEditorRequest {
  styleId: string
  // Abierto desde «Generar 4 muestras»: arranca a generar al elegir proveedor.
  generateOnOpen: boolean
  // Estilo NUEVO (todavía no está en styles-list): el modal arranca vacío.
  isNew: boolean
}

export interface OpenCustomStyleEditorOptions {
  styleId: string
  generateOnOpen?: boolean
  isNew?: boolean
}

let request: CustomStyleEditorRequest | null = null
const subscribers = new Set<() => void>()

function notify() {
  for (const subscriber of subscribers) subscriber()
}

// Regla de modales del origen: nunca dos abiertos a la vez. Con uno abierto
// el pedido se ignora y devuelve false.
export function openCustomStyleEditor(
  options: OpenCustomStyleEditorOptions,
): boolean {
  if (request !== null) return false
  request = { generateOnOpen: false, isNew: false, ...options }
  notify()
  return true
}

// El estilo nuevo que está abierto ya se guardó (la gema pegada en «Preparar
// con IA»): desde acá el modal edita esa gema guardada, que la galería lee de la
// lista. Para otro estilo, o si ya no era nuevo, no hace nada.
export function markCustomStyleEditorSaved(styleId: string) {
  if (request?.styleId !== styleId || !request.isNew) return
  request = { ...request, isNew: false }
  notify()
}

// Idempotente: cerrar lo que ya está cerrado no notifica a nadie.
export function closeCustomStyleEditor() {
  if (request === null) return
  request = null
  notify()
}

function subscribe(listener: () => void): () => void {
  subscribers.add(listener)
  return () => {
    subscribers.delete(listener)
  }
}

function getSnapshot(): CustomStyleEditorRequest | null {
  return request
}

export function useCustomStyleEditor(): CustomStyleEditorRequest | null {
  return useSyncExternalStore(subscribe, getSnapshot)
}
