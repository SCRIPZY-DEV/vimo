import { useTranslation } from 'react-i18next'
import { Film, HelpCircle, Sparkles, UserRound } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from 'react'
import { Switch } from '@/modules/common/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/modules/common/ui/tooltip'
import { cn } from '@/modules/common/utilities/cn'
import { videosApi } from '@/modules/videos/api'
import { useCharacterCatalog } from '@/modules/videos/hooks/useCharacterCatalog'
import { characterPortraitPath } from '@/modules/videos/utilities/findStylePreview'
import { toSelectedCharacter } from '@/modules/videos/utilities/toSelectedCharacter'
import type { SelectedCharacter } from '@/modules/videos/types/create'
import type { CharacterSummary } from '@pipeline/types/characters.ts'
import type {
  StyleCharacter,
  StyleCharacterMode,
} from '@pipeline/types/styles.ts'

// De quién es la gema: la propia (Mi estilo) o un estilo del catálogo.
type StyleCharacterBlockVariant = 'custom' | 'catalog'

interface StyleCharacterBlockProps {
  value: StyleCharacter
  disabled: boolean
  // Id de ESTA gema: la carita del fijado prefiere su preview.
  styleId: string
  // Los modos que ofrece la gema; ausente = los tres. Un estilo del catálogo
  // trae los suyos (plan E2 §5.1) y solo esos se muestran.
  allowedModes?: StyleCharacterMode[]
  // Ausente = Mi estilo («¿Tu estilo lleva personaje?»); el catálogo tiene su
  // título y una línea de ayuda. Las filas de cada modo son las mismas.
  variant?: StyleCharacterBlockVariant
  onChange: (value: StyleCharacter) => void
  // Abre el selector de personajes para fijar uno, con el ya elegido
  // preseleccionado (null = ninguno). Lo maneja el modal, que es quien
  // esconde su ventana mientras el selector está abierto.
  onPickCharacter: (current: SelectedCharacter | null) => void
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

// Tres zonas de la fila tienen acción propia y NO son «toggle de la fila»: el
// switch (dejarlo pasar duplicaría el toggle), la sub-fila del predeterminado
// y el signo de pregunta (en una pantalla táctil la ayuda se lee tocándolo).
function hitsOwnControl(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.closest("button[role='switch']") !== null ||
    target.closest('[data-style-character-default]') !== null ||
    target.closest('[data-style-character-help]') !== null
  )
}

