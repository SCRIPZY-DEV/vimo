import { randomUUID } from 'node:crypto'
import { open, readFile, stat, unlink, utimes } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { PipelineFailure } from '../../runner/failure.ts'
import { DEMO_PACK_SUBDIRECTORY } from './pack.ts'
import { diskFullFailure, hasErrorCode } from './staging.ts'

// Un solo demo-prepare a la vez por raíz de proyectos: dos a la vez se pisan
// el zip en curso, el staging y sus marcas (cancelar y volver a lanzar, o la
// descarga en segundo plano que sigue tras recargar la vista, los cruzan). El
// lock es `_demo-pack.lock` en la raíz, creado con O_EXCL, con el pid y un
// token de su dueño, que le actualiza la fecha (latido) mientras trabaja.
// Otro job espera a que se libere y, pasado el tope, falla con `demo_busy`.
// Un lock cuyo proceso murió, o sin latido hace rato (en Windows los pid se
// reusan y uno muerto puede parecer vivo), se toma.
// (pipeline/animation/coordination.ts no sirve acá: no tiene tope de espera
// ni código propio, y solo libera dueños muertos por pid.)

export const DEMO_LOCK_FILE = `${DEMO_PACK_SUBDIRECTORY}.lock`
// Tomar un lock abandonado se hace bajo este segundo lock, que dura
// microsegundos: así dos jobs que ven el mismo lock abandonado no borran uno
// el lock nuevo del otro.
export const DEMO_STEAL_LOCK_FILE = `${DEMO_PACK_SUBDIRECTORY}.lock.steal`

export interface DemoLockTiming {
  // Cada cuánto se vuelve a mirar un lock ocupado.
  pollMs: number
  // Cuánto se espera un lock ocupado antes de fallar con `demo_busy`: cubre
  // cancelar un job y lanzar otro enseguida.
  waitMs: number
  // Cada cuánto el dueño actualiza la fecha del lock.
  heartbeatMs: number
  // Sin latido por más de esto, el lock está abandonado aunque su pid exista.
  staleMs: number
  // Antes de tomar un lock sin latido se espera esto (varios latidos): al
  // despertar de una suspensión, el dueño vuelve a latir y la toma no lo
  // toca.
  staleConfirmMs: number
  // Un lock de toma más viejo que esto quedó de un proceso que murió en medio.
  stealStaleMs: number
}

export const DEMO_LOCK_TIMING: DemoLockTiming = {
  pollMs: 500,
  waitMs: 60_000,
  heartbeatMs: 5_000,
  staleMs: 2 * 60_000,
  staleConfirmMs: 15_000,
  stealStaleMs: 10_000,
}

interface LockHolder {
  pid: number
  token: string
  startedAt: string
}

// Lo que se ve de un lock: su dueño (null mientras se escribe o si quedó
// ilegible) y la fecha de su último latido.
interface LockSnapshot {
  holder: LockHolder | null
  heartbeatMs: number
}

interface LockPaths {
  lock: string
  steal: string
}

// Corre `action` con el lock de la raíz tomado. La acción recibe una señal
// que, además de la cancelación del job, se corta si otro job se queda con
// el lock (lo creyó abandonado): el dueño deja de latir —nunca toca un lock
// ajeno— y falla con `demo_busy`. `timing` solo cambia en el guard, para
// probar la espera y la toma sin esperar minutos.
export async function withDemoInstallLock<T>(
  projectsRoot: string,
  signal: AbortSignal,
  action: (signal: AbortSignal) => Promise<T>,
  timing: DemoLockTiming = DEMO_LOCK_TIMING,
): Promise<T> {
  const paths = {
    lock: join(projectsRoot, DEMO_LOCK_FILE),
    steal: join(projectsRoot, DEMO_STEAL_LOCK_FILE),
  }
  const holder = {
    pid: process.pid,
    token: randomUUID(),
    startedAt: new Date().toISOString(),
  }
  await acquire(paths, holder, timing, signal)

  const lost = new AbortController()
  // Un latido por vez (si el anterior sigue, por un disco lento, este se
  // salta), y soltar el lock lo espera: ningún latido toca el lock de otro
  // después de borrar el propio.
  let beating: Promise<void> | undefined
  const heartbeat = setInterval(() => {
    if (beating) return
    beating = beat(paths.lock, holder.token).then((ours) => {
      beating = undefined
      if (ours || lost.signal.aborted) return
      clearInterval(heartbeat)
      lost.abort(
        new PipelineFailure(
          'demo_busy',
          'another demo-prepare took the demo install lock',
        ),
      )
    })
  }, timing.heartbeatMs)
  heartbeat.unref()
  try {
    return await action(AbortSignal.any([signal, lost.signal]))
  } catch (error) {
    if (lost.signal.aborted && !signal.aborted) throw lost.signal.reason
    throw error
  } finally {
    clearInterval(heartbeat)
    await beating
    await release(paths.lock, holder.token)
  }
}

// ¿Un demo-prepare vivo tiene el lock de esta raíz? Lo mismo que mira quien
// espera el lock, sin tomarlo ni esperar la confirmación: el lock existe, su
// proceso vive y latió hace menos de `staleMs`. Sin lock, con su proceso
// muerto o sin latido, nadie instala. Un lock que no se puede leer (un
// antivirus lo tiene abierto) cuenta como tomado: la próxima consulta lo
// vuelve a mirar. demo-status lo informa para que la puerta distinga
// «alguien baja» de «nadie baja».
export async function isDemoInstallLockHeld(
  projectsRoot: string,
  timing: DemoLockTiming = DEMO_LOCK_TIMING,
): Promise<boolean> {
  const seen = await readSnapshot(join(projectsRoot, DEMO_LOCK_FILE)).catch(
    () => undefined,
  )
  if (seen === undefined) return true

  if (!seen) return false

  if (seen.holder && !isProcessAlive(seen.holder.pid)) return false

  return Date.now() - seen.heartbeatMs <= timing.staleMs
}

