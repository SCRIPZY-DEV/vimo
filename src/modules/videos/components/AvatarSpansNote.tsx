import { useTranslation } from 'react-i18next'
import { UserRound } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { formatUsd } from '@/modules/common/utilities/formatUsd'
import { avatarSpansCostEstimate } from '@/modules/videos/utilities/avatarCostEstimate'
import { avatarSpansLabel } from '@/modules/videos/utilities/avatarSpansLabel'
import type { AvatarLookType } from '@pipeline/types/avatar.ts'
import type { AvatarSpanView } from '@/modules/videos/types/create'

interface AvatarSpansNoteProps {
  // Los tramos del avatar en la pausa; ausentes = el proyecto no tiene avatar
  // (no se dibuja nada) y vacíos = ninguna aparición entró en la narración.
  spans?: AvatarSpanView[]
  // Cuántas apariciones pedidas no entraron (`avatar-planned`); ausente si no
  // se sabe (una pausa guardada antes de que se contaran).
  dropped?: number
  // El tipo del look elegido: con su tarifa, la línea suma lo que cobra HeyGen
  // por estos tramos. Sin él (un proyecto reabierto sin ese dato) no se dice.
  lookType?: AvatarLookType
  className?: string
}

// La línea de la pausa de escenas que dice dónde sale el avatar (spec §6.1),
// lo que cuesta y cuántas apariciones no entraron: cambiar la cantidad o los
// segundos solo reparte las escenas libres, así que estos tramos no se mueven
// y su costo ya es el real (con la cola absorbida, a la tarifa de Crear y de
// la fase). Si no entró ninguna, lo dice antes de que se paguen las imágenes,
// con la salida (cancelar y acortar las apariciones, o alargar la narración).
// Presentacional; sin avatar no dibuja nada.
export function AvatarSpansNote({
  spans,
  dropped,
  lookType,
  className,
}: AvatarSpansNoteProps) {
  const { t, i18n } = useTranslation()

  if (!spans) return null

  const boxClass = cn(
    'flex items-start gap-2 rounded-lg border p-2.5 font-body text-sm text-foreground',
    className,
  )

  if (spans.length === 0) {
    return (
      <p className={cn(boxClass, 'border-coral/50 bg-coral/10')}>
        <UserRound aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-coral" />
        <span>
          {dropped
            ? t('create.confirmScenes.avatarNoneFits', { count: dropped })
            : t('create.confirmScenes.avatarNoneFitsUncounted')}
        </span>
      </p>
    )
  }

  const language = i18n.resolvedLanguage ?? 'es'
  const cost = lookType ? avatarSpansCostEstimate(lookType, spans) : null

  return (
    <p className={cn(boxClass, 'border-amethyst/40 bg-amethyst/10')}>
      <UserRound
        aria-hidden
        className="mt-0.5 h-4 w-4 shrink-0 text-amethyst"
      />
      <span>
        {t('create.confirmScenes.avatarLine', {
          count: spans.length,
          ranges: avatarSpansLabel(spans, language),
        })}
        {dropped !== undefined && dropped > 0 && (
          <span className="mt-0.5 block text-xs text-coral">
            {t('create.confirmScenes.avatarDropped', { count: dropped })}
          </span>
        )}
        {cost && (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {t('create.confirmScenes.avatarCost', {
              amount: formatUsd(cost.estimated, language),
            })}
          </span>
        )}
      </span>
    </p>
  )
}
