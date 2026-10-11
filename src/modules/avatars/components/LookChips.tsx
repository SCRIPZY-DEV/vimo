import { useTranslation } from 'react-i18next'
import {
  AVATAR_LOOK_FORMAT_LABEL_KEYS,
  VIMO_AVATAR_ENGINE,
} from '@/modules/avatars/constants'
import type { DisplayedLook } from '@/modules/avatars/types/look'
import { lookFormatOf } from '@pipeline/avatar/look-orientation.ts'

interface LookChipsProps {
  look: DisplayedLook
}

// Los chips de un look, con la misma regla en su ficha y en su reproductor: el
// tipo, el formato (`lookFormatOf`: 16:9, 9:16, 1:1, 4:5 o 5:4, por la
// orientación que informa HeyGen o, sin ella, por las medidas de la imagen;
// sin ninguna de las dos, sin chip) y el motor que Vimo usa («Avatar III») o
// «No compatible con Vimo». El formato se lee «Formato 16:9»: el texto visible
// queda fuera del lector de pantalla y su etiqueta va aparte. Mientras se
// genera todavía no se saben sus motores: «No compatible» solo se afirma de un
// look listo (los del stock público no traen `status`: están listos). Son
// `span`: también van dentro de botones. Presentacional.
export function LookChips({ look }: LookChipsProps) {
  const { t } = useTranslation()

  const status = look.status ?? 'ready'
  const compatible = look.supportedEngines.includes(VIMO_AVATAR_ENGINE)
  const format = lookFormatOf(look)
  const formatLabel = format ? t(AVATAR_LOOK_FORMAT_LABEL_KEYS[format]) : null

  return (
    <span className="flex flex-wrap gap-1">
      <span className="rounded bg-muted px-1.5 py-0.5 font-display text-[10px] font-bold text-muted-foreground">
        {t(`avatars.types.${look.lookType}`)}
      </span>
      {formatLabel && (
        <span className="rounded bg-muted px-1.5 py-0.5 font-display text-[10px] font-bold tabular-nums text-muted-foreground">
          <span className="sr-only">
            {t('avatars.formato.aria', { format: formatLabel })}
          </span>
          <span aria-hidden>{formatLabel}</span>
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