// ¿Tu estilo lleva personaje? (port de BloquePersonajeDeEstilo del origen):
// tres opciones excluyentes, cada una con su switch turquesa, y SIEMPRE
// exactamente una encendida — es un modo del estilo, no tres ajustes
// sueltos. Encender otra mueve la elección; apagar la activa cae a «Sin
// personaje», que es el piso. La FILA ENTERA es el switch, en las dos
// direcciones. Un estilo del catálogo muestra solo los modos que permite; si
// no permite «Sin personaje», no hay piso y se cambia encendiendo otra. Es
// presentacional: qué recordar al volver a «Mi personaje» lo decide el modal,
// dueño del borrador.
export function StyleCharacterBlock({
  value,
  disabled,
  styleId,
  allowedModes,
  variant = 'custom',
  onChange,
  onPickCharacter,
}: StyleCharacterBlockProps) {
  const { t } = useTranslation()
  const { characters, isLoading } = useCharacterCatalog(true)
  const options = allowedModes
    ? MODE_OPTIONS.filter((option) => allowedModes.includes(option.mode))
    : MODE_OPTIONS
  const hasFloor = options.some((option) => option.mode === 'none')

  const fixed = value.defaultCharacterId
    ? characters.find((character) => character.id === value.defaultCharacterId)
    : undefined
  // El id apuntado ya no está en la biblioteca: se avisa y se pide otro. Con
  // la biblioteca vacía no se afirma nada (puede ser que no haya cargado).
  const fixedMissing =
    Boolean(value.defaultCharacterId) &&
    !isLoading &&
    characters.length > 0 &&
    !fixed

  const toSelected = (character: CharacterSummary) => {
    return toSelectedCharacter(character, styleId)
  }

  // Encender o apagar una opción: la misma acción venga del switch, de la
  // fila o del teclado.
  const toggle = (mode: StyleCharacterMode, checked: boolean) => {
    if (checked) {
      onChange({ mode })
      return
    }
    // Solo se apaga la activa. «Sin personaje» ya ES el piso: apagarla no
    // tiene a dónde ir; y sin esa opción en el estilo, la activa queda
    // encendida hasta que se encienda otra.
    if (value.mode !== mode || mode === 'none' || !hasFloor) return
    onChange({ mode: 'none' })
  }

  const rowClick = (mode: StyleCharacterMode) => {
    return (event: ReactMouseEvent<HTMLDivElement>) => {
      // SOLO clicks reales: el BubbleInput de Radix (el input oculto que
      // aparece cuando un switch queda dentro de un <form>) re-despacha un
      // click burbujeante en cada cambio, y tomarlo como click de la persona
      // re-togglea en loop infinito.
      if (disabled || !event.nativeEvent.isTrusted) return
      if (hitsOwnControl(event.target)) return
      toggle(mode, value.mode !== mode)
    }
  }

  const rowKeyDown = (mode: StyleCharacterMode) => {
    return (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      // Que el Enter/Espacio del switch, la sub-fila o la ayuda no dispare
      // también el toggle de la fila.
      if (event.target !== event.currentTarget) return
      event.preventDefault()
      if (!disabled) toggle(mode, value.mode !== mode)
    }
  }

  return (
    <div className="space-y-2 rounded-2xl border-2 border-border bg-card p-4">
      <div>
        <h3 className="font-display text-sm font-extrabold text-foreground">
          {variant === 'catalog'
            ? t('create.catalog.characterTitle')
            : t('create.styleCharacter.title')}
        </h3>
        {variant === 'catalog' && (
          <p className="mt-0.5 font-body text-xs text-muted-foreground">
            {t('create.catalog.characterHint')}
          </p>
        )}
      </div>

      {options.map(({ mode, titleKey, subtitleKey, helpKey, Icon }) => {
        const active = value.mode === mode
        return (
          <div
            key={mode}
            role="button"
            tabIndex={disabled ? undefined : 0}
            onClick={rowClick(mode)}
            onKeyDown={rowKeyDown(mode)}
            className={cn(
              'rounded-xl border-2 px-4 py-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ocean/50',
              !disabled && 'cursor-pointer',
              active
                ? 'border-ocean/40 bg-ocean/10 hover:bg-ocean/15'
                : 'border-border bg-background hover:border-ocean/40 hover:bg-ocean/5',
            )}
          >
            <div className="flex items-center justify-between gap-4">
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
                          data-style-character-help="true"
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
                onCheckedChange={(checked) => toggle(mode, checked)}
                aria-label={t(titleKey)}
                className="shrink-0 data-[state=checked]:bg-ocean"
              />
            </div>

            {/* El personaje predeterminado cuelga de «Mi personaje»: es una
                decisión de segundo nivel (ya elegiste que el estilo lleva TU
                personaje; acá decidís si es siempre el mismo o se pregunta
                en cada video). Se guarda como PUNTERO a la biblioteca. */}
            {mode === 'own' && active && (
              <div
                data-style-character-default="true"
                className="mt-3 border-t border-ocean/25 pt-3"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-display text-xs font-bold text-foreground">
                      {t('create.styleCharacter.defaultTitle')}
                    </p>
                    <p className="font-body text-xs text-muted-foreground">
                      {value.defaultCharacterId
                        ? t('create.styleCharacter.defaultHintFixed')
                        : t('create.styleCharacter.defaultHintAsk')}
                    </p>
                  </div>
                  <Switch
                    checked={Boolean(value.defaultCharacterId)}
                    disabled={disabled}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        onPickCharacter(fixed ? toSelected(fixed) : null)
                        return
                      }
                      onChange({ mode: 'own' })
                    }}
                    aria-label={t('create.styleCharacter.defaultSwitchLabel')}
                    className="shrink-0 data-[state=checked]:bg-ocean"
                  />
                </div>

                {fixed && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onPickCharacter(toSelected(fixed))}
                    className="mt-2 flex w-full items-center gap-3 rounded-lg border border-ocean/30 bg-background px-3 py-2 text-left transition-colors hover:bg-muted"
                  >
                    <FixedPortrait character={fixed} styleId={styleId} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-sm font-bold text-foreground">
                        {fixed.name}
                      </span>
                      <span className="block font-body text-xs text-muted-foreground">
                        {t('create.styleCharacter.defaultChange')}
                      </span>
                    </span>
                  </button>
                )}

                {fixedMissing && (
                  <p className="mt-2 font-body text-xs text-destructive">
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

interface FixedPortraitProps {
  character: CharacterSummary
  styleId: string
}

// La carita del fijado: su foto, el preview de ESTA gema o, si no lo tiene,
// el primero que haya. El ícono queda para un personaje sin imagen alguna.
function FixedPortrait({ character, styleId }: FixedPortraitProps) {
  const portrait = characterPortraitPath(character, styleId)

  if (!portrait)
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ocean/15">
        <UserRound className="h-4 w-4 text-ocean" />
      </span>
    )

  return (
    <img
      src={videosApi.imageSource(portrait)}
      alt=""
      className="h-9 w-9 shrink-0 rounded-full object-cover"
    />
  )
}
