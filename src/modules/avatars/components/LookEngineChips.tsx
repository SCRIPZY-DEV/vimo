import { useTranslation } from 'react-i18next'
import { cn } from '@/modules/common/utilities/cn'
import { ENGINE_CHIP_STYLES } from '@/modules/avatars/constants'
import type { EngineChipSize } from '@/modules/avatars/constants'
import { lookEngines } from '@/modules/avatars/utilities/lookUsability'
import type { AvatarLookSummary } from '@pipeline/types/avatar.ts'

interface LookEngineChipsProps {
  // El look del que se muestran los motores. Sin él (un avatar que todavía no
  // tiene look principal) no hay motores que mostrar.
  look: Pick<AvatarLookSummary, 'supportedEngines' | 'lookType'> | undefined
  // Mientras un look se genera o un avatar entrena todavía no se saben sus
  // motores: «No compatible con Vimo» solo se afirma de lo que ya está listo.
  ready: boolean
  size?: EngineChipSize
}

// Las pastillas de motor de un look, con la misma regla en su ficha, su
// reproductor, la tarjeta del avatar y el encabezado de su panel (entrega 2e):
// una pastilla por cada motor con el que Vimo puede generar con él, en el orden
// V, IV, III (`lookEngines`), dentro de un grupo cuyo nombre las lista; o «No
// compatible con Vimo» si no admite ninguno y está listo. El lector de pantalla
// lee solo el nombre del grupo: las pastillas van con `aria-hidden` (como el
// formato en `LookChips`), si no cada motor se diría dos veces, en el nombre y
// en el contenido. Presentacional.
export function LookEngineChips({
  look,
  ready,
  size = 'small',
}: LookEngineChipsProps) {
  const { t } = useTranslation()

  const styles = ENGINE_CHIP_STYLES[size]
  const engines = look ? lookEngines(look) : []

  if (engines.length === 0) {
    if (!ready) return null

    return (
      <span
        className={cn(
          'rounded bg-destructive/15 py-0.5 font-display font-bold text-foreground',
          styles.chip,
        )}
      >
        {t('avatars.tarjeta.noCompatible')}
      </span>
    )
  }

  const names = engines.map((engine) => t(`avatars.engines.${engine}`))

  return (
    <span
      role="group"
      aria-label={t('avatars.tarjeta.motoresAria', {
        engines: names.join(', '),
      })}
      className={cn('flex flex-wrap', styles.group)}
    >
      {engines.map((engine, index) => (
        <span
          key={engine}
          aria-hidden
          className={cn(
            'rounded bg-saffron/15 py-0.5 font-display font-bold text-foreground',
            styles.chip,
          )}
        >
          {names[index]}
        </span>
      ))}
    </span>
  )
}
