import type { RouteObject } from 'react-router'
import { VideosRoutes } from './constants'

export const videosRoutes: RouteObject[] = [
  {
    path: VideosRoutes.create,
    lazy: () => import('./views/Create'),
  },
  {
    path: VideosRoutes.library,
    lazy: () => import('./views/Library'),
  },
  {
    path: VideosRoutes.libraryPlayer,
    lazy: () => import('./views/LibraryPlayer'),
  },
  {
    path: VideosRoutes.libraryProgress,
    lazy: () => import('./views/LibraryProgress'),
  },
  {
    path: VideosRoutes.libraryEditor,
    lazy: () => import('./views/LibraryEditor'),
  },
]
