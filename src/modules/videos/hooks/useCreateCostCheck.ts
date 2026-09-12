import { useCostCheck } from '@/modules/videos/hooks/useCostCheck'
import { estimateCreateCost } from '@/modules/videos/utilities/estimateCreateCost'
import { vendorOfProvider } from '@/modules/voices/utilities/vendorOfProvider'
import type { CreateFormValue } from '@/modules/videos/types/create'

interface UseCreateCostCheckOptions {
  form: CreateFormValue
}

// Pre-check de saldo del formulario de Crear (ADR-0031).
export function useCreateCostCheck({ form }: UseCreateCostCheckOptions) {
  return useCostCheck({
    estimates: estimateCreateCost(form),
    voiceVendor: form.voice ? vendorOfProvider(form.voice.provider) : null,
  })
}
