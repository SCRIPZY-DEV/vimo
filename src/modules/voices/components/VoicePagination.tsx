import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'

interface VoicePaginationProps {
  page: number
  // null cuando el total es desconocido (ElevenLabs solo informa «hay más»).
  totalPages: number | null
  hasNextPage: boolean
  loading: boolean
  onPageChange: (page: number) => void
}

export function VoicePagination({
  page,
  totalPages,
  hasNextPage,
  loading,
  onPageChange,
}: VoicePaginationProps) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center justify-center gap-3">
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1 || loading}
        onClick={() => onPageChange(page - 1)}
        className="rounded-lg font-display"
      >
        <ChevronLeft className="mr-1 h-4 w-4" />
        {t('voices.pagination.previous')}
      </Button>

      <p className="flex items-center gap-2 font-body text-xs tabular-nums text-muted-foreground">
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {totalPages === null
          ? t('voices.pagination.page', { page })
          : t('voices.pagination.pageOf', { page, total: totalPages })}
      </p>

      <Button
        variant="outline"
        size="sm"
        disabled={!hasNextPage || loading}
        onClick={() => onPageChange(page + 1)}
        className="rounded-lg font-display"
      >
        {t('voices.pagination.next')}
        <ChevronRight className="ml-1 h-4 w-4" />
      </Button>
    </div>
  )
}
