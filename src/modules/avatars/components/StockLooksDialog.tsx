import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import { SegmentedTabs } from '@/modules/common/components/SegmentedTabs'
import { ViewSpinner } from '@/modules/common/components/ViewSpinner'
import { Button } from '@/modules/common/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/modules/common/ui/dialog'
import { Input } from '@/modules/common/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/modules/common/ui/select'
import { matchesSearch } from '@/modules/common/utilities/matchesSearch'
import { StockLookCard } from '@/modules/avatars/components/StockLookCard'
import { STOCK_LOOK_TYPE_FILTERS } from '@/modules/avatars/constants'
import type { StockLookTypeFilter } from '@/modules/avatars/constants'
import { useAvatarMutations } from '@/modules/avatars/hooks/useAvatarMutations'
import { useStockLooks } from '@/modules/avatars/hooks/useStockLooks'
import type { AvatarSummary, HeyGenLook } from '@pipeline/types/avatar.ts'

type Ownership = 'public' | 'private'

interface StockLooksDialogProps {
  entries: AvatarSummary[]
  onClose: () => void
}

// Explorar los looks de HeyGen (el stock público o los propios de la cuenta),
// filtrar por tipo, buscar por nombre entre lo cargado y agregar a la
// biblioteca. Se monta solo mientras está abierto.
export function StockLooksDialog({ entries, onClose }: StockLooksDialogProps) {
  const { t } = useTranslation()
  const [ownership, setOwnership] = useState<Ownership>('public')
  const [lookType, setLookType] = useState<StockLookTypeFilter>('all')
  const [search, setSearch] = useState('')
  const [addingId, setAddingId] = useState<string | null>(null)
  const { looks, isLoading, isFetchingMore, hasMore, loadMore, errorKey } =
    useStockLooks({ ownership, lookType, enabled: true })
  const { addLook } = useAvatarMutations()

  const inLibrary = new Set(entries.map((entry) => entry.lookId))
  const visible = looks.filter((look) => matchesSearch([look.name], search))

  const add = async (look: HeyGenLook) => {
    setAddingId(look.lookId)
    await addLook({
      look,
      ownership: ownership === 'private' ? 'own' : 'stock',
    }).catch(() => null)
    setAddingId(null)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            {t('avatars.stock.titulo')}
          </DialogTitle>
          <DialogDescription className="font-body text-sm text-muted-foreground">
            {t('avatars.stock.descripcion')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-3">
          <SegmentedTabs
            value={ownership}
            ariaLabel={t('avatars.stock.origenAria')}
            options={[
              { id: 'public', label: t('avatars.stock.publicos') },
              { id: 'private', label: t('avatars.stock.propios') },
            ]}
            onChange={setOwnership}
          />
          <Select
            value={lookType}
            onValueChange={(value) => setLookType(value as StockLookTypeFilter)}
          >
            <SelectTrigger
              className="w-48"
              aria-label={t('avatars.stock.tipoAria')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STOCK_LOOK_TYPE_FILTERS.map((filter) => (
                <SelectItem key={filter} value={filter}>
                  {filter === 'all'
                    ? t('avatars.stock.todosLosTipos')
                    : t(`avatars.types.${filter}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('avatars.stock.buscar')}
            aria-label={t('avatars.stock.buscar')}
            className="w-56"
          />
        </div>

        {errorKey && <ErrorMessage>{t(errorKey)}</ErrorMessage>}
        {isLoading && <ViewSpinner className="py-12" />}
        {!isLoading && visible.length === 0 && !errorKey && (
          <p className="py-8 text-center font-body text-sm text-muted-foreground">
            {t('avatars.stock.vacio')}
          </p>
        )}

        {visible.length > 0 && (
          <ul className="grid auto-rows-fr grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {visible.map((look) => (
              <li key={look.lookId}>
                <StockLookCard
                  look={look}
                  added={inLibrary.has(look.lookId)}
                  adding={addingId === look.lookId}
                  disabled={addingId !== null}
                  onAdd={(selected) => void add(selected)}
                />
              </li>
            ))}
          </ul>
        )}

        {hasMore && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              disabled={isFetchingMore}
              onClick={loadMore}
              className="rounded-xl font-display"
            >
              {isFetchingMore && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t('avatars.stock.cargarMas')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
