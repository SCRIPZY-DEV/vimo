import { FLOW_MINIMUM_PROFILES } from '@/modules/common/constants'

export function flowMinimumProfiles(
  ...reportedMinimums: (number | undefined)[]
) {
  return reportedMinimums.reduce<number>((minimum, reported) => {
    if (reported === undefined || !Number.isSafeInteger(reported))
      return minimum
    return Math.max(minimum, reported)
  }, FLOW_MINIMUM_PROFILES)
}
