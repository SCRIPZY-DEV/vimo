import { sceneImageEditable } from '@/modules/videos/utilities/sceneImageEditable'
import type { SceneDetail } from '@pipeline/types/video-project.ts'

// Las escenas a las que les falta la imagen que el aviso del editor manda a
// regenerar (el gate `render_missing_images`). Una escena de avatar no
// entra: su imagen fija es la vista previa del look y no se regenera; si
// falta, el render lo dice con su propio código.
export function missingImageSceneIds(
  scenes: Pick<SceneDetail, 'id' | 'avatar' | 'imagePath'>[],
): number[] {
  return scenes
    .filter((scene) => sceneImageEditable(scene) && !scene.imagePath)
    .map((scene) => scene.id)
}
