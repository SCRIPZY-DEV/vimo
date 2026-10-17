import { lstat, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { PipelineFailure } from '../runner/failure.ts'
import { writeFileAtomicStrict } from '../utils/atomic-fs.ts'
import type { ProjectPaths } from './paths.ts'

const MARKER = '.flow-video-outdated.json'
const FIELDS = ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'] as const
interface VideoIdentity {
  version: 1
  dev: string
  ino: string
  size: string
  mtimeNs: string
  ctimeNs: string
}

async function videoIdentity(
  paths: ProjectPaths,
): Promise<VideoIdentity | null> {
  try {
    const info = await lstat(paths.videoFile, { bigint: true })
    if (!info.isFile() || info.isSymbolicLink() || info.size <= 0n) return null
    return {
      version: 1,
      dev: String(info.dev),
      ino: String(info.ino),
      size: String(info.size),
      mtimeNs: String(info.mtimeNs),
      ctimeNs: String(info.ctimeNs),
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

// Read-only overlay: malformed/stale markers never clear other invalidations.
// Nanosecond stat identity survives reopening and changes after replacement or
// an in-place render, without hashing large video files on each Library read.
export async function flowVideoIsOutdated(
  paths: ProjectPaths,
): Promise<boolean> {
  try {
    const marker = join(paths.root, MARKER)
    const info = await lstat(marker)
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.size <= 0 ||
      info.size > 2048
    )
      return false
    const saved: unknown = JSON.parse(await readFile(marker, 'utf8'))
    if (typeof saved !== 'object' || saved === null || Array.isArray(saved))
      return false
    const fields = saved as Record<string, unknown>
    if (
      Object.keys(fields).length !== 6 ||
      fields.version !== 1 ||
      FIELDS.some(
        (key) =>
          typeof fields[key] !== 'string' ||
          !/^(0|[1-9][0-9]{0,39})$/.test(fields[key]),
      )
    )
      return false
    const current = await videoIdentity(paths)
    return (
      current !== null && FIELDS.every((key) => current[key] === fields[key])
    )
  } catch {
    // Do not remove a marker during a read: another importer may be replacing it.
    return false
  }
}

// This marker is the only metadata invalidation write made by background import. It never
// serializes a metadata snapshot, so concurrent UI options cannot be lost.
export async function markFlowVideoOutdated(
  paths: ProjectPaths,
): Promise<void> {
  const root = await lstat(paths.root)
  if (!root.isDirectory() || root.isSymbolicLink())
    throw new PipelineFailure(
      'flow_result_obsolete',
      'The image project changed',
    )
  const identity = await videoIdentity(paths)
  if (!identity) return
  // No mkdir: deleting a project cannot cause recovery to recreate it.
  // Atomic strict replacement does not follow an existing marker symlink.
  await writeFileAtomicStrict(
    join(paths.root, MARKER),
    JSON.stringify(identity),
  )
}
