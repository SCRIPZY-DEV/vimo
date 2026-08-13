import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { authApi } from '@/modules/auth/api'
import { queryClient } from '@/modules/common/queryClient'
import { VideosRoutes } from '@/modules/videos/constants'
import {
  CALLBACK_POLL_INTERVAL_MS,
  CALLBACK_POLL_MAX_ATTEMPTS,
  authQueryKeys,
} from '../constants'

export function useAuthCallback() {
  const navigate = useNavigate()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let attempts = 0
    let cancelled = false
    const interval = window.setInterval(() => {
      attempts += 1
      void authApi.getSession().then((session) => {
        if (cancelled) {
          return
        }
        if (session) {
          window.clearInterval(interval)
          queryClient.removeQueries({ queryKey: authQueryKeys.access })
          navigate(VideosRoutes.create, { replace: true })
          return
        }
        if (attempts >= CALLBACK_POLL_MAX_ATTEMPTS) {
          window.clearInterval(interval)
          setFailed(true)
        }
      })
    }, CALLBACK_POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [navigate])

  return { failed }
}
