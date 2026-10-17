import { DEMO_DISK_FULL_CODE } from './demoPrepareStore.ts'
import type {
  DemoGateInput,
  DemoGateScreen,
  DemoPrepareSnapshot,
} from '@/modules/videos/types/demo'
import type { DemoStatusResult } from '@pipeline/types/demo.ts'

// Qué muestra la puerta de la demo (spec demo v4 §3 «Descarga»), con lo que
// dice demo-status al abrirla y el job de la descarga, que puede venir de una
// visita anterior. Con la demo lista se entra; un job vivo se muestra antes
// que nada (aunque la consulta no haya llegado); después, su fallo; y sin job,
// la consulta decide: sin pack ni avance se ofrece la descarga con su tamaño,
// y con avance de otra sesión sigue sola. Puro: lo prueba
// scripts/test/check-demo-gate.mjs.
export function demoGateScreen({
  status,
  statusError,
  job,
}: DemoGateInput): DemoGateScreen {
  if (status?.ready && status.manifest)
    return { kind: 'enter', manifest: status.manifest }

  if (job.manifest) return { kind: 'enter', manifest: job.manifest }

  if (job.status === 'running')
    return { kind: 'progress', progress: job.progress }

  if (job.status === 'waiting')
    return { kind: 'waiting', progress: job.progress }

  if (job.status === 'error') return jobFailure(job, status)

  if (statusError) {
    return {
      kind: 'failed',
      source: 'status',
      errorCode: statusError.code,
      requiredFreeBytes: null,
    }
  }

  if (!status) return { kind: 'checking' }

  if (status.downloadedBytes > 0) return { kind: 'resume' }

  return { kind: 'offer', downloadBytes: status.downloadBytes }
}

// Con el disco lleno, los GB salen de `requiredFreeBytes`: el del fallo y, si
// no se pudo consultar, el de la puerta. Sin ninguna cifra útil el porqué se
// conserva: el aviso lo dice sin los GB.
function jobFailure(
  job: DemoPrepareSnapshot,
  status: DemoStatusResult | null,
): DemoGateScreen {
  if (job.errorCode !== DEMO_DISK_FULL_CODE) {
    return {
      kind: 'failed',
      source: 'job',
      errorCode: job.errorCode,
      requiredFreeBytes: null,
    }
  }

  const requiredFreeBytes =
    job.requiredFreeBytes ?? status?.requiredFreeBytes ?? 0
  return {
    kind: 'failed',
    source: 'job',
    errorCode: job.errorCode,
    requiredFreeBytes: requiredFreeBytes > 0 ? requiredFreeBytes : null,
  }
}
