import {
  mkdir,
  open,
  readFile,
  rename,
  unlink,
  chmod,
  lstat,
} from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

export async function writePrivateFile(path, bytes) {
  const temporary = `${path}.${randomUUID()}.tmp`
  let handle
  let failure
  try {
    handle = await open(temporary, 'wx', 0o600)
    await handle.writeFile(bytes)
    await handle.sync()
    await handle.close()
    handle = null
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(temporary, path)
        break
      } catch (error) {
        if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt >= 5)
          throw error
        await new Promise((resolve) => setTimeout(resolve, 30 * (attempt + 1)))
      }
    }
    // En POSIX, sincronizar también el directorio hace durable el renombrado.
    // Windows no permite abrir directorios así; la escritura del archivo ya está sincronizada.
    if (process.platform !== 'win32') {
      const directory = await open(dirname(path), 'r')
      try {
        await directory.sync()
      } finally {
        await directory.close()
      }
    }
  } catch (error) {
    failure = error
    throw error
  } finally {
    let cleanupError
    try {
      await handle?.close()
    } catch (error) {
      cleanupError = error
    }
    try {
      await unlink(temporary)
    } catch (error) {
      if (error.code !== 'ENOENT') cleanupError ??= error
    }
    if (!failure && cleanupError) throw cleanupError
  }
}

async function acquireLock(lockPath) {
  try {
    return await open(lockPath, 'wx', 0o600)
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
  }
  // Serialize recovery itself. Without this guard, two starters can both read a
  // dead PID, then the second unlinks the first starter's newly acquired lock.
  const recoveryPath = `${lockPath}.recovery`
  let recovery
  let acquired
  let failure
  try {
    recovery = await open(recoveryPath, 'wx', 0o600)
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('store_lock_recovery_required')
    throw error
  }
  try {
    await recovery.writeFile(JSON.stringify({ pid: process.pid }))
    await recovery.sync()
    let previous
    try {
      previous = JSON.parse(await readFile(lockPath, 'utf8'))
    } catch (error) {
      if (error.code === 'ENOENT') {
        try {
          acquired = await open(lockPath, 'wx', 0o600)
          return acquired
        } catch (cause) {
          if (cause.code === 'EEXIST') throw new Error('store_in_use')
          throw cause
        }
      }
      if (error instanceof SyntaxError) throw new Error('store_lock_invalid')
      throw error
    }
    if (!Number.isSafeInteger(previous?.pid) || previous.pid < 1)
      throw new Error('store_lock_invalid')
    try {
      process.kill(previous.pid, 0)
      throw new Error('store_in_use')
    } catch (error) {
      if (error.code !== 'ESRCH') throw error
    }
    await unlink(lockPath)
    try {
      acquired = await open(lockPath, 'wx', 0o600)
      return acquired
    } catch (error) {
      if (error.code === 'EEXIST') throw new Error('store_in_use')
      throw error
    }
  } catch (error) {
    failure = error
    throw error
  } finally {
    let cleanupError
    try {
      await recovery.close()
    } catch (error) {
      cleanupError = error
    }
    try {
      await unlink(recoveryPath)
    } catch (error) {
      if (error.code !== 'ENOENT') cleanupError ??= error
    }
    if (cleanupError && acquired) {
      await acquired.close().catch(() => {})
      await unlink(lockPath).catch(() => {})
    }
    if (!failure && cleanupError) throw cleanupError
  }
}

async function releaseLock(lock, lockPath) {
  let failure
  try {
    await lock.close()
  } catch (error) {
    failure = error
  }
  try {
    await unlink(lockPath)
  } catch (error) {
    if (error.code !== 'ENOENT') failure ??= error
  }
  if (failure) throw failure
}

// Un solo proceso posee el ledger; nunca recuperar un JSON ilegible como estado vacío.
export async function openStore(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await chmod(directory, 0o700)
  for (const name of ['references', 'results']) {
    await mkdir(join(directory, name), { mode: 0o700 }).catch((error) => {
      if (error.code !== 'EEXIST') throw error
    })
    const info = await lstat(join(directory, name))
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error('store_directory_invalid')
    await chmod(join(directory, name), 0o700)
  }
  const lockPath = join(directory, 'bridge.lock')
  const lock = await acquireLock(lockPath)
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid }))
    await lock.sync()
  } catch (error) {
    await releaseLock(lock, lockPath).catch(() => {})
    throw error
  }
  const statePath = join(directory, 'state.json')
  let closed = false
  let state
  try {
    try {
      state = JSON.parse(await readFile(statePath, 'utf8'))
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error('store_state_invalid')
      throw error
    }
    if (
      !state ||
      state.version !== 1 ||
      !state.jobs ||
      typeof state.jobs !== 'object' ||
      Array.isArray(state.jobs) ||
      !state.connections ||
      typeof state.connections !== 'object' ||
      Array.isArray(state.connections) ||
      typeof state.paused !== 'boolean'
    ) {
      throw new Error('store_schema_invalid')
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      await releaseLock(lock, lockPath).catch(() => {})
      throw error
    }
    state = { version: 1, paused: false, connections: {}, jobs: {} }
  }
  let pending = Promise.resolve()
  let closing
  return {
    state,
    directory,
    save() {
      if (closed) return Promise.reject(new Error('store_closed'))
      const serialized = `${JSON.stringify(state)}\n`
      const next = pending.then(() => writePrivateFile(statePath, serialized))
      pending = next.catch(() => {})
      return next
    },
    close() {
      if (closing) return closing
      closed = true
      closing = (async () => {
        await pending
        await releaseLock(lock, lockPath)
      })()
      return closing
    },
  }
}
