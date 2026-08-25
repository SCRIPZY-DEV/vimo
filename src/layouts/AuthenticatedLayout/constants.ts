import type { SidebarNavItem } from '@/layouts/AuthenticatedLayout/types/navigation'
import { ApiKeysRoutes } from '@/modules/api-keys/constants'
import { AuthRoutesPaths } from '@/modules/auth/constants'
import { CharactersRoutes } from '@/modules/characters/constants'
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
import DoodleCharacter from '@/modules/common/doodles/DoodleCharacter'

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
    route: CharactersRoutes.characters,
    labelKey: 'layout.nav.personajes',
    Icon: DoodleCharacter,
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
    // Retirado de la navegación mientras se redefine el modelo de precios
    // (ADR-0008, "Nota a futuro"). El módulo `src/modules/costs/` queda
    // intacto y typechequeado. Para reactivar: borrar este `hidden` y
    // devolver `costsRoutes` a `src/router/index.ts`.
    hidden: true,
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

/**
 * Los items que el sidebar realmente renderiza. Se deriva una vez al importar
 * el módulo: filtrar en el render duplicaría el criterio en cada consumidor y
 * dejaría sin lugar donde explicar por qué falta una sección.
 */
export const VISIBLE_NAV_ITEMS = NAV_ITEMS.filter((item) => !item.hidden)

export const COLLAPSED_STORAGE_KEY = 'vimo:sidebar-collapsed'
