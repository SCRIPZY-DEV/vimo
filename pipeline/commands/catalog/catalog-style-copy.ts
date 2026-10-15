import { join } from 'node:path'

import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { CatalogCopyToCustomResult } from '../../types/catalog.ts'
import { ensureDirectory, writeFileAtomic } from '../../utils/atomic-fs.ts'
import {
  STYLE_FILE,
  newCustomStyleId,
  readStyleEntry,
  styleDirectory,
  type StoredStyle,
} from '../styles/style-store.ts'
import { readCatalogSampleBytes, resolveCatalogGem } from './catalog-cache.ts'
import {
  assertCatalogCopyPayload,
  wantsRemoteCatalog,
} from './catalog-store.ts'

// «Pasar a mi estilo» (spec §8): copia una gema del catálogo a la galería de
// Mi estilo como un estilo propio NUEVO (`st-…`) e independiente, con sus
// secciones, su versión y su filtro tal cual (también `none`), el modo de
// personaje elegido en «Ver», sus muestras y el `origin` que lee la etiqueta
// «Basado en …». Sin `sourcePrompt`: el texto original no se empaqueta
// (decisión P9 del plan E2).
//
// La gema sale del catálogo sincronizado y, si no está ahí, del empaquetado
// (ADR-0049). Las muestras son las que manda la app (las de
// `/style-references/`), salvo que la gema traiga su tanda sincronizada: esas
// se copian del disco y las del payload se ignoran.
//
// Todo el payload se valida antes de tocar el disco. Las muestras se escriben
// primero y style.json al final, como en seedGems de la demo: hasta
// que existe, la carpeta no es un estilo y styles-list no la muestra, así que
// una copia interrumpida no deja una tarjeta a medias.
export async function catalogStyleCopy(
  context: PipelineContext,
): Promise<CatalogCopyToCustomResult> {
  const copy = await assertCatalogCopyPayload(context.job.payload, (id) =>
    resolveCatalogGem(context, id, wantsRemoteCatalog(context.job.payload)),
  )
  const samples = copy.gem.samples
    ? await readCatalogSampleBytes(copy.gem.samples)
    : copy.samples

  const id = newCustomStyleId()
  const directory = styleDirectory(context, id)
  await ensureDirectory(directory)
  for (const sample of samples)
    await writeFileAtomic(join(directory, sample.file), sample.bytes)

  const now = new Date().toISOString()
  const stored: StoredStyle = {
    name: copy.name,
    sections: copy.gem.sections,
    templateVersion: copy.gem.templateVersion,
    colorFilter: copy.gem.colorFilter,
    origin: {
      kind: 'catalog',
      catalogStyleId: copy.gem.id,
      name: copy.name,
    },
    shots: [],
    character: copy.character,
    createdAt: now,
    updatedAt: now,
  }
  await writeFileAtomic(
    join(directory, STYLE_FILE),
    `${JSON.stringify(stored, null, 2)}\n`,
  )

  const entry = await readStyleEntry(context, id)
  if (!entry)
    throw new PipelineFailure('style_save_failed', 'style.json unreadable')
  return { entry }
}
