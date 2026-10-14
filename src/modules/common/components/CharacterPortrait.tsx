import DoodleCharacter from '@/modules/common/doodles/DoodleCharacter'
import { cn } from '@/modules/common/utilities/cn'

interface CharacterPortraitProps {
  src: string | null
  doodleSize: number
  className?: string
  // Hacia dónde se ancla el recorte: `top` deja siempre la cara a la vista en
  // fotos de medio cuerpo o de cuerpo entero (avatares); `center`, el de
  // siempre, sirve para los retratos de personajes.
  focus?: 'center' | 'top'
}

export function CharacterPortrait({
  src,
  doodleSize,
  className,
  focus = 'center',
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
          className={cn(
            'absolute inset-0 h-full w-full object-cover',
            focus === 'top' && 'object-top',
          )}
        />
      ) : (
        <DoodleCharacter size={doodleSize} />
      )}
    </div>
  )
}
