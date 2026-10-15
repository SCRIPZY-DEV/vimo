import { projectsRootOf } from '../../project/paths.ts'
import type { PipelineContext } from '../../runner/context.ts'
import type { DemoStatusResult } from '../../types/demo.ts'
import { isDemoInstallLockHeld } from './install-lock.ts'
import {
  areGemsSeeded,
  demoPackRoot,
  isPackInstalled,
  readDemoManifest,
} from './pack.ts'
import {
  demoStagingRoot,
  installedBytes,
  missingParts,
  packBytes,
  readReusableState,
  requiredFreeBytes,
} from './staging.ts'

// ¿El pack está listo en esta máquina? Listo = instalado (marcador + archivos
// completos) Y todas sus gemas sembradas en la galería. Sin pack, o con una
// gema borrada de la galería: `ready: false` y la puerta lanza demo-prepare
// (que con el pack ya instalado solo siembra lo que falta). Siempre informa
// lo que pesa el pack configurado, cuánto ya quedó bajado (las partes con
// marca en el staging, o todo si el pack ya está instalado), el espacio
// libre que pide lo que falta, con la misma cuenta que demo-prepare, y si un
// demo-prepare vivo tiene el lock de la instalación (`installing`). No toma
// el lock: solo lee.
export async function demoStatus(
  context: PipelineContext,
): Promise<DemoStatusResult> {
  const demo = context.config.demo
  const packRoot = demoPackRoot(context)
  const downloadBytes = packBytes(demo.packParts)
  const installing = await isDemoInstallLockHeld(projectsRootOf(context))
  if (!(await isPackInstalled(packRoot, demo))) {
    const state = await readReusableState(demoStagingRoot(packRoot), demo)
    return {
      ready: false,
      version: demo.packVersion,
      downloadBytes,
      downloadedBytes: installedBytes(state, demo.packParts),
      requiredFreeBytes: requiredFreeBytes(
        missingParts(state, demo.packParts),
        demo.diskMarginBytes,
      ),
      installing,
    }
  }

  // Instalado cuenta como bajado entero y sin espacio por pedir: con una gema
  // borrada, la puerta sigue sola (demo-prepare solo siembra).
  const installed = {
    version: demo.packVersion,
    downloadBytes,
    downloadedBytes: downloadBytes,
    requiredFreeBytes: 0,
    installing,
  }
  const manifest = await readDemoManifest(packRoot)
  if (!(await areGemsSeeded(context, manifest.gems)))
    return { ...installed, ready: false }

  return { ...installed, ready: true, manifest }
}
