import { useTranslation } from 'react-i18next'
import { FolderOpen, MoreVertical, Trash2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/modules/common/ui/dropdown-menu'
import { cn } from '@/modules/common/utilities/cn'
import { StyleCloneImage } from '@/modules/videos/components/StyleCloneImage'
import { StyleCloneStatusTag } from '@/modules/videos/components/StyleCloneStatusTag'
import {
  styleCloneCardStateOf,
  styleCloneCoverOf,
} from '@/modules/videos/utilities/styleCloneView'
import type { StyleCloneSession } from '@/modules/videos/types/styleClone'

interface StyleCloneSessionCardProps {
  session: StyleCloneSession
  onOpen: () => void
  onDiscard: () => void
}

// La tarjeta de una clonación en curso, al principio de la grilla de Mi estilo
// (ADR-0050, spec §8): la mejor imagen que tiene hasta ahora, apagada por un
// velo; en el centro, la etiqueta de lo que está haciendo —o de que necesita
// una respuesta—; y el menú para descartarla. Tocarla abre el modal en su
// paso. Misma silueta que una tarjeta de estilo, pero no se elige: todavía no
// es un estilo. Presentacional.
export function StyleCloneSessionCard({
  session,
  onOpen,
  onDiscard,
}: StyleCloneSessionCardProps) {
  const { t } = useTranslation()
  const state = styleCloneCardStateOf(session)
  const cover = styleCloneCoverOf(session)
  const sourceText =
    session.source.kind === 'youtube'
      ? session.title || t('create.styleClone.sessionFromVideo')
      : t('create.styleClone.sessionFromImages', {
          count: session.source.paths.length,
        })

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onOpen()
      }}
      onMouseDown={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
      className={cn(
        'group relative cursor-pointer select-none overflow-hidden rounded-2xl border-2 bg-card outline-none transition-all focus-visible:ring-2 focus-visible:ring-saffron/50',
        state.tone === 'attention'
          ? 'border-saffron shadow-md shadow-saffron/20'
          : 'border-border hover:border-saffron/60',
      )}
    >
      <div className="relative aspect-[4/3] bg-muted">
        {cover && (
          <StyleCloneImage
            image={cover}
            alt={session.name}
            className="pointer-events-none absolute inset-0 h-full w-full"
          />
        )}

        {/* El estado es lo que hay que leer de esta tarjeta: va en el centro,
            sobre un velo que apaga la imagen en todos los estados, para que
            la fase se distinga de un vistazo. */}
        <div className="absolute inset-0 z-[5] flex items-center justify-center bg-black/45 p-2">
          <StyleCloneStatusTag state={state} />
        </div>

        <div
          className="absolute right-2 top-2 z-10"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t('create.styleClone.sessionMenu')}
                className="cursor-pointer select-none rounded-full bg-background/85 p-1.5 shadow transition-all duration-150 hover:scale-125 hover:bg-saffron hover:text-charcoal hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-saffron/50 [&_svg]:pointer-events-none"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56 [&_[role=menuitem]]:cursor-pointer"
            >
              <DropdownMenuLabel className="truncate">
                {session.name}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onOpen}>
                <FolderOpen className="mr-2 h-4 w-4" />
                {t('create.styleClone.open')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={onDiscard}
                className="text-coral focus:text-coral"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t('create.styleClone.discard')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="px-3.5 py-2.5">
        <p className="truncate font-display text-base font-bold text-foreground">
          {session.name}
        </p>
        <p className="truncate font-body text-xs text-muted-foreground">
          {sourceText}
        </p>
      </div>
    </div>
  )
}
