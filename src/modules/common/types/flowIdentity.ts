import type { FlowIdentity } from '@/modules/common/types/flow'

export interface FlowAccountIdentityProps {
  identity: Partial<FlowIdentity> | null | undefined
  connected?: boolean
  lastVerifiedIdentity?: FlowIdentity | null
  reference: string
  heading?: 'h3' | 'p'
}
