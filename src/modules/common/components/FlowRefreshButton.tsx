import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/modules/common/ui/tooltip'
import { useFlowRefresh } from '@/modules/common/hooks/useFlowRefresh'
import { cn } from '@/modules/common/utilities/cn'
import type { FlowRefreshButtonProps } from '@/modules/common/types/flowRefreshButton'

export function FlowRefreshButton({
  compact = false,
  disabled = false,
}: FlowRefreshButtonProps) {
  const { t, i18n } = useTranslation()
  const refresh = useFlowRefresh()
  const feedbackId = useId()
  const label = t('extension.refresh')
  const hasError = !!refresh.errorKey && !refresh.refreshing
  const checkedAt = refresh.result
    ? new Intl.DateTimeFormat(i18n.resolvedLanguage, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(refresh.result.checkedAt)
    : ''
  const feedback = () => {
    if (refresh.refreshing) return t('extension.refreshing')

    if (refresh.errorKey)
      return t('extension.refreshFailed', { reason: t(refresh.errorKey) })

    if (!refresh.result) return ''

    return t(
      refresh.result.changed
        ? 'extension.refreshUpdated'
        : 'extension.refreshUnchanged',
      { time: checkedAt },
    )
  }
  const message = feedback()

  return (
    <div
      className={cn(
        'max-w-full gap-2',
        compact ? 'flex w-56 items-center' : 'flex w-72 flex-col items-start',
      )}
    >
      <Button
        type="button"
        variant="outline"
        size={compact ? 'icon' : 'default'}
        disabled={disabled || !refresh.native || refresh.refreshing}
        aria-label={label}
        aria-busy={refresh.refreshing}
        aria-describedby={feedbackId}
        title={label}
        onClick={refresh.refresh}
        className={compact ? 'h-8 w-8 shrink-0 rounded-full' : undefined}
      >
        <RefreshCw
          aria-hidden="true"
          className={cn('h-4 w-4', refresh.refreshing && 'animate-spin')}
        />
        {!compact && label}
      </Button>
      <Tooltip>
        <TooltipTrigger asChild>
          <p
            id={feedbackId}
            role={hasError ? 'alert' : 'status'}
            aria-live="polite"
            aria-atomic="true"
            tabIndex={message ? 0 : -1}
            className={cn(
              'line-clamp-2 h-8 min-w-0 text-left text-xs leading-4',
              hasError ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {message}
          </p>
        </TooltipTrigger>
        {message && (
          <TooltipContent className="max-w-sm break-words">
            {message}
          </TooltipContent>
        )}
      </Tooltip>
    </div>
  )
}
