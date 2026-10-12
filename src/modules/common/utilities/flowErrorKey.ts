import { FLOW_ERROR_KEYS } from '@/modules/common/constants'

export function flowErrorKey(error: unknown): string {
  const code =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : ''
  if (!Object.hasOwn(FLOW_ERROR_KEYS, code)) return 'extension.actionFailed'
  return FLOW_ERROR_KEYS[code]
}
