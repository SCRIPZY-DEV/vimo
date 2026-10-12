import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/modules/common/ui/button'
import { useFlowPairing } from '@/modules/extension/hooks/useFlowPairing'

export function FlowManualPairingForm() {
  const { t } = useTranslation()
  const pairing = useFlowPairing()
  const [revealed, setRevealed] = useState(false)
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {t('extension.manualHint')}
      </p>
      <Button
        type="button"
        variant="outline"
        disabled={pairing.pending}
        onClick={() => {
          setRevealed(false)
          void pairing.create()
        }}
      >
        {t('extension.createCode')}
      </Button>
      {pairing.failed && (
        <p role="alert" className="text-sm text-destructive">
          {t('extension.actionFailed')}
        </p>
      )}
      {pairing.pairing && (
        <div className="space-y-2 rounded-xl bg-muted p-4">
          <label
            className="block text-sm font-medium"
            htmlFor="flow-pairing-code"
          >
            {t('extension.code')}
          </label>
          <input
            id="flow-pairing-code"
            type={revealed ? 'text' : 'password'}
            readOnly
            autoComplete="off"
            spellCheck={false}
            value={pairing.pairing.pairingCode}
            className="w-full rounded-lg border border-border bg-background p-3 font-mono"
          />
          <p className="text-xs text-muted-foreground">
            {t('extension.codeExpiry')}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setRevealed(!revealed)}
            >
              {t(revealed ? 'extension.hideCode' : 'extension.revealCode')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={pairing.clear}
            >
              {t('extension.dismissCode')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
