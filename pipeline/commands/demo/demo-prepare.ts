import { readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

import { isValidFile, projectsRootOf } from '../../project/paths.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { DemoPrepareResult } from '../../types/demo.ts'
import { ensureDirectory, moveDirectoryAtomic } from '../../utils/atomic-fs.ts'
import { downloadFile } from './download.ts'
import { extractZip } from './extract.ts'
import {
  DEMO_PACK_MANIFEST_FILE,
  DEMO_PACK_SUBDIRECTORY,
  demoPackRoot,
  isPackInstalled,
  readDemoManifest,
  seedCustomStyle,
  validatePack,
  writeOkMarker,
} from './pack.ts'

// Un progress por punto porcentual, no por chunk: 209 MB son miles de chunks.
const DOWNLOAD_PERCENT_CAP = 99

// Descarga única del pack (ADR-0029): SHA-256 pineado, extracción a `.tmp`,
// validación entera y rename atómico — el pack real nunca queda a medias. La
// gema se siembra aunque el pack ya estuviera (la persona pudo borrarla).
export async function demoPrepare(
  context: PipelineContext,
): Promise<DemoPrepareResult> {
  const demo = context.config.demo
  const packRoot = demoPackRoot(context)

  if (!(await isPackInstalled(packRoot, demo)))
    await installPack(context, packRoot)
  await seedCustomStyle(context, packRoot)

  return { manifest: await readDemoManifest(packRoot, demo) }
}

async function installPack(
  context: PipelineContext,
  packRoot: string,
): Promise<void> {
  const demo = context.config.demo
  const projectsRoot = projectsRootOf(context)
  const zipFile = join(projectsRoot, `${DEMO_PACK_SUBDIRECTORY}.zip.download`)
  const stagingRoot = `${packRoot}.tmp`

  // Máquina nueva: la raíz no existe hasta crear el primer proyecto, y la
  // descarga escribe directo en ella.
  await ensureDirectory(projectsRoot)

  // Restos de una preparación interrumpida: se limpian antes de empezar.
  await rm(zipFile, { force: true })
  await rm(stagingRoot, { recursive: true, force: true })

  try {
    let lastPercent = -1
    context.emitter.emit({
      type: 'progress',
      percent: 0,
      detail: { phase: 'download' },
    })
    const sha256 = await downloadFile(
      demo.packUrl,
      zipFile,
      context.signal,
      ({ receivedBytes, totalBytes }) => {
        if (totalBytes === null) return
        const percent = Math.min(
          DOWNLOAD_PERCENT_CAP,
          Math.floor((receivedBytes / totalBytes) * 100),
        )
        if (percent <= lastPercent) return
        lastPercent = percent
        context.emitter.emit({
          type: 'progress',
          percent,
          detail: { phase: 'download' },
        })
      },
    )
    if (sha256 !== demo.packSha256.toLowerCase())
      throw new PipelineFailure(
        'demo_pack_corrupt',
        `demo pack sha256 mismatch (got ${sha256})`,
      )

    context.emitter.emit({
      type: 'progress',
      percent: 100,
      detail: { phase: 'install' },
    })
    await extractZip(zipFile, stagingRoot, context.signal)

    const extractedRoot = await locatePackRoot(stagingRoot)
    const problem = await validatePack(extractedRoot)
    if (problem) throw new PipelineFailure('demo_pack_incomplete', problem)

    await rm(packRoot, { recursive: true, force: true })
    // Es un directorio, no un archivo: swap con reintentos y fallback a
    // copia recursiva si el rename sigue bloqueado (ADR-0029, ver
    // moveDirectoryAtomic).
    await moveDirectoryAtomic(extractedRoot, packRoot)
    await writeOkMarker(packRoot, demo, sha256)
  } finally {
    await rm(zipFile, { force: true })
    await rm(stagingRoot, { recursive: true, force: true })
  }
}

// La raíz real puede venir anidada si el zip trae carpeta contenedora: se
// detecta por manifest.json (en la raíz o un nivel abajo).
async function locatePackRoot(stagingRoot: string): Promise<string> {
  if (await isValidFile(join(stagingRoot, DEMO_PACK_MANIFEST_FILE)))
    return stagingRoot

  const entries = await readdir(stagingRoot, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const candidate = join(stagingRoot, entry.name)
    if (await isValidFile(join(candidate, DEMO_PACK_MANIFEST_FILE)))
      return candidate
  }
  throw new PipelineFailure(
    'demo_pack_incomplete',
    `${DEMO_PACK_MANIFEST_FILE} not found in the downloaded zip`,
  )
}
