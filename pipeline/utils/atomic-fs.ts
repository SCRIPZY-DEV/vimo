import {
  copyFile,
  cp,
  mkdir,
  open,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
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

// Mueve un directorio entero, resistente a locks de Windows (swap del pack
// de la demo, ADR-0029): tras extraer el zip, Defender o el indexador
// pueden tener abierto algún archivo recién escrito del árbol, y en Windows
// eso basta para que el rename de la CARPETA falle con EPERM/EBUSY aunque
// los archivos en sí se puedan leer. Mismo reintento lock-tolerante que
// renameAtomic; si los 8 intentos se agotan, copia el árbol entero en vez
// de perder el trabajo — quien llama sigue siendo dueño de borrar el
// origen (installPack ya lo hace en su `finally`).
export async function moveDirectoryAtomic(
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
        await cp(source, destination, { recursive: true })
        return
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

// Los recibos que autorizan compras no admiten la copia sobre el destino
// bloqueado de Windows: un cierre a mitad perdería el taskId. Se sincroniza
// el temporal y se exige rename; fallar conserva el checkpoint anterior.
export async function writeFileAtomicStrict(
  path: string,
  data: Buffer | string,
): Promise<void> {
  const temporaryPath = path + '.' + randomUUID() + '.tmp'
  const handle = await open(temporaryPath, 'wx', 0o600)
  try {
    await handle.writeFile(data)
    await handle.sync()
  } finally {
    await handle.close()
  }
  try {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        await rename(temporaryPath, path)
        return
      } catch (error) {
        if (
          !TRANSIENT_LOCK_CODES.has(errorCode(error)) ||
          attempt === MAX_ATTEMPTS - 1
        )
          throw error
        await delay(BASE_DELAY_MS * (attempt + 1))
      }
    }
  } finally {
    await unlink(temporaryPath).catch(() => undefined)
  }
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
