import { findCatalogGem } from '../../prompts/catalog-gems/catalog.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { CatalogGem } from '../../types/catalog.ts'
import type { StyleCharacter } from '../../types/styles.ts'
import {
  MAX_SAMPLE_BYTES,
  STYLE_NAME_LIMIT,
  assertSampleUpload,
  assertStyleCharacter,
  isCatalogStyleId,
  type SampleUploadBytes,
} from '../styles/style-store.ts'

// El catálogo de estilos de Vimo del lado del sidecar (Entrega 2, spec §8).
// Las gemas viven en pipeline/prompts/catalog-gems/ y sus muestras en la app
// (`/style-references/<id>_<n>.jpg`, decisión P1 del plan E2), así que acá
// solo están los límites de la copia de «Pasar a mi estilo» y su validación.
// La app copia estas constantes con una anotación `typeof`.

/** Cuántas muestras trae como máximo cada estilo del catálogo. */
export const CATALOG_SAMPLE_COUNT = 4
/** Tope de cada muestra que la app manda en la copia: el de la galería. */
export const MAX_CATALOG_SAMPLE_BYTES = MAX_SAMPLE_BYTES

/** La copia ya validada: lo que catalog-style-copy escribe. */
export interface CatalogCopy {
  gem: CatalogGem
  /** El nombre que vio la persona: el de la copia y el de su `origin`. */
  name: string
  character: StyleCharacter
  samples: SampleUploadBytes[]
}

// Valida TODO el payload de «Pasar a mi estilo» antes de que la copia toque
// el disco: la gema tiene que estar en el catálogo de este sidecar, el nombre
// entra en una tarjeta de la galería, el personaje es un bloque válido y
// cada muestra es un JPEG con su número.
export function assertCatalogCopyPayload(value: unknown): CatalogCopy {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new PipelineFailure('invalid_payload', 'payload must be an object')
  const payload = value as {
    catalogStyleId?: unknown
    name?: unknown
    character?: unknown
    samples?: unknown
  }

  if (!isCatalogStyleId(payload.catalogStyleId))
    throw new PipelineFailure(
      'invalid_payload',
      'payload.catalogStyleId is not a valid style id',
    )
  const gem = findCatalogGem(payload.catalogStyleId)
  if (!gem)
    throw new PipelineFailure(
      'style_not_found',
      `catalog style "${payload.catalogStyleId}" does not exist`,
    )

  const name = typeof payload.name === 'string' ? payload.name.trim() : ''
  if (!name || name.length > STYLE_NAME_LIMIT)
    throw new PipelineFailure(
      'invalid_payload',
      `payload.name must be a non-empty string of at most ${STYLE_NAME_LIMIT} characters`,
    )

  const character = payload.character
  assertStyleCharacter(character, 'payload.character')

  return {
    gem,
    name,
    character: storedCharacter(character),
    samples: assertCatalogSamples(payload.samples),
  }
}

// El bloque como lo guarda la galería: sin claves ajenas y con el puntero
// recortado (lo mismo que después lee readStyleCharacter).
function storedCharacter(character: StyleCharacter): StyleCharacter {
  if (character.defaultCharacterId === undefined)
    return { mode: character.mode }
  return {
    mode: character.mode,
    defaultCharacterId: character.defaultCharacterId.trim(),
  }
}

// Hasta CATALOG_SAMPLE_COUNT muestras, cada una con el número que tenía en la
// app (`<id>_<n>.jpg` → `sample-<n>.jpg`) y sin repetir. La app omite la que
// no pudo bajar, así que puede haber huecos; una lista vacía es una copia sin
// muestras.
function assertCatalogSamples(value: unknown): SampleUploadBytes[] {
  if (!Array.isArray(value))
    throw new PipelineFailure(
      'invalid_payload',
      'payload.samples must be a list',
    )
  if (value.length > CATALOG_SAMPLE_COUNT)
    throw new PipelineFailure(
      'invalid_payload',
      `payload.samples allows at most ${CATALOG_SAMPLE_COUNT} samples`,
    )

  const samples = value.map((sample, index) =>
    assertSampleUpload(
      sample,
      `payload.samples[${index}]`,
      CATALOG_SAMPLE_COUNT,
    ),
  )
  const files = samples.map((sample) => sample.file)
  const repeated = files.find((file, index) => files.indexOf(file) !== index)
  if (repeated)
    throw new PipelineFailure(
      'invalid_payload',
      `payload.samples repeats ${repeated}`,
    )
  return samples
}
