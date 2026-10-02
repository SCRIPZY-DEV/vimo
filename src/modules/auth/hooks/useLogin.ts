import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { authApi } from '@/modules/auth/api'
import { queryClient } from '@/modules/common/queryClient'
import { VideosRoutes } from '@/modules/videos/constants'
import { authQueryKeys } from '../constants'

/**
 * Inicio de sesión con Google. Bifurca según el entorno:
 *  - Web: redirect clásico — la vista Callback completa el flujo.
 *  - Tauri: navegador del sistema + retorno por deep link, que se escucha acá
 *    (el flujo siempre nace en Login, así que el listener vive con la vista).
 * Con el navegador ya abierto el botón vuelve a estar disponible: si el
 * retorno no llega (pestaña cerrada, otra Vimo instalada que se queda con el
 * deep link) se reintenta desde acá, sin reiniciar la app.
 */
export function useLogin() {
  const navigate = useNavigate()
  const [opening, setOpening] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    if (!authApi.isNative()) {
      return
    }
    let unlisten: (() => void) | undefined
    let disposed = false
    void authApi
      .subscribeToAuthCallback((code) => {
        void authApi
          .exchangeCodeForSession(code)
          .then(() => {
            queryClient.removeQueries({ queryKey: authQueryKeys.access })
            navigate(VideosRoutes.create, { replace: true })
          })
          .catch(() => {
            setWaiting(false)
            setHasError(true)
          })
      })
      .then((fn) => {
        if (disposed) {
          fn()
          return
        }
        unlisten = fn
      })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [navigate])

  function login() {
    if (opening) {
      return
    }
    setOpening(true)
    setHasError(false)
    const native = authApi.isNative()
    const signIn = native
      ? authApi.signInWithGoogleDesktop()
      : authApi.signInWithGoogleWeb()
    signIn
      .then(() => setWaiting(native))
      .catch(() => {
        setWaiting(false)
        setHasError(true)
      })
      .finally(() => setOpening(false))
  }

  return { login, opening, waiting, hasError }
}
