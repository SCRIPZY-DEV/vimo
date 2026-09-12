import { useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { ErrorBoundary } from '@/layouts/AuthenticatedLayout/components/ErrorBoundary'
import { FrozenOutlet } from '@/layouts/AuthenticatedLayout/components/FrozenOutlet'
import { Navbar } from '@/layouts/AuthenticatedLayout/components/Navbar'
import { Sidebar } from '@/layouts/AuthenticatedLayout/components/Sidebar'
import { useTheme } from '@/modules/common/theme/useTheme'

/**
 * Layout de la app autenticada (port de ContenedorPrincipal):
 *  - Sidebar fijo a la izquierda.
 *  - Navbar con toggle de tema + selector de idioma.
 *  - Outlet del router con animación de fade cuando cambia la ruta o el
 *    idioma. El tema no anima el contenido: las CSS vars ya hacen una
 *    transición global suave.
 */
export function AuthenticatedLayout() {
  const location = useLocation()
  const { i18n } = useTranslation()
  const { theme } = useTheme()

  const transitionKey = `${location.pathname}::${i18n.resolvedLanguage}`

  return (
    <div
      className="flex h-screen overflow-hidden bg-background"
      data-theme={theme}
    >
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Navbar />
        {/* `overscroll-none`: el scroller no rebota al llegar al final ni le
            pasa el gesto a la raíz (ver main.css). */}
        <main className="relative flex-1 overflow-y-auto overscroll-none">
          <AnimatePresence mode="wait">
            <motion.div
              key={transitionKey}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="h-full"
            >
              {/* Red de seguridad por pantalla: si el contenido explota, el
                  sidebar sigue vivo y el usuario navega a otra sección sin
                  recargar. */}
              <ErrorBoundary resetKey={transitionKey}>
                <FrozenOutlet />
              </ErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
