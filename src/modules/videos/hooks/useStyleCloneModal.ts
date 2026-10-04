import { useSyncExternalStore } from 'react'

// Qué muestra el modal del creador de estilo con IA (ADR-0050); null =
// cerrado. `new` es el paso de origen de una clonación que todavía no empezó;
// `session`, una clonación abierta. Vive fuera de React (patrón de
// useCustomStyleEditor): cerrar el modal no toca la sesión, que sigue
// trabajando en su store.
export type StyleCloneModalTarget =
  { kind: 'new' } | { kind: 'session'; sessionId: string }

let target: StyleCloneModalTarget | null = null
const subscribers = new Set<() => void>()

function notify() {
  for (const subscriber of subscribers) subscriber()
}

// Abre el modal o lo pasa a otra sesión (al empezar una clonación el paso de
// origen se convierte en su sesión).
export function openStyleCloneModal(next: StyleCloneModalTarget) {
  target = next
  notify()
}

// Idempotente: cerrar lo que ya está cerrado no notifica a nadie.
export function closeStyleCloneModal() {
  if (target === null) return
  target = null
  notify()
}

function subscribe(listener: () => void): () => void {
  subscribers.add(listener)
  return () => {
    subscribers.delete(listener)
  }
}

function getSnapshot(): StyleCloneModalTarget | null {
  return target
}

export function useStyleCloneModal(): StyleCloneModalTarget | null {
  return useSyncExternalStore(subscribe, getSnapshot)
}
