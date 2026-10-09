import { LanguageMenu } from '@/modules/common/components/LanguageMenu'
import { ThemeToggle } from '@/modules/common/components/ThemeToggle'

/**
 * Barra superior fija de la app autenticada (port de BarraSuperior de la app
 * original): tema e idioma. Los dos controles viven en common porque también
 * los usa la barra del editor a pantalla completa (ADR-0056).
 */
export function Navbar() {
  return (
    <header className="z-30 flex h-12 shrink-0 items-center justify-end gap-1 border-b border-border bg-background/80 px-5 backdrop-blur">
      <ThemeToggle />
      <LanguageMenu />
    </header>
  )
}
