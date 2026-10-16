import { redirect } from 'react-router'
import { queryClient } from '@/modules/common/queryClient'
import { isNative } from '@/modules/common/utilities/isNative'
import { VideosRoutes } from '@/modules/videos/constants'
import { authApi } from './api'
import {
  ACCESS_STALE_TIME_MS,
  AuthRoutesPaths,
  authQueryKeys,
} from './constants'
import type { AccessReason, AccessStatus } from './types/access'

const BLOCKING_REASONS: AccessReason[] = ['no-en-allowlist', 'trial-expirado']

/**
 * Comparte el veredicto entre loaders y vistas: fetchQuery deduplica y respeta
 * staleTime — una sola llamada a verificar-acceso cada 5 minutos.
 */
function resolveAccess(): Promise<AccessStatus> {
  return queryClient.fetchQuery({
    queryKey: authQueryKeys.access,
    queryFn: () => authApi.verifyAccess(),
    staleTime: ACCESS_STALE_TIME_MS,
  })
}

/**
 * Para el guard de las rutas autenticadas: con un veredicto autorizado en
 * caché se entra sin esperar a la red y se revalida en segundo plano (si no,
 * cada cambio de layout tras 5 minutos —Crear → editor al terminar un video—
 * frenaba la navegación en verificar-acceso). Sin caché, o con uno que no
 * autoriza, se consulta como siempre. Login y logout vacían esta clave.
 */
function resolveAccessForGuard(): Promise<AccessStatus> {
  const cached = queryClient.getQueryData<AccessStatus>(authQueryKeys.access)
  if (!cached?.authorized) return resolveAccess()

  return queryClient.ensureQueryData({
    queryKey: authQueryKeys.access,
    queryFn: () => authApi.verifyAccess(),
    staleTime: ACCESS_STALE_TIME_MS,
    revalidateIfStale: true,
  })
}

/** Exige sesión con acceso vigente. */
export async function requireAuthLoader(): Promise<Response | null> {
  const session = await authApi.getSession()
  if (!session) {
    return redirect(AuthRoutesPaths.login)
  }
  const access = await resolveAccessForGuard()
  if (!access.authorized && BLOCKING_REASONS.includes(access.reason)) {
    return redirect(AuthRoutesPaths.accessDenied)
  }
  if (!access.authorized) {
    return redirect(AuthRoutesPaths.login)
  }
  return null
}

/**
 * Puerta de la demo (ADR-0029): sin el flag `demo` del veredicto —o fuera de
 * la app nativa, donde no hay sidecar que prepare el pack— manda a Crear. La
 * sesión ya la exigió el loader del layout; acá solo se mira el flag.
 */
export async function requireDemoAccessLoader(): Promise<Response | null> {
  if (!isNative()) return redirect(VideosRoutes.create)
  const access = await resolveAccess()
  if (access.demo !== true) return redirect(VideosRoutes.create)
  return null
}

export async function guestOnlyLoader(): Promise<Response | null> {
  const session = await authApi.getSession()
  if (!session) {
    return null
  }
  const access = await resolveAccess()
  if (access.authorized) {
    return redirect(VideosRoutes.create)
  }
  if (BLOCKING_REASONS.includes(access.reason)) {
    return redirect(AuthRoutesPaths.accessDenied)
  }
  return null
}

export async function logoutLoader(): Promise<Response> {
  await authApi.signOut()
  queryClient.removeQueries({ queryKey: authQueryKeys.access })
  return redirect(AuthRoutesPaths.login)
}

/** AccessDenied es PARA logueados sin acceso; cualquier otro caso sale de acá. */
export async function accessDeniedLoader(): Promise<Response | null> {
  const session = await authApi.getSession()
  if (!session) {
    return redirect(AuthRoutesPaths.login)
  }
  const access = await resolveAccess()
  if (access.authorized) {
    return redirect(VideosRoutes.create)
  }
  if (!BLOCKING_REASONS.includes(access.reason)) {
    return redirect(AuthRoutesPaths.login)
  }
  return null
}
