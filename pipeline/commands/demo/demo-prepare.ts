import { readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

import type { DemoConfig, DemoPackPart } from '../../config/pipeline-config.ts'
import { isValidFile, projectsRootOf } from '../../project/paths.ts'
import type { PipelineContext } from '../../runner/context.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import type { DemoPrepareResult } from '../../types/demo.ts'
import { ensureDirectory, moveDirectoryAtomic } from '../../utils/atomic-fs.ts'
import { downloadFile } from './download.ts'
import { extractZip } from './extract.ts'
import { withDemoInstallLock } from './install-lock.ts'
import {
  DEMO_PACK_MANIFEST_FILE,
  DEMO_PACK_OK_FILE,
  DEMO_PACK_SUBDIRECTORY,
  demoPackRoot,
  isPackInstalled,
  readDemoManifest,
  seedGems,
  validatePack,
  writeOkMarker,
} from './pack.ts'
import {
  STAGING_STATE_FILE,
  demoStagingRoot,
  diskFullFailure,
  freeBytes,
  installedBytes,
  isPartInstalled,
  markPartInstalled,
  missingParts,
  openStaging,
  packBytes,
  partSha256,
  requiredFreeBytes,
  type StagingState,
} from './staging.ts'

// El avance llega a 100 recién con el pack instalado.
const PROGRESS_CAP_PERCENT = 99
const COMPLETE_PERCENT = 100
// La parte en curso se baja en la raíz, fuera del staging
// (`_demo-pack.part-<n>.download`): un zip a medias nunca se mezcla con lo
// extraído.
const PART_DOWNLOAD_PREFIX = `${DEMO_PACK_SUBDIRECTORY}.part-`
const DOWNLOAD_EXTENSION = '.download'
// El zip único de los packs v2 y v3, que pudo quedar de una versión anterior
// de la app.
const LEGACY_DOWNLOAD_FILE = `${DEMO_PACK_SUBDIRECTORY}.zip${DOWNLOAD_EXTENSION}`
// Un antivirus de Windows puede tener abierto un archivo recién escrito: el
// borrado se reintenta un rato (200 ms más cada vez) y, si igual falla, se
// avisa y se sigue.
const REMOVE_RETRIES = 5
const REMOVE_RETRY_DELAY_MS = 200

type InstallPhase = 'download' | 'install'
// Emite el avance total: los bytes del pack ya bajados, la fase y la parte en
// curso (desde 1).
type ReportProgress = (
  bytes: number,
  phase: InstallPhase,
  partNumber: number,
) => void

interface PartInstall {
  projectsRoot: string
  stagingRoot: string
  state: StagingState
  part: DemoPackPart
  partNumber: number
  // Los bytes de las partes ya instaladas: de ahí arranca el avance.
  doneBytes: number
  report: ReportProgress
}

// Prepara la demo (ADR-0029): instala el pack por partes si falta y siembra
// las gemas aunque el pack ya estuviera (la persona pudo borrar alguna); las
// que siguen en la galería no se tocan. Todo con el lock de la raíz: un job
// que esperó a otro encuentra el pack ya instalado y solo siembra, y el
// trabajo se corta si otro job se queda con el lock.
export async function demoPrepare(
  context: PipelineContext,
): Promise<DemoPrepareResult> {
  const projectsRoot = projectsRootOf(context)
  // Máquina nueva: la raíz no existe hasta crear el primer proyecto, y el
  // lock y la descarga viven en ella.
  await ensureDirectory(projectsRoot)

  return withDemoInstallLock(projectsRoot, context.signal, async (signal) => {
    const locked = { ...context, signal }
    const packRoot = demoPackRoot(locked)
    await removeStaleDownloads(locked, projectsRoot)
    await ensurePackInstalled(locked, projectsRoot, packRoot)

    const manifest = await readDemoManifest(packRoot)
    await withDiskFullFailure(() => seedGems(locked, packRoot, manifest.gems))
    return { manifest }
  })
}

// Instala el pack si falta. Si ya estaba, borra sin frenar el staging que
// haya quedado de la instalación (su borrado falló después de copiar el
// árbol, o la app murió justo ahí): con el pack instalado ya no sirve, y
// ocupa lo que el pack entero.
async function ensurePackInstalled(
  context: PipelineContext,
  projectsRoot: string,
  packRoot: string,
): Promise<void> {
  if (!(await isPackInstalled(packRoot, context.config.demo))) {
    await installPack(context, projectsRoot, packRoot)
    return
  }

  await removeBestEffort(context, demoStagingRoot(packRoot))
}

// Un ENOSPC fuera de bajar y extraer (al mover el pack a su lugar, cuando el
// rename sigue trabado y se copia el árbol, o al sembrar las gemas) da el
// mismo código que el chequeo previo: la persona libera espacio y sigue
// donde quedó.
async function withDiskFullFailure<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action()
  } catch (error) {
    throw diskFullFailure(error) ?? error
  }
}

