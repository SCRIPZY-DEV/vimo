import { useEffect } from 'react'
import {
  useIsMutating,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { commonApi } from '@/modules/common/api'
import {
  commonQueryKeys,
  FLOW_PAUSE_CONFIRMATION_TIMEOUT_MS,
  FLOW_PAUSE_POLL_INTERVAL_MS,
} from '@/modules/common/constants'
import { useFlowStatus } from '@/modules/common/hooks/useFlowStatus'
import {
  confirmFlowPauseCommand,
  flowPauseConfirmation,
} from '@/modules/common/utilities/flowPauseConfirmation'
import type { FlowStatus } from '@/modules/common/types/flow'
import { settleFlowBeforeDeadline } from '@/modules/common/utilities/flowPauseDeadline'
import type {
  FlowPauseCommandState,
  FlowPauseMutationSnapshot,
  FlowPauseResult,
} from '@/modules/common/types/flowPause'

export function useFlowPause() {
  const client = useQueryClient()
  const flow = useFlowStatus()
  const isPending =
    useIsMutating({ mutationKey: commonQueryKeys.flowPause }) > 0
  const command = useQuery<FlowPauseCommandState | null>({
    queryKey: commonQueryKeys.flowPauseCommand,
    queryFn: () => null,
    initialData: null,
    enabled: false,
    // Un cambio de vista no puede olvidar un invoke todavía sin resolver.
    gcTime: Infinity,
  })
  // La suscripción registra una respuesta del servidor una sola vez por
  // petición, incluso si llegó después del timeout o tras cambiar de vista.
  useEffect(() => {
    const observe = () => {
      const status = client.getQueryState<FlowStatus>(
        commonQueryKeys.flowStatus,
      )
      if (status?.status !== 'success') return
      const current = client.getQueryData<FlowPauseCommandState>(
        commonQueryKeys.flowPauseCommand,
      )
      if (!current) return
      const confirmed = confirmFlowPauseCommand(current, status.data)
      if (confirmed !== current)
        client.setQueryData(commonQueryKeys.flowPauseCommand, confirmed)
    }
    observe()
    return client.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated') return
      if (
        event.query !==
        client.getQueryCache().find({
          queryKey: commonQueryKeys.flowStatus,
          exact: true,
        })
      )
        return
      observe()
    })
  }, [client])
  const snapshots = useMutationState<FlowPauseMutationSnapshot>({
    filters: { mutationKey: commonQueryKeys.flowPause },
    select: (mutation) => ({
      status: mutation.state.status,
      variables:
        typeof mutation.state.variables === 'boolean'
          ? mutation.state.variables
          : undefined,
      data: mutation.state.data as FlowPauseResult | undefined,
      error: mutation.state.error,
    }),
  })
  const refreshAfterPause = () => {
    // Refrescos auxiliares: un lector colgado no prolonga la operación visible.
    void Promise.allSettled([
      client.invalidateQueries({ queryKey: commonQueryKeys.flowDiscovery }),
      client.invalidateQueries({ queryKey: commonQueryKeys.flowCapacityRoot }),
    ])
  }
  const mutation = useMutation({
    mutationKey: commonQueryKeys.flowPause,
    retry: false,
    mutationFn: async (paused: boolean): Promise<FlowPauseResult> => {
      const deadline = Date.now() + FLOW_PAUSE_CONFIRMATION_TIMEOUT_MS
      // Retiramos lecturas anteriores sin esperar a sus invokes subyacentes.
      void client.cancelQueries({ queryKey: commonQueryKeys.flowStatus })
      const baseline = await settleFlowBeforeDeadline(
        client.fetchQuery({
          queryKey: commonQueryKeys.flowStatus,
          queryFn: commonApi.flowStatus,
          staleTime: 0,
          retry: false,
        }),
        deadline,
      )
      if (baseline.status === 'rejected') throw baseline.error
      if (baseline.status === 'timeout' || Date.now() >= deadline) {
        void client.cancelQueries({ queryKey: commonQueryKeys.flowStatus })
        throw new Error('flow_unavailable')
      }
      const request: FlowPauseResult = {
        requestId: crypto.randomUUID(),
        paused,
        targets: baseline.value.connections
          .filter((connection) => connection.connected && !connection.revoked)
          .map((connection) => ({
            connectionId: connection.connectionId,
            observedAt: connection.sessionObservedAt ?? 0,
          })),
      }
      client.setQueryData<FlowPauseCommandState>(
        commonQueryKeys.flowPauseCommand,
        { ...request, confirmed: false, pending: true, error: null },
      )
      const settleCommand = (error: unknown) => {
        const current = client.getQueryData<FlowPauseCommandState>(
          commonQueryKeys.flowPauseCommand,
        )
        if (current?.requestId !== request.requestId) return
        client.setQueryData<FlowPauseCommandState>(
          commonQueryKeys.flowPauseCommand,
          confirmFlowPauseCommand(
            { ...current, pending: false, error },
            client.getQueryState<FlowStatus>(commonQueryKeys.flowStatus)
              ?.status === 'success'
              ? client.getQueryData<FlowStatus>(commonQueryKeys.flowStatus)
              : null,
          ),
        )
        void client.invalidateQueries({ queryKey: commonQueryKeys.flowStatus })
        refreshAfterPause()
      }
      // Exactamente un envío. Si vence el plazo, el fence queda hasta que ESTE
      // invoke resuelva o rechace; ningún timeout habilita un segundo POST.
      const commandPromise = Promise.resolve()
        .then(() => commonApi.pauseFlow(paused))
        .then(
          () => settleCommand(null),
          (error: unknown) => {
            settleCommand(error)
            throw error
          },
        )
      const acknowledgment = await settleFlowBeforeDeadline(
        commandPromise,
        deadline,
      )
      if (acknowledgment.status === 'rejected') throw acknowledgment.error
      if (acknowledgment.status === 'timeout') return request

      void client.cancelQueries({ queryKey: commonQueryKeys.flowStatus })
      while (Date.now() < deadline) {
        const observation = await settleFlowBeforeDeadline(
          client.fetchQuery({
            queryKey: commonQueryKeys.flowStatus,
            queryFn: commonApi.flowStatus,
            staleTime: 0,
            retry: false,
          }),
          deadline,
        )
        if (observation.status === 'timeout') {
          void client.cancelQueries({ queryKey: commonQueryKeys.flowStatus })
          break
        }
        if (
          observation.status === 'fulfilled' &&
          flowPauseConfirmation(request, observation.value).confirmed
        ) {
          client.setQueryData<FlowPauseCommandState>(
            commonQueryKeys.flowPauseCommand,
            (current) => {
              if (current?.requestId !== request.requestId) return current
              return confirmFlowPauseCommand(current, observation.value)
            },
          )
          break
        }
        const delay = Math.min(
          FLOW_PAUSE_POLL_INTERVAL_MS,
          deadline - Date.now(),
        )
        if (delay > 0)
          await new Promise((resolve) => setTimeout(resolve, delay))
      }
      return request
    },
    onSettled: refreshAfterPause,
  })
  const latest = snapshots.at(-1)
  const isBlocked = command.data?.pending === true
  const lateError =
    latest?.data?.requestId === command.data?.requestId
      ? command.data?.error
      : null
  const confirmation = latest?.data
    ? command.data?.requestId === latest.data.requestId &&
      command.data.confirmed
      ? { confirmed: true, pendingCount: 0 }
      : flowPauseConfirmation(latest.data, flow.isError ? null : flow.status)
    : null
  const feedbackKey = () => {
    if (isPending)
      return latest?.variables
        ? 'extension.pauseConfirming'
        : 'extension.resumeConfirming'
    if (isBlocked)
      return command.data?.paused
        ? 'extension.pauseUnconfirmed'
        : 'extension.resumeUnconfirmed'
    if (latest?.status !== 'success' || lateError) return null
    if (!confirmation?.confirmed)
      return latest.variables
        ? 'extension.pauseUnconfirmed'
        : 'extension.resumeUnconfirmed'
    return latest.variables
      ? 'extension.pauseConfirmed'
      : 'extension.resumeConfirmed'
  }
  const mutate = (paused: boolean) => {
    // Lectura síncrona del cache: dos botones en el mismo frame tampoco pasan.
    if (
      !flow.native ||
      client.isMutating({ mutationKey: commonQueryKeys.flowPause }) ||
      client.getQueryData<FlowPauseCommandState>(
        commonQueryKeys.flowPauseCommand,
      )?.pending
    )
      return
    mutation.mutate(paused)
  }
  return {
    mutate,
    isPending,
    isBlocked,
    pendingPaused: isPending
      ? latest?.variables
      : isBlocked
        ? command.data?.paused
        : undefined,
    isSuccess: latest?.status === 'success' && !lateError,
    isError: latest?.status === 'error' || !!lateError,
    variables: latest?.variables,
    data: latest?.data,
    error: lateError ?? latest?.error,
    feedbackKey: feedbackKey(),
    pendingCount: confirmation?.pendingCount ?? 0,
  }
}
