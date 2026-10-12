import { createHashRouter } from 'react-router'
import { AuthenticatedLayout } from '@/layouts/AuthenticatedLayout/AuthenticatedLayout'
import { GuestLayout } from '@/layouts/GuestLayout/GuestLayout'

import {
  requireAuthLoader,
  requireDemoAccessLoader,
} from '@/modules/auth/guards'
import { authRoutes, authShellRoutes } from '@/modules/auth/routes'
import { createDemoRoute, videosRoutes } from '@/modules/videos/routes'
import { musicRoutes } from '@/modules/music/routes'
import { charactersRoutes } from '@/modules/characters/routes'
import { voicesRoutes } from '@/modules/voices/routes'
import { apiKeysRoutes } from '@/modules/api-keys/routes'
import { extensionRoutes } from '@/modules/extension/routes'
import { settingsRoutes } from '@/modules/settings/routes'
import { commonRoutes } from '@/modules/common/routes'
import { setupMainRoute } from '@/modules/setup/routes'

export const router = createHashRouter([
  ...setupMainRoute,
  {
    Component: AuthenticatedLayout,
    loader: requireAuthLoader,
    children: [
      ...videosRoutes,
      // Modo demo (ADR-0029): la ruta existe siempre; el loader manda a Crear
      // sin el flag `demo` del veredicto.
      { ...createDemoRoute, loader: requireDemoAccessLoader },
      ...charactersRoutes,
      ...voicesRoutes,
      ...musicRoutes,
      // `costsRoutes` va acá cuando la sección vuelva: hoy está retirada de la
      // navegación (ver `hidden` en layouts/AuthenticatedLayout/constants.ts).
      ...apiKeysRoutes,
      ...settingsRoutes,
      ...extensionRoutes,
      ...authShellRoutes,
    ],
  },
  {
    Component: GuestLayout,
    children: [...authRoutes],
  },
  ...commonRoutes,
])
