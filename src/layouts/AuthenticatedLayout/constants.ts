import type { SidebarNavItem } from '@/layouts/AuthenticatedLayout/types/navigation'
import { ApiKeysRoutes } from '@/modules/api-keys/constants'
import { AuthRoutesPaths } from '@/modules/auth/constants'
import { CostsRoutes } from '@/modules/costs/constants'
import { MusicRoutes } from '@/modules/music/constants'
import { SettingsRoutes } from '@/modules/settings/constants'
import { VideosRoutes } from '@/modules/videos/constants'
import { VoicesRoutes } from '@/modules/voices/constants'
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
 * Items del menú lateral. Los deshabilitados son maquetas que se irán
 * habilitando a medida que se migren sus módulos.
 */
export const NAV_ITEMS: SidebarNavItem[] = [
  {
    route: VideosRoutes.create,
    labelKey: 'layout.nav.crear',
    Icon: DoodleWand,
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
    route: VoicesRoutes.voices,
    labelKey: 'layout.nav.voces',
    Icon: DoodleVoice,
  },
  {
    route: MusicRoutes.music,
    labelKey: 'layout.nav.musica',
    Icon: DoodleMusicNote,
  },
  {
    route: CostsRoutes.costs,
    labelKey: 'layout.nav.costos',
    Icon: DoodleCoin,
  },
  {
    route: ApiKeysRoutes.apiKeys,
    labelKey: 'layout.nav.claves',
    Icon: DoodleScript,
  },
  {
    route: AuthRoutesPaths.license,
    labelKey: 'layout.nav.licencia',
    Icon: DoodleTrophy,
  },
  {
    route: SettingsRoutes.settings,
    labelKey: 'layout.nav.ajustes',
    Icon: DoodleLightbulb,
  },
]

export const COLLAPSED_STORAGE_KEY = 'vimo:sidebar-collapsed'
