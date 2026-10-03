import { useTranslation } from 'react-i18next'
import { Check, Pencil, Sparkles, Trash2 } from 'lucide-react'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/modules/common/ui/dropdown-menu'
import { videosApi } from '@/modules/videos/api'
import { GemAdaptationProgress } from '@/modules/videos/components/GemAdaptationProgress'
import { StyleCardFrame } from '@/modules/videos/components/StyleCardFrame'
import { useGemAdaptationProgress } from '@/modules/videos/hooks/useGemAdaptationProgress'
import { gemCharCount } from '@/modules/videos/utilities/gemTemplate'
import type { GemMigrationState } from '@/modules/videos/types/styles'
import type { CustomStyleSummary } from '@pipeline/types/styles.ts'

interface CustomStyleCardProps {
  style: CustomStyleSummary
  selected: boolean
  disabled: boolean
  // Adaptación de esta gema a la plantilla (ADR-0048); null = ninguna. En
  // vuelo, la tarjeta se atenúa y muestra el avance encima.
  migration: GemMigrationState | null
  onSelect: () => void
  onEdit: () => void
  onGenerateSamples: () => void
  onDelete: () => void
}

// Tarjeta de un estilo propio: el cascarón de StyleCardFrame con las muestras
// guardadas, el avance de la adaptación encima mientras corre y el menú de Mi
// estilo (usar, ver y editar, generar muestras, eliminar).
export function CustomStyleCard({
  style,
  selected,
  disabled,
  migration,
  onSelect,
  onEdit,
  onGenerateSamples,
  onDelete,
}: CustomStyleCardProps) {
  const { t } = useTranslation()
  // La adaptación en vuelo, con su porcentaje estimado por tiempo.
  const adapting = migration?.status === 'pending' ? migration : null
  const adaptationPercent = useGemAdaptationProgress(adapting)
  const images = style.samples.map((sample) =>
    videosApi.imageSource(sample.path, sample.mtimeMs),
  )

  return (
    <StyleCardFrame
      images={images}
      name={style.name}
      noSamplesText={t('create.customStyles.noSamples')}
      menuLabel={t('create.customStyles.menuAria', { name: style.name })}
      selected={selected}
      disabled={disabled}
      dimmed={adapting !== null}
      overlay={
        adapting &&
        adaptationPercent !== null && (
          <GemAdaptationProgress
            phase={adapting.phase}
            percent={adaptationPercent}
          />
        )
      }
      menu={
        <>
          <DropdownMenuItem disabled={selected} onSelect={onSelect}>
            <Check className="mr-2 h-4 w-4" />
            {selected
              ? t('create.customStyles.alreadyInUse')
              : t('create.customStyles.useInVideo')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil className="mr-2 h-4 w-4" />
            {t('create.customStyles.edit')}
          </DropdownMenuItem>
          {/* Con la adaptación en vuelo el modal no genera (su editor queda
              quieto hasta que se guarden las secciones). */}
          <DropdownMenuItem
            disabled={adapting !== null}
            onSelect={onGenerateSamples}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {t('create.customStyles.generateSamples')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={onDelete}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t('create.customStyles.delete')}
          </DropdownMenuItem>
        </>
      }
      footer={
        <>
          <p className="truncate font-display text-base font-bold text-foreground">
            {style.name}
          </p>
          <p className="truncate font-body text-xs text-muted-foreground">
            {t('create.customStyles.charsCount', {
              chars: gemCharCount(style).toLocaleString(),
            })}
          </p>
        </>
      }
      onSelect={onSelect}
    />
  )
}
