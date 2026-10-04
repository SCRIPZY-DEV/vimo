import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronsLeftRight } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/modules/common/ui/dialog'
import { videosApi } from '@/modules/videos/api'
import type { StyleCloneTest } from '@/modules/videos/types/styleClone'

interface StyleCloneViewerProps {
  scene: StyleCloneTest
  onClose: () => void
}

// Dónde arranca el divisor: a la mitad, con el original a la izquierda.
const INITIAL_DIVIDER_PERCENT = 50

// La comparación en grande de una escena de prueba (ADR-0050, decisión C6):
// la clonación ocupa toda la caja y el original se superpone hasta un divisor
// que se mueve con el mouse, el dedo o las flechas. Una escena sin original
// muestra solo la clonación.
export function StyleCloneViewer({ scene, onClose }: StyleCloneViewerProps) {
  const { t } = useTranslation()
  const [divider, setDivider] = useState(INITIAL_DIVIDER_PERCENT)
  const title = t('create.styleClone.compareTitle', { number: scene.index })

  if (!scene.path) return null

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-h-[94vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{title}</DialogTitle>
          <DialogDescription>
            {scene.originalPath
              ? t('create.styleClone.compareSlider')
              : t('create.styleClone.noOriginal')}
          </DialogDescription>
        </DialogHeader>

        <div className="relative aspect-video w-full select-none overflow-hidden rounded-xl bg-charcoal">
          <img
            src={videosApi.imageSource(scene.path, scene.mtimeMs)}
            alt={t('create.styleClone.clone')}
            draggable={false}
            className="absolute inset-0 h-full w-full object-contain"
          />
          <span className="absolute right-3 top-3 rounded-full bg-saffron px-2.5 py-1 font-display text-xs font-bold text-charcoal shadow">
            {t('create.styleClone.clone')}
          </span>

          {scene.originalPath && (
            <>
              <div
                className="absolute inset-0 bg-charcoal"
                style={{ clipPath: `inset(0 ${100 - divider}% 0 0)` }}
              >
                <img
                  src={videosApi.imageSource(scene.originalPath)}
                  alt={t('create.styleClone.original')}
                  draggable={false}
                  className="absolute inset-0 h-full w-full object-contain"
                />
                <span className="absolute left-3 top-3 rounded-full bg-charcoal/85 px-2.5 py-1 font-display text-xs font-bold text-white shadow">
                  {t('create.styleClone.original')}
                </span>
              </div>

              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow"
                style={{ left: `${divider}%` }}
              >
                <span className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-charcoal shadow-lg">
                  <ChevronsLeftRight className="h-4 w-4" />
                </span>
              </div>

              {/* El control real: un rango invisible encima de la imagen, así
                  el divisor se mueve arrastrando en cualquier punto y también
                  con el teclado. */}
              <input
                type="range"
                min={0}
                max={100}
                value={divider}
                aria-label={t('create.styleClone.compareSlider')}
                onChange={(event) => setDivider(Number(event.target.value))}
                className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
              />
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
