import type { SidebarNavItem } from '@/layouts/AuthenticatedLayout/types/navigation'
import { ExtensionRoutes } from '@/modules/extension/constants'
import { ApiKeysRoutes } from '@/modules/api-keys/constants'
import { AuthRoutesPaths } from '@/modules/auth/constants'
import { AvatarsRoutes } from '@/modules/avatars/constants'
import { CharactersRoutes } from '@/modules/characters/constants'
import { CostsRoutes } from '@/modules/costs/constants'
import { MusicRoutes } from '@/modules/music/constants'
import { SettingsRoutes } from '@/modules/settings/constants'
import { VideosRoutes } from '@/modules/videos/constants'
import { VoicesRoutes } from '@/modules/voices/constants'
import DoodleWand from '@/modules/common/doodles/DoodleWand'
import DoodlePlay from '@/modules/common/doodles/DoodlePlay'
import DoodleScript from '@/modules/common/doodles/DoodleScript'
import DoodleCamera from '@/modules/common/doodles/DoodleCamera'
import DoodleTrophy from '@/modules/common/doodles/DoodleTrophy'
import DoodleLightbulb from '@/modules/common/doodles/DoodleLightbulb'
import DoodleVoice from '@/modules/common/doodles/DoodleVoice'
import DoodleCoin from '@/modules/common/doodles/DoodleCoin'
import DoodleMusicNote from '@/modules/common/doodles/DoodleMusicNote'
import DoodleCharacter from '@/modules/common/doodles/DoodleCharacter'
import DoodleHappyFace from '@/modules/common/doodles/DoodleHappyFace'

export const NAV_ITEMS: SidebarNavItem[] = [
  {
    route: VideosRoutes.create,
    labelKey: 'layout.nav.crear',
    Icon: DoodleWand,
  },
  {
    route: VideosRoutes.library,
    labelKey: 'layout.nav.biblioteca',
    Icon: DoodleCamera,
  },
  {
    route: CharactersRoutes.characters,
    labelKey: 'layout.nav.personajes',
    Icon: DoodleCharacter,
  },
  {
    route: ExtensionRoutes.extension,
    labelKey: 'layout.nav.extension',
    Icon: DoodlePlay,
  },
  {
    route: AvatarsRoutes.avatars,
    labelKey: 'layout.nav.avatares',
    Icon: DoodleHappyFace,
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
    route: VideosRoutes.createDemo,
    labelKey: 'layout.nav.demo',
    Icon: DoodlePlay,
    // Modo demo (ADR-0029): visible solo para administradores y correos con
    // demo habilitada en vimo.click.
    requiresDemo: true,
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

// Items que el sidebar renderiza. Se filtra una sola vez acá, no en cada consumidor.
export const VISIBLE_NAV_ITEMS = NAV_ITEMS.filter((item) => !item.hidden)

export const COLLAPSED_STORAGE_KEY = 'vimo:sidebar-collapsed'
