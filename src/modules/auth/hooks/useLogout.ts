import { useState } from 'react'
import { useNavigate } from 'react-router'
import { authApi } from '@/modules/auth/api'
import { queryClient } from '@/modules/common/queryClient'
import { AuthRoutesPaths, authQueryKeys } from '../constants'

export function useLogout() {
  const navigate = useNavigate()
  const [loggingOut, setLoggingOut] = useState(false)

  function logout() {
    if (loggingOut) {
      return
    }
    setLoggingOut(true)
    void authApi.signOut().then(() => {
      queryClient.removeQueries({ queryKey: authQueryKeys.access })
      navigate(AuthRoutesPaths.login, { replace: true })
    })
  }

  return { logout, loggingOut }
}
