import type { SidebarNavItem } from '@/layouts/AuthenticatedLayout/types/navigation'
import { HomeRoutes } from '@/modules/home/constants'
import DoodleLaptop from '@/modules/common/doodles/DoodleLaptop'
import DoodleWand from '@/modules/common/doodles/DoodleWand'
import DoodleScript from '@/modules/common/doodles/DoodleScript'
import DoodleCamera from '@/modules/common/doodles/DoodleCamera'
import DoodleTrophy from '@/modules/common/doodles/DoodleTrophy'
import DoodleLightbulb from '@/modules/common/doodles/DoodleLightbulb'
import DoodleVoice from '@/modules/common/doodles/DoodleVoice'
import DoodleCoin from '@/modules/common/doodles/DoodleCoin'
import DoodleMusicNote from '@/modules/common/doodles/DoodleMusicNote'
import DoodlePersonaje from '@/modules/common/doodles/DoodlePersonaje'

/**
 * Items del menú lateral. Solo Inicio navega; el resto son maquetas
 * deshabilitadas que se irán habilitando a medida que se migren.
 */
export const NAV_ITEMS: SidebarNavItem[] = [
  { route: HomeRoutes.home, labelKey: 'layout.nav.inicio', Icon: DoodleLaptop },
  {
    route: '/create',
    labelKey: 'layout.nav.crear',
    Icon: DoodleWand,
    disabled: true,
  },
  {
    route: '/library',
    labelKey: 'layout.nav.biblioteca',
    Icon: DoodleCamera,
    disabled: true,
  },
  {
    route: '/characters',
    labelKey: 'layout.nav.personajes',
    Icon: DoodlePersonaje,
    disabled: true,
  },
  {
    route: '/voices',
    labelKey: 'layout.nav.voces',
    Icon: DoodleVoice,
    disabled: true,
  },
  {
    route: '/music',
    labelKey: 'layout.nav.musica',
    Icon: DoodleMusicNote,
    disabled: true,
  },
  {
    route: '/costs',
    labelKey: 'layout.nav.costos',
    Icon: DoodleCoin,
    disabled: true,
  },
  {
    route: '/api-keys',
    labelKey: 'layout.nav.claves',
    Icon: DoodleScript,
    disabled: true,
  },
  {
    route: '/license',
    labelKey: 'layout.nav.licencia',
    Icon: DoodleTrophy,
    disabled: true,
  },
  {
    route: '/settings',
    labelKey: 'layout.nav.ajustes',
    Icon: DoodleLightbulb,
    disabled: true,
  },
]

export const COLLAPSED_STORAGE_KEY = 'vimo:sidebar-collapsed'
