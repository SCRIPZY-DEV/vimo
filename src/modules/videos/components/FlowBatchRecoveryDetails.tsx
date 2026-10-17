import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { PlugZap } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { ExtensionRoutes } from '@/modules/extension/constants'

export function FlowBatchRecoveryDetails() {
  const { t } = useTranslation()

  return (
    <div className="space-y-2">
      <p className="font-body text-xs text-muted-foreground">
        {t('extension.recoverBatchHint')}
      </p>
      <Button asChild variant="outline" size="sm">
        <Link to={ExtensionRoutes.extension}>
          <PlugZap className="mr-1.5 h-4 w-4" />
          {t('extension.reviewBatch')}
        </Link>
      </Button>
    </div>
  )
}
