import {
  EXTENSION_VERSION_PATTERN,
  EXTENSION_VERSION_PART_MAX,
} from '@/modules/extension/constants'
import type { ExtensionReleaseStateOptions } from '@/modules/extension/types/release'

export function extensionVersionParts(value: unknown): number[] | null {
  if (typeof value !== 'string' || !EXTENSION_VERSION_PATTERN.test(value))
    return null
  const parts = value.split('.').map(Number)
  if (
    parts.every((part) => part === 0) ||
    parts.some((part) => part > EXTENSION_VERSION_PART_MAX)
  )
    return null
  return Array.from({ length: 4 }, (_, index) => parts[index] ?? 0)
}

export function compareExtensionVersions(
  left: string,
  right: string,
): number | null {
  const leftParts = extensionVersionParts(left)
  const rightParts = extensionVersionParts(right)
  if (!leftParts || !rightParts) return null
  for (let index = 0; index < leftParts.length; index++) {
    const difference = leftParts[index] - rightParts[index]
    if (difference !== 0) return Math.sign(difference)
  }
  return 0
}

export function extensionReleaseState({
  release,
  connections,
  receipt,
  statusFailed,
}: ExtensionReleaseStateOptions) {
  const connected = statusFailed
    ? []
    : connections.filter(
        (connection) => connection.connected && !connection.revoked,
      )
  const known = connected.filter(
    (connection) => extensionVersionParts(connection.extensionVersion) !== null,
  )
  const older = known.filter(
    (connection) =>
      compareExtensionVersions(
        connection.extensionVersion!,
        release.version,
      ) === -1,
  )
  const downloaded =
    !!receipt &&
    (compareExtensionVersions(receipt.version, release.version) ?? -1) >= 0
  const current =
    connected.length > 0 &&
    known.length === connected.length &&
    older.length === 0
  return {
    available: older.length > 0 || (!current && !downloaded),
    installedVersions: [
      ...new Set(known.map((connection) => connection.extensionVersion!)),
    ],
    statusKey:
      older.length > 0
        ? 'extension.releaseUpdateAvailable'
        : current
          ? 'extension.releaseInstalledCurrent'
          : downloaded
            ? 'extension.releaseDownloadedWaiting'
            : 'extension.releaseReady',
  }
}

export function extensionReleaseErrorKey(error: unknown): string {
  const code =
    error && typeof error === 'object' && 'code' in error ? error.code : null
  switch (code) {
    case 'network':
    case 'unavailable':
    case 'invalid_manifest':
    case 'download_failed':
    case 'integrity_failed':
    case 'save_failed':
    case 'busy':
      return `extension.releaseError_${code}`
    default:
      return 'extension.releaseError_network'
  }
}
