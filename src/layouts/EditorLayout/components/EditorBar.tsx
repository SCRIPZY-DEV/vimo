import { HomeButton } from '@/layouts/EditorLayout/components/HomeButton'
import { LanguageMenu } from '@/modules/common/components/LanguageMenu'
import { ThemeToggle } from '@/modules/common/components/ThemeToggle'
import { EDITOR_BAR_SLOT_IDS } from '@/modules/common/constants'

// Barra superior del editor a pantalla completa (ADR-0056): la casita, el
// hueco del título (las migas) y el de las acciones —que la vista llena por
// portal— y los controles globales de tema e idioma.
export function EditorBar() {
  return (
    <header className="z-30 flex h-12 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-3 backdrop-blur">
      <HomeButton />
      <div
        id={EDITOR_BAR_SLOT_IDS.title}
        className="flex min-w-0 flex-1 items-center"
      />
      <div
        id={EDITOR_BAR_SLOT_IDS.actions}
        className="flex shrink-0 items-center gap-2"
      />
      <span aria-hidden className="h-6 w-px shrink-0 bg-border" />
      <div className="flex shrink-0 items-center gap-1">
        <ThemeToggle />
        <LanguageMenu />
      </div>
    </header>
  )
}
