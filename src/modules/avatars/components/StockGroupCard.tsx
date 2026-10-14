import { useState } from 'react'
import type { MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Heart, Loader2, Plus } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { AvatarDeleteMenu } from '@/modules/avatars/components/AvatarDeleteMenu'
import { AvatarTrainingStatus } from '@/modules/avatars/components/AvatarTrainingStatus'
import { LookPreview } from '@/modules/avatars/components/LookPreview'
import { useAvatarDeleteMenu } from '@/modules/avatars/hooks/useAvatarDeleteMenu'
import { useHoverIntent } from '@/modules/avatars/hooks/useHoverIntent'
import { useStockLooks } from '@/modules/avatars/hooks/useStockLooks'
import { coverLookVideoUrl } from '@/modules/avatars/utilities/coverLookVideo'
import { isSecondClickOfDoubleClick } from '@/modules/avatars/utilities/twoStepConfirmGuards'
import type { HeyGenAvatarGroup } from '@pipeline/types/avatar.ts'

interface StockGroupCardProps {
  group: HeyGenAvatarGroup
  // De qué listado sale (el stock público o los avatares de la cuenta): con
  // él se piden sus looks cuando el grupo no trae video.
  ownership: 'public' | 'private'
  // Ya está en la biblioteca (mismo grupo de HeyGen): no se vuelve a agregar.
  added: boolean
  // Esta tarjeta se está agregando.
  adding: boolean
  // Hay un alta en vuelo (de esta u otra tarjeta).
  disabled: boolean
  // Marcado con el corazón (favoritos del stock público, en esta máquina).
  favorite: boolean
  // Lo guardado todavía no se leyó: el corazón no puede cambiar nada todavía
  // y se muestra deshabilitado (`aria-disabled`, sigue enfocable).
  favoriteDisabled?: boolean
  // Solo en el stock público: sin él no hay corazón.
  onToggleFavorite?: () => void
  // Solo en «Mis avatares» (sin él no hay botón de eliminar): «Eliminar
  // permanentemente de HeyGen» borra el avatar de la cuenta de HeyGen, de
  // verdad (el menú pide antes «Seguro»).
  onDeleteFromHeyGen?: () => void
  // Solo en «Mis avatares» y con el avatar en la biblioteca: «Eliminar de la
  // lista» lo saca de la biblioteca de Vimo (sigue en HeyGen).
  onRemoveFromList?: () => void
  // Esta tarjeta se está borrando de HeyGen: «Eliminando…» y apagada.
  deleting?: boolean
  // Hay un alta o un borrado en vuelo: el botón de eliminar todavía no hace
  // nada (`aria-disabled`, sigue enfocable).
  deleteDisabled?: boolean
  onOpen: (group: HeyGenAvatarGroup) => void
  onAdd: (group: HeyGenAvatarGroup) => void
}

