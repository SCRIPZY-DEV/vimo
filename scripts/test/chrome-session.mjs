// Sesión Chrome aislada por pipe CDP; nunca conecta al perfil del usuario.
import { spawn } from 'node:child_process'

// Chrome borra su socket y sus temporales de `$TMPDIR` (`com.google.Chrome.<id>`)
// solo si sale por su cierre ordenado. Medido con Chrome 154 en macOS: el
// `Browser.close` de CDP y SIGINT los dejan limpios (salida en ~100 ms);
// SIGTERM sale con código 0 en ~30 ms pero los deja, igual que SIGKILL, y así
// se acumularon miles. Se pide el cierre por CDP (también vale en Windows, donde
// las señales no existen) y, si el navegador no sale a tiempo, se lo mata: un
// Chrome colgado nunca deja esperando a la prueba.
const GRACEFUL_CLOSE_MS = 2000

function closeChrome(child, requestClose) {
  const running =
    child.pid !== undefined &&
    child.exitCode === null &&
    child.signalCode === null
  if (!running) return Promise.resolve()

  return new Promise((resolve) => {
    const forceTimer = setTimeout(
      () => child.kill('SIGKILL'),
      GRACEFUL_CLOSE_MS,
    )
    child.once('exit', () => {
      clearTimeout(forceTimer)
      resolve()
    })
    try {
      requestClose()
    } catch {
      child.kill('SIGKILL')
    }
  })
}

export async function withChrome(chrome, profile, execute) {
  const child = spawn(
    chrome,
    [
      '--headless',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--allow-file-access-from-files',
      '--remote-debugging-pipe',
      '--user-data-dir=' + profile,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] },
  )
  let nextId = 0
  let buffer = ''
  let diagnostics = ''
  const pending = new Map()
  child.stderr.on('data', (bytes) => {
    diagnostics = (diagnostics + bytes.toString()).slice(-3000)
  })
  child.on('error', (error) => {
    for (const value of pending.values()) value.reject(error)
  })
  child.stdio[4].on('data', (bytes) => {
    buffer += bytes.toString()
    let index
    while ((index = buffer.indexOf('\0')) >= 0) {
      const raw = buffer.slice(0, index)
      buffer = buffer.slice(index + 1)
      if (!raw) continue
      const response = JSON.parse(raw)
      const receiver = pending.get(response.id)
      if (!receiver) continue
      pending.delete(response.id)
      if (response.error)
        receiver.reject(new Error(JSON.stringify(response.error)))
      else receiver.resolve(response.result)
    }
  })
  const call = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++nextId
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(method + ' timed out: ' + diagnostics))
      }, 20000)
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        },
      })
      child.stdio[3].write(
        JSON.stringify({
          id,
          method,
          params,
          ...(sessionId ? { sessionId } : {}),
        }) + '\0',
      )
    })
  try {
    await call('Browser.getVersion')
    return await execute(call)
  } finally {
    // Solo el proceso de prueba creado arriba, con perfil temporal propio.
    await closeChrome(child, () => {
      child.stdio[3].on('error', () => {})
      child.stdio[3].write(
        JSON.stringify({ id: ++nextId, method: 'Browser.close' }) + '\0',
      )
    })
    for (const value of pending.values())
      value.reject(new Error('Chrome session closed'))
    pending.clear()
  }
}
