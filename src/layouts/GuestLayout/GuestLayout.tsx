import { motion } from 'framer-motion'
import { Outlet } from 'react-router'
import DoodleStar from '@/modules/common/doodles/DoodleStar'

/**
 * Layout para usuarios sin sesión o sin acceso (login, acceso denegado).
 * Port del patrón visual compartido por PantallaIniciarSesion /
 * PantallaAccesoDenegado de la app original: gradient hero oscuro con
 * estrellas doodle flotando y el contenido centrado.
 */
export function GuestLayout() {
  return (
    <main
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-6"
      style={{
        background:
          'linear-gradient(135deg, hsl(var(--charcoal)) 0%, hsl(var(--ink)) 50%, hsl(216 72% 22%) 100%)',
      }}
    >
      <motion.div
        className="absolute left-[10%] top-20"
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        <DoodleStar size={26} delay={400} />
      </motion.div>
      <motion.div
        className="absolute right-[14%] top-24"
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
        className="absolute bottom-32 right-[12%]"
        animate={{ y: [0, -12, 0] }}
        transition={{
          duration: 3.6,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 0.8,
        }}
      >
        <DoodleStar size={18} delay={700} />
      </motion.div>

      <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-6 text-center">
        <Outlet />
      </div>
    </main>
  )
}
