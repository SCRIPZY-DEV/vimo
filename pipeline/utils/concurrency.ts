// Limitador de concurrencia propio (reemplaza al p-limit del origen para no
// sumar una dependencia): a lo sumo `max` tareas en vuelo; el resto espera su
// turno en cola FIFO.
export type ConcurrencyLimiter = <T>(task: () => Promise<T>) => Promise<T>

export function limitConcurrency(max: number): ConcurrencyLimiter {
  let active = 0
  const queue: (() => void)[] = []

  function releaseSlot(): void {
    active--
    const next = queue.shift()
    if (next) next()
  }

  return async function limited<T>(task: () => Promise<T>): Promise<T> {
    if (active >= max) {
      await new Promise<void>((resolve) => {
        queue.push(resolve)
      })
    }
    active++
    try {
      return await task()
    } finally {
      releaseSlot()
    }
  }
}
