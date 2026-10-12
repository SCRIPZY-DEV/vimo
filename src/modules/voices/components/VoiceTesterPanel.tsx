import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Sparkles, X } from 'lucide-react'
import { apiKeysApi } from '@/modules/api-keys/api'
import { ErrorMessage } from '@/modules/common/components/ErrorMessage'
import { InsufficientCreditsAlert } from '@/modules/common/components/InsufficientCreditsAlert'
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
import { LongTextNotice } from '@/modules/common/components/LongTextNotice'
import { VoiceSettingsPanel } from '@/modules/voices/components/VoiceSettingsPanel'
import { EstimatedCostBadge } from '@/modules/voices/components/EstimatedCostBadge'
import {
  DEFAULT_VOICE_MODELS,
  VOICE_MODELS,
  VOICE_SETTINGS_DEFAULTS,
  VOICE_TEXT_LIMIT,
} from '@/modules/voices/constants'
import { useAddLibraryVoice } from '@/modules/voices/hooks/useAddLibraryVoice'
import { useVoiceTask } from '@/modules/voices/hooks/useVoiceTask'
import { estimateVoiceCost } from '@/modules/voices/utilities/estimateVoiceCost'
import { settingsForProvider } from '@/modules/voices/utilities/settingsToWire'
import { voiceShortfallLine } from '@/modules/voices/utilities/voiceShortfallLine'
import { taskBelongsToVoice } from '@/modules/voices/utilities/taskBelongsToVoice'
import type {
  VoiceCreditsResult,
  VoiceSummary,
} from '@pipeline/types/voices.ts'
import type {
  VoiceSettingsFormValue,
  VoiceTask,
} from '@/modules/voices/types/voices'
import type { TFunction } from 'i18next'

// Etiqueta de la barra: con texto troceado dice en qué parte va.
function progressLabel(t: TFunction, task: VoiceTask): string {
  if (task.elapsedSeconds === null) return t('voices.probador.generando')
  if (task.partTotal !== undefined && task.partIndex !== undefined)
    return t('voices.probador.progresoPartes', {
      part: task.partIndex,
      total: task.partTotal,
      seconds: task.elapsedSeconds,
    })
  return t('voices.probador.progresoSegundos', { seconds: task.elapsedSeconds })
}

interface VoiceTesterPanelProps {
  voice: VoiceSummary
  disabled: boolean
  // Saldo del vendor de la voz (lo lee la vista): con saldo leído menor al
  // costo del texto el botón se frena y se ofrece recargar (ADR-0031).
  credits: VoiceCreditsResult | null
  onRefreshCredits: () => void
  creditsRefreshing: boolean
}

/**
 * El probador de voz: texto + modelo + ajustes → job generate-voice con
 * progreso y cancelación. El resultado queda guardado en el historial local.
 * Se abre en un Dialog centrado al elegir una voz; el padre lo remonta (key
 * por provider) al cambiar de motor, así el modelo y los ajustes vuelven a los
 * defaults del provider activo.
 * La tarea es un store global que sobrevive al remount: el error y el
 * resultado solo se muestran si la tarea se generó con esta voz; el estado
 * «generando» sí es global porque solo corre un job a la vez.
 */
export function VoiceTesterPanel({
  voice,
  disabled,
  credits,
  onRefreshCredits,
  creditsRefreshing,
}: VoiceTesterPanelProps) {
  const { t } = useTranslation()
  const { task, startGeneration, discardTask } = useVoiceTask()
  const {
    addLibraryVoice,
    adding,
    errorKey: addErrorKey,
    reset: resetAddLibraryVoice,
  } = useAddLibraryVoice()

  const [text, setText] = useState('')
  const [model, setModel] = useState<string | null>(null)
  const [settings, setSettings] = useState<VoiceSettingsFormValue>(
    VOICE_SETTINGS_DEFAULTS,
  )

  const generating = task?.status === 'generating' || adding
  const ownTask = taskBelongsToVoice(task, voice) ? task : null
  const otherTaskGenerating = generating && !adding && !ownTask
  const entry = ownTask?.status === 'completed' ? ownTask.entry : null
  const errorKey = addErrorKey ?? ownTask?.errorKey ?? null

  const models = VOICE_MODELS[voice.provider]
  const activeModel = model ?? DEFAULT_VOICE_MODELS[voice.provider]

  const shortfall =
    text.trim().length > 0
      ? voiceShortfallLine(
          voice.provider,
          estimateVoiceCost(voice.provider, text.length),
          credits,
        )
      : null
  const insufficient = shortfall?.sufficient === false

  // Una voz de la biblioteca pública de ElevenLabs se añade a la cuenta
  // ANTES de generar; lo que se sintetiza (y queda en el historial) es la
  // voz de cuenta que devuelve.
  const generate = async () => {
    if (disabled) return
    resetAddLibraryVoice()
    let voiceId = voice.voiceId
    if (voice.libraryOwnerId) {
      try {
        voiceId = await addLibraryVoice({
          libraryOwnerId: voice.libraryOwnerId,
          voiceId: voice.voiceId,
          name: voice.name,
        })
      } catch {
        return
      }
    }

    void startGeneration({
      provider: voice.provider,
      voiceId,
      voiceName: voice.name,
      text,
      model: activeModel,
      settings: settingsForProvider(voice.provider, settings),
    })
  }

  return (
    <section className={cn('space-y-4', disabled && 'opacity-60')}>
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
          maxLength={VOICE_TEXT_LIMIT}
          disabled={generating}
          onChange={(event) => setText(event.target.value)}
          placeholder={t('voices.probador.placeholder')}
          rows={6}
        />
        <div className="flex items-center justify-between gap-2">
          <EstimatedCostBadge
            provider={voice.provider}
            characters={text.length}
          />
          <span className="font-body text-xs tabular-nums text-muted-foreground">
            {t('voices.probador.limiteTexto', {
              chars: text.length,
              limit: VOICE_TEXT_LIMIT,
            })}
          </span>
        </div>
        <LongTextNotice characters={text.length} />
        {insufficient && shortfall && (
          <InsufficientCreditsAlert
            lines={[shortfall]}
            blocking
            onReload={(providerId) =>
              void apiKeysApi.openBillingPage(providerId)
            }
            onRefresh={onRefreshCredits}
            refreshing={creditsRefreshing}
          />
        )}
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
          onClick={() => void generate()}
          disabled={disabled || generating || !text.trim() || insufficient}
          className="rounded-xl bg-saffron font-display font-bold text-charcoal hover:bg-saffron/90"
        >
          {generating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          {adding
            ? t('voices.probador.anadiendoVoz')
            : generating
              ? t('voices.probador.generando')
              : t('voices.probador.generar')}
        </Button>
        {generating && !adding && (
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

      {generating && !adding && task && (
        <LabeledProgress
          className="space-y-2"
          label={progressLabel(t, task)}
          percent={task.progressPercent}
        />
      )}

      {otherTaskGenerating && (
        <p className="font-body text-xs text-muted-foreground">
          {t('voices.probador.otraGeneracionEnCurso', {
            name: task?.request.voiceName ?? task?.request.voiceId,
          })}
        </p>
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
