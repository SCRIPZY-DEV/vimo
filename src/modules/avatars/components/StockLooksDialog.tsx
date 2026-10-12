import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { ArrowLeft, Loader2, Search } from 'lucide-react'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import { SegmentedTabs } from '@/modules/common/components/SegmentedTabs'
import { Button } from '@/modules/common/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/modules/common/ui/dialog'
import { Input } from '@/modules/common/ui/input'
import { cn } from '@/modules/common/utilities/cn'
import { FilterChips } from '@/modules/avatars/components/FilterChips'
import { LookPlayerDialog } from '@/modules/avatars/components/LookPlayerDialog'
import type { LookPlayerAction } from '@/modules/avatars/components/LookPlayerDialog'
import { LookPreview } from '@/modules/avatars/components/LookPreview'
import { StockGridSkeleton } from '@/modules/avatars/components/StockGridSkeleton'
import { StockGroupCard } from '@/modules/avatars/components/StockGroupCard'
import { StockLookCard } from '@/modules/avatars/components/StockLookCard'
import {
  STOCK_CATEGORY_FILTERS,
  STOCK_CATEGORY_LABEL_KEYS,
  STOCK_GENDER_FILTERS,
  STOCK_GENDER_LABEL_KEYS,
  STOCK_GRID_CLASS,
  STOCK_SKELETON_COUNT,
} from '@/modules/avatars/constants'
import { useAvatarMutations } from '@/modules/avatars/hooks/useAvatarMutations'
import { useLastInputWasKeyboard } from '@/modules/avatars/hooks/useLastInputWasKeyboard'
import { useOpenLook } from '@/modules/avatars/hooks/useOpenLook'
import { useStockFavorites } from '@/modules/avatars/hooks/useStockFavorites'
import { useStockGroupFilters } from '@/modules/avatars/hooks/useStockGroupFilters'
import { useStockGroups } from '@/modules/avatars/hooks/useStockGroups'
import { useStockLooks } from '@/modules/avatars/hooks/useStockLooks'
import { lookUnusableReasonKey } from '@/modules/avatars/utilities/lookUsability'
import type {
  AvatarSummary,
  HeyGenAvatarGroup,
  HeyGenLook,
} from '@pipeline/types/avatar.ts'

type Ownership = 'public' | 'private'

interface StockLooksDialogProps {
  entries: AvatarSummary[]
  // Lleva a un avatar de la biblioteca con su panel abierto: el recién
  // agregado con un look elegido, o el que ya estaba.
  onOpenAvatar: (id: string) => void
  onClose: () => void
}

