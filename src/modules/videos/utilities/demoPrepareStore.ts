import { demoPrepareProgress } from './demoPrepareProgress.ts'
import type { PipelineJobHandle } from '@/modules/common/fetcher/pipeline'
import type {
  DemoPrepareApi,
  DemoPrepareProgress,
  DemoPrepareSnapshot,
  DemoPrepareStore,
  DemoPrepareTiming,
} from '@/modules/videos/types/demo'
import type { DemoManifest, DemoStatusResult } from '@pipeline/types/demo.ts'
import type { JsonValue } from '@pipeline/types/json.ts'

// La descarga del pack de la demo (demo-prepare por partes, spec demo v4 §3
// «Descarga») como store fuera de React, con el patrón de gemMigrations: el
// job vive en el módulo y no en la puerta, así que salir de la vista no lo
// cancela —el store nunca cancela— y volver muestra su avance. Un solo job a
// la vez: `start` arranca solo desde idle y `reset` (Reintentar) nunca suelta
// un job que sigue hablando; en la espera de un job mudo suelta su listener,
// sin cancelarlo.
// `demo_busy` no es un fallo final: otro demo-prepare tiene el candado de la
// instalación (uno que siguió corriendo tras recargar la vista, por ejemplo).
// Se espera mirando demo-status cada `pollIntervalMs`, solo mientras alguien
// mira el store, hasta que el pack queda listo; Reintentar relanza el job.
// A la misma espera va un job mudo (un proceso colgado, que no avanza ni
// termina): tras `silenceLimitMs` sin ningún evento se espera sin soltar su
// listener: si vuelve a hablar, su avance, su fin o su fallo cuentan. Un
// proceso que muere no queda mudo: Rust cierra el job con `sidecar_exited`
// (ADR-0010) y es un fallo como cualquier otro; el perro guardián queda como
// segunda red. Si demo-status dice que nadie tiene el candado y el pack no
// está listo, nadie baja: la espera relanza el job, que sigue desde la
// primera parte sin marca (el candado lo hace seguro).
// Un fallo de la red (`demo_offline`, `demo_download_failed`) se muestra
// mientras alguien mira y se olvida cuando nadie mira: volver a entrar a la
// demo sigue sola desde la primera parte sin marca, sin «Reintentar».
// Puro: el sidecar y los tiempos llegan inyectados, así el guard
// scripts/test/check-demo-gate.mjs lo corre con Node pelado. Por eso los
// códigos viven acá y el import de al lado es relativo.

const DEMO_BUSY_CODE = 'demo_busy'
export const DEMO_DISK_FULL_CODE = 'demo_disk_full'
const NETWORK_FAILURE_CODES: ReadonlySet<string> = new Set([
  'demo_offline',
  'demo_download_failed',
])
// Mientras se espera a otro job, el avance sale de lo bajado y, como el del
// job, no llega a 100 hasta que el pack está instalado.
const WAITING_PERCENT_CAP = 99

const DEMO_PREPARE_IDLE: DemoPrepareSnapshot = {
  status: 'idle',
  progress: null,
  manifest: null,
  errorCode: null,
  requiredFreeBytes: null,
}

