import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Label } from '@/modules/common/ui/label'
import { Input } from '@/modules/common/ui/input'
import { cn } from '@/modules/common/utilities/cn'
import { useDefaultSceneCount } from '@/modules/settings/hooks/useDefaultSceneCount'
import { AUTOMATIC_SCENE_COUNT, SCENE_COUNT_MAX } from '../constants'

// Preferencia «cantidad de escenas por defecto»: siembra el formulario de
// Crear, que la puede pisar por video. Se guarda al salir del campo.

export function SceneCountSection() {
  const { t } = useTranslation()
  const {
    isNative,
    defaultSceneCount,
    isLoading,
    saveDefaultSceneCount,
    saving,
  } = useDefaultSceneCount()

  const currentValue = defaultSceneCount ?? AUTOMATIC_SCENE_COUNT

  const commit = (rawValue: string) => {
    const parsed = Number.parseInt(rawValue, 10)
    const next = Number.isNaN(parsed) ? AUTOMATIC_SCENE_COUNT : parsed
    if (next === currentValue) return
    saveDefaultSceneCount(next)
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="space-y-4 rounded-2xl border-2 border-border bg-card p-6 shadow-card"
    >
      <div>
        <h2 className="font-display text-lg font-bold text-foreground">
          {t('settings.escenasTitulo')}
        </h2>
        <p className="font-body text-sm text-muted-foreground">
          {t('settings.escenasDescripcion')}
        </p>
      </div>

      {!isNative && (
        <p className="font-body text-sm text-saffron">
          {t('settings.soloEscritorio')}
        </p>
      )}

      <div
        className={cn(
          'max-w-xs space-y-1.5',
          !isNative && 'pointer-events-none opacity-60',
        )}
      >
        <Label htmlFor="settings-scene-count" className="font-display">
          {t('settings.escenasLabel')}
        </Label>
        <Input
          key={String(currentValue)}
          id="settings-scene-count"
          type="number"
          min={AUTOMATIC_SCENE_COUNT}
          max={SCENE_COUNT_MAX}
          defaultValue={currentValue}
          disabled={!isNative || isLoading || saving}
          onBlur={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
        <p className="font-body text-xs text-muted-foreground">
          {t('settings.escenasHint')}
        </p>
      </div>
    </motion.section>
  )
}
