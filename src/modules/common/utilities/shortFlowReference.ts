import { FLOW_REFERENCE_LENGTH } from '@/modules/common/constants'

export function shortFlowReference(reference: string): string {
  return reference.slice(0, FLOW_REFERENCE_LENGTH)
}
