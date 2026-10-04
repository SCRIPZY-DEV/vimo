import { useTranslation } from 'react-i18next'
import { ImageOff, Maximize2 } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { videosApi } from '@/modules/videos/api'
import { StyleCloneTestImage } from '@/modules/videos/components/StyleCloneTestImage'
import type { StyleCloneTest } from '@/modules/videos/types/styleClone'

interface StyleCloneComparePairProps {
  scene: StyleCloneTest
  working: boolean
  onOpen: () => void
  onRetry: () => void
}

// Una escena de prueba al lado de la imagen que recrea, cada una con su
// etiqueta: «Original» y «Clonación» (ADR-0050, decisión C6). Las dos mitades
// miden siempre lo mismo: una escena nueva, que no recrea ninguna imagen, deja
// dicho en la mitad del original que no lo tiene, así la grilla no se
// desempareja. Tocarla abre la comparación en grande. Presentacional.
export function StyleCloneComparePair({
  scene,
  working,
  onOpen,
  onRetry,
}: StyleCloneComparePairProps) {
  const { t } = useTranslation()
  const drawn = Boolean(scene.path)
  const failed = Boolean(scene.errorCode) && !drawn && !working
  const label = t('create.styleClone.sceneNumber', { number: scene.index })

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5">
        <p className="font-display text-xs font-bold text-foreground">
          {label}
        </p>
        <button
          type="button"
          disabled={!drawn}
          onClick={onOpen}
          aria-label={t('create.styleClone.compareOpen', {
            number: scene.index,
          })}
          className="cursor-pointer rounded-full p-1 text-muted-foreground transition-colors hover:bg-saffron hover:text-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-saffron/50 disabled:invisible"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div
        role={drawn ? 'button' : undefined}
        tabIndex={drawn ? 0 : undefined}
        onClick={drawn ? onOpen : undefined}
        onKeyDown={(event) => {
          if (!drawn || (event.key !== 'Enter' && event.key !== ' ')) return
          event.preventDefault()
          onOpen()
        }}
        className={cn(
          'grid grid-cols-2 gap-px bg-border outline-none focus-visible:ring-2 focus-visible:ring-saffron/50',
          drawn && 'cursor-pointer',
        )}
      >
        <figure className="relative aspect-video bg-muted">
          {scene.originalPath ? (
            <img
              src={videosApi.imageSource(scene.originalPath)}
              alt={`${label} · ${t('create.styleClone.original')}`}
              draggable={false}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-3 text-center text-muted-foreground">
              <ImageOff className="h-5 w-5" />
              <p className="font-body text-[11px] leading-snug">
                {t('create.styleClone.noOriginal')}
              </p>
            </div>
          )}
          <figcaption className="absolute left-1.5 top-1.5 rounded-full bg-charcoal/80 px-2 py-0.5 font-display text-[10px] font-bold text-white">
            {t('create.styleClone.original')}
          </figcaption>
        </figure>
        <figure className="relative aspect-video bg-muted">
          <StyleCloneTestImage
            test={scene}
            alt={`${label} · ${t('create.styleClone.clone')}`}
            working={working}
            onRetry={onRetry}
          />
          <figcaption className="absolute left-1.5 top-1.5 rounded-full bg-saffron px-2 py-0.5 font-display text-[10px] font-bold text-charcoal">
            {t('create.styleClone.clone')}
          </figcaption>
        </figure>
      </div>

      {failed && (
        <p
          role="alert"
          className="px-3 py-1.5 font-body text-[11px] text-muted-foreground"
        >
          {t(videosApi.styleCloneErrorKey(scene.errorCode ?? null))}
        </p>
      )}
    </div>
  )
}
