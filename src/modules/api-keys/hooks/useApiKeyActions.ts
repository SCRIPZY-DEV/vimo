import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { queryClient } from '@/modules/common/queryClient'
import { useToast } from '@/modules/common/hooks/useToast'
import { apiKeysApi } from '@/modules/api-keys/api'
import { apiKeysQueryKeys } from '../constants'
import type { ValidationResult } from '../types/apiKeys'
import type { ApiKeyProviderId } from '../types/provider'

/**
 * Acciones sobre UNA clave (guardar/probar/eliminar) con su estado de carga
 * por tarjeta. La validación es opcional antes de guardar; el resultado se
 * muestra en línea, no como toast.
 */
export function useApiKeyActions(providerId: ApiKeyProviderId) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [saveErrorKey, setSaveErrorKey] = useState<string | null>(null)

  const refreshStatus = () => {
    void queryClient.invalidateQueries({ queryKey: apiKeysQueryKeys.status })
  }

  const saveMutation = useMutation({
    mutationFn: (key: string) => apiKeysApi.save(providerId, key),
    onSuccess: () => {
      refreshStatus()
      setSaveErrorKey(null)
      toast({ description: t('apiKeys.guardada') })
    },
    onError: (error) => {
      setSaveErrorKey(apiKeysApi.errorMessageKey(error))
    },
  })

  const validateMutation = useMutation({
    mutationFn: (key?: string) => apiKeysApi.validate(providerId, key),
    onSuccess: (result) => {
      setValidation(result)
      if (result.ok) refreshStatus()
    },
    onError: (error) => {
      setValidation({ ok: false, code: null })
      setSaveErrorKey(apiKeysApi.errorMessageKey(error))
    },
  })

  const removeMutation = useMutation({
    mutationFn: () => apiKeysApi.remove(providerId),
    onSuccess: () => {
      refreshStatus()
      toast({ description: t('apiKeys.eliminada') })
    },
    onError: (error) => {
      toast({
        description: t(apiKeysApi.errorMessageKey(error)),
        variant: 'destructive',
      })
    },
  })

  const resetFeedback = () => {
    setValidation(null)
    setSaveErrorKey(null)
  }

  return {
    saveKey: (key: string, onSaved?: () => void) =>
      saveMutation.mutate(key, { onSuccess: onSaved }),
    testKey: (key?: string) => validateMutation.mutate(key),
    removeKey: () => removeMutation.mutate(),
    saving: saveMutation.isPending,
    testing: validateMutation.isPending,
    removing: removeMutation.isPending,
    validation,
    saveErrorKey,
    resetFeedback,
  }
}
