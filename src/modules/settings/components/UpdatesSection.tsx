import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Download, RefreshCw } from 'lucide-react'
import { Brand } from '@/modules/common/brand/brand'
import { LabeledProgress } from '@/modules/common/components/LabeledProgress'
import { Button } from '@/modules/common/ui/button'
import { cn } from '@/modules/common/utilities/cn'
import { UpdateInstallHelp } from '@/modules/settings/components/UpdateInstallHelp'
import { useAppUpdate } from '@/modules/settings/hooks/useAppUpdate'
import { updateStatusKey } from '@/modules/settings/utilities/updateStatusKey'
import { UpdatePhase } from '../types/updates'

// Sección «Actualizaciones» de Ajustes (ADR-0027): versión instalada, chequeo
// manual y, si hay una versión nueva, el botón para instalarla desde acá.

export function UpdatesSection() {
  const { t } = useTranslation()
  const {
    isNative,
    phase,
    update,
    progressPercent,
    canInstallInPlace,
    checkNow,
    install,
  } = useAppUpdate()

  const busy =
    phase === UpdatePhase.checking ||
    phase === UpdatePhase.downloading ||
    phase === UpdatePhase.installing
  const status = updateStatusKey(phase)

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="space-y-4 rounded-2xl border-2 border-border bg-card p-6 shadow-card"
    >
      <div>
        <h2 className="font-display text-lg font-bold text-foreground">
          {t('settings.updatesTitle')}
        </h2>
        <p className="font-body text-sm text-muted-foreground">
          {t('settings.updatesTagline')}
        </p>
      </div>

      {!isNative && (
        <p className="font-body text-sm text-saffron">
          {t('settings.soloEscritorio')}
        </p>
      )}

      <div
        className={cn(
          'space-y-3',
          !isNative && 'pointer-events-none opacity-60',
        )}
      >
        <p className="font-body text-sm text-foreground">
          {t('settings.updatesCurrentVersion', { version: Brand.version })}
        </p>

        {status && (
          <p
            className={cn(
              'font-body text-sm',
              phase === UpdatePhase.error
                ? 'text-destructive-text'
                : 'text-muted-foreground',
            )}
          >
            {t(status, { version: update?.version })}
          </p>
        )}

        {phase === UpdatePhase.downloading && (
          <LabeledProgress
            label={t('settings.updatesDownloading')}
            percent={progressPercent}
          />
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={checkNow}
            disabled={!isNative || busy}
            className="rounded-lg font-display"
          >
            <RefreshCw
              className={cn(
                'mr-1.5 h-4 w-4',
                phase === UpdatePhase.checking && 'animate-spin',
              )}
            />
            {t('settings.updatesCheck')}
          </Button>
          {phase === UpdatePhase.available && canInstallInPlace && (
            <Button
              size="sm"
              onClick={install}
              className="rounded-lg font-display"
            >
              <Download className="mr-1.5 h-4 w-4" />
              {t('settings.updatesInstall')}
            </Button>
          )}
        </div>

        <UpdateInstallHelp />
      </div>
    </motion.section>
  )
}
