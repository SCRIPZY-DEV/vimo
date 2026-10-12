import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'
import { FlowManualPairingForm } from '@/modules/extension/components/FlowManualPairingForm'

export function FlowManualPairing() {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="flow-manual-pairing"
          className="flex w-full items-center justify-between gap-3 text-left font-display font-bold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          onClick={() => setExpanded(!expanded)}
        >
          {t('extension.manualTitle')}
          <ChevronDown
            aria-hidden="true"
            className={`size-4 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </button>
      </h2>
      <div id="flow-manual-pairing" hidden={!expanded}>
        {expanded && (
          <div className="pt-3">
            <FlowManualPairingForm />
          </div>
        )}
      </div>
    </section>
  )
}
