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
import { matchesSearch } from '@/modules/common/utilities/matchesSearch'
import { FilterChips } from '@/modules/avatars/components/FilterChips'
import { LookPreview } from '@/modules/avatars/components/LookPreview'
import { StockGridSkeleton } from '@/modules/avatars/components/StockGridSkeleton'
import { StockGroupCard } from '@/modules/avatars/components/StockGroupCard'
import { StockLookCard } from '@/modules/avatars/components/StockLookCard'
import {
  STOCK_GENDER_FILTERS,
  STOCK_GENDER_LABEL_KEYS,
  STOCK_GRID_CLASS,
  STOCK_SKELETON_COUNT,
} from '@/modules/avatars/constants'
import type { StockGenderFilter } from '@/modules/avatars/constants'
import { useAvatarMutations } from '@/modules/avatars/hooks/useAvatarMutations'
import { useLastInputWasKeyboard } from '@/modules/avatars/hooks/useLastInputWasKeyboard'
import { useStockGroups } from '@/modules/avatars/hooks/useStockGroups'
import { useStockLooks } from '@/modules/avatars/hooks/useStockLooks'
import type {
  AvatarSummary,
  HeyGenAvatarGroup,
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
// género y por nombre entre lo cargado; después los looks de uno, para
// agregarlo con el look principal elegido. «Agregar» desde la tarjeta deja
// que el sidecar elija el principal. Al volver, la grilla de avatares sigue
// donde estaba y, con el teclado, el foco en el «Ver looks» de la tarjeta de
// origen. Una página que no llega deja el error junto a lo ya cargado, sin
// taparlo. Se monta solo mientras está abierto.
export function StockLooksDialog({
  entries,
  onOpenAvatar,
  onClose,
}: StockLooksDialogProps) {
  const { t } = useTranslation()
  const [ownership, setOwnership] = useState<Ownership>('public')
  const [gender, setGender] = useState<StockGenderFilter>('all')
  const [search, setSearch] = useState('')
  const [group, setGroup] = useState<HeyGenAvatarGroup | null>(null)
  const [selectedLookId, setSelectedLookId] = useState<string | null>(null)
  const [addingGroupId, setAddingGroupId] = useState<string | null>(null)
  const stockGroups = useStockGroups({ ownership, enabled: true })
  const stockLooks = useStockLooks({
    ownership,
    groupId: group?.groupId ?? '',
    enabled: group !== null,
  })
  const { addAvatar } = useAvatarMutations()
  const lastInputWasKeyboard = useLastInputWasKeyboard()
  const contentRef = useRef<HTMLDivElement>(null)
  // El primer nivel (la grilla de avatares): ahí se busca el «Ver looks» al
  // que vuelve el foco.
  const groupsRef = useRef<HTMLDivElement>(null)

  // La biblioteca guarda avatares (grupos de HeyGen): grupo → entrada.
  const libraryIds = new Map(entries.map((entry) => [entry.groupId, entry.id]))
  const visibleGroups = stockGroups.groups.filter(
    (item) =>
      (gender === 'all' || item.gender === gender) &&
      matchesSearch([item.name], search),
  )
  const genderOptions = STOCK_GENDER_FILTERS.map((filter) => {
    return { id: filter, label: t(STOCK_GENDER_LABEL_KEYS[filter]) }
  })
  const groupEntryId = group ? libraryIds.get(group.groupId) : undefined
  const selectedLook = stockLooks.looks.find(
    (look) => look.lookId === selectedLookId,
  )
  const adding = addingGroupId !== null
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

  const openGroup = (target: HeyGenAvatarGroup) => {
    setGroup(target)
    setSelectedLookId(null)
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
      setSelectedLookId(null)
    })
    if (originId && lastInputWasKeyboard()) viewLooksButton(originId)?.focus()
  }

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

  // Con el look elegido, directo al resultado: el avatar abierto en la
  // biblioteca.
  const addWithLook = async () => {
    if (!group || !selectedLookId) return

    const entry = await add(group, selectedLookId)
    if (!entry) return

    onOpenAvatar(entry.id)
  }

  const groupsContent = () => {
    // Un «Cargar más» que falla no se lleva lo ya cargado: con tarjetas en
    // pantalla, el error va debajo de la grilla, junto a «Cargar más», que
    // sirve para reintentar.
    if (stockGroups.errorKey && stockGroups.groups.length === 0)
      return <ErrorMessage>{t(stockGroups.errorKey)}</ErrorMessage>
    if (stockGroups.isLoading)
      return <StockGridSkeleton count={STOCK_SKELETON_COUNT} />
    if (visibleGroups.length === 0) {
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
              added={libraryIds.has(item.groupId)}
              adding={addingGroupId === item.groupId}
              disabled={adding}
              onOpen={openGroup}
              onAdd={(target) => void addFromCard(target)}
            />
          </li>
        ))}
      </ul>
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
              selected={look.lookId === selectedLookId}
              selectable={!groupEntryId && !adding}
              onSelect={setSelectedLookId}
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
      <>
        <p className="font-body text-sm text-muted-foreground">
          {t('avatars.stock.elegirLook')}
        </p>
        {selectedLook && (
          <Button
            disabled={adding}
            onClick={() => void addWithLook()}
            className="min-w-0 max-w-[60%] shrink-0 rounded-xl font-display font-bold"
          >
            {adding && <Loader2 className="h-4 w-4 animate-spin" />}
            <span className="truncate">
              {t('avatars.stock.agregarConLook', { name: selectedLook.name })}
            </span>
          </Button>
        )}
      </>
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !adding && onClose()}>
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
            <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 pb-4 sm:px-8">
              <div className="w-full sm:w-80">
                <SegmentedTabs
                  value={ownership}
                  ariaLabel={t('avatars.stock.origenAria')}
                  options={[
                    { id: 'public', label: t('avatars.stock.publicos') },
                    { id: 'private', label: t('avatars.stock.propios') },
                  ]}
                  onChange={setOwnership}
                />
              </div>
              <FilterChips
                value={gender}
                ariaLabel={t('avatars.stock.generoAria')}
                options={genderOptions}
                onChange={setGender}
              />
              <div className="relative w-full sm:ml-auto sm:w-64">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t('avatars.stock.buscar')}
                  aria-label={t('avatars.stock.buscar')}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Otra lista, otro scroll: al cambiar de origen arranca arriba. */}
            <div
              key={ownership}
              aria-busy={stockGroups.isLoading}
              className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-6 sm:px-8"
            >
              {groupsContent()}
              {stockGroups.errorKey && stockGroups.groups.length > 0 && (
                <div className="pt-6">
                  <ErrorMessage>{t(stockGroups.errorKey)}</ErrorMessage>
                </div>
              )}
              {stockGroups.hasMore && (
                <LoadMoreButton
                  loading={stockGroups.isFetchingMore}
                  onClick={stockGroups.loadMore}
                />
              )}
            </div>
          </div>

          {/* Nivel 2, los looks del avatar elegido, con el pie para agregar. */}
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
