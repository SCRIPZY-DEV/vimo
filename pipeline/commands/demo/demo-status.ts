import type { PipelineContext } from '../../runner/context.ts'
import type { DemoStatusResult } from '../../types/demo.ts'
import {
  areGemsSeeded,
  demoPackRoot,
  isPackInstalled,
  readDemoManifest,
} from './pack.ts'

// ¿El pack está listo en esta máquina? Listo = instalado (marcador + archivos
// completos) Y todas sus gemas sembradas en la galería. Sin pack, o con una
// gema borrada de la galería: `ready: false` y la puerta lanza demo-prepare
// (que con el pack ya instalado solo siembra lo que falta).
export async function demoStatus(
  context: PipelineContext,
): Promise<DemoStatusResult> {
  const demo = context.config.demo
  const packRoot = demoPackRoot(context)
  const notReady: DemoStatusResult = { ready: false, version: demo.packVersion }
  if (!(await isPackInstalled(packRoot, demo))) return notReady

  const manifest = await readDemoManifest(packRoot)
  if (!(await areGemsSeeded(context, manifest.gems))) return notReady

  return { ready: true, version: demo.packVersion, manifest }
}
