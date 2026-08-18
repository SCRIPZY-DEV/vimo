import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { AlertCircle, KeyRound, ShieldCheck } from 'lucide-react'
import DoodleScript from '@/modules/common/doodles/DoodleScript'
import { usePageTitle } from '@/modules/common/hooks/usePageTitle'
import { cn } from '@/modules/common/utilities/cn'
import { ApiKeyCard } from '@/modules/api-keys/components/ApiKeyCard'
import { useApiKeys } from '@/modules/api-keys/hooks/useApiKeys'
import { useRequiredApiKeys } from '@/modules/api-keys/hooks/useRequiredApiKeys'
import { API_KEY_PROVIDERS } from '@/modules/api-keys/providers'

/**
 * Dashboard de claves API (ADR-0011). Sin wizard por pasos: tarjetas por
 * proveedor con edición en línea, agrupadas en obligatorias/opcionales.
 * Las claves viven en el keychain del SO; acá solo llega estado enmascarado.
 */
export function ApiKeys() {
  const { t } = useTranslation()
  const { isNative, statuses, isLoading } = useApiKeys()
  const { missingCategories } = useRequiredApiKeys()

  usePageTitle(t('apiKeys.pageTitle'))

  const statusByProvider = new Map(
    statuses.map((status) => [status.providerId, status]),
  )
  const requiredProviders = API_KEY_PROVIDERS.filter((p) => p.recommended)
  const optionalProviders = API_KEY_PROVIDERS.filter((p) => !p.recommended)
  const configuredRequired = requiredProviders.filter(
    (provider) => statusByProvider.get(provider.id)?.configured,
  ).length

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-8 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-start justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          <DoodleScript size={48} delay={100} />
          <div>
            <h1 className="font-display text-3xl font-extrabold text-foreground">
              {t('apiKeys.titulo')}
            </h1>
            <p className="font-handwritten text-lg text-muted-foreground">
              {t('apiKeys.tagline')}
            </p>
          </div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg border border-saffron/30 bg-saffron/10 px-3 py-2">
          <ShieldCheck className="h-4 w-4 text-saffron" />
          <span className="font-display text-xs font-bold text-foreground">
            {t('apiKeys.cifradas')}
          </span>
        </div>
      </motion.div>

      {!isNative && (
        <p className="font-body text-sm text-saffron">
          {t('apiKeys.soloEscritorio')}
        </p>
      )}

      <div
        className={cn(
          'space-y-8',
          !isNative && 'pointer-events-none opacity-60',
        )}
      >
        {isNative && !isLoading && missingCategories.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-3 rounded-2xl border-2 border-coral/40 bg-coral/10 p-4"
          >
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-coral" />
            <div>
              <p className="font-display text-sm font-bold text-foreground">
                {t('apiKeys.faltanTitulo')}
              </p>
              <p className="font-body text-sm text-muted-foreground">
                {t('apiKeys.faltanDescripcion', {
                  categorias: missingCategories
                    .map((category) => t(`apiKeys.categoria.${category}`))
                    .join(', '),
                })}
              </p>
            </div>
          </motion.div>
        )}

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="space-y-3"
        >
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-saffron" />
            <h2 className="font-display text-base font-bold text-foreground">
              {t('apiKeys.obligatorias')}
            </h2>
            <span className="font-body text-xs text-muted-foreground">
              ({configuredRequired}/{requiredProviders.length})
            </span>
          </div>
          {requiredProviders.map((provider) => (
            <ApiKeyCard
              key={provider.id}
              provider={provider}
              status={statusByProvider.get(provider.id)}
            />
          ))}
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-3"
        >
          <h2 className="font-display text-base font-bold text-foreground">
            {t('apiKeys.opcionales')}
          </h2>
          <p className="font-body text-xs text-muted-foreground">
            {t('apiKeys.opcionalesDescripcion')}
          </p>
          {optionalProviders.map((provider) => (
            <ApiKeyCard
              key={provider.id}
              provider={provider}
              status={statusByProvider.get(provider.id)}
            />
          ))}
        </motion.section>
      </div>
    </div>
  )
}