export function createDemoPrepareStore(
  api: DemoPrepareApi,
  timing: DemoPrepareTiming,
): DemoPrepareStore {
  let snapshot = DEMO_PREPARE_IDLE
  // Cada intento y cada reset dejan sin efecto la consulta de la espera que
  // siga en vuelo.
  let attempt = 0
  let pollTimer: ReturnType<typeof setTimeout> | null = null
  let polling = false
  // Suelta el listener del último job lanzado mientras siga puesto: hasta su
  // evento final, un reset, un job nuevo o la demo lista.
  let releaseJob: (() => void) | null = null
  const listeners = new Set<() => void>()

  const publish = (next: DemoPrepareSnapshot) => {
    snapshot = next
    for (const listener of listeners) listener()
  }

  // demo-status con tope: una consulta que falla o no vuelve a tiempo cuenta
  // como sin respuesta, así ni la espera ni el aviso del disco lleno se
  // quedan colgados.
  const readStatus = async () => {
    let timeout: ReturnType<typeof setTimeout> | undefined
    const expired = new Promise<null>((resolve) => {
      timeout = setTimeout(() => resolve(null), timing.statusTimeoutMs)
    })
    try {
      return await Promise.race([api.demoStatus(), expired])
    } catch {
      return null
    } finally {
      clearTimeout(timeout)
    }
  }

  const stopPolling = () => {
    if (pollTimer !== null) clearTimeout(pollTimer)
    pollTimer = null
  }

  // La próxima consulta de la espera, si alguien mira y no hay otra en curso.
  const schedulePoll = (delayMs: number) => {
    if (snapshot.status !== 'waiting' || listeners.size === 0) return

    if (pollTimer !== null || polling) return

    pollTimer = setTimeout(() => {
      pollTimer = null
      void poll()
    }, delayMs)
  }

  // Con el pack listo, la demo queda lista con su manifest (y se suelta el
  // job mudo, si seguía puesto). Si no y nadie tiene el candado, nadie baja:
  // se relanza el job. Si alguien lo tiene, el avance sale de lo que
  // demo-status da por bajado.
  const takeStatus = (status: DemoStatusResult) => {
    if (status.ready && status.manifest) {
      releaseJob?.()
      publish({
        ...DEMO_PREPARE_IDLE,
        status: 'done',
        manifest: status.manifest,
      })
      return
    }

    if (!status.installing) {
      launch()
      return
    }

    const progress = waitingProgress(status, snapshot.progress)
    if (progress.percent === snapshot.progress?.percent) return
    publish({ ...snapshot, progress })
  }

  const poll = async () => {
    const current = attempt
    polling = true
    const status = await readStatus()
    polling = false
    if (status && current === attempt && snapshot.status === 'waiting')
      takeStatus(status)
    schedulePoll(timing.pollIntervalMs)
  }

  // Otro job tiene el candado, o el propio quedó mudo: se espera con el
  // último avance conocido, sin fase ni parte (eran del job que se cortó), y
  // se consulta enseguida.
  const wait = () => {
    const percent = snapshot.progress?.percent
    publish({
      ...DEMO_PREPARE_IDLE,
      status: 'waiting',
      progress:
        percent === undefined
          ? null
          : { percent, phase: null, part: null, parts: null },
    })
    schedulePoll(0)
  }

  const complete = (result: JsonValue | null) => {
    const manifest = manifestOf(result)
    // Un resultado sin manifest no deja entrar: es un fallo sin código.
    if (!manifest) {
      publish({ ...DEMO_PREPARE_IDLE, status: 'error' })
      return
    }
    publish({ ...DEMO_PREPARE_IDLE, status: 'done', manifest })
  }

  const fail = async (code: string | null) => {
    if (code === DEMO_BUSY_CODE) {
      wait()
      return
    }

    // Sin nadie mirando, un fallo de la red no se guarda: la próxima visita
    // vuelve a consultar demo-status y sigue sola.
    if (isNetworkFailureCode(code) && listeners.size === 0) {
      publish(DEMO_PREPARE_IDLE)
      return
    }

    if (code !== DEMO_DISK_FULL_CODE) {
      publish({ ...DEMO_PREPARE_IDLE, status: 'error', errorCode: code })
      return
    }

    // Los GB por liberar: lo que pide lo que falta según demo-status al
    // fallar, no al abrir la puerta (desde entonces pudieron instalarse
    // partes). Si mientras se consulta se lanzó otro job (Reintentar o el
    // relanzamiento de la espera), el fallo ya no es del job en curso y no
    // se publica.
    const failedAttempt = attempt
    const status = await readStatus()
    if (attempt !== failedAttempt) return

    publish({
      ...DEMO_PREPARE_IDLE,
      status: 'error',
      errorCode: code,
      requiredFreeBytes: status?.requiredFreeBytes ?? null,
    })
  }

  // Lanza un job demo-prepare. Suelta el listener del anterior si seguía
  // puesto (un job mudo), sin cancelarlo: si sigue vivo, el nuevo espera su
  // candado y pasa a la espera con `demo_busy`.
  const launch = () => {
    releaseJob?.()
    attempt += 1
    stopPolling()
    // `startDemoPrepare` cablea el canal antes de esperar el invoke (mismo
    // orden que runPipelineJob): los eventos pueden llegar antes que el
    // handle, que solo sirve para soltar el listener.
    let handle: PipelineJobHandle | null = null
    let released = false
    let silence: ReturnType<typeof setTimeout> | undefined
    const release = () => {
      released = true
      clearTimeout(silence)
      handle?.stop()
      if (releaseJob === release) releaseJob = null
    }
    // El perro guardián: cada evento lo vuelve a armar. Si el job calla
    // `silenceLimitMs`, se espera mirando demo-status, con su listener puesto.
    const watch = () => {
      clearTimeout(silence)
      silence = setTimeout(wait, timing.silenceLimitMs)
    }
    releaseJob = release
    publish({ ...DEMO_PREPARE_IDLE, status: 'running' })
    watch()

    api
      .startDemoPrepare((event) => {
        if (released) return

        if (event.type === 'job-completed') {
          release()
          complete(event.result)
          return
        }

        if (event.type === 'job-failed') {
          release()
          void fail(event.code)
          return
        }

        // Cualquier otro evento dice que el job sigue vivo. Un avance vuelve
        // a contar como en curso aunque llegue durante la espera del perro
        // guardián; el resto rearma el perro solo mientras está en curso.
        const progress =
          event.type === 'progress' ? demoPrepareProgress(event) : null
        if (!progress) {
          if (snapshot.status === 'running') watch()
          return
        }

        watch()
        stopPolling()
        publish({ ...DEMO_PREPARE_IDLE, status: 'running', progress })
      })
      .then(
        (job) => {
          // Un job rápido ya terminó: no se guarda, se suelta su listener.
          if (released) {
            job.stop()
            return
          }
          handle = job
        },
        (error: unknown) => {
          if (released) return
          release()
          void fail(api.errorCode(error))
        },
      )
  }

  const start = () => {
    if (snapshot.status !== 'idle') return
    launch()
  }

  // Deja la puerta como recién abierta tras un fallo, una espera o una demo
  // lista; en la espera de un job mudo, suelta su listener. Con un job en
  // curso no hace nada: nunca lo suelta ni lo cancela.
  const reset = () => {
    if (snapshot.status === 'idle' || snapshot.status === 'running') return
    releaseJob?.()
    attempt += 1
    stopPolling()
    publish(DEMO_PREPARE_IDLE)
  }

  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    // La puerta volvió durante la espera: consulta enseguida.
    schedulePoll(0)
    return () => {
      listeners.delete(listener)
      if (listeners.size > 0) return
      // Sin nadie mirando, la espera deja de consultar (retoma al volver), y
      // una demo lista que ya se vio o un fallo de la red se olvidan: la
      // próxima visita vuelve a revisar el pack (pudo perder una gema
      // sembrada) o sigue la descarga desde la primera parte sin marca.
      stopPolling()
      if (snapshot.status === 'done' || isNetworkFailure(snapshot))
        publish(DEMO_PREPARE_IDLE)
    }
  }

  const getSnapshot = () => snapshot

  return { subscribe, getSnapshot, start, reset }
}

