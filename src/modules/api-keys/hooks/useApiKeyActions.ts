import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { queryClient } from '@/modules/common/queryClient'
import { useToast } from '@/modules/common/hooks/useToast'
import { apiKeysApi } from '@/modules/api-keys/api'
import { apiKeysQueryKeys } from '@/modules/api-keys/constants'
import type {
  ApiKeyValidationAttempt,
  ValidationResult,
} from '@/modules/api-keys/types/apiKeys'
import type { ApiKeyProviderId } from '@/modules/api-keys/types/provider'

/**
 * Acciones sobre UNA clave (guardar/probar/eliminar) con su estado de carga
 * por tarjeta. Solo se guarda el valor probado con éxito en esta edición;
 * cambiarlo/cancelar invalida también cualquier respuesta todavía en vuelo.
 */
export function useApiKeyActions(providerId: ApiKeyProviderId) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [validatedKey, setValidatedKey] = useState<string | null>(null)
  const validationRevision = useRef(0)
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
    mutationFn: (attempt: ApiKeyValidationAttempt) =>
      apiKeysApi.validate(providerId, attempt.key),
    onSuccess: (result, attempt) => {
      if (attempt.revision !== validationRevision.current) return
      setValidation(result)
      setValidatedKey(result.ok ? attempt.key : null)
      if (result.ok) refreshStatus()
    },
    onError: (error, attempt) => {
      if (attempt.revision !== validationRevision.current) return
      setValidation({ ok: false, code: null })
      setValidatedKey(null)
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
    validationRevision.current++
    setValidation(null)
    setValidatedKey(null)
    setSaveErrorKey(null)
  }

  const canSaveKey = (key: string) => {
    return (
      key.trim().length > 0 &&
      key.trim() === validatedKey &&
      validation?.ok === true &&
      !validateMutation.isPending &&
      !saveMutation.isPending
    )
  }

  return {
    saveKey: (key: string, onSaved?: () => void) => {
      if (!canSaveKey(key)) return
      saveMutation.mutate(key.trim(), { onSuccess: onSaved })
    },
    testKey: (key: string) => {
      resetFeedback()
      if (!key.trim()) return
      validateMutation.mutate({
        key: key.trim(),
        revision: validationRevision.current,
      })
    },
    canSaveKey,
    removeKey: () => removeMutation.mutate(),
    saving: saveMutation.isPending,
    testing: validateMutation.isPending,
    removing: removeMutation.isPending,
    validation,
    saveErrorKey,
    resetFeedback,
  }
}
