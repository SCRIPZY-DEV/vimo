import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/modules/common/utilities/cn'
import { SceneCell } from '@/modules/videos/components/SceneCell'
import { SceneViewerDialog } from '@/modules/videos/components/SceneViewerDialog'
import { SUPPORT_NOTE_CLASS } from '@/modules/videos/constants'
import { isVertical } from '@/modules/videos/utilities/videoFormat'
import type { VideoFormat } from '@pipeline/types/video-format.ts'
import type { SceneView } from '@/modules/videos/types/create'

interface SceneImagesGridProps {
  scenes: SceneView[]
  videoFormat: VideoFormat
}

// La grilla de miniaturas (port de GrillaPreviewImagenes del origen). En un
// short las celdas son verticales: con las columnas de siempre salían
// tarjetas altísimas, así que van más columnas y las celdas quedan angostas
// con un alto parecido al de las 16:9.
export function SceneImagesGrid({ scenes, videoFormat }: SceneImagesGridProps) {
  const { t } = useTranslation()
  // Escena abierta en el visor, por id: el arreglo crece durante la
  // generación y con un índice te quedarías mirando otra escena.
  const [viewerSceneId, setViewerSceneId] = useState<number | null>(null)

  if (scenes.length === 0) {
    return (
      <p
        className={cn(
          SUPPORT_NOTE_CLASS,
          'py-8 text-center text-muted-foreground',
        )}
      >
        {t('create.progress.imagesEmpty')}
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {/* Breakpoints un escalón por encima de los del origen: el sidebar
          vive dentro del viewport y descuenta 256px, así las columnas
          aparecen al mismo ancho de contenido que allá. */}
      <div
        className={cn(
          'grid gap-3',
          isVertical(videoFormat)
            ? 'grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7'
            : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
        )}
      >
        {scenes.map((scene) => (
          <SceneCell
            key={scene.id}
            scene={scene}
            videoFormat={videoFormat}
            onOpen={() => setViewerSceneId(scene.id)}
          />
        ))}
      </div>

      {viewerSceneId !== null && (
        <SceneViewerDialog
          scenes={scenes}
          sceneId={viewerSceneId}
          videoFormat={videoFormat}
          onClose={() => setViewerSceneId(null)}
          onNavigate={setViewerSceneId}
        />
      )}
    </div>
  )
}