function isNetworkFailureCode(code: string | null): boolean {
  return code !== null && NETWORK_FAILURE_CODES.has(code)
}

function isNetworkFailure(job: DemoPrepareSnapshot): boolean {
  return job.status === 'error' && isNetworkFailureCode(job.errorCode)
}

// El avance mientras otro job instala: lo que demo-status da por bajado (solo
// cuentan las partes terminadas), sin volver atrás de lo que ya se mostró.
function waitingProgress(
  status: DemoStatusResult,
  previous: DemoPrepareProgress | null,
): DemoPrepareProgress {
  const share =
    status.downloadBytes > 0 ? status.downloadedBytes / status.downloadBytes : 0
  const percent = Math.min(WAITING_PERCENT_CAP, Math.floor(share * 100))
  return {
    percent: Math.max(previous?.percent ?? 0, percent),
    phase: null,
    part: null,
    parts: null,
  }
}

// El manifest del resultado de demo-prepare (`{ manifest }`). Crear revisa
// su forma completa al leerlo del state (readDemoState): acá alcanza con que
// sea un objeto.
function manifestOf(result: JsonValue | null): DemoManifest | null {
  if (typeof result !== 'object' || result === null || Array.isArray(result))
    return null
  const manifest = result.manifest
  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    Array.isArray(manifest)
  )
    return null
  return manifest as unknown as DemoManifest
}
