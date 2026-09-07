import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import {
  SAMPLE_SWIPE_EDGE_RESISTANCE,
  SAMPLE_SWIPE_FRACTION,
  SAMPLE_SWIPE_SETTLE_TRANSITION,
} from '@/modules/videos/constants'

interface StyleSamplesCarouselProps {
  // URLs de las muestras, en orden.
  images: string[]
  // Nombre del estilo para el alt («Muestra 1 de <name>»).
  name: string
}

type ArrowSide = 'previous' | 'next'

// ¿El gesto empezó sobre un control? Entonces no es un arrastre.
function startsOnButton(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('button') !== null
}

// Las muestras de un estilo, en 16:9, para mirarlas bien (port de
// CarruselMuestras del origen). Tres cosas que hay que entender para no
// volver a romperlo:
//
//  1. Nada de transición DURANTE el arrastre: la tira se mueve 1:1 con el
//     mouse y la transición existe solo al soltar, cuando sí se quiere que
//     acomode con suavidad.
//  2. Nada de `setPointerCapture`: con el puntero capturado por el marco el
//     navegador manda el click al elemento que capturó y las flechas quedan
//     muertas. El arrastre se resuelve con listeners de mousemove/mouseup en
//     la ventana (que además cubren soltar fuera del marco) y con eventos
//     táctiles para el dedo.
//  3. Eventos de mouse en vez de Pointer Events, como toda la tarjeta: en la
//     máquina del dueño los de puntero no llegaban y los de mouse sí.
export function StyleSamplesCarousel({
  images,
  name,
}: StyleSamplesCarouselProps) {
  const { t } = useTranslation()
  const total = images.length
  const [index, setIndex] = useState(0)
  const [drag, setDrag] = useState(0)
  const [dragging, setDragging] = useState(false)
  // Flecha con el mouse encima, para resaltarla sin depender de `:hover`.
  const [hoveredArrow, setHoveredArrow] = useState<ArrowSide | null>(null)
  const frame = useRef<HTMLDivElement>(null)
  const startX = useRef<number | null>(null)
  // El recorrido más fresco para soltar: el listener de la ventana se
  // registra una vez por gesto y leería el `drag` del render en que nació.
  const travelled = useRef(0)

  const go = useCallback(
    (delta: number) => {
      // Circular: de la última vuelve a la primera y viceversa.
      setIndex((current) => {
        const next = current + delta
        if (next < 0) return total - 1
        if (next >= total) return 0
        return next
      })
      travelled.current = 0
      setDrag(0)
    },
    [total],
  )

  const move = useCallback(
    (clientX: number) => {
      if (startX.current === null) return
      const raw = clientX - startX.current
      // En los extremos el arrastre «pesa» más: se nota que no hay nada más
      // allá, en vez de dejar un hueco vacío que parece un error.
      const atEdge =
        (index === 0 && raw > 0) || (index === total - 1 && raw < 0)
      const next = atEdge ? raw * SAMPLE_SWIPE_EDGE_RESISTANCE : raw
      travelled.current = next
      setDrag(next)
    },
    [index, total],
  )

  const release = useCallback(() => {
    if (startX.current === null) return
    const width = frame.current?.clientWidth ?? 1
    const threshold = width * SAMPLE_SWIPE_FRACTION
    const distance = travelled.current
    startX.current = null
    setDragging(false)
    if (distance <= -threshold) {
      go(1)
      return
    }
    if (distance >= threshold) {
      go(-1)
      return
    }
    // No llegó: vuelve a su lugar, con transición.
    travelled.current = 0
    setDrag(0)
  }, [go])

  // Los listeners viven en la VENTANA mientras dura el arrastre: soltar fuera
  // del marco (o de la ventana) igual termina el gesto.
  useEffect(() => {
    if (!dragging) return undefined
    const onMouseMove = (event: MouseEvent) => move(event.clientX)
    const onMouseUp = () => release()
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [dragging, move, release])

  if (total === 0) return null

  const arrowClass = (side: ArrowSide) =>
    cn(
      'absolute top-1/2 z-10 -translate-y-1/2 cursor-pointer rounded-full p-2 shadow transition-all duration-150 [&_svg]:pointer-events-none',
      'hover:scale-110 hover:bg-saffron hover:text-charcoal',
      side === 'previous' ? 'left-2' : 'right-2',
      hoveredArrow === side
        ? 'scale-110 bg-saffron text-charcoal'
        : 'bg-background/85',
    )

  return (
    <div className="space-y-2">
      <div
        ref={frame}
        className="relative select-none overflow-hidden rounded-xl border border-border bg-muted"
        style={{
          cursor: dragging ? 'grabbing' : 'grab',
          // La página se sigue scrolleando en vertical con el dedo; el
          // horizontal es nuestro.
          touchAction: 'pan-y',
        }}
        onMouseDown={(event) => {
          if (startsOnButton(event.target)) return
          // Sin esto el navegador intenta «arrastrar la imagen».
          event.preventDefault()
          startX.current = event.clientX
          setDragging(true)
        }}
        onTouchStart={(event) => {
          if (startsOnButton(event.target)) return
          const touch = event.touches.item(0)
          if (!touch) return
          startX.current = touch.clientX
          setDragging(true)
        }}
        onTouchMove={(event) => {
          const touch = event.touches.item(0)
          if (touch) move(touch.clientX)
        }}
        onTouchEnd={release}
        onTouchCancel={release}
      >
        {/* 16:9 — el formato real de las imágenes del video. */}
        <div className="aspect-video w-full overflow-hidden">
          {/* La TIRA: todas las imágenes en fila. Se mueve entera, así el
              arrastre sigue al mouse 1:1 y al soltar continúa hasta la que
              corresponde — un solo movimiento, sin salto. */}
          <div
            className="flex h-full"
            style={{
              width: `${total * 100}%`,
              transform: `translateX(calc(${(-index * 100) / total}% + ${drag}px))`,
              transition: dragging ? 'none' : SAMPLE_SWIPE_SETTLE_TRANSITION,
              willChange: 'transform',
            }}
          >
            {images.map((source, position) => (
              <div
                key={source}
                className="h-full shrink-0"
                style={{ width: `${100 / total}%` }}
              >
                {/* `object-contain`: la imagen se ve ENTERA. Recortarla acá
                    sería esconder justo lo que la persona vino a mirar. */}
                <img
                  src={source}
                  alt={t('create.customStyles.sampleAlt', {
                    number: position + 1,
                    name,
                  })}
                  draggable={false}
                  className="pointer-events-none h-full w-full object-contain"
                />
              </div>
            ))}
          </div>
        </div>

        {total > 1 && (
          <>
            <button
              type="button"
              aria-label={t('create.customStyles.previousSample')}
              onClick={() => go(-1)}
              onMouseEnter={() => setHoveredArrow('previous')}
              onMouseMove={() => setHoveredArrow('previous')}
              onMouseLeave={() => setHoveredArrow(null)}
              className={arrowClass('previous')}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label={t('create.customStyles.nextSample')}
              onClick={() => go(1)}
              onMouseEnter={() => setHoveredArrow('next')}
              onMouseMove={() => setHoveredArrow('next')}
              onMouseLeave={() => setHoveredArrow(null)}
              className={arrowClass('next')}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {total > 1 && (
        <div className="flex items-center justify-center gap-2">
          {images.map((source, position) => (
            <button
              key={source}
              type="button"
              aria-label={t('create.customStyles.goToSample', {
                number: position + 1,
              })}
              onClick={() => {
                setIndex(position)
                travelled.current = 0
                setDrag(0)
              }}
              className={cn(
                'h-2 cursor-pointer rounded-full transition-all hover:bg-saffron',
                position === index
                  ? 'w-6 bg-saffron'
                  : 'w-2 bg-muted-foreground/40',
              )}
            />
          ))}
          <span className="ml-2 font-body text-xs text-muted-foreground">
            {t('create.customStyles.sampleCounter', {
              current: index + 1,
              total,
            })}
          </span>
        </div>
      )}
    </div>
  )
}
