import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Lock, LogOut, Mail } from 'lucide-react'
import { useAccess } from '@/modules/auth/hooks/useAccess'
import { useLogout } from '@/modules/auth/hooks/useLogout'
import { Brand } from '@/modules/common/brand/brand'
import { usePageTitle } from '@/modules/common/hooks/usePageTitle'
import { Button } from '@/modules/common/ui/button'

export function AccessDenied() {
  const { t } = useTranslation()
  const { data: access } = useAccess()
  const { logout, loggingOut } = useLogout()

  usePageTitle(t('accessDenied.pageTitle'))

  const trialExpired = access?.reason === 'trial-expirado'

  return (
    <>
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 100, damping: 18 }}
        className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-coral/40 bg-coral/15"
      >
        <Lock className="h-9 w-9 text-coral" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="space-y-3"
      >
        <h1 className="font-display text-3xl font-extrabold text-white">
          {trialExpired
            ? t('accessDenied.tituloTrial')
            : t('accessDenied.titulo')}
        </h1>
        <p className="font-body text-base leading-relaxed text-white/70">
          {trialExpired
            ? t('accessDenied.descripcionTrial', { nombre: Brand.name })
            : t('accessDenied.descripcion', { nombre: Brand.name })}
        </p>
      </motion.div>

      {access?.email && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3"
        >
          <p className="mb-1 font-body text-xs text-white/50">
            {t('accessDenied.sesionComo')}
          </p>
          <p className="font-body text-sm text-white/85">{access.email}</p>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="flex w-full flex-col gap-3"
      >
        <Button
          asChild
          className="w-full rounded-xl bg-saffron py-6 font-display text-base font-bold text-charcoal shadow-lg shadow-saffron/30 hover:bg-saffron/90"
        >
          <a href={`mailto:${Brand.supportEmail}`}>
            <Mail className="mr-2 h-4 w-4" />
            {t('accessDenied.contactarSoporte')}
          </a>
        </Button>
        <Button
          variant="ghost"
          onClick={logout}
          disabled={loggingOut}
          className="w-full rounded-xl font-display text-white/60 hover:bg-white/10 hover:text-white"
        >
          <LogOut className="mr-2 h-4 w-4" />
          {t('accessDenied.cambiarCuenta')}
        </Button>
      </motion.div>
    </>
  )
}
