import { useTranslation } from 'react-i18next'
import { Loader2, RefreshCw, TriangleAlert } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { videosApi } from '@/modules/videos/api'
import type { StyleCloneTest } from '@/modules/videos/types/styleClone'

interface StyleCloneTestImageProps {
  test: StyleCloneTest
  alt: string
  // La sesión está trabajando: una prueba sin imagen se está dibujando.
  working: boolean
  // `contain` para los diseños del personaje (cuerpo entero, sin recortar).
  fit?: 'cover' | 'contain'
  className?: string
  onRetry?: () => void
}

// La imagen de una prueba (un diseño o una escena) en cualquiera de sus tres
// estados: dibujada, dibujándose o fallida, con su «Reintentar». El motivo del
// fallo lo muestra quien la contiene, donde hay lugar para leerlo.
// Presentacional.
export function StyleCloneTestImage({
  test,
  alt,
  working,
  fit = 'cover',
  className,
  onRetry,
}: StyleCloneTestImageProps) {
  const { t } = useTranslation()

  if (test.path)
    return (
      <img
        src={videosApi.imageSource(test.path, test.mtimeMs)}
        alt={alt}
        draggable={false}
        className={cn(
          'h-full w-full',
          fit === 'cover' ? 'object-cover' : 'object-contain',
          className,
        )}
      />
    )

  if (test.errorCode && !working)
    return (
      <div
        className={cn(
          'flex h-full w-full flex-col items-center justify-center gap-1.5 px-3 text-center',
          className,
        )}
      >
        <TriangleAlert className="h-5 w-5 text-coral" />
        <p className="font-display text-xs font-bold text-foreground">
          {t('create.styleClone.testFailed')}
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onRetry()
            }}
            className="mt-0.5 inline-flex cursor-pointer items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 font-display text-[11px] font-bold text-foreground transition-colors hover:border-saffron hover:text-saffron"
          >
            <RefreshCw className="h-3 w-3" />
            {t('create.styleClone.testRetry')}
          </button>
        )}
      </div>
    )

  return (
    <div
      role="status"
      className={cn(
        'flex h-full w-full flex-col items-center justify-center gap-1.5 text-muted-foreground',
        className,
      )}
    >
      <Loader2 className="h-5 w-5 animate-spin text-saffron" />
      <p className="font-body text-xs">{t('create.styleClone.testDrawing')}</p>
    </div>
  )
}
