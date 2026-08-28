import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { KeyRound } from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/modules/common/ui/dialog'
import { apiKeysFocusPath } from '../constants'
import { requirementLabel } from '../utilities/requirementLabel'
import type { ApiKeyRequirement } from '../types/provider'

interface MissingApiKeysDialogProps {
  requirements: ApiKeyRequirement[]
  onClose: () => void
}

export function MissingApiKeysDialog({
  requirements,
  onClose,
}: MissingApiKeysDialogProps) {
  const { t } = useTranslation()

  const connector = t('apiKeys.missing.or')
  const focusPath = apiKeysFocusPath(requirements.flat())

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">
            {t('apiKeys.missing.title')}
          </DialogTitle>
          <DialogDescription>
            {t('apiKeys.missing.description')}
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2">
          {requirements.map((requirement) => (
            <li
              key={requirement.join('|')}
              className="flex items-center gap-2 rounded-xl border-2 border-coral/40 bg-coral/10 px-3 py-2"
            >
              <KeyRound className="h-4 w-4 shrink-0 text-coral" />
              <span className="font-display text-sm font-bold text-foreground">
                {requirementLabel(requirement, connector)}
              </span>
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={onClose}
            className="rounded-xl font-display"
          >
            {t('apiKeys.missing.close')}
          </Button>
          <Button asChild className="rounded-xl font-display font-bold">
            <Link to={focusPath}>{t('apiKeys.missing.configure')}</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
