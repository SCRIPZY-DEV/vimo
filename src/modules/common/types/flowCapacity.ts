import type {
  FlowCapacity,
  FlowCapacityOptions,
  FlowStatus,
} from '@/modules/common/types/flow'

export interface FlowCapacityNoticeProps extends FlowCapacityOptions {
  // null indica que todavía no se conoce la cantidad de escenas.
  count: number | null
}

export interface FlowCapacityMessageOptions {
  countKnown?: boolean
  native: boolean
  isLoading: boolean
  isError: boolean
  ready: boolean
  status: FlowStatus | null
  capacity: FlowCapacity | null
}
