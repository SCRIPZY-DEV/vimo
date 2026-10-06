import { Plus } from 'lucide-react'

interface NewStyleCardProps {
  title: string
  hint: string
  disabled: boolean
  onCreate: () => void
}

// La tarjeta de CREAR de una galería de estilos (Mi estilo y, para el admin,
// el catálogo): es fija, solo crea y nunca se transforma en un estilo. MISMA
// silueta que una tarjeta de estilo (zona 4:3 arriba + pie de dos líneas):
// mide lo mismo esté donde esté, y la grilla crece hacia abajo.
export function NewStyleCard({
  title,
  hint,
  disabled,
  onCreate,
}: NewStyleCardProps) {
  const create = () => {
    if (!disabled) onCreate()
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? undefined : 0}
      onClick={create}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        create()
      }}
      className="group flex cursor-pointer select-none flex-col overflow-hidden rounded-2xl border-2 border-dashed border-border bg-card text-muted-foreground outline-none transition-all hover:border-saffron/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-saffron/50"
    >
      <div className="flex aspect-[4/3] items-center justify-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-current transition-transform group-hover:scale-110">
          <Plus className="h-6 w-6" />
        </span>
      </div>
      <div className="px-3.5 py-2.5 text-left">
        <p className="truncate font-display text-base font-bold text-foreground">
          {title}
        </p>
        <p className="truncate font-body text-xs text-muted-foreground">
          {hint}
        </p>
      </div>
    </div>
  )
}