// Instala el pack parte por parte (docs/handoff/2026-10-14-demo-v4/design.md
// §3 «Descarga»). Cada parte: espacio libre, descarga por streaming con
// SHA-256, verificación, extracción al staging, su marca y el borrado del
// zip. Con todas, el pack entero se valida, se sella y un rename atómico
// reemplaza `_demo-pack/`: el pack real nunca queda a medias. Si algo falla o
// se cancela, se borra solo el zip en curso; el staging y sus marcas quedan y
// el próximo intento sigue con la primera parte sin marca.
async function installPack(
  context: PipelineContext,
  projectsRoot: string,
  packRoot: string,
): Promise<void> {
  const demo = context.config.demo
  const parts = demo.packParts
  if (parts.length === 0)
    throw new PipelineFailure(
      'demo_download_failed',
      'no demo pack parts are configured',
    )

  const stagingRoot = demoStagingRoot(packRoot)
  const state = await openStaging(stagingRoot, demo)
  const report = progressReporter(context, parts)
  let doneBytes = installedBytes(state, parts)
  for (const [index, part] of parts.entries()) {
    const partNumber = index + 1
    if (isPartInstalled(state, partNumber, part)) continue

    await installPart(context, {
      projectsRoot,
      stagingRoot,
      state,
      part,
      partNumber,
      doneBytes,
      report,
    })
    doneBytes += part.bytes
  }

  await withDiskFullFailure(() =>
    movePackIntoPlace(context, stagingRoot, packRoot),
  )
  // Si la raíz del pack venía anidada, el staging sigue ahí con su estado.
  await removeBestEffort(context, stagingRoot)
  context.emitter.emit({
    type: 'progress',
    percent: COMPLETE_PERCENT,
    detail: { phase: 'install', part: parts.length, parts: parts.length },
  })
}

// Una parte: espacio libre, descarga, SHA-256, extracción al staging, marca y
// borrado del zip. La marca va antes del borrado: si el zip no se puede
// borrar (un antivirus) o la app se cierra justo ahí, la parte ya cuenta y el
// zip lo recoge la limpieza del próximo demo-prepare. Si algo falla o se
// cancela, se borra el zip y el error sigue.
async function installPart(
  context: PipelineContext,
  install: PartInstall,
): Promise<void> {
  const {
    projectsRoot,
    stagingRoot,
    state,
    part,
    partNumber,
    doneBytes,
    report,
  } = install
  await ensureFreeSpace(projectsRoot, context.config.demo, state)

  report(doneBytes, 'download', partNumber)
  const zipFile = partDownloadFile(projectsRoot, partNumber)
  try {
    const sha256 = await downloadFile(
      part.url,
      zipFile,
      context.signal,
      context.config.demo.downloadIdleMs,
      ({ receivedBytes }) => {
        // Un servidor que manda de más no empuja el avance fuera de la parte.
        const partBytes = Math.min(receivedBytes, part.bytes)
        report(doneBytes + partBytes, 'download', partNumber)
      },
    )
    if (sha256 !== partSha256(part))
      throw new PipelineFailure(
        'demo_pack_corrupt',
        `demo pack part ${partNumber} sha256 mismatch (got ${sha256})`,
      )

    report(doneBytes + part.bytes, 'install', partNumber)
    await extractZip(zipFile, stagingRoot, context.signal)
    await markPartInstalled(stagingRoot, state, partNumber, partSha256(part))
  } catch (error) {
    await removeBestEffort(context, zipFile)
    throw diskFullFailure(error) ?? error
  }
  await removeBestEffort(context, zipFile)
}

// Antes de cada parte: lo que falta extraer, más la parte más grande de las
// que faltan, más el margen (lo mismo que informa demo-status). Si no
// alcanza, la parte no arranca.
async function ensureFreeSpace(
  projectsRoot: string,
  demo: DemoConfig,
  state: StagingState,
): Promise<void> {
  const required = requiredFreeBytes(
    missingParts(state, demo.packParts),
    demo.diskMarginBytes,
  )
  const available = await freeBytes(projectsRoot)
  if (available >= required) return

  throw new PipelineFailure(
    'demo_disk_full',
    `the demo pack needs ${required} free bytes and the disk has ${available}`,
  )
}

