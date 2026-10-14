import type { SceneView } from '@/modules/videos/types/create'

// Una escena como la tienen la pantalla de progreso (la vista del disco y lo
// que pasó en la corrida, `avatarActivity`) o el proyecto ya hecho (solo la
// vista: el reproductor de la biblioteca y el editor).
export type AvatarFallbackScene = Pick<SceneView, 'avatar' | 'avatarActivity'>

// Dónde se cuenta. `progress`: la pantalla de progreso, donde la fase todavía
// puede generar una aparición planeada. `project`: el proyecto ya hecho (el
// reproductor de la biblioteca y el editor), donde el video sale como está y
// una planeada también sale con la imagen fija (el camino `images_incomplete`
// → «Continuar en el editor» → exportar).
export type AvatarFallbackContext = 'progress' | 'project'

// La regla única de la entrega 2d (rulings de las rondas 1 y 2 de WP-P): si
// una escena de avatar sale en el video con la imagen fija del look porque no
// se generó (el render la deja estática, spec §10.1). La usan la fila de cada
// aparición en el progreso, el aviso del final de Crear, el del reproductor de
// la biblioteca y el del editor, así nunca se contradicen.
// - Lo que pasó en esta corrida manda: una que falló sale fija; una que quedó
//   lista, o que se está generando, no.
// - Una desactualizada no cuenta nunca: tiene su propio aviso
//   («Desactualizado») y se regenera desde el editor.
// - Una planeada cuenta solo en el proyecto ya hecho.
// - Una fallida cuenta, también la lista que perdió su clip (la vista la manda
//   fallida); una lista con su clip, no.
export function isAvatarFallback(
  scene: AvatarFallbackScene,
  context: AvatarFallbackContext,
): boolean {
  const avatar = scene.avatar
  if (!avatar) return false

  if (scene.avatarActivity) return scene.avatarActivity.status === 'failed'

  if (avatar.stale) return false

  if (avatar.status === 'planned') return context === 'project'

  return avatar.status === 'failed' || !avatar.clipPath
}

// Cuántas apariciones salen con la imagen fija del look en ese contexto: la
// cifra de `AvatarFallbackNote`.
export function avatarFallbackCount(
  scenes: readonly AvatarFallbackScene[],
  context: AvatarFallbackContext,
): number {
  return scenes.filter((scene) => isAvatarFallback(scene, context)).length
}