// Late solo si el lock sigue siendo suyo; false si ya es de otro (o lo
// borraron). Si no se puede leer (un antivirus lo tiene abierto), no late y
// sigue: lo intenta en el próximo latido.
async function beat(lockPath: string, token: string): Promise<boolean> {
  const current = await readSnapshot(lockPath).catch(() => undefined)
  if (current === undefined) return true
  if (current?.holder?.token !== token) return false

  const now = new Date()
  await utimes(lockPath, now, now).catch(() => undefined)
  return true
}

async function acquire(
  paths: LockPaths,
  holder: LockHolder,
  timing: DemoLockTiming,
  signal: AbortSignal,
): Promise<void> {
  const content = JSON.stringify(holder)
  const deadline = Date.now() + timing.waitMs
  for (;;) {
    signal.throwIfAborted()
    if (await tryCreate(paths.lock, content)) return

    // Se reintenta enseguida solo si el lock ya no está (se soltó entre el
    // intento y la lectura, o se borró uno abandonado); si no, se espera el
    // turno y vale el tope.
    if (await isLockGone(paths, timing, signal)) continue
    if (Date.now() >= deadline)
      throw new PipelineFailure(
        'demo_busy',
        'another demo-prepare is installing the demo pack in this projects root',
      )
    await delay(timing.pollMs, undefined, { signal })
  }
}

async function isLockGone(
  paths: LockPaths,
  timing: DemoLockTiming,
  signal: AbortSignal,
): Promise<boolean> {
  const seen = await readSnapshot(paths.lock)
  if (!seen) return true
  if (!(await isAbandoned(seen, timing, signal))) return false

  return takeAbandoned(paths, seen, timing)
}

// Crea el archivo solo si no existe; false si ya existía.
async function tryCreate(path: string, content: string): Promise<boolean> {
  const handle = await open(path, 'wx').catch((error: unknown) => {
    if (hasErrorCode(error, 'EEXIST')) return null
    throw diskFullFailure(error) ?? error
  })
  if (!handle) return false

  try {
    await handle.writeFile(content)
  } catch (error) {
    await handle.close()
    await unlink(path).catch(() => undefined)
    throw diskFullFailure(error) ?? error
  }
  await handle.close()
  return true
}

function parseHolder(text: string): LockHolder | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null) return null
  if (!('pid' in value) || !('token' in value) || !('startedAt' in value))
    return null

  const { pid, token, startedAt } = value
  if (typeof pid !== 'number' || !Number.isSafeInteger(pid)) return null
  if (typeof token !== 'string' || typeof startedAt !== 'string') return null
  return { pid, token, startedAt }
}

async function readSnapshot(path: string): Promise<LockSnapshot | null> {
  try {
    const [text, info] = await Promise.all([readFile(path, 'utf8'), stat(path)])
    return { holder: parseHolder(text), heartbeatMs: info.mtimeMs }
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return null
    throw error
  }
}

// El mismo lock que se vio: mismo dueño y sin latidos nuevos.
function isSameLock(current: LockSnapshot, seen: LockSnapshot): boolean {
  return (
    current.heartbeatMs === seen.heartbeatMs &&
    current.holder?.token === seen.holder?.token
  )
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM: el proceso existe pero es de otro usuario.
    return !hasErrorCode(error, 'ESRCH')
  }
}

// Abandonado: su proceso murió, o no late hace más de `staleMs`. Al lock sin
// latido se le da un rato más (varios latidos) antes de tomarlo: si su dueño
// despertó de una suspensión vuelve a latir, y la toma, que solo borra el
// lock tal como se vio, ya no lo toca.
async function isAbandoned(
  seen: LockSnapshot,
  timing: DemoLockTiming,
  signal: AbortSignal,
): Promise<boolean> {
  if (seen.holder && !isProcessAlive(seen.holder.pid)) return true
  if (Date.now() - seen.heartbeatMs <= timing.staleMs) return false

  await delay(timing.staleConfirmMs, undefined, { signal })
  return true
}

// Borra el lock abandonado si sigue siendo el que se vio, bajo el lock de
// toma. true solo si lo borró: si otro job lo está tomando en este momento,
// o el lock cambió desde que se vio, no toca nada.
async function takeAbandoned(
  paths: LockPaths,
  seen: LockSnapshot,
  timing: DemoLockTiming,
): Promise<boolean> {
  if (!(await tryCreate(paths.steal, String(process.pid)))) {
    await clearAbandonedSteal(paths.steal, timing)
    return false
  }

  try {
    const current = await readSnapshot(paths.lock)
    if (!current || !isSameLock(current, seen)) return false

    await unlink(paths.lock).catch((error: unknown) => {
      if (!hasErrorCode(error, 'ENOENT')) throw error
    })
    return true
  } finally {
    await unlink(paths.steal).catch(() => undefined)
  }
}

async function clearAbandonedSteal(
  stealPath: string,
  timing: DemoLockTiming,
): Promise<void> {
  const info = await stat(stealPath).catch(() => null)
  if (!info || Date.now() - info.mtimeMs <= timing.stealStaleMs) return

  await unlink(stealPath).catch(() => undefined)
}

// Suelta el lock solo si sigue siendo suyo. Si no se puede borrar (un
// antivirus lo tiene abierto), queda con el pid de este proceso, que muere al
// terminar el job: el próximo lo toma.
async function release(lockPath: string, token: string): Promise<void> {
  const current = await readSnapshot(lockPath).catch(() => null)
  if (current?.holder?.token !== token) return

  await unlink(lockPath).catch(() => undefined)
}
