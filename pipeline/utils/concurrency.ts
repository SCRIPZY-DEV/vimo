// Limitador de concurrencia propio (reemplaza al p-limit del origen para no
// sumar una dependencia): a lo sumo `max` tareas en vuelo; el resto espera su
// turno en cola FIFO.
// El lugar que se suelta pasa en mano a la primera de la cola (revisión de WP-A
// de la entrega 2h, M-2): `active` no baja entre que se suelta y la que
// esperaba arranca. Antes bajaba y la que esperaba lo volvía a sumar recién en
// su continuación; una tarea que llegaba en ese hueco entraba también (`max +
// 1` a la vez) y se adelantaba a la cola.
export type ConcurrencyLimiter = <T>(task: () => Promise<T>) => Promise<T>

export function limitConcurrency(max: number): ConcurrencyLimiter {
  let active = 0
  const queue: (() => void)[] = []

  // Sin lugar libre: espera a que la que suelta el suyo se lo pase.
  function slotHandedOver(): Promise<void> {
    return new Promise((resolve) => {
      queue.push(resolve)
    })
  }

  function releaseSlot(): void {
    const next = queue.shift()
    if (next) return next()

    active--
  }

  return async function limited<T>(task: () => Promise<T>): Promise<T> {
    // Con lugar libre, se lo toma en el acto (la tarea arranca sin esperar).
    if (active < max) active++
    else await slotHandedOver()

    try {
      return await task()
    } finally {
      releaseSlot()
    }
  }
}