// Explorar los avatares de HeyGen en dos niveles, como en HeyGen: primero los
// avatares (el stock público o los propios de la cuenta), filtrables por
// categoría (solo el público: Profesional, Estilo de vida, Comunidad o
// Favoritos), por género y por nombre entre lo cargado; después los looks de
// uno. Las categorías salen del tipo de look que informa `avatar-stock-types`
// (diseño §18): mientras clasifica, la grilla lo dice; si falla, lo dice y
// esas categorías muestran todo. Con un filtro activo la grilla pide páginas
// sola hasta mostrar STOCK_FILTER_MIN_VISIBLE tarjetas o llegar a la última
// (los filtros y esa auto-carga viven en `useStockGroupFilters`).
// Un clic en un look abre su reproductor, con «Cargar a la biblioteca» (el
// avatar con ese look como principal) o, si el avatar ya está, «Abrir en tu
// biblioteca». «Agregar» desde la tarjeta deja que el sidecar elija el
// principal. Al volver, la grilla de avatares sigue donde estaba y, con el
// teclado, el foco en el «Ver looks» de la tarjeta de origen. Una página que
// no llega deja el error junto a lo ya cargado, sin taparlo. En «Mis avatares»
// cada tarjeta trae el botón de eliminar (entrega 2d): «Eliminar
// permanentemente de HeyGen» borra el avatar de la cuenta de verdad (la
// tarjeta pide «Seguro»; de a un borrado, y nunca junto a un alta) y, si el
// avatar está en la biblioteca, «Eliminar de la lista» lo saca de ahí. Se monta
// solo mientras está abierto.
export function StockLooksDialog({
  entries,
  onOpenAvatar,
  onClose,
}: StockLooksDialogProps) {
  const { t } = useTranslation()
  const [ownership, setOwnership] = useState<Ownership>('public')
  const [group, setGroup] = useState<HeyGenAvatarGroup | null>(null)
  const [addingGroupId, setAddingGroupId] = useState<string | null>(null)
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null)
  const stockGroups = useStockGroups({ ownership, enabled: true })
  const stockLooks = useStockLooks({
    ownership,
    groupId: group?.groupId ?? '',
    enabled: group !== null,
  })
  const favorites = useStockFavorites()
  const filters = useStockGroupFilters({
    listing: stockGroups,
    ownership,
    favorites,
  })
  // El reproductor de un look del segundo nivel; al cerrarlo, el foco vuelve
  // a su ficha.
  const {
    openLookId,
    gridRef: looksRef,
    returnFocusRef: lookReturnRef,
    open: openLook,
    close: closeLook,
  } = useOpenLook<HTMLDivElement>()
  const { addAvatar, deleteAvatar, deleteFromHeyGen } = useAvatarMutations()
  const lastInputWasKeyboard = useLastInputWasKeyboard()
  const contentRef = useRef<HTMLDivElement>(null)
  // El primer nivel (la grilla de avatares): ahí se busca el «Ver looks» al
  // que vuelve el foco.
  const groupsRef = useRef<HTMLDivElement>(null)
  // Los chips de categoría: ahí se busca el elegido («Favoritos»), adonde va
  // el foco al quitar el último favorito con el teclado.
  const categoryChipsRef = useRef<HTMLDivElement>(null)
  // Las pestañas del origen: ahí se busca la elegida («Mis avatares»), adonde
  // va el foco al eliminar de HeyGen el último avatar con el teclado.
  const ownershipTabsRef = useRef<HTMLDivElement>(null)

  // La biblioteca guarda avatares (grupos de HeyGen): grupo → entrada.
  const libraryIds = new Map(entries.map((entry) => [entry.groupId, entry.id]))
  const { category, visibleGroups, classifying, autoLoading } = filters
  const categoryOptions = STOCK_CATEGORY_FILTERS.map((filter) => {
    return { id: filter, label: t(STOCK_CATEGORY_LABEL_KEYS[filter]) }
  })
  const genderOptions = STOCK_GENDER_FILTERS.map((filter) => {
    return { id: filter, label: t(STOCK_GENDER_LABEL_KEYS[filter]) }
  })
  const groupEntryId = group ? libraryIds.get(group.groupId) : undefined
  const openedLook = stockLooks.looks.find((look) => look.lookId === openLookId)
  const adding = addingGroupId !== null
  const deleting = deletingGroupId !== null
  const loadingLabelKey = loadingStatusKey(
    group !== null,
    stockGroups.isLoading,
    stockLooks.isLoading,
  )

  // El «Ver looks» de una tarjeta del primer nivel (`data-group-id`).
  const viewLooksButton = (groupId: string) => {
    return (
      groupsRef.current?.querySelector<HTMLElement>(
        `[data-group-id="${CSS.escape(groupId)}"]`,
      ) ?? null
    )
  }

  // Las categorías son del stock público: al cambiar de origen vuelven a
  // «Todos».
  const changeOwnership = (next: Ownership) => {
    setOwnership(next)
    filters.setCategory('all')
  }

  const openGroup = (target: HeyGenAvatarGroup) => {
    setGroup(target)
    closeLook()
  }

  // Con Escape o «Volver…» desde el teclado, el foco vuelve al «Ver looks»
  // de la tarjeta de origen: el nivel 2 se desmonta con el foco adentro y
  // Radix lo dejaría en la caja del diálogo (el próximo Tab arrancaría de
  // arriba). Con el mouse no se mueve: la tarjeta quedaría «activa» (velo y
  // video) lejos del puntero. `flushSync`: el botón tiene que estar visible
  // (el nivel 1 deja de ser `invisible`) antes de enfocarlo.
  const backToGroups = () => {
    const originId = group?.groupId
    flushSync(() => {
      setGroup(null)
      closeLook()
    })
    if (originId && lastInputWasKeyboard()) viewLooksButton(originId)?.focus()
  }

  // `addingGroupId` cambia dentro del clic (antes de esperar al sidecar), así
  // que el botón que lo disparó ya está apagado para el clic siguiente.
  const add = async (target: HeyGenAvatarGroup, mainLookId?: string) => {
    setAddingGroupId(target.groupId)
    // El listado de grupos trae el género; el detalle de un grupo público
    // que lee el sidecar, no. El nombre solo viaja para el log de soporte.
    const entry = await addAvatar({
      groupId: target.groupId,
      ownership: ownership === 'private' ? 'own' : 'stock',
      name: target.name,
      ...(mainLookId ? { mainLookId } : {}),
      ...(target.gender ? { gender: target.gender } : {}),
    }).catch(() => null)
    setAddingGroupId(null)
    return entry
  }

  // «Agregar» desde la tarjeta con el teclado: el foco está en ese botón, que
  // se apaga mientras agrega y desaparece al terminar; vuelve al «Ver looks»
  // de la misma tarjeta en vez de caer en la caja del diálogo. Solo si sigue
  // perdido al terminar (en el botón, en `<body>` o en la caja): si en el
  // medio la persona siguió con Tab, se queda donde llegó. Con el mouse no se
  // mueve (ver `backToGroups`).
  const addFromCard = async (target: HeyGenAvatarGroup) => {
    const trigger = document.activeElement
    const card = viewLooksButton(target.groupId)?.closest('article')
    const fromKeyboard =
      lastInputWasKeyboard() && (card?.contains(trigger) ?? false)
    await add(target)
    if (!fromKeyboard) return

    const active = document.activeElement
    const focusLost =
      active === trigger ||
      active === document.body ||
      active === contentRef.current
    if (focusLost) viewLooksButton(target.groupId)?.focus()
  }

  // El corazón de una tarjeta. En «Favoritos», quitar un favorito saca su
  // tarjeta de la grilla con el foco en el corazón, y Radix lo dejaría en la
  // caja del diálogo: con el teclado, el foco pasa antes al corazón de la
  // tarjeta vecina (la siguiente o, si era la última, la anterior) o, si no
  // queda ninguna, al chip «Favoritos». Con el mouse no se mueve (ver
  // `backToGroups`).
  const toggleFavorite = (groupId: string) => {
    const leavesGrid = category === 'favorites' && favorites.isFavorite(groupId)
    if (leavesGrid && lastInputWasKeyboard()) focusAfterLeaving(groupId)

    favorites.toggle(groupId)
  }

  const focusAfterLeaving = (groupId: string) => {
    const index = visibleGroups.findIndex((item) => item.groupId === groupId)
    if (index < 0) return

    const neighbour = visibleGroups[index + 1] ?? visibleGroups[index - 1]
    const target = neighbour
      ? viewLooksButton(neighbour.groupId)
          ?.closest('article')
          ?.querySelector<HTMLElement>('[data-favorite]')
      : categoryChipsRef.current?.querySelector<HTMLElement>(
          'button[aria-pressed="true"]',
        )
    target?.focus()
  }

  // El botón de eliminar de una tarjeta del primer nivel
  // (`data-avatar-delete`).
  const deleteButton = (groupId: string) => {
    return (
      viewLooksButton(groupId)
        ?.closest('article')
        ?.querySelector<HTMLElement>('[data-avatar-delete]') ?? null
    )
  }

  // «Eliminar de la lista» en «Mis avatares»: saca de la biblioteca la
  // entrada de ese grupo; el avatar sigue en HeyGen, así que la tarjeta se
  // queda (sin «Agregado») con el foco en su botón de eliminar.
  const removeFromList = (groupId: string) => {
    const entry = entries.find((item) => item.groupId === groupId)
    if (!entry) return

    deleteAvatar(entry)
  }

  // Eliminar de HeyGen el avatar de una tarjeta, ya confirmado en ella. Al
  // lograrlo, la tarjeta sale de la grilla con el foco adentro y Radix lo
  // dejaría en la caja del diálogo: con el teclado, el foco pasa al botón de
  // eliminar de la tarjeta vecina (la siguiente o, si era la última, la
  // anterior, en el orden de la grilla al empezar) o, si no queda ninguna, a la
  // pestaña «Mis avatares». Solo si sigue perdido al terminar (en el botón, en
  // `<body>` o en la caja): si en el medio la persona siguió con Tab, se queda
  // donde llegó. Con el mouse no se mueve (ver `backToGroups`). Si falla, la
  // mutación lo avisa y la tarjeta vuelve con el foco en su botón.
  const deleteFromCard = async (target: HeyGenAvatarGroup) => {
    if (adding || deleting) return

    const trigger = document.activeElement
    const card = viewLooksButton(target.groupId)?.closest('article')
    const fromKeyboard =
      lastInputWasKeyboard() && (card?.contains(trigger) ?? false)
    const order = visibleGroups.map((item) => item.groupId)
    setDeletingGroupId(target.groupId)
    const result = await deleteFromHeyGen(target).catch(() => null)
    setDeletingGroupId(null)
    if (!result || !fromKeyboard) return

    const active = document.activeElement
    const focusLost =
      active === trigger ||
      active === document.body ||
      active === contentRef.current
    if (focusLost) focusAfterDeleting(order, target.groupId)
  }

  const focusAfterDeleting = (order: string[], groupId: string) => {
    const index = order.indexOf(groupId)
    const after = order.slice(index + 1)
    const before = order.slice(0, Math.max(index, 0)).reverse()
    const neighbour = [...after, ...before]
      .map(deleteButton)
      .find((button) => button !== null)
    const target =
      neighbour ??
      ownershipTabsRef.current?.querySelector<HTMLElement>(
        '[role="tab"][aria-selected="true"]',
      )
    target?.focus()
  }

  // «Cargar a la biblioteca» desde el reproductor: el avatar con ese look
  // como principal y, directo al resultado, su panel en la biblioteca. Si
  // falla (la mutación lo avisa), el reproductor sigue abierto.
  const loadWithLook = async (lookId: string) => {
    if (!group) return

    const entry = await add(group, lookId)
    if (!entry) return

    onOpenAvatar(entry.id)
  }

  // El pie del reproductor: el avatar ya está en la biblioteca; o el look
  // sirve y se carga; o no sirve y dice por qué.
  const playerAction = (look: HeyGenLook): LookPlayerAction => {
    if (groupEntryId)
      return { kind: 'open-library', onOpen: () => onOpenAvatar(groupEntryId) }

    const reasonKey = lookUnusableReasonKey(look)
    if (reasonKey) return { kind: 'unusable', reasonKey }

    return {
      kind: 'load',
      busy: adding,
      onLoad: () => void loadWithLook(look.lookId),
    }
  }

  const groupsContent = () => {
    // Un «Cargar más» que falla no se lleva lo ya cargado: con tarjetas en
    // pantalla, el error va debajo de la grilla, junto a «Cargar más», que
    // sirve para reintentar.
    if (stockGroups.errorKey && stockGroups.groups.length === 0)
      return <ErrorMessage>{t(stockGroups.errorKey)}</ErrorMessage>
    if (stockGroups.isLoading)
      return <StockGridSkeleton count={STOCK_SKELETON_COUNT} />
    if (classifying) {
      return (
        <p
          role="status"
          className="flex items-center justify-center gap-2 py-16 font-body text-sm text-muted-foreground"
        >
          <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
          {t('avatars.stock.clasificando')}
        </p>
      )
    }
    if (visibleGroups.length === 0) {
      // Mientras busca más páginas, el pie lo dice («Buscando más…»).
      if (autoLoading) return null
      if (filters.noFavorites) {
        return (
          <p className="py-16 text-center font-body text-sm text-muted-foreground">
            {t('avatars.stock.vacioFavoritos')}
          </p>
        )
      }

      return (
        <p className="py-16 text-center font-body text-sm text-muted-foreground">
          {t('avatars.stock.vacio')}
        </p>
      )
    }

    return (
      <ul className={STOCK_GRID_CLASS}>
        {visibleGroups.map((item) => (
          <li key={item.groupId}>
            <StockGroupCard
              group={item}
              ownership={ownership}
              added={libraryIds.has(item.groupId)}
              adding={addingGroupId === item.groupId}
              disabled={adding || deleting}
              favorite={favorites.isFavorite(item.groupId)}
              favoriteDisabled={favorites.reading}
              onToggleFavorite={
                ownership === 'public'
                  ? () => toggleFavorite(item.groupId)
                  : undefined
              }
              onDeleteFromHeyGen={
                ownership === 'private'
                  ? () => void deleteFromCard(item)
                  : undefined
              }
              onRemoveFromList={
                ownership === 'private' && libraryIds.has(item.groupId)
                  ? () => removeFromList(item.groupId)
                  : undefined
              }
              deleting={deletingGroupId === item.groupId}
              deleteDisabled={adding || deleting}
              onOpen={openGroup}
              onAdd={(target) => void addFromCard(target)}
            />
          </li>
        ))}
      </ul>
    )
  }

  // Al pie de la grilla de avatares: mientras pide páginas sola, lo dice; si
  // no, «Cargar más» cuando HeyGen tiene más. Mientras clasifica no hay grilla
  // a la que sumarle tarjetas.
  const groupsFooter = () => {
    if (classifying) return null
    if (autoLoading) {
      return (
        <p
          role="status"
          className="flex items-center justify-center gap-2 pt-8 font-body text-sm text-muted-foreground"
        >
          <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
          {t('avatars.stock.buscandoMas')}
        </p>
      )
    }
    if (!stockGroups.hasMore) return null

    return (
      <LoadMoreButton
        loading={stockGroups.isFetchingMore}
        onClick={stockGroups.loadMore}
      />
    )
  }

  const looksContent = () => {
    if (stockLooks.errorKey && stockLooks.looks.length === 0)
      return <ErrorMessage>{t(stockLooks.errorKey)}</ErrorMessage>
    if (stockLooks.isLoading) {
      return (
        <StockGridSkeleton
          count={Math.min(
            Math.max(group?.looksCount ?? 0, 1),
            STOCK_SKELETON_COUNT,
          )}
        />
      )
    }
    if (stockLooks.looks.length === 0) {
      return (
        <p className="py-16 text-center font-body text-sm text-muted-foreground">
          {t('avatars.stock.vacioLooks')}
        </p>
      )
    }

    return (
      <ul className={STOCK_GRID_CLASS}>
        {stockLooks.looks.map((look) => (
          <li key={look.lookId}>
            <StockLookCard
              look={look}
              imageUrl={look.previewImageUrl}
              videoUrl={look.previewVideoUrl}
              onOpen={openLook}
            />
          </li>
        ))}
      </ul>
    )
  }

  const footer = () => {
    if (groupEntryId) {
      return (
        <>
          <p className="font-body text-sm text-muted-foreground">
            {t('avatars.stock.yaEnBiblioteca')}
          </p>
          <Button
            variant="outline"
            onClick={() => onOpenAvatar(groupEntryId)}
            className="shrink-0 rounded-xl font-display font-bold"
          >
            {t('avatars.stock.abrirEnBiblioteca')}
          </Button>
        </>
      )
    }

    return (
      <p className="font-body text-sm text-muted-foreground">
        {t('avatars.stock.elegirLook')}
      </p>
    )
  }

  return (
    // Con un alta o un borrado en HeyGen en vuelo no se cierra (Escape, clic
    // afuera ni la X): la persona ve cómo termina, también si falla.
    <Dialog
      open
      onOpenChange={(open) => !open && !adding && !deleting && onClose()}
    >
      <DialogContent
        ref={contentRef}
        className="flex h-[88vh] w-[calc(100vw-3rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl"
        // En los looks de un avatar, Escape vuelve a los avatares en vez de
        // cerrar todo (como el «atrás» de HeyGen).
        onEscapeKeyDown={(event) => {
          if (!group) return

          event.preventDefault()
          backToGroups()
        }}
      >
        <DialogHeader className="space-y-1.5 px-6 pb-5 pr-14 pt-6 text-left sm:px-8 sm:pt-7">
          <DialogTitle className="font-display text-2xl font-extrabold tracking-tight">
            {t('avatars.stock.titulo')}
          </DialogTitle>
          <DialogDescription className="max-w-3xl font-body text-sm leading-relaxed text-muted-foreground">
            {t('avatars.stock.descripcion')}
          </DialogDescription>
        </DialogHeader>

        {/* Montado mientras el diálogo está abierto, para que el lector de
            pantalla anuncie cuando empieza a cargar una grilla. */}
        <p role="status" className="sr-only">
          {loadingLabelKey ? t(loadingLabelKey) : null}
        </p>

        <div className="relative min-h-0 flex-1">
          {/* Nivel 1, los avatares. Queda montado (invisible) mientras se
              miran los looks de uno: al volver, el scroll sigue donde
              estaba. */}
          <div
            ref={groupsRef}
            className={cn(
              'absolute inset-0 flex flex-col',
              group && 'invisible',
            )}
          >
            {/* Arriba, el origen y la búsqueda; debajo, los chips: la
                categoría (solo el stock público) y el género. */}
            <div className="space-y-3 border-b border-border px-6 pb-4 sm:px-8">
              <div className="flex flex-wrap items-center gap-3">
                <div ref={ownershipTabsRef} className="w-full sm:w-80">
                  <SegmentedTabs
                    value={ownership}
                    ariaLabel={t('avatars.stock.origenAria')}
                    options={[
                      { id: 'public', label: t('avatars.stock.publicos') },
                      { id: 'private', label: t('avatars.stock.propios') },
                    ]}
                    onChange={changeOwnership}
                  />
                </div>
                <div className="relative w-full sm:ml-auto sm:w-64">
                  <Search
                    aria-hidden
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    type="search"
                    value={filters.search}
                    onChange={(event) => filters.setSearch(event.target.value)}
                    placeholder={t('avatars.stock.buscar')}
                    aria-label={t('avatars.stock.buscar')}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {ownership === 'public' && (
                  <div ref={categoryChipsRef}>
                    <FilterChips
                      value={category}
                      ariaLabel={t('avatars.stock.categoriaAria')}
                      options={categoryOptions}
                      onChange={filters.setCategory}
                    />
                  </div>
                )}
                <FilterChips
                  value={filters.gender}
                  ariaLabel={t('avatars.stock.generoAria')}
                  options={genderOptions}
                  onChange={filters.setGender}
                />
              </div>
            </div>

            {/* Otra lista, otro scroll: al cambiar de origen arranca arriba. */}
            <div
              key={ownership}
              aria-busy={stockGroups.isLoading}
              className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-6 sm:px-8"
            >
              {filters.classificationFailed && (
                <div className="pb-6">
                  <ErrorMessage>
                    {t('avatars.stock.clasificacionNoDisponible')}
                  </ErrorMessage>
                </div>
              )}
              {groupsContent()}
              {stockGroups.errorKey && stockGroups.groups.length > 0 && (
                <div className="pt-6">
                  <ErrorMessage>{t(stockGroups.errorKey)}</ErrorMessage>
                </div>
              )}
              {groupsFooter()}
            </div>
          </div>

          {/* Nivel 2, los looks del avatar elegido: cada ficha abre su
              reproductor; el pie dice qué hacer (o lleva a la biblioteca). */}
          {group && (
            <motion.div
              key={group.groupId}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="absolute inset-0 flex flex-col bg-background"
            >
              <div className="flex items-center gap-3 border-b border-border px-6 pb-4 sm:px-8">
                <Button
                  variant="ghost"
                  size="sm"
                  autoFocus
                  onClick={backToGroups}
                  className="-ml-3 shrink-0 rounded-full font-display font-bold text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft aria-hidden className="h-4 w-4" />
                  {t('avatars.stock.volver')}
                </Button>
                <span aria-hidden className="h-6 w-px shrink-0 bg-border" />
                <LookPreview
                  imageUrl={group.previewImageUrl}
                  alt={t('avatars.stock.previewAria', { name: group.name })}
                  doodleSize={20}
                  className="h-9 w-9 shrink-0 rounded-full ring-1 ring-border"
                />
                <h3 className="min-w-0 truncate font-display text-lg font-bold text-foreground">
                  {group.name}
                </h3>
                <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 font-display text-[11px] font-bold tabular-nums text-muted-foreground">
                  {t('avatars.stock.looksCount', { count: group.looksCount })}
                </span>
              </div>

              <div
                ref={looksRef}
                aria-busy={stockLooks.isLoading}
                className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-6 sm:px-8"
              >
                {looksContent()}
                {stockLooks.errorKey && stockLooks.looks.length > 0 && (
                  <div className="pt-6">
                    <ErrorMessage>{t(stockLooks.errorKey)}</ErrorMessage>
                  </div>
                )}
                {stockLooks.hasMore && (
                  <LoadMoreButton
                    loading={stockLooks.isFetchingMore}
                    onClick={stockLooks.loadMore}
                  />
                )}
              </div>

              <div className="flex min-h-[4.5rem] items-center justify-between gap-4 border-t border-border bg-background px-6 py-3 sm:px-8">
                {footer()}
              </div>
            </motion.div>
          )}
        </div>

        {/* Encima de este diálogo (Radix los apila: Escape cierra solo el
            reproductor). */}
        {openedLook && (
          <LookPlayerDialog
            look={openedLook}
            imageUrl={openedLook.previewImageUrl}
            videoUrl={openedLook.previewVideoUrl}
            action={playerAction(openedLook)}
            returnFocusRef={lookReturnRef}
            onClose={closeLook}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

// Qué anuncia el lector de pantalla mientras carga una grilla (los
// esqueletos están ocultos para él): los avatares, o los looks del que está
// abierto.
function loadingStatusKey(
  inLooks: boolean,
  groupsLoading: boolean,
  looksLoading: boolean,
): string | null {
  if (inLooks) return looksLoading ? 'avatars.stock.cargandoLooks' : null

  return groupsLoading ? 'avatars.stock.cargando' : null
}

interface LoadMoreButtonProps {
  loading: boolean
  onClick: () => void
}

// «Cargar más» al final de una grilla con más páginas en HeyGen.
function LoadMoreButton({ loading, onClick }: LoadMoreButtonProps) {
  const { t } = useTranslation()

  return (
    <div className="flex justify-center pt-8">
      <Button
        variant="outline"
        disabled={loading}
        onClick={onClick}
        className="rounded-full px-6 font-display font-bold"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {t('avatars.stock.cargarMas')}
      </Button>
    </div>
  )
}
