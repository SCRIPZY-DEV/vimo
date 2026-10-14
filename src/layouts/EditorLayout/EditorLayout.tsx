import { Link, Outlet, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'
import { EditorBar } from '@/layouts/EditorLayout/components/EditorBar'
import { ErrorBoundary } from '@/modules/common/components/ErrorBoundary'
import { useTheme } from '@/modules/common/theme/useTheme'
import { Button } from '@/modules/common/ui/button'
import { VideosRoutes } from '@/modules/videos/constants'

/**
 * Layout del editor a pantalla completa (ADR-0056): sin sidebar, una barra
 * superior de una línea y el editor ocupando el resto. Solo cascarón: tema,
 * navegación y red de seguridad; nada de datos ni de dominio.
 */
export function EditorLayout() {
  const location = useLocation()
  const { t } = useTranslation()
  const { theme } = useTheme()

  return (
    <div
      className="flex h-screen flex-col overflow-hidden bg-background"
      data-theme={theme}
    >
      <EditorBar />
      {/* `min-h-0` para que el editor pueda ocupar la altura real con su
          `lg:h-full`; `overscroll-none` como en el layout autenticado. */}
      <main className="relative min-h-0 flex-1 overflow-y-auto overscroll-none">
        {/* `resetKey` con la ruta: este layout sigue montado al pasar de un
            proyecto a otro, y el error de uno no debe sobrevivir al cambio. */}
        <ErrorBoundary
          resetKey={location.pathname}
          action={
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-xl font-display font-bold"
            >
              <Link to={VideosRoutes.library}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('layout.editorBar.volverBiblioteca')}
              </Link>
            </Button>
          }
        >
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  )
}
