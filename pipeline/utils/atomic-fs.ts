import {
  copyFile,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'

// Utilidades de filesystem para escribir, leer y crear directorios de forma
// resistente a locks temporales del sistema, especialmente en Windows.
const TRANSIENT_LOCK_CODES = new Set(['EPERM', 'EBUSY', 'EACCES', 'EEXIST'])

// Ocho intentos con backoff lineal entre operaciones bloqueadas.
const MAX_ATTEMPTS = 8
const BASE_DELAY_MS = 40

function errorCode(error: unknown): string {
  return (error as NodeJS.ErrnoException)?.code ?? ''
}

// Renombra el archivo y reintenta si el destino está bloqueado temporalmente.
export async function renameAtomic(
  source: string,
  destination: string,
): Promise<void> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      await rename(source, destination)
      return
    } catch (error) {
      // Los errores que no corresponden a un lock se propagan inmediatamente.
      if (!TRANSIENT_LOCK_CODES.has(errorCode(error))) throw error

      const isLastAttempt = attempt === MAX_ATTEMPTS - 1
      if (isLastAttempt) {
        // En Windows, la copia puede funcionar aunque el renombrado siga bloqueado.
        try {
          await copyFile(source, destination)
          await unlink(source).catch(() => {})
          return
        } catch {
          throw error
        }
      }

      await delay(BASE_DELAY_MS * (attempt + 1))
    }
  }
}

// Escribe en un temporal y luego lo mueve al destino para evitar archivos
// parcialmente escritos durante una interrupción.
export async function writeFileAtomic(
  path: string,
  data: Buffer | string,
): Promise<void> {
  const temporaryPath = `${path}.tmp`
  await writeFile(temporaryPath, data)
  await renameAtomic(temporaryPath, path)
}

// Lee un archivo de texto y reintenta si está bloqueado temporalmente.
export async function readTextWithRetry(path: string): Promise<string> {
  let lastError: unknown
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await readFile(path, 'utf8')
    } catch (error) {
      lastError = error
      const isLastAttempt = attempt === MAX_ATTEMPTS - 1
      if (!TRANSIENT_LOCK_CODES.has(errorCode(error)) || isLastAttempt)
        throw error
      await delay(BASE_DELAY_MS * (attempt + 1))
    }
  }
  throw lastError
}

// Crea un directorio y reintenta si el sistema lo bloquea temporalmente.
export async function ensureDirectory(path: string): Promise<void> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      await mkdir(path, { recursive: true })
      return
    } catch (error) {
      const code = errorCode(error)
      if (code === 'EEXIST') return

      const isLastAttempt = attempt === MAX_ATTEMPTS - 1
      if (!TRANSIENT_LOCK_CODES.has(code) || isLastAttempt) throw error
      await delay(BASE_DELAY_MS * (attempt + 1))
    }
  }
}