// Un avatar de HeyGen en el primer nivel del stock, como en HeyGen: la vista
// previa vertical (el video al pasar el mouse) con un zoom suave y, abajo, un
// velo con «Ver looks» y «Agregar»; debajo, el nombre y cuántos looks tiene.
// Muchos grupos no traen video propio (diseño §18): entonces, la primera vez
// que la persona se detiene en la tarjeta (`useHoverIntent`: el mouse quieto
// HOVER_FETCH_DELAY_MS o el foco del teclado) pide los looks del avatar (la
// misma caché que su segundo nivel) y reproduce el de su look de portada, con
// un velo que late mientras llega. Arriba a la derecha, con
// `onToggleFavorite` (solo el stock público), el corazón de favoritos: una
// etiqueta fija y el estado en `aria-pressed`; siempre a la vista si está
// marcado, si no con el mouse o el foco. Toda la tarjeta abre sus looks con
// el mouse; con el teclado se llega por «Ver looks», que aparece con el foco.
// Un avatar propio que todavía entrena (o no pudo entrenar) muestra su estado
// y no se agrega. En «Mis avatares», arriba a la izquierda, el botón de
// eliminar (`AvatarDeleteMenu`, entrega 2d), con el mouse o el foco: despliega
// sobre la imagen «Eliminar de la lista» (si el avatar está en la biblioteca)
// y «Eliminar permanentemente de HeyGen», que pide «Seguro»; mientras elimina,
// «Eliminando…» con la tarjeta apagada. Salir de la tarjeta o tocar otra parte
// de ella cierra el menú (tocarla no abre los looks). Ahí, «Agregado» va
// arriba a la derecha, donde no hay corazón.
export function StockGroupCard({
  group,
  ownership,
  added,
  adding,
  disabled,
  favorite,
  favoriteDisabled = false,
  onToggleFavorite,
  onDeleteFromHeyGen,
  onRemoveFromList,
  deleting = false,
  deleteDisabled = false,
  onOpen,
  onAdd,
}: StockGroupCardProps) {
  const { t } = useTranslation()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const deleteMenu = useAvatarDeleteMenu()
  // Una tarjeta que nadie miró (o que el mouse solo cruzó) no gasta un
  // proceso del sidecar.
  const hoverIntent = useHoverIntent()
  const remote = useStockLooks({
    ownership,
    groupId: group.groupId,
    enabled: hoverIntent.hoveredOnce && !group.previewVideoUrl,
  })

  const active = hovered || focused
  const videoUrl =
    group.previewVideoUrl ?? coverLookVideoUrl(group, remote.looks)
  // Los grupos del stock público no traen `status`: están listos.
  const trainingStatus =
    group.status && group.status !== 'ready' ? group.status : null
  const canAdd = !added && !trainingStatus
  const hasDeleteMenu =
    onDeleteFromHeyGen !== undefined || onRemoveFromList !== undefined
  // Las opciones de eliminar cubren la imagen, o el botón dice «Eliminando…».
  const deleteExpanded = deleteMenu.open || deleting

  // Los botones del velo no dejan subir el clic: si no, la tarjeta también
  // abriría los looks.
  const openLooks = (event: MouseEvent) => {
    event.stopPropagation()
    onOpen(group)
  }
  const add = (event: MouseEvent) => {
    event.stopPropagation()
    onAdd(group)
  }
  const toggleFavorite = (event: MouseEvent) => {
    event.stopPropagation()
    if (favoriteDisabled) return

    onToggleFavorite?.()
  }

  // Con el menú de eliminar abierto, tocar la tarjeta lo cierra en vez de
  // abrir los looks. El mousedown no mueve el foco mientras tanto: si el botón
  // lo perdiera, su blur cerraría el menú antes del clic y el clic abriría los
  // looks (ERRORES-CONOCIDOS: autosave-blur-vs-decision-click, variante del
  // diálogo de Radix). El segundo clic de un doble clic no abre nada: el
  // primero ya abrió los looks, cerró el menú o eligió «Eliminar de la lista»
  // (que cierra el menú y deja la imagen debajo del puntero).
  const openFromCard = (event: MouseEvent) => {
    if (isSecondClickOfDoubleClick(event)) return

    if (deleteMenu.open) {
      deleteMenu.close()
      return
    }

    onOpen(group)
  }
  const keepFocusWhileDeleteMenuOpen = (event: MouseEvent) => {
    if (deleteMenu.open) event.preventDefault()
  }

  return (
    <article
      aria-busy={deleting}
      onClick={openFromCard}
      onMouseDown={keepFocusWhileDeleteMenuOpen}
      onMouseEnter={() => {
        setHovered(true)
        hoverIntent.pointerMoved()
      }}
      onMouseMove={hoverIntent.pointerMoved}
      onMouseLeave={() => {
        setHovered(false)
        deleteMenu.close()
        hoverIntent.pointerLeft()
      }}
      onFocus={(event) => {
        setFocused(true)
        if (event.target.matches(':focus-visible'))
          hoverIntent.focusedWithKeyboard()
      }}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return

        setFocused(false)
      }}
      className={cn(
        'group flex cursor-pointer flex-col gap-2.5 transition-opacity',
        deleting && 'pointer-events-none opacity-50',
      )}
    >
      <div className="relative overflow-hidden rounded-2xl bg-muted shadow-sm ring-1 ring-border transition-shadow duration-300 group-hover:shadow-xl">
        <LookPreview
          imageUrl={group.previewImageUrl}
          videoUrl={videoUrl}
          alt={t('avatars.stock.previewAria', { name: group.name })}
          active={active}
          videoPending={active && remote.isLoading}
          doodleSize={64}
          className="aspect-[4/5] w-full transition-transform duration-500 ease-out group-hover:scale-105"
        />

        {/* Con el botón de eliminar, a la derecha (en «Mis avatares» no hay
            corazón), y oculto mientras el menú está abierto o elimina. */}
        {added && (
          <span
            className={cn(
              'pointer-events-none absolute top-2.5 inline-flex items-center gap-1 rounded-full bg-saffron px-2.5 py-1 font-display text-[11px] font-bold text-charcoal shadow-sm transition-opacity',
              hasDeleteMenu ? 'right-2.5' : 'left-2.5',
              deleteExpanded && 'opacity-0',
            )}
          >
            <Check aria-hidden strokeWidth={3} className="h-3 w-3" />
            {t('avatars.stock.agregado')}
          </span>
        )}

        {/* `transform-gpu`: queda en su capa, encima de la imagen que hace
            zoom (ERRORES-CONOCIDOS: webkit-capa-compuesta-tapa-hermanos-con-
            z-index-en-overflow-hidden-redondeado). `data-favorite`: el
            diálogo lleva el foco acá al quitar con el teclado el favorito de
            la tarjeta vecina. */}
        {onToggleFavorite && (
          <button
            type="button"
            data-favorite
            aria-pressed={favorite}
            aria-disabled={favoriteDisabled}
            aria-label={t('avatars.stock.favoritoAria', { name: group.name })}
            onClick={toggleFavorite}
            className={cn(
              'absolute right-2.5 top-2.5 flex h-8 w-8 transform-gpu items-center justify-center rounded-full bg-black/35 backdrop-blur-md transition hover:bg-black/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
              favorite
                ? 'text-coral opacity-100'
                : 'text-white opacity-0 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100',
              favoriteDisabled &&
                'cursor-not-allowed hover:bg-black/35 [&>svg]:opacity-50',
            )}
          >
            <Heart
              aria-hidden
              className={cn('h-4 w-4', favorite && 'fill-current')}
            />
          </button>
        )}

        {/* Eliminar (solo «Mis avatares»): el botón arriba a la izquierda y
            las opciones sobre la imagen. Su botón lleva `data-avatar-delete`:
            el diálogo lleva el foco acá al eliminar con el teclado la tarjeta
            vecina. */}
        {hasDeleteMenu && (
          <AvatarDeleteMenu
            menu={deleteMenu}
            variant="stock"
            name={group.name}
            onRemoveFromList={onRemoveFromList}
            onDeleteFromHeyGen={onDeleteFromHeyGen}
            deleting={deleting}
            disabled={deleteDisabled}
          />
        )}

        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-3 pt-14 transition-opacity duration-200',
            adding
              ? 'opacity-100'
              : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100',
            // Las opciones de eliminar ocupan la imagen: sin «Ver looks» ni
            // «Agregar» encima.
            deleteExpanded && 'invisible',
          )}
        >
          {/* Los botones nombran al avatar para el lector de pantalla (hay
              uno por tarjeta). `data-group-id`: el diálogo devuelve el foco
              acá al volver de los looks o tras agregar. */}
          <button
            type="button"
            data-group-id={group.groupId}
            aria-label={t('avatars.stock.verLooksAria', { name: group.name })}
            onClick={openLooks}
            className="pointer-events-auto inline-flex h-8 min-w-0 flex-1 items-center justify-center rounded-full border border-white/25 bg-white/15 px-3 font-display text-xs font-bold text-white backdrop-blur-md transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <span className="truncate">{t('avatars.stock.verLooks')}</span>
          </button>
          {canAdd && (
            <button
              type="button"
              disabled={disabled}
              aria-label={t('avatars.stock.agregarAria', { name: group.name })}
              onClick={add}
              className="pointer-events-auto inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-full bg-saffron px-3 font-display text-xs font-bold text-charcoal shadow-sm transition-colors hover:bg-saffron/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-70"
            >
              {adding ? (
                <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus aria-hidden strokeWidth={3} className="h-3.5 w-3.5" />
              )}
              {t('avatars.stock.agregar')}
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-0.5">
        <h3 className="min-w-0 truncate font-display text-sm font-bold text-foreground">
          {group.name}
        </h3>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 font-display text-[10px] font-bold tabular-nums text-muted-foreground">
          {t('avatars.stock.looksCount', { count: group.looksCount })}
        </span>
      </div>

      {trainingStatus && (
        <AvatarTrainingStatus status={trainingStatus} className="px-0.5" />
      )}
    </article>
  )
}
