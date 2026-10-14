import type { CSSProperties, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import {
  NO_SEEK_PROPS,
  TIMELINE_BLOCK_ICONS,
  TIMELINE_BLOCK_TONES,
} from '@/modules/videos/constants'
import type { TimelineBlockKind } from '@/modules/videos/types/library'

interface TimelineBlockCardProps {
  kind: TimelineBlockKind
  selected: boolean
  title: string
  // Ids de las escenas que cubre, al lado de la ficha del tipo.
  sceneLabel: string
  durationLabel: string
  generating: boolean
  // Avance mientras se genera («45%»); sin él, solo el spinner.
  progressLabel?: string
  failed: boolean
  // Desactualizado (avatar): la etiqueta arriba a la derecha y la franja abajo.
  staleLabel?: string
  onSelect(): void
  // La miniatura: las escenas que fusiona el clip o la vista previa del look
  // del avatar.
  children: ReactNode
}

// La tarjeta de un bloque de la pista de escenas con el diseño del clip de
// VidRush (ADR-0057, spec §10.3): esquinas redondeadas, borde de 2 px del
// color de su tipo (celeste el clip animado, morado el avatar), borde blanco
// y brillo del mismo color al elegirla, más luz al pasar el cursor, y la ficha
// del tipo arriba a la izquierda. Presentacional: el estado llega resuelto.
// Sin asas: se dibujan recién cuando un bloque se pueda estirar (entrega 3).
export function TimelineBlockCard({
  kind,
  selected,
  title,
  sceneLabel,
  durationLabel,
  generating,
  progressLabel,
  failed,
  staleLabel,
  onSelect,
  children,
}: TimelineBlockCardProps) {
  const Icon = TIMELINE_BLOCK_ICONS[kind]
  // El tono viaja como variable CSS: Tailwind no arma clases con un color que
  // se decide en el render.
  const toneStyle = { '--tone': TIMELINE_BLOCK_TONES[kind] } as CSSProperties

  return (
    <button
      type="button"
      {...NO_SEEK_PROPS}
      title={title}
      onClick={onSelect}
      style={toneStyle}
      className={cn(
        'absolute inset-x-0 bottom-1 top-1 overflow-hidden rounded-md border-[3px] outline-none transition-[border-color,box-shadow,filter] duration-150 focus-visible:border-white focus-visible:ring-2 focus-visible:ring-blue-500',
        selected
          ? 'border-white shadow-[0_0_0_1px_rgb(15_23_42/0.22)] brightness-110'
          : 'border-[hsl(var(--tone)/0.7)] hover:border-white hover:brightness-110',
      )}
    >
      <span className="flex h-full w-full">{children}</span>

      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 to-transparent"
      />

      <span className="absolute left-4 top-0.5 flex items-center gap-1">
        <span
          aria-hidden
          className="flex h-4 w-4 items-center justify-center rounded bg-[hsl(var(--tone))] text-white"
        >
          <Icon className="h-2.5 w-2.5" />
        </span>
        <span className="flex h-4 min-w-[16px] items-center justify-center rounded bg-charcoal/80 px-1 font-display text-[10px] font-bold tabular-nums text-white">
          {sceneLabel}
        </span>
      </span>

      {staleLabel && (
        <>
          <span className="absolute right-4 top-0.5 rounded bg-saffron px-1 font-display text-[10px] font-bold text-charcoal">
            {staleLabel}
          </span>
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-1 bg-saffron"
          />
        </>
      )}

      <span className="absolute bottom-0.5 right-4 rounded bg-charcoal/80 px-1 font-mono text-[10px] tabular-nums text-white">
        {durationLabel}
      </span>

      {failed && !generating && (
        <span aria-hidden className="absolute inset-0 bg-destructive/40" />
      )}
      {generating && (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-black/70">
          <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--tone))]" />
          {progressLabel && (
            <span className="font-display text-[10px] font-bold tabular-nums text-white">
              {progressLabel}
            </span>
          )}
        </span>
      )}
    </button>
  )
}
