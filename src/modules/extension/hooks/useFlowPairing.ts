import { useEffect, useRef, useState } from 'react'
import { commonApi } from '@/modules/common/api'
import { FLOW_PAIRING_TTL_MS } from '@/modules/common/constants'
import type { FlowPairing } from '@/modules/common/types/flow'

// El código de un solo uso vive exclusivamente en memoria local del componente.
// Nunca entra en la caché de Query, localStorage, URL ni registros.
export function useFlowPairing() {
  const [pairing, setPairing] = useState<FlowPairing | null>(null)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const generation = useRef(0)
  useEffect(
    () => () => {
      generation.current += 1
    },
    [],
  )
  useEffect(() => {
    if (!pairing) return
    const timer = window.setTimeout(() => setPairing(null), FLOW_PAIRING_TTL_MS)
    return () => window.clearTimeout(timer)
  }, [pairing])
  const clear = () => {
    generation.current += 1
    setPairing(null)
    setPending(false)
  }
  const create = async () => {
    const request = ++generation.current
    setPending(true)
    setFailed(false)
    setPairing(null)
    try {
      const result = await commonApi.pairFlow()
      if (request === generation.current) setPairing(result)
    } catch {
      if (request === generation.current) setFailed(true)
    } finally {
      if (request === generation.current) setPending(false)
    }
  }
  return { pairing, pending, failed, create, clear }
}
