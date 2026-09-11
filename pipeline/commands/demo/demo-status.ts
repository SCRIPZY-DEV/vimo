import type { PipelineContext } from '../../runner/context.ts'
import type { DemoStatusResult } from '../../types/demo.ts'
import {
  demoPackRoot,
  isCustomStyleSeeded,
  isPackInstalled,
  readDemoManifest,
} from './pack.ts'

// ¿El pack está listo en esta máquina? Listo = instalado (marcador + archivos
// completos) Y la gema sembrada en la galería. Sin pack: `ready: false` y la
// puerta lanza demo-prepare.
export async function demoStatus(
  context: PipelineContext,
): Promise<DemoStatusResult> {
  const demo = context.config.demo
  const packRoot = demoPackRoot(context)
  const ready =
    (await isPackInstalled(packRoot, demo)) &&
    (await isCustomStyleSeeded(context))
  if (!ready) return { ready: false, version: demo.packVersion }
  return {
    ready: true,
    version: demo.packVersion,
    manifest: await readDemoManifest(packRoot, demo),
  }
}
