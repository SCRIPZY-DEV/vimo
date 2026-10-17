import type { FlowConnection } from '@/modules/common/types/flow'

export interface FlowAccountRecoveryGuide {
  titleKey: string
  helpKey: string
  stepKeys: string[]
  nextCheckAt?: number | null
  identityReview?: boolean
}

export interface FlowAccountRecoveryHelpProps {
  availability: FlowConnection['profileAvailability'] | null | undefined
}
