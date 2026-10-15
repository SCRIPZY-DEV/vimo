export const ExtensionRoutes = { extension: '/extension' } as const
export const extensionQueryKeys = {
  release: ['extension', 'release'],
  downloadReceipt: ['extension', 'download-receipt'],
  download: ['extension', 'download'],
  galleryRoot: ['extension', 'gallery'],
  gallery: (batchIds: string[]) => ['extension', 'gallery', ...batchIds],
  previewRoot: ['extension', 'preview'],
  preview: (imageJobId: string) => ['extension', 'preview', imageJobId],
} as const
export const FLOW_CURRENT_PROFILE_LIMIT = 500
export const FLOW_GALLERY_PAGE_SIZE = 8
export const FLOW_PREVIEW_CACHE_MS = 60_000
export const FLOW_GALLERY_STALE_MS = 30_000
export const FLOW_PREVIEW_MAX_BASE64_LENGTH = 16 * 1024 * 1024
export const FLOW_PREVIEW_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
]

export const FLOW_PREPARATION_UNCONFIRMED_REASONS: readonly string[] = [
  'identity_unverified',
  'account_already_linked',
  'offline',
  'reconciling',
  'project_required',
  'status_stale',
  'duplicate_profile',
  'revoked',
  'connection_limit_exceeded',
]

export const EXTENSION_RELEASE_STORE_FILE = 'extension-release.json'
export const EXTENSION_DOWNLOAD_RECEIPT_KEY = 'lastDownloaded'
export const EXTENSION_VERSION_PATTERN =
  /^(0|[1-9]\d{0,4})(\.(0|[1-9]\d{0,4})){0,3}$/
export const EXTENSION_VERSION_PART_MAX = 65535
