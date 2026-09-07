import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, MoreVertical, Pencil, Sparkles, Trash2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/modules/common/ui/dropdown-menu'
import { cn } from '@/modules/common/utilities/cn'
import { videosApi } from '@/modules/videos/api'
import { useSampleCarousel } from '@/modules/videos/hooks/useSampleCarousel'
import type { CustomStyleSummary } from '@pipeline/types/styles.ts'

interface CustomStyleCardProps {
  style: CustomStyleSummary
  selected: boolean
  disabled: boolean
  onSelect: () => void
  onEdit: () => void
  onGenerateSamples: () => void
  onDelete: () => void
}

// El borde según el estado: en uso manda sobre el hover.
function borderClass(selected: boolean, active: boolean): string {
  if (selected) return 'border-saffron shadow-md shadow-saffron/20'
  if (active) return 'border-saffron/60'
  return 'border-border'
}

// Tarjeta de un estilo propio (port de TarjetaEstilo del origen): imagen 4:3
// con las muestras rotando al hover, badge «En uso» y los tres puntos que
// abren el MENÚ con todo lo demás. El cuerpo de la tarjeta ELIGE; mirar o
// editar un estilo no cambia cuál está en uso, por eso son dos zonas de
// click distintas.
export function CustomStyleCard({
  style,
  selected,
  disabled,
  onSelect,
  onEdit,
  onGenerateSamples,
  onDelete,
}: CustomStyleCardProps) {
  const { t } = useTranslation()
  // ¿El mouse está sobre los tres puntos? Resalta el botón por estado (además
  // del hover de CSS: en la máquina del dueño el :hover recién se disparaba
  // al click, pero los eventos de movimiento llegaban) y FRENA el carrusel.
  const [overMenu, setOverMenu] = useState(false)
  const carousel = useSampleCarousel(style.samples.length, {
    paused: overMenu,
  })
  const samples = style.samples

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
        {samples.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-4 text-center text-muted-foreground">
            <Sparkles className="h-6 w-6" />
            <p className="font-body text-xs">
              {t('create.customStyles.noSamples')}
            </p>
          </div>
        ) : (
          <>
            {samples.map((sample, index) => (
              <img
                key={sample.file}
                src={videosApi.imageSource(sample.path, sample.mtimeMs)}
                alt={index === 0 ? style.name : ''}
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
            {samples.length > 1 && (
              <div className="absolute bottom-2 left-0 right-0 flex items-center justify-center gap-1.5">
                {samples.map((sample, index) => (
                  <span
                    key={sample.file}
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

        {selected && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-saffron px-2 py-0.5 font-display text-[10px] font-bold text-charcoal shadow">
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
                aria-label={t('create.customStyles.menuAria', {
                  name: style.name,
                })}
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
              <DropdownMenuLabel>{style.name}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={selected} onSelect={onSelect}>
                <Check className="mr-2 h-4 w-4" />
                {selected
                  ? t('create.customStyles.alreadyInUse')
                  : t('create.customStyles.useInVideo')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onEdit}>
                <Pencil className="mr-2 h-4 w-4" />
                {t('create.customStyles.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onGenerateSamples}>
                <Sparkles className="mr-2 h-4 w-4" />
                {t('create.customStyles.generateSamples')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={onDelete}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t('create.customStyles.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="px-3.5 py-2.5">
        <p className="truncate font-display text-base font-bold text-foreground">
          {style.name}
        </p>
        <p className="truncate font-body text-xs text-muted-foreground">
          {t('create.customStyles.charsCount', {
            chars: style.systemPrompt.length.toLocaleString(),
          })}
        </p>
      </div>
    </div>
  )
}
