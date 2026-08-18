import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Trash2,
} from 'lucide-react'
import { Button } from '@/modules/common/ui/button'
import { Input } from '@/modules/common/ui/input'
import { cn } from '@/modules/common/utilities/cn'
import { apiKeysApi } from '@/modules/api-keys/api'
import { useApiKeyActions } from '@/modules/api-keys/hooks/useApiKeyActions'
import {
  API_KEY_ERROR_MESSAGE_KEYS,
  UNKNOWN_ERROR_MESSAGE_KEY,
} from '../constants'
import type { ApiKeyStatus } from '../types/apiKeys'
import type { ApiKeyProvider } from '../types/provider'

interface ApiKeyCardProps {
  provider: ApiKeyProvider
  status?: ApiKeyStatus
}

export function ApiKeyCard({ provider, status }: ApiKeyCardProps) {
  const { t } = useTranslation()
  const {
    saveKey,
    testKey,
    removeKey,
    saving,
    testing,
    removing,
    validation,
    saveErrorKey,
    resetFeedback,
  } = useApiKeyActions(provider.id)

  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [visible, setVisible] = useState(false)

  const configured = status?.configured ?? false
  // Las claves managed (membresía futura) no se editan a mano.
  const managed = status?.source === 'managed'

  const closeEditor = () => {
    setEditing(false)
    setValue('')
    setVisible(false)
    resetFeedback()
  }

  const validationMessage = () => {
    if (!validation) return null
    if (validation.ok) return t('apiKeys.validacionOk')
    if (validation.code === null) return t(UNKNOWN_ERROR_MESSAGE_KEY)

    return t(API_KEY_ERROR_MESSAGE_KEYS[validation.code])
  }

  return (
    <div
      className={cn(
        'rounded-2xl border-2 p-4 transition-colors',
        configured ? 'border-saffron/30 bg-saffron/5' : 'border-border bg-card',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-base font-bold text-foreground">
              {provider.label}
            </p>
            {provider.badgeKey && (
              <span className="rounded-full border border-coral/50 bg-coral/15 px-2 py-0.5 font-display text-[11px] font-bold text-foreground">
                {t(provider.badgeKey)}
              </span>
            )}
            {configured ? (
              <span className="rounded bg-saffron/15 px-1.5 py-0.5 font-display text-[10px] font-bold text-foreground">
                {t('apiKeys.configurada')}
              </span>
            ) : (
              <span className="rounded bg-muted px-1.5 py-0.5 font-display text-[10px] font-bold text-muted-foreground">
                {t('apiKeys.sinConfigurar')}
              </span>
            )}
          </div>
          <p className="mt-0.5 font-body text-xs text-muted-foreground">
            {t(provider.descriptionKey)}
          </p>
          {!editing && configured && status?.maskedKey && (
            <code className="mt-2 block font-mono text-xs text-muted-foreground">
              {status.maskedKey}
            </code>
          )}
        </div>

        {!editing && !managed && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                void apiKeysApi.openProviderPage(provider.getKeyUrl)
              }
              className="inline-flex items-center gap-1 font-display text-xs font-semibold text-muted-foreground transition-colors hover:text-saffron"
            >
              <ExternalLink className="h-3 w-3" />
              {t('apiKeys.obtener')}
            </button>
            <Button
              size="sm"
              variant={configured ? 'ghost' : 'default'}
              onClick={() => setEditing(true)}
              className="rounded-lg font-display font-semibold"
            >
              {configured ? t('apiKeys.cambiar') : t('apiKeys.configurar')}
            </Button>
            {configured && (
              <Button
                size="sm"
                variant="ghost"
                onClick={removeKey}
                disabled={removing}
                aria-label={t('apiKeys.eliminar')}
                className="rounded-lg text-muted-foreground hover:text-destructive"
              >
                {removing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        )}
      </div>

      {editing && (
        <div className="mt-3 space-y-3">
          <div className="relative">
            <Input
              type={visible ? 'text' : 'password'}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={provider.keyFormatHint}
              className="pr-12 font-mono text-xs"
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
            />
            <button
              type="button"
              onClick={() => setVisible((current) => !current)}
              aria-label={t('apiKeys.mostrarOcultar')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 hover:bg-muted"
            >
              {visible ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>

          {validation && (
            <div
              className={cn(
                'flex items-start gap-2 rounded-lg border p-2.5 font-body text-sm',
                validation.ok
                  ? 'border-saffron/30 bg-saffron/10 text-foreground'
                  : 'border-destructive/30 bg-destructive/10 text-destructive',
              )}
            >
              {validation.ok ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <span>{validationMessage()}</span>
            </div>
          )}

          {saveErrorKey && (
            <div className="rounded-lg border-2 border-coral/50 bg-coral/10 p-2.5">
              <p className="font-body text-xs text-foreground">
                {t(saveErrorKey)}
              </p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => testKey(value.trim())}
              disabled={testing || value.trim().length === 0}
              className="rounded-lg font-display"
            >
              {testing && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
              {t('apiKeys.probar')}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => saveKey(value.trim(), closeEditor)}
              disabled={saving || value.trim().length === 0}
              className="rounded-lg bg-saffron font-display font-bold text-charcoal hover:bg-saffron/90"
            >
              {saving && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
              {t('apiKeys.guardar')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={closeEditor}
              className="rounded-lg font-display"
            >
              {t('apiKeys.cancelar')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
