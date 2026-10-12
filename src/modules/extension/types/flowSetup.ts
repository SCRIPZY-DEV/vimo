import type { Ref } from 'react'
import type {
  FlowCapacity,
  FlowCapacityProfile,
  FlowConnection,
  FlowDiscovery,
  FlowStatus,
} from '@/modules/common/types/flow'

export interface FlowSetupInput {
  native: boolean
  loading: boolean
  failed: boolean
  status: FlowStatus | null
  capacity: FlowCapacity | null
}

export type FlowSetupAction = 'refresh' | 'link' | 'guide' | 'review' | 'create'

export interface FlowSetupState {
  action: FlowSetupAction
  messageKey: string
  linked: number | null
  prepared: number | null
  available: number | null
  minimum: number
  limited: number
  confirmed: boolean
}

export interface FlowSetupAccountsProps {
  sectionRef: Ref<HTMLElement>
  connections: FlowConnection[]
  status: FlowStatus | null
  capacity: FlowCapacity | null
  confirmed: boolean
  busy: boolean
  onRevoke(connectionId: string): void
}

export interface FlowSetupGuideProps {
  detailsRef: Ref<HTMLDetailsElement>
}

export interface FlowDiscoverySectionProps {
  detailsRef: Ref<HTMLDetailsElement>
  profiles: FlowDiscovery[]
  loading: boolean
  failed: boolean
  busy: boolean
  status: FlowStatus | null
  onLink(discoveryId: string): void
}

// Campos públicos ya enviados por el coordinador; no amplían comandos nativos.
export interface FlowSetupConnection extends FlowConnection {
  installationId?: string
}

export interface FlowSetupCapacityProfile extends FlowCapacityProfile {
  installationId?: string
  projectId?: string | null
}

export type FlowPreparationState = 'prepared' | 'pending' | 'unconfirmed'
