import { createHashRouter } from 'react-router'
import { AuthenticatedLayout } from '@/layouts/AuthenticatedLayout/AuthenticatedLayout'
import { GuestLayout } from '@/layouts/GuestLayout/GuestLayout'

import { requireAuthLoader } from '@/modules/auth/guards'
import { authRoutes, authShellRoutes } from '@/modules/auth/routes'
import { videosRoutes } from '@/modules/videos/routes'
import { costsRoutes } from '@/modules/costs/routes'
import { apiKeysRoutes } from '@/modules/api-keys/routes'
import { settingsRoutes } from '@/modules/settings/routes'
import { commonRoutes } from '@/modules/common/routes'
import { setupMainRoute } from '@/modules/setup/routes'

/**
 * Árbol de rutas de la app. Cada módulo declara sus paths en su `constants.ts`
 * y acá solo se componen bajo su layout:
 *  - AuthenticatedLayout: shell con sidebar + navbar (app con sesión).
 *  - GuestLayout: gradient full-screen (login, callback, acceso denegado).
 *  - Splash: sin layout — la entrada de la app en `/`.
 * Hash router a propósito: dentro del webview de Tauri no hay servidor que
 * resuelva rutas profundas al recargar, y la URL no es visible.
 */
export const router = createHashRouter([
  ...setupMainRoute,
  {
    Component: AuthenticatedLayout,
    loader: requireAuthLoader,
    children: [
      ...videosRoutes,
      ...costsRoutes,
      ...apiKeysRoutes,
      ...settingsRoutes,
      ...authShellRoutes,
    ],
  },
  {
    Component: GuestLayout,
    children: [...authRoutes],
  },
  ...commonRoutes,
])
