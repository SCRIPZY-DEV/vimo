import { useEffect, useState } from 'react'

// La hora del reloj, refrescada cada `tickMs` mientras `active`: para lo que
// muestra un tiempo que corre (el render de un avatar en el progreso y en la
// pista). El reloj es el único sistema externo; quieto, no hay intervalo.
export function useNow(active: boolean, tickMs: number): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!active) return

    const timer = setInterval(() => setNow(Date.now()), tickMs)

    return () => clearInterval(timer)
  }, [active, tickMs])

  return now
}
