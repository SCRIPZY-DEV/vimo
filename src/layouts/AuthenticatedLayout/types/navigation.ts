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
  /**
   * true para retirar una sección terminada de la navegación sin borrar su
   * módulo: el item no se renderiza. Distinto de `disabled`, que sí se muestra
   * (gris, con tooltip "próximamente") porque la sección todavía no existe.
   */
  hidden?: boolean
}

/** Opción del selector de idioma del navbar. */
export type LocaleOption = {
  id: string
  flag: string
  name: string
}
