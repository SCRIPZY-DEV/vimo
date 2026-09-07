import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Sparkles, X } from 'lucide-react'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import { LabeledProgress } from '@/modules/common/components/LabeledProgress'
import { Button } from '@/modules/common/ui/button'
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/modules/common/ui/dialog'
import { Label } from '@/modules/common/ui/label'
import { Textarea } from '@/modules/common/ui/textarea'
import { cn } from '@/modules/common/utilities/cn'
import { voicesApi } from '@/modules/voices/api'
import { AudioPlayer } from '@/modules/common/components/AudioPlayer'
import { VoiceSettingsPanel } from '@/modules/voices/components/VoiceSettingsPanel'
import {
  DEFAULT_VOICE_MODELS,
  VOICE_COST_FACTORS,
  VOICE_MODELS,
  VOICE_SETTINGS_DEFAULTS,
  VOICE_TEXT_LIMITS,
} from '@/modules/voices/constants'
import { useVoiceTask } from '@/modules/voices/hooks/useVoiceTask'
import { settingsForProvider } from '@/modules/voices/utilities/settingsToWire'
import type { VoiceSummary } from '@pipeline/types/voices.ts'
import type { VoiceSettingsFormValue } from '@/modules/voices/types/voices'

interface VoiceTesterPanelProps {
  voice: VoiceSummary
  disabled: boolean
}

/**
 * El probador de voz: texto + modelo + ajustes → job generate-voice con
 * progreso y cancelación. El resultado queda guardado en el historial local.
 * Se abre en un Dialog centrado al elegir una voz; el padre lo remonta (key
 * por provider) al cambiar de motor, así el modelo y los ajustes vuelven a los
 * defaults del provider activo.
 */
export function VoiceTesterPanel({ voice, disabled }: VoiceTesterPanelProps) {
  const { t } = useTranslation()
  const { task, startGeneration, discardTask } = useVoiceTask()

  const [text, setText] = useState('')
  const [model, setModel] = useState<string | null>(null)
  const [settings, setSettings] = useState<VoiceSettingsFormValue>(
    VOICE_SETTINGS_DEFAULTS,
  )

  const generating = task?.status === 'generating'
  const entry = task?.status === 'completed' ? task.entry : null
  const errorKey = task?.errorKey ?? null

  const textLimit = VOICE_TEXT_LIMITS[voice.provider]
  const models = VOICE_MODELS[voice.provider]
  const activeModel = model ?? DEFAULT_VOICE_MODELS[voice.provider]
  const estimatedCredits = Math.ceil(
    text.length * VOICE_COST_FACTORS[voice.provider],
  )

  const generate = () => {
    void startGeneration({
      provider: voice.provider,
      voiceId: voice.voiceId,
      voiceName: voice.name,
      text,
      model: activeModel,
      settings: settingsForProvider(voice.provider, settings),
    })
  }

  return (
    <section
      className={cn('space-y-4', disabled && 'pointer-events-none opacity-60')}
    >
      <DialogHeader>
        <DialogTitle className="font-display text-xl font-extrabold text-foreground">
          {t('voices.probador.titulo')}
        </DialogTitle>
        <DialogDescription className="font-body">
          {t('voices.probador.vozElegida', { name: voice.name })}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-1.5">
        <Label htmlFor="voice-text" className="font-display">
          {t('voices.probador.texto')}
        </Label>
        <Textarea
          id="voice-text"
          value={text}
          maxLength={textLimit}
          disabled={generating}
          onChange={(event) => setText(event.target.value)}
          placeholder={t('voices.probador.placeholder')}
          rows={4}
        />
        <div className="flex items-center justify-between font-body text-xs text-muted-foreground">
          <span>
            {t('voices.probador.costoEstimado', { n: estimatedCredits })}
          </span>
          <span className="tabular-nums">
            {t('voices.probador.limiteTexto', {
              chars: text.length,
              limit: textLimit,
            })}
          </span>
        </div>
      </div>

      {models.length > 1 && (
        <div className="space-y-1.5">
          <p className="font-display text-sm font-bold text-foreground">
            {t('voices.probador.modelo')}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {models.map((option) => {
              const selected = option.id === activeModel
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={generating}
                  onClick={() => setModel(option.id)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 font-display text-xs font-bold transition-colors',
                    selected
                      ? 'border-saffron bg-saffron text-charcoal'
                      : 'border-border bg-card text-muted-foreground hover:border-saffron/40 hover:text-foreground',
                  )}
                >
                  {option.label}
                  {option.badgeKey && (
                    <span className="ml-1 font-body font-normal opacity-70">
                      · {t(option.badgeKey)}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <VoiceSettingsPanel
        provider={voice.provider}
        value={settings}
        onChange={setSettings}
        disabled={generating}
      />

      <div className="flex items-center gap-2">
        <Button
          size="lg"
          onClick={generate}
          disabled={generating || !text.trim()}
          className="rounded-xl bg-saffron font-display font-bold text-charcoal hover:bg-saffron/90"
        >
          {generating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          {generating
            ? t('voices.probador.generando')
            : t('voices.probador.generar')}
        </Button>
        {generating && (
          <Button
            variant="ghost"
            size="lg"
            onClick={discardTask}
            className="rounded-xl font-display text-muted-foreground"
          >
            <X className="mr-1.5 h-4 w-4" />
            {t('voices.probador.cancelar')}
          </Button>
        )}
      </div>

      {generating && task && (
        <LabeledProgress
          className="space-y-2"
          label={
            task.elapsedSeconds !== null
              ? t('voices.probador.progresoSegundos', {
                  seconds: task.elapsedSeconds,
                })
              : t('voices.probador.generando')
          }
          percent={task.progressPercent}
        />
      )}

      {errorKey && <ErrorMessage>{t(errorKey)}</ErrorMessage>}

      {entry && (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-display text-sm font-bold text-foreground">
              {t('voices.probador.resultado')}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={discardTask}
              className="h-7 rounded-lg font-display text-xs text-muted-foreground"
            >
              <X className="mr-1 h-3 w-3" />
              {t('voices.probador.cerrar')}
            </Button>
          </div>
          <AudioPlayer src={voicesApi.audioSource(entry.audioPath)} />
          <p className="font-body text-xs text-muted-foreground">
            {t('voices.probador.guardada')}
          </p>
        </div>
      )}
    </section>
  )
}
