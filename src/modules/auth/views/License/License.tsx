import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { LogOut, Sparkles } from 'lucide-react'
import { useAccess } from '@/modules/auth/hooks/useAccess'
import { useLogout } from '@/modules/auth/hooks/useLogout'
import { Brand } from '@/modules/common/brand/brand'
import DoodleTrophy from '@/modules/common/doodles/DoodleTrophy'
import { usePageTitle } from '@/modules/common/hooks/usePageTitle'
import { Button } from '@/modules/common/ui/button'

export function License() {
  const { t } = useTranslation()
  const { data: access, isPending } = useAccess()
  const { logout, loggingOut } = useLogout()

  usePageTitle(t('license.pageTitle'))

  if (isPending || !access) {
    return (
      <div className="mx-auto max-w-2xl px-8 py-12">
        <p className="font-body text-muted-foreground">
          {t('license.cargando')}
        </p>
      </div>
    )
  }

  const initial = (access.name ?? access.email ?? '?')[0].toUpperCase()

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-8 py-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-3 text-center"
      >
        <DoodleTrophy size={64} delay={100} />
        <h1 className="font-display text-3xl font-extrabold text-foreground">
          {t('license.titulo', { nombre: Brand.name })}
        </h1>
        <p className="font-handwritten text-lg text-muted-foreground">
          {t('license.tagline')}
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="flex items-center gap-4 rounded-2xl border-2 border-border bg-card p-6 shadow-card"
      >
        {access.avatar ? (
          <img
            src={access.avatar}
            alt={access.name ?? access.email ?? t('license.usuarioFallback')}
            referrerPolicy="no-referrer"
            className="h-12 w-12 rounded-full border-2 border-border"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 font-display font-bold text-foreground">
            {initial}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display font-bold text-foreground">
            {access.name ?? t('license.usuarioFallback')}
          </p>
          <p className="truncate font-body text-sm text-muted-foreground">
            {access.email}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          disabled={loggingOut}
          className="text-muted-foreground hover:bg-coral/10 hover:text-coral"
        >
          <LogOut className="mr-1 h-4 w-4" />
          {loggingOut ? t('license.saliendo') : t('license.salir')}
        </Button>
      </motion.div>

      {access.plan === 'activo' && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex items-start gap-3 rounded-2xl border-2 border-green-300 bg-green-100 p-5"
        >
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-green-700" />
          <div>
            <p className="font-display font-bold text-green-900">
              {t('license.planActivoTitulo')}
            </p>
            <p className="font-body text-sm text-green-800">
              {t('license.planActivoDescripcion', { nombre: Brand.name })}
            </p>
          </div>
        </motion.div>
      )}

      {/* Durante la beta el trial no vence (ADR-0040): sin contador ni precio. */}
      {access.plan === 'trial' && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex items-start gap-3 rounded-2xl border-2 border-primary/40 bg-primary/10 p-5"
        >
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="font-display font-bold text-foreground">
              {t('license.accesoBetaTitulo')}
            </p>
            <p className="font-body text-sm text-muted-foreground">
              {t('license.accesoBetaDescripcion', { nombre: Brand.name })}
            </p>
          </div>
        </motion.div>
      )}
    </div>
  )
}
