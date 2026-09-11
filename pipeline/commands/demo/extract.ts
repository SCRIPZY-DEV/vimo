import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import yauzl from 'yauzl'

import { PipelineFailure } from '../../runner/failure.ts'

// Extracción del zip del pack con yauzl (ADR-0027): puro JavaScript y por
// streaming — el pipeline nunca depende de binarios del PATH (ADR-0013) y
// Windows no trae unzip. yauzl ya rechaza nombres absolutos o con `..`; el
// chequeo del destino es la segunda cerradura.

function openZip(zipPath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolveZip, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (error, zipfile) => {
      if (error || !zipfile) {
        reject(
          new PipelineFailure(
            'demo_pack_unreadable',
            `zip cannot be opened: ${error?.message ?? 'unknown'}`,
          ),
        )
        return
      }
      resolveZip(zipfile)
    })
  })
}

function openEntry(
  zipfile: yauzl.ZipFile,
  entry: yauzl.Entry,
): Promise<NodeJS.ReadableStream> {
  return new Promise((resolveStream, reject) => {
    zipfile.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(
          new PipelineFailure(
            'demo_pack_unreadable',
            `zip entry cannot be read: ${entry.fileName}`,
          ),
        )
        return
      }
      resolveStream(stream)
    })
  })
}

export async function extractZip(
  zipPath: string,
  destination: string,
  signal: AbortSignal,
): Promise<void> {
  await mkdir(destination, { recursive: true })
  const root = `${resolve(destination)}${sep}`
  const zipfile = await openZip(zipPath)

  await new Promise<void>((resolveDone, reject) => {
    const fail = (error: unknown) => {
      zipfile.close()
      reject(error)
    }
    zipfile.on('error', (error: Error) =>
      fail(
        new PipelineFailure(
          'demo_pack_unreadable',
          `zip error: ${error.message}`,
        ),
      ),
    )
    zipfile.on('end', resolveDone)
    zipfile.on('entry', (entry: yauzl.Entry) => {
      void (async () => {
        signal.throwIfAborted()
        const target = resolve(destination, entry.fileName)
        if (!target.startsWith(root))
          throw new PipelineFailure(
            'demo_pack_unreadable',
            `zip entry escapes the destination: ${entry.fileName}`,
          )
        if (entry.fileName.endsWith('/')) {
          await mkdir(target, { recursive: true })
          zipfile.readEntry()
          return
        }
        await mkdir(dirname(target), { recursive: true })
        const stream = await openEntry(zipfile, entry)
        await pipeline(stream, createWriteStream(target), { signal })
        zipfile.readEntry()
      })().catch(fail)
    })
    zipfile.readEntry()
  })
}
