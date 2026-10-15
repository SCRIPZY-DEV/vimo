import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router'
import { usePageTitle } from '@/modules/common/hooks/usePageTitle'
import { videosApi } from '@/modules/videos/api'
import { DemoGateCard } from '@/modules/videos/components/DemoGateCard'
import { VideosRoutes } from '@/modules/videos/constants'
import { useDemoPrepare } from '@/modules/videos/hooks/useDemoPrepare'
import { useDemoStatus } from '@/modules/videos/hooks/useDemoStatus'
import { demoGateScreen } from '@/modules/videos/utilities/demoGateScreen'
import type { CreateDemoNavigationState } from '@/modules/videos/types/demo'

// Puerta del modo demo (ADR-0029; descarga en segundo plano, spec demo v4 §3).
// Con el pack listo entra directo a Crear con el manifest en el state del
// router. Si falta, ofrece la descarga con su tamaño y la lanza recién cuando
// la persona la pide; con avance de otra sesión sigue sola. El job vive en un
// store del módulo: salir de la puerta no lo cancela y, si termina con la
// puerta abierta, entra a Crear. El acceso lo exige el loader de la ruta
// (requireDemoAccessLoader): acá no se decide nada de permisos.
export function CreateDemo() {
  const { t } = useTranslation()
  const status = useDemoStatus()
  const { job, start, reset } = useDemoPrepare()

  usePageTitle(t('createDemo.pageTitle'))

  const screen = demoGateScreen({
    status: status.data ?? null,
    statusError: status.isError
      ? { code: videosApi.errorCode(status.error) }
      : null,
    job,
  })

  // Con avance de otra sesión la descarga sigue sola: sincroniza con un
  // sistema externo (el job del sidecar), no deriva estado.
  const resumes = screen.kind === 'resume'
  useEffect(() => {
    if (!resumes) return
    start()
  }, [resumes, start])

  if (screen.kind === 'enter') {
    const state: CreateDemoNavigationState = { demo: screen.manifest }
    return <Navigate to={VideosRoutes.create} replace state={state} />
  }

  // Reintentar: si falló la consulta, se repite; si falló la descarga o se
  // espera a otro job, se relanza el job, que sigue desde la última parte.
  const retry = () => {
    if (screen.kind === 'failed' && screen.source === 'status') {
      void status.refetch()
      return
    }
    reset()
    start()
  }

  return <DemoGateCard screen={screen} onDownload={start} onRetry={retry} />
}
