import { useQuery } from '@tanstack/react-query'
import { avatarsApi } from '@/modules/avatars/api'
import {
  avatarsQueryKeys,
  BALANCE_STALE_TIME_MS,
} from '@/modules/avatars/constants'
import { useHeyGenAccess } from '@/modules/avatars/hooks/useHeyGenAccess'
import type { AvatarBalanceResult } from '@pipeline/types/avatar.ts'

interface UseAvatarBalanceOptions {
  // El pre-check de saldo de Crear (useCostCheck) lo pide solo cuando hay
  // una línea de HeyGen que comparar.
  enabled?: boolean
}

// Saldo de la billetera de HeyGen (USD en la cuenta del dueño). Solo se pide
// en la app nativa y con la clave de HeyGen guardada, la misma condición que
// habilita los botones de la vista, y si quien lo usa lo necesita. Se relee
// solo tras cada cobro (lo invalidan las mutaciones que cobran); `refresh` es
// el botón para los casos especiales. `status` null = no se pide (sin nativo,
// sin clave o sin necesidad) o todavía no llegó (`loading`); `refreshing` gira
// el ícono en cualquier relectura.
export function useAvatarBalance({
  enabled: wanted = true,
}: UseAvatarBalanceOptions = {}) {
  const { canUseHeyGen } = useHeyGenAccess()
  const enabled = canUseHeyGen && wanted

  const query = useQuery({
    queryKey: avatarsQueryKeys.balance,
    queryFn: () => avatarsApi.balance(),
    enabled,
    // Va al sidecar local, que sin red responde `available: false` por su
    // cuenta: con el modo `online` por defecto la consulta quedaría en pausa
    // (ERRORES-CONOCIDOS: tanstack-mutacion-pausada-por-networkmode-online).
    networkMode: 'always',
    retry: false,
    staleTime: BALANCE_STALE_TIME_MS,
    refetchOnWindowFocus: false,
  })

  // El subcomando nunca falla por HeyGen; si el que falla es el proceso del
  // sidecar, la píldora lo muestra igual que un saldo no disponible.
  const failed: AvatarBalanceResult | null = query.isError
    ? { available: false }
    : null

  return {
    status: enabled ? (query.data ?? failed) : null,
    loading: enabled && query.isLoading,
    refreshing: enabled && query.isFetching,
    refresh: () => void query.refetch(),
  }
}
