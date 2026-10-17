import { useCostCheck } from '@/modules/videos/hooks/useCostCheck'
import { estimateCreateCost } from '@/modules/videos/utilities/estimateCreateCost'
import { vendorOfProvider } from '@/modules/voices/utilities/vendorOfProvider'
import type { CreateFormValue } from '@/modules/videos/types/create'

interface UseCreateCostCheckOptions {
  form: CreateFormValue
  // La demo (spec demo v4 §2): no gasta nada, así que no hay estimación; sin
  // ella no se consulta ningún saldo y nada se frena por saldo.
  demo?: boolean
}

// Pre-check de saldo del formulario de Crear (ADR-0031).
export function useCreateCostCheck({
  form,
  demo = false,
}: UseCreateCostCheckOptions) {
  return useCostCheck({
    estimates: demo ? [] : estimateCreateCost(form),
    voiceVendor: form.voice ? vendorOfProvider(form.voice.provider) : null,
  })
}
