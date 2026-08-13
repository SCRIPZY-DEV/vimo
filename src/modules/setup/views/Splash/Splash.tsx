import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { Brand } from '@/modules/common/brand/brand'
import DoodleRocket from '@/modules/common/doodles/DoodleRocket'
import DoodleStar from '@/modules/common/doodles/DoodleStar'
import { usePageTitle } from '@/modules/common/hooks/usePageTitle'
import { VideosRoutes } from '@/modules/videos/constants'

/**
 * Pantalla de arranque y entrada de la app. Espera a que el cohete termine de
 * dibujarse y navega a la rama autenticada: el guard del router decide ahí si
 * corresponde login, acceso denegado o la app (este módulo no sabe de auth).
 * Mientras el loader del guard resuelve, react-router mantiene esta vista en
 * pantalla, así que el spinner sigue visible. Full-screen: no usa layout.
 */
export function Splash() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  usePageTitle(t('splash.pageTitle'))

  return (
    <main
      className="relative flex min-h-screen items-center justify-center overflow-hidden"
      style={{
        background:
          'linear-gradient(135deg, hsl(var(--charcoal)) 0%, hsl(var(--ink)) 50%, hsl(216 72% 22%) 100%)',
      }}
    >
      {/* Estrellitas flotando */}
      <motion.div
        className="absolute left-[12%] top-20"
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        <DoodleStar size={28} delay={400} />
      </motion.div>
      <motion.div
        className="absolute right-[18%] top-32"
        animate={{ y: [0, -14, 0] }}
        transition={{
          duration: 3.4,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 0.6,
        }}
      >
        <DoodleStar size={22} delay={600} />
      </motion.div>
      <motion.div
        className="absolute bottom-32 left-[10%]"
        animate={{ y: [0, -8, 0] }}
        transition={{
          duration: 3.2,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 1.1,
        }}
      >
        <DoodleStar size={18} delay={800} />
      </motion.div>
      <motion.div
        className="absolute bottom-40 right-[14%]"
        animate={{ y: [0, -12, 0] }}
        transition={{
          duration: 3.8,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 1.5,
        }}
      >
        <DoodleStar size={24} delay={1000} />
      </motion.div>

      <div className="relative z-10 flex flex-col items-center gap-8 px-6 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 100, damping: 18 }}
        >
          <DoodleRocket
            className="h-auto w-[180px]"
            delay={300}
            onDrawComplete={() =>
              navigate(VideosRoutes.create, { replace: true })
            }
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="space-y-1"
        >
          <h1 className="font-display text-3xl font-extrabold text-white">
            {Brand.name}
          </h1>
          <p className="font-handwritten text-lg text-saffron">
            {t('splash.tagline')}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex items-center gap-2 text-white/60"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="font-body text-sm">{t('splash.preparando')}</span>
        </motion.div>
      </div>
    </main>
  )
}
