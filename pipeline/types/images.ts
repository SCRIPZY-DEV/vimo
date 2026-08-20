import type { ImageExtension } from './image-provider.ts'

// Dominio de generación de imágenes. Vive separado de characters porque la
// stage `images` de Create (paso 6 de ADR-0010) reusa estos mismos providers.
// Los ids de proveedor/modelo están en image-provider.ts: este archivo usa
// APIs de Node y la app no puede importarlo.

export interface DecodedImage {
  bytes: Buffer
  ext: ImageExtension
  mime: string
}

export interface ImageProgress {
  percent: number
  status: string
  elapsedSeconds: number
}

export interface GenerateImageOptions {
  apiKey: string
  signal?: AbortSignal
  onProgress?(progress: ImageProgress): void
}

// ─── Formas crudas de las APIs (solo los campos que consumimos) ───

export interface FalImageResponse {
  images?: { url?: string }[]
}

export interface FalErrorResponse {
  type?: string
  detail?: unknown
  error?: unknown
  message?: unknown
}

export interface EvolinkImageCreateResponse {
  id?: string
  status?: string
}

export interface EvolinkImageTaskResponse {
  status?: string
  progress?: number
  results?: unknown[]
  error?: { code?: string; message?: string }
}
