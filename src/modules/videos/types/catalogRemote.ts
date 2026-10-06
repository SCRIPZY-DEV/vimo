import type {
  CatalogManifest,
  CatalogSampleUploadTarget,
  CatalogStyleContent,
} from '@pipeline/types/catalog.ts'

// El catálogo remoto administrado (Entrega 3, ADR-0049): lo que responde
// vimo.click y lo que la app le manda. Los nombres de los campos del servidor
// son el contrato (plan E3 §5.3) y se comparan tal cual llegan.

/** `GET /api/catalogo?conocida=<version>`. */
export type CatalogManifestResponse =
  { version: string; sinCambios: true } | CatalogManifest

/**
 * El estado de un estilo en el servidor. `archived` = el admin lo eliminó:
 * queda 30 días en Archivados, restaurable, y después el servidor lo purga.
 */
export type AdminCatalogStatus = 'hidden' | 'published' | 'archived'

/** Un estilo como lo ve el admin: borrador, publicado y estado. */
export interface AdminCatalogStyle {
  id: string
  position: number
  status: AdminCatalogStatus
  draft: CatalogStyleContent
  published: CatalogStyleContent | null
  publishedVersion: number
  publishedAt: string | null
  revision: number
  updatedAt: string
  updatedBy: string | null
  /** El borrador difiere de lo publicado (o nunca se publicó). */
  unpublishedChanges: boolean
  /** Cuándo se archivó; null si no está archivado. */
  archivedAt: string | null
  /** Cuándo lo purga el servidor (archivado + 30 días); null si no está archivado. */
  purgeAt: string | null
}

/** `GET /api/admin/catalogo`. */
export interface AdminCatalogListResponse {
  samplesBaseUrl: string
  styles: AdminCatalogStyle[]
}

/** Lo que devuelven crear, guardar, publicar, ocultar, eliminar (archivar) y restaurar. */
export interface AdminCatalogStyleResponse {
  style: AdminCatalogStyle
}

/** `POST /api/admin/catalogo`. */
export interface CatalogStyleCreateRequest {
  id: string
  position?: number
  draft: CatalogStyleContent
}

/** `PATCH /api/admin/catalogo/:id`. */
export interface CatalogStyleUpdateRequest {
  revision: number
  draft?: CatalogStyleContent
  position?: number
}

/** Publicar, ocultar y restaurar mandan la revisión que se abrió (plan E3, P11). */
export interface CatalogStyleRevisionRequest {
  revision: number
}

/** `POST /api/admin/catalogo/:id/muestras`: reserva la tanda siguiente. */
export interface CatalogSamplesReserveRequest {
  revision: number
  count: number
}

export interface CatalogSamplesReserveResponse {
  style: AdminCatalogStyle
  samplesRevision: number
  uploads: CatalogSampleUploadTarget[]
}

/** `POST /api/admin/catalogo/traducir` (plan E3, P8). */
export interface CatalogTranslateRequest {
  name: string
}

export interface CatalogTranslateResponse {
  name: { en: string; pt: string }
}

/** El distintivo de una tarjeta del admin; null = publicada y al día. */
export type CatalogAdminBadge =
  'unpublished' | 'hidden' | 'changes' | 'archived'

/** Qué muestra la galería del admin: el catálogo o lo archivado. */
export type CatalogAdminView = 'catalog' | 'archived'

/** Qué le falta a un borrador para publicarse (plan E3, P5 y §5.2). */
export type CatalogPublishBlocker =
  | 'nameEs'
  | 'nameEn'
  | 'namePt'
  | 'visualStyle'
  | 'samples'
  | 'characterOutfit'
  | 'placeholder'

/** Las acciones del admin sobre un estilo, para los avisos de la galería. */
export type CatalogAdminAction =
  'create' | 'save' | 'publish' | 'hide' | 'delete' | 'restore'
