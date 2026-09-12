import { useTranslation } from 'react-i18next'
import { UserRound } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { CHARACTER_FREQUENCIES } from '@/modules/videos/constants'
import type { CharacterFrequency } from '@pipeline/types/video-project.ts'

interface CharacterFrequencyPickerProps {
  value: CharacterFrequency
  disabled: boolean
  onChange: (value: CharacterFrequency) => void
}

// ¿Cada cuánto aparece tu personaje? Dos niveles en tarjeta saffron, con el
// porcentaje debajo de cada uno (port del bloque de EditorGuion del origen,
// v0.61.0). Presentacional: el nivel vive en el formulario. Solo aplica al
// estilo de CATÁLOGO — con «Mi estilo» el carril verbatim ni siquiera mira la
// frecuencia (ADR-0019), así que la pregunta no se ofrece.
export function CharacterFrequencyPicker({
  value,
  disabled,
  onChange,
}: CharacterFrequencyPickerProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-2 rounded-xl border-2 border-saffron/40 bg-saffron/5 p-3">
      <p className="flex items-center gap-2 font-display text-sm font-bold text-foreground">
        <UserRound className="h-4 w-4 shrink-0 text-saffron" />
        {t('create.characters.frequency.label')}
      </p>
      <p className="font-body text-xs text-muted-foreground">
        {t('create.characters.frequency.hint')}
      </p>

      <div className="grid grid-cols-2 gap-1.5">
        {CHARACTER_FREQUENCIES.map(({ id, labelKey, percentKey }) => {
          const active = id === value
          return (
            <button
              key={id}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onChange(id)}
              className={cn(
                'flex flex-col items-center gap-0.5 rounded-lg border-2 px-1.5 py-2 font-display text-xs font-semibold transition-all',
                active
                  ? 'border-saffron bg-saffron text-charcoal'
                  : 'border-border bg-card hover:border-saffron/40',
                disabled && 'opacity-60',
              )}
            >
              <span className="leading-tight">{t(labelKey)}</span>
              <span
                className={cn(
                  'font-body text-[10px] font-normal leading-none',
                  active ? 'text-charcoal/70' : 'text-muted-foreground',
                )}
              >
                {t(percentKey)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
