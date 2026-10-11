import { useId, useState } from 'react'
import type { MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Heart, Loader2, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { AvatarTrainingStatus } from '@/modules/avatars/components/AvatarTrainingStatus'
import { LookPreview } from '@/modules/avatars/components/LookPreview'
import { useHoverIntent } from '@/modules/avatars/hooks/useHoverIntent'
import { useStockLooks } from '@/modules/avatars/hooks/useStockLooks'
import { coverLookVideoUrl } from '@/modules/avatars/utilities/coverLookVideo'
import {
  ignoreHeldKey,
  isSecondClickOfDoubleClick,
} from '@/modules/avatars/utilities/twoStepConfirmGuards'
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
  // Solo en «Mis avatares»: sin él no hay tacho. Borra el avatar de la cuenta
  // de HeyGen, de verdad (la tarjeta pide antes la confirmación).
  onDeleteFromHeyGen?: () => void
  // Esta tarjeta se está borrando de HeyGen: «Eliminando…» y apagada.
  deleting?: boolean
  // Hay un alta o un borrado en vuelo: el tacho todavía no hace nada
  // (`aria-disabled`, sigue enfocable).
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
// y no se agrega. En «Mis avatares» (`onDeleteFromHeyGen`), arriba a la
// izquierda, el tacho para eliminar el avatar de HeyGen (entrega 2c), con el
// mouse o el foco: el primer clic lo vuelve «¿Eliminar para siempre?» en rojo
// con la explicación sobre la imagen (también es su descripción accesible);
// el segundo, que no puede ser el de un doble clic, lo elimina («Eliminando…»
// con la tarjeta apagada). Salir de la tarjeta, sacarle el foco o tocar otra
// parte de la tarjeta cancela la confirmación. Ahí, «Agregado» va arriba a la
// derecha, donde no hay corazón. Nada de esto entra o sale del DOM en el blur:
// cambian clases y atributos, porque dentro del diálogo un nodo que se va en el
// blur hace que Radix devuelva el foco a su caja (ERRORES-CONOCIDOS: radix-
// focusscope-devuelve-el-foco-al-dialogo-si-se-desmonta-un-nodo-durante-el-
// blur).
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
  deleting = false,
  deleteDisabled = false,
  onOpen,
  onAdd,
}: StockGroupCardProps) {
  const { t } = useTranslation()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  // El tacho pidió la confirmación y espera el segundo clic.
  const [confirming, setConfirming] = useState(false)
  const deleteHintId = useId()
  const groupNameId = useId()
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
  // El tacho, ancho y en rojo: pide la confirmación o está eliminando.
  const deleteExpanded = confirming || deleting

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

  // Primer clic: pide la confirmación; el segundo elimina. El segundo clic de
  // un doble clic (`detail` 2 o más) no confirma: eliminar no se deshace.
  // Enter y Espacio llegan con `detail` 0.
  const deleteFromHeyGen = (event: MouseEvent) => {
    event.stopPropagation()
    if (deleting || deleteDisabled) return
    if (!confirming) {
      setConfirming(true)
      return
    }
    if (isSecondClickOfDoubleClick(event)) return

    setConfirming(false)
    onDeleteFromHeyGen?.()
  }

  // El nombre del tacho para el lector de pantalla. En reposo es solo un ícono
  // y su nombre nombra al avatar (hay uno por tarjeta); armado o eliminando,
  // es el texto que se ve («¿Eliminar para siempre?», «Eliminando…»), así el
  // control por voz lo encuentra por lo que dice (WCAG 2.5.3).
  const deleteLabel = () => {
    if (deleteExpanded) return undefined

    return t('avatars.stock.eliminarHeygenAria', { name: group.name })
  }

  // Su descripción: en reposo, la explicación; armado, el avatar y la
  // explicación; eliminando, el avatar.
  const deleteDescription = () => {
    if (deleting) return groupNameId
    if (confirming) return `${groupNameId} ${deleteHintId}`

    return deleteHintId
  }

  // Con la confirmación a la vista, tocar la tarjeta la cancela en vez de
  // abrir los looks. El mousedown no mueve el foco mientras tanto: si el tacho
  // lo perdiera, su blur la cancelaría antes del clic y el clic abriría los
  // looks.
  const openFromCard = () => {
    if (confirming) {
      setConfirming(false)
      return
    }

    onOpen(group)
  }
  const keepFocusWhileConfirming = (event: MouseEvent) => {
    if (confirming) event.preventDefault()
  }

  return (
    <article
      aria-busy={deleting}
      onClick={openFromCard}
      onMouseDown={keepFocusWhileConfirming}
      onMouseEnter={() => {
        setHovered(true)
        hoverIntent.pointerMoved()
      }}
      onMouseMove={hoverIntent.pointerMoved}
      onMouseLeave={() => {
        setHovered(false)
        setConfirming(false)
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

        {/* Con tacho, a la derecha (en «Mis avatares» no hay corazón), y
            oculto mientras el tacho está ancho. */}
        {added && (
          <span
            className={cn(
              'pointer-events-none absolute top-2.5 inline-flex items-center gap-1 rounded-full bg-saffron px-2.5 py-1 font-display text-[11px] font-bold text-charcoal shadow-sm transition-opacity',
              onDeleteFromHeyGen ? 'right-2.5' : 'left-2.5',
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

        {/* El borrado en HeyGen (solo «Mis avatares»): la explicación, a la
            vista mientras se confirma y siempre como descripción del tacho, y
            el tacho, que se vuelve el botón rojo de confirmar. Ambos montados
            siempre y en su capa (`transform-gpu`, como el corazón).
            `data-heygen-delete`: el diálogo lleva el foco acá al eliminar con
            el teclado la tarjeta vecina. */}
        {onDeleteFromHeyGen && (
          <>
            <span
              id={deleteHintId}
              className={cn(
                'pointer-events-none absolute inset-0 flex transform-gpu items-end bg-black/75 p-3 pt-14 font-body text-xs leading-snug text-white transition-opacity duration-200',
                confirming ? 'visible opacity-100' : 'invisible opacity-0',
              )}
            >
              {t('avatars.stock.eliminarHint')}
            </span>
            <button
              type="button"
              data-heygen-delete
              aria-label={deleteLabel()}
              aria-describedby={deleteDescription()}
              aria-disabled={deleteDisabled || deleting}
              title={
                deleteExpanded ? undefined : t('avatars.stock.eliminarHeygen')
              }
              onClick={deleteFromHeyGen}
              // Una tecla sostenida no arma y confirma en una sola pulsación.
              onKeyDown={ignoreHeldKey}
              onBlur={() => setConfirming(false)}
              className={cn(
                'absolute left-2.5 top-2.5 flex h-8 max-w-[calc(100%-1.25rem)] transform-gpu items-center justify-center gap-1.5 rounded-full font-display text-xs font-bold backdrop-blur-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
                deleteExpanded
                  ? 'bg-destructive px-3 text-destructive-foreground opacity-100'
                  : 'w-8 bg-black/35 text-white opacity-0 hover:bg-black/55 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100',
                deleteDisabled &&
                  !deleteExpanded &&
                  'cursor-not-allowed hover:bg-black/35 [&>svg]:opacity-50',
              )}
            >
              <Trash2
                aria-hidden
                className={cn('h-4 w-4 shrink-0', deleting && 'hidden')}
              />
              <Loader2
                aria-hidden
                className={cn(
                  'h-4 w-4 shrink-0 animate-spin',
                  !deleting && 'hidden',
                )}
              />
              <span
                className={cn('min-w-0 truncate', !deleteExpanded && 'hidden')}
              >
                {deleting
                  ? t('avatars.stock.eliminando')
                  : t('avatars.stock.eliminarConfirmar')}
              </span>
            </button>
          </>
        )}

        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-3 pt-14 transition-opacity duration-200',
            adding
              ? 'opacity-100'
              : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100',
            // La explicación del borrado ocupa la imagen: sin «Ver looks» ni
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
        <h3
          id={groupNameId}
          className="min-w-0 truncate font-display text-sm font-bold text-foreground"
        >
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
