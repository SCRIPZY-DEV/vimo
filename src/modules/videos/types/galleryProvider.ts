import type { ImageProviderId } from '@pipeline/types/image-provider.ts'

export interface GalleryProviderPickerProps {
  value: ImageProviderId
  disabled: boolean
  onChange(provider: ImageProviderId): void
}
