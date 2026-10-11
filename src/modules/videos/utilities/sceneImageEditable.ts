import type { SceneDetail } from '@pipeline/types/video-project.ts'

// ¿La escena tiene una imagen que el editor puede regenerar o describir?
// (ADR-0057, spec §6.2): una escena de avatar no —su imagen fija es la vista
// previa del look y su video lo hace HeyGen—, así que el panel no ofrece
// «Regenerar imagen» ni la descripción, y la galería no la lista ni la deja
// seleccionar. El sidecar igual la saltea (la fase de imágenes y
// `regenerate-scene-images`): esto evita pedirlo.
export function sceneImageEditable(
  scene: Pick<SceneDetail, 'avatar'>,
): boolean {
  return scene.avatar === undefined
}
