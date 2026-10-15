import { useState } from 'react'
import { ImageOff } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { TRANSITION_PREVIEW_IMAGES } from '@/modules/videos/constants'
import type { TransitionPreviewProps } from '@/modules/videos/types/editorTools'
import styles from '@/modules/videos/components/EditorTransitionsPanel.module.css'

// Todas las transiciones comparten la misma pareja para comparar el efecto.
// Las imágenes son decorativas: la tarjeta ya nombra la transición y su destino.
export function TransitionPreview({
  images = TRANSITION_PREVIEW_IMAGES,
}: TransitionPreviewProps) {
  const [failedSources, setFailedSources] = useState<string[]>([])
  const available = images.every(
    (source) => source.length > 0 && !failedSources.includes(source),
  )

  return (
    <div
      aria-hidden
      data-transition-preview
      data-transition-preview-available={available}
      className="relative h-24 overflow-hidden bg-muted"
    >
      {available ? (
        <>
          <img
            src={images[0]}
            alt=""
            draggable={false}
            onError={() =>
              setFailedSources((previous) => [...previous, images[0]])
            }
            className="absolute inset-0 h-full w-full object-cover"
          />
          <img
            src={images[1]}
            alt=""
            draggable={false}
            onError={() =>
              setFailedSources((previous) => [...previous, images[1]])
            }
            className={cn(
              styles.secondScene,
              'absolute inset-0 h-full w-full object-cover',
            )}
          />
        </>
      ) : (
        <div className="flex h-full items-center justify-center text-muted-foreground/50">
          <ImageOff className="h-6 w-6" strokeWidth={1.5} />
        </div>
      )}
    </div>
  )
}
