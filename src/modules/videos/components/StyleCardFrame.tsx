import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, MoreVertical, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/modules/common/ui/dropdown-menu'
import { cn } from '@/modules/common/utilities/cn'
import { useSampleCarousel } from '@/modules/videos/hooks/useSampleCarousel'

interface StyleCardFrameProps {
  // URLs de las muestras, en orden; vacío = el marcador «sin muestras».
  images: string[]
  // Nombre del estilo: el alt de la primera muestra y el título del menú.
  name: string
  // Qué dice la tarjeta sin muestras (en Mi estilo se generan desde el menú;
  // en el catálogo, no).
  noSamplesText: string
  // aria-label de los tres puntos.
  menuLabel: string
  // Las opciones del menú, debajo del nombre.
  menu: ReactNode
  selected: boolean
  disabled: boolean
  // Atenúa las muestras y el pie (una gema que se está adaptando).
  dimmed?: boolean
  // Apaga las muestras (no el pie) de un estilo del catálogo que los usuarios
  // no ven tal cual: un borrador, uno oculto o cambios sin publicar; el
  // distintivo va encima.
  faded?: boolean
  // Lo que va encima de las muestras (el avance de la adaptación).
  overlay?: ReactNode
  footer: ReactNode
  onSelect: () => void
}

// El borde según el estado: en uso manda sobre el hover.
function borderClass(selected: boolean, active: boolean): string {
  if (selected) return 'border-saffron shadow-md shadow-saffron/20'
  if (active) return 'border-saffron/60'
  return 'border-border'
}

