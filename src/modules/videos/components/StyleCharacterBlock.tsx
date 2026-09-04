import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Film, HelpCircle, Sparkles, UserRound } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { CharacterPortrait } from '@/modules/common/components/CharacterPortrait'
import { Switch } from '@/modules/common/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/modules/common/ui/tooltip'
import { cn } from '@/modules/common/utilities/cn'
import { videosApi } from '@/modules/videos/api'
import { LabeledSelect } from '@/modules/videos/components/LabeledSelect'
import { STYLE_CHARACTER_ASK_OPTION } from '@/modules/videos/constants'
import { useCharacterCatalog } from '@/modules/videos/hooks/useCharacterCatalog'
import type {
  StyleCharacter,
  StyleCharacterMode,
} from '@pipeline/types/styles.ts'

interface StyleCharacterBlockProps {
  value: StyleCharacter
  disabled: boolean
  onChange: (value: StyleCharacter) => void
}

interface ModeOption {
  mode: StyleCharacterMode
  titleKey: string
  subtitleKey: string
  helpKey: string
  Icon: LucideIcon
}

const MODE_OPTIONS: readonly ModeOption[] = [
  {
    mode: 'own',
    titleKey: 'create.styleCharacter.own.title',
    subtitleKey: 'create.styleCharacter.own.subtitle',
    helpKey: 'create.styleCharacter.own.help',
    Icon: UserRound,
  },
  {
    mode: 'generic',
    titleKey: 'create.styleCharacter.generic.title',
    subtitleKey: 'create.styleCharacter.generic.subtitle',
    helpKey: 'create.styleCharacter.generic.help',
    Icon: Sparkles,
  },
  {
    mode: 'none',
    titleKey: 'create.styleCharacter.none.title',
    subtitleKey: 'create.styleCharacter.none.subtitle',
    helpKey: 'create.styleCharacter.none.help',
    Icon: Film,
  },
]

// Port de BloquePersonajeDeEstilo del origen (v1.19.0): la gema declara qué
// hace con su protagonista. Tres filas con un switch — la fila entera elige —
// y, bajo «Mi personaje», el personaje predeterminado de la biblioteca como
// select (no un segundo modal: CustomStyleModal es el único del flujo).
export function StyleCharacterBlock({
  value,
  disabled,
  onChange,
}: StyleCharacterBlockProps) {
  const { t } = useTranslation()
  const { characters, isLoading } = useCharacterCatalog(true)
  // El puntero sobrevive a pasar por «genérico» y volver: se guarda aparte
  // mientras el modo lo esconde (se actualiza solo desde los handlers).
  const [lastDefaultId, setLastDefaultId] = useState(value.defaultCharacterId)

  const fixed = value.defaultCharacterId
    ? characters.find((character) => character.id === value.defaultCharacterId)
    : undefined
  // El id apuntado ya no está en la biblioteca: se avisa y se pide otro.
  const fixedMissing = Boolean(value.defaultCharacterId) && !isLoading && !fixed

  const select = (mode: StyleCharacterMode) => (checked: boolean) => {
    // Apagar la activa cae al piso («sin personaje»); «sin personaje»
    // apagado se queda.
    if (!checked) {
      onChange({ mode: 'none' })
      return
    }
    if (mode === 'own' && lastDefaultId) {
      onChange({ mode, defaultCharacterId: lastDefaultId })
      return
    }
    onChange({ mode })
  }

  return (
    <div className="space-y-2 rounded-xl border-2 border-border bg-card p-4">
      <h3 className="font-display text-sm font-extrabold text-foreground">
        {t('create.styleCharacter.title')}
      </h3>

      {MODE_OPTIONS.map(({ mode, titleKey, subtitleKey, helpKey, Icon }) => {
        const active = value.mode === mode
        return (
          <div
            key={mode}
            className={cn(
              'rounded-xl border-2 px-4 py-3 transition-colors',
              active
                ? 'border-ocean/40 bg-ocean/10'
                : 'border-border bg-background hover:border-ocean/40',
            )}
          >
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <Icon
                  className={cn(
                    'mt-0.5 h-4 w-4 shrink-0',
                    active ? 'text-ocean' : 'text-muted-foreground',
                  )}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p
                      className={cn(
                        'font-display text-sm font-bold',
                        active ? 'text-ocean' : 'text-foreground',
                      )}
                    >
                      {t(titleKey)}
                    </p>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          tabIndex={0}
                          aria-label={t('create.styleCharacter.helpLabel', {
                            option: t(titleKey),
                          })}
                          className="cursor-help text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <HelpCircle className="h-3.5 w-3.5" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-sm leading-snug">
                        {t(helpKey)}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="font-body text-xs text-muted-foreground">
                    {t(subtitleKey)}
                  </p>
                </div>
              </div>
              <Switch
                checked={active}
                disabled={disabled}
                onCheckedChange={select(mode)}
                aria-label={t(titleKey)}
                className="shrink-0 data-[state=checked]:bg-ocean"
              />
            </label>

            {/* El personaje fijo cuelga de «Mi personaje»: solo tiene
                sentido cuando el estilo lleva TU personaje. */}
            {mode === 'own' && active && (
              <div className="mt-3 space-y-2 border-t border-ocean/20 pt-3">
                <p className="font-display text-xs font-bold text-foreground">
                  {t('create.styleCharacter.defaultTitle')}
                </p>
                <p className="font-body text-xs text-muted-foreground">
                  {t('create.styleCharacter.defaultHint')}
                </p>
                <div className="flex items-center gap-3">
                  {fixed && (
                    <CharacterPortrait
                      src={
                        fixed.previews[0]
                          ? videosApi.imageSource(fixed.previews[0].imagePath)
                          : null
                      }
                      doodleSize={20}
                      className="h-10 w-10 shrink-0 overflow-hidden rounded-full"
                    />
                  )}
                  <LabeledSelect
                    label={t('create.styleCharacter.defaultSelect')}
                    value={fixed?.id ?? STYLE_CHARACTER_ASK_OPTION}
                    options={[
                      {
                        id: STYLE_CHARACTER_ASK_OPTION,
                        label: t('create.styleCharacter.defaultAsk'),
                      },
                      ...characters.map((character) => ({
                        id: character.id,
                        label: character.name,
                      })),
                    ]}
                    disabled={disabled || isLoading}
                    onChange={(id) => {
                      if (id === STYLE_CHARACTER_ASK_OPTION) {
                        setLastDefaultId(undefined)
                        onChange({ mode: 'own' })
                        return
                      }
                      setLastDefaultId(id)
                      onChange({ mode: 'own', defaultCharacterId: id })
                    }}
                    className="flex-1"
                  />
                </div>
                {fixedMissing && (
                  <p className="font-body text-xs text-coral">
                    {t('create.styleCharacter.defaultMissing')}
                  </p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
