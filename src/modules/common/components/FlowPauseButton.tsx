import { LoaderCircle, Pause, Play } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/modules/common/ui/button'
import type { FlowPauseButtonProps } from '@/modules/common/types/flowPause'

export function FlowPauseButton({
  disabled = false,
  size = 'default',
  manualPaused,
  pending,
  pendingPaused,
  onPauseChange,
}: FlowPauseButtonProps) {
  const { t } = useTranslation()
  const labelKey = () => {
    if (!pending)
      return manualPaused ? 'extension.resumeAll' : 'extension.pauseAll'

    if (pendingPaused === true) return 'extension.pausing'

    if (pendingPaused === false) return 'extension.resuming'

    return 'extension.pauseUpdating'
  }
  const Icon = manualPaused ? Play : Pause

  return (
    <Button
      type="button"
      variant={manualPaused ? 'default' : 'outline'}
      size={size}
      className="h-auto min-h-10 max-w-full whitespace-normal text-left"
      disabled={disabled || pending}
      aria-busy={pending}
      onClick={() => onPauseChange(!manualPaused)}
    >
      {pending ? (
        <LoaderCircle aria-hidden="true" className="animate-spin" />
      ) : (
        <Icon aria-hidden="true" />
      )}
      {t(labelKey())}
    </Button>
  )
}
