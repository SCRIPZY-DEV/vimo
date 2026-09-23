// Plazo de un encargo a un proveedor asíncrono (crear tarea → consultar →
// descargar). Combina la cancelación de la persona con el plazo, distinguiendo
// cuál de los dos disparó: un plazo vencido va a verificación final de la tarea
// por SU id antes de re-encargar nada; una cancelación pedida sale como
// `cancelled`. Es la regla de oro con proveedores pagos (E26/E27): sin
// timeouts cortos propios, un solo plazo largo por encargo.

export interface OrderDeadline {
  signal: AbortSignal
  expired(): boolean
  close(): void
}

export function startOrderDeadline(
  parent: AbortSignal | undefined,
  deadlineMs: number,
): OrderDeadline {
  const controller = new AbortController()
  let deadlineExpired = false

  const timer = setTimeout(() => {
    deadlineExpired = true
    controller.abort()
  }, deadlineMs)
  const abortFromParent = () => controller.abort()

  if (parent?.aborted) controller.abort()
  else parent?.addEventListener('abort', abortFromParent)

  return {
    signal: controller.signal,
    expired: () => deadlineExpired,
    close() {
      clearTimeout(timer)
      parent?.removeEventListener('abort', abortFromParent)
    },
  }
}
