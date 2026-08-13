import { NavLink } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { SidebarNavItem } from '@/layouts/AuthenticatedLayout/types/navigation'
import { cn } from '@/modules/common/utilities/cn'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/modules/common/ui/tooltip'

/**
 * Item del menú lateral. Los deshabilitados se muestran con tooltip
 * "próximamente"; en modo colapsado el tooltip lleva también la etiqueta.
 */
export function SidebarItem({
  item,
  collapsed,
}: {
  item: SidebarNavItem
  collapsed: boolean
}) {
  const { t } = useTranslation()

  const baseClasses = cn(
    'flex items-center font-display text-sm font-semibold outline-none transition-colors',
    collapsed
      ? 'h-10 w-10 justify-center rounded-xl'
      : 'gap-3 rounded-lg px-3 py-2.5',
  )

  const label = !collapsed && (
    <span className="overflow-hidden whitespace-nowrap">
      {t(item.labelKey)}
    </span>
  )

  if (item.disabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            aria-disabled
            className={cn(
              baseClasses,
              'cursor-not-allowed text-muted-foreground/50',
              !collapsed && 'w-full',
            )}
          >
            <item.Icon size={22} />
            {label}
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={12}>
          {collapsed
            ? `${t(item.labelKey)} — ${t('common.proximamente')}`
            : t('common.proximamente')}
        </TooltipContent>
      </Tooltip>
    )
  }

  const link = (
    <NavLink
      to={item.route}
      className={({ isActive }) =>
        cn(
          baseClasses,
          isActive
            ? 'bg-saffron/15 text-foreground'
            : 'text-muted-foreground hover:bg-saffron/15 hover:text-foreground',
        )
      }
    >
      <item.Icon size={22} />
      {label}
    </NavLink>
  )

  if (!collapsed) return link

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={12}>
        {t(item.labelKey)}
      </TooltipContent>
    </Tooltip>
  )
}
