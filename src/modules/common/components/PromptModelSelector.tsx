import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Wallet } from 'lucide-react'
import { PriceCell } from '@/modules/common/components/PriceCell'
import { cn } from '@/modules/common/utilities/cn'
import {
  PRICE_BANDS,
  PRICE_LEVELS,
  SIMULATOR_SCENES_DEFAULT,
  SIMULATOR_SCENES_MAX,
  SIMULATOR_SCENES_MIN,
  SIMULATOR_SCENES_STEP,
  estimatePromptCost,
  priceBand,
} from '@/modules/common/utilities/promptCost'
import type { LlmModelProfile, ModelSpeed } from '@pipeline/types/llm-models.ts'

interface PromptModelSelectorProps {
  models: LlmModelProfile[]
  // Modelo elegido (id). El padre ya resolvió el default cuando no hay uno.
  value: string
  // Caracteres de la gema en uso: viaja en CADA pedido, así que un estilo
  // largo encarece el video.
  gemChars: number
  batchSize?: number
  // ¿La gema hace correr la fase del personaje? Solo con «genérico».
  withCharacterPhase: boolean
  disabled: boolean
  onChange: (modelId: string) => void
}

const SPEED_BADGE_CLASS: Record<ModelSpeed, string> = {
  fast: 'border-ocean/40 bg-ocean/10 text-ocean',
  medium: 'border-saffron/50 bg-saffron/15 text-saffron',
  slow: 'border-destructive/40 bg-destructive/10 text-destructive',
}

const SPEED_LABEL_KEY: Record<ModelSpeed, string> = {
  fast: 'create.promptModel.speed.fast',
  medium: 'create.promptModel.speed.medium',
  slow: 'create.promptModel.speed.slow',
}

// Proyecta UNA sola vez lo que el simulador necesita del perfil: la banda y
// la cifra salen de la misma cuenta y nunca se contradicen.
function forSimulator(model: LlmModelProfile) {
  return {
    pricing: model.pricing,
    serviceTier: model.serviceTier,
    outputFactor: model.outputFactor,
  }
}

// La escala de precio como puntos llenos (●○○ / ●●○ / ●●●): dice «esta es la
// barata» sin una frase que pueda quedar desactualizada.
function PriceScale({ level }: { level: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      {Array.from({ length: PRICE_LEVELS }, (_, index) => (
        <span
          key={index}
          className={cn(
            'h-2 w-2 rounded-full',
            index < level ? 'bg-saffron' : 'bg-border',
          )}
        />
      ))}
    </span>
  )
}

// Port reducido de SelectorModeloPrompts del origen: tarjetas agrupadas por
// banda de precio + simulador de costo del elegido. Sin el «modelo de
// siempre» (decisión de la rama 11: se recuerda la última elección).
export function PromptModelSelector({
  models,
  value,
  gemChars,
  batchSize,
  withCharacterPhase,
  disabled,
  onChange,
}: PromptModelSelectorProps) {
  const { t } = useTranslation()
  const [scenesSimulated, setScenesSimulated] = useState(
    SIMULATOR_SCENES_DEFAULT,
  )

  if (models.length === 0) return null

  const chosen = models.find((model) => model.id === value) ?? models[0]!
  const cost = estimatePromptCost({
    scenes: scenesSimulated,
    gemChars,
    batchSize,
    withCharacterPhase,
    ...forSimulator(chosen),
  })

  return (
    <div className="space-y-4">
      <h3 className="font-display text-sm font-bold text-foreground">
        {t('create.promptModel.title')}
      </h3>

      {PRICE_BANDS.map(({ band, labelKey, level }) => {
        const group = models.filter(
          (model) =>
            priceBand({
              scenes: SIMULATOR_SCENES_DEFAULT,
              gemChars,
              batchSize,
              withCharacterPhase,
              ...forSimulator(model),
            }) === band,
        )
        if (group.length === 0) return null

        return (
          <div key={band} className="space-y-2">
            <div className="flex items-center gap-2">
              <PriceScale level={level} />
              <span className="font-display text-xs font-extrabold uppercase tracking-widest text-foreground">
                {t(labelKey)}
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <div className="flex flex-wrap gap-3">
              {group.map((model) => {
                const active = model.id === chosen.id
                return (
                  <button
                    key={model.id}
                    type="button"
                    disabled={disabled}
                    aria-pressed={active}
                    onClick={() => onChange(model.id)}
                    className={cn(
                      'rounded-2xl border-2 px-5 py-3 text-left transition-colors',
                      active
                        ? 'border-saffron bg-saffron/10'
                        : 'border-border bg-card hover:bg-muted',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-display text-base font-extrabold text-foreground">
                        {model.label}
                      </span>
                      <span
                        className={cn(
                          'rounded-full border px-2 py-0.5 font-display text-[10px] font-bold tracking-wide',
                          SPEED_BADGE_CLASS[model.speed],
                        )}
                      >
                        {t(SPEED_LABEL_KEY[model.speed])}
                      </span>
                    </div>
                    <span className="font-body text-sm text-muted-foreground">
                      {model.author}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* El simulador va solo para el elegido: son datos largos que,
          repetidos en cada tarjeta, no se leen. El slider deja probar de 100 a
          600 escenas porque el costo NO es proporcional (la gema y el guion
          viajan en cada lote) y ver la curva es justamente el punto. */}
      <div className="space-y-3 rounded-xl border-2 border-saffron/40 bg-gradient-to-br from-saffron/15 to-coral/10 p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-saffron/30">
              <Wallet className="h-5 w-5 text-saffron" />
            </div>
            <div>
              <p className="font-body text-[11px] uppercase tracking-wide text-muted-foreground">
                {t('create.promptModel.simulatorTitle')}
              </p>
              <p className="font-display text-base font-extrabold leading-tight text-foreground">
                {t('create.promptModel.simulatorScenes', {
                  count: scenesSimulated,
                  model: chosen.label,
                })}
              </p>
            </div>
          </div>
          {cost === null ? (
            <span className="max-w-52 text-right font-body text-sm text-muted-foreground">
              {t('create.promptModel.noPrice')}
            </span>
          ) : (
            <span className="flex items-baseline gap-1 font-display text-2xl font-extrabold text-saffron">
              ≈ <PriceCell usd={cost} highlighted className="text-2xl" />
            </span>
          )}
        </div>

        <input
          type="range"
          min={SIMULATOR_SCENES_MIN}
          max={SIMULATOR_SCENES_MAX}
          step={SIMULATOR_SCENES_STEP}
          value={scenesSimulated}
          disabled={disabled}
          onChange={(event) => setScenesSimulated(Number(event.target.value))}
          aria-label={t('create.promptModel.sliderLabel')}
          className="w-full accent-saffron"
        />
        <div className="flex justify-between font-display text-xs font-bold text-muted-foreground">
          <span>
            {t('create.promptModel.scenesCount', {
              count: SIMULATOR_SCENES_MIN,
            })}
          </span>
          <span>
            {t('create.promptModel.scenesCount', {
              count: SIMULATOR_SCENES_MAX,
            })}
          </span>
        </div>

        <p className="font-body text-xs text-muted-foreground">
          {t('create.promptModel.onlyPrompts')}
        </p>
      </div>
    </div>
  )
}
