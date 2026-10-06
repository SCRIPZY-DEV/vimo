import { useTranslation } from 'react-i18next'
import type { SampleGenerationState } from '@/modules/videos/hooks/useStyleSampleGeneration'

interface SampleGenerationProgressProps {
  job: SampleGenerationState
  // Ids de las muestras que se esperan (1..N).
  sampleIds: readonly number[]
  // El nombre del estilo, para el alt de cada muestra que va llegando.
  name: string
}

// Mientras se generan, las muestras se ven como tarjetas cargando con su barra
// y su %: Evolink el real del poll, Fal la estimación del sidecar. Lo
// comparten el modal de Mi estilo y el del catálogo del admin (ADR-0049).
export function SampleGenerationProgress({
  job,
  sampleIds,
  name,
}: SampleGenerationProgressProps) {
  const { t } = useTranslation()
  const writing = job.phase !== 'images'

  return (
    <div className="grid grid-cols-2 gap-3">
      {sampleIds.map((id) => {
        const percent =
          (writing ? job.promptPercents[id] : job.samplePercents[id]) ?? 0
        const image = job.sampleImages[id]
        return (
          <div
            key={id}
            className="relative flex aspect-video flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-border bg-muted/60 px-5"
          >
            {image && (
              <img
                src={image}
                alt={t('create.customStyles.sampleAlt', { number: id, name })}
                className="absolute inset-0 h-full w-full object-contain"
              />
            )}
            <span className="absolute left-2.5 top-2 font-display text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              {t('create.customStyles.sampleLabel', { id })}
            </span>
            {!image && (
              <p className="font-body text-xs text-muted-foreground">
                <SampleProgressText writing={writing} percent={percent} />
              </p>
            )}
            {!image && (
              <div className="h-1.5 w-full max-w-[180px] overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-saffron transition-all duration-500"
                  style={{ width: `${Math.max(4, percent)}%` }}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

interface SampleProgressTextProps {
  writing: boolean
  percent: number
}

// Qué dice cada tarjeta de muestra mientras se genera.
function SampleProgressText({ writing, percent }: SampleProgressTextProps) {
  const { t } = useTranslation()

  if (writing) return t('create.customStyles.writingPrompts')
  if (percent >= 100) return t('create.customStyles.sampleReady')
  return t('create.customStyles.sampleGenerating', { percent })
}
