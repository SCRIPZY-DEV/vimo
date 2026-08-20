import { useTranslation } from 'react-i18next'
import { Search, X } from 'lucide-react'
import { Input } from '@/modules/common/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/modules/common/ui/select'
import { Switch } from '@/modules/common/ui/switch'
import { cn } from '@/modules/common/utilities/cn'
import { VOICE_LANGUAGE_FILTER_CODES } from '@/modules/voices/constants'
import type { VoiceProviderId } from '@pipeline/types/voices.ts'
import type { VoiceFilterState } from '@/modules/voices/types/voices'

// Radix Select no acepta '' como value de un item: 'all' es el centinela.
const ALL_VALUE = 'all'

interface VoiceFiltersProps {
  provider: VoiceProviderId
  value: VoiceFilterState
  onChange: (value: VoiceFilterState) => void
  // Opciones derivadas de las voces cargadas (solo ElevenLabs las muestra).
  accents: string[]
  categories: string[]
}

export function VoiceFilters({
  provider,
  value,
  onChange,
  accents,
  categories,
}: VoiceFiltersProps) {
  const { t } = useTranslation()

  const patch = (partial: Partial<VoiceFilterState>) => {
    onChange({ ...value, ...partial })
  }
  const fromSelect = (selected: string) =>
    selected === ALL_VALUE ? '' : selected

  const genders = ['', 'male', 'female'] as const

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-52 flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value.search}
          onChange={(event) => patch({ search: event.target.value })}
          placeholder={t('voices.filtros.buscar')}
          className="pl-9 pr-9"
        />
        {value.search && (
          <button
            type="button"
            onClick={() => patch({ search: '' })}
            aria-label={t('voices.filtros.limpiar')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <Select
        value={value.language || ALL_VALUE}
        onValueChange={(selected) => patch({ language: fromSelect(selected) })}
      >
        <SelectTrigger className="w-40" aria-label={t('voices.filtros.idioma')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>
            {t('voices.filtros.todosIdiomas')}
          </SelectItem>
          {VOICE_LANGUAGE_FILTER_CODES.map((code) => (
            <SelectItem key={code} value={code}>
              {t(`voices.filtros.idiomas.${code}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1">
        {genders.map((gender) => {
          const selected = value.gender === gender
          return (
            <button
              key={gender || ALL_VALUE}
              type="button"
              onClick={() => patch({ gender })}
              className={cn(
                'rounded-full border px-3 py-1.5 font-display text-xs font-bold transition-colors',
                selected
                  ? 'border-saffron bg-saffron text-charcoal'
                  : 'border-border bg-card text-muted-foreground hover:border-saffron/40 hover:text-foreground',
              )}
            >
              {gender
                ? t(`voices.filtros.genero.${gender}`)
                : t('voices.filtros.genero.todos')}
            </button>
          )
        })}
      </div>

      {provider === 'elevenlabs' && accents.length > 0 && (
        <Select
          value={value.accent || ALL_VALUE}
          onValueChange={(selected) => patch({ accent: fromSelect(selected) })}
        >
          <SelectTrigger
            className="w-40"
            aria-label={t('voices.filtros.acento')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>
              {t('voices.filtros.todosAcentos')}
            </SelectItem>
            {accents.map((accent) => (
              <SelectItem key={accent} value={accent}>
                {accent}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {provider === 'elevenlabs' && categories.length > 0 && (
        <Select
          value={value.category || ALL_VALUE}
          onValueChange={(selected) =>
            patch({ category: fromSelect(selected) })
          }
        >
          <SelectTrigger
            className="w-40"
            aria-label={t('voices.filtros.categoria')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>
              {t('voices.filtros.todasCategorias')}
            </SelectItem>
            {categories.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {provider === 'minimax' && (
        <label className="flex cursor-pointer items-center gap-2 font-body text-sm text-muted-foreground">
          <Switch
            checked={value.onlyClones}
            onCheckedChange={(checked) => patch({ onlyClones: checked })}
          />
          {t('voices.filtros.soloClones')}
        </label>
      )}
    </div>
  )
}
