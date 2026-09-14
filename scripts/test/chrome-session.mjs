// Sesión Chrome aislada por pipe CDP; nunca conecta al perfil del usuario.
import { spawn } from 'node:child_process'

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
    child.kill('SIGKILL')
    for (const value of pending.values())
      value.reject(new Error('Chrome session closed'))
    pending.clear()
  }
}
