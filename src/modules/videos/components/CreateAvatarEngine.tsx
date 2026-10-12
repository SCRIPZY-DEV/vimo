import { useId, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { cn } from '@/modules/common/utilities/cn'
import { formatUsd } from '@/modules/common/utilities/formatUsd'
import {
  AVATAR_ENGINE_DESCRIPTION_KEYS,
  AVATAR_ENGINE_LABEL_KEYS,
} from '@/modules/videos/constants'
import {
  avatarCostEstimate,
  avatarRatePerMinute,
} from '@/modules/videos/utilities/avatarCostEstimate'
import {
  AVATAR_ENGINE_CHOICES,
  avatarEngineAvailable,
  avatarEngineFor,
} from '@pipeline/types/avatar.ts'
import type { SelectedAvatar } from '@/modules/videos/types/create'
import type { AvatarEngine } from '@pipeline/types/avatar.ts'

interface CreateAvatarEngineProps {
  // La elección del formulario: su look decide qué motores se ofrecen y a qué
  // tarifa.
  avatar: SelectedAvatar
  // El motor que prefiere la persona (CreateFormValue.avatarEngine).
  preferred: AvatarEngine
  // Segundos de avatar del video: el costo de cada opción.
  seconds: number
  disabled: boolean
  onSelect(engine: AvatarEngine): void
}

// El grupo «Motor» de la tarjeta del avatar en Crear (entrega 2e, §21.3,
// pedido del dueño del 2026-10-12): Avatar V, IV y III en ese orden, cada uno
// con su nombre, la descripción que dictó el dueño y el costo de este video
// con su tarifa por minuto. Uno que el look elegido no admite (o sin tarifa
// para su tipo) queda apagado y dice por qué: se atenúan su nombre y su
// descripción, no el motivo (con el formulario deshabilitado, la opción
// entera). El marcado es el motor con el que sale el look (`avatarEngineFor`:
// el preferido si el look lo admite; si no, el de reemplazo), derivado en el
// render: cambiar de look nunca toca la preferencia. Grupo de radios hecho a
// mano (el repo no tiene el RadioGroup de Radix) con el patrón de WAI-ARIA:
// una sola parada de Tab, la marcada, y las flechas, Inicio y Fin mueven el
// foco y la elección saltando las apagadas (con Alt, Ctrl o Meta no: la tecla
// es de otro). Va fuera de la región de looks. Presentacional: elegir otro
// motor llama a `onSelect` (también tocar el reemplazo marcado, que pasa a ser
// la preferencia); el que ya es el preferido no cambia nada.
export function CreateAvatarEngine({
  avatar,
  preferred,
  seconds,
  disabled,
  onSelect,
}: CreateAvatarEngineProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'es'
  const idPrefix = useId()
  // El grupo, para llevar el foco a la opción que eligen las flechas.
  const groupRef = useRef<HTMLDivElement>(null)

  const checked = avatarEngineFor(preferred, avatar)
  const choosable = disabled
    ? []
    : AVATAR_ENGINE_CHOICES.filter((engine) =>
        avatarEngineAvailable(engine, avatar),
      )

  const choose = (engine: AvatarEngine) => {
    if (engine !== preferred) onSelect(engine)
  }

  // Las flechas, Inicio y Fin eligen y llevan el foco a la vez (el patrón de
  // radios); una tecla que no mueve nada sigue su camino. Con Alt, Ctrl o Meta
  // la tecla es de otro (el historial, el sistema): no se toca.
  const moveWithKey = (
    event: KeyboardEvent<HTMLButtonElement>,
    from: AvatarEngine,
  ) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return

    const target = engineForKey(event.key, from, choosable)
    if (!target) return

    event.preventDefault()
    choose(target)
    groupRef.current
      ?.querySelector<HTMLButtonElement>(`[data-engine="${target}"]`)
      ?.focus()
  }

  // Lo que dice una opción debajo de su descripción: el costo de este video
  // con ese motor y su tarifa por minuto o, si no se puede elegir, por qué.
  const detailOf = (engine: AvatarEngine) => {
    const rate = avatarRatePerMinute(avatar.lookType, engine)
    const line = avatarCostEstimate(avatar.lookType, seconds, engine)
    if (!avatarEngineAvailable(engine, avatar) || rate === null || !line) {
      return t('create.avatar.engineUnavailable', {
        engine: t(AVATAR_ENGINE_LABEL_KEYS[engine]),
      })
    }

    return (
      <>
        <span className="font-display text-sm font-bold tabular-nums text-foreground">
          {t('create.avatar.cost', {
            amount: formatUsd(line.estimated, language),
          })}
        </span>{' '}
        {t('create.avatar.pricePerMinute', {
          price: formatUsd(rate, language),
        })}
      </>
    )
  }

  return (
    <div className="space-y-2">
      <p className="font-display text-sm font-semibold text-foreground">
        {t('create.avatar.engineTitle')}
      </p>
      <div
        ref={groupRef}
        role="radiogroup"
        aria-label={t('create.avatar.engineGroupAria')}
        className="grid gap-2 sm:grid-cols-3"
      >
        {AVATAR_ENGINE_CHOICES.map((engine) => {
          const available = avatarEngineAvailable(engine, avatar)
          const isChecked = engine === checked
          // Con el formulario entero deshabilitado se atenúa toda la opción,
          // como los demás controles; una que el look no admite atenúa solo su
          // nombre y su descripción, y el motivo se lee a pleno contraste.
          const dimmed = !available && !disabled
          // Sobre el fondo de la marcada el gris de siempre no llega a 4,5:1.
          const secondaryTextClass = isChecked
            ? 'text-foreground/80'
            : 'text-muted-foreground'
          const nameId = `${idPrefix}-${engine}-name`
          const descriptionId = `${idPrefix}-${engine}-description`
          const detailId = `${idPrefix}-${engine}-detail`

          return (
            <button
              key={engine}
              type="button"
              role="radio"
              data-engine={engine}
              aria-checked={isChecked}
              aria-labelledby={nameId}
              aria-describedby={`${descriptionId} ${detailId}`}
              tabIndex={isChecked ? 0 : -1}
              disabled={disabled || !available}
              onClick={() => choose(engine)}
              onKeyDown={(event) => moveWithKey(event, engine)}
              className={cn(
                'flex h-full flex-col gap-1 rounded-xl border-2 px-3 py-2.5 text-left transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amethyst focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed',
                isChecked
                  ? 'border-amethyst bg-amethyst/10 shadow-[0_0_0_2px_hsl(var(--amethyst)/0.35)]'
                  : 'border-border bg-card enabled:hover:border-amethyst/60',
                disabled && 'opacity-60',
              )}
            >
              <span
                className={cn(
                  'flex items-start justify-between gap-2',
                  dimmed && 'opacity-60',
                )}
              >
                <span
                  id={nameId}
                  className="font-display text-sm font-bold text-foreground"
                >
                  {t(AVATAR_ENGINE_LABEL_KEYS[engine])}
                </span>
                {isChecked && (
                  <span
                    aria-hidden
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amethyst text-white"
                  >
                    <Check strokeWidth={3} className="h-2.5 w-2.5" />
                  </span>
                )}
              </span>
              <span
                id={descriptionId}
                className={cn(
                  'font-body text-xs leading-snug',
                  secondaryTextClass,
                  dimmed && 'opacity-60',
                )}
              >
                {t(AVATAR_ENGINE_DESCRIPTION_KEYS[engine])}
              </span>
              <span
                id={detailId}
                className={cn(
                  'mt-auto pt-1 font-body text-xs',
                  secondaryTextClass,
                )}
              >
                {detailOf(engine)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// La opción a la que lleva una tecla desde `from`, entre las que se pueden
// elegir (en el orden del grupo): las flechas, a la anterior o la siguiente
// en ronda; Inicio y Fin, a los extremos. null si la tecla no mueve nada.
function engineForKey(
  key: string,
  from: AvatarEngine,
  choosable: readonly AvatarEngine[],
): AvatarEngine | null {
  const index = choosable.indexOf(from)
  if (index === -1) return null

  const targetAt = targetIndex(key, index, choosable.length)
  if (targetAt === null) return null

  const target = choosable[targetAt]
  if (target === from) return null

  return target
}

// El índice al que lleva cada tecla, o null si no es una del grupo.
function targetIndex(key: string, index: number, count: number): number | null {
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowUp':
      return (index - 1 + count) % count
    case 'ArrowRight':
    case 'ArrowDown':
      return (index + 1) % count
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}
