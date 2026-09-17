import type { Scene } from '../types/scenes.ts'

// La descripción manual cambió (o se borró) desde la última vez que se redactó
// el imagePrompt: regenerar debe reescribirlo, no re-rollear el prompt viejo.
// Se deriva del disco y no del estado de la UI, que lo pierde al guardar.
export function hasPendingUserPrompt(scene: Scene): boolean {
  return (
    (scene.userPrompt ?? '').trim() !== (scene.appliedUserPrompt ?? '').trim()
  )
}