// El avance total por bytes (las partes instaladas más lo bajado de la parte
// en curso) con «parte X de N». Nunca va hacia atrás y se queda en 99 hasta
// que el pack queda instalado. Un evento por punto porcentual o por cambio de
// fase o de parte, no por chunk: una parte de 500 MB son miles de chunks.
function progressReporter(
  context: PipelineContext,
  parts: readonly DemoPackPart[],
): ReportProgress {
  const totalBytes = packBytes(parts)
  let lastPercent = -1
  let lastStep = ''
  return (bytes, phase, partNumber) => {
    const share = totalBytes > 0 ? bytes / totalBytes : 0
    const percent = Math.max(
      lastPercent,
      Math.min(PROGRESS_CAP_PERCENT, Math.floor(share * 100)),
    )
    const step = `${phase} ${partNumber}`
    if (percent === lastPercent && step === lastStep) return

    lastPercent = percent
    lastStep = step
    context.emitter.emit({
      type: 'progress',
      percent,
      detail: { phase, part: partNumber, parts: parts.length },
    })
  }
}

function partDownloadFile(projectsRoot: string, partNumber: number): string {
  return join(
    projectsRoot,
    `${PART_DOWNLOAD_PREFIX}${partNumber}${DOWNLOAD_EXTENSION}`,
  )
}

function isDownloadFile(name: string): boolean {
  if (name === LEGACY_DOWNLOAD_FILE) return true
  return (
    name.startsWith(PART_DOWNLOAD_PREFIX) && name.endsWith(DOWNLOAD_EXTENSION)
  )
}

// Borra sin frenar la instalación (un antivirus de Windows puede tener el
// archivo abierto): reintenta y, si igual falla, avisa y sigue. Lo que quede
// lo recoge la limpieza del próximo demo-prepare.
async function removeBestEffort(
  context: PipelineContext,
  path: string,
): Promise<void> {
  try {
    await rm(path, {
      recursive: true,
      force: true,
      maxRetries: REMOVE_RETRIES,
      retryDelay: REMOVE_RETRY_DELAY_MS,
    })
  } catch (error) {
    context.emitter.emit({
      type: 'log',
      level: 'warn',
      message: `demo-prepare could not remove ${path}: ${String(error)}`,
    })
  }
}

// Los zips que no se pudieron borrar o que dejó una corrida que murió sin
// limpiar: ninguno cuenta como parte y cada uno ocupa hasta una parte entera.
// Corre con el lock tomado, así nunca toca el zip en curso de otro job.
async function removeStaleDownloads(
  context: PipelineContext,
  projectsRoot: string,
): Promise<void> {
  for (const name of await readdir(projectsRoot)) {
    if (!isDownloadFile(name)) continue
    await removeBestEffort(context, join(projectsRoot, name))
  }
}

// Con todas las partes: el pack entero se valida, se sella y reemplaza
// `_demo-pack/`. El `.ok` se escribe antes del rename y viaja con él: si algo
// falla después, el pack ya quedó sellado y la descarga no se pierde. Si el
// rename sigue trabado y el árbol se copia, el `.ok` va al final de la copia:
// una copia cortada nunca queda sellada y el próximo intento la repite desde
// el staging, que sigue entero.
async function movePackIntoPlace(
  context: PipelineContext,
  stagingRoot: string,
  packRoot: string,
): Promise<void> {
  const extractedRoot = await validatedPackRoot(context, stagingRoot)
  await writeOkMarker(extractedRoot, context.config.demo)
  await rm(packRoot, { recursive: true, force: true })
  // Es un directorio, no un archivo: swap con reintentos y fallback a copia
  // recursiva si el rename sigue bloqueado (ADR-0029, ver
  // moveDirectoryAtomic).
  await moveDirectoryAtomic(extractedRoot, packRoot, [DEMO_PACK_OK_FILE])
  // Con la raíz del pack en la raíz del staging, el estado viajó con ella.
  await removeBestEffort(context, join(packRoot, STAGING_STATE_FILE))
}

// La raíz del pack extraído, ya validado. Un staging con todas sus partes que
// forma un pack incompleto se descarta: «Reintentar» lo vuelve a bajar en vez
// de chocar siempre con el mismo staging (se repara solo si algo lo dañó en
// la máquina). Cualquier otro error lo deja, para seguir sin volver a bajar.
async function validatedPackRoot(
  context: PipelineContext,
  stagingRoot: string,
): Promise<string> {
  try {
    const extractedRoot = await locatePackRoot(stagingRoot)
    const problem = await validatePack(extractedRoot)
    if (problem) throw new PipelineFailure('demo_pack_incomplete', problem)
    return extractedRoot
  } catch (error) {
    if (
      error instanceof PipelineFailure &&
      error.code === 'demo_pack_incomplete'
    )
      await removeBestEffort(context, stagingRoot)
    throw error
  }
}

// La raíz real puede venir anidada si las partes traen carpeta contenedora:
// se detecta por manifest.json (en la raíz o un nivel abajo).
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
    `${DEMO_PACK_MANIFEST_FILE} not found in the downloaded parts`,
  )
}
