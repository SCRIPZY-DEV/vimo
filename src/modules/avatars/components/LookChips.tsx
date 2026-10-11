import { useTranslation } from 'react-i18next'
import { VIMO_AVATAR_ENGINE } from '@/modules/avatars/constants'
import type { AvatarLookSummary, HeyGenLook } from '@pipeline/types/avatar.ts'

interface LookChipsProps {
  look: HeyGenLook | AvatarLookSummary
}

// Los chips de un look, con la misma regla en su ficha y en su reproductor: el
// tipo, la orientación si la trae y el motor que Vimo usa («Avatar III») o «No
// compatible con Vimo». Mientras se genera todavía no se saben sus motores: «No
// compatible» solo se afirma de un look listo (los del stock público no traen
// `status`: están listos). Son `span`: también van dentro de botones.
// Presentacional.
export function LookChips({ look }: LookChipsProps) {
  const { t } = useTranslation()

  const status = look.status ?? 'ready'
  const compatible = look.supportedEngines.includes(VIMO_AVATAR_ENGINE)

  return (
    <span className="flex flex-wrap gap-1">
      <span className="rounded bg-muted px-1.5 py-0.5 font-display text-[10px] font-bold text-muted-foreground">
        {t(`avatars.types.${look.lookType}`)}
      </span>
      {look.preferredOrientation && (
        <span className="rounded bg-muted px-1.5 py-0.5 font-display text-[10px] font-bold text-muted-foreground">
          {t(`avatars.stock.orientacion.${look.preferredOrientation}`)}
        </span>
      )}
      {compatible && (
        <span className="rounded bg-saffron/15 px-1.5 py-0.5 font-display text-[10px] font-bold text-foreground">
          {t(`avatars.engines.${VIMO_AVATAR_ENGINE}`)}
        </span>
      )}
      {!compatible && status === 'ready' && (
        <span className="rounded bg-destructive/15 px-1.5 py-0.5 font-display text-[10px] font-bold text-foreground">
          {t('avatars.tarjeta.noCompatible')}
        </span>
      )}
    </span>
  )
}
