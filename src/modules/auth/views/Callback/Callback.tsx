import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { AuthRoutesPaths } from '@/modules/auth/constants'
import { useAuthCallback } from '@/modules/auth/hooks/useAuthCallback'
import { usePageTitle } from '@/modules/common/hooks/usePageTitle'

export function Callback() {
  const { t } = useTranslation()
  const { failed } = useAuthCallback()

  usePageTitle(t('callback.pageTitle'))

  if (failed) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        <p className="font-body text-base text-white/80">
          {t('callback.error')}
        </p>
        <Link
          to={AuthRoutesPaths.login}
          className="font-display text-sm font-bold text-saffron underline"
        >
          {t('callback.volverAlLogin')}
        </Link>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center gap-3 text-white/80"
    >
      <Loader2 className="h-5 w-5 animate-spin text-saffron" />
      <span className="font-body text-base">{t('callback.conectando')}</span>
    </motion.div>
  )
}
