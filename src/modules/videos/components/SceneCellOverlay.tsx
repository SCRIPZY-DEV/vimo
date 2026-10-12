import { formatSceneSeconds } from '@/modules/videos/utilities/formatSceneSeconds'
import type { SceneView } from '@/modules/videos/types/create'

interface SceneCellOverlayProps {
  scene: SceneView
}

// Lo que va siempre encima de una celda de la grilla de imágenes: el número de
// la escena arriba a la izquierda y su tramo abajo, sobre un degradado oscuro.
// Lo comparten la celda de una imagen (SceneCell) y la tarjeta de una
// aparición del avatar (AvatarSceneCell): así las dos llevan el mismo número y
// el mismo tramo. Presentacional; su padre es la celda `relative`.
export function SceneCellOverlay({ scene }: SceneCellOverlayProps) {
  return (
    <>
      <span className="pointer-events-none absolute left-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-lg bg-black/70 font-display text-xs font-bold text-white backdrop-blur-sm">
        {scene.id}
      </span>

      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/70 to-transparent p-2">
        <span className="font-display text-[10px] font-bold tabular-nums text-white/90">
          {formatSceneSeconds(scene.startSeconds ?? 0)}–
          {formatSceneSeconds(scene.endSeconds ?? 0)}
        </span>
      </div>
    </>
  )
}
