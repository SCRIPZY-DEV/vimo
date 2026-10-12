import type { FlowConnection } from '@/modules/common/types/flow'
import { flowCheckingState } from '@/modules/common/utilities/flowCheckingState'

export function flowCheckingHelpKey(
  availability: FlowConnection['profileAvailability'] | null | undefined,
) {
  switch (flowCheckingState(availability)) {
    case 'limited':
      return 'extension.helpAccountCheckingLimited'
    case 'running':
      return 'extension.helpAccountChecking'
    case 'unconfirmed':
      return 'extension.helpAccountCheckingUnconfirmed'
    default:
      return null
  }
}
