import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, realpath, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { PipelineFailure } from '../runner/failure.ts'
import { writeFileAtomicStrict } from '../utils/atomic-fs.ts'
import {
  ANIMATION_CREATES_PER_WINDOW,
  ANIMATION_CREATE_WINDOW_MS,
} from '../types/video-provider.ts'

interface LeaseOwner {
  pid: number
  token: string
  ticket: number
  choosing: boolean
  shared?: boolean
}

const directory = join(tmpdir(), 'vimo-animation-coordination-v1')
const fingerprint = (value: string) =>
  createHash('sha256').update(value).digest('hex')

function processAlive(owner: LeaseOwner): boolean {
  if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) return true
  try {
    process.kill(owner.pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

async function ownerOf(path: string): Promise<LeaseOwner | null> {
  try {
    const owner = JSON.parse(await readFile(path, 'utf8')) as LeaseOwner
    if (
      !Number.isSafeInteger(owner.pid) ||
      !Number.isSafeInteger(owner.ticket) ||
      typeof owner.token !== 'string' ||
      typeof owner.choosing !== 'boolean'
    )
      throw new PipelineFailure(
        'animation_project_busy',
        'Invalid coordination record',
      )
    if (processAlive(owner)) return owner
    // Cada nombre es único por intento: borrar un proceso muerto no puede
    // borrar al nuevo dueño de un lock reutilizado (evita la carrera ABA).
    await unlink(path).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    })
    return null
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

async function ownersIn(path: string): Promise<string[]> {
  return (await readdir(path))
    .filter((name) => name.endsWith('.json'))
    .map((name) => join(path, name))
}

// Exclusión de Lamport (bakery): cada participante publica únicamente SU
// número. No existe un lock de recuperación que otro cierre pueda dejar
// huérfano. Fuente: https://lamport.azurewebsites.net/pubs/bakery.pdf
// Se usa filesystem local con rename atómico, nunca una carpeta compartida de red.
async function withLease<T>(
  name: string,
  signal: AbortSignal,
  wait: boolean,
  action: () => Promise<T>,
  shared = false,
): Promise<T> {
  const queue = join(directory, fingerprint(name) + '-tickets')
  await mkdir(queue, { recursive: true, mode: 0o700 })
  const owner: LeaseOwner = {
    pid: process.pid,
    token: randomUUID(),
    ticket: 0,
    choosing: true,
    shared,
  }
  const path = join(queue, owner.token + '.json')
  await writeFileAtomicStrict(path, JSON.stringify(owner))
  try {
    let maximum = 0
    for (const otherPath of await ownersIn(queue)) {
      const other = await ownerOf(otherPath)
      maximum = Math.max(maximum, other?.ticket ?? 0)
    }
    owner.ticket = maximum + 1
    if (!Number.isSafeInteger(owner.ticket))
      throw new PipelineFailure(
        'animation_project_busy',
        'Coordination ticket exhausted',
      )
    owner.choosing = false
    await writeFileAtomicStrict(path, JSON.stringify(owner))

    for (const otherPath of await ownersIn(queue)) {
      if (otherPath === path) continue
      for (;;) {
        signal.throwIfAborted()
        const other = await ownerOf(otherPath)
        const precedes =
          other &&
          !(shared && other.shared === true) &&
          (other.choosing ||
            other.ticket < owner.ticket ||
            (other.ticket === owner.ticket && other.token < owner.token))
        if (!precedes) break
        if (!wait)
          throw new PipelineFailure(
            'animation_project_busy',
            'Another job is writing this project',
          )
        await delay(50, undefined, { signal })
      }
    }
    signal.throwIfAborted()
    return await action()
  } finally {
    await unlink(path).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    })
  }
}

export async function withProjectWriteLease<T>(
  projectPath: string,
  signal: AbortSignal,
  action: () => Promise<T>,
): Promise<T> {
  const canonical = await realpath(projectPath).catch(async (error) => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return join(await realpath(dirname(projectPath)), basename(projectPath))
  })
  return withLease('project:' + canonical, signal, false, action)
}

// Las animaciones comparten el proyecto, pero siguen excluyendo render, cortes,
// imágenes y audio. Sus escrituras cortas se serializan aparte y cada grupo de
// escenas tiene dueño exclusivo para evitar dos compras del mismo intervalo.
export async function withProjectAnimationLease<T>(
  projectPath: string,
  signal: AbortSignal,
  action: () => Promise<T>,
): Promise<T> {
  const canonical = await realpath(projectPath)
  return withLease('project:' + canonical, signal, false, action, true)
}

export async function withAnimationCheckpointLease<T>(
  projectPath: string,
  signal: AbortSignal,
  action: () => Promise<T>,
): Promise<T> {
  const canonical = await realpath(projectPath)
  return withLease('animation-write:' + canonical, signal, true, action)
}

export async function withAnimationSceneLease<T>(
  projectPath: string,
  sceneIds: number[],
  signal: AbortSignal,
  action: () => Promise<T>,
): Promise<T> {
  const canonical = await realpath(projectPath)
  const ids = [...new Set(sceneIds)].sort((a, b) => a - b)
  const enter = (index: number): Promise<T> => {
    if (index === ids.length) return action()
    return withLease(
      'animation-scene:' + canonical + ':' + ids[index],
      signal,
      false,
      () => enter(index + 1),
    )
  }
  return enter(0)
}

// Cupo por huella de clave compartido entre sidecars, independiente de la
// raíz de proyectos. Reserva antes del POST; no se devuelve una reserva ambigua.
export async function reserveAnimationCreate(
  apiKey: string,
  signal: AbortSignal,
  onWaiting?: () => void,
): Promise<void> {
  const account = fingerprint(apiKey)
  for (;;) {
    const waitMilliseconds = await withLease(
      'account:' + account,
      signal,
      true,
      async () => {
        const path = join(directory, account + '.json')
        let previous: number[] = []
        try {
          const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
          if (
            !Array.isArray(parsed) ||
            parsed.some(
              (time) => typeof time !== 'number' || !Number.isFinite(time),
            )
          )
            throw new PipelineFailure(
              'animation_rate_limited',
              'Invalid local rate ledger',
            )
          previous = parsed
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            if (
              !(error instanceof SyntaxError) &&
              !(
                error instanceof PipelineFailure &&
                error.code === 'animation_rate_limited'
              )
            )
              throw error
            // Bajo exclusión, esperar una ventana completa permite recuperar
            // un ledger ilegible sin inventar cupos ni descartar tareas pagadas.
            await delay(ANIMATION_CREATE_WINDOW_MS + 1000, undefined, {
              signal,
            })
            await writeFileAtomicStrict(path, '[]')
          }
        }
        const now = Date.now()
        const active = previous.filter(
          (time) => time > now - ANIMATION_CREATE_WINDOW_MS,
        )
        if (active.length >= ANIMATION_CREATES_PER_WINDOW)
          return Math.max(
            50,
            Math.min(
              ANIMATION_CREATE_WINDOW_MS,
              active[0] + ANIMATION_CREATE_WINDOW_MS - now + 10,
            ),
          )
        await writeFileAtomicStrict(path, JSON.stringify([...active, now]))
        return 0
      },
    )
    if (waitMilliseconds === 0) return
    onWaiting?.()
    await delay(waitMilliseconds, undefined, { signal })
  }
}
