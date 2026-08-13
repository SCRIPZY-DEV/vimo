import { createHashRouter } from 'react-router'
import { AuthenticatedLayout } from '@/layouts/AuthenticatedLayout/AuthenticatedLayout'
import { GuestLayout } from '@/layouts/GuestLayout/GuestLayout'

import { requireAuthLoader } from '@/modules/auth/guards'
import { authRoutes } from '@/modules/auth/routes'
import { videosRoutes } from '@/modules/videos/routes'
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
    // Gate de acceso por composición (ADR-0005): el loader decide, no el layout.
    loader: requireAuthLoader,
    children: [...videosRoutes],
  },
  {
    Component: GuestLayout,
    children: [...authRoutes],
  },
  ...commonRoutes,
])
