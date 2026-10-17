import { useTranslation } from 'react-i18next'
import { PlayCircle } from 'lucide-react'
import { DemoGateBody } from '@/modules/videos/components/DemoGateBody'
import type { DemoGateCardScreen } from '@/modules/videos/types/demo'

interface DemoGateCardProps {
  screen: DemoGateCardScreen
  onDownload(): void
  onRetry(): void
}

// Puerta de la demo (ADR-0029): una sola tarjeta centrada con lo que pasa con
// el pack. Presentacional: la vista decide qué pantalla toca.
export function DemoGateCard({
  screen,
  onDownload,
  onRetry,
}: DemoGateCardProps) {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border-2 border-border bg-card p-8 text-center">
        <PlayCircle aria-hidden className="mx-auto h-10 w-10 text-saffron" />
        <h1 className="mt-3 font-display text-xl font-extrabold text-foreground">
          {t('createDemo.title')}
        </h1>
        <DemoGateBody
          screen={screen}
          onDownload={onDownload}
          onRetry={onRetry}
        />
      </div>
    </div>
  )
}