// El cascarón de una tarjeta de estilo (port de TarjetaEstilo del origen),
// compartido por Mi estilo y el catálogo: imagen 4:3 con las muestras rotando
// al hover, badge «En uso» y los tres puntos que abren el MENÚ con todo lo
// demás. El cuerpo de la tarjeta ELIGE; mirar o editar un estilo no cambia
// cuál está en uso, por eso son dos zonas de click distintas. Presentacional:
// qué opciones lleva el menú y qué dice el pie lo decide cada tarjeta.
export function StyleCardFrame({
  images,
  name,
  noSamplesText,
  menuLabel,
  menu,
  selected,
  disabled,
  dimmed = false,
  faded = false,
  overlay,
  footer,
  onSelect,
}: StyleCardFrameProps) {
  const { t } = useTranslation()
  // ¿El mouse está sobre los tres puntos? Resalta el botón por estado (además
  // del hover de CSS: en la máquina del dueño el :hover recién se disparaba
  // al click, pero los eventos de movimiento llegaban) y FRENA el carrusel.
  const [overMenu, setOverMenu] = useState(false)
  const carousel = useSampleCarousel(images.length, {
    paused: overMenu,
  })

  const choose = () => {
    if (!disabled) onSelect()
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? undefined : 0}
      onClick={choose}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        choose()
      }}
      // Eventos de mouse, no de puntero (origen): `Move` además de `Enter`
      // para re-encender el estado si el `Enter` se pierde.
      onMouseEnter={carousel.activate}
      onMouseMove={carousel.activate}
      onMouseLeave={carousel.deactivate}
      onFocus={carousel.activate}
      onBlur={carousel.deactivate}
      // El click no enfoca la tarjeta: en el WebView de macOS `focus-visible`
      // igual encendía el aro al hacer clic (visto en la tarjeta del catálogo,
      // que es idéntica). Con Tab el aro sigue; el menú de los tres puntos
      // abre por pointerdown y no depende de este foco.
      onMouseDown={(event) => event.preventDefault()}
      // Nada dentro de la tarjeta inicia un arrastre del navegador: un
      // arrastre en curso congela la forma del cursor y el :hover de toda la
      // página hasta el próximo click.
      onDragStart={(event) => event.preventDefault()}
      className={cn(
        // `select-none`: la tarjeta se clickea, no se lee (dos clicks seguidos
        // pintaban el título como texto). El aro de foco solo con TECLADO:
        // con `focus:` cada click dejaba un halo encendido.
        'group relative select-none overflow-hidden rounded-2xl border-2 bg-card transition-all',
        'outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-saffron/50',
        !disabled && 'cursor-pointer',
        carousel.active && 'shadow-lg shadow-saffron/10',
        borderClass(selected, carousel.active),
      )}
    >
      {/* 4:3 — con el pie de texto abajo, la TARJETA queda casi cuadrada. */}
      <div className="relative aspect-[4/3] bg-muted">
        {/* Atenuadas (una gema que se adapta), las muestras se apagan en
            bloque (la opacidad del carrusel vive en cada imagen) y lo que va
            encima queda nítido. */}
        <div
          className={cn(
            'absolute inset-0',
            dimmed && 'opacity-40',
            faded && !dimmed && 'opacity-45',
          )}
        >
          {images.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-4 text-center text-muted-foreground">
              <Sparkles className="h-6 w-6" />
              <p className="font-body text-xs">{noSamplesText}</p>
            </div>
          ) : (
            <>
              {images.map((source, index) => (
                <img
                  key={source}
                  src={source}
                  alt={index === 0 ? name : ''}
                  loading="lazy"
                  // Una <img> se arrastra de fábrica: apretar y mover sobre
                  // ella mete al navegador en modo arrastre (cursor congelado).
                  draggable={false}
                  className={cn(
                    'pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-500',
                    index === carousel.index ? 'opacity-100' : 'opacity-0',
                  )}
                />
              ))}
              {images.length > 1 && (
                <div className="absolute bottom-2 left-0 right-0 flex items-center justify-center gap-1.5">
                  {images.map((source, index) => (
                    <span
                      key={source}
                      className={cn(
                        'h-1.5 rounded-full shadow transition-all duration-300',
                        index === carousel.index
                          ? 'w-4 bg-white'
                          : 'w-1.5 bg-white/60',
                      )}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {overlay}

        {selected && (
          <span className="absolute left-2 top-2 z-[6] inline-flex items-center gap-1 rounded-full bg-saffron px-2 py-0.5 font-display text-[10px] font-bold text-charcoal shadow">
            <Check className="h-3 w-3" />
            {t('create.style.inUse')}
          </span>
        )}

        {/* Los tres puntos abren el MENÚ. `stopPropagation` en el contenedor
            impide que abrir el menú (o elegir una opción) elija la tarjeta de
            rebote; `z-10` para no depender del orden del DOM. */}
        <div
          className="absolute right-2 top-2 z-10"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onMouseEnter={() => setOverMenu(true)}
          onMouseMove={() => setOverMenu(true)}
          onMouseLeave={() => setOverMenu(false)}
        >
          {/* `modal={false}`: en modo modal Radix apaga los eventos de
              puntero del body y el botón deja de sentir el mouse; sin modal,
              el menú igual se cierra al clickear afuera. */}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                aria-label={menuLabel}
                // El svg transparente al mouse: son tres círculos sueltos y
                // al cruzarlos el blanco saltaba círculo → hueco → círculo.
                className={cn(
                  'cursor-pointer select-none rounded-full p-1.5 shadow transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-saffron/50 [&_svg]:pointer-events-none',
                  'hover:scale-125 hover:bg-saffron hover:text-charcoal hover:shadow-lg',
                  overMenu
                    ? 'scale-125 bg-saffron text-charcoal shadow-lg'
                    : 'bg-background/85',
                )}
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            {/* Manito en las opciones usables, flecha en las deshabilitadas:
                así se nota cuál no hace nada. */}
            <DropdownMenuContent
              align="end"
              className="w-60 [&_[role=menuitem]]:cursor-pointer [&_[role=menuitem][data-disabled]]:cursor-default"
            >
              <DropdownMenuLabel>{name}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {menu}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className={cn('px-3.5 py-2.5', dimmed && 'opacity-40')}>
        {footer}
      </div>
    </div>
  )
}
