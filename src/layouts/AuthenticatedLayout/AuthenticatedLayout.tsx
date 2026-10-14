import { useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { FrozenOutlet } from '@/layouts/AuthenticatedLayout/components/FrozenOutlet'
import { Navbar } from '@/layouts/AuthenticatedLayout/components/Navbar'
import { Sidebar } from '@/layouts/AuthenticatedLayout/components/Sidebar'
import { ErrorBoundary } from '@/modules/common/components/ErrorBoundary'
import { useTheme } from '@/modules/common/theme/useTheme'

/**
 * Layout de la app autenticada (port de ContenedorPrincipal):
 *  - Sidebar fijo a la izquierda.
 *  - Navbar con toggle de tema + selector de idioma.
 *  - Outlet del router con entrada decorativa cuando cambia la ruta o el
 *    idioma; el destino se monta sin esperar una animación de salida. El tema no anima el contenido: las CSS vars ya hacen una
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
          {/* La ruta nueva reemplaza la anterior en el mismo commit. La entrada
              CSS es decorativa: ningún callback de animación decide el montaje. */}
          <div key={transitionKey} className="route-entry h-full">
            {/* Red de seguridad por pantalla: si el contenido explota, el
                  sidebar sigue vivo y el usuario navega a otra sección sin
                  recargar. */}
            <ErrorBoundary resetKey={transitionKey}>
              <FrozenOutlet />
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  )
}
