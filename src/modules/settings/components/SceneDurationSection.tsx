import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Label } from '@/modules/common/ui/label'
import { Switch } from '@/modules/common/ui/switch'
import { cn } from '@/modules/common/utilities/cn'
import { useSceneDurationDefaults } from '@/modules/settings/hooks/useSceneDurationDefaults'
import {
  SECONDS_PER_SCENE_DEFAULT,
  SECONDS_PER_SCENE_MAX,
  SECONDS_PER_SCENE_MIN,
  SECONDS_PER_SCENE_SHORTCUTS,
} from '../constants'

// Preferencia «cuánto dura cada escena»: siembra el ritmo de los videos de
// estilo propio y decide si el pipeline se detiene a preguntarlo. El slider
// guarda al soltar (no en cada píxel arrastrado); los atajos y el toggle, al
// click.

export function SceneDurationSection() {
  const { t } = useTranslation()
  const { isNative, sceneDuration, isLoading, saveSceneDuration, saving } =
    useSceneDurationDefaults()

  // El arrastre manda mientras dura; el resto sale de la preferencia guardada.
  const [draft, setDraft] = useState<number | null>(null)
  const stored = sceneDuration?.secondsPerScene ?? SECONDS_PER_SCENE_DEFAULT
  const seconds = draft ?? stored
  const confirmScenes = sceneDuration?.confirmScenes ?? true
  const disabled = !isNative || isLoading || saving

  const commitSeconds = (next: number) => {
    setDraft(next)
    if (next === stored) return
    saveSceneDuration({ secondsPerScene: next, confirmScenes })
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="space-y-4 rounded-2xl border-2 border-border bg-card p-6 shadow-card"
    >
      <div>
        <h2 className="font-display text-lg font-bold text-foreground">
          {t('settings.sceneDurationTitle')}
        </h2>
        <p className="font-body text-sm text-muted-foreground">
          {t('settings.sceneDurationTagline')}
        </p>
      </div>

      {!isNative && (
        <p className="font-body text-sm text-saffron">
          {t('settings.soloEscritorio')}
        </p>
      )}

      <div
        className={cn(
          'space-y-5',
          !isNative && 'pointer-events-none opacity-60',
        )}
      >
        <div>
          <p className="font-display text-4xl font-extrabold leading-none text-foreground">
            {seconds}
            <span className="ml-1 text-xl font-bold">
              {t('settings.sceneDurationUnit')}
            </span>
          </p>
          <p className="mt-2 font-body text-sm text-muted-foreground">
            {t('settings.sceneDurationValueCaption')}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="settings-scene-duration" className="sr-only">
            {t('settings.sceneDurationTitle')}
          </Label>
          <input
            id="settings-scene-duration"
            type="range"
            min={SECONDS_PER_SCENE_MIN}
            max={SECONDS_PER_SCENE_MAX}
            step={1}
            value={seconds}
            disabled={disabled}
            onChange={(event) => setDraft(Number(event.target.value))}
            onPointerUp={(event) =>
              commitSeconds(Number(event.currentTarget.value))
            }
            onKeyUp={(event) =>
              commitSeconds(Number(event.currentTarget.value))
            }
            className="w-full accent-saffron"
          />
          <div className="flex justify-between font-body text-xs font-semibold text-muted-foreground">
            <span>{t('settings.sceneDurationMinHint')}</span>
            <span>{t('settings.sceneDurationMaxHint')}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="font-body text-sm text-muted-foreground">
            {t('settings.sceneDurationShortcuts')}
          </span>
          {SECONDS_PER_SCENE_SHORTCUTS.map((shortcut) => (
            <button
              key={shortcut}
              type="button"
              disabled={disabled}
              onClick={() => commitSeconds(shortcut)}
              className={cn(
                'rounded-full border-2 px-4 py-1.5 font-display text-sm font-bold transition-colors',
                shortcut === seconds
                  ? 'border-saffron bg-saffron/15 text-foreground'
                  : 'border-border text-muted-foreground hover:border-saffron/40',
              )}
            >
              {t('settings.sceneDurationSecondsValue', { seconds: shortcut })}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-4 rounded-xl border-2 border-border p-4">
          <span className="min-w-0 flex-1">
            <span className="block font-display text-sm font-bold text-foreground">
              {t('settings.sceneDurationDontAskLabel')}
            </span>
            <span className="mt-0.5 block font-body text-xs text-muted-foreground">
              {t('settings.sceneDurationDontAskHint')}
            </span>
          </span>
          <Switch
            checked={!confirmScenes}
            disabled={disabled}
            onCheckedChange={(dontAsk) =>
              saveSceneDuration({
                secondsPerScene: seconds,
                confirmScenes: !dontAsk,
              })
            }
          />
        </label>
      </div>
    </motion.section>
  )
}
