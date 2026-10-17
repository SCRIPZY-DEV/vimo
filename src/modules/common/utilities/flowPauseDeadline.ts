import type { FlowPauseDeadlineResult } from '@/modules/common/types/flowPause'

// Vencer la espera de la UI no cancela invoke. La promesa original conserva
// handlers de resolución/rechazo para que un ACK tardío no se pierda.
export function settleFlowBeforeDeadline<Value>(
  operation: Promise<Value>,
  deadline: number,
): Promise<FlowPauseDeadlineResult<Value>> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (result: FlowPauseDeadlineResult<Value>) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    const timer = setTimeout(
      () => finish({ status: 'timeout' }),
      Math.max(0, deadline - Date.now()),
    )
    operation.then(
      (value) => finish({ status: 'fulfilled', value }),
      (error: unknown) => finish({ status: 'rejected', error }),
    )
  })
}
