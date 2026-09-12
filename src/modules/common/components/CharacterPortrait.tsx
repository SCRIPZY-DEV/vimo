import DoodleCharacter from '@/modules/common/doodles/DoodleCharacter'
import { cn } from '@/modules/common/utilities/cn'

interface CharacterPortraitProps {
  src: string | null
  doodleSize: number
  className?: string
}

export function CharacterPortrait({
  src,
  doodleSize,
  className,
}: CharacterPortraitProps) {
  // La imagen va posicionada sobre la caja (no en el flujo): así una foto
  // vertical no aporta su alto natural al tamaño intrínseco de la tarjeta y
  // las filas de una grilla `auto-rows-fr` no crecen; la caja manda (por
  // ejemplo `aspect-square`) y la imagen se recorta con `object-cover`.
  return (
    <div
      className={cn(
        'relative flex items-center justify-center overflow-hidden bg-muted/40',
        className,
      )}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <DoodleCharacter size={doodleSize} />
      )}
    </div>
  )
}
