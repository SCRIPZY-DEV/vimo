import { useEffect, useRef, useState } from 'react'
import DoodleCharacter from '@/modules/common/doodles/DoodleCharacter'
import { cn } from '@/modules/common/utilities/cn'

interface LookPreviewProps {
  imageUrl?: string
  videoUrl?: string
  // Describe la imagen («Vista previa de Dante»); sin imagen, nombra al doodle.
  alt: string
  // Hacia dónde se ancla el recorte, como CharacterPortrait: `top` deja la
  // cara a la vista en una foto de medio cuerpo o de cuerpo entero.
  focus?: 'top' | 'center'
  // La tarjeta que la contiene está bajo el mouse o tiene el foco del
  // teclado: con `videoUrl`, reproduce la vista previa en video.
  active?: boolean
  // La URL de la imagen todavía no llegó (se está pidiendo): esqueleto en vez
  // del doodle.
  loading?: boolean
  doodleSize?: number
  className?: string
}

// Vista previa de un avatar o de un look, como en HeyGen: un esqueleto hasta
// que la imagen carga (sin imagen, el doodle de personaje) y, mientras la
// tarjeta está activa, el video de la vista previa encima, con un fundido.
// La caja la pone quien la usa (`className`: tamaño, aspecto y radio); la
// imagen va posicionada adentro, así una foto alta no estira la grilla. Es un
// `span` en bloque y no un `div`: va también dentro de fichas que son un
// `<button>`. Presentacional.
export function LookPreview({
  imageUrl,
  videoUrl,
  alt,
  focus = 'top',
  active = false,
  loading = false,
  doodleSize = 56,
  className,
}: LookPreviewProps) {
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)

  const anchor = focus === 'top' ? 'object-top' : 'object-center'
  // Una URL que no cargó (vencida o un archivo que ya no está) cae al doodle.
  const image = imageUrl && imageUrl !== failedUrl ? imageUrl : null
  const waiting = image ? loadedUrl !== image : loading

  return (
    <span className={cn('relative block overflow-hidden bg-muted', className)}>
      {waiting && (
        <span
          aria-hidden
          className="absolute inset-0 animate-pulse bg-muted-foreground/10"
        />
      )}
      {image && (
        <img
          src={image}
          alt={alt}
          draggable={false}
          onLoad={() => setLoadedUrl(image)}
          onError={() => setFailedUrl(image)}
          className={cn(
            'absolute inset-0 h-full w-full object-cover transition-opacity duration-300',
            anchor,
            waiting ? 'opacity-0' : 'opacity-100',
          )}
        />
      )}
      {!image && !loading && (
        <span
          role="img"
          aria-label={alt}
          className="absolute inset-0 flex items-center justify-center"
        >
          <DoodleCharacter size={doodleSize} />
        </span>
      )}
      {videoUrl && (
        <HoverVideo src={videoUrl} anchor={anchor} active={active} />
      )}
    </span>
  )
}

interface HoverVideoProps {
  src: string
  anchor: string
  active: boolean
}

// Con `preload="none"` no baja nada hasta el primer hover; después se pausa y
// se reanuda. Queda montado a propósito: desmontarlo al salir con el teclado
// borra un nodo mientras el foco está en el aire, y el diálogo de Radix lo
// devuelve a su caja en vez de dejarlo pasar a la tarjeta siguiente. Arranca
// transparente y aparece con un fundido cuando ya tiene cuadro (nunca una
// caja negra mientras carga); en pausa, se desvanece y vuelve la foto.
function HoverVideo({ src, anchor, active }: HoverVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (!active) {
      video.pause()
      return
    }

    // play() se rechaza si se pausa antes de arrancar: es lo esperado.
    void video.play().catch(() => null)
  }, [active])

  return (
    <video
      ref={videoRef}
      src={src}
      muted
      loop
      playsInline
      preload="none"
      aria-hidden
      onPlaying={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      className={cn(
        'pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-300',
        anchor,
        active && playing ? 'opacity-100' : 'opacity-0',
      )}
    />
  )
}
