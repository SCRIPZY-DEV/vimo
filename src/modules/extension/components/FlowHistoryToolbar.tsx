import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'

interface FlowHistoryToolbarProps {
  available: number
  excluded: number
  selected: number
  busy: boolean
  onSelectAll: () => void
  onClear: () => void
  onDeleteSelected: () => void
  onDeleteAll: () => void
}

export function FlowHistoryToolbar({
  available,
  excluded,
  selected,
  busy,
  onSelectAll,
  onClear,
  onDeleteSelected,
  onDeleteAll,
}: FlowHistoryToolbarProps) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3 rounded-xl bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">
        {t('extension.historyAvailability', { count: available, excluded })}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-auto max-w-full whitespace-normal text-left"
          disabled={busy || available === 0 || selected === available}
          onClick={onSelectAll}
        >
          {t('extension.historySelectAll', { count: available })}
        </Button>
        {selected > 0 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={onClear}
          >
            {t('extension.historyClearSelection')}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-auto max-w-full whitespace-normal text-left"
          disabled={busy || selected === 0}
          onClick={onDeleteSelected}
        >
          <Trash2 aria-hidden="true" className="h-4 w-4" />
          {t('extension.historyDeleteSelected', { count: selected })}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-auto max-w-full whitespace-normal text-left"
          disabled={busy || available === 0}
          onClick={onDeleteAll}
        >
          {t('extension.historyDeleteAll', { count: available })}
        </Button>
      </div>
    </div>
  )
}
