import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router'
import { usePageTitle } from '@/modules/common/hooks/usePageTitle'
import { videosApi } from '@/modules/videos/api'
import { DemoGateCard } from '@/modules/videos/components/DemoGateCard'
import { VideosRoutes } from '@/modules/videos/constants'
import { useDemoPrepare } from '@/modules/videos/hooks/useDemoPrepare'
import { useDemoStatus } from '@/modules/videos/hooks/useDemoStatus'
import type { CreateDemoNavigationState } from '@/modules/videos/types/demo'

// Puerta del modo demo (ADR-0027). Con el pack listo entra directo a Crear
// con el manifest en el state del router; si falta, lo prepara una sola vez
// mostrando el avance y entra al terminar. El acceso lo exige el loader de la
// ruta (requireDemoAccessLoader): acá no se decide nada de permisos.
export function CreateDemo() {
  const { t } = useTranslation()
  const status = useDemoStatus()
  const prepare = useDemoPrepare()
  // `prepare` es un objeto nuevo en cada render; se saca `start` a una
  // variable propia para que el deps array del efecto guarde su identidad
  // real (react-hooks/exhaustive-deps no la infiere a través de `prepare.start`
  // cuando se LLAMA como método, y pide el objeto entero).
  const { start: startPrepare } = prepare

  usePageTitle(t('createDemo.pageTitle'))

  // Arranca la preparación apenas se sabe que el pack falta: sincroniza con
  // un sistema externo (el job del sidecar), no deriva estado.
  const packMissing = status.data?.ready === false
  useEffect(() => {
    if (!packMissing) return
    startPrepare()
  }, [packMissing, startPrepare])

  const manifest = status.data?.ready
    ? (status.data.manifest ?? null)
    : prepare.manifest
  if (manifest) {
    const state: CreateDemoNavigationState = { demo: manifest }
    return <Navigate to={VideosRoutes.create} replace state={state} />
  }

  const errorKey = status.isError
    ? videosApi.demoErrorMessageKey(status.error)
    : prepare.errorKey
  const messageKey = status.isPending
    ? 'createDemo.checking'
    : prepare.progress?.phase === 'download'
      ? 'createDemo.downloading'
      : prepare.progress?.phase === 'install'
        ? 'createDemo.installing'
        : 'createDemo.preparingFirstTime'
  const percent =
    prepare.progress?.phase === 'download' ? prepare.progress.percent : null

  // Reintentar: si falló la consulta, se repite (y el efecto relanza la
  // preparación si el pack falta); si falló la preparación, se relanza acá
  // mismo — `packMissing` no cambia y el efecto no volvería a correr.
  const retry = () => {
    prepare.reset()
    if (status.isError) {
      void status.refetch()
      return
    }
    prepare.start()
  }

  return (
    <DemoGateCard
      messageKey={messageKey}
      percent={percent}
      errorKey={errorKey}
      onRetry={retry}
    />
  )
}
