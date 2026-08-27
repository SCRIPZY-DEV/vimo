import { useCallback, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, Instagram, LogOut } from 'lucide-react'
import { SidebarItem } from '@/layouts/AuthenticatedLayout/components/SidebarItem'
import {
  VISIBLE_NAV_ITEMS,
  COLLAPSED_STORAGE_KEY,
} from '@/layouts/AuthenticatedLayout/constants'
import { AuthRoutesPaths } from '@/modules/auth/constants'
import { Brand } from '@/modules/common/brand/brand'
import { cn } from '@/modules/common/utilities/cn'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/modules/common/ui/tooltip'
import DoodleRocket from '@/modules/common/doodles/DoodleRocket'

/**
 * Menú lateral colapsable (port del Sidebar de la app original).
 * Quedaron fuera a propósito (dependen de datos del sidecar): la campana de
 * notificaciones y el banner de trial/plan.
 */

function readInitialCollapsed(): boolean {
  return localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1'
}

export function Sidebar() {
  const { t, i18n } = useTranslation()
  const [collapsed, setCollapsed] = useState(readInitialCollapsed)

  const toggleCollapsed = useCallback(() => {
    setCollapsed((current) => {
      const next = !current
      localStorage.setItem(COLLAPSED_STORAGE_KEY, next ? '1' : '0')
      return next
    })
  }, [])

  return (
    <aside
      className={cn(
        // `overflow-visible` (en lugar de `overflow-y-auto`) permite que el
        // botón saffron asome del borde derecho sin ser recortado, y `z-10`
        // lo mantiene por encima del `<main>` (posicionado y posterior en el
        // DOM), que de otro modo tapa la mitad sobresaliente y captura el clic.
        'relative z-10 flex h-screen shrink-0 flex-col overflow-visible border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out',
        collapsed ? 'w-16' : 'w-64',
      )}
      data-collapsed={collapsed}
    >
      {/* Logo: en modo colapsado solo el cohete centrado. */}
      <div
        className={cn(
          'flex h-[88px] items-center border-b border-sidebar-border',
          collapsed ? 'justify-center px-2' : 'gap-3 p-6',
        )}
      >
        <DoodleRocket size={collapsed ? 28 : 36} delay={100} />
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden whitespace-nowrap"
            >
              <h1 className="font-display text-xl font-extrabold leading-none text-foreground">
                {Brand.name}
              </h1>
              <motion.p
                key={`tagline-${i18n.resolvedLanguage}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="font-handwritten text-sm text-muted-foreground"
              >
                {t('layout.sidebar.taglineCorto')}
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <nav
        className={cn(
          // En colapsado el padding baja a `px-2` para que el ítem (padding +
          // ícono de 22px) siga cabiendo en los 64px del aside.
          'flex flex-1 flex-col justify-between py-4',
          collapsed ? 'px-2' : 'px-3',
        )}
      >
        <TooltipProvider delayDuration={0} skipDelayDuration={0}>
          <div className="space-y-1">
            {VISIBLE_NAV_ITEMS.map((item) => (
              <SidebarItem key={item.route} item={item} collapsed={collapsed} />
            ))}

            <div className="flex justify-end self-stretch pt-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={toggleCollapsed}
                    aria-label={
                      collapsed
                        ? t('layout.sidebar.expandir')
                        : t('layout.sidebar.colapsar')
                    }
                    className="-mr-3.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-saffron text-charcoal shadow-md transition-all hover:scale-110 hover:shadow-lg"
                  >
                    {collapsed ? (
                      <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
                    ) : (
                      <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {collapsed
                    ? t('layout.sidebar.expandir')
                    : t('layout.sidebar.colapsar')}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          <div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to={AuthRoutesPaths.logout}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 font-display text-sm font-semibold text-muted-foreground outline-none transition-colors hover:bg-coral/10 hover:text-coral',
                    collapsed && 'justify-center',
                  )}
                >
                  <LogOut size={22} />
                  {!collapsed && (
                    <span className="overflow-hidden whitespace-nowrap">
                      {t('layout.sidebar.cerrarSesion')}
                    </span>
                  )}
                </Link>
              </TooltipTrigger>
              {collapsed && (
                <TooltipContent side="right" sideOffset={12}>
                  {t('layout.sidebar.cerrarSesion')}
                </TooltipContent>
              )}
            </Tooltip>
          </div>
        </TooltipProvider>
      </nav>

      {/* Footer: en colapsado solo la versión corta. */}
      <div
        className={cn(
          'border-t border-sidebar-border',
          collapsed ? 'space-y-2 p-2' : 'space-y-2 p-4',
        )}
      >
        <p className="overflow-hidden whitespace-nowrap text-center font-handwritten text-xs text-muted-foreground">
          {collapsed
            ? `v${Brand.version}`
            : `${Brand.name} v${Brand.version} · ${Brand.domain}`}
        </p>
        {collapsed ? (
          <a
            href={Brand.instagram.madeIn.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${t('layout.sidebar.hechoEn')} ${Brand.instagram.madeIn.handle}`}
            className="flex items-center justify-center text-muted-foreground/70 transition-colors hover:text-saffron"
          >
            <Instagram className="h-3.5 w-3.5" />
          </a>
        ) : (
          <div className="space-y-0.5 text-center">
            <p className="font-body text-[10px] leading-tight text-muted-foreground/70">
              {t('layout.sidebar.hechoEn')}{' '}
              <a
                href={Brand.instagram.madeIn.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 font-medium text-muted-foreground transition-colors hover:text-saffron"
              >
                <Instagram className="h-2.5 w-2.5" />
                {Brand.instagram.madeIn.handle}
              </a>
            </p>
            <p className="font-body text-[10px] leading-tight text-muted-foreground/70">
              {t('layout.sidebar.creadoPor')}{' '}
              <a
                href={Brand.instagram.creator.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-muted-foreground transition-colors hover:text-saffron"
              >
                {Brand.instagram.creator.handle}
              </a>
            </p>
          </div>
        )}
      </div>
    </aside>
  )
}
