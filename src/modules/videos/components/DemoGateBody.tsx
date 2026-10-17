import { DemoGateFailure } from '@/modules/videos/components/DemoGateFailure'
import { DemoGateOffer } from '@/modules/videos/components/DemoGateOffer'
import { DemoGateProgress } from '@/modules/videos/components/DemoGateProgress'
import { DEMO_PHASE_MESSAGE_KEYS } from '@/modules/videos/constants'
import type { DemoGateCardScreen } from '@/modules/videos/types/demo'

interface DemoGateBodyProps {
  screen: DemoGateCardScreen
  onDownload(): void
  onRetry(): void
}

// Lo que dice la tarjeta de la puerta en cada pantalla.
export function DemoGateBody({
  screen,
  onDownload,
  onRetry,
}: DemoGateBodyProps) {
  if (screen.kind === 'offer') {
    return (
      <DemoGateOffer
        downloadBytes={screen.downloadBytes}
        onDownload={onDownload}
      />
    )
  }

  if (screen.kind === 'failed') {
    return (
      <DemoGateFailure
        errorCode={screen.errorCode}
        requiredFreeBytes={screen.requiredFreeBytes}
        onRetry={onRetry}
      />
    )
  }

  if (screen.kind === 'checking') {
    return (
      <DemoGateProgress
        messageKey="createDemo.checking"
        progress={null}
        downloading={false}
      />
    )
  }

  // Otro job instala: el avance sin parte y «Reintentar», nunca un fallo.
  if (screen.kind === 'waiting') {
    return (
      <DemoGateProgress
        messageKey="createDemo.waiting"
        progress={screen.progress}
        downloading
        onRetry={onRetry}
      />
    )
  }

  // Con avance de otra sesión, la descarga arranca sola.
  if (screen.kind === 'resume') {
    return (
      <DemoGateProgress
        messageKey="createDemo.preparing"
        progress={null}
        downloading
      />
    )
  }

  // Sin fase todavía (el job arranca o espera el candado): «Preparando».
  const phase = screen.progress?.phase
  return (
    <DemoGateProgress
      messageKey={
        phase ? DEMO_PHASE_MESSAGE_KEYS[phase] : 'createDemo.preparing'
      }
      progress={screen.progress}
      downloading
    />
  )
}
