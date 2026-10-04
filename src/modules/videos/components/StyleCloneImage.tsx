import { cn } from '@/modules/common/utilities/cn'
import { videosApi } from '@/modules/videos/api'
import type { StyleCloneImageRef } from '@/modules/videos/types/styleClone'

interface StyleCloneImageProps {
  image: StyleCloneImageRef
  alt: string
  // `cover` llena la caja recortando; `contain` muestra la imagen entera.
  fit?: 'cover' | 'contain'
  className?: string
}

// Una imagen de una clonación de estilo. Una celda de un mosaico se muestra
// recortando el mosaico como fondo; el resto, como imagen. Presentacional.
export function StyleCloneImage({
  image,
  alt,
  fit = 'cover',
  className,
}: StyleCloneImageProps) {
  const source = videosApi.imageSource(image.path, image.version)

  if (image.crop)
    return (
      <div
        role="img"
        aria-label={alt}
        className={cn('bg-no-repeat', className)}
        style={{
          backgroundImage: `url("${source}")`,
          backgroundSize: image.crop.size,
          backgroundPosition: image.crop.position,
        }}
      />
    )

  return (
    <img
      src={source}
      alt={alt}
      draggable={false}
      className={cn(
        fit === 'cover' ? 'object-cover' : 'object-contain',
        className,
      )}
    />
  )
}
