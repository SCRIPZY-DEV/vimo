import { useTranslation } from 'react-i18next'
import { Check, Circle, Loader2 } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { StyleCloneTestImage } from '@/modules/videos/components/StyleCloneTestImage'
import { styleCloneWorkingSteps } from '@/modules/videos/utilities/styleCloneView'
import type {
  StyleCloneSession,
  StyleCloneWorkingStep as WorkingStep,
} from '@/modules/videos/types/styleClone'

interface StyleCloneWorkingStepProps {
  session: StyleCloneSession
}

// El texto de cada paso. El material de imágenes propias no se «baja», y el
// análisis de una aprobación es la redacción del estilo final.
function stepLabelKey(session: StyleCloneSession, step: WorkingStep): string {
  if (step.key === 'material' && session.source.kind === 'images')
    return 'create.styleClone.steps.materialImages'
  if (step.key === 'analysis' && session.action?.kind === 'approve')
    return 'create.styleClone.steps.analysisFinal'
  return `create.styleClone.steps.${step.key}`
}

// Lo que se ve mientras una clonación trabaja: los pasos de la acción en curso
// con el que está corriendo marcado y, mientras se dibuja, las pruebas que van
// saliendo. Se puede cerrar: la sesión sigue. Presentacional.
export function StyleCloneWorkingStep({ session }: StyleCloneWorkingStepProps) {
  const { t } = useTranslation()
  const steps = styleCloneWorkingSteps(session)
  // La ronda que se está dibujando, para verla llegar.
  const drawingDesigns =
    session.status === 'drawing' &&
    (session.action?.kind === 'redraw'
      ? session.action.target === 'designs'
      : session.step === 'character')
  const tests =
    session.status !== 'drawing'
      ? []
      : drawingDesigns
        ? session.designs
        : session.scenes

  return (
    <div className="space-y-4">
      <ul className="space-y-2.5 rounded-xl border border-border bg-muted/30 p-4">
        {steps.map((step) => (
          <li
            key={step.key}
            className={cn(
              'flex items-center gap-2.5 font-body text-sm',
              step.state === 'todo'
                ? 'text-muted-foreground/70'
                : 'text-foreground',
              step.state === 'active' && 'font-semibold',
            )}
          >
            {step.state === 'done' && (
              <Check
                className="h-4 w-4 shrink-0 text-emerald-500"
                strokeWidth={3}
              />
            )}
            {step.state === 'active' && (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-saffron" />
            )}
            {step.state === 'todo' && <Circle className="h-4 w-4 shrink-0" />}
            {t(stepLabelKey(session, step))}
          </li>
        ))}
      </ul>

      {tests.length > 0 && (
        <div
          className={cn(
            'grid gap-2',
            drawingDesigns ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4',
          )}
        >
          {tests.map((test) => (
            <div
              key={test.index}
              className="aspect-video overflow-hidden rounded-lg border border-border bg-muted"
            >
              <StyleCloneTestImage
                test={test}
                alt={String(test.index)}
                working
                fit={drawingDesigns ? 'contain' : 'cover'}
              />
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1 font-body text-xs text-muted-foreground">
        {session.status === 'analyzing' && (
          <p>{t('create.styleClone.analysisHint')}</p>
        )}
        <p>{t('create.styleClone.workingHint')}</p>
      </div>
    </div>
  )
}
