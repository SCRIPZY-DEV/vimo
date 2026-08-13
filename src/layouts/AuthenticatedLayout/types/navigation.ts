import type { ComponentType } from 'react'

/** Item del menú lateral. Los deshabilitados son maquetas de secciones futuras. */
export type SidebarNavItem = {
  route: string
  /** Clave i18n de la etiqueta (layout.nav.*). */
  labelKey: string
  Icon: ComponentType<{
    size?: number
    className?: string
    delay?: number
    loop?: boolean
  }>
  /** true mientras la sección no esté migrada: se muestra con tooltip "próximamente". */
  disabled?: boolean
}

/** Opción del selector de idioma del navbar. */
export type LocaleOption = {
  id: string
  flag: string
  name: string
}
