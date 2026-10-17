import { readFile, rm, statfs } from 'node:fs/promises'
import { join } from 'node:path'

import type { DemoConfig, DemoPackPart } from '../../config/pipeline-config.ts'
import { PipelineFailure } from '../../runner/failure.ts'
import { ensureDirectory, writeFileAtomic } from '../../utils/atomic-fs.ts'

// El staging de la instalación por partes (pack v4,
// docs/handoff/2026-10-14-demo-v4/design.md §3 «Descarga»): cada parte se
// extrae a `<projectsRoot>/_demo-pack.tmp/` y deja una marca con su SHA-256
// en el estado del staging. El staging se conserva entre intentos y entre
// sesiones de la app mientras sea del mismo armado: al volver, la instalación
// sigue con la primera parte sin marca y lo que se pierde como mucho es la
// parte en curso.

const STAGING_SUFFIX = '.tmp'
// El estado (versión y marcas) vive dentro del staging. Si la raíz del pack
// es la raíz del staging, el rename final lo lleva al pack: quien instala lo
// borra de ahí.
export const STAGING_STATE_FILE = '.parts.json'

export interface StagingState {
  version: string
  // Número de parte (desde 1, como los archivos del armador) → SHA-256 de la
  // parte ya extraída.
  parts: Record<string, string>
}

export function demoStagingRoot(packRoot: string): string {
  return `${packRoot}${STAGING_SUFFIX}`
}

// El SHA-256 con que se comparan partes, marcas y `.ok`: hex en minúscula,
// como lo calcula la descarga.
export function partSha256(part: DemoPackPart): string {
  return part.sha256.toLowerCase()
}

// Lo que pesa el pack entero: la suma de sus partes.
export function packBytes(parts: readonly DemoPackPart[]): number {
  return parts.reduce((total, part) => total + part.bytes, 0)
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMarkRecord(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) return false
  return Object.values(value).every((sha256) => typeof sha256 === 'string')
}

// El estado del staging, o null si no hay staging o su estado está roto.
export async function readStagingState(
  stagingRoot: string,
): Promise<StagingState | null> {
  const stored = await readJson(join(stagingRoot, STAGING_STATE_FILE))
  if (!isRecord(stored) || typeof stored.version !== 'string') return null
  if (!isMarkRecord(stored.parts)) return null
  return { version: stored.version, parts: stored.parts }
}

// Una parte está instalada si el staging tiene su marca con el SHA-256 de la
// parte configurada con ese número.
export function isPartInstalled(
  state: StagingState,
  partNumber: number,
  part: DemoPackPart,
): boolean {
  return state.parts[String(partNumber)] === partSha256(part)
}

// El staging sirve para seguir si es de la versión configurada y cada marca
// es la de la parte configurada con ese número: la marca de otro zip (otro
// armado con la misma versión) deja archivos que el pack nuevo no tiene.
function isStagingOf(state: StagingState, demo: DemoConfig): boolean {
  if (state.version !== demo.packVersion) return false
  return Object.entries(state.parts).every(([partNumber, sha256]) => {
    const part = demo.packParts[Number(partNumber) - 1]
    return part !== undefined && partSha256(part) === sha256
  })
}

// El estado del staging si sirve para seguir instalando el pack configurado;
// null si no hay staging o es de otra versión u otro armado.
export async function readReusableState(
  stagingRoot: string,
  demo: DemoConfig,
): Promise<StagingState | null> {
  const state = await readStagingState(stagingRoot)
  if (!state || !isStagingOf(state, demo)) return null
  return state
}

// Los bytes de las partes que ya tienen marca en el staging (0 sin staging).
export function installedBytes(
  state: StagingState | null,
  parts: readonly DemoPackPart[],
): number {
  return parts.reduce((total, part, index) => {
    if (!state || !isPartInstalled(state, index + 1, part)) return total
    return total + part.bytes
  }, 0)
}

// Las partes que todavía no tienen marca (todas, sin staging).
export function missingParts(
  state: StagingState | null,
  parts: readonly DemoPackPart[],
): DemoPackPart[] {
  return parts.filter(
    (part, index) => !state || !isPartInstalled(state, index + 1, part),
  )
}

// El staging con el que sigue la instalación: el que hay, si sirve; si no
// (otra versión, otro armado o sin estado), se borra entero y se empieza uno
// vacío de esta versión.
export async function openStaging(
  stagingRoot: string,
  demo: DemoConfig,
): Promise<StagingState> {
  const state = await readReusableState(stagingRoot, demo)
  if (state) return state

  await rm(stagingRoot, { recursive: true, force: true })
  return { version: demo.packVersion, parts: {} }
}

// Deja la marca de una parte ya extraída. El estado se reescribe entero y de
// forma atómica: una interrupción deja la marca o no la deja, nunca a medias.
export async function markPartInstalled(
  stagingRoot: string,
  state: StagingState,
  partNumber: number,
  sha256: string,
): Promise<void> {
  state.parts[String(partNumber)] = sha256
  await ensureDirectory(stagingRoot)
  await writeFileAtomic(
    join(stagingRoot, STAGING_STATE_FILE),
    `${JSON.stringify(state)}\n`,
  )
}

// El espacio libre que hace falta para terminar de instalar las partes
// `missing` (lo mismo exige demo-prepare antes de cada parte y lo informa
// demo-status): lo que falta extraer (las partes son zips sin compresión, así
// que extraídas pesan lo mismo), más la parte más grande de las que faltan
// (su zip convive con lo extraído hasta que se borra), más el margen. Sin
// partes por instalar no hace falta nada.
export function requiredFreeBytes(
  missing: readonly DemoPackPart[],
  marginBytes: number,
): number {
  if (missing.length === 0) return 0

  const largestPart = Math.max(...missing.map((part) => part.bytes))
  return packBytes(missing) + largestPart + marginBytes
}

// El espacio libre, para quien corre la app, en el volumen de `directory`.
export async function freeBytes(directory: string): Promise<number> {
  const stats = await statfs(directory)
  return stats.bavail * stats.bsize
}

// El código de sistema de un error de Node (`ENOENT`, `ENOSPC`, …).
export function hasErrorCode(error: unknown, code: string): boolean {
  if (typeof error !== 'object' || error === null) return false
  return 'code' in error && error.code === code
}

// Un disco que se llena mientras se baja o se extrae una parte da el mismo
// código que el chequeo previo: la persona libera espacio y sigue donde quedó.
export function diskFullFailure(error: unknown): PipelineFailure | null {
  if (!hasErrorCode(error, 'ENOSPC')) return null
  return new PipelineFailure(
    'demo_disk_full',
    `the disk filled up while installing the demo pack (${String(error)})`,
  )
}
