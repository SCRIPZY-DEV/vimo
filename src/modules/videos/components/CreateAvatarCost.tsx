import { useTranslation } from 'react-i18next'
import { Coins } from 'lucide-react'
import { formatUsd } from '@/modules/common/utilities/formatUsd'
import {
  avatarCostEstimate,
  avatarRatePerMinute,
  createAvatarSeconds,
} from '@/modules/videos/utilities/avatarCostEstimate'
import type { CreateFormValue } from '@/modules/videos/types/create'

interface CreateAvatarCostProps {
  value: CreateFormValue
}

// Lo que va a cobrar HeyGen por las apariciones (spec §9): segundos totales
// × la tarifa de Avatar III del tipo del look elegido. Es la misma cifra que
// el pre-check compara con el saldo (estimateCreateCost); las escenas de
// avatar no suman imágenes (§6.2). Presentacional.
export function CreateAvatarCost({ value }: CreateAvatarCostProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'es'
  const seconds = createAvatarSeconds(value)
  const line = value.avatar
    ? avatarCostEstimate(value.avatar.lookType, seconds)
    : null
  const rate = value.avatar ? avatarRatePerMinute(value.avatar.lookType) : null

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
        {t('create.avatar.total', { count: value.avatarAppearances, seconds })}
      </p>
      {rate !== null && (
        <p className="mt-1 font-body text-xs text-muted-foreground">
          <span className="font-semibold">{t('create.avatar.engine')}</span>{' '}
          {t('create.avatar.pricePerMinute', {
            price: formatUsd(rate, language),
          })}
        </p>
      )}
    </div>
  )
}
