import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { motion } from 'framer-motion'
import { Button } from '@/modules/common/ui/button'
import { MissingApiKeysDialog } from '@/modules/api-keys/components/MissingApiKeysDialog'
import { apiKeysFocusPath } from '../constants'
import { requirementLabel } from '../utilities/requirementLabel'
import type { ApiKeyRequirement } from '../types/provider'

interface MissingApiKeysNoticeProps {
  requirements: ApiKeyRequirement[]
}

// Aviso de claves faltantes de un módulo: se monta solo cuando faltan claves,
// abre el modal al entrar y, al cerrarlo, deja un banner que lo reabre.
export function MissingApiKeysNotice({
  requirements,
}: MissingApiKeysNoticeProps) {
  const { t } = useTranslation()

  const [open, setOpen] = useState(true)

  const connector = t('apiKeys.missing.or')
  const keys = requirements
    .map((requirement) => requirementLabel(requirement, connector))
    .join(', ')
  const focusPath = apiKeysFocusPath(requirements.flat())

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-coral/40 bg-coral/10 p-4"
      >
        <p className="font-body text-sm text-foreground">
          {t('apiKeys.missing.banner', { keys })}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setOpen(true)}
            className="rounded-lg font-display"
          >
            {t('apiKeys.missing.details')}
          </Button>
          <Button asChild size="sm" className="rounded-lg font-display">
            <Link to={focusPath}>{t('apiKeys.missing.configure')}</Link>
          </Button>
        </div>
      </motion.div>

      {open && (
        <MissingApiKeysDialog
          requirements={requirements}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
