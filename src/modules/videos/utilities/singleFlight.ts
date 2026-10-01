// Una sola ejecución en vuelo por clave: mientras la primera no termina, las
// siguientes reciben la MISMA promesa (un doble clic en «Preparar con IA», dos
// pantallas que piden lo mismo). Al terminar, bien o mal, la clave queda libre
// para otro intento. Puro: lo corre scripts/test/check-app-gem-rebuild.mjs.
export function createSingleFlight<TResult>() {
  const pending = new Map<string, Promise<TResult>>()

  return {
    run(key: string, task: () => Promise<TResult>): Promise<TResult> {
      const current = pending.get(key)
      if (current) return current

      const promise = task().finally(() => {
        pending.delete(key)
      })
      pending.set(key, promise)
      return promise
    },
  }
}
