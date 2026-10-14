import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/modules/common/utilities/cn'
import { AvatarSceneCell } from '@/modules/videos/components/AvatarSceneCell'
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
// con un alto parecido al de las 16:9. Las escenas del avatar no son
// imágenes (llegan con la foto del look): cada una es una tarjeta propia
// (AvatarSceneCell, con su propio reloj: la grilla no corre ninguno, así ni
// ella ni el visor de «Ampliar» se repintan cada segundo) y el visor no las
// recorre.
export function SceneImagesGrid({ scenes, videoFormat }: SceneImagesGridProps) {
  const { t } = useTranslation()
  // Escena abierta en el visor, por id: el arreglo crece durante la
  // generación y con un índice te quedarías mirando otra escena.
  const [viewerSceneId, setViewerSceneId] = useState<number | null>(null)
  // El efecto del visor depende de su `onClose` y, al correr, enfoca su
  // contenedor: con una función nueva en cada render (el store repinta la
  // grilla con cada evento) le sacaría el foco a quien lo está usando. Es la
  // identidad referencial que un efecto necesita, no una memoización de
  // reflejo.
  const closeViewer = useCallback(() => setViewerSceneId(null), [])

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
      {/* La regla es la fórmula del origen (ancho disponible repartido en
          columnas con 12px de aire y la proporción del video), no sus
          cantidades: allá 5 columnas (16:9) o 7 (9:16) sobre 776px daban
          tarjetas de ~145px; acá el sidebar descuenta 256px del viewport y
          desde `xl` la columna de fases se lleva otros ~350px, así que con
          las mismas cantidades salían tarjetas de ~112px donde «Ampliar»
          tapaba la celda entera. Con estas, una 16:9 mide ~200px y una 9:16
          ~130px de ancho desde una ventana de 1400px (los cortes van en px
          porque el `2xl` de Tailwind, 1536, deja afuera la ventana típica). */}
      <div
        className={cn(
          'grid gap-3',
          isVertical(videoFormat)
            ? 'grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-5 min-[1400px]:grid-cols-6 min-[1750px]:grid-cols-7'
            : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-3 min-[1400px]:grid-cols-4 min-[1750px]:grid-cols-5',
        )}
      >
        {scenes.map((scene) => {
          if (scene.avatar)
            return (
              <AvatarSceneCell
                key={scene.id}
                scene={scene}
                videoFormat={videoFormat}
              />
            )

          return (
            <SceneCell
              key={scene.id}
              scene={scene}
              videoFormat={videoFormat}
              onOpen={() => setViewerSceneId(scene.id)}
            />
          )
        })}
      </div>

      {viewerSceneId !== null && (
        <SceneViewerDialog
          scenes={scenes.filter((scene) => !scene.avatar)}
          sceneId={viewerSceneId}
          videoFormat={videoFormat}
          onClose={closeViewer}
          onNavigate={setViewerSceneId}
        />
      )}
    </div>
  )
}
