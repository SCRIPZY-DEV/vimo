import { useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { diagnosticsApi } from '@/modules/diagnostics/api'
import { diagnosticsMutationKeys } from '../constants'

// Sube los logs de diagnóstico pendientes (ADR-0038): al arrancar, cuando
// Rust cierra un registro nuevo y cuando aparece la sesión. Es silencioso: un
// fallo no se le muestra al usuario, el registro queda en el spool y se
// reintenta en el próximo disparo.
export function useDiagnosticsUpload() {
  const { i18n } = useTranslation()
  const locale = i18n.resolvedLanguage ?? null
  const { mutate } = useMutation({
    mutationKey: diagnosticsMutationKeys.upload,
    mutationFn: (uploadLocale: string | null) =>
      diagnosticsApi.uploadPending(uploadLocale),
    retry: false,
  })

  useEffect(() => {
    if (!diagnosticsApi.isNative()) return

    let disposed = false
    let unsubscribe: (() => void) | null = null
    const upload = () => mutate(locale)

    upload()
    diagnosticsApi.subscribeToUploadTriggers(upload).then((stop) => {
      // El efecto pudo limpiarse antes de que el listener quedara registrado.
      if (disposed) {
        stop()
        return
      }
      unsubscribe = stop
    })

    return () => {
      disposed = true
      unsubscribe?.()
    }
  }, [mutate, locale])
}
