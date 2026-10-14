import { useTranslation } from 'react-i18next'
import { Coins } from 'lucide-react'
import { formatUsd } from '@/modules/common/utilities/formatUsd'
import { AVATAR_ENGINE_LABEL_KEYS } from '@/modules/videos/constants'
import {
  avatarCostEstimate,
  avatarRatePerMinute,
  createAvatarAppearances,
  createAvatarSeconds,
} from '@/modules/videos/utilities/avatarCostEstimate'
import { selectedAvatarEngine } from '@/modules/videos/utilities/selectableAvatar'
import type { CreateFormValue } from '@/modules/videos/types/create'

interface CreateAvatarCostProps {
  value: CreateFormValue
}

// Lo que va a cobrar HeyGen por las apariciones (spec §9): segundos totales
// × la tarifa del motor con el que sale el look elegido (entrega 2e, §21.3: el
// que prefiere la persona si el look lo admite; si no, el de reemplazo), que
// la tarjeta nombra junto a su precio por minuto. Es la misma cifra que el
// pre-check compara con el saldo (estimateCreateCost); las escenas de avatar
// no suman imágenes (§6.2). Con «3 veces en 2 minutos» (entrega 2f) cuenta las
// apariciones y los segundos que salen de verdad, no solo lo que mueven los
// controles. Debajo, cuándo se cobra (entrega 2h, spec §24.2): el avatar se
// genera junto con las imágenes y se cobra apenas empieza. La tarjeta solo
// se monta con el avatar encendido. Presentacional.
export function CreateAvatarCost({ value }: CreateAvatarCostProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'es'
  const appearances = createAvatarAppearances(value)
  const seconds = createAvatarSeconds(value)
  const engine = selectedAvatarEngine(value)
  const line =
    value.avatar && engine
      ? avatarCostEstimate(value.avatar.lookType, seconds, engine)
      : null
  const rate =
    value.avatar && engine
      ? avatarRatePerMinute(value.avatar.lookType, engine)
      : null

  return (
    <div
      role="note"
      aria-label={t('create.avatar.costTitle')}
      className="rounded-lg border border-amethyst/40 bg-amethyst/10 p-3"
    >
      <p className="flex items-center gap-1.5 font-display text-xs font-semibold text-foreground">
        <Coins aria-hidden className="h-3.5 w-3.5 text-amethyst" />
        {t('create.avatar.costTitle')}
      </p>
      <p className="mt-1 font-display text-lg font-bold tabular-nums text-foreground">
        {line
          ? t('create.avatar.cost', {
              amount: formatUsd(line.estimated, language),
            })
          : t('create.avatar.costPending')}
      </p>
      <p className="mt-1 font-body text-xs text-muted-foreground">
        {t('create.avatar.total', { count: appearances, seconds })}
      </p>
      {engine && rate !== null && (
        <p className="mt-1 font-body text-xs text-muted-foreground">
          <span className="font-semibold">
            {t(AVATAR_ENGINE_LABEL_KEYS[engine])}
          </span>{' '}
          {t('create.avatar.pricePerMinute', {
            price: formatUsd(rate, language),
          })}
        </p>
      )}
      <p className="mt-2 font-body text-xs text-foreground/80">
        {t('create.avatar.chargeTiming')}
      </p>
    </div>
  )
}
