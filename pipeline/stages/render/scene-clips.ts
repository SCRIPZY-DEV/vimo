import { rm } from 'node:fs/promises'
import { join } from 'node:path'

import { renderChunk, type RenderScene } from './chunk-renderer.ts'

// Un clip mudo por escena (export "para editar" de Library, ADR-0014): cada
// clip es un chunk de UNA escena — mismo Ken Burns por índice global, mismas
// constantes de frame — así lo exportado coincide 1:1 con el render final.

export function clipFileName(position: number): string {
  return `clip_${String(position).padStart(2, '0')}.mp4`
}

export async function renderSceneClips(
  ffmpegPath: string,
  scenes: RenderScene[],
  outputDirectory: string,
  options: {
    signal?: AbortSignal
    onProgress?(fraction: number): void
  } = {},
): Promise<number> {
  for (const [index, scene] of scenes.entries()) {
    options.signal?.throwIfAborted()
    const clipFile = join(outputDirectory, clipFileName(index + 1))
    await renderChunk(ffmpegPath, [scene], index, clipFile, {
      signal: options.signal,
      onProgress(fraction) {
        options.onProgress?.((index + fraction) / scenes.length)
      },
    })
    // El manifest de caché del chunk no aporta acá: la carpeta se limpia
    // entera en cada export y el usuario la abre en su editor de video.
    await rm(`${clipFile}.manifest.json`, { force: true })
  }
  return scenes.length
}
