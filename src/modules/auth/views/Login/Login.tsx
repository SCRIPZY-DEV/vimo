import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { ShieldCheck } from 'lucide-react'
import { useLogin } from '@/modules/auth/hooks/useLogin'
import { Brand } from '@/modules/common/brand/brand'
import DoodleRocket from '@/modules/common/doodles/DoodleRocket'
import { usePageTitle } from '@/modules/common/hooks/usePageTitle'
import { Button } from '@/modules/common/ui/button'

export function Login() {
  const { t } = useTranslation()
  const { login, opening, hasError } = useLogin()

  usePageTitle(t('login.pageTitle'))

  return (
    <>
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 100, damping: 18 }}
      >
        <DoodleRocket className="h-auto w-[140px]" delay={200} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="space-y-2"
      >
        <h1 className="font-display text-4xl font-extrabold text-white">
          {t('login.bienvenida', { nombre: Brand.name })}
        </h1>
        <p className="font-handwritten text-lg text-saffron">
          {t('login.tagline')}
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="w-full space-y-5 rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm"
      >
        <div className="flex items-start gap-3 text-left">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-saffron" />
          <p className="font-body text-sm leading-relaxed text-white/80">
            {t('login.info')}
          </p>
        </div>

        <Button
          onClick={login}
          disabled={opening}
          className="w-full rounded-xl bg-saffron py-6 font-display text-base font-bold text-charcoal shadow-lg shadow-saffron/30 hover:bg-saffron/90"
        >
          {opening ? t('login.abriendo') : t('login.boton')}
        </Button>

        {hasError && (
          <p className="font-body text-sm text-coral">
            {t('login.errorInicio')}
          </p>
        )}
      </motion.div>

      <p className="font-body text-xs text-white/40">
        {t('login.problemas')}{' '}
        <a
          href={`mailto:${Brand.supportEmail}`}
          className="text-saffron underline"
        >
          {Brand.supportEmail}
        </a>
      </p>
    </>
  )
}
