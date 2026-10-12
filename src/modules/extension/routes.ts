import type { RouteObject } from 'react-router'
import { ExtensionRoutes } from '@/modules/extension/constants'

export const extensionRoutes: RouteObject[] = [
  {
    path: ExtensionRoutes.extension,
    lazy: () => import('@/modules/extension/views/Extension'),
  },
]
